/**
 * `GET /availability` — the use case. `docs/slices/16-availability-derives-its-own-window.md`,
 * `docs/slices/16-design.md` §1-§3 · arc42 §6.5, §8.6, §10.2, §11.1 · ADR-0039.
 *
 * ── THE WINDOW IS DERIVED, NOT SUPPLIED — ADR-0039 ────────────────────────────────────────────
 *
 * This module no longer takes `fromMillis`/`toMillis`. It takes `startsAtMillis` — the same shape
 * `BookCommand` takes — and calls `deriveInterval`, the exact function `bookAppointment` calls,
 * UNEDITED. Reusing the function rather than the rule is the whole mechanism: duration arithmetic
 * stays in `duration.ts`, the opening-hours gate comes along for free (`deriveInterval` cannot
 * return an interval without clearing it), and the two paths become comparable on a value (AC-2)
 * instead of each trusting its own arithmetic.
 *
 * ── STATEMENT ORDER IS `bookAppointment`'s, EXACTLY ───────────────────────────────────────────
 *
 * Dealership → service type → `deriveInterval` → candidates → busy. Adopting the booking path's
 * order (rather than checking the window first, as this module used to) is what makes the two
 * endpoints agree on PRECEDENCE too: a request naming both an unknown dealership and an unusable
 * `startsAt` now answers `422` from both, not `422` from one and `400` from the other.
 *
 * ── TWO READS, COMPOSED HERE — NEITHER REPOSITORY DECIDES "FREE" ─────────────────────────────
 *
 * `candidateResources` (reference data: which bays and qualified technicians this dealership has
 * for this service type) and `busyResources` (which of those are occupied over the queried
 * window) are two independent queries in two different files, and this module is the ONLY place
 * that subtracts one from the other. Neither repository could answer "is X free" on its own, and
 * that is deliberate: the subtraction happening here, in the open, is what makes it reviewable —
 * there is no single query anywhere whose result IS an availability answer.
 *
 * ── THIS PATH NEVER TOUCHES `INSERT`, AND THAT IS THE WHOLE OF §2.1's ANSWER HERE ─────────────
 *
 * `CLAUDE.md` §2.1 governs check-then-act; design §1.3 (slice 08) is the finding that §2.1 is
 * SILENT about this endpoint because a `GET` performs no act. What keeps "advisory" true is not a
 * rule this module obeys, but a fact about the rest of the system: nothing here calls
 * `lockResources` or `insertAppointment`, and nothing outside `bookAppointment.ts`/
 * `rescheduleAppointment.ts` ever does, so a free answer from this function cannot be turned into
 * a reservation by any code path.
 */
import { deriveInterval } from './deriveInterval.js';
import { busyResources } from '../persistence/appointmentRepository.js';
import { candidateResources } from '../persistence/candidateRepository.js';
import { findDealership, findServiceType } from '../persistence/referenceRepository.js';
import type { Db } from '../persistence/db.js';
import type { Instant } from '../domain/interval.js';
import type { OpeningHoursVerdict } from '../domain/openingHours.js';

export interface AvailabilityQuery {
  readonly dealershipId: string;
  readonly serviceTypeId: string;
  /** Epoch milliseconds — the same shape `BookCommand.startsAtMillis` takes. */
  readonly startsAtMillis: number;
}

export type AvailabilityOutcome =
  | {
      readonly kind: 'available';
      /** The interval this response answered about — `deriveInterval`'s own `startsAt`/`endsAt`,
       * never a caller-supplied window (AC-2, AC-7). */
      readonly startsAt: Instant;
      readonly endsAt: Instant;
      readonly bays: readonly string[];
      readonly technicians: readonly string[];
    }
  | { readonly kind: 'malformed-instant' }
  | { readonly kind: 'outside-opening-hours'; readonly verdict: OpeningHoursVerdict }
  | { readonly kind: 'unknown-reference'; readonly reference: 'dealership' | 'service-type' }
  | { readonly kind: 'reference-data-invalid'; readonly detail: string };

export async function queryAvailability(
  db: Db,
  query: AvailabilityQuery,
): Promise<AvailabilityOutcome> {
  // 1-2. Reference data, FIRST — `bookAppointment`'s own order. Ordinary 422s, and neither is a
  // capacity question.
  const dealership = await findDealership(db, query.dealershipId);
  if (dealership === null) return { kind: 'unknown-reference', reference: 'dealership' };

  const serviceType = await findServiceType(db, query.serviceTypeId);
  if (serviceType === null) return { kind: 'unknown-reference', reference: 'service-type' };

  // 3. The pure derivation — arc42 §6.2 steps 3 and 4, in `deriveInterval.ts`. Unedited: gaining
  // this second caller is the whole mechanism (ADR-0039).
  const derivation = deriveInterval(query.startsAtMillis, serviceType, dealership);
  switch (derivation.kind) {
    case 'unparsable-instant':
      return { kind: 'malformed-instant' };
    case 'invalid-duration':
      // A service type whose `duration_minutes` did not survive `serviceDuration` is broken
      // reference data, not a client error — same as `bookAppointment`'s identical arm.
      return { kind: 'reference-data-invalid', detail: 'service-type-duration' };
    case 'reference-data-invalid':
      return { kind: 'reference-data-invalid', detail: derivation.verdict.kind };
    case 'outside-opening-hours':
      return { kind: 'outside-opening-hours', verdict: derivation.verdict };
    case 'derived':
      break;
  }

  // 4. The two reads, and the ONE subtraction. `candidateResources` never sees `appointment`
  // (QS-12's marker); `busyResources` never sees `service_bay`/`technician`. Only this line puts
  // the two together.
  const candidates = await candidateResources(db, query.dealershipId, query.serviceTypeId);
  // T-16-1 (design §5 ruling 8): the busy read is scoped by the OCCUPANCY interval — what the
  // exclusion constraint sees (arc42 §6.5) — while the response below names the APPOINTMENT
  // interval the client asked about; A-4 makes the two identical today (arc42 §6.5, A-4).
  const busy = await busyResources(
    db,
    query.dealershipId,
    new Date(derivation.occupancyStartsAt),
    new Date(derivation.occupancyEndsAt),
  );

  const busyBays = new Set(busy.bays);
  const busyTechnicians = new Set(busy.technicians);

  return {
    kind: 'available',
    startsAt: derivation.startsAt,
    endsAt: derivation.endsAt,
    bays: candidates.bays.filter((id) => !busyBays.has(id)),
    technicians: candidates.technicians.filter((id) => !busyTechnicians.has(id)),
  };
}
