/**
 * The booking use case — ADR-0004's loop, ADR-0018's locks, and the outcome union the edge maps
 * to a status code.
 *
 * ── THE INVARIANT, IN ONE SENTENCE ────────────────────────────────────────────────────────────
 *
 * NOTHING HERE READS AVAILABILITY. There is no query on this path that could answer "is that bay
 * free", so there is nothing to check and then act on: the `INSERT` is what adjudicates, and this
 * module's whole job is to attempt one, classify what came back, and try the next candidate. That
 * is `CLAUDE.md` §2.1 as a running program rather than a rule in a document.
 *
 * ── WHY THERE IS A LOOP AT ALL (E-02-1) ───────────────────────────────────────────────────────
 *
 * Which constraint PostgreSQL names when BOTH are violated is decided by index creation order —
 * measured, and `0003_appointment.sql` creates `no_bay_overlap` first. So without a loop the
 * refusal names whichever index was created first, which is systematically the ABUNDANT resource
 * rather than the scarce one: AC-4's fixture has 24 free bays and one taken technician, and a
 * loop-less implementation tells the client the bay was the problem. That breaks AC-11 and
 * poisons `booking_conflicts_total{resource}` at slice 09, so it is client- and metric-visible
 * rather than a fixture artefact. With pruning, the constraint reported at REFUSAL is the one
 * whose list emptied rather than the one whose index was checked first.
 *
 * PRUNING IS PER RESOURCE VALUE, NOT PER CLASS (T-02-1). A `no_bay_overlap` drops THAT BAY and
 * leaves the others; emptying the whole list on one failure refuses while capacity plainly
 * remains. ADR-0009's "the whole resource is dropped, not merely the pair" means the whole row or
 * column of the candidate cross-product, which is what makes the loop terminate in
 * |bays| + |technicians| - 1 attempts rather than |bays| x |technicians|.
 *
 * THE ORDER IS A SEEDED SHUFFLE, drawn once per request and injected (ADR-0009's Order-C,
 * ADR-0021). `src/domain/candidates.ts` owns the permutation and the prune; this module owns only
 * WHEN to prune and what a refusal means. Slice 02's deterministic order was F-02-7's stand-in and
 * it is gone: under it every concurrent request tried the same bay first, which is the Order-A
 * degeneracy ADR-0004 named and ADR-0009 rejected.
 *
 * ── EACH ATTEMPT IS ITS OWN TRANSACTION, AND THE LOOP IS NOT WRAPPED IN ONE ───────────────────
 *
 * Measured at step 2: a second attempt after a `23P01` INSIDE an explicit transaction fails with
 * `25P02 in_failed_sql_transaction` rather than retrying, because the violation aborted the
 * enclosing transaction. ADR-0018's locks are `pg_advisory_xact_lock`, so an attempt must have a
 * transaction to scope them to — and it must be exactly one attempt wide, or the two requirements
 * contradict. That is why `db.transaction()` appears inside the loop body and nowhere outside it.
 */
import { deriveInterval } from './deriveInterval.js';
import { nextCandidate, orderCandidates, prune } from '../domain/candidates.js';
import type { CandidateOrder } from '../domain/candidates.js';
import type { Db } from '../persistence/db.js';
import type { Logger } from '../platform/logger.js';
import {
  insertAppointment,
  lockResources,
} from '../persistence/appointmentRepository.js';
import type { AppointmentRow } from '../persistence/appointmentRepository.js';
import { candidateResources } from '../persistence/candidateRepository.js';
import {
  classifyOwnership,
  findDealership,
  findServiceType,
} from '../persistence/referenceRepository.js';
import { classify, VEHICLE_OWNERSHIP_CONSTRAINT } from '../persistence/pgError.js';
import type { ContendedResource } from '../persistence/pgError.js';
import type { OpeningHoursVerdict } from '../domain/openingHours.js';

/**
 * The ONE shape the `201` and the `200` both return, defined here because two roles guessed at it
 * independently at step 2 (T-02-3, I-02-7) and measurement 8 makes guessing unsafe: a
 * `Type.Literal` in a response schema SUBSTITUTES the constant for whatever the handler computed,
 * so a partial assertion over a substituted field cannot fail.
 */
export interface AppointmentView {
  readonly id: string;
  readonly dealershipId: string;
  readonly customerId: string;
  readonly vehicleId: string;
  readonly serviceTypeId: string;
  /** AC-1: the ALLOCATED technician — read back from the row, never echoed from the request. */
  readonly technicianId: string;
  /** AC-1: the ALLOCATED bay. */
  readonly bayId: string;
  /** ISO-8601 UTC, DA-02-2. */
  readonly startsAt: string;
  /** Derived from the service type's duration; never client-supplied (AC-6). */
  readonly endsAt: string;
  /**
   * Two members although this slice can only produce `confirmed`: slice 05 must render
   * `cancelled` at the same URL (§8.6 makes cancellation a sub-resource precisely so the
   * appointment stays readable), and a single `Type.Literal('confirmed')` in the response schema
   * would silently substitute the constant and make slice 05's own test unable to fail.
   */
  readonly status: 'confirmed' | 'cancelled';
}

/**
 * DA-02-2: ISO-8601 UTC, not the dealership's local zone. Rendering locally would put zone
 * reasoning in a layer QS-12 forbids it in, and ADR-0001's "convert instant -> local, never the
 * reverse" rule exists to keep that in exactly one module.
 */
export function toAppointmentView(row: AppointmentRow): AppointmentView {
  return {
    id: row.id,
    dealershipId: row.dealershipId,
    customerId: row.customerId,
    vehicleId: row.vehicleId,
    serviceTypeId: row.serviceTypeId,
    technicianId: row.technicianId,
    bayId: row.bayId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
  };
}

export interface BookCommand {
  readonly dealershipId: string;
  readonly customerId: string;
  readonly vehicleId: string;
  readonly serviceTypeId: string;
  /** Epoch milliseconds. There is NO end: `appointmentInterval` takes a start and a duration. */
  readonly startsAtMillis: number;
}

export type BookOutcome =
  | { readonly kind: 'confirmed'; readonly appointment: AppointmentView }
  | { readonly kind: 'malformed-instant' }
  | { readonly kind: 'outside-opening-hours'; readonly verdict: OpeningHoursVerdict }
  | {
      readonly kind: 'unknown-reference';
      readonly reference: 'dealership' | 'service-type' | 'customer' | 'vehicle';
    }
  | { readonly kind: 'vehicle-not-owned' }
  | {
      readonly kind: 'no-capacity';
      /** ADR-0016: minted by `classify` from `err.constraint`, never chosen. */
      readonly resource: ContendedResource;
      readonly attempts: number;
      /**
       * WHICH refusal this is — ADR-0020. `exhausted`: a candidate list emptied, so nothing was
       * left untried. `capped`: ADR-0009's attempt cap stopped the loop with candidates
       * remaining. Both render identically at the edge (AC-4) and §8.6 gains no row for the
       * second; the difference is for the operator, on `booking.refused`.
       *
       * `exhausted` WINS A TIE. When one attempt both empties a list and reaches the cap, the
       * stronger statement is true.
       */
      readonly exit: 'exhausted' | 'capped';
    }
  /** `40P01` under ADR-0018's locks — a write path skipped them. T-02-9. */
  | { readonly kind: 'no-verdict' }
  | { readonly kind: 'reference-data-invalid'; readonly detail: string };

export interface BookDeps {
  /**
   * Injected rather than called, so a test can fix the appointment id — and so ADR-0009's
   * per-request seed can attach here at slice 04 without changing this signature. DA-02-1: the
   * id is minted by the application, and a retried attempt REUSES it, because the failed attempt
   * inserted nothing.
   */
  readonly newId: () => string;
  /**
   * ADR-0009's per-request seed, INJECTED and never global — the difference between Order-C and
   * Order-B, and the only reason ordering can stay a pure function inside `src/domain`.
   *
   * `main.ts` binds it to the platform CSPRNG, or to `BOOKING_SEED` when that is set (ADR-0021).
   * Drawn ONCE per booking, so every attempt of one request walks one permutation.
   */
  readonly seed: () => number;
  /**
   * ADR-0009's attempt cap, from `platform/config.ts`. A LATENCY guard, not a termination guard:
   * Bound-2 already bounds the loop at `|bays| + |technicians|`, which is the loop's header, and
   * the cap is a policy number that stops a request spending forty round trips before refusing.
   *
   * It is tested INSIDE the `23P01` arm (ADR-0020), never as the loop's bound — so no refusal
   * exit is reachable without a `ContendedResource` a classification just minted, and the two
   * numbers stay two numbers doing two jobs.
   */
  readonly attemptCap: number;
  /**
   * I-02-6 — the observer AC-3, AC-4, QS-1 and QS-2 need and the design did not have.
   *
   * All four require "the violated constraint reported by PostgreSQL is named `no_bay_overlap`",
   * and an outside-in test can observe exactly three things: the HTTP response, the database, and
   * the process's stdout. The constraint name is in neither of the first two — ADR-0016 Option D
   * deliberately declines to carry it on `BookOutcome`, and the problem schema has no member for
   * it — so it goes on stdout, as one structured line per `23P01`, observed the way an operator
   * would observe it rather than through a seam built for a test. Slice 09's QS-13 span carries
   * `db.constraint` and supersedes this as the primary observer; the line stays as the cheap one.
   */
  readonly logger: Logger;
}

/** The `pino` line the concurrency suite reads. Renaming it is a behaviour change. */
const CONFLICT_EVENT = 'booking.conflict';
/**
 * The refusal line — one per refused booking, at BOTH exits.
 *
 * AC-4 requires the cap to be "visible in telemetry rather than silent", and an outside-in test
 * may read exactly three things: the response, the database and stdout (I-02-6). The response
 * carries no `exit` and no `attempts` by design, and a refusal writes no row — so this line is
 * where the two exits become distinguishable at all, until slice 09's
 * `booking_conflicts_total{outcome}`. The `seed` on it is what makes a reported failure
 * re-runnable through `BOOKING_SEED` (ADR-0021): a label that cannot be fed back in is not one.
 */
const REFUSED_EVENT = 'booking.refused';
const DEADLOCK_EVENT = 'booking.deadlock';
const REFERENCE_DATA_EVENT = 'booking.reference-data-invalid';

export async function bookAppointment(
  db: Db,
  deps: BookDeps,
  command: BookCommand,
): Promise<BookOutcome> {
  // 1-2. Reference data. Both are ordinary `422`s and neither is a capacity question, so they are
  // answered before any candidate exists — AC-9's `dealership` and `service-type` arms.
  const dealership = await findDealership(db, command.dealershipId);
  if (dealership === null) return { kind: 'unknown-reference', reference: 'dealership' };

  const serviceType = await findServiceType(db, command.serviceTypeId);
  if (serviceType === null) return { kind: 'unknown-reference', reference: 'service-type' };

  // 3. The pure derivation — arc42 §6.2 steps 3 and 4, in `deriveInterval.ts`.
  const derivation = deriveInterval(command.startsAtMillis, serviceType, dealership);
  switch (derivation.kind) {
    case 'unparsable-instant':
      return { kind: 'malformed-instant' };
    case 'invalid-duration':
      // A service type whose `duration_minutes` did not survive `serviceDuration` is broken
      // reference data, not a client error: the column carries `CHECK (duration_minutes > 0)` and
      // the client never sends a duration.
      deps.logger.error(
        { event: REFERENCE_DATA_EVENT, serviceTypeId: command.serviceTypeId },
        'service type duration is not a positive integer',
      );
      return { kind: 'reference-data-invalid', detail: 'service-type-duration' };
    case 'reference-data-invalid':
      deps.logger.error(
        {
          event: REFERENCE_DATA_EVENT,
          dealershipId: command.dealershipId,
          verdict: derivation.verdict.kind,
        },
        'dealership reference data cannot be read',
      );
      return { kind: 'reference-data-invalid', detail: derivation.verdict.kind };
    case 'outside-opening-hours':
      return { kind: 'outside-opening-hours', verdict: derivation.verdict };
    case 'derived':
      break;
  }

  // 4. Candidates — REFERENCE DATA ONLY. `candidateResources` does not read `appointment`.
  const candidates = await candidateResources(db, command.dealershipId, command.serviceTypeId);

  // 5. The order — ADR-0009's Order-C, from one seed drawn for this request.
  //
  // THE TWO EMPTY-CANDIDATE ANSWERS LIVE IN THIS `null` BRANCH RATHER THAN IN FRONT OF IT
  // (I-04-4). Guards ahead of the call would make this branch unreachable: `tsc` would still
  // demand it, no test could cover it, and Stryker would collect a free survivor. Folded in,
  // every branch on this path is reachable and the split is the honest one — the domain owns
  // "is there a candidate at all", this module owns "whose fault is it that there is not".
  //
  // They are DIFFERENT FAILURES and collapsing them was a design defect ruled at slice 02 step 2
  // (I-02-8 / T-02-7). A dealership with no bays cannot perform ANY service — that is a
  // mis-seeded dealership and the system's fault, so `500`. "No technician here is qualified for
  // this service type" is an entirely ordinary state of an ordinary dealership: the request names
  // a (dealership, service-type) pair and that pair does not resolve, which is the only sense in
  // which this API knows service types at all. Neither is a `409`: there is no verdict here to
  // build one from (ADR-0016).
  const seed = deps.seed();
  const initialOrder = orderCandidates(candidates.bays, candidates.technicians, seed);
  if (initialOrder === null) {
    if (candidates.bays.length === 0) {
      deps.logger.error(
        { event: REFERENCE_DATA_EVENT, dealershipId: command.dealershipId },
        'dealership has no service bays',
      );
      return { kind: 'reference-data-invalid', detail: 'no-service-bays' };
    }
    return { kind: 'unknown-reference', reference: 'service-type' };
  }

  const appointmentId = deps.newId();
  const startsAt = new Date(derivation.occupancyStartsAt);
  const endsAt = new Date(derivation.occupancyEndsAt);
  let order: CandidateOrder = initialOrder;

  /**
   * BOTH REFUSAL EXITS, IN ONE PLACE. Only the `exit` differs, and both are called from inside
   * the `23P01` arm holding a resource that classification minted (ADR-0016, ADR-0020).
   */
  const refuse = (
    exit: 'exhausted' | 'capped',
    resource: ContendedResource,
    attempts: number,
  ): BookOutcome => {
    deps.logger.info({ event: REFUSED_EVENT, exit, resource, attempts, seed }, REFUSED_EVENT);
    return { kind: 'no-capacity', resource, attempts, exit };
  };

  // 6. The loop. It varies ONLY the candidate: steps 1-4 ran once and nothing inside re-derives.
  //
  // A `CandidateOrder` is non-empty by construction and `prune` returns `null` rather than an
  // empty one, so `nextCandidate` is total and there is no index assertion left on this path —
  // the `as string` pair that stood here is gone with the tuple carrier (I-04-3).
  //
  // THE HEADER CARRIES BOUND-2'S STRUCTURAL BOUND, NOT THE CAP (ADR-0020 row F, I-04-2). Two
  // encodings of one number drift, and these are two different numbers: `|bays| + |technicians|`
  // is what pruning a whole resource per conflict guarantees, and the cap is a policy value that
  // may be raised or lowered without touching liveness. The tail below is therefore unreachable —
  // a list empties by attempt `|bays| + |technicians| - 1` and the arm has returned — and it
  // THROWS rather than refusing, so that a future retried `PgOutcome` variant meets a loud fault
  // instead of an unbounded loop.
  const structuralBound = candidates.bays.length + candidates.technicians.length;
  for (let attempts = 1; attempts <= structuralBound; attempts += 1) {
    const { bayId, technicianId } = nextCandidate(order);

    try {
      const row = await db.transaction().execute(async (trx) => {
        // ADR-0018. Two lock acquisitions that read no table and decide nothing, then ONE
        // INSERT. AC-5's amended wording is exactly this transaction's contents. ADR-0026: the
        // lock is a value the insert takes, carrying the pair it locked — there is no second
        // copy of `bayId`/`technicianId` on `NewAppointment` for it to disagree with.
        const lock = await lockResources(trx, bayId, technicianId);
        return await insertAppointment(
          trx,
          {
            id: appointmentId,
            dealershipId: command.dealershipId,
            customerId: command.customerId,
            vehicleId: command.vehicleId,
            serviceTypeId: command.serviceTypeId,
            startsAt,
            endsAt,
          },
          lock,
        );
      });

      return { kind: 'confirmed', appointment: toAppointmentView(row) };
    } catch (error) {
      const outcome = classify(error);

      switch (outcome.kind) {
        case 'conflict': {
          // I-02-6's observer. One line per `23P01`, carrying the constraint name, the resource
          // minted from it, and the attempt — the three facts AC-3 and AC-4 assert on and which
          // are in neither the response nor the table.
          deps.logger.info(
            {
              event: CONFLICT_EVENT,
              constraint: outcome.constraint,
              resource: outcome.resource,
              attempt: attempts,
              bayId,
              technicianId,
            },
            CONFLICT_EVENT,
          );

          // PER RESOURCE VALUE, not per class and NOT PER PAIR (T-02-1, ADR-0009's Bound-2):
          // drop THAT bay, or THAT technician, and leave the others. Emptying the whole list on
          // one failure refuses while capacity plainly remains; pruning only the (bay,
          // technician) pair leaves the conflicting resource in the list, meets it again behind
          // the next partner, and turns the additive bound into a multiplicative one.
          //
          // `outcome.resource` is a `ContendedResource`, an intersection with the plain union
          // `prune` takes — so it goes straight in with no cast at this call site.
          const remaining = prune(
            order,
            outcome.resource,
            outcome.resource === 'bay' ? bayId : technicianId,
          );

          // BOTH REFUSAL EXITS LIVE HERE, IN THE ARM — ADR-0020, and the order of these two
          // lines is the tie-break.
          //
          // The loop `continue`s only on `conflict` and returns on every other classification
          // and on success, so a refusal is reachable ONLY from a classification: the
          // `ContendedResource` below is one this very `23P01` minted from `err.constraint`,
          // never one chosen here. That is what lets ADR-0016's claim survive the cap with no
          // exception, no nullable carrier and no cast.
          //
          // EXHAUSTION FIRST. A classification prunes only its own list, so the list that
          // emptied is the one the last classification named — which is what makes `resource`
          // the SCARCE resource rather than the abundant one (E-02-1). When an attempt both
          // empties a list and reaches the cap, nothing was left untried and `exhausted` is the
          // stronger true statement.
          if (remaining === null) return refuse('exhausted', outcome.resource, attempts);
          if (attempts >= deps.attemptCap) return refuse('capped', outcome.resource, attempts);

          order = remaining;
          continue;
        }

        case 'bad-reference': {
          // NEVER RETRIED. A reference that does not resolve resolves no better on another bay.
          if (outcome.constraint === VEHICLE_OWNERSHIP_CONSTRAINT) {
            // ADR-0017: the three failures sharing this one constraint name are separated AFTER
            // the insert was refused, never by a pre-flight check — which would make this arm
            // unreachable, R-01-4's exact shape.
            const verdict = await classifyOwnership(db, command.customerId, command.vehicleId);
            if (verdict === 'not-owned') return { kind: 'vehicle-not-owned' };
            return {
              kind: 'unknown-reference',
              reference: verdict === 'unknown-customer' ? 'customer' : 'vehicle',
            };
          }

          // Any other composite FK — a technician not qualified, a bay in another dealership —
          // means the candidate query and the constraints disagree. That is broken reference
          // data rather than anything the client sent, so it is the system's fault.
          deps.logger.error(
            {
              event: REFERENCE_DATA_EVENT,
              constraint: outcome.constraint,
              dealershipId: command.dealershipId,
              bayId,
              technicianId,
            },
            'a candidate was refused by a composite foreign key',
          );
          return { kind: 'reference-data-invalid', detail: outcome.constraint };
        }

        case 'no-verdict': {
          // T-02-9 / ADR-0018. NOT RETRIED, and that is a deliberate choice to fail loudly.
          // Under the locks a deadlock can only mean some write path did not take them, and a
          // retry would convert that into a latency blip nobody investigates — a guard hiding
          // the fault it exists to detect. F-02-9 makes it a live risk from slice 06 onward.
          deps.logger.error(
            { event: DEADLOCK_EVENT, bayId, technicianId, attempt: attempts },
            DEADLOCK_EVENT,
          );
          return { kind: 'no-verdict' };
        }

        case 'other':
          // Not this module's to interpret. `classify` is total, and everything it cannot name
          // is a fault rather than a refusal.
          throw error;
      }
    }
  }

  // UNREACHABLE. Every classification either returns or prunes, and pruning a whole resource per
  // conflict empties a list by attempt `|bays| + |technicians| - 1`. A `throw` rather than a
  // refusal because nothing is minted here: there is no verdict to build a `409` from, and a
  // fabricated one is exactly what ADR-0016 forbids. If this ever fires, a `PgOutcome` variant
  // gained a second `continue` and the loop lost its bound (ADR-0020's one-directional guarantee).
  throw new Error(
    `booking loop exceeded its structural bound of ${String(structuralBound)} attempts`,
  );
}
