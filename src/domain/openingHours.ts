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

/**
 * ADR-0014, applied here as well as in `instant()` — and this is a consequence of the literal
 * AC-6 ruling rather than belt-and-braces. This module may not import `Interval`, so "my caller
 * used `instant()`" is uncheckable from inside it; without the bound, step 3 hands an
 * unrenderable value to `formatToParts` and a PURE FUNCTION THROWS `RangeError`.
 *
 * The literal is written twice on purpose (D-01-2, ADR-0014's "Bad, or deferred", arc42 §11):
 * `domain-is-pure` has no allowlist, so there is no module either file may import it from.
 */
const MAX_RENDERABLE_EPOCH_MILLIS = 8_640_000_000_000_000;

// ─────────────────────────────────────────────────────────────── §3.2: parsing `time` ──

/**
 * `HH:MM` or `HH:MM:SS`, `00:00:00`-`23:59:59` plus the single exact value `24:00:00`
 * (normalised to 86400 seconds-of-day). Narrower than "hours 00-24": measured against a real
 * `postgres:16-alpine`, `'24:00:00'::time` round-trips but `24:00:01` and `24:30:00` are
 * rejected by PostgreSQL itself, so nothing else in this range can ever reach this parser.
 * `null` on anything else. Fail closed: a booking gate that cannot read its own configuration
 * must refuse rather than guess.
 */
function parseTimeToSeconds(raw: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (match === null) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);

  if (hours === 24 && minutes === 0 && seconds === 0) return 86_400;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

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

/**
 * The local calendar date immediately following `localDate`, as the same `YYYY-MM-DD` string
 * `renderLocal` produces. ADR-0015: **"immediately following" is a CALENDAR-DATE SUCCESSOR
 * TEST, not epoch arithmetic** — a DST transition changes how many milliseconds a local day
 * holds, and this function's entire subject is DST.
 *
 * Month and year rollover are delegated to `Date.UTC`, exactly as §4.1 delegates the day of week
 * to `Intl` rather than hand-rolling a calendar: a second calendar implementation inside the one
 * module that must not be subtly wrong is the risk this design rejects. `Date.UTC` is used only
 * as an arithmetic-free date successor here; no instant, zone or wall clock is derived from it.
 *
 * Returns `''` — a value no rendering can equal — for anything it cannot advance. Two residues,
 * named rather than promised away, and both fail CLOSED (the interval stays `spans-local-days`,
 * which is a refusal):
 *
 *  - a date beyond `Date`'s own range, which `Math.abs(...) <= MAX_RENDERABLE_EPOCH_MILLIS` at
 *    step 1 already makes unreachable from a bounded interval;
 *  - a BC date. `Intl` with no `era` renders year 271822 BC as `"271822"`, so the successor
 *    computed here counts the wrong way. The comparison is still total and still refuses.
 */
function nextLocalDate(localDate: string): string {
  const match = /^(\d+)-(\d{2})-(\d{2})$/.exec(localDate);
  if (match === null) return '';

  // `setUTCFullYear` rather than `Date.UTC`, which maps years 0-99 onto 1900-1999.
  const next = new Date(0);
  next.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1);
  const year = next.getUTCFullYear();
  if (!Number.isFinite(year)) return '';

  const pad = (value: number, width: number): string => String(value).padStart(width, '0');
  return `${pad(year, 4)}-${pad(next.getUTCMonth() + 1, 2)}-${pad(next.getUTCDate(), 2)}`;
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
  //
  // The RENDERABLE BOUND (ADR-0014, AC-16) is part of this step and returns the EXISTING
  // `malformed-interval`: ADR-0014 is explicit that no new verdict variant is introduced.
  if (
    !Number.isInteger(startsAtMillis) ||
    !Number.isInteger(endsAtMillis) ||
    Math.abs(startsAtMillis) > MAX_RENDERABLE_EPOCH_MILLIS ||
    Math.abs(endsAtMillis) > MAX_RENDERABLE_EPOCH_MILLIS ||
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
  //
  // ADR-0015, before the `startsOn !== endsOn` comparison: an end rendering as EXACTLY
  // `00:00:00` AND on the local date IMMEDIATELY FOLLOWING the start's is the CLOSE of the
  // start's day, not the opening of the next one, so it is `secondsOfDay = 86400` on the
  // start's day. Step 7 then compares 86400 <= 86400 for a dealership closing at '24:00:00'
  // (within, AC-17) and 86400 <= 61200 for one closing at 17:00 (outside-window, and for the
  // right reason). Nothing downstream changes.
  //
  // BOTH CLAUSES ARE LOAD-BEARING and each is killed by a different case:
  //   - drop `secondsOfDay === 0` and a 23:00-01:00 crossing normalises to midnight and is
  //     accepted — AC-18 catches it;
  //   - drop the successor test and a 49-hour interval ending at local midnight two days later
  //     normalises into the start's day and is silently accepted — AC-18 cannot see that,
  //     because AC-18's end IS on the immediately following day. P-M2 catches it.
  const endsAtLocalMidnight =
    end.secondsOfDay === 0 && end.localDate === nextLocalDate(start.localDate);
  const endSecondsOfDay = endsAtLocalMidnight ? 86_400 : end.secondsOfDay;

  if (!endsAtLocalMidnight && start.localDate !== end.localDate) {
    return { kind: 'spans-local-days', startsOn: start.localDate, endsOn: end.localDate };
  }

  // 5. A day with no row is a closed day, not an unbounded one (AC-4).
  const hours = weekly[start.dayOfWeek];
  if (hours === null) {
    return { kind: 'closed-day', dayOfWeek: start.dayOfWeek };
  }

  // 6. Parse opensAt/closesAt; a gate that cannot read its own configuration must refuse.
  const opensSeconds = parseTimeToSeconds(hours.opensAt);
  const closesSeconds = parseTimeToSeconds(hours.closesAt);
  if (opensSeconds === null || closesSeconds === null || !(opensSeconds < closesSeconds)) {
    return { kind: 'malformed-hours', dayOfWeek: start.dayOfWeek };
  }

  // 7. Inclusive on closesAt: a job ending exactly at closing time is within opening hours.
  // `endSecondsOfDay` is step 4's normalisation, not `end.secondsOfDay` — see ADR-0015.
  if (opensSeconds <= start.secondsOfDay && endSecondsOfDay <= closesSeconds) {
    return { kind: 'within' };
  }

  return {
    kind: 'outside-window',
    dayOfWeek: start.dayOfWeek,
    opensAt: hours.opensAt,
    closesAt: hours.closesAt,
  };
}
