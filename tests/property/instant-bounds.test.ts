import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  everyDay,
  exported,
  loadDomainModule,
  MAX_RENDERABLE_EPOCH_MILLIS as MAX,
  missingExport,
} from '../support/domain.js';

/**
 * AC-13 to AC-16 — ADR-0014, an `Instant` is renderable by construction.
 *
 * `docs/adr/0014-*.md` · `docs/slices/02-design.md` §6.1 · slice file AC-13-AC-16 · QS-9, QS-12.
 *
 *   AC-13  `|epochMillis| > 8_640_000_000_000_000` -> `instant()` returns `null`
 *   AC-14  exactly `±8_640_000_000_000_000` -> an `Instant`. The bound is INCLUSIVE and BOTH
 *          signs are asserted
 *   AC-15  any value for which `instant()` returns an `Instant` renders through
 *          `new Date(...).toISOString()` without throwing. Asserted as a PROPERTY over a
 *          generator that reaches both bounds, not over a hand-picked list
 *   AC-16  an endpoint outside the same bound makes `withinOpeningHours` return
 *          `malformed-interval` — the EXISTING verdict variant, no new one (ADR-0014)
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT EACH CASE LOOKS LIKE AT THE RED COMMIT (process criterion C1).
 *
 * `dist/domain/interval.js` and `dist/domain/openingHours.js` both exist and export the right
 * names — slice 01 merged them — so nothing here fails to load and nothing is stubbed.
 *
 *   AC-13  RED as an assertion. Today's `instant()` bounds nothing, so it returns the value
 *          where `null` is expected.
 *   AC-14  GREEN at the red commit, and honestly so: it asserts behaviour today's unbounded
 *          `instant()` already has. Its job is not to be red now — it is to KILL the two
 *          mutants the bound introduces (see the table below), neither of which exists yet.
 *   AC-15  RED as an assertion. `instant(1e18)` is non-null today and
 *          `new Date(1e18).toISOString()` throws `RangeError`, which this file CATCHES and
 *          asserts on rather than letting escape.
 *   AC-16  RED as a CAUGHT `RangeError`. Today `withinOpeningHours` passes step 1 for a
 *          well-ordered out-of-range pair and then hands an Invalid Date to
 *          `Intl.DateTimeFormat.formatToParts`, which throws. The throw is caught and turned
 *          into the assertion "it must not throw", so the artifact records a failed
 *          assertion in a collected file rather than an exception in a runner.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE MUTANTS THESE CASES EXIST TO KILL — design §6.1, and the DoD's "for a discrimination
 * claim, name the mutant".
 *
 *   `<=` -> `<` on the epoch bound      killed ONLY by AC-14's exact ±8_640_000_000_000_000
 *   delete `Math.abs`                   killed ONLY by AC-14's NEGATIVE bound
 *   `>` -> `>=` / a widened bound       killed by AC-13 and by AC-15's beyond-bound stratum
 *
 * That is why AC-14 asserts both signs separately rather than "the bound is inclusive": one
 * example kills one mutant, and a single positive example leaves `Math.abs` alive.
 */

const SEED = 20_260_906;

/** Whether `new Date(ms).toISOString()` completes. Never rethrows — the caller asserts. */
function rendersWithoutThrowing(epochMillis: number): { ok: boolean; error?: string } {
  try {
    new Date(epochMillis).toISOString();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

type InstantFn = (epochMillis: number) => unknown;

async function loadInstant(): Promise<InstantFn> {
  const mod = await loadDomainModule('interval');
  const value = exported(mod, 'instant');
  expect(typeof value, missingExport('interval', 'instant')).toBe('function');
  return value as InstantFn;
}

describe('AC-13 — a value outside the renderable bound is not an Instant', () => {
  it('|epochMillis| > 8_640_000_000_000_000 returns null, for every generated value', async () => {
    const instant = await loadInstant();

    // Both signs, and the two values immediately outside the bound are constants in the
    // generator rather than left to chance: a shrunk counterexample is weaker evidence for
    // the case the criterion names than a stated one.
    const beyondArb = fc.oneof(
      fc.constantFrom(MAX + 1, -(MAX + 1), Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER),
      fc.integer({ min: MAX + 1, max: Number.MAX_SAFE_INTEGER }),
      fc.integer({ min: -Number.MAX_SAFE_INTEGER, max: -(MAX + 1) }),
    );

    fc.assert(
      fc.property(beyondArb, (epochMillis) => {
        expect(
          instant(epochMillis),
          `instant(${String(epochMillis)}) must be null: |value| > ${String(MAX)} and ` +
            `new Date(value).toISOString() throws, so an Instant here is one that cannot be rendered`,
        ).toBeNull();
      }),
      { numRuns: 600, seed: SEED },
    );
  });

  it('a non-integer is still rejected — ADR-0014 adds a bound and removes nothing', async () => {
    const instant = await loadInstant();
    fc.assert(
      fc.property(
        fc.double({ noNaN: false, noDefaultInfinity: false }).filter((d) => !Number.isInteger(d)),
        (value) => {
          expect(instant(value), `instant(${String(value)})`).toBeNull();
        },
      ),
      { numRuns: 300, seed: SEED + 1 },
    );
  });
});

describe('AC-14 — the bound is inclusive, and both signs are asserted', () => {
  it('instant(+8_640_000_000_000_000) is an Instant', async () => {
    const instant = await loadInstant();
    // Kills `<=` -> `<`. No other case in this slice does: every other in-range value is
    // strictly inside the bound and survives both operators.
    expect(
      instant(MAX),
      `${String(MAX)} is exactly the largest renderable instant — new Date(it).toISOString() ` +
        'is +275760-09-13T00:00:00.000Z (design §6.1, measured). Rejecting it makes the bound ' +
        'exclusive, which ADR-0014 does not say',
    ).toBe(MAX);
  });

  it('instant(-8_640_000_000_000_000) is an Instant', async () => {
    const instant = await loadInstant();
    // Kills `delete Math.abs`. With `Math.abs` removed, `epochMillis <= MAX` is true for
    // every negative value however large, so ONLY a negative out-of-range case can catch it —
    // and only if the in-range negative bound is also asserted, or the remedy could be to
    // reject all negatives.
    expect(instant(-MAX), 'the bound is symmetric — ADR-0014 bounds the MAGNITUDE').toBe(-MAX);
  });

  it('one millisecond beyond each bound is not', async () => {
    const instant = await loadInstant();
    expect(instant(MAX + 1), 'the pair to the +MAX case: together they pin the boundary exactly').toBeNull();
    expect(instant(-(MAX + 1)), 'and its negative mirror').toBeNull();
  });
});

describe('AC-15 (QS-9) — every Instant renders, over a generator that reaches both bounds', () => {
  it('instant(x) !== null implies new Date(x).toISOString() does not throw', async () => {
    const instant = await loadInstant();

    // Five strata, because a single uniform generator over the safe-integer range would put
    // essentially every sample far outside the bound and the property would hold vacuously —
    // `instant` would return null every time and the implication would never be tested. The
    // coverage assertion below is what turns that from a hope into a claim.
    const NEAR = 1_000;
    const strata = {
      exactBounds: fc.constantFrom(MAX, -MAX),
      nearBounds: fc.oneof(
        fc.integer({ min: MAX - NEAR, max: MAX }),
        fc.integer({ min: -MAX, max: -MAX + NEAR }),
      ),
      beyondBounds: fc.oneof(
        fc.integer({ min: MAX + 1, max: Number.MAX_SAFE_INTEGER }),
        fc.integer({ min: -Number.MAX_SAFE_INTEGER, max: -(MAX + 1) }),
      ),
      ordinary: fc.integer({ min: -8_640_000_000_000, max: 8_640_000_000_000 }),
      nonInteger: fc.double({ noNaN: false, noDefaultInfinity: false }).filter(
        (d) => !Number.isInteger(d),
      ),
    } as const;

    const seen = { exactBounds: 0, nearBounds: 0, beyondBounds: 0, ordinary: 0, nonInteger: 0 };
    let renderable = 0;
    let rejected = 0;

    const classify = (value: number): keyof typeof seen => {
      if (!Number.isInteger(value)) return 'nonInteger';
      if (value === MAX || value === -MAX) return 'exactBounds';
      if (Math.abs(value) > MAX) return 'beyondBounds';
      if (Math.abs(value) >= MAX - NEAR) return 'nearBounds';
      return 'ordinary';
    };

    const RUNS = 1_500;
    fc.assert(
      fc.property(fc.oneof(...Object.values(strata)), (value) => {
        seen[classify(value)] += 1;
        const result = instant(value);
        if (result === null) {
          rejected += 1;
          return;
        }
        renderable += 1;
        const rendered = rendersWithoutThrowing(value);
        expect(
          rendered.ok ? 'rendered' : `threw ${rendered.error ?? ''}`,
          `instant(${String(value)}) returned an Instant, so ADR-0014's whole claim is that ` +
            'new Date(it).toISOString() cannot throw. It threw',
        ).toBe('rendered');
      }),
      { numRuns: RUNS, seed: SEED + 2 },
    );

    // COVERAGE BEFORE RESULT — §5.3's rule from slice 01, and the floors are COMPUTED rather
    // than `> 0`. Five equiprobable strata over 1500 runs give ~300 each; 120 is a floor a
    // regression of the generator breaks and ordinary sampling variance does not.
    for (const [name, count] of Object.entries(seen)) {
      expect(count, `stratum ${name} was barely sampled — the property below is about the generator`).toBeGreaterThanOrEqual(
        120,
      );
    }
    // The anti-vacuity floor, and the one that matters most: an implication whose antecedent
    // is never true is true. If `instant` ever starts returning null for everything, THIS is
    // the assertion that fails rather than the property silently passing.
    expect(
      renderable,
      'the property is an implication — if instant() never returned an Instant it would hold vacuously',
    ).toBeGreaterThanOrEqual(300);
    expect(
      rejected,
      'and the generator must also reach values instant() rejects, or the bound is untested',
    ).toBeGreaterThanOrEqual(300);
  });
});

describe('AC-16 (QS-12) — an out-of-bound endpoint is malformed-interval, and does not throw', () => {
  const weekly = everyDay({ opensAt: '00:00:00', closesAt: '24:00:00' });

  const CASES: ReadonlyArray<readonly [string, number, number]> = [
    ['both endpoints beyond the bound', MAX + 1, MAX + 2],
    ['the start beyond the negative bound', -(MAX + 1), 0],
    ['the end beyond the positive bound', 0, MAX + 1],
    ['the end far beyond, from an ordinary start', 1_760_000_000_000, Number.MAX_SAFE_INTEGER],
  ];

  it.each(CASES.map((c) => [c[0], c[1], c[2]] as const))(
    '%s',
    async (_label, startsAtMillis, endsAtMillis) => {
      const mod = await loadDomainModule('openingHours');
      const value = exported(mod, 'withinOpeningHours');
      expect(typeof value, missingExport('openingHours', 'withinOpeningHours')).toBe('function');
      const withinOpeningHours = value as (
        s: number,
        e: number,
        z: string,
        w: unknown,
      ) => { kind: string };

      // THE THROW IS CAUGHT ON PURPOSE. At the red commit step 1 passes this pair (both
      // integers, end > start) and step 3 hands an Invalid Date to `formatToParts`, which
      // raises `RangeError: Invalid time value`. Letting it escape would make this file's red
      // an exception rather than an assertion, which criterion C1 rules out; catching it and
      // asserting turns "it threw" into a value the artifact records.
      let verdict: { kind: string } | undefined;
      let thrown: unknown;
      try {
        verdict = withinOpeningHours(startsAtMillis, endsAtMillis, 'Europe/London', weekly);
      } catch (error) {
        thrown = error;
      }

      expect(
        thrown === undefined ? 'returned' : `threw ${String(thrown)}`,
        `withinOpeningHours(${String(startsAtMillis)}, ${String(endsAtMillis)}, …) must not ` +
          'throw. ADR-0014 puts the same bound on both endpoints at step 1 so an unrenderable ' +
          'instant never reaches the formatter',
      ).toBe('returned');

      expect(
        verdict?.kind,
        'the EXISTING verdict variant is reused — ADR-0014 is explicit that no new variant is ' +
          'introduced (AC-16), so a new `unrenderable-instant` kind here would be a design change',
      ).toBe('malformed-interval');
    },
  );

  it('negative control — an in-bound pair is NOT malformed-interval, so the case above is not passing on a blanket rejection', async () => {
    const mod = await loadDomainModule('openingHours');
    const value = exported(mod, 'withinOpeningHours');
    expect(typeof value, missingExport('openingHours', 'withinOpeningHours')).toBe('function');
    const withinOpeningHours = value as (
      s: number,
      e: number,
      z: string,
      w: unknown,
    ) => { kind: string };

    // The cheapest way to make every AC-16 case green is to return `malformed-interval`
    // unconditionally. This is what stops that.
    const start = Date.parse('2026-09-08T09:00:00.000Z');
    expect(
      withinOpeningHours(start, start + 3_600_000, 'Europe/London', weekly).kind,
      'an ordinary in-hours hour must not be malformed-interval',
    ).toBe('within');
  });
});
