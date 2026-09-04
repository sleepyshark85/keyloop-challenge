import { describe, expect, it } from 'vitest';
import { withinOpeningHours, type WeeklyOpeningHours } from '../../../src/domain/openingHours.js';

const ZONE = 'Europe/London';

const CLOSED_WEEK: WeeklyOpeningHours = [null, null, null, null, null, null, null];

function weekOpen(opensAt: string, closesAt: string): WeeklyOpeningHours {
  return [
    { opensAt, closesAt },
    { opensAt, closesAt },
    { opensAt, closesAt },
    { opensAt, closesAt },
    { opensAt, closesAt },
    { opensAt, closesAt },
    { opensAt, closesAt },
  ];
}

// ─────────────────────────────────────────────────────── step 1: malformed-interval ──

describe('withinOpeningHours — step 1, malformed-interval (literal AC-6 branch)', () => {
  const weekly = weekOpen('09:00:00', '17:00:00');

  it('rejects a reversed pair', () => {
    expect(withinOpeningHours(2_000, 1_000, ZONE, weekly)).toEqual({ kind: 'malformed-interval' });
  });

  it('rejects an equal pair (endsAt must be strictly greater)', () => {
    expect(withinOpeningHours(1_000, 1_000, ZONE, weekly)).toEqual({ kind: 'malformed-interval' });
  });

  it('rejects NaN in either position', () => {
    expect(withinOpeningHours(Number.NaN, 2_000, ZONE, weekly)).toEqual({ kind: 'malformed-interval' });
    expect(withinOpeningHours(1_000, Number.NaN, ZONE, weekly)).toEqual({ kind: 'malformed-interval' });
  });

  it('rejects Infinity in either position', () => {
    expect(withinOpeningHours(Number.NEGATIVE_INFINITY, 2_000, ZONE, weekly)).toEqual({
      kind: 'malformed-interval',
    });
    expect(withinOpeningHours(1_000, Number.POSITIVE_INFINITY, ZONE, weekly)).toEqual({
      kind: 'malformed-interval',
    });
  });

  it('rejects a non-integer endpoint', () => {
    expect(withinOpeningHours(1_000.5, 2_000, ZONE, weekly)).toEqual({ kind: 'malformed-interval' });
  });

  it('a well-formed pair is not malformed-interval', () => {
    const start = Date.parse('2026-06-15T10:00:00Z');
    expect(withinOpeningHours(start, start + 1000, ZONE, weekly).kind).not.toBe('malformed-interval');
  });
});

// ───────────────────────────────────────────────────────────────── step 2: unknown-zone ──

describe('withinOpeningHours — step 2, unknown-zone', () => {
  it('an invalid IANA zone yields unknown-zone rather than throwing', () => {
    const start = Date.parse('2026-06-15T10:00:00Z');
    const verdict = withinOpeningHours(start, start + 1000, 'Nowhere/Bad', weekOpen('09:00:00', '17:00:00'));
    expect(verdict).toEqual({ kind: 'unknown-zone', ianaZone: 'Nowhere/Bad' });
  });

  it('is reached before spans-local-days / closed-day / malformed-hours would be (order)', () => {
    // A malformed week AND an invalid zone: unknown-zone must win, because step 2 precedes 5/6.
    const start = Date.parse('2026-06-15T10:00:00Z');
    const verdict = withinOpeningHours(start, start + 1000, 'Nowhere/Bad', CLOSED_WEEK);
    expect(verdict.kind).toBe('unknown-zone');
  });
});

// ───────────────────────────────────────────────────────────── step 4: spans-local-days ──

describe('withinOpeningHours — step 4, spans-local-days', () => {
  const weekly = weekOpen('00:00:00', '24:00:00');

  it('an interval crossing local midnight is spans-local-days', () => {
    const start = Date.parse('2026-06-15T22:30:00Z'); // BST: 23:30 local, 2026-06-15
    const end = start + 60 * 60_000; // one hour later: 00:30 local, 2026-06-16 — crosses midnight
    const verdict = withinOpeningHours(start, end, ZONE, weekly);
    expect(verdict.kind).toBe('spans-local-days');
  });

  it('the equivalent interval one hour earlier (same local day) is not spans-local-days', () => {
    const start = Date.parse('2026-06-15T21:30:00Z'); // BST: 22:30 local
    const end = start + 60 * 60_000; // 23:30 local, same day
    const verdict = withinOpeningHours(start, end, ZONE, weekly);
    expect(verdict.kind).not.toBe('spans-local-days');
  });

  it('takes priority over closed-day: a midnight-crossing interval on a closed day is still spans-local-days', () => {
    const start = Date.parse('2026-06-15T22:30:00Z');
    const end = start + 60 * 60_000;
    const verdict = withinOpeningHours(start, end, ZONE, CLOSED_WEEK);
    expect(verdict.kind).toBe('spans-local-days');
  });
});
