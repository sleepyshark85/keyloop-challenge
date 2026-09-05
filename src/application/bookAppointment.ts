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
 * The seeded shuffle and the 16-attempt cap are ADR-0009's and stay in slice 04. Candidate
 * ordering here is deterministic, which is F-02-7's substitute for a seed: a deterministic order
 * is re-runnable by construction with nothing to record.
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
  const bays = [...candidates.bays];
  const technicians = [...candidates.technicians];

  // The two empty cases are DIFFERENT FAILURES and collapsing them was a design defect ruled at
  // step 2 (I-02-8 / T-02-7). A dealership with no bays cannot perform ANY service — that is a
  // mis-seeded dealership and the system's fault, so `500`. "No technician here is qualified for
  // this service type" is an entirely ordinary state of an ordinary dealership: the request names
  // a (dealership, service-type) pair and that pair does not resolve, which is the only sense in
  // which this API knows service types at all.
  if (bays.length === 0) {
    deps.logger.error(
      { event: REFERENCE_DATA_EVENT, dealershipId: command.dealershipId },
      'dealership has no service bays',
    );
    return { kind: 'reference-data-invalid', detail: 'no-service-bays' };
  }
  if (technicians.length === 0) {
    return { kind: 'unknown-reference', reference: 'service-type' };
  }

  const appointmentId = deps.newId();
  const startsAt = new Date(derivation.occupancyStartsAt);
  const endsAt = new Date(derivation.occupancyEndsAt);
  let attempts = 0;

  // 5. The loop. It varies ONLY the candidate: steps 1-3 ran once and nothing inside re-derives.
  //
  // Both lists are non-empty on entry (the two guards above) and EVERY path that empties one
  // returns from inside the loop, so the head of each is always present. The `as string` is
  // `noUncheckedIndexedAccess` on an array index and nothing more — it fabricates no brand, which
  // is the assertion §4.1 and the `contended-resource-cast` marker are about.
  for (;;) {
    const bayId = bays[0] as string;
    const technicianId = technicians[0] as string;
    attempts += 1;

    try {
      const row = await db.transaction().execute(async (trx) => {
        // ADR-0018. Two lock acquisitions that read no table and decide nothing, then ONE
        // INSERT. AC-5's amended wording is exactly this transaction's contents.
        await lockResources(trx, bayId, technicianId);
        return await insertAppointment(trx, {
          id: appointmentId,
          dealershipId: command.dealershipId,
          customerId: command.customerId,
          vehicleId: command.vehicleId,
          serviceTypeId: command.serviceTypeId,
          technicianId,
          bayId,
          startsAt,
          endsAt,
        });
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

          // PER VALUE, not per class (T-02-1): drop THAT bay, or THAT technician, and leave the
          // others. Emptying the whole list on one failure refuses while capacity plainly
          // remains, and it is what made AC-4 fail under this design's earlier wording.
          const remaining = outcome.resource === 'bay' ? bays : technicians;
          remaining.shift();
          if (remaining.length > 0) continue;

          // THE ONE REFUSAL EXIT, and it is reached holding a `ContendedResource` this very
          // classification minted from `err.constraint` rather than one chosen here. A
          // classification prunes only its own list, so the list that emptied is the one the
          // last classification named — which is what makes `resource` the SCARCE resource and
          // not the abundant one (E-02-1). Slice 04's attempt cap adds a SECOND exit, with both
          // lists non-empty and no emptied list to name; that is where ADR-0016's claim needs
          // re-measuring, in slice 04 and not here.
          return { kind: 'no-capacity', resource: outcome.resource, attempts };
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
}
