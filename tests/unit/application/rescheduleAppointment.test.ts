import { describe, expect, it } from 'vitest';
import { rescheduleAppointment } from '../../../src/application/rescheduleAppointment.js';
import type { RescheduleCommand, RescheduleDeps } from '../../../src/application/rescheduleAppointment.js';
import type { Logger } from '../../../src/platform/logger.js';
import { scriptedDb } from '../helpers/stub-db.js';
import type { ScriptedStep } from '../helpers/stub-db.js';

/**
 * ADR-0025's ordering, ADR-0027's attempt-1-then-shuffle loop, and the classification arms —
 * the parts of the reschedule path that are decisions in code rather than facts about
 * PostgreSQL. What PostgreSQL does (AC-1's self-overlap, AC-2's one-statement claim) is asserted
 * against a real container in `tests/integration/`, by the test-engineer.
 */

const APPOINTMENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEALERSHIP = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CUSTOMER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VEHICLE = 'vvvvvvvv-0000-4000-8000-000000000000';
const SERVICE_TYPE = 'ssssssss-0000-4000-8000-000000000000';

const SEED = 2_026_0906;
const ATTEMPT_CAP = 16;

const OPEN_ALL_WEEK = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day_of_week: day,
  opens_at: '08:00:00',
  closes_at: '18:00:00',
}));

const COMMAND: RescheduleCommand = {
  id: APPOINTMENT,
  // 10:00 local (BST) on Tuesday 2026-09-08, inside 08:00-18:00.
  startsAtMillis: Date.parse('2026-09-08T09:00:00.000Z'),
};

const EXISTING_ROW = {
  id: APPOINTMENT,
  dealership_id: DEALERSHIP,
  customer_id: CUSTOMER,
  vehicle_id: VEHICLE,
  service_type_id: SERVICE_TYPE,
  technician_id: 'tech-0',
  bay_id: 'bay-0',
  starts_at: new Date('2026-09-08T07:00:00.000Z'),
  ends_at: new Date('2026-09-08T08:00:00.000Z'),
  status: 'confirmed',
};

interface LogLine {
  readonly level: string;
  readonly record: Record<string, unknown>;
  readonly message: unknown;
}

function collectingDeps(): { deps: RescheduleDeps; lines: LogLine[] } {
  const lines: LogLine[] = [];
  const record =
    (level: string) =>
    (obj: unknown, message?: unknown): void => {
      lines.push({ level, record: obj as Record<string, unknown>, message });
    };
  const logger = {
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    debug: record('debug'),
    trace: record('trace'),
    fatal: record('fatal'),
  } as unknown as Logger;
  return { deps: { seed: () => SEED, attemptCap: ATTEMPT_CAP, logger }, lines };
}

function pgError(code: string, constraint?: string): unknown {
  return Object.assign(new Error(`SQLSTATE ${code}`), {
    code,
    ...(constraint === undefined ? {} : { constraint }),
  });
}

function movedRow(bayId: string, technicianId: string): Record<string, unknown> {
  return {
    ...EXISTING_ROW,
    technician_id: technicianId,
    bay_id: bayId,
    starts_at: new Date(COMMAND.startsAtMillis),
    ends_at: new Date(COMMAND.startsAtMillis + 3_600_000),
  };
}

/**
 * The reads before any attempt: the existing row, its dealership, its opening hours, its
 * service type, then the candidate bays and technicians for re-allocation.
 */
function rescheduleScript(options: {
  readonly existing?: Record<string, unknown> | null;
  readonly bays?: readonly string[];
  readonly technicians?: readonly string[];
  readonly durationMinutes?: number;
  readonly timeZone?: string;
  readonly hours?: readonly Record<string, unknown>[];
  readonly attempts: readonly ScriptedStep[];
}): readonly ScriptedStep[] {
  const existing = options.existing === undefined ? EXISTING_ROW : options.existing;
  const bays = options.bays ?? ['bay-0'];
  const technicians = options.technicians ?? ['tech-0'];
  const steps: ScriptedStep[] = [{ rows: existing === null ? [] : [existing] }];
  if (existing === null) return steps;
  steps.push(
    { rows: [{ id: DEALERSHIP, time_zone: options.timeZone ?? 'Europe/London' }] },
    { rows: options.hours ?? OPEN_ALL_WEEK },
    { rows: [{ duration_minutes: options.durationMinutes ?? 60 }] },
    { rows: bays.map((id) => ({ id })) },
    { rows: technicians.map((id) => ({ id })) },
    ...options.attempts,
  );
  return steps;
}

/** One attempt: the advisory-lock statement, then the guarded UPDATE. */
function attempt(update: ScriptedStep): readonly ScriptedStep[] {
  return [{ rows: [{}] }, update];
}

describe('rescheduleAppointment — the happy path', () => {
  it('moves, and the view describes the row the DATABASE wrote', async () => {
    const { db } = scriptedDb(
      rescheduleScript({ attempts: [...attempt({ rows: [movedRow('bay-0', 'tech-0')] })] }),
    );
    const outcome = await rescheduleAppointment(db, collectingDeps().deps, COMMAND);
    expect(outcome.kind).toBe('moved');
    if (outcome.kind !== 'moved') return;
    expect(outcome.appointment).toEqual({
      id: APPOINTMENT,
      dealershipId: DEALERSHIP,
      customerId: CUSTOMER,
      vehicleId: VEHICLE,
      serviceTypeId: SERVICE_TYPE,
      technicianId: 'tech-0',
      bayId: 'bay-0',
      startsAt: '2026-09-08T09:00:00.000Z',
      endsAt: '2026-09-08T10:00:00.000Z',
      status: 'confirmed',
    });
  });

  it('ADR-0027 — attempt 1 is the appointment\'s OWN pair, tried before any shuffle', async () => {
    // Six candidate bays, but attempt 1 must be the row's own bay-0/tech-0 — never a drawn one.
    const bays6 = ['bay-0', 'bay-1', 'bay-2', 'bay-3', 'bay-4', 'bay-5'];
    const { db, recorded } = scriptedDb(
      rescheduleScript({
        bays: bays6,
        attempts: [...attempt({ rows: [movedRow('bay-0', 'tech-0')] })],
      }),
    );
    const outcome = await rescheduleAppointment(db, collectingDeps().deps, COMMAND);
    expect(outcome.kind).toBe('moved');
    // The lock statement (the first query after the six reference reads) must lock bay-0 and
    // tech-0 — the row's own pair — not a drawn candidate.
    const lockCall = recorded[6];
    expect(lockCall?.parameters).toEqual(['bay-0', 'tech-0']);
  });

  it('ADR-0027 — on the incumbent pair\'s 23P01, the SHUFFLE runs over all candidates for the remainder', async () => {
    const { db } = scriptedDb(
      rescheduleScript({
        bays: ['bay-0', 'bay-1'],
        attempts: [
          ...attempt({ error: pgError('23P01', 'no_bay_overlap') }),
          ...attempt({ rows: [movedRow('bay-1', 'tech-0')] }),
        ],
      }),
    );
    const outcome = await rescheduleAppointment(db, collectingDeps().deps, COMMAND);
    expect(outcome.kind).toBe('moved');
    if (outcome.kind !== 'moved') return;
    // Re-allocated off the incumbent bay, which the fixture's single technician means it must be.
    expect(outcome.appointment.bayId).toBe('bay-1');
  });

  it('AC-1 — zero rows means not-confirmed, at ANY attempt, with no follow-up read', async () => {
    const { db, recorded } = scriptedDb(
      rescheduleScript({ attempts: [...attempt({ rows: [] })] }),
    );
    const outcome = await rescheduleAppointment(db, collectingDeps().deps, COMMAND);
    expect(outcome).toEqual({ kind: 'not-confirmed' });
    // Exactly the six reference reads plus the lock and the UPDATE — no eighth read.
    expect(recorded).toHaveLength(8);
  });

  it('AC-5 — an unknown id is not-found, decided by the READ, and the guarded UPDATE is never issued', async () => {
    const { db, recorded } = scriptedDb(rescheduleScript({ existing: null, attempts: [] }));
    const outcome = await rescheduleAppointment(db, collectingDeps().deps, COMMAND);
    expect(outcome).toEqual({ kind: 'not-found' });
    expect(recorded).toHaveLength(1);
  });
});

describe('rescheduleAppointment — ADR-0025 decision 4: the domain rule runs before the status guard', () => {
  it('a cancelled appointment moved out of hours is outside-opening-hours, NOT not-confirmed', async () => {
    // The row's own status is never read into this decision at all: `rescheduleAppointment`
    // does not even look at `existing.status` before deriving the interval.
    const { db, recorded } = scriptedDb(
      rescheduleScript({
        existing: { ...EXISTING_ROW, status: 'cancelled' },
        hours: [
          { day_of_week: 2, opens_at: '09:00:00', closes_at: '17:00:00' },
        ],
        attempts: [],
      }),
    );
    const outcome = await rescheduleAppointment(db, collectingDeps().deps, {
      ...COMMAND,
      startsAtMillis: Date.parse('2026-09-08T22:00:00.000Z'),
    });
    expect(outcome.kind).toBe('outside-opening-hours');
    // Only the four reference reads (existing row, dealership, opening hours, service type) —
    // the domain rule refused before candidates were even read, let alone any lock or UPDATE.
    expect(recorded).toHaveLength(4);
  });
});

describe('rescheduleAppointment — the derivation outcomes reach the edge unchanged', () => {
  it('an unparseable instant is malformed-instant', async () => {
    const { db } = scriptedDb(rescheduleScript({ attempts: [] }));
    const outcome = await rescheduleAppointment(db, collectingDeps().deps, {
      ...COMMAND,
      startsAtMillis: Number.NaN,
    });
    expect(outcome).toEqual({ kind: 'malformed-instant' });
  });

  it('an unresolvable time_zone is reference-data-invalid, logged at error', async () => {
    const { db } = scriptedDb(rescheduleScript({ timeZone: 'Not/AZone', attempts: [] }));
    const { deps, lines } = collectingDeps();
    const outcome = await rescheduleAppointment(db, deps, COMMAND);
    expect(outcome).toEqual({ kind: 'reference-data-invalid', detail: 'unknown-zone' });
    expect(lines[0]?.level).toBe('error');
  });

  it('a non-positive service type duration is reference-data-invalid, not a client error', async () => {
    const { db } = scriptedDb(rescheduleScript({ durationMinutes: 0, attempts: [] }));
    const outcome = await rescheduleAppointment(db, collectingDeps().deps, COMMAND);
    expect(outcome).toEqual({ kind: 'reference-data-invalid', detail: 'service-type-duration' });
  });
});

describe('rescheduleAppointment — the loop prunes and refuses exactly as booking\'s does', () => {
  it('exhausts when every candidate conflicts, naming the SCARCE resource', async () => {
    // A SINGLE bay: attempt 1 is the incumbent pair (bay-0/tech-0, tried directly); attempt 2
    // draws ADR-0027's shuffle over the full candidate lists, which still has bay-0 as its only
    // member — so it necessarily retries bay-0 (T-06-... the bounded extra cost ADR-0027 names)
    // and THAT conflict is what empties the bay list.
    const { db } = scriptedDb(
      rescheduleScript({
        bays: ['bay-0'],
        technicians: ['tech-0', 'tech-1', 'tech-2'],
        attempts: [
          ...attempt({ error: pgError('23P01', 'no_bay_overlap') }),
          ...attempt({ error: pgError('23P01', 'no_bay_overlap') }),
        ],
      }),
    );
    const outcome = await rescheduleAppointment(db, collectingDeps().deps, COMMAND);
    expect(outcome).toEqual({ kind: 'no-capacity', resource: 'bay', attempts: 2, exit: 'exhausted' });
  });

  it('the attempt cap stops the loop with candidates still untried, and says CAPPED', async () => {
    const { db } = scriptedDb(
      rescheduleScript({
        bays: Array.from({ length: 20 }, (_unused, i) => `bay-${String(i)}`),
        technicians: ['tech-0'],
        attempts: Array.from({ length: ATTEMPT_CAP }, () =>
          attempt({ error: pgError('23P01', 'no_bay_overlap') }),
        ).flat(),
      }),
    );
    const outcome = await rescheduleAppointment(db, collectingDeps().deps, COMMAND);
    expect(outcome).toEqual({ kind: 'no-capacity', resource: 'bay', attempts: ATTEMPT_CAP, exit: 'capped' });
  });

  it('writes the booking.conflict line at attempt 1 for the incumbent pair, and booking.refused on exhaustion', async () => {
    // A single bay AND a single technician: attempt 2's shuffle necessarily redraws the exact
    // same pair attempt 1 just tried, so both attempts conflict on the same bay before it empties.
    const { db } = scriptedDb(
      rescheduleScript({
        bays: ['bay-0'],
        attempts: [
          ...attempt({ error: pgError('23P01', 'no_bay_overlap') }),
          ...attempt({ error: pgError('23P01', 'no_bay_overlap') }),
        ],
      }),
    );
    const { deps, lines } = collectingDeps();
    await rescheduleAppointment(db, deps, COMMAND);
    const conflicts = lines.filter((l) => l.record['event'] === 'booking.conflict');
    expect(conflicts).toHaveLength(2);
    expect(conflicts[0]?.record).toEqual({
      event: 'booking.conflict',
      constraint: 'no_bay_overlap',
      resource: 'bay',
      attempt: 1,
      bayId: 'bay-0',
      technicianId: 'tech-0',
    });
    const refusals = lines.filter((l) => l.record['event'] === 'booking.refused');
    expect(refusals).toHaveLength(1);
    expect(refusals[0]?.record).toEqual({
      event: 'booking.refused',
      exit: 'exhausted',
      resource: 'bay',
      attempts: 2,
      seed: SEED,
    });
  });
});

describe('rescheduleAppointment — 40P01 and 23503 are never retried', () => {
  it('a 40P01 answers no-verdict', async () => {
    const { db } = scriptedDb(rescheduleScript({ attempts: [...attempt({ error: pgError('40P01') })] }));
    const outcome = await rescheduleAppointment(db, collectingDeps().deps, COMMAND);
    expect(outcome).toEqual({ kind: 'no-verdict' });
  });

  it('a 23503 is reference-data-invalid — unreachable in a consistent database, guarded anyway', async () => {
    const { db } = scriptedDb(
      rescheduleScript({ attempts: [...attempt({ error: pgError('23503', 'appointment_technician_qualified') })] }),
    );
    const outcome = await rescheduleAppointment(db, collectingDeps().deps, COMMAND);
    expect(outcome).toEqual({
      kind: 'reference-data-invalid',
      detail: 'appointment_technician_qualified',
    });
  });

  it('an unclassifiable error is RETHROWN, never turned into a refusal', async () => {
    const broken = pgError('42703');
    const { db } = scriptedDb(rescheduleScript({ attempts: [...attempt({ error: broken })] }));
    await expect(rescheduleAppointment(db, collectingDeps().deps, COMMAND)).rejects.toBe(broken);
  });
});
