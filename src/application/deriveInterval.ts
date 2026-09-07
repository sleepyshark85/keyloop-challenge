/**
 * The composition order — arc42 §6.2 steps 3 and 4, in that order and only that order.
 *
 * D-01-1 records that this composition used to be enforced by the brands and, since the literal
 * AC-6 ruling took `Interval` out of `openingHours.ts`'s reach, is now "correct because someone
 * wrote it correctly". This module is where that correctness lives, and it is PURE — no `Db`, no
 * clock, no I/O — for a reason that is not tidiness: a pure module can be unit-tested without
 * Docker and mutated by Stryker, so what the ruling cost gets the strongest replacement available.
 *
 * ── BUT NOT A MUTATION SCORE, AND THE CORRECTION MATTERS (I-02-3) ────────────────────────────
 *
 * MUTATION TESTING DOES NOT TEST STATEMENT ORDER. Stryker ships twenty mutators — arithmetic,
 * array-declaration, arrow-function, assignment, block-statement, boolean-literal,
 * conditional-expression, empty-expression, equality, logical, method-expression, object-literal,
 * optional-chaining, regex, string-literal, unary, update-operator and the rest — and NONE of them
 * reorders or moves a statement; `block-statement` empties a block rather than permuting it. A
 * mutation score over this file is evidence about its BRANCHES and says nothing about whether
 * `serviceDuration` ran before `appointmentInterval`. So the split is honest: the branches are
 * covered by mutation, and the ORDER is covered by explicit precedence unit tests — a call with
 * inputs that would produce a DIFFERENT answer under a swapped order, asserting the answer the
 * specified order gives. Weaker than a compiler, stronger than nothing, and named as such.
 *
 * ── WHY IT TAKES A DEALERSHIP AND NOT A `zone` STRING ────────────────────────────────────────
 *
 * QS-12 holds `zone-transport` to a named four-file list by SET EQUALITY, and `bookAppointment.ts`
 * is not on it. A signature of `(millis, serviceType, ianaZone, weekly)` would force every caller
 * to say `dealership.ianaZone` and put the identifier in a fifth file; a `zone: string` parameter
 * would instead leave THIS file off the list. Taking the pair as one value satisfies both, and it
 * is the better shape anyway: a zone and a weekly schedule are one fact about one dealership, and
 * splitting them is how a caller ends up pairing one dealership's hours with another's zone. The
 * parameter type is declared structurally here rather than imported from `src/persistence`, so
 * this module stays free of any dependency at all beyond `src/domain`.
 */
import { durationMillis, serviceDuration } from '../domain/duration.js';
import type { ServiceTypeDuration } from '../domain/duration.js';
import { appointmentInterval, instant, occupancyInterval } from '../domain/interval.js';
import type { Instant } from '../domain/interval.js';
import { withinOpeningHours } from '../domain/openingHours.js';
import type { OpeningHoursVerdict, WeeklyOpeningHours } from '../domain/openingHours.js';

/**
 * The reference data one derivation needs. Structural, so `DealershipReference` satisfies it
 * without this module importing `src/persistence` — and narrow, so nothing else can be reached
 * from here even by accident.
 */
export interface DealershipHours {
  readonly ianaZone: string;
  readonly weekly: WeeklyOpeningHours;
}

export type Derivation =
  | {
      readonly kind: 'derived';
      readonly startsAt: Instant;
      readonly endsAt: Instant;
      /** A-4: what the exclusion constraint sees. The identity today, and that IS the buffer. */
      readonly occupancyStartsAt: Instant;
      readonly occupancyEndsAt: Instant;
    }
  | { readonly kind: 'unparsable-instant' }
  | { readonly kind: 'invalid-duration' }
  | { readonly kind: 'outside-opening-hours'; readonly verdict: OpeningHoursVerdict }
  | { readonly kind: 'reference-data-invalid'; readonly verdict: OpeningHoursVerdict };

/**
 * The two verdicts that are the SYSTEM's fault rather than the client's: a dealership whose
 * `time_zone` does not resolve and one whose `opens_at` does not parse. Both become
 * `500 /problems/internal` (OQ-02-2, closed) — a `4xx` would tell the caller to correct
 * something they did not send and cannot see.
 */
function isBrokenReferenceData(verdict: OpeningHoursVerdict): boolean {
  return verdict.kind === 'unknown-zone' || verdict.kind === 'malformed-hours';
}

export function deriveInterval(
  startsAtMillis: number,
  serviceType: ServiceTypeDuration,
  dealership: DealershipHours,
): Derivation {
  // 1. The instant, FIRST. Everything below would otherwise be handed a value that cannot be
  //    rendered — ADR-0014 is what makes an `Instant` renderable by construction, and the
  //    guarantee is worth nothing if the duration is applied before the bound is checked.
  const startsAt = instant(startsAtMillis);
  if (startsAt === null) return { kind: 'unparsable-instant' };

  // 2. The duration, SECOND and still before any arithmetic. A-1: duration is an attribute of
  //    the service type, never of the request, and `serviceDuration` is its only constructor.
  const duration = serviceDuration(serviceType);
  if (duration === null) return { kind: 'invalid-duration' };

  // 3. Minutes to milliseconds, then the interval. `appointmentInterval` takes a start and a
  //    duration and there is NO PARAMETER for an end — AC-6 structurally, not by validation.
  const interval = appointmentInterval(startsAt, durationMillis(duration));

  // 4. A-4. The identity today; a buffer changes this function and the constraint's range
  //    expression and nothing else. This is its first production call site (arc42 §11).
  const occupancy = occupancyInterval(interval);

  // 5. The opening-hours gate, LAST, on the DERIVED interval. Running it on the client's start
  //    alone would confirm a job that begins inside opening hours and ends after closing, which
  //    is the whole reason the check takes both endpoints.
  const verdict = withinOpeningHours(
    interval.startsAt,
    interval.endsAt,
    dealership.ianaZone,
    dealership.weekly,
  );
  if (verdict.kind !== 'within') {
    return isBrokenReferenceData(verdict)
      ? { kind: 'reference-data-invalid', verdict }
      : { kind: 'outside-opening-hours', verdict };
  }

  return {
    kind: 'derived',
    startsAt: interval.startsAt,
    endsAt: interval.endsAt,
    occupancyStartsAt: occupancy.startsAt,
    occupancyEndsAt: occupancy.endsAt,
  };
}
