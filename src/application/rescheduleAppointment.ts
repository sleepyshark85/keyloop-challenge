/**
 * `PATCH /appointments/{id}` — ADR-0025's guarded `UPDATE`, ADR-0026's carried lock, and
 * ADR-0027's attempt order, as a use case.
 *
 * ── THE SECOND COPY OF `bookAppointment`'s LOOP, AND WHERE IT STARTS ──────────────────────────
 *
 * ADR-0003 requires a move needing a different bay or technician to re-run ADR-0004's candidate
 * selection and retry — `PATCH` must not refuse while capacity exists (QS-3), which is the one
 * behaviour this system is about. `RescheduleOutcome` IS ITS OWN UNION, not a reuse of
 * `BookOutcome`, for the same §5.2 reason `CancelOutcome` is its own: a member added for one use
 * case must not silently change another's exhaustiveness check.
 *
 * ADR-0027: ATTEMPT 1 IS THE APPOINTMENT'S OWN `(bay_id, technician_id)`, tried directly — no
 * SHUFFLE and no seed draw for it, not no lock: it is locked exactly like every other attempt
 * (line 210 below is unconditional), and ADR-0030 locks it against itself, so `lockResources`'
 * `DISTINCT` collapses the statement back to today's two keys. On that pair's `23P01`, ADR-0009
 * applies unchanged from attempt 2 onward:
 * a full seeded shuffle is drawn over ALL candidates (the incumbent pair among them, so it may
 * be re-tried paired with a different partner — bounded at one extra attempt, ADR-0027
 * "Consequences"), with Bound-2 pruning and the same attempt cap. The structural bound is
 * therefore Bound-2's plus one: the incumbent costs one attempt beyond the ordinary traversal.
 *
 * F-06-1, recorded rather than fixed: this loop and `bookAppointment`'s are two copies of one
 * design, not an extraction. Deferred to slice 09, which reopens both write paths to instrument
 * them anyway (docs/slices/06-design.md §1).
 *
 * ── ADR-0025: EXISTENCE IS THE READ'S; LEGALITY IS THE STATEMENT'S ────────────────────────────
 *
 * 1. `findAppointmentById` decides `404` — absence is permanent, because appointment ids are
 *    minted by `deps.newId()` (booking's) and never client-supplied, so no concurrent
 *    transaction can create the id this request named.
 * 2. The domain rule (`deriveInterval`, identical to booking's) runs on the ROW's own
 *    dealership and service type, UNCONDITIONALLY and BEFORE the row's status is ever
 *    consulted at the database. The ruled consequence: a cancelled appointment moved out of
 *    hours answers `400 outside-opening-hours`, not `409` — the status guard lives only in the
 *    guarded `UPDATE`'s `WHERE`, never in a preceding check.
 * 3. The guarded `UPDATE` decides `409 appointment-not-confirmed` — zero rows from it, at ANY
 *    attempt, means exactly one thing (existence is already established), so there is no
 *    follow-up read.
 *
 * This is not check-then-act (ADR-0025 decision 5): the existence read touches one row by
 * primary key and answers nothing about any other appointment's interval, so its `confirmed`
 * answer is re-adjudicated atomically by the write's own `status = 'confirmed'` rather than
 * trusted.
 */
import { deriveInterval } from './deriveInterval.js';
import { toAppointmentView } from './bookAppointment.js';
import type { AppointmentView } from './bookAppointment.js';
import { nextCandidate, orderCandidates, prune } from '../domain/candidates.js';
import type { CandidateOrder } from '../domain/candidates.js';
import type { OpeningHoursVerdict } from '../domain/openingHours.js';
import type { Db } from '../persistence/db.js';
import type { Logger } from '../platform/logger.js';
import {
  findAppointmentById,
  lockAppointmentRow,
  lockResources,
  rescheduleAppointmentById,
} from '../persistence/appointmentRepository.js';
import type { Move, ResourcePair } from '../persistence/appointmentRepository.js';
import { candidateResources } from '../persistence/candidateRepository.js';
import { findDealership, findServiceType } from '../persistence/referenceRepository.js';
import { classify } from '../persistence/pgError.js';
import type { ContendedResource } from '../persistence/pgError.js';

export interface RescheduleCommand {
  readonly id: string;
  /** Epoch milliseconds. There is NO end and NO bay/technician: design §3, a move is `startsAt` only. */
  readonly startsAtMillis: number;
}

export type RescheduleOutcome =
  | { readonly kind: 'moved'; readonly appointment: AppointmentView }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'not-confirmed' }
  | { readonly kind: 'malformed-instant' }
  | { readonly kind: 'outside-opening-hours'; readonly verdict: OpeningHoursVerdict }
  | {
      readonly kind: 'no-capacity';
      readonly resource: ContendedResource;
      readonly attempts: number;
      readonly exit: 'exhausted' | 'capped';
    }
  | { readonly kind: 'no-verdict' }
  | { readonly kind: 'reference-data-invalid'; readonly detail: string };

export interface RescheduleDeps {
  /** ADR-0009's per-request seed, injected — the same reason `BookDeps.seed` is. */
  readonly seed: () => number;
  /** ADR-0009's attempt cap (`platform/config.ts`), same policy value as booking's. */
  readonly attemptCap: number;
  /** I-02-6's observer, reused: the `booking.conflict` line is where a control reads the
   * refused constraint's name (design §2.2), and it is the SAME event name and shape booking
   * writes — one taxonomy of log lines, not two. */
  readonly logger: Logger;
}

const CONFLICT_EVENT = 'booking.conflict';
const REFUSED_EVENT = 'booking.refused';
/**
 * R-06-E: DISTINCT from `bookAppointment.ts`'s own `DEADLOCK_EVENT`, unlike `CONFLICT_EVENT`,
 * `REFUSED_EVENT` and `REFERENCE_DATA_EVENT` above, which are deliberately the SAME event
 * booking writes (I-02-6 — "one taxonomy of log lines, not two"). A deadlock is not one taxonomy
 * shared on purpose: it names the write path that skipped ADR-0018's locks, and slice 09's
 * observability work counts deadlocks per path. Sharing `'booking.deadlock'` here would fold
 * every reschedule deadlock into booking's count silently — the two would still SUM correctly,
 * but nothing could tell them apart, and no test anywhere pinned the shared string (measured: a
 * repo-wide search finds no assertion on it outside `bookAppointment.test.ts`), so nothing
 * observable depends on undoing this before it compounds.
 */
const DEADLOCK_EVENT = 'reschedule.deadlock';
const REFERENCE_DATA_EVENT = 'booking.reference-data-invalid';

export async function rescheduleAppointment(
  db: Db,
  deps: RescheduleDeps,
  command: RescheduleCommand,
): Promise<RescheduleOutcome> {
  // ADR-0025 decision 1 — the read decides 404, and it is the read a move needs anyway: the new
  // interval is derived from the ROW's own service type and validated against its OWN
  // dealership's hours, never from anything the request carries.
  const existing = await findAppointmentById(db, command.id);
  if (existing === null) return { kind: 'not-found' };

  const dealership = await findDealership(db, existing.dealershipId);
  if (dealership === null) {
    // Unreachable in a consistent database: `bay_id`/`technician_id`'s composite FKs make
    // `dealership_id` valid transitively. Guarded anyway, the same shape booking's own
    // "broken reference data" arm takes — the system's fault, never the client's.
    deps.logger.error(
      { event: REFERENCE_DATA_EVENT, dealershipId: existing.dealershipId },
      'a confirmed appointment names a dealership that no longer resolves',
    );
    return { kind: 'reference-data-invalid', detail: 'dealership' };
  }

  const serviceType = await findServiceType(db, existing.serviceTypeId);
  if (serviceType === null) {
    deps.logger.error(
      { event: REFERENCE_DATA_EVENT, serviceTypeId: existing.serviceTypeId },
      'a confirmed appointment names a service type that no longer resolves',
    );
    return { kind: 'reference-data-invalid', detail: 'service-type' };
  }

  // The domain rule, UNCONDITIONALLY and BEFORE the row's status is ever consulted at the
  // database (ADR-0025's ruled consequence): a cancelled appointment moved out of hours answers
  // 400, not 409, because this runs whether or not `existing.status` is 'confirmed'.
  const derivation = deriveInterval(command.startsAtMillis, serviceType, dealership);
  switch (derivation.kind) {
    case 'unparsable-instant':
      return { kind: 'malformed-instant' };
    case 'invalid-duration':
      deps.logger.error(
        { event: REFERENCE_DATA_EVENT, serviceTypeId: existing.serviceTypeId },
        'service type duration is not a positive integer',
      );
      return { kind: 'reference-data-invalid', detail: 'service-type-duration' };
    case 'reference-data-invalid':
      deps.logger.error(
        {
          event: REFERENCE_DATA_EVENT,
          dealershipId: existing.dealershipId,
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

  // Candidates for re-allocation ONLY — reference data, exactly as booking's. Read even though
  // attempt 1 does not need them, because a `23P01` on the incumbent pair must have somewhere
  // to shuffle into.
  const candidates = await candidateResources(db, existing.dealershipId, existing.serviceTypeId);

  const startsAt = new Date(derivation.occupancyStartsAt);
  const endsAt = new Date(derivation.occupancyEndsAt);
  const move: Move = { id: existing.id, startsAt, endsAt };

  const refuse = (
    exit: 'exhausted' | 'capped',
    resource: ContendedResource,
    attempts: number,
  ): RescheduleOutcome => {
    deps.logger.info({ event: REFUSED_EVENT, exit, resource, attempts, seed }, REFUSED_EVENT);
    return { kind: 'no-capacity', resource, attempts, exit };
  };

  // ADR-0027 — the structural bound is Bound-2's plus one: attempt 1 is the incumbent pair,
  // outside the shuffle; attempts 2.. traverse the full candidate lists exactly as booking's
  // loop does, bounded at |bays| + |technicians|.
  const structuralBound = 1 + candidates.bays.length + candidates.technicians.length;
  let order: CandidateOrder | null = null;
  let bayId = existing.bayId;
  let technicianId = existing.technicianId;
  let seed: number | null = null;

  for (let attempts = 1; attempts <= structuralBound; attempts += 1) {
    try {
      const row = await db.transaction().execute(async (trx) => {
        // ADR-0031 — the pair this row is IN FLIGHT AGAINST until this move commits, read
        // INSIDE this attempt's own transaction under the row's own lock: never a value
        // carried from the pre-loop existence read, which is stale the instant another
        // request commits a move of the same row (R-07-1).
        const leaves: ResourcePair = await lockAppointmentRow(trx, move.id);
        const lock = await lockResources(trx, bayId, technicianId, leaves);
        return await rescheduleAppointmentById(trx, move, lock);
      });

      // ADR-0025 decision 2/3 — zero rows here, at ANY attempt, means exactly one thing: the
      // row exists (the read above established that) and is not 'confirmed'. No follow-up read.
      if (row === null) return { kind: 'not-confirmed' };

      return { kind: 'moved', appointment: toAppointmentView(row) };
    } catch (error) {
      const outcome = classify(error);

      switch (outcome.kind) {
        case 'conflict': {
          // I-02-6's observer, reused verbatim (design §2.2): the SAME event, carrying the
          // constraint name, the resource and the attempt.
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

          if (order === null) {
            // Attempt 1 (the incumbent pair) just failed. Draw ADR-0009's seeded shuffle over
            // ALL candidates for the remainder — the incumbent among them, which is the bounded
            // extra cost ADR-0027 names rather than hides.
            seed = deps.seed();
            const initialOrder = orderCandidates(candidates.bays, candidates.technicians, seed);
            if (initialOrder === null) return refuse('exhausted', outcome.resource, attempts);
            order = initialOrder;
          } else {
            // EXHAUSTION FIRST, same tie-break as booking's loop (ADR-0020): a classification
            // prunes only its own list, so the list that emptied is the one this `23P01` named.
            const remaining = prune(
              order,
              outcome.resource,
              outcome.resource === 'bay' ? bayId : technicianId,
            );
            if (remaining === null) return refuse('exhausted', outcome.resource, attempts);
            order = remaining;
          }

          if (attempts >= deps.attemptCap) return refuse('capped', outcome.resource, attempts);

          const next = nextCandidate(order);
          bayId = next.bayId;
          technicianId = next.technicianId;
          continue;
        }

        case 'bad-reference': {
          // Should be UNREACHABLE (design §3): the row's references were already valid and a
          // move sets none of them (dealership, customer, vehicle, service type are all out of
          // scope). If this fires, the candidate query and the constraints disagree — the
          // system's fault, exactly as booking's mirror arm.
          deps.logger.error(
            {
              event: REFERENCE_DATA_EVENT,
              constraint: outcome.constraint,
              dealershipId: existing.dealershipId,
              bayId,
              technicianId,
            },
            'a reschedule candidate was refused by a composite foreign key',
          );
          return { kind: 'reference-data-invalid', detail: outcome.constraint };
        }

        case 'no-verdict': {
          // T-02-9 / ADR-0018, ADR-0030 and ADR-0031. NOT a write path skipping a lock — a
          // move past attempt 1 is legitimately in flight against TWO pairs (the one it
          // holds, the one it is trying to take), and `lockResources`' `leave` argument above
          // locks both, read INSIDE this attempt's own transaction (`lockAppointmentRow`)
          // rather than carried from before it opened. A `40P01` reaching here means a
          // resource this move was in flight against went unlocked — which now also covers a
          // regression to a lock set COMPUTED FROM STATE READ OUTSIDE THE TRANSACTION,
          // ADR-0031's own failure mode — and under ADR-0030's rule is an internal fault
          // either way. Not retried.
          deps.logger.error(
            { event: DEADLOCK_EVENT, bayId, technicianId, attempt: attempts },
            DEADLOCK_EVENT,
          );
          return { kind: 'no-verdict' };
        }

        case 'other':
          throw error;
      }
    }
  }

  // UNREACHABLE — same argument as booking's, one attempt wider: attempt 1 always transitions
  // into a CandidateOrder on its first conflict, and Bound-2's traversal from there empties a
  // list by attempt `structuralBound`.
  throw new Error(
    `reschedule loop exceeded its structural bound of ${String(structuralBound)} attempts` +
      (seed === null ? '' : ` (seed ${String(seed)})`),
  );
}
