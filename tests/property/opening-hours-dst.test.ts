import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

/**
 * QS-9 — "opening hours across a DST transition" (ADR-0001).
 *
 * AC-2  accept/reject follows the LOCAL rendering of an instant, not its UTC wall time —
 *       including on both sides of both 2026 `Europe/London` transitions.
 * AC-3  a 60-minute job starting 00:30 local on the spring-forward night ends 02:30 local:
 *       duration is added on the absolute timeline, never the wall clock.
 * AC-4  a day with no `opening_hours` row is a closed day, not an unbounded one.
 * §2.3 / literal AC-6  a reversed or non-finite endpoint pair yields `malformed-interval`.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * THE SEAM (docs/slices/01-design.md §6, ADR-0013).
 *
 * `src/domain` imports nothing, exposes no HTTP route and no SQL, and `dependency-cruiser`'s
 * `outside-in-tests-do-not-import-src` forbids this directory from importing `src/` at all —
 * literal or computed. So this file never names `src/`. It loads the COMPILED artifact,
 * `dist/domain/*.js`, the same way `npm start` loads `dist/main.js` — through a dynamic
 * import whose specifier is COMPUTED (built from a `URL`, not a string literal), because a
 * literal reference to a module that does not exist yet fails `tsc` and therefore fails
 * `verify`, which is what red-proof.mjs gates the red commit on (design §6.1).
 *
 * The load happens INSIDE a try, INSIDE each test body — never in a hook, never at module
 * top level — so "the file is not there yet" is a value this suite asserts on, not an
 * exception the runner reports. At the red commit that assertion IS the failure, and its
 * message names the missing export by name (design §8.3).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * THE ORACLE IS NOT THE IMPLEMENTATION (design §5.1).
 *
 * `localOracle` below uses ONLY `Date.UTC` / `getUTC*` arithmetic on an instant that has
 * already been shifted by a hand-written, two-constant offset table. IT NEVER CALLS `Intl`,
 * ANYWHERE IN THIS FILE'S VERIFICATION LOGIC. `openingHours.ts` under test renders local time
 * through `Intl.DateTimeFormat`; the oracle renders it through plain millisecond arithmetic.
 * If they disagree, one of them is wrong — which is what makes this a property test rather
 * than the implementation checking its own working.
 *
 *   Europe/London, 2026:  UTC+0 (GMT)  before 2026-03-29T01:00:00Z
 *                         UTC+1 (BST)  from   2026-03-29T01:00:00Z  to  2026-10-25T01:00:00Z
 *                         UTC+0 (GMT)  from   2026-10-25T01:00:00Z
 *
 * Both transition instants, and every worked pair below, are MEASURED on this runtime
 * (node v24.18.0, full ICU) — see docs/slices/01-design.md §4.3.
 *
 * `epochForLocalMidnight` (the reverse direction, local date -> instant) is safe everywhere
 * it is used in this file because it is only ever asked for local MIDNIGHT or a time close to
 * it, and both 2026 transitions happen at 01:00 local — hours away from midnight — so the
 * naive single-offset assumption never spans a transition. P4 and P6 additionally exclude the
 * two transition calendar days outright (dayIndex 87 and 297), because a local time in the
 * 01:00-01:59 band is exactly the band this design's own rule refuses to define on those two
 * days (§4.3) — this file has no business constructing it.
 */

// ─────────────────────────────────────────────────────────────── the seam: load dist/ ──

type DomainModule = Record<string, unknown> | null;

async function loadDomainModule(name: string): Promise<DomainModule> {
  const specifier = new URL(`../../dist/domain/${name}.js`, import.meta.url).href;
  try {
    return (await import(specifier)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The runtime shape assertion ADR-0013 requires in place of the compile-time contract this
 * seam gives up. Message shape is deliberate (design §8.3): "did not load, or does not
 * export" covers both failure causes with one diagnosable sentence.
 */
function assertExport<T = (...args: never[]) => unknown>(
  moduleName: string,
  mod: DomainModule,
  exportName: string,
): T {
  const value = mod ? (mod as Record<string, unknown>)[exportName] : undefined;
  expect(
    typeof value,
    `dist/domain/${moduleName}.js did not load, or does not export ${exportName}`,
  ).toBe('function');
  return value as T;
}

interface OpeningHoursVerdict {
  readonly kind: string;
  readonly [key: string]: unknown;
}

interface Domain {
  serviceDuration: (st: { durationMinutes: number }) => unknown;
  durationMillis: (d: unknown) => number;
  instant: (epochMillis: number) => unknown;
  appointmentInterval: (startsAt: unknown, durationMillis: number) => { startsAt: number; endsAt: number };
  occupancyInterval: (iv: { startsAt: number; endsAt: number }) => { startsAt: number; endsAt: number };
  withinOpeningHours: (
    startsAtMillis: number,
    endsAtMillis: number,
    ianaZone: string,
    weekly: unknown,
  ) => OpeningHoursVerdict;
}

/**
 * Loaded fresh per test body (per §6.2/§8.3's "inside a try, inside a test body"), rather
 * than memoised in module scope or a `beforeAll` — a hook failure here would be a hook error,
 * and C1 requires an assertion failure, not a hook error.
 */
async function loadDomain(): Promise<Domain> {
  const [durationMod, intervalMod, openingHoursMod] = await Promise.all([
    loadDomainModule('duration'),
    loadDomainModule('interval'),
    loadDomainModule('openingHours'),
  ]);
  return {
    serviceDuration: assertExport('duration', durationMod, 'serviceDuration'),
    durationMillis: assertExport('duration', durationMod, 'durationMillis'),
    instant: assertExport('interval', intervalMod, 'instant'),
    appointmentInterval: assertExport('interval', intervalMod, 'appointmentInterval'),
    occupancyInterval: assertExport('interval', intervalMod, 'occupancyInterval'),
    withinOpeningHours: assertExport('openingHours', openingHoursMod, 'withinOpeningHours'),
  };
}

// ───────────────────────────────────────────────────────────────── the independent oracle ──

const T_SPRING_MS = Date.parse('2026-03-29T01:00:00Z');
const T_AUTUMN_MS = Date.parse('2026-10-25T01:00:00Z');

/** The oracle's offset table. Two constants; nothing else decides GMT vs BST here. */
function oracleOffsetMinutes(epochMillis: number): number {
  return epochMillis >= T_SPRING_MS && epochMillis < T_AUTUMN_MS ? 60 : 0;
}

interface LocalRendering {
  readonly year: number;
  readonly month: number;
  readonly date: number;
  readonly dayOfWeek: number; // 0 = Sunday ... 6 = Saturday — matches getUTCDay() AND the
  // domain's DayOfWeek / opening_hours.day_of_week CHECK, with no lookup table needed here.
  readonly secondsOfDay: number;
}

/**
 * THE ORACLE. Plain `getUTC*` arithmetic on a shifted instant. No `Intl` anywhere in this
 * function or anything it calls — see the file header.
 */
function localOracle(epochMillis: number): LocalRendering {
  const shifted = new Date(epochMillis + oracleOffsetMinutes(epochMillis) * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(),
    secondsOfDay:
      shifted.getUTCHours() * 3600 + shifted.getUTCMinutes() * 60 + shifted.getUTCSeconds(),
  };
}

function sameLocalDate(a: LocalRendering, b: LocalRendering): boolean {
  return a.year === b.year && a.month === b.month && a.date === b.date;
}

/**
 * ADR-0015, added at slice 02 step 3 — the oracle's statement of the rule the domain now
 * follows. Returns the end's seconds-of-day AS MEASURED ON THE START'S LOCAL DAY, or `null`
 * when the two renderings genuinely fall on different local days.
 *
 * WHY THIS FILE CHANGED. P1 below is the only assertion in the QS-9 suite that computes
 * `within` from the local renderings itself, and it did so with `sameLocalDate` alone — which
 * is the PRE-ADR-0015 rule. `docs/adr/0015-*.md` is accepted: an end rendering as exactly
 * `00:00:00` on the local date immediately after the start's ends on the START's day, at
 * `secondsOfDay = 86400`. Leaving the old rule here would have made a correct implementation
 * of an accepted ADR fail a test the implementer is forbidden to edit — a DCR manufactured by
 * the test-engineer, over a case P1's own generator can produce (its stratum 3 walks 2026 at
 * minute granularity, and `daySlotArb` closes at 86400 roughly half the time).
 *
 * THE SUCCESSOR TEST IS A LOCAL-CALENDAR-DATE COMPARISON, NEVER EPOCH ARITHMETIC. A DST
 * transition changes the number of milliseconds in a local day, so `+ 86_400_000` would be
 * wrong on exactly the two days this file exists to examine. `Date.UTC` over the three date
 * PARTS is calendar arithmetic on a calendar date and carries no zone at all.
 *
 * The generative counterpart of the case this admits lives in
 * `tests/property/local-midnight.test.ts` (P-M1, P-M2, P-M3): this edit keeps the oracle
 * honest, and that file is where the new behaviour is asserted.
 */
function endSecondsOnStartDay(start: LocalRendering, end: LocalRendering): number | null {
  if (sameLocalDate(start, end)) return end.secondsOfDay;
  const startDay = Date.UTC(start.year, start.month, start.date);
  const endDay = Date.UTC(end.year, end.month, end.date);
  const immediatelyFollowing = endDay - startDay === 86_400_000;
  return end.secondsOfDay === 0 && immediatelyFollowing ? 86_400 : null;
}

/**
 * The reverse direction — local calendar date -> epoch instant for LOCAL MIDNIGHT — used only
 * to build test fixtures, never to verify anything. Safe because local midnight is never
 * within an hour of either 2026 transition instant (both happen at 01:00 local); see the
 * file header for why P4/P6 additionally exclude the two transition days outright.
 */
function epochForLocalMidnight(year: number, month: number, date: number): number {
  const naiveUtc = Date.UTC(year, month, date, 0, 0, 0);
  return naiveUtc - oracleOffsetMinutes(naiveUtc) * 60_000;
}

function epochForLocalTime(year: number, month: number, date: number, secondsOfDay: number): number {
  return epochForLocalMidnight(year, month, date) + secondsOfDay * 1000;
}

/** Calendar arithmetic only — `Date.UTC` day rollover, no `Intl`, no domain code. */
function calendarDateFor(dayIndex: number): { year: number; month: number; date: number; weekday: number } {
  const dt = new Date(Date.UTC(2026, 0, 1) + dayIndex * 86_400_000);
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth(),
    date: dt.getUTCDate(),
    weekday: dt.getUTCDay(),
  };
}

// 2026 calendar-day indices of the two transition days, measured from the constants above.
const SPRING_DAY_INDEX = Math.round((Date.UTC(2026, 2, 29) - Date.UTC(2026, 0, 1)) / 86_400_000);
const AUTUMN_DAY_INDEX = Math.round((Date.UTC(2026, 9, 25) - Date.UTC(2026, 0, 1)) / 86_400_000);

function formatSecondsOfDay(totalSeconds: number): string {
  if (totalSeconds === 86_400) return '24:00:00';
  const pad = (n: number): string => String(n).padStart(2, '0');
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// ──────────────────────────────────────────────────────────────────────── generators ──

/**
 * S1 — dense coverage of +/-90 minutes around each transition, both sides and the
 * discontinuity itself (design §5.3).
 */
const s1 = fc
  .tuple(fc.constantFrom(T_SPRING_MS, T_AUTUMN_MS), fc.integer({ min: -5400, max: 5400 }))
  .map(([anchor, offsetSeconds]) => anchor + offsetSeconds * 1000);

/** S2 — the days surrounding both transitions (QS-9's own phrase). */
const s2 = fc
  .tuple(
    fc.constantFrom(T_SPRING_MS, T_AUTUMN_MS),
    fc.integer({ min: -7, max: 7 }),
    fc.integer({ min: 0, max: 86_399 }),
  )
  .map(([anchor, days, seconds]) => anchor + days * 86_400_000 + seconds * 1000);

/** S3 — breadth across the whole year, minute granularity, including the long GMT/BST runs. */
const YEAR_START_MS = Date.UTC(2026, 0, 1, 0, 0, 0);
const YEAR_END_MS = Date.UTC(2026, 11, 31, 23, 59, 0);
const s3 = fc
  .integer({ min: YEAR_START_MS, max: YEAR_END_MS })
  .map((ms) => Math.floor(ms / 60_000) * 60_000);

/** The stratified instant generator: `fc.oneof` over S1-S3 (design §5.3). */
const instantArb = fc.oneof(s1, s2, s3);

const durationMinutesArb = fc.integer({ min: 1, max: 480 });

/** One day's slot: null (closed, ~1/4 of the time) or a well-formed opens/closes pair. */
const daySlotArb = fc.option(
  fc
    .tuple(fc.integer({ min: 0, max: 86_399 }), fc.integer({ min: 1, max: 86_400 }))
    .map(([opensSeconds, gap]) => ({ opensSeconds, closesSeconds: Math.min(opensSeconds + gap, 86_400) }))
    .filter(({ opensSeconds, closesSeconds }) => closesSeconds > opensSeconds),
  { nil: null, freq: 3 },
);

type DaySlot = { opensSeconds: number; closesSeconds: number } | null;

/** Seven such slots — the raw seconds the oracle compares against. */
const weeklySlotsArb = fc.tuple(
  daySlotArb,
  daySlotArb,
  daySlotArb,
  daySlotArb,
  daySlotArb,
  daySlotArb,
  daySlotArb,
) as fc.Arbitrary<readonly [DaySlot, DaySlot, DaySlot, DaySlot, DaySlot, DaySlot, DaySlot]>;

/** The same seven slots, as the `DayHours | null` strings the implementation actually takes. */
function toWeekly(slots: readonly DaySlot[]): unknown {
  return slots.map((slot) =>
    slot === null
      ? null
      : { opensAt: formatSecondsOfDay(slot.opensSeconds), closesAt: formatSecondsOfDay(slot.closesSeconds) },
  );
}

const ZONE = 'Europe/London';

const fullOpenWeek: readonly DaySlot[] = Array.from({ length: 7 }, () => ({
  opensSeconds: 0,
  closesSeconds: 86_400,
}));

function weekWithOnlyThisDayOpen(weekday: number, slot: { opensSeconds: number; closesSeconds: number }): DaySlot[] {
  const slots: DaySlot[] = new Array(7).fill(null);
  slots[weekday] = slot;
  return slots;
}

// ────────────────────────────────────────────────────────── the §5.3 coverage accumulator ──

/**
 * §5.3's non-negotiable part: the strata are a claim about what the test examined, and a
 * claim about a mechanism has to be run. Populated by the property tests below as they
 * execute (in file order — Vitest runs a file's tests sequentially by default) and asserted
 * against COMPUTED minimums, never `> 0`, in the final `describe` block.
 *
 * Why accumulate-and-assert-at-the-end rather than per-property: `malformed-interval` is
 * reachable only through P7's direct calls (never through the P1-style composition, since
 * `appointmentInterval` always produces a well-formed interval from a valid instant and a
 * positive duration) — so a coverage claim about "every verdict kind produced" is
 * necessarily a claim about the file's generative surface as a whole, not any one property.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * ONLY GENERATED VERDICTS ARE COUNTED. R-01-5, and this is the whole of the fix.
 *
 * The step-3 version incremented these counters from THREE call sites: P1's generated
 * composition, and P6 and P7's DETERMINISTIC assertions. P6 asserts `spans-local-days` on
 * every one of its 300 runs and P7 asserts `malformed-interval` on every one of its 400, so
 * both counters carried a floor-proof pedestal: `spansLocalDays >= 300` and
 * `malformedInterval >= 400` held whatever the generator did. The reviewer measured the
 * consequence — regress `durationMinutesArb` to `fc.integer({ min: 1, max: 2 })` and P1's
 * contribution collapses from ~219 to ~2 (a 2-minute job crosses local midnight with
 * probability ~2/1440) while the guard still passed on P6's 300. A floor above a pedestal
 * is not a floor; it is the `>= 1` tautology design §5.3 rules out by name, wearing a bigger
 * number.
 *
 * So `record(kind, GENERATED)` counts; `record(kind, DETERMINISTIC)` only adds to
 * `verdictKinds`. The numeric floors are then sized against P1's generated contribution
 * alone, exactly the way the other nine are, and the named regression breaks them.
 *
 * `malformedInterval` therefore counts ZERO by construction, and that is asserted rather
 * than floored — see MALFORMED_SHAPE_FLOOR for the coverage claim that replaces it.
 */
const GENERATED = true;
const DETERMINISTIC = false;

const coverage = {
  gmt: 0,
  bst: 0,
  springBefore: 0,
  springAfter: 0,
  autumnBefore: 0,
  autumnAfter: 0,
  verdictKinds: new Set<string>(),
  within: 0,
  closedDay: 0,
  outsideWindow: 0,
  spansLocalDays: 0,
  malformedInterval: 0,
  /**
   * P7's four `malformedArb` strata, classified from the sample itself. This is the
   * coverage claim `malformedInterval >= 1` was pretending to be: `malformed-interval` is
   * unreachable from the composed surface, so no floor on the VERDICT can discriminate any
   * generator at all — only a floor on the SHAPES fed to it can. Dropping any one of the
   * four arbitraries from P7's `fc.oneof` takes its counter to exactly 0, and none of the
   * four can arise incidentally from another (the classification below is a partition).
   */
  malformedShapes: { reversed: 0, nonFiniteStart: 0, nonFiniteEnd: 0, nonInteger: 0 },
};

function recordInstantCoverage(epochMillis: number): void {
  if (oracleOffsetMinutes(epochMillis) === 0) coverage.gmt++;
  else coverage.bst++;
  const dSpring = epochMillis - T_SPRING_MS;
  const dAutumn = epochMillis - T_AUTUMN_MS;
  if (dSpring > -3_600_000 && dSpring < 0) coverage.springBefore++;
  if (dSpring > 0 && dSpring < 3_600_000) coverage.springAfter++;
  if (dAutumn > -3_600_000 && dAutumn < 0) coverage.autumnBefore++;
  if (dAutumn > 0 && dAutumn < 3_600_000) coverage.autumnAfter++;
}

function recordVerdictCoverage(kind: string, generated: boolean): void {
  // The KIND SET records both, because it is a claim about what the file as a whole
  // produced and `malformed-interval` has no generated source. The COUNTERS record only
  // generated verdicts, because they are floors on a generator (see above).
  coverage.verdictKinds.add(kind);
  if (!generated) return;
  if (kind === 'within') coverage.within++;
  else if (kind === 'closed-day') coverage.closedDay++;
  else if (kind === 'outside-window') coverage.outsideWindow++;
  else if (kind === 'spans-local-days') coverage.spansLocalDays++;
  else if (kind === 'malformed-interval') coverage.malformedInterval++;
}

/**
 * Classify a P7 sample into exactly one of `malformedArb`'s four strata, from the value
 * rather than from which arbitrary produced it — a classifier that trusted the generator to
 * label itself would be the same reflexivity R-01-6 found in the marker scan.
 *
 * The four are disjoint by construction: `reversedOrEqualArb` yields two finite integers;
 * `nonFiniteFirstArb` a non-finite start; `nonFiniteSecondArb` a finite integer start and a
 * non-finite end; `nonIntegerFirstArb` a finite non-integer start. §5.3 asserts the four
 * counters sum to P7's run count, so a stratum that stopped being reachable cannot hide
 * inside another's tally.
 */
function recordMalformedShape([startsAt, endsAt]: readonly [number, number]): void {
  if (!Number.isFinite(startsAt)) coverage.malformedShapes.nonFiniteStart++;
  else if (!Number.isFinite(endsAt)) coverage.malformedShapes.nonFiniteEnd++;
  else if (!Number.isInteger(startsAt)) coverage.malformedShapes.nonInteger++;
  else coverage.malformedShapes.reversed++;
}

// Fixed seeds: determinism in CI costs nothing here, because the coverage assertions above
// are what buy the exploration, not the run-to-run randomness (design §5.3).
const SEED = 20_260_905;

// ───────────────────────────────────────────────────────── the contract (design §8.3) ──

describe('contract — the built domain artifact exports what QS-9 needs (ADR-0013 §6.2)', () => {
  it('dist/domain/duration.js exports serviceDuration and durationMillis', async () => {
    const mod = await loadDomainModule('duration');
    assertExport('duration', mod, 'serviceDuration');
    assertExport('duration', mod, 'durationMillis');
  });

  it('dist/domain/interval.js exports instant, appointmentInterval and occupancyInterval', async () => {
    const mod = await loadDomainModule('interval');
    assertExport('interval', mod, 'instant');
    assertExport('interval', mod, 'appointmentInterval');
    assertExport('interval', mod, 'occupancyInterval');
  });

  it('dist/domain/openingHours.js exports withinOpeningHours', async () => {
    const mod = await loadDomainModule('openingHours');
    assertExport('openingHours', mod, 'withinOpeningHours');
  });
});

// ────────────────────────────────────────────────────────────── AC-2's worked pair (§4.3) ──

describe('AC-2 — the worked pair, from measurement', () => {
  it('2026-03-28T08:30Z (08:30 GMT) is rejected; 2026-03-29T08:30Z (09:30 BST) is accepted, same window', async () => {
    const { withinOpeningHours } = await loadDomain();
    const weekOpen0900to1700 = toWeekly(
      Array.from({ length: 7 }, () => ({ opensSeconds: 9 * 3600, closesSeconds: 17 * 3600 })),
    );

    const before = Date.parse('2026-03-28T08:30:00Z');
    const rejected = withinOpeningHours(before, before + 60_000, ZONE, weekOpen0900to1700);
    expect(rejected.kind, 'GMT 08:30 local must not be within a 09:00-17:00 local window').not.toBe(
      'within',
    );

    const after = Date.parse('2026-03-29T08:30:00Z');
    const accepted = withinOpeningHours(after, after + 60_000, ZONE, weekOpen0900to1700);
    expect(
      accepted.kind,
      'the same UTC wall time, on the far side of spring-forward, renders 09:30 BST and must be within',
    ).toBe('within');
  });
});

describe('AC-3 — absolute duration, not wall-clock duration', () => {
  it('a 60-minute job starting 00:30 local on 2026-03-29 (spring-forward) ends at 02:30 local', async () => {
    const { serviceDuration, durationMillis, instant, appointmentInterval } = await loadDomain();
    const start = instant(Date.parse('2026-03-29T00:30:00Z'));
    expect(start, 'instant() rejected a valid integer epoch millisecond value').not.toBeNull();
    const duration = serviceDuration({ durationMinutes: 60 });
    expect(duration, 'serviceDuration() rejected a valid positive integer duration').not.toBeNull();

    const iv = appointmentInterval(start, durationMillis(duration));
    const endLocal = localOracle(iv.endsAt);
    const hh = String(Math.floor(endLocal.secondsOfDay / 3600)).padStart(2, '0');
    const mm = String(Math.floor((endLocal.secondsOfDay % 3600) / 60)).padStart(2, '0');

    expect(
      `${hh}:${mm}`,
      'sixty absolute minutes from 00:30 local on the spring-forward night must render 02:30 local',
    ).toBe('02:30');
  });
});

// ─────────────────────────────────────────────────────────────────────────────── P1 ──

describe('P1 (AC-2, QS-9) — the oracle and the domain agree on `within`, for every generated case', () => {
  it('composing the domain the way src/application will, `within` holds iff the oracle says so', async () => {
    const { serviceDuration, durationMillis, instant, appointmentInterval, withinOpeningHours } =
      await loadDomain();

    fc.assert(
      fc.property(instantArb, durationMinutesArb, weeklySlotsArb, (startMillis, durationMinutes, weeklySlots) => {
        recordInstantCoverage(startMillis);

        const duration = serviceDuration({ durationMinutes });
        expect(duration, 'serviceDuration rejected a generated positive integer duration').not.toBeNull();
        const ms = durationMillis(duration);
        const startInstant = instant(startMillis);
        expect(startInstant, 'instant() rejected a generated integer epoch millisecond value').not.toBeNull();
        const iv = appointmentInterval(startInstant, ms);

        const weekly = toWeekly(weeklySlots);
        const verdict = withinOpeningHours(iv.startsAt, iv.endsAt, ZONE, weekly);
        recordVerdictCoverage(verdict.kind, GENERATED);

        const oracleStart = localOracle(iv.startsAt);
        const oracleEnd = localOracle(iv.endsAt);
        // `dayOfWeek` is always 0..6 (getUTCDay()'s own range), so the tuple index is always
        // in bounds; the cast is only to satisfy `noUncheckedIndexedAccess` on a non-literal
        // index into a fixed-length tuple.
        const slot = weeklySlots[oracleStart.dayOfWeek] as DaySlot;
        // ADR-0015: the end's seconds-of-day is measured on the START's local day, which is
        // `null` when the interval genuinely spans two of them. See `endSecondsOnStartDay`.
        const endSeconds = endSecondsOnStartDay(oracleStart, oracleEnd);
        const expectedWithin =
          endSeconds !== null &&
          slot !== null &&
          slot.opensSeconds <= oracleStart.secondsOfDay &&
          endSeconds <= slot.closesSeconds;

        expect(verdict.kind === 'within').toBe(expectedWithin);
      }),
      { numRuns: 1800, seed: SEED },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────── P2 ──

describe('P2 (AC-3) — the derived interval is exactly `duration * 60000` milliseconds long', () => {
  it('endsAt - startsAt === durationMinutes * 60000, exactly, across both transitions', async () => {
    const { serviceDuration, durationMillis, instant, appointmentInterval } = await loadDomain();

    fc.assert(
      fc.property(instantArb, durationMinutesArb, (startMillis, durationMinutes) => {
        const duration = serviceDuration({ durationMinutes });
        expect(duration).not.toBeNull();
        const ms = durationMillis(duration);
        const startInstant = instant(startMillis);
        expect(startInstant).not.toBeNull();
        const iv = appointmentInterval(startInstant, ms);
        expect(iv.endsAt - iv.startsAt).toBe(durationMinutes * 60_000);
      }),
      { numRuns: 600, seed: SEED + 1 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────── P3 ──

describe('P3 (AC-4) — a day with no opening_hours row is rejected outright', () => {
  it('forcing the generated instant\'s local weekday closed always yields closed-day, on every generated week', async () => {
    const { serviceDuration, durationMillis, instant, appointmentInterval, withinOpeningHours } =
      await loadDomain();

    fc.assert(
      fc.property(instantArb, durationMinutesArb, weeklySlotsArb, (startMillis, durationMinutes, weeklySlots) => {
        const oracleStart = localOracle(startMillis);
        const forced = [...weeklySlots];
        forced[oracleStart.dayOfWeek] = null;

        const duration = serviceDuration({ durationMinutes });
        expect(duration).not.toBeNull();
        const startInstant = instant(startMillis);
        expect(startInstant).not.toBeNull();
        const iv = appointmentInterval(startInstant, durationMillis(duration));

        // §4.2 step 4 (spans-local-days) is checked BEFORE step 5 (closed-day). P3 only
        // claims something about the case where both endpoints share a local date — the
        // decision procedure's own order says the other case is a different property (P6).
        const oracleEnd = localOracle(iv.endsAt);
        fc.pre(sameLocalDate(oracleStart, oracleEnd));

        const verdict = withinOpeningHours(iv.startsAt, iv.endsAt, ZONE, toWeekly(forced));
        expect(verdict).toEqual({ kind: 'closed-day', dayOfWeek: oracleStart.dayOfWeek });
      }),
      { numRuns: 900, seed: SEED + 2 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────── P4 ──

describe('P4 (boundary) — an interval landing exactly on opensAt/closesAt is within; one second across the line it is not', () => {
  const p4Arb = fc
    .tuple(
      fc.integer({ min: 0, max: 364 }).filter((i) => i !== SPRING_DAY_INDEX && i !== AUTUMN_DAY_INDEX),
      fc.integer({ min: 1, max: 120 }), // durationMinutes
      fc.integer({ min: 0, max: 600 }), // slack seconds beyond the exact duration
      fc.integer({ min: 0, max: 3000 }), // opensSeconds offset, kept well after local midnight
    )
    .map(([dayIndex, durationMinutes, slack, opensOffset]) => ({
      dayIndex,
      durationMinutes,
      opensSeconds: 3600 + opensOffset,
      closesSeconds: 3600 + opensOffset + durationMinutes * 60 + slack,
    }));

  it('kills EqualityOperator mutants of `opens <= start` and `end <= closes` (design §5.2, §10)', async () => {
    const { withinOpeningHours } = await loadDomain();

    fc.assert(
      fc.property(p4Arb, ({ dayIndex, durationMinutes, opensSeconds, closesSeconds }) => {
        const { year, month, date, weekday } = calendarDateFor(dayIndex);
        const weekly = toWeekly(weekWithOnlyThisDayOpen(weekday, { opensSeconds, closesSeconds }));

        const atCloseEnd = epochForLocalTime(year, month, date, closesSeconds);
        const atCloseStart = atCloseEnd - durationMinutes * 60_000;
        expect(withinOpeningHours(atCloseStart, atCloseEnd, ZONE, weekly).kind).toBe('within');
        expect(withinOpeningHours(atCloseStart + 1000, atCloseEnd + 1000, ZONE, weekly).kind).toBe(
          'outside-window',
        );

        const atOpenStart = epochForLocalTime(year, month, date, opensSeconds);
        const atOpenEnd = atOpenStart + durationMinutes * 60_000;
        expect(withinOpeningHours(atOpenStart, atOpenEnd, ZONE, weekly).kind).toBe('within');
        expect(withinOpeningHours(atOpenStart - 1000, atOpenEnd - 1000, ZONE, weekly).kind).toBe(
          'outside-window',
        );
      }),
      { numRuns: 300, seed: SEED + 3 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────── P5 ──

describe('P5 (AC-2, "both transitions") — the fall-back ambiguous hour renders identically and verdicts agree', () => {
  it('2026-10-25T00:30Z (01:30 BST) and 2026-10-25T01:30Z (01:30 GMT) receive the same verdict', async () => {
    const { withinOpeningHours } = await loadDomain();
    const T1 = Date.parse('2026-10-25T00:30:00Z');
    const T2 = Date.parse('2026-10-25T01:30:00Z');
    expect(T2 - T1).toBe(3_600_000);

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 29 }), // kept < 30 minutes so BOTH endpoints of BOTH
        // intervals stay on their respective sides of T_AUTUMN — see the file header's
        // reasoning: T1 and T1+d land before the transition, T2 and T2+d land after it,
        // by exactly the same construction that makes T1 and T2 render identically.
        weeklySlotsArb,
        (durationMinutes, weeklySlots) => {
          const weekly = toWeekly(weeklySlots);
          const end1 = T1 + durationMinutes * 60_000;
          const end2 = T2 + durationMinutes * 60_000;

          const local1 = localOracle(T1);
          const local2 = localOracle(T2);
          expect(local1).toEqual(local2); // the "renders identically" half of P5

          const verdict1 = withinOpeningHours(T1, end1, ZONE, weekly);
          const verdict2 = withinOpeningHours(T2, end2, ZONE, weekly);
          expect(verdict2).toEqual(verdict1); // the "same verdict" half of P5
        },
      ),
      { numRuns: 300, seed: SEED + 4 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────── P6 ──

describe('P6 (§8.3) — an interval crossing local midnight is spans-local-days; one hour earlier it is not', () => {
  const p6Arb = fc.tuple(
    fc.integer({ min: 0, max: 364 }).filter((i) => i !== SPRING_DAY_INDEX && i !== AUTUMN_DAY_INDEX),
    fc.integer({ min: 31, max: 89 }), // crosses midnight from 23:30; one hour earlier (22:30)
    // plus this duration never does — see the arithmetic in the file header comment block.
  );

  it('crossing local midnight is spans-local-days; the equivalent interval one hour earlier is not', async () => {
    const { withinOpeningHours } = await loadDomain();
    const weekly = toWeekly(fullOpenWeek); // open every day, all day — isolates midnight-crossing

    fc.assert(
      fc.property(p6Arb, ([dayIndex, durationMinutes]) => {
        const { year, month, date } = calendarDateFor(dayIndex);

        const crossingStart = epochForLocalTime(year, month, date, 23 * 3600 + 30 * 60); // 23:30
        const crossingEnd = crossingStart + durationMinutes * 60_000;
        const crossingVerdict = withinOpeningHours(crossingStart, crossingEnd, ZONE, weekly);
        expect(crossingVerdict.kind).toBe('spans-local-days');
        recordVerdictCoverage(crossingVerdict.kind, DETERMINISTIC);

        const earlierStart = crossingStart - 3_600_000; // 22:30, same local day
        const earlierEnd = earlierStart + durationMinutes * 60_000;
        const earlierVerdict = withinOpeningHours(earlierStart, earlierEnd, ZONE, weekly);
        expect(earlierVerdict.kind).not.toBe('spans-local-days');
      }),
      { numRuns: 300, seed: SEED + 5 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────── P7 ──

/**
 * Named because §5.3 asserts that the four `malformedArb` strata PARTITION this many
 * samples. A literal in both places is a drift waiting to happen, and the partition
 * assertion is the thing that stops a stratum going quiet inside another's tally.
 */
const P7_RUNS = 400;

describe('P7 (§2.3, literal AC-6) — a reversed or non-finite endpoint pair yields malformed-interval', () => {
  const weekly = toWeekly(fullOpenWeek);

  const reversedOrEqualArb = fc
    .tuple(fc.integer(), fc.integer())
    .filter(([a, b]) => b <= a);
  const nonFiniteFirstArb = fc
    .tuple(fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY), fc.integer())
    .map(([a, b]) => [a, b] as [number, number]);
  const nonFiniteSecondArb = fc
    .tuple(fc.integer(), fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY))
    .map(([a, b]) => [a, b] as [number, number]);
  const nonIntegerFirstArb = fc
    .tuple(
      fc.double({ noNaN: true, noDefaultInfinity: true }).filter((n) => !Number.isInteger(n)),
      fc.integer(),
    )
    .map(([a, b]) => [a, Math.max(b, Math.ceil(a) + 1)] as [number, number]);

  const malformedArb: fc.Arbitrary<[number, number]> = fc.oneof(
    reversedOrEqualArb,
    nonFiniteFirstArb,
    nonFiniteSecondArb,
    nonIntegerFirstArb,
  );

  it('every malformed pair yields malformed-interval', async () => {
    const { withinOpeningHours } = await loadDomain();
    fc.assert(
      fc.property(malformedArb, ([startsAtMillis, endsAtMillis]) => {
        const verdict = withinOpeningHours(startsAtMillis, endsAtMillis, ZONE, weekly);
        expect(verdict.kind).toBe('malformed-interval');
        recordVerdictCoverage(verdict.kind, DETERMINISTIC);
        recordMalformedShape([startsAtMillis, endsAtMillis]);
      }),
      { numRuns: P7_RUNS, seed: SEED + 6 },
    );
  });

  it('a well-formed pair never yields malformed-interval', async () => {
    const { withinOpeningHours } = await loadDomain();
    const wellFormedArb = fc
      .tuple(instantArb, durationMinutesArb)
      .map(([s, d]): [number, number] => [s, s + d * 60_000]);

    fc.assert(
      fc.property(wellFormedArb, ([startsAtMillis, endsAtMillis]) => {
        const verdict = withinOpeningHours(startsAtMillis, endsAtMillis, ZONE, weekly);
        expect(verdict.kind).not.toBe('malformed-interval');
      }),
      { numRuns: 300, seed: SEED + 7 },
    );
  });
});

// ───────────────────────────────────────────────────────────── A-4's named seam, exercised ──

describe('occupancyInterval — the identity today (A-4, design §2.2/§9.2)', () => {
  it('is called here, because nothing else in this slice calls it, and returns its argument unchanged', async () => {
    const { instant, appointmentInterval, occupancyInterval } = await loadDomain();

    fc.assert(
      fc.property(instantArb, durationMinutesArb, (startMillis, durationMinutes) => {
        const startInstant = instant(startMillis);
        expect(startInstant).not.toBeNull();
        const iv = appointmentInterval(startInstant, durationMinutes * 60_000);
        const occ = occupancyInterval(iv);
        expect(occ).toEqual({ startsAt: iv.startsAt, endsAt: iv.endsAt });
      }),
      { numRuns: 200, seed: SEED + 8 },
    );
  });
});

// ──────────────────────────────────────────────────────────── §5.3 coverage guard ──

/**
 * COMPUTED minimums, not `> 0` (design §5.3, §13 — a bare `> 0` floor was measured to pass
 * ~29% of the time under a deliberately broken stratified generator, which the design
 * records as a defect in itself, not a refinement).
 *
 * These floors were sized empirically against THIS file's own strata, the same way: 200
 * simulated trials of the healthy generator (S1, S2, S3 all live) against 200 trials of a
 * DELIBERATELY BROKEN one (S1 — the stratum responsible for near-transition density —
 * knocked out of the `oneof`, leaving only S2 and S3 to contribute by incidental overlap):
 *
 *   near-transition counters, N=1800: broken max observed 18   healthy min observed 74
 *   verdict-kind counters,    N=1800: within min 157   closed-day min 477   outside-window
 *                                     min 814   spans-local-days min 196 (all over 100 trials)
 *
 * NEAR_TRANSITION_FLOOR = 40 sits with >2x margin above the broken maximum and comfortably
 * below the healthy minimum on 200 trials each — i.e. it fails reliably when S1 contributes
 * nothing, and passes reliably when it does. VERDICT_FLOOR = 50 and OFFSET_FLOOR = 150 use
 * the same reasoning against their own measured ranges above.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * R-01-5 — the two floors that were NOT sized this way, and now are.
 *
 * `spansLocalDays >= 1` and `malformedInterval >= 1` were tautologies: P6 and P7 increment
 * those two counters from DETERMINISTIC assertions, 300 and 400 times, so both held at >= 300
 * regardless of the generator. The counters now record generated verdicts only (see the
 * accumulator's comment), and the two floors are sized against measured healthy-versus-broken
 * ranges like the other nine. Both mutants were run.
 *
 *   SPANS_LOCAL_DAYS_FLOOR — mutant: `durationMinutesArb` regressed to
 *   `fc.integer({ min: 1, max: 2 })`, the reviewer's named regression (a 2-minute job crosses
 *   local midnight with probability ~2/1440). 100 trials each, P1 at N=1800:
 *
 *       healthy  min 197  max 268          broken  min 15  max 36
 *
 *   100 is 2.8x the broken maximum and about half the healthy minimum, which is the
 *   NEAR_TRANSITION_FLOOR shape. VERDICT_FLOOR (50) was rejected for this counter: it is only
 *   1.4x the broken maximum, so it would pass under the very regression it has to catch —
 *   which is the whole finding, at a larger number.
 *
 *   MALFORMED_SHAPE_FLOOR — and this one required changing WHAT is floored, because no
 *   sizing of the old counter could work. Measured: `malformed-interval` is produced by P7
 *   and by nothing else — P1's composed surface yields it exactly 0 times in 100 trials,
 *   necessarily, because `appointmentInterval` on a valid instant and a positive duration is
 *   well-formed by construction (P7's second case asserts precisely that). So the generated
 *   count is a CONSTANT ZERO and no floor on it discriminates any generator; the tautology
 *   was structural, not a number chosen too low. What can discriminate is the shape mix P7
 *   feeds in, so the floor moved onto `malformedArb`'s four strata. Mutants: each of
 *   `reversedOrEqualArb`, `nonFiniteFirstArb`, `nonFiniteSecondArb` and `nonIntegerFirstArb`
 *   dropped from the `fc.oneof`, in turn. 100 healthy trials, 5 per drop:
 *
 *       healthy  min 74 (reversed) / 81 / 82 / 78   max 125
 *       broken   the dropped stratum's counter is exactly 0, every trial, and the other
 *                three rise to ~133 rather than absorbing it
 *
 *   40 is about half the healthy minimum and unreachable when a stratum is gone. The
 *   partition assertion below is the other half: the four must sum to P7_RUNS, so a stratum
 *   cannot go quiet by being misclassified into a sibling.
 */
const NEAR_TRANSITION_FLOOR = 40;
const VERDICT_FLOOR = 50;
const OFFSET_FLOOR = 150;
const SPANS_LOCAL_DAYS_FLOOR = 100;
const MALFORMED_SHAPE_FLOOR = 40;

describe('§5.3 — the generator is shown to have reached what P1-P7 claim, not merely to exist', () => {
  it('both UTC offsets, all four near-transition windows, and every verdict kind were actually produced', () => {
    expect(coverage.gmt, 'GMT (UTC+0) instants observed across the file').toBeGreaterThanOrEqual(
      OFFSET_FLOOR,
    );
    expect(coverage.bst, 'BST (UTC+1) instants observed across the file').toBeGreaterThanOrEqual(
      OFFSET_FLOOR,
    );

    expect(coverage.springBefore, 'samples strictly within 1h BEFORE spring-forward').toBeGreaterThanOrEqual(
      NEAR_TRANSITION_FLOOR,
    );
    expect(coverage.springAfter, 'samples strictly within 1h AFTER spring-forward').toBeGreaterThanOrEqual(
      NEAR_TRANSITION_FLOOR,
    );
    expect(coverage.autumnBefore, 'samples strictly within 1h BEFORE fall-back').toBeGreaterThanOrEqual(
      NEAR_TRANSITION_FLOOR,
    );
    expect(coverage.autumnAfter, 'samples strictly within 1h AFTER fall-back').toBeGreaterThanOrEqual(
      NEAR_TRANSITION_FLOOR,
    );

    expect(coverage.within, '`within` verdicts produced').toBeGreaterThanOrEqual(VERDICT_FLOOR);
    expect(coverage.closedDay, '`closed-day` verdicts produced').toBeGreaterThanOrEqual(VERDICT_FLOOR);
    expect(coverage.outsideWindow, '`outside-window` verdicts produced').toBeGreaterThanOrEqual(
      VERDICT_FLOOR,
    );
    expect(
      coverage.spansLocalDays,
      '`spans-local-days` verdicts produced BY THE GENERATOR — P6 asserts this kind 300 ' +
        'times deterministically and no longer counts towards the floor. Regress ' +
        '`durationMinutesArb` to fc.integer({ min: 1, max: 2 }) and this drops to 15-36.',
    ).toBeGreaterThanOrEqual(SPANS_LOCAL_DAYS_FLOOR);

    // `malformed-interval` is UNREACHABLE from the composed surface, and that is asserted
    // rather than assumed: it is what makes a floor on the generated count impossible and
    // the shape floors below necessary. It is also P7's second case ("a well-formed pair
    // never yields malformed-interval") restated over 1800 independent samples.
    expect(
      coverage.malformedInterval,
      'the P1 composition must never produce malformed-interval; if it can, the shape ' +
        'floors below are measuring the wrong thing',
    ).toBe(0);
  });

  it("P7's four malformed strata each reached the implementation, and they partition its samples", () => {
    const shapes = coverage.malformedShapes;

    expect(shapes.reversed, 'reversed or equal endpoints, both finite integers').toBeGreaterThanOrEqual(
      MALFORMED_SHAPE_FLOOR,
    );
    expect(shapes.nonFiniteStart, 'NaN or +/-Infinity as the START').toBeGreaterThanOrEqual(
      MALFORMED_SHAPE_FLOOR,
    );
    expect(shapes.nonFiniteEnd, 'NaN or +/-Infinity as the END').toBeGreaterThanOrEqual(
      MALFORMED_SHAPE_FLOOR,
    );
    expect(shapes.nonInteger, 'a finite non-integer START').toBeGreaterThanOrEqual(
      MALFORMED_SHAPE_FLOOR,
    );

    // Drop one arbitrary from P7's `fc.oneof` and its counter goes to 0 while the others
    // rise — so without this, three floors of 40 would still be met by a three-stratum
    // generator producing 133 of each. The sum is what makes each floor a claim about ITS
    // OWN stratum rather than about the total.
    expect(
      shapes.reversed + shapes.nonFiniteStart + shapes.nonFiniteEnd + shapes.nonInteger,
      'the four strata must partition every sample P7 ran',
    ).toBe(P7_RUNS);
  });

  it('every OpeningHoursVerdict kind was produced somewhere in the file', () => {
    expect(
      [...coverage.verdictKinds].sort(),
      'every OpeningHoursVerdict kind must have been produced at least once. This set ' +
        'records deterministic verdicts too, because `malformed-interval` has no generated ' +
        'source — see the accumulator comment.',
    ).toEqual(['closed-day', 'malformed-interval', 'outside-window', 'spans-local-days', 'within']);
  });
});
