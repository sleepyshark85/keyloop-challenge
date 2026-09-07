import { describe, expect, it } from 'vitest';
import { deriveInterval } from '../../../src/application/deriveInterval.js';
import type { DealershipHours } from '../../../src/application/deriveInterval.js';
import type { WeeklyOpeningHours } from '../../../src/domain/openingHours.js';

/**
 * The precedence tests I-02-3 committed this file to, plus the branch coverage mutation can see.
 *
 * The distinction is the whole point of the file: STRYKER DOES NOT REORDER STATEMENTS. None of its
 * twenty mutators permutes a block, so no mutation score over `deriveInterval.ts` is evidence that
 * `serviceDuration` ran before `appointmentInterval`. Each case below marked PRECEDENCE is
 * constructed so that the SPECIFIED order and a swapped order give DIFFERENT answers, and asserts
 * the one the specified order gives — which is the only mechanism available now that the literal
 * AC-6 ruling took the brands' enforcement away (D-01-1).
 */

const ZONE = 'Europe/London';

function weekOpen(opensAt: string, closesAt: string): WeeklyOpeningHours {
  const day = { opensAt, closesAt };
  return [day, day, day, day, day, day, day];
}

function dealership(
  weekly: WeeklyOpeningHours = weekOpen('09:00:00', '17:00:00'),
  ianaZone: string = ZONE,
): DealershipHours {
  return { ianaZone, weekly };
}

/** 10:00 local (BST) on Tuesday 2026-09-08 — the fixtures' anchor. */
const TEN_AM_LOCAL = Date.parse('2026-09-08T09:00:00.000Z');
const MAX_RENDERABLE = 8_640_000_000_000_000;

describe('deriveInterval — the happy path', () => {
  it('derives the end from the service type duration and reports all four endpoints', () => {
    const derivation = deriveInterval(TEN_AM_LOCAL, { durationMinutes: 90 }, dealership());
    expect(derivation).toEqual({
      kind: 'derived',
      startsAt: TEN_AM_LOCAL,
      endsAt: TEN_AM_LOCAL + 90 * 60 * 1000,
      occupancyStartsAt: TEN_AM_LOCAL,
      occupancyEndsAt: TEN_AM_LOCAL + 90 * 60 * 1000,
    });
  });

  it('the occupancy interval is the interval — A-4, and the identity IS the statement that there is no buffer', () => {
    // Passing all four endpoints out is what keeps A-4 a one-function change: a buffer changes
    // `occupancyInterval` and the constraint's range expression, and the two extra fields
    // already flow to the right place. Asserting they are equal TODAY is what makes the day
    // they diverge visible.
    const derivation = deriveInterval(TEN_AM_LOCAL, { durationMinutes: 30 }, dealership());
    expect(derivation.kind).toBe('derived');
    if (derivation.kind !== 'derived') return;
    expect(derivation.occupancyStartsAt).toBe(derivation.startsAt);
    expect(derivation.occupancyEndsAt).toBe(derivation.endsAt);
  });
});

describe('deriveInterval — PRECEDENCE (the order Stryker cannot mutate)', () => {
  it('the INSTANT is checked before the DURATION', () => {
    // Both are invalid. Specified order answers `unparsable-instant`; swap steps 1 and 2 and it
    // answers `invalid-duration`. Nothing else discriminates the two orders.
    expect(
      deriveInterval(MAX_RENDERABLE + 1, { durationMinutes: 0 }, dealership()).kind,
    ).toBe('unparsable-instant');
  });

  it('the DURATION is checked before any interval arithmetic or the hours gate', () => {
    // A zero duration with a valid, in-hours start. Specified order answers `invalid-duration`.
    // Derive first and the interval is zero-length, which `withinOpeningHours` step 1 rejects as
    // `malformed-interval` — so a swapped order answers `outside-opening-hours` instead, with a
    // verdict that blames the client for a service type they did not choose the duration of.
    const derivation = deriveInterval(TEN_AM_LOCAL, { durationMinutes: 0 }, dealership());
    expect(derivation.kind).toBe('invalid-duration');
  });

  it('the INSTANT is checked before the hours gate', () => {
    // `NaN` reaches `withinOpeningHours` unguarded under a swapped order and comes back
    // `malformed-interval`, which maps to a 400 blaming the opening hours for an unparseable
    // timestamp. Specified order answers `unparsable-instant`, which is AC-8's `400
    // /problems/malformed-request`.
    expect(deriveInterval(Number.NaN, { durationMinutes: 60 }, dealership()).kind).toBe(
      'unparsable-instant',
    );
  });

  it('the hours gate runs on the DERIVED END, not on the client-supplied start alone', () => {
    // 16:00 local against 09:00-17:00, for 120 minutes: the START is inside opening hours and
    // the DERIVED END is an hour after closing. A gate applied before step 3 — or applied to
    // `(startsAt, startsAt)` — answers `within` and confirms a booking that runs past closing.
    // This is the case that makes step 5's position load-bearing rather than stylistic.
    const fourPmLocal = Date.parse('2026-09-08T15:00:00.000Z');
    const derivation = deriveInterval(fourPmLocal, { durationMinutes: 120 }, dealership());
    expect(derivation.kind).toBe('outside-opening-hours');
    if (derivation.kind !== 'outside-opening-hours') return;
    expect(derivation.verdict.kind).toBe('outside-window');
  });

  it('a start inside hours with an end exactly at closing is still derived', () => {
    // The negative control for the case above: if step 5 were rejecting everything, or comparing
    // the wrong endpoint, this would fail too and the assertion above would prove nothing.
    const threePmLocal = Date.parse('2026-09-08T14:00:00.000Z');
    expect(deriveInterval(threePmLocal, { durationMinutes: 120 }, dealership()).kind).toBe(
      'derived',
    );
  });
});

describe('deriveInterval — the client\'s fault and the system\'s fault are different outcomes', () => {
  it('an unresolvable zone is reference-data-invalid, not outside-opening-hours', () => {
    // OQ-02-2, closed: broken reference data is the SYSTEM's fault and renders as
    // `500 /problems/internal`. A 4xx would tell the caller to correct a `time_zone`
    // column they did not send and cannot see. This is also AC-12's route to the `500` row.
    const derivation = deriveInterval(TEN_AM_LOCAL, { durationMinutes: 60 }, dealership(
      weekOpen('09:00:00', '17:00:00'),
      'Not/AZone',
    ));
    expect(derivation.kind).toBe('reference-data-invalid');
    if (derivation.kind !== 'reference-data-invalid') return;
    expect(derivation.verdict.kind).toBe('unknown-zone');
  });

  it('unparseable opening hours are reference-data-invalid', () => {
    const derivation = deriveInterval(
      TEN_AM_LOCAL,
      { durationMinutes: 60 },
      dealership(weekOpen('not-a-time', '17:00:00')),
    );
    expect(derivation.kind).toBe('reference-data-invalid');
    if (derivation.kind !== 'reference-data-invalid') return;
    expect(derivation.verdict.kind).toBe('malformed-hours');
  });

  it.each([
    [
      'a closed day',
      [null, null, null, null, null, null, null] as WeeklyOpeningHours,
      'closed-day',
      TEN_AM_LOCAL,
    ],
    [
      'an out-of-window interval',
      weekOpen('09:00:00', '17:00:00'),
      'outside-window',
      Date.parse('2026-09-08T22:00:00.000Z'),
    ],
    [
      'an interval that spans two local days',
      weekOpen('00:00:00', '24:00:00'),
      'spans-local-days',
      Date.parse('2026-09-08T22:30:00.000Z'),
    ],
  ])(
    '%s is outside-opening-hours — the CLIENT\'s to fix, so a 400',
    (_label, weekly, expectedVerdict, startsAt) => {
      const derivation = deriveInterval(startsAt, { durationMinutes: 60 }, dealership(weekly));
      expect(derivation.kind).toBe('outside-opening-hours');
      if (derivation.kind !== 'outside-opening-hours') return;
      expect(derivation.verdict.kind).toBe(expectedVerdict);
    },
  );

  it('the split is by VERDICT and not by a default arm — a new verdict kind must be classified', () => {
    // `isBrokenReferenceData` names its two members rather than treating "not one of the client
    // ones" as broken data. A `!== 'outside-window'` implementation would route `closed-day` to
    // a 500, so both directions are asserted: two cases above land on `reference-data-invalid`
    // and three on `outside-opening-hours`, and no single predicate satisfies both sets by
    // accident.
    expect(
      deriveInterval(TEN_AM_LOCAL, { durationMinutes: 60 }, dealership()).kind,
    ).toBe('derived');
  });
});

describe('deriveInterval — the instant bound (ADR-0014) reaches this layer', () => {
  it.each([
    ['a non-integer', 1_000.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['beyond the positive bound', MAX_RENDERABLE + 1],
    ['beyond the negative bound', -(MAX_RENDERABLE + 1)],
  ])('%s is unparsable-instant', (_label, startsAtMillis) => {
    expect(deriveInterval(startsAtMillis, { durationMinutes: 60 }, dealership()).kind).toBe(
      'unparsable-instant',
    );
  });

  it.each([
    ['zero', 0],
    ['negative', -30],
    ['fractional', 30.5],
    ['NaN', Number.NaN],
  ])('a %s duration is invalid-duration', (_label, durationMinutes) => {
    expect(deriveInterval(TEN_AM_LOCAL, { durationMinutes }, dealership()).kind).toBe(
      'invalid-duration',
    );
  });
});
