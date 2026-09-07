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
 * F-06-1, discharged at slice 09: this loop and `bookAppointment`'s now share one implementation,
 * `attemptLoop.ts`. Attempt 1 here is the `'incumbent'` `CandidateStrategy` — the row's own pair,
 * no shuffle drawn for it — and every attempt from the first conflict onward is identical to
 * booking's own loop, which is why it lives in one file rather than two (docs/slices/09-design.md
 * decision 2).
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
import { runAttemptLoop } from './attemptLoop.js';
import type { AttemptLoopOutcome } from './attemptLoop.js';
import { deriveInterval } from './deriveInterval.js';
import { toAppointmentView } from './bookAppointment.js';
import type { AppointmentView } from './bookAppointment.js';
import type { OpeningHoursVerdict } from '../domain/openingHours.js';
import type { Db } from '../persistence/db.js';
import type { Logger } from '../platform/logger.js';
import {
  findAppointmentById,
  lockAppointmentRow,
  lockResources,
  rescheduleAppointmentById,
} from '../persistence/appointmentRepository.js';
import type { AppointmentRow, Move, ResourcePair } from '../persistence/appointmentRepository.js';
import { candidateResources } from '../persistence/candidateRepository.js';
import { findDealership, findServiceType } from '../persistence/referenceRepository.js';
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

/**
 * R-06-E: DISTINCT from `bookAppointment.ts`'s own `DEADLOCK_EVENT`, unlike `attemptLoop.ts`'s
 * shared `CONFLICT_EVENT`/`REFUSED_EVENT` and this file's own `REFERENCE_DATA_EVENT`, which are
 * deliberately the SAME event booking writes (I-02-6 — "one taxonomy of log lines, not two"). A
 * deadlock is not one taxonomy shared on purpose: under ADR-0030/ADR-0031 it means some write
 * path did not lock every resource it was in flight against — not that a path skipped its locks
 * — and slice 09's observability work counts deadlocks per path. Sharing `'booking.deadlock'`
 * here would fold every reschedule deadlock into booking's count silently — the two would still
 * SUM correctly, but nothing could tell them apart, and no test anywhere pinned the shared string
 * (measured: a repo-wide search finds no assertion on it outside `bookAppointment.test.ts`), so
 * nothing observable depends on undoing this before it compounds.
 */
const DEADLOCK_EVENT = 'reschedule.deadlock';
const REFERENCE_DATA_EVENT = 'booking.reference-data-invalid';
/** AC-6 / arc42 §8.4's "one line per request" — the move, emitted inside the winning attempt's
 * own span (F-06-1, `attemptLoop.ts`) so its `trace_id`/`span_id` correlate. */
const MOVED_EVENT = 'reschedule.moved';

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

  // ADR-0027 / F-06-1 — `attemptLoop.ts`'s `'incumbent'` strategy: attempt 1 is the row's own
  // pair, outside any shuffle; the seed is drawn only if that pair itself conflicts.
  const loopOutcome: AttemptLoopOutcome<AppointmentRow, RescheduleOutcome> = await runAttemptLoop({
    db,
    logger: deps.logger,
    attemptCap: deps.attemptCap,
    candidates,
    strategy: {
      kind: 'incumbent',
      bayId: existing.bayId,
      technicianId: existing.technicianId,
      drawSeed: deps.seed,
    },
    spanName: 'appointment.update',
    deadlockEvent: DEADLOCK_EVENT,
    successEvent: MOVED_EVENT,
    runAttempt: async (trx, bayId, technicianId) => {
      // ADR-0031 — the pair this row is IN FLIGHT AGAINST until this move commits, read INSIDE
      // this attempt's own transaction under the row's own lock: never a value carried from the
      // pre-loop existence read, which is stale the instant another request commits a move of
      // the same row (R-07-1).
      const leaves: ResourcePair = await lockAppointmentRow(trx, move.id);
      const lock = await lockResources(trx, bayId, technicianId, leaves);
      // ADR-0025 decision 2/3 — zero rows here, at ANY attempt, means exactly one thing: the
      // row exists (the read above established that) and is not 'confirmed'. No follow-up read.
      return await rescheduleAppointmentById(trx, move, lock);
    },
    onBadReference: async (constraint, bayId, technicianId) => {
      // Should be UNREACHABLE (design §3): the row's references were already valid and a move
      // sets none of them (dealership, customer, vehicle, service type are all out of scope). If
      // this fires, the candidate query and the constraints disagree — the system's fault,
      // exactly as booking's mirror arm.
      deps.logger.error(
        {
          event: REFERENCE_DATA_EVENT,
          constraint,
          dealershipId: existing.dealershipId,
          bayId,
          technicianId,
        },
        'a reschedule candidate was refused by a composite foreign key',
      );
      return { kind: 'reference-data-invalid', detail: constraint };
    },
  });

  switch (loopOutcome.kind) {
    case 'success':
      return { kind: 'moved', appointment: toAppointmentView(loopOutcome.row) };
    case 'not-confirmed':
      return { kind: 'not-confirmed' };
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
  }
}
