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
