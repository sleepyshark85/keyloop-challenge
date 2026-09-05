import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { everyDay, exported, loadDomainModule, missingExport } from '../support/domain.js';
import type { WeeklyOpeningHours } from '../support/domain.js';

/**
 * AC-17 and AC-18 — ADR-0015, an interval ending at local midnight ends on the day it started.
 *
 * `docs/adr/0015-an-interval-ending-at-local-midnight-does-not-span-two-days.md` ·
 * `docs/slices/02-design.md` §6.2 · arc42 §8.3 · QS-9.
 *
 *   AC-17  a dealership open 09:00-24:00 local and a 60-minute job starting 23:00 local:
 *          the verdict is `within`, not `spans-local-days`
 *   AC-18  an interval that GENUINELY spans two local days — 23:00 to 01:00 — is still
 *          `spans-local-days`. The negative control: AC-17 alone is satisfied by DELETING
 *          the check
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * BOTH CLAUSES OF ADR-0015 ARE LOAD-BEARING, AND EACH HAS ITS OWN CASE HERE.
 *
 * The rule is: an end rendering as exactly `00:00:00` **and** on the local date IMMEDIATELY
 * FOLLOWING the start's local date is treated as `secondsOfDay = 86400` on the start's day.
 * Design §6.2 names the mutants, and this file is written around them:
 *
 *   | mutant                                              | killed only by |
 *   |---|---|
 *   | delete the whole step-4 normalisation               | AC-17 (P-M1)   |
 *   | delete the "immediately following" clause,          | P-M2 — a >24h interval ending at
 *   |   keeping the `00:00:00` test                       |   local midnight. NOT by AC-17 |
 *   | delete step 4 entirely                              | AC-18 (P-M3)   |
 *
 * P-M2 is the case a reader is most likely to think redundant and it is the only one that
 * catches the half-implementation: without the successor test, a 48-hour interval ending at
 * midnight two days later normalises into the start's day and is SILENTLY ACCEPTED.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE SUCCESSOR TEST IS A LOCAL-CALENDAR-DATE COMPARISON, NEVER EPOCH ARITHMETIC — and this
 * file's fixtures are built the same way, which is why they are trustworthy on the two days
 * that matter. A DST transition changes the number of milliseconds in a local day (2026-03-29
 * is 23 hours long in `Europe/London`, 2026-10-25 is 25), and this function's entire subject
 * is DST. So `localMidnight` below goes CALENDAR DATE -> instant through a two-constant
 * offset table, never instant + 86_400_000.
 *
 * Both transition days are sampled explicitly rather than left to the generator, which is
 * design §7's "including across a DST boundary" made executable.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * AT THE RED COMMIT (process criterion C1).
 *
 *   AC-17 / P-M1   RED as an assertion: today's step 4 renders the end on the next local
 *                  date and returns `spans-local-days` where `within` is expected.
 *   AC-18 / P-M3   GREEN, and deliberately. It is the negative control — it asserts the
 *                  behaviour ADR-0015 must NOT change, and a control that is red before the
 *                  work is a control that is testing the work rather than guarding it.
 *   P-M2           GREEN for the same reason: today's code refuses the >24h case, and so
 *                  must tomorrow's. It exists to fail against a HALF-implemented ADR-0015,
 *                  which is a state that does not exist yet.
 *
 * Nothing loads at module scope: `dist/domain/openingHours.js` is reached inside each test
 * body through ADR-0013's computed specifier (`tests/support/domain.ts`).
 */

const ZONE = 'Europe/London';
const SEED = 20_260_907;

/**
 * `Europe/London` in 2026, measured on this runtime and recorded in arc42 §8.3:
 *   UTC+0 (GMT) before 2026-03-29T01:00:00Z
 *   UTC+1 (BST) from   2026-03-29T01:00:00Z to 2026-10-25T01:00:00Z
 *   UTC+0 (GMT) from   2026-10-25T01:00:00Z
 */
const T_SPRING_MS = Date.parse('2026-03-29T01:00:00Z');
const T_AUTUMN_MS = Date.parse('2026-10-25T01:00:00Z');

function offsetMinutesAt(epochMillis: number): number {
  return epochMillis >= T_SPRING_MS && epochMillis < T_AUTUMN_MS ? 60 : 0;
}

/**
 * Local midnight of a calendar date, as an instant. Fixture construction only — nothing here
 * VERIFIES anything, so the naive single-offset assumption is safe: both 2026 transitions
 * happen at 01:00 local, an hour away from midnight, so no local midnight in 2026 falls
 * inside a transition's ambiguous or absent band.
 */
function localMidnight(year: number, month: number, date: number): number {
  const naiveUtc = Date.UTC(year, month, date, 0, 0, 0);
  return naiveUtc - offsetMinutesAt(naiveUtc) * 60_000;
}

/** Day `index` of 2026 as a calendar date. Index 0 is 1 January. */
function dateOf2026(index: number): { year: number; month: number; date: number } {
  const d = new Date(Date.UTC(2026, 0, 1 + index));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate() };
}

/** 2026-03-29 and 2026-10-25 as day indexes, so the generator can be shown to include them. */
const SPRING_DAY_INDEX = Math.round((Date.UTC(2026, 2, 29) - Date.UTC(2026, 0, 1)) / 86_400_000);
const AUTUMN_DAY_INDEX = Math.round((Date.UTC(2026, 9, 25) - Date.UTC(2026, 0, 1)) / 86_400_000);

const OPEN_LATE: WeeklyOpeningHours = everyDay({ opensAt: '09:00:00', closesAt: '24:00:00' });
const OPEN_ALWAYS: WeeklyOpeningHours = everyDay({ opensAt: '00:00:00', closesAt: '24:00:00' });

type WithinOpeningHours = (
  startsAtMillis: number,
  endsAtMillis: number,
  ianaZone: string,
  weekly: unknown,
) => { kind: string };

async function loadWithinOpeningHours(): Promise<WithinOpeningHours> {
  const mod = await loadDomainModule('openingHours');
  const value = exported(mod, 'withinOpeningHours');
  expect(typeof value, missingExport('openingHours', 'withinOpeningHours')).toBe('function');
  return value as WithinOpeningHours;
}

describe('AC-17 — a job ending at local midnight at a dealership open until 24:00 is within', () => {
  it('the worked example: 23:00 to 24:00 local on 2026-09-08, open 09:00-24:00', async () => {
    const withinOpeningHours = await loadWithinOpeningHours();

    // 2026-09-08 is BST (+01:00), so 23:00 local is 22:00Z and the hour ends at 2026-09-09
    // 00:00 local. Stated as literal instants rather than computed, because a measured pair
    // is stronger evidence for the case the criterion names than a shrunk counterexample.
    const startsAt = Date.parse('2026-09-08T22:00:00Z');
    const endsAt = Date.parse('2026-09-08T23:00:00Z');

    expect(
      withinOpeningHours(startsAt, endsAt, ZONE, OPEN_LATE).kind,
      "ADR-0015: the end renders 00:00:00 on the local date immediately after the start's, so " +
        'it is 86400 seconds-of-day on the START\'s day and 86400 <= 86400 is `within`. ' +
        '`spans-local-days` here is the pre-ADR-0015 behaviour; `outside-window` means step 4 ' +
        "normalised but step 6 is comparing against something other than the parsed '24:00:00'; " +
        "`malformed-hours` means the '24:00:00' arm rejected valid reference data (AC-19).",
    ).toBe('within');
  });

  it('P-M1 — it holds on every day of 2026, including both DST transition days', async () => {
    const withinOpeningHours = await loadWithinOpeningHours();

    // Both transition days are constants in the generator, not left to sampling: design §7
    // extends QS-9 to "intervals ending at local midnight, INCLUDING ACROSS A DST BOUNDARY",
    // and a stratum that reaches them one run in 365 is not that claim.
    const dayArb = fc.oneof(
      fc.constantFrom(SPRING_DAY_INDEX, AUTUMN_DAY_INDEX),
      fc.integer({ min: 0, max: 364 }),
    );
    // Bounded to 8 hours so the start always lands on the same local day as the midnight it
    // ends at — 16:00 local at the earliest, hours away from either 01:00 transition.
    const durationArb = fc.integer({ min: 1, max: 480 });

    const seen = { spring: 0, autumn: 0, other: 0 };

    fc.assert(
      fc.property(dayArb, durationArb, (dayIndex, durationMinutes) => {
        if (dayIndex === SPRING_DAY_INDEX) seen.spring += 1;
        else if (dayIndex === AUTUMN_DAY_INDEX) seen.autumn += 1;
        else seen.other += 1;

        const { year, month, date } = dateOf2026(dayIndex);
        const endsAt = localMidnight(year, month, date + 1);
        const startsAt = endsAt - durationMinutes * 60_000;

        expect(
          withinOpeningHours(startsAt, endsAt, ZONE, OPEN_LATE).kind,
          `day index ${String(dayIndex)} (${String(year)}-${String(month + 1)}-${String(date)}), ` +
            `${String(durationMinutes)} minutes ending at local midnight`,
        ).toBe('within');
      }),
      { numRuns: 900, seed: SEED },
    );

    // Coverage before result, with COMPUTED floors rather than `> 0`: the two-constant
    // stratum takes half the samples and splits them, so ~225 each over 900 runs.
    expect(seen.spring, 'the spring-forward day must be exercised').toBeGreaterThanOrEqual(100);
    expect(seen.autumn, 'the fall-back day must be exercised').toBeGreaterThanOrEqual(100);
    expect(seen.other, 'and so must ordinary days').toBeGreaterThanOrEqual(200);
  });
});

describe('AC-18 — a genuine crossing is still spans-local-days (the negative control)', () => {
  it('23:00 to 01:00 the next local day is rejected', async () => {
    const withinOpeningHours = await loadWithinOpeningHours();

    const startsAt = Date.parse('2026-09-08T22:00:00Z'); // 23:00 BST
    const endsAt = Date.parse('2026-09-09T00:00:00Z'); // 01:00 BST, the NEXT local day

    expect(
      withinOpeningHours(startsAt, endsAt, ZONE, OPEN_ALWAYS).kind,
      'AC-17 alone is satisfied by deleting the step-4 check entirely. This is what stops ' +
        'that: an end that is not 00:00:00 must still be compared against the START\'s local ' +
        'date, and a dealership open 00:00-24:00 removes every other reason to refuse it.',
    ).toBe('spans-local-days');
  });

  it('P-M3 — it holds on every day of 2026, including both DST transition days', async () => {
    const withinOpeningHours = await loadWithinOpeningHours();

    const dayArb = fc.oneof(
      fc.constantFrom(SPRING_DAY_INDEX, AUTUMN_DAY_INDEX),
      fc.integer({ min: 0, max: 364 }),
    );
    // 1 to 59 minutes PAST local midnight, so the end never lands exactly on it — the case
    // ADR-0015 normalises is P-M1's, and mixing the two into one property would make neither
    // assertion mean anything.
    const overshootArb = fc.integer({ min: 1, max: 59 });

    fc.assert(
      fc.property(dayArb, overshootArb, (dayIndex, overshootMinutes) => {
        const { year, month, date } = dateOf2026(dayIndex);
        const midnight = localMidnight(year, month, date + 1);
        const startsAt = midnight - 60 * 60_000; // 23:00 local
        const endsAt = midnight + overshootMinutes * 60_000;

        expect(
          withinOpeningHours(startsAt, endsAt, ZONE, OPEN_ALWAYS).kind,
          `day index ${String(dayIndex)}, ending ${String(overshootMinutes)} minutes past local midnight`,
        ).toBe('spans-local-days');
      }),
      { numRuns: 600, seed: SEED + 1 },
    );
  });
});

describe('P-M2 — an interval longer than a local day, ending at local midnight, is still rejected', () => {
  it('the "immediately following" clause is what refuses it — deleting it silently accepts a 48-hour booking', async () => {
    const withinOpeningHours = await loadWithinOpeningHours();

    // THE MUTANT THIS EXISTS FOR: keep the `00:00:00` test, delete the successor test. Under
    // that mutant the end below normalises to 86400 on the START's day, 86400 <= 86400 holds,
    // and a two-day booking is confirmed. AC-17 cannot catch it — AC-17's end IS on the
    // immediately following day, so both readings agree there. ADR-0015 says both clauses are
    // load-bearing and this is the assertion that makes that true rather than asserted.
    const startsAt = Date.parse('2026-09-07T22:00:00Z'); // 23:00 BST, Monday 7 September
    const endsAt = Date.parse('2026-09-09T23:00:00Z'); // 00:00 local, Thursday 10 September

    expect(
      withinOpeningHours(startsAt, endsAt, ZONE, OPEN_ALWAYS).kind,
      'a 49-hour interval ending at local midnight two days later must stay spans-local-days: ' +
        'no weekly schedule can contain it (arc42 §8.3), and ADR-0015 normalises ONLY the ' +
        'immediately following local date',
    ).toBe('spans-local-days');
  });

  it('P-M2, generatively — it holds for every day of 2026 and every duration over one local day', async () => {
    const withinOpeningHours = await loadWithinOpeningHours();

    const dayArb = fc.oneof(
      fc.constantFrom(SPRING_DAY_INDEX, AUTUMN_DAY_INDEX),
      fc.integer({ min: 0, max: 362 }),
    );
    const leadMinutesArb = fc.integer({ min: 1, max: 480 });

    fc.assert(
      fc.property(dayArb, leadMinutesArb, (dayIndex, leadMinutes) => {
        const { year, month, date } = dateOf2026(dayIndex);
        // Start on `day`; end at local midnight of `day + 2` — a span of more than one local
        // day that nevertheless ends exactly at 00:00:00 local.
        const startsAt = localMidnight(year, month, date + 1) - leadMinutes * 60_000;
        const endsAt = localMidnight(year, month, date + 2);

        expect(
          withinOpeningHours(startsAt, endsAt, ZONE, OPEN_ALWAYS).kind,
          `day index ${String(dayIndex)}, starting ${String(leadMinutes)} minutes before the ` +
            'first midnight and ending at the second',
        ).toBe('spans-local-days');
      }),
      { numRuns: 600, seed: SEED + 2 },
    );
  });
});
