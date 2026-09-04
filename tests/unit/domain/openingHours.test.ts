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

function onlyDayOpen(day: number, opensAt: string, closesAt: string): WeeklyOpeningHours {
  const week: (typeof CLOSED_WEEK)[number][] = [...CLOSED_WEEK];
  week[day] = { opensAt, closesAt };
  return week as unknown as WeeklyOpeningHours;
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

// ───────────────────────────────────────────────────────────────────── step 5: closed-day ──

describe('withinOpeningHours — step 5, closed-day (AC-4)', () => {
  it('a day with no row (null) is rejected as closed-day, naming the weekday', () => {
    // 2026-06-15 is a Monday.
    const start = Date.parse('2026-06-15T10:00:00Z');
    const end = start + 60_000;
    const verdict = withinOpeningHours(start, end, ZONE, CLOSED_WEEK);
    expect(verdict).toEqual({ kind: 'closed-day', dayOfWeek: 1 });
  });

  it('the same day open elsewhere in the week does not affect a closed day (per-day, not per-week)', () => {
    // Only Tuesday (2) open; Monday (1) instant must still be closed-day.
    const weekly = onlyDayOpen(2, '00:00:00', '24:00:00');
    const start = Date.parse('2026-06-15T10:00:00Z'); // Monday
    const verdict = withinOpeningHours(start, start + 60_000, ZONE, weekly);
    expect(verdict).toEqual({ kind: 'closed-day', dayOfWeek: 1 });
  });
});

// ───────────────────────────────────────────────────────────────── step 6: malformed-hours ──

describe('withinOpeningHours — step 6, malformed-hours (fail closed)', () => {
  it('an unparsable opensAt string yields malformed-hours', () => {
    const weekly = weekOpen('not-a-time', '17:00:00');
    const start = Date.parse('2026-06-15T10:00:00Z');
    const verdict = withinOpeningHours(start, start + 1000, ZONE, weekly);
    expect(verdict).toEqual({ kind: 'malformed-hours', dayOfWeek: 1 });
  });

  it('an unparsable closesAt string yields malformed-hours', () => {
    const weekly = weekOpen('09:00:00', 'not-a-time');
    const start = Date.parse('2026-06-15T10:00:00Z');
    const verdict = withinOpeningHours(start, start + 1000, ZONE, weekly);
    expect(verdict).toEqual({ kind: 'malformed-hours', dayOfWeek: 1 });
  });

  it('opensAt >= closesAt yields malformed-hours', () => {
    const weekly = weekOpen('17:00:00', '09:00:00');
    const start = Date.parse('2026-06-15T10:00:00Z');
    const verdict = withinOpeningHours(start, start + 1000, ZONE, weekly);
    expect(verdict).toEqual({ kind: 'malformed-hours', dayOfWeek: 1 });
  });

  it('opensAt === closesAt yields malformed-hours (a zero-width day is not a valid window)', () => {
    const weekly = weekOpen('09:00:00', '09:00:00');
    const start = Date.parse('2026-06-15T09:00:00Z');
    const verdict = withinOpeningHours(start, start + 1000, ZONE, weekly);
    expect(verdict).toEqual({ kind: 'malformed-hours', dayOfWeek: 1 });
  });

  it('24:00:00 is a legitimate closesAt, not malformed (DA-2: measured against real PostgreSQL)', () => {
    const weekly = weekOpen('00:00:00', '24:00:00');
    const start = Date.parse('2026-06-15T22:00:00Z'); // 23:00 BST
    const verdict = withinOpeningHours(start, start + 1000, ZONE, weekly);
    expect(verdict.kind).toBe('within');
  });
});

// ─────────────────────────────────────────────────────── step 7: within / outside-window ──

describe('withinOpeningHours — step 7, the boundary is inclusive on closesAt (kills EqualityOperator mutants)', () => {
  const weekly = weekOpen('09:00:00', '17:00:00');

  it('an interval ending exactly at closesAt (17:00) is within', () => {
    // 2026-06-15: BST (UTC+1), so 17:00 local = 16:00Z.
    const end = Date.parse('2026-06-15T16:00:00Z');
    const start = end - 60_000;
    expect(withinOpeningHours(start, end, ZONE, weekly).kind).toBe('within');
  });

  it('an interval ending one second after closesAt is outside-window', () => {
    const end = Date.parse('2026-06-15T16:00:01Z');
    const start = end - 60_000;
    expect(withinOpeningHours(start, end, ZONE, weekly).kind).toBe('outside-window');
  });

  it('an interval starting exactly at opensAt (09:00) is within', () => {
    const start = Date.parse('2026-06-15T08:00:00Z'); // 09:00 BST
    expect(withinOpeningHours(start, start + 60_000, ZONE, weekly).kind).toBe('within');
  });

  it('an interval starting one second before opensAt is outside-window', () => {
    const start = Date.parse('2026-06-15T07:59:59Z');
    expect(withinOpeningHours(start, start + 60_000, ZONE, weekly).kind).toBe('outside-window');
  });

  it('outside-window carries the day-of-week and the configured window', () => {
    const start = Date.parse('2026-06-15T07:00:00Z'); // 08:00 BST — before opening
    const verdict = withinOpeningHours(start, start + 60_000, ZONE, weekly);
    expect(verdict).toEqual({
      kind: 'outside-window',
      dayOfWeek: 1,
      opensAt: '09:00:00',
      closesAt: '17:00:00',
    });
  });

  it('well inside the window is within', () => {
    const start = Date.parse('2026-06-15T11:00:00Z'); // 12:00 BST
    expect(withinOpeningHours(start, start + 60_000, ZONE, weekly).kind).toBe('within');
  });
});

// ──────────────────────────────────────────────────────── the DST rule itself (AC-2, AC-3) ──

describe('withinOpeningHours — the DST rule (AC-2)', () => {
  const weekOpen0900to1700 = weekOpen('09:00:00', '17:00:00');

  it('the same UTC wall time renders differently either side of spring-forward, and the verdicts differ', () => {
    const before = Date.parse('2026-03-28T08:30:00Z'); // GMT: 08:30 local
    const rejected = withinOpeningHours(before, before + 60_000, ZONE, weekOpen0900to1700);
    expect(rejected.kind).not.toBe('within');

    const after = Date.parse('2026-03-29T08:30:00Z'); // BST: 09:30 local
    const accepted = withinOpeningHours(after, after + 60_000, ZONE, weekOpen0900to1700);
    expect(accepted.kind).toBe('within');
  });

  it('the ambiguous fall-back hour renders identically and receives the same verdict both times', () => {
    const t1 = Date.parse('2026-10-25T00:30:00Z'); // 01:30 BST
    const t2 = Date.parse('2026-10-25T01:30:00Z'); // 01:30 GMT
    const weekly = weekOpen('01:00:00', '02:00:00');
    expect(withinOpeningHours(t1, t1 + 60_000, ZONE, weekly)).toEqual(
      withinOpeningHours(t2, t2 + 60_000, ZONE, weekly),
    );
  });
});

// ─────────────────────────────────────────────────────────── the seven-entry weekday lookup ──

describe('withinOpeningHours — the weekday lookup (kills a lookup-table mutant per day)', () => {
  // 2026-06-14 is a Sunday; each successive day increments the weekday by one.
  const days = [
    { date: '2026-06-14', expected: 0 },
    { date: '2026-06-15', expected: 1 },
    { date: '2026-06-16', expected: 2 },
    { date: '2026-06-17', expected: 3 },
    { date: '2026-06-18', expected: 4 },
    { date: '2026-06-19', expected: 5 },
    { date: '2026-06-20', expected: 6 },
  ];

  it.each(days)('$date is closed-day dayOfWeek $expected, against a fully closed week', ({ date, expected }) => {
    const start = Date.parse(`${date}T10:00:00Z`);
    const verdict = withinOpeningHours(start, start + 60_000, ZONE, CLOSED_WEEK);
    expect(verdict).toEqual({ kind: 'closed-day', dayOfWeek: expected });
  });
});
