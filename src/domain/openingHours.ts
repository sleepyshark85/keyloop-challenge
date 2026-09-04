/**
 * Whether an interval lies within a dealership's opening hours — the only wall clock in the
 * system (ADR-0001, AC-5).
 *
 * NO IMPORTS. Not even the `Interval` type — AC-6 is literal
 * (docs/slices/01-design.md §2.0), so the interval arrives as its two endpoints. `Intl` is a
 * global, not an import: `dependency-cruiser` has no module specifier to record, and it opens
 * no socket and consults no database, so GC-1 (the core must never learn what is booked) is
 * untouched.
 *
 * THE RULE, stated once (§4.1): convert instant -> local wall clock, never the reverse. Render
 * both endpoints of the interval in the dealership's zone, then compare wall clock against
 * that local day's window. This direction is total and single-valued — every instant has
 * exactly one rendering in a zone — where the reverse direction is neither (a spring-forward
 * local time can not exist; a fall-back local time can occur twice).
 */

/** 0 = Sunday, mirroring opening_hours.day_of_week CHECK (day_of_week BETWEEN 0 AND 6). */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The raw PostgreSQL `time` values, unparsed. This module owns the parse (§3.2). */
export type DayHours = { readonly opensAt: string; readonly closesAt: string };

/** Seven slots, one per day, indexed by DayOfWeek. `null` IS a closed day (AC-4). */
export type WeeklyOpeningHours = readonly [
  DayHours | null,
  DayHours | null,
  DayHours | null,
  DayHours | null,
  DayHours | null,
  DayHours | null,
  DayHours | null,
];

export type OpeningHoursVerdict =
  | { readonly kind: 'within' }
  | { readonly kind: 'closed-day'; readonly dayOfWeek: DayOfWeek }
  | {
      readonly kind: 'outside-window';
      readonly dayOfWeek: DayOfWeek;
      readonly opensAt: string;
      readonly closesAt: string;
    }
  | { readonly kind: 'spans-local-days'; readonly startsOn: string; readonly endsOn: string }
  | { readonly kind: 'unknown-zone'; readonly ianaZone: string }
  | { readonly kind: 'malformed-hours'; readonly dayOfWeek: DayOfWeek }
  // Exists only because the literal AC-6 ruling took `Interval` out of this module's reach:
  // a pair of bare numbers cannot carry "ordered, and from the same interval" the way the
  // type used to (§2.3).
  | { readonly kind: 'malformed-interval' };

// ───────────────────────────────────────────────────────────── §4.1: the local rendering ──

const WEEKDAY_INDEX: { readonly [abbrev: string]: DayOfWeek } = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

interface LocalRendering {
  readonly localDate: string; // "YYYY-MM-DD", compared for equality only — never parsed further.
  readonly dayOfWeek: DayOfWeek;
  readonly secondsOfDay: number;
}

/**
 * One formatter per call, locale pinned to `'en-US'` (never `undefined` — a pure function must
 * not depend on the host's default locale) and `hourCycle: 'h23'` rather than `hour12: false`,
 * which has historically rendered midnight as `24`. Throws `RangeError` on an invalid zone;
 * the caller wraps the construction.
 */
function buildFormatter(ianaZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ianaZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}

/** Day of week comes from the `weekday` part through an explicit seven-entry lookup, never
 * hand-rolled calendar arithmetic (§4.1) — a second calendar implementation inside the one
 * module that must not be subtly wrong is exactly the risk this design rejects. */
function renderLocal(epochMillis: number, formatter: Intl.DateTimeFormat): LocalRendering {
  const parts = formatter.formatToParts(new Date(epochMillis));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';

  const weekday = get('weekday');
  const dayOfWeek = WEEKDAY_INDEX[weekday] as DayOfWeek; // guaranteed by the fixed `weekday: 'short'` option.

  return {
    localDate: `${get('year')}-${get('month')}-${get('day')}`,
    dayOfWeek,
    secondsOfDay: Number(get('hour')) * 3600 + Number(get('minute')) * 60 + Number(get('second')),
  };
}

// ───────────────────────────────────────────────────── §4.2: the decision procedure ──

/**
 * ADR-0001 / GC-1. Reads reference data about one dealership and nothing about any booking.
 *
 * Takes two bare millisecond values rather than an `Interval`, because this module may not
 * import `interval.ts`. An `Instant` is assignable to `number`, so a caller holding an
 * `Interval` passes `iv.startsAt, iv.endsAt` directly.
 *
 * The order below is part of the design (§4.2): a mutant that reorders these checks is only
 * killable if the order is asserted, and it is — see tests/unit/domain/openingHours.test.ts.
 *
 * Steps 5-7 (closed-day / malformed-hours / within-window) land in the next commit; this one
 * carries steps 1-4, which is everything that does not yet consult `weekly` at all.
 */
export function withinOpeningHours(
  startsAtMillis: number,
  endsAtMillis: number,
  ianaZone: string,
  weekly: WeeklyOpeningHours,
): OpeningHoursVerdict {
  // 1. Pure arithmetic, first: everything after this would otherwise be handed a value
  // `new Date(...)` cannot render, and a pure function must not throw. Exists only because
  // of the literal AC-6 ruling — the `Interval` type used to make this unrepresentable.
  if (
    !Number.isInteger(startsAtMillis) ||
    !Number.isInteger(endsAtMillis) ||
    !(endsAtMillis > startsAtMillis)
  ) {
    return { kind: 'malformed-interval' };
  }

  // 2. An invalid zone throws RangeError at construction; a pure domain function must not
  // throw, so the construction is wrapped.
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = buildFormatter(ianaZone);
  } catch {
    return { kind: 'unknown-zone', ianaZone };
  }

  // 3. Render both endpoints.
  const start = renderLocal(startsAtMillis, formatter);
  const end = renderLocal(endsAtMillis, formatter);

  // 4. Both endpoints must fall within one day's opening hours — no weekly schedule can
  // contain an interval crossing local midnight.
  if (start.localDate !== end.localDate) {
    return { kind: 'spans-local-days', startsOn: start.localDate, endsOn: end.localDate };
  }

  void weekly;
  return { kind: 'within' };
}
