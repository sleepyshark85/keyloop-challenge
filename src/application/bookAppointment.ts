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
 *
 * ── F-06-1: THE LOOP ITSELF IS `attemptLoop.ts`, SHARED WITH `rescheduleAppointment` ──────────
 *
 * This module keeps everything either side of the loop — reference data, the domain derivation,
 * the empty-candidate pre-check no reschedule needs (attempt 1 always has a candidate: the
 * incumbent pair) — and hands the loop its one write (`runAttempt`) and its one terminal
 * callback (`onBadReference`, ADR-0017's ownership disambiguation).
 */
import { runAttemptLoop } from './attemptLoop.js';
import type { AttemptLoopOutcome } from './attemptLoop.js';
import { deriveInterval } from './deriveInterval.js';
import { orderCandidates } from '../domain/candidates.js';
import type { Db } from '../persistence/db.js';
import type { Logger } from '../platform/logger.js';
import {
  busyResources,
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
import { VEHICLE_OWNERSHIP_CONSTRAINT } from '../persistence/pgError.js';
import type { ContendedResource } from '../persistence/pgError.js';
import type { OpeningHoursVerdict } from '../domain/openingHours.js';
import { appointmentsBookedTotal } from '../platform/telemetry.js';

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
  /** `40P01` under ADR-0018/ADR-0030's locks — some write path did not lock every resource it
   * was in flight against. T-02-9. */
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

const DEADLOCK_EVENT = 'booking.deadlock';
const REFERENCE_DATA_EVENT = 'booking.reference-data-invalid';
/** AC-6 / arc42 §8.4: "one line per request" — the confirmation, emitted inside the winning
 * attempt's own span so its `trace_id`/`span_id` correlate (F-06-1, `attemptLoop.ts`). */
const CONFIRMED_EVENT = 'booking.confirmed';

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

  // 4. Candidates — REFERENCE DATA ONLY, `candidateResources` never reads `appointment` — and the
  // ADVISORY occupancy read (ADR-0040, `A-19-1`) over the OCCUPANCY interval the exclusion
  // constraint itself sees. One round trip each, run together: neither depends on the other's
  // result, and both must finish before ordering (step 5) can run.
  const startsAt = new Date(derivation.occupancyStartsAt);
  const endsAt = new Date(derivation.occupancyEndsAt);
  const [candidates, busy] = await Promise.all([
    candidateResources(db, command.dealershipId, command.serviceTypeId),
    busyResources(db, command.dealershipId, startsAt, endsAt),
  ]);

  // 5. The order — ADR-0040's Order-E, free-first from the occupancy read above, from one seed
  // drawn for this request.
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
  // build one from (ADR-0016). `busy` cannot reach this branch for a non-empty input either way —
  // AC-3b, `orderCandidates`'s own P2/P9.
  const seed = deps.seed();
  const initialOrder = orderCandidates(candidates.bays, candidates.technicians, busy, seed);
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

  // 6. The loop — `attemptLoop.ts` (F-06-1), starting from the whole-tree shuffle already drawn
  // above. `runAttempt` is ADR-0018's two lock acquisitions plus ONE `INSERT`; `onBadReference`
  // is ADR-0017's ownership disambiguation, never retried either way.
  const loopOutcome: AttemptLoopOutcome<AppointmentRow, BookOutcome> = await runAttemptLoop({
    db,
    logger: deps.logger,
    attemptCap: deps.attemptCap,
    candidates,
    strategy: { kind: 'shuffled', seed, order: initialOrder },
    spanName: 'appointment.insert',
    deadlockEvent: DEADLOCK_EVENT,
    successEvent: CONFIRMED_EVENT,
    runAttempt: async (trx, bayId, technicianId) => {
      // ADR-0018. Two lock acquisitions that read no table and decide nothing, then ONE INSERT.
      // AC-5's amended wording is exactly this transaction's contents. ADR-0026: the lock is a
      // value the insert takes, carrying the pair it locked — there is no second copy of
      // `bayId`/`technicianId` on `NewAppointment` for it to disagree with. ADR-0030: `leave:
      // null` — a booking vacates nothing, so `lockResources` locks only the pair it takes.
      const lock = await lockResources(trx, bayId, technicianId, null);
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
    },
    onBadReference: async (constraint, bayId, technicianId) => {
      // NEVER RETRIED. A reference that does not resolve resolves no better on another bay.
      if (constraint === VEHICLE_OWNERSHIP_CONSTRAINT) {
        // ADR-0017: the three failures sharing this one constraint name are separated AFTER the
        // insert was refused, never by a pre-flight check — which would make this arm
        // unreachable, R-01-4's exact shape.
        const verdict = await classifyOwnership(db, command.customerId, command.vehicleId);
        if (verdict === 'not-owned') return { kind: 'vehicle-not-owned' };
        return {
          kind: 'unknown-reference',
          reference: verdict === 'unknown-customer' ? 'customer' : 'vehicle',
        };
      }

      // Any other composite FK — a technician not qualified, a bay in another dealership — means
      // the candidate query and the constraints disagree. That is broken reference data rather
      // than anything the client sent, so it is the system's fault.
      deps.logger.error(
        {
          event: REFERENCE_DATA_EVENT,
          constraint,
          dealershipId: command.dealershipId,
          bayId,
          technicianId,
        },
        'a candidate was refused by a composite foreign key',
      );
      return { kind: 'reference-data-invalid', detail: constraint };
    },
  });

  switch (loopOutcome.kind) {
    case 'success':
      // arc42 §8.4's metrics table.
      appointmentsBookedTotal.add(1, { dealership: command.dealershipId });
      return { kind: 'confirmed', appointment: toAppointmentView(loopOutcome.row) };
    case 'aborted':
      return loopOutcome.value;
    case 'no-capacity':
      return {
        kind: 'no-capacity',
        resource: loopOutcome.resource,
        attempts: loopOutcome.attempts,
        exit: loopOutcome.exit,
      };
    case 'no-verdict':
      return { kind: 'no-verdict' };
    case 'not-confirmed':
      // UNREACHABLE on the booking path — `runAttempt` above never returns `null`; only
      // reschedule's guarded `UPDATE` can. Loud rather than silent if that ever stops holding.
      // Stryker disable next-line all : no input reaches this branch (R-06-A's shape).
      throw new Error('bookAppointment: the attempt loop reported not-confirmed, which booking never produces');
  }
}
