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

/** THE ONLY CONSTRUCTOR. Returns null for NaN, Infinity, or a non-integer millisecond value. */
export function instant(epochMillis: number): Instant | null {
  return Number.isInteger(epochMillis) ? (epochMillis as Instant) : null;
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
