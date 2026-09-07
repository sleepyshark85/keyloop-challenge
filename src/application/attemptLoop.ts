/**
 * `F-06-1` — the ADR-0004 retry loop, extracted once rather than carried twice.
 *
 * `bookAppointment` and `rescheduleAppointment` each ran their own copy of this loop: same
 * pruning (`prune`, Bound-2), same cap, the same two `pino` event names, and — from this slice —
 * the same span per attempt and the same `booking_conflicts_total` increment. `docs/slices/
 * 09-design.md` decision 2 needs the increment site to be countable at exactly one, which a scan
 * over two files cannot do; extracting the loop is what makes it one.
 *
 * ── PARAMETERISED, NOT LIFTED (ADR-0027) ───────────────────────────────────────────────────────
 *
 * The two loops do not start the same way. Booking draws a seeded shuffle over every candidate
 * before its first attempt. A reschedule tries the appointment's OWN `(bay, technician)` pair
 * first, with no shuffle and no seed drawn for it — the shuffle is deferred until that pair
 * itself conflicts. `CandidateStrategy` names the two starts; everything from the first
 * transaction attempt onward is identical and lives here once.
 *
 * ── WHAT VARIES BY CALLER, AND HOW ─────────────────────────────────────────────────────────────
 *
 *   - `runAttempt` performs the one write (`insertAppointment` or the guarded
 *     `rescheduleAppointmentById`) inside the transaction this loop opens per attempt. Returning
 *     `null` is reschedule's "zero rows" case (ADR-0025: the row exists but is not `confirmed`) —
 *     booking's own `runAttempt` never returns it.
 *   - `onBadReference` handles a `23503` — booking disambiguates the vehicle-ownership FK via
 *     `classifyOwnership`; reschedule treats it as broken reference data. Never retried either
 *     way, so it is a terminal callback rather than a loop state.
 *   - `deadlockEvent`/`successEvent` are per-caller `pino` event names (R-06-E: a reschedule
 *     deadlock is deliberately not folded into booking's own count).
 *
 * ── `booking_conflicts_total` HAS EXACTLY ONE INCREMENT SITE (design decision 2, restated
 * at step 5 finding 11) ─────────────────────────────────────────────────────────────────────────
 *
 * `recordConflict` below is the ONE `Counter#add` call expression in the module — `refuse()` on
 * `exhausted`/`capped`, and the success return when the winning attempt was preceded by a
 * conflict (`absorbed` — the request met contention and survived it), both call IT rather than
 * `.add` directly. Two call SITES to `recordConflict` remain, because the two are mutually
 * exclusive within one loop invocation (a `refuse()` return and the success return cannot both
 * execute), which is what "at most once per attempt loop" means; what step 5 would not tolerate
 * is two sites naming `.add` itself, which is what `dependency-cruiser`'s file-granular reach
 * could not see and what `tests/architecture/ambiguity-containment.test.ts`'s
 * `conflict-counter-increment` marker anchors on now (the binding imported from
 * `platform/telemetry.js`, not a label spelling). `outcome` is a parameter to `recordConflict`,
 * not a literal repeated at three call sites — the concept carried through, not one spelling of
 * it.
 *
 * ── SPANS: ONE PER ATTEMPT, ACTIVE FOR ITS DURATION (arc42 §8.4) ───────────────────────────────
 *
 * `tracer.startActiveSpan` rather than a bare `startSpan` — AC-6 needs a log line correlated to a
 * real trace, and the request's only correlatable line today is the one this file adds on
 * success (`successEvent`), which must be emitted while the span the collector receives is still
 * the ACTIVE one. `@opentelemetry/api` only: the SDK itself is confined to `src/platform` and
 * `src/main.ts` (decision 1).
 *
 * ── `booking_attempts` — RECORDED ONCE, AT THE LOOP'S EXIT, WHATEVER THE OUTCOME ───────────────
 *
 * §8.4: "attempts per booking or reschedule request … working or not" — so the `finally` below
 * records regardless of which branch returns, aborts or throws the unreachable-bound error. It is
 * the count of attempts ACTUALLY MADE, tracked alongside the loop rather than recomputed from it.
 */
import { SpanStatusCode } from '@opentelemetry/api';
import { nextCandidate, orderCandidates, prune } from '../domain/candidates.js';
import type { CandidateOrder } from '../domain/candidates.js';
import type { CandidateSet } from '../persistence/candidateRepository.js';
import type { Db } from '../persistence/db.js';
import {
  DEADLOCK_DETECTED,
  EXCLUSION_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  classify,
} from '../persistence/pgError.js';
import type { ContendedResource } from '../persistence/pgError.js';
import type { Logger } from '../platform/logger.js';
import { bookingAttempts, conflictCounter, tracer } from '../platform/telemetry.js';

/** How the loop's first attempt is chosen. `docs/slices/09-design.md`: "parameterised, not lifted". */
export type CandidateStrategy =
  | {
      /** `bookAppointment`: a seeded shuffle over every candidate, drawn before attempt 1. */
      readonly kind: 'shuffled';
      readonly seed: number;
      readonly order: CandidateOrder;
    }
  | {
      /** `rescheduleAppointment` (ADR-0027): the incumbent pair, tried before any shuffle. */
      readonly kind: 'incumbent';
      readonly bayId: string;
      readonly technicianId: string;
      /** Drawn lazily, only if the incumbent pair itself conflicts. */
      readonly drawSeed: () => number;
    };

export interface AttemptLoopParams<TRow, TAbort> {
  readonly db: Db;
  readonly logger: Logger;
  readonly attemptCap: number;
  readonly candidates: CandidateSet;
  readonly strategy: CandidateStrategy;
  /** `appointment.insert` for booking, `appointment.update` for reschedule (arc42 §8.4). */
  readonly spanName: 'appointment.insert' | 'appointment.update';
  readonly deadlockEvent: string;
  readonly successEvent: string;
  /**
   * The one write, inside this attempt's own transaction (ADR-0004/ADR-0018: one attempt, one
   * transaction). `null` is reschedule's zero-rows case; booking's own callback never produces it.
   */
  readonly runAttempt: (
    trx: Db,
    bayId: string,
    technicianId: string,
    attempt: number,
  ) => Promise<TRow | null>;
  /** A `23503` this loop never retries. Terminal: its return becomes `{ kind: 'aborted' }`. */
  readonly onBadReference: (constraint: string, bayId: string, technicianId: string) => Promise<TAbort>;
}

export type AttemptLoopOutcome<TRow, TAbort> =
  | { readonly kind: 'success'; readonly row: TRow }
  /** Reschedule's zero-rows case (ADR-0025 decision 2/3). Booking never produces it. */
  | { readonly kind: 'not-confirmed' }
  | {
      readonly kind: 'no-capacity';
      readonly resource: ContendedResource;
      readonly attempts: number;
      readonly exit: 'exhausted' | 'capped';
    }
  | { readonly kind: 'no-verdict' }
  | { readonly kind: 'aborted'; readonly value: TAbort };

const CONFLICT_EVENT = 'booking.conflict';
const REFUSED_EVENT = 'booking.refused';

/** The per-attempt result this file's own span wraps — never re-thrown across an `await` boundary. */
type AttemptResult<TRow> =
  | { readonly tag: 'row'; readonly row: TRow | null }
  | { readonly tag: 'error'; readonly error: unknown };

export async function runAttemptLoop<TRow, TAbort>(
  params: AttemptLoopParams<TRow, TAbort>,
): Promise<AttemptLoopOutcome<TRow, TAbort>> {
  const {
    db,
    logger,
    attemptCap,
    candidates,
    strategy,
    spanName,
    deadlockEvent,
    successEvent,
    runAttempt,
    onBadReference,
  } = params;

  let order: CandidateOrder | null;
  let seed: number | null;
  let bayId: string;
  let technicianId: string;

  if (strategy.kind === 'shuffled') {
    order = strategy.order;
    seed = strategy.seed;
    const first = nextCandidate(order);
    bayId = first.bayId;
    technicianId = first.technicianId;
  } else {
    order = null;
    seed = null;
    bayId = strategy.bayId;
    technicianId = strategy.technicianId;
  }

  const structuralBound =
    strategy.kind === 'shuffled'
      ? candidates.bays.length + candidates.technicians.length
      : 1 + candidates.bays.length + candidates.technicians.length;

  /**
   * `order === null` is reachable ONLY under an `'incumbent'` strategy — `'shuffled'` starts with
   * a non-null order and every subsequent update is `prune`'s (never null without an immediate
   * `refuse`). This closure is what lets the branch below draw the seed without re-narrowing
   * `strategy` at every use.
   */
  const drawIncumbentSeed: () => number =
    strategy.kind === 'incumbent'
      ? strategy.drawSeed
      : (): number => {
          throw new Error('attempt loop: drawSeed invoked without an incumbent strategy');
        };

  /** The resource of the most recent conflict — what makes a following success "absorbed". */
  let lastConflictResource: ContendedResource | null = null;

  /** decision 2, restated (step 5 finding 11): the ONE `Counter#add` call expression. */
  const recordConflict = (resource: ContendedResource, outcome: 'absorbed' | 'refused' | 'capped'): void => {
    conflictCounter.add(1, { resource, outcome });
  };

  const refuse = (
    exit: 'exhausted' | 'capped',
    resource: ContendedResource,
    attempts: number,
  ): AttemptLoopOutcome<TRow, TAbort> => {
    logger.info({ event: REFUSED_EVENT, exit, resource, attempts, seed }, REFUSED_EVENT);
    recordConflict(resource, exit === 'exhausted' ? 'refused' : 'capped');
    return { kind: 'no-capacity', resource, attempts, exit };
  };

  /** `booking_attempts` (§8.4): the count of attempts actually made, recorded once at exit. */
  let attemptsMade = 0;

  try {
    for (let attempts = 1; attempts <= structuralBound; attempts += 1) {
      attemptsMade = attempts;
      const currentBayId: string = bayId;
      const currentTechnicianId: string = technicianId;

      const result = await tracer.startActiveSpan(spanName, async (span): Promise<AttemptResult<TRow>> => {
        span.setAttribute('booking.attempt', attempts);
        span.setAttribute('bay.id', currentBayId);
        span.setAttribute('technician.id', currentTechnicianId);
        try {
          const row = await db
            .transaction()
            .execute(async (trx) => await runAttempt(trx, currentBayId, currentTechnicianId, attempts));
          if (row !== null) logger.info({ event: successEvent, attempt: attempts }, successEvent);
          return { tag: 'row', row };
        } catch (error) {
          const classified = classify(error);
          if (classified.kind === 'conflict') {
            span.setAttribute('db.sqlstate', EXCLUSION_VIOLATION);
            span.setAttribute('db.constraint', classified.constraint);
          } else if (classified.kind === 'bad-reference') {
            span.setAttribute('db.sqlstate', FOREIGN_KEY_VIOLATION);
            span.setAttribute('db.constraint', classified.constraint);
          } else if (classified.kind === 'no-verdict') {
            span.setAttribute('db.sqlstate', DEADLOCK_DETECTED);
          }
          span.setStatus({ code: SpanStatusCode.ERROR });
          return { tag: 'error', error };
        } finally {
          span.end();
        }
      });

      if (result.tag === 'row') {
        if (result.row === null) return { kind: 'not-confirmed' };
        if (lastConflictResource !== null) recordConflict(lastConflictResource, 'absorbed');
        return { kind: 'success', row: result.row };
      }

      const outcome = classify(result.error);
      switch (outcome.kind) {
        case 'conflict': {
          logger.info(
            {
              event: CONFLICT_EVENT,
              constraint: outcome.constraint,
              resource: outcome.resource,
              attempt: attempts,
              bayId: currentBayId,
              technicianId: currentTechnicianId,
            },
            CONFLICT_EVENT,
          );

          if (order === null) {
            seed = drawIncumbentSeed();
            const initialOrder = orderCandidates(candidates.bays, candidates.technicians, seed);
            if (initialOrder === null) return refuse('exhausted', outcome.resource, attempts);
            order = initialOrder;
          } else {
            const remaining = prune(
              order,
              outcome.resource,
              outcome.resource === 'bay' ? currentBayId : currentTechnicianId,
            );
            if (remaining === null) return refuse('exhausted', outcome.resource, attempts);
            order = remaining;
          }

          lastConflictResource = outcome.resource;
          if (attempts >= attemptCap) return refuse('capped', outcome.resource, attempts);

          const next = nextCandidate(order);
          bayId = next.bayId;
          technicianId = next.technicianId;
          continue;
        }

        case 'bad-reference':
          return {
            kind: 'aborted',
            value: await onBadReference(outcome.constraint, currentBayId, currentTechnicianId),
          };

        case 'no-verdict':
          logger.error(
            { event: deadlockEvent, bayId: currentBayId, technicianId: currentTechnicianId, attempt: attempts },
            deadlockEvent,
          );
          return { kind: 'no-verdict' };

        case 'other':
          // Not this loop's to interpret — `classify` is total, and everything it cannot name is
          // a fault rather than a refusal.
          throw result.error;
      }
    }

    // UNREACHABLE by the same argument both original loops carried: pruning a whole resource per
    // conflict empties a list by attempt `structuralBound`, and every classification either
    // returns or prunes.
    throw new Error(`attempt loop exceeded its structural bound of ${String(structuralBound)} attempts`);
  } finally {
    bookingAttempts.record(attemptsMade);
  }
}
