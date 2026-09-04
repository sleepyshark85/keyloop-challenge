import { describe, expect, it } from 'vitest';
import { durationMillis, serviceDuration } from '../../../src/domain/duration.js';

describe('serviceDuration', () => {
  it('accepts a positive integer number of minutes', () => {
    const d = serviceDuration({ durationMinutes: 45 });
    expect(d).toBe(45);
  });

  it('rejects zero', () => {
    expect(serviceDuration({ durationMinutes: 0 })).toBeNull();
  });

  it('rejects a negative value', () => {
    expect(serviceDuration({ durationMinutes: -10 })).toBeNull();
  });

  it('rejects a fractional value', () => {
    expect(serviceDuration({ durationMinutes: 30.5 })).toBeNull();
  });

  it('rejects NaN', () => {
    expect(serviceDuration({ durationMinutes: Number.NaN })).toBeNull();
  });

  it('rejects Infinity', () => {
    expect(serviceDuration({ durationMinutes: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe('durationMillis', () => {
  it('converts minutes to milliseconds exactly', () => {
    const d = serviceDuration({ durationMinutes: 60 });
    expect(d).not.toBeNull();
    expect(durationMillis(d!)).toBe(3_600_000);
  });

  it('is exact for a duration of 1 minute (kills the * -> / mutant and the literal itself)', () => {
    const d = serviceDuration({ durationMinutes: 1 });
    expect(d).not.toBeNull();
    expect(durationMillis(d!)).toBe(60_000);
  });

  it('is exact for a duration of 7 minutes', () => {
    const d = serviceDuration({ durationMinutes: 7 });
    expect(d).not.toBeNull();
    expect(durationMillis(d!)).toBe(420_000);
  });
});
