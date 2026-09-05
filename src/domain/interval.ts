/**
 * Which instants an appointment occupies, and which of those the exclusion constraint sees.
 *
 * NO IMPORTS. Not even from `./duration.js` — AC-6 is literal
 * (docs/slices/01-design.md §2.0). `appointmentInterval`'s duration parameter is therefore a
 * bare millisecond count rather than a branded `DurationMinutes`; the caller converts first
 * (`src/application`, which may import both `duration.ts` and this module).
 */

/** An instant, as epoch milliseconds (A-8). Branded; the constructor is the only way in. */
export type Instant = number & { readonly __brand: 'Instant' };

/**
 * The largest magnitude `new Date(ms).toISOString()` can render. ADR-0014, measured:
 * `new Date(8_640_000_000_000_000).toISOString()` is `+275760-09-13T00:00:00.000Z`, and one
 * millisecond further throws `RangeError: Invalid time value`.
 *
 * D-01-2, cashing in: the same literal is written again in `openingHours.ts`, because under the
 * literal AC-6 ruling no domain module may import another and there is no mechanism to share it.
 * That duplication is ADR-0014's own "Bad, or deferred" and arc42 §11 carries it — it is not an
 * oversight to be tidied away here.
 */
const MAX_RENDERABLE_EPOCH_MILLIS = 8_640_000_000_000_000;

/**
 * THE ONLY CONSTRUCTOR. Returns null for NaN, Infinity, a non-integer millisecond value, or a
 * value outside the renderable bound.
 *
 * ADR-0014: **an `Instant` is renderable by construction.** The bound is INCLUSIVE — `<=`, not
 * `<` — and `Math.abs` is what makes it symmetric, so a value beyond the NEGATIVE bound is
 * refused for the same reason as one beyond the positive.
 */
export function instant(epochMillis: number): Instant | null {
  return Number.isInteger(epochMillis) && Math.abs(epochMillis) <= MAX_RENDERABLE_EPOCH_MILLIS
    ? (epochMillis as Instant)
    : null;
}

/** Half-open [startsAt, endsAt), matching the tstzrange the constraint compares (§8.2). */
export type Interval = { readonly startsAt: Instant; readonly endsAt: Instant };

/**
 * AC-1 / A-1. TOTAL. The end is derived from an absolute duration in milliseconds; no
 * client-supplied end is consulted and there is no parameter for one.
 */
export function appointmentInterval(startsAt: Instant, durationMillis: number): Interval {
  return { startsAt, endsAt: (startsAt + durationMillis) as Instant };
}

/**
 * A-4 — "the interval the constraint sees". TODAY THE IDENTITY, and that identity IS the
 * statement that there is no buffer. A buffer changes this function and the constraint's
 * range expression, and nothing else.
 */
export function occupancyInterval(interval: Interval): Interval {
  return interval;
}
