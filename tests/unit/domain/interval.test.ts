import { describe, expect, it } from 'vitest';
import { appointmentInterval, instant, occupancyInterval } from '../../../src/domain/interval.js';

describe('instant', () => {
  it('accepts an integer epoch millisecond value', () => {
    expect(instant(1_000)).toBe(1_000);
  });

  it('accepts zero and negative integers (epoch millis before 1970 are legitimate instants)', () => {
    expect(instant(0)).toBe(0);
    expect(instant(-1_000)).toBe(-1_000);
  });

  it('rejects NaN', () => {
    expect(instant(Number.NaN)).toBeNull();
  });

  it('rejects Infinity', () => {
    expect(instant(Number.POSITIVE_INFINITY)).toBeNull();
    expect(instant(Number.NEGATIVE_INFINITY)).toBeNull();
  });

  it('rejects a non-integer millisecond value', () => {
    expect(instant(1_000.5)).toBeNull();
  });
});

describe('appointmentInterval', () => {
  it('derives [startsAt, startsAt + durationMillis)', () => {
    const start = instant(1_000_000);
    expect(start).not.toBeNull();
    const iv = appointmentInterval(start!, 60_000);
    expect(iv).toEqual({ startsAt: 1_000_000, endsAt: 1_060_000 });
  });

  it('does not derive the end by any other arithmetic (kills +/- mutants)', () => {
    const start = instant(0);
    expect(start).not.toBeNull();
    const iv = appointmentInterval(start!, 42);
    expect(iv.endsAt).toBe(42);
    expect(iv.endsAt).not.toBe(-42);
  });

  it('consults no parameter for the end other than durationMillis', () => {
    const start = instant(5_000);
    expect(start).not.toBeNull();
    const iv = appointmentInterval(start!, 0);
    expect(iv.endsAt).toBe(5_000);
  });
});

describe('occupancyInterval', () => {
  it('returns an interval equal in both fields to its argument — the identity is the point (A-4)', () => {
    const start = instant(10);
    expect(start).not.toBeNull();
    const iv = appointmentInterval(start!, 5);
    const occ = occupancyInterval(iv);
    expect(occ).toEqual({ startsAt: iv.startsAt, endsAt: iv.endsAt });
  });

  it('is a true identity: the returned object reflects the same values as the input, not a fixed constant', () => {
    const startA = instant(100);
    const startB = instant(999);
    expect(startA).not.toBeNull();
    expect(startB).not.toBeNull();
    const ivA = appointmentInterval(startA!, 1);
    const ivB = appointmentInterval(startB!, 2);
    expect(occupancyInterval(ivA)).toEqual(ivA);
    expect(occupancyInterval(ivB)).toEqual(ivB);
    expect(occupancyInterval(ivA)).not.toEqual(occupancyInterval(ivB));
  });
});

/**
 * ADR-0014 — an `Instant` is renderable by construction (AC-13, AC-14).
 *
 * The property test in `tests/property/instant-bounds.test.ts` is the test-engineer's and
 * generates over the whole range; these are the implementer's boundary cases, written to name
 * the two mutants ADR-0014's remedy is exposed to. Both are asserted here so a `npm run
 * mutation` survivor at either site is a defect in this file and not in the property suite.
 */
describe('instant — the renderable bound (ADR-0014)', () => {
  const MAX = 8_640_000_000_000_000;

  it('accepts exactly +MAX: the bound is inclusive (kills `<=` -> `<`)', () => {
    expect(instant(MAX)).toBe(MAX);
  });

  it('accepts exactly -MAX: the bound is inclusive on the negative side too', () => {
    expect(instant(-MAX)).toBe(-MAX);
  });

  it('rejects one millisecond beyond the positive bound', () => {
    expect(instant(MAX + 1)).toBeNull();
  });

  it('rejects a value beyond the NEGATIVE bound (kills `delete Math.abs`)', () => {
    // Measured and corrected at step 3: `-MAX` does NOT kill the `Math.abs` deletion, because
    // `-MAX <= MAX` holds. Only a value beyond the bound on the negative side does.
    expect(instant(-(MAX + 1))).toBeNull();
    expect(instant(Number.MIN_SAFE_INTEGER)).toBeNull();
  });

  it('rejects a value far beyond the positive bound', () => {
    expect(instant(Number.MAX_SAFE_INTEGER)).toBeNull();
  });

  it('still accepts an ordinary instant, so the bound is not a blanket rejection', () => {
    const ordinary = Date.parse('2026-09-08T09:00:00.000Z');
    expect(instant(ordinary)).toBe(ordinary);
  });
});
