import { describe, expect, it } from 'vitest';
import { bookAppointment, toAppointmentView } from '../../../src/application/bookAppointment.js';
import type { BookCommand, BookDeps } from '../../../src/application/bookAppointment.js';
import type { Logger } from '../../../src/platform/logger.js';
import { orderCandidates } from '../../../src/domain/candidates.js';
import { scriptedDb } from '../helpers/stub-db.js';
import type { ScriptedStep } from '../helpers/stub-db.js';

/**
 * The LOOP, the PRUNING and the CLASSIFICATION — the parts of the booking path that are decisions
 * in code rather than facts about PostgreSQL.
 *
 * What PostgreSQL does is asserted against a real container by the test-engineer: that exactly one
 * row survives twenty racers (QS-1, QS-2), that the exclusion constraint is what adjudicates
 * (`tests/integration/exclusion-constraint-adjudicates.test.ts` removes it and watches it break),
 * and that ADR-0018's locks remove the deadlock. `CLAUDE.md` §2.2 puts every one of those there
 * and this file asserts none of them.
 *
 * What IS here: which candidate is tried next after a `23P01`, which resource a refusal names,
 * that a `40P01` is never retried, that a `23503` is never retried, and that the conflict line
 * I-02-6 added carries the three fields AC-3 and AC-4 read off stdout. Every one of those is a
 * branch this module owns, and a race cannot be arranged to exercise them one at a time.
 */

const DEALERSHIP = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SERVICE_TYPE = 'ssssssss-0000-4000-8000-000000000000';
const CUSTOMER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VEHICLE = 'vvvvvvvv-0000-4000-8000-000000000000';
const APPOINTMENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/**
 * The seed every case below injects. ADR-0009 makes ordering a pure function of
 * `(bays, technicians, seed)`, so fixing the seed fixes the order — which is the whole reason the
 * seed is a parameter rather than a global, and it is what lets a scripted database line its
 * answers up with the candidates the loop actually draws.
 */
const SEED = 2_026_0904;

/** Six bays, enough for a permutation to be visible and for a prune to have survivors. */
const bays6 = ['bay-0', 'bay-1', 'bay-2', 'bay-3', 'bay-4', 'bay-5'];

/**
 * The order the loop will draw, computed the way the loop computes it.
 *
 * This calls the SAME function under test's own dependency rather than restating a permutation,
 * deliberately: a literal expectation here would be a transcription of `mulberry32` and would
 * forbid the shuffle ever changing behind its contract. What it pins is the claim this file is
 * about — the loop draws in the order the DOMAIN gives it, in that order, and does not re-sort,
 * re-shuffle or ignore it.
 */
function drawn(
  bays: readonly string[],
  technicians: readonly string[],
): { readonly bays: readonly string[]; readonly technicians: readonly string[] } {
  const order = orderCandidates(bays, technicians, SEED);
  if (order === null) throw new Error('the fixture has no candidates');
  return order;
}

/** 10:00 local (BST) on Tuesday 2026-09-08, inside 08:00-18:00. */
const STARTS_AT_MILLIS = Date.parse('2026-09-08T09:00:00.000Z');

const COMMAND: BookCommand = {
  dealershipId: DEALERSHIP,
  customerId: CUSTOMER,
  vehicleId: VEHICLE,
  serviceTypeId: SERVICE_TYPE,
  startsAtMillis: STARTS_AT_MILLIS,
};

interface LogLine {
  readonly level: string;
  readonly record: Record<string, unknown>;
  readonly message: unknown;
}

function collectingDeps(): { deps: BookDeps; lines: LogLine[] } {
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
  return { deps: { newId: () => APPOINTMENT, seed: () => SEED, logger }, lines };
}

function pgError(code: string, constraint?: string): unknown {
  return Object.assign(new Error(`SQLSTATE ${code}`), {
    code,
    ...(constraint === undefined ? {} : { constraint }),
  });
}

const OPEN_ALL_WEEK = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day_of_week: day,
  opens_at: '08:00:00',
  closes_at: '18:00:00',
}));

function insertedRow(bayId: string, technicianId: string): Record<string, unknown> {
  return {
    id: APPOINTMENT,
    dealership_id: DEALERSHIP,
    customer_id: CUSTOMER,
    vehicle_id: VEHICLE,
    service_type_id: SERVICE_TYPE,
    technician_id: technicianId,
    bay_id: bayId,
    starts_at: new Date(STARTS_AT_MILLIS),
    ends_at: new Date(STARTS_AT_MILLIS + 3_600_000),
    status: 'confirmed',
  };
}

/**
 * The reference reads every booking makes before the loop: dealership, opening hours, service
 * type, bays, technicians. Then `attempts`, each of which is a lock statement followed by an
 * insert statement.
 */
function bookingScript(options: {
  readonly bays?: readonly string[];
  readonly technicians?: readonly string[];
  readonly durationMinutes?: number;
  readonly timeZone?: string;
  readonly hours?: readonly Record<string, unknown>[];
  readonly attempts: readonly ScriptedStep[];
}): readonly ScriptedStep[] {
  const bays = options.bays ?? ['bay-0'];
  const technicians = options.technicians ?? ['tech-0'];
  return [
    { rows: [{ id: DEALERSHIP, time_zone: options.timeZone ?? 'Europe/London' }] },
    { rows: options.hours ?? OPEN_ALL_WEEK },
    { rows: [{ duration_minutes: options.durationMinutes ?? 60 }] },
    { rows: bays.map((id) => ({ id })) },
    { rows: technicians.map((id) => ({ id })) },
    ...options.attempts,
  ];
}

/** One attempt: the advisory-lock statement, then the insert. */
function attempt(insert: ScriptedStep): readonly ScriptedStep[] {
  return [{ rows: [{}] }, insert];
}

describe('bookAppointment — the happy path', () => {
  it('confirms, and the view describes the row the DATABASE wrote', async () => {
    const { db } = scriptedDb(
      bookingScript({ attempts: [...attempt({ rows: [insertedRow('bay-0', 'tech-0')] })] }),
    );
    const { deps } = collectingDeps();

    const outcome = await bookAppointment(db, deps, COMMAND);
    expect(outcome.kind).toBe('confirmed');
    if (outcome.kind !== 'confirmed') return;
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

  it('opens ONE transaction per attempt, containing the lock statement and one INSERT (AC-5)', async () => {
    const { db, recorded, events } = scriptedDb(
      bookingScript({ attempts: [...attempt({ rows: [insertedRow('bay-0', 'tech-0')] })] }),
    );
    await bookAppointment(db, collectingDeps().deps, COMMAND);

    // AC-5's amended wording, asserted directly: "one transaction containing exactly one INSERT
    // into appointment, preceded only by ADR-0018's two advisory-lock acquisitions — which read
    // no table and decide nothing".
    expect(events).toEqual(['begin', 'commit']);

    const inTransaction = recorded.slice(5).map((q) => q.sql.replace(/\s+/g, ' ').trim());
    expect(inTransaction).toHaveLength(2);
    expect(inTransaction[0]).toContain('pg_advisory_xact_lock');
    expect(inTransaction[1]?.startsWith('insert into "appointment"')).toBe(true);
  });

  it('reads the appointment table NOWHERE before the insert (AC-5)', async () => {
    const { db, recorded } = scriptedDb(
      bookingScript({ attempts: [...attempt({ rows: [insertedRow('bay-0', 'tech-0')] })] }),
    );
    await bookAppointment(db, collectingDeps().deps, COMMAND);

    // Everything before the INSERT is reference data. If a `select ... from appointment` ever
    // appears here, check-then-act has a subject again.
    const beforeInsert = recorded.slice(0, -1).map((q) => q.sql).join('\n');
    expect(beforeInsert).not.toMatch(/appointment/i);
  });

  it('uses the injected id, so a retried attempt reuses it (DA-02-1)', async () => {
    const { db, recorded } = scriptedDb(
      bookingScript({
        bays: ['bay-0', 'bay-1'],
        attempts: [
          ...attempt({ error: pgError('23P01', 'no_bay_overlap') }),
          ...attempt({ rows: [insertedRow('bay-1', 'tech-0')] }),
        ],
      }),
    );
    await bookAppointment(db, collectingDeps().deps, COMMAND);

    // The failed attempt inserted nothing, so the id is still free. Minting a second one would
    // leak ids and make a retried booking indistinguishable from two bookings in a log.
    const insertParameters = recorded.filter((q) => q.sql.startsWith('insert')).map((q) => q.parameters[0]);
    expect(insertParameters).toEqual([APPOINTMENT, APPOINTMENT]);
  });
});

describe('bookAppointment — the loop prunes PER VALUE (T-02-1)', () => {
  it('a no_bay_overlap drops THAT bay and tries the next one', async () => {
    const { db } = scriptedDb(
      bookingScript({
        bays: ['bay-0', 'bay-1'],
        attempts: [
          ...attempt({ error: pgError('23P01', 'no_bay_overlap') }),
          ...attempt({ rows: [insertedRow('bay-1', 'tech-0')] }),
        ],
      }),
    );
    const outcome = await bookAppointment(db, collectingDeps().deps, COMMAND);
    expect(outcome.kind).toBe('confirmed');
    if (outcome.kind !== 'confirmed') return;
    // Emptying the WHOLE bay list on one failure would refuse here while bay-1 sits free. That
    // is the reading of ADR-0009 that made AC-4 fail under the design's earlier wording.
    expect(outcome.appointment.bayId).toBe('bay-1');
  });

  it('a no_technician_overlap drops THAT technician and keeps the bay', async () => {
    const { db } = scriptedDb(
      bookingScript({
        technicians: ['tech-0', 'tech-1'],
        attempts: [
          ...attempt({ error: pgError('23P01', 'no_technician_overlap') }),
          ...attempt({ rows: [insertedRow('bay-0', 'tech-1')] }),
        ],
      }),
    );
    const outcome = await bookAppointment(db, collectingDeps().deps, COMMAND);
    expect(outcome.kind).toBe('confirmed');
    if (outcome.kind !== 'confirmed') return;
    expect(outcome.appointment).toMatchObject({ bayId: 'bay-0', technicianId: 'tech-1' });
  });

  it('terminates in |bays| + |technicians| - 1 attempts, not |bays| x |technicians|', async () => {
    // Three bays and three technicians, every attempt refused on the bay. Per-VALUE pruning
    // walks the bays and refuses after 3 attempts; a per-PAIR prune would take 9.
    const { db, recorded } = scriptedDb(
      bookingScript({
        bays: ['bay-0', 'bay-1', 'bay-2'],
        technicians: ['tech-0', 'tech-1', 'tech-2'],
        attempts: [
          ...attempt({ error: pgError('23P01', 'no_bay_overlap') }),
          ...attempt({ error: pgError('23P01', 'no_bay_overlap') }),
          ...attempt({ error: pgError('23P01', 'no_bay_overlap') }),
        ],
      }),
    );
    const outcome = await bookAppointment(db, collectingDeps().deps, COMMAND);
    expect(outcome.kind).toBe('no-capacity');
    if (outcome.kind !== 'no-capacity') return;
    expect(outcome.attempts).toBe(3);
    expect(recorded.filter((q) => q.sql.startsWith('insert'))).toHaveLength(3);
  });
});

describe('bookAppointment — the loop walks ADR-0009 Order-C, not the repository\'s order', () => {
  it('attempts the bays in the order the DOMAIN drew, one per attempt, keeping the technician', async () => {
    // Six bays, three technicians, every attempt refused on the bay. The conflict lines are a
    // transcript of the walk: six attempts, the six bays in the drawn order, and the SAME
    // technician throughout because nothing ever pruned one.
    {
      const order = drawn(bays6, ['tech-0', 'tech-1', 'tech-2']);
      const { db } = scriptedDb(
        bookingScript({
          bays: bays6,
          technicians: ['tech-0', 'tech-1', 'tech-2'],
          attempts: Array.from({ length: 6 }, () =>
            attempt({ error: pgError('23P01', 'no_bay_overlap') }),
          ).flat(),
        }),
      );
      const { deps, lines } = collectingDeps();
      const outcome = await bookAppointment(db, deps, COMMAND);

      const conflicts = lines.filter((l) => l.record['event'] === 'booking.conflict');
      expect(
        conflicts.map((l) => l.record['bayId']),
        'the drawn order, in order — a loop that re-shuffled after each prune, or that walked ' +
          'the repository order, disagrees here',
      ).toEqual([...order.bays]);
      expect(
        [...new Set(conflicts.map((l) => l.record['technicianId']))],
        'a bay conflict prunes no technician, so the head technician stands for all six attempts',
      ).toEqual([order.technicians[0]]);
      expect(outcome).toMatchObject({ kind: 'no-capacity', resource: 'bay', attempts: 6 });
    }
  });

  it('draws EXACTLY ONE seed per request, so one request walks one permutation', async () => {
    // Drawing per attempt would re-shuffle mid-loop: the survivors would change order behind the
    // prune, and the seed the refusal reports would label a walk that never happened (ADR-0021).
    let draws = 0;
    const { deps } = collectingDeps();
    const seeded = {
      ...deps,
      seed: (): number => {
        draws += 1;
        return SEED;
      },
    };
    const { db } = scriptedDb(
      bookingScript({
        bays: bays6,
        attempts: Array.from({ length: 6 }, () =>
          attempt({ error: pgError('23P01', 'no_bay_overlap') }),
        ).flat(),
      }),
    );
    await bookAppointment(db, seeded, COMMAND);
    expect(draws).toBe(1);
  });

  it('a DIFFERENT seed attempts a different bay first — the injection is wired to the ordering', async () => {
    // The point of Order-C over Order-A, at the level this module owns: two requests in the same
    // process, identical in every other respect, do not queue on the same bay. The second seed is
    // searched for rather than guessed, so this is a claim about the wiring and not about
    // mulberry32's constants.
    const head = drawn(bays6, ['tech-0']).bays[0];
    let other = SEED;
    for (let candidate = SEED + 1; candidate < SEED + 64; candidate += 1) {
      const order = orderCandidates(bays6, ['tech-0'], candidate);
      if (order !== null && order.bays[0] !== head) {
        other = candidate;
        break;
      }
    }
    expect(other, 'no nearby seed permutes six bays differently — that is Order-A').not.toBe(SEED);

    const firstBayOf = async (seed: number): Promise<unknown> => {
      const { db } = scriptedDb(
        bookingScript({
          bays: bays6,
          // Six, because the loop walks the whole list before refusing; only the FIRST is read.
          attempts: Array.from({ length: 6 }, () =>
            attempt({ error: pgError('23P01', 'no_bay_overlap') }),
          ).flat(),
        }),
      );
      const { deps, lines } = collectingDeps();
      await bookAppointment(db, { ...deps, seed: () => seed }, COMMAND);
      return lines.find((l) => l.record['event'] === 'booking.conflict')?.record['bayId'];
    };
    expect(await firstBayOf(other)).not.toBe(await firstBayOf(SEED));
  });
});

describe('bookAppointment — the refusal names the SCARCE resource (E-02-1, AC-11)', () => {
  it('names `bay` when the bay list empties, even with technicians left over', async () => {
    const { db } = scriptedDb(
      bookingScript({
        bays: ['bay-0'],
        technicians: ['tech-0', 'tech-1', 'tech-2'],
        attempts: [...attempt({ error: pgError('23P01', 'no_bay_overlap') })],
      }),
    );
    const outcome = await bookAppointment(db, collectingDeps().deps, COMMAND);
    expect(outcome).toEqual({ kind: 'no-capacity', resource: 'bay', attempts: 1 });
  });

  it('names `technician` when the technician list empties, with 24 bays free', async () => {
    // AC-4's fixture in miniature, and the case a loop-less implementation gets WRONG: the first
    // attempt violates both constraints and PostgreSQL names `no_bay_overlap` (index creation
    // order), so without the loop this reports `bay` while bays 1 and 2 sit empty.
    const { db } = scriptedDb(
      bookingScript({
        bays: ['bay-0', 'bay-1', 'bay-2'],
        technicians: ['tech-0'],
        attempts: [
          ...attempt({ error: pgError('23P01', 'no_bay_overlap') }),
          ...attempt({ error: pgError('23P01', 'no_technician_overlap') }),
        ],
      }),
    );
    const outcome = await bookAppointment(db, collectingDeps().deps, COMMAND);
    expect(outcome).toEqual({ kind: 'no-capacity', resource: 'technician', attempts: 2 });
  });
});

describe('bookAppointment — the conflict line is the observer AC-3 and AC-4 read (I-02-6)', () => {
  it('writes one line per 23P01, carrying constraint, resource and attempt', async () => {
    const { db } = scriptedDb(
      bookingScript({
        bays: ['bay-0', 'bay-1'],
        technicians: ['tech-0'],
        attempts: [
          ...attempt({ error: pgError('23P01', 'no_bay_overlap') }),
          ...attempt({ error: pgError('23P01', 'no_technician_overlap') }),
        ],
      }),
    );
    const { deps, lines } = collectingDeps();
    await bookAppointment(db, deps, COMMAND);

    const order = drawn(['bay-0', 'bay-1'], ['tech-0']);
    const conflicts = lines.filter((l) => l.record['event'] === 'booking.conflict');
    expect(conflicts).toHaveLength(2);
    // The whole first record, so a dropped field is a failure here rather than at slice 09 when
    // QS-13's span is built from the same three facts. The pair is the one `orderCandidates` put
    // at the head under SEED, not the one the repository returned first: a loop that ignored the
    // order and walked the candidate list as read would fail here for every seed that permutes.
    expect(conflicts[0]?.record).toEqual({
      event: 'booking.conflict',
      constraint: 'no_bay_overlap',
      resource: 'bay',
      attempt: 1,
      bayId: order.bays[0],
      technicianId: order.technicians[0],
    });
    expect(conflicts.map((l) => l.record['constraint'])).toEqual([
      'no_bay_overlap',
      'no_technician_overlap',
    ]);
    expect(conflicts.map((l) => l.record['resource'])).toEqual(['bay', 'technician']);
    // "The loop actually looped" — the concurrency suite asserts at least two DISTINCT attempt
    // values across the conflict lines, so the counter must advance rather than being a constant.
    expect(conflicts.map((l) => l.record['attempt'])).toEqual([1, 2]);
  });

  it('names the event in BOTH pino renderings, because the harness accepts either', async () => {
    // `conflictRecords` in tests/support counts a record iff `event` OR `msg` is the event name.
    // Passing it as the message as well costs nothing and makes the line readable in a terminal.
    const { db } = scriptedDb(
      bookingScript({ attempts: [...attempt({ error: pgError('23P01', 'no_bay_overlap') })] }),
    );
    const { deps, lines } = collectingDeps();
    await bookAppointment(db, deps, COMMAND);
    expect(lines[0]?.message).toBe('booking.conflict');
  });

  it('writes NO conflict line when the booking is confirmed first time', async () => {
    const { db } = scriptedDb(
      bookingScript({ attempts: [...attempt({ rows: [insertedRow('bay-0', 'tech-0')] })] }),
    );
    const { deps, lines } = collectingDeps();
    await bookAppointment(db, deps, COMMAND);
    expect(lines.filter((l) => l.record['event'] === 'booking.conflict')).toEqual([]);
  });
});

describe('bookAppointment — 40P01 is not a refusal and is not retried (T-02-9, ADR-0018)', () => {
  it('answers no-verdict, which the edge renders as 500', async () => {
    const { db } = scriptedDb(
      bookingScript({
        bays: ['bay-0', 'bay-1'],
        attempts: [...attempt({ error: pgError('40P01') })],
      }),
    );
    const outcome = await bookAppointment(db, collectingDeps().deps, COMMAND);
    // A 409 here is not merely dishonest, it is UNCONSTRUCTIBLE: `no-verdict` mints no
    // ContendedResource, which is ADR-0016 answering T-02-9 before anyone argued it.
    expect(outcome).toEqual({ kind: 'no-verdict' });
  });

  it('does NOT try the next candidate — a retry would hide the fault it exists to detect', async () => {
    // Under ADR-0018's locks a deadlock can only mean some write path did not take them. If this
    // retried, F-02-9's inherited obligation would fail silently at slice 06 as a latency blip.
    // The script makes a second attempt a loud failure, so this is the assertion.
    const { db, recorded } = scriptedDb(
      bookingScript({
        bays: ['bay-0', 'bay-1', 'bay-2'],
        attempts: [...attempt({ error: pgError('40P01') })],
      }),
    );
    await bookAppointment(db, collectingDeps().deps, COMMAND);
    expect(recorded.filter((q) => q.sql.startsWith('insert'))).toHaveLength(1);
  });

  it('logs it at error, with the pair that deadlocked', async () => {
    const { db } = scriptedDb(
      bookingScript({ attempts: [...attempt({ error: pgError('40P01') })] }),
    );
    const { deps, lines } = collectingDeps();
    await bookAppointment(db, deps, COMMAND);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.level).toBe('error');
    // The WHOLE record, not a subset: a deadlock is the one failure here that someone must act
    // on, and the pair it deadlocked over is the only thing that says which write path skipped
    // ADR-0018's locks (F-02-9). A field quietly dropped from this object is a 500 nobody can
    // diagnose, and `toMatchObject` cannot see that.
    expect(lines[0]?.record).toEqual({
      event: 'booking.deadlock',
      bayId: 'bay-0',
      technicianId: 'tech-0',
      attempt: 1,
    });
    expect(lines[0]?.message).toBe('booking.deadlock');
  });
});

describe('bookAppointment — the reference taxonomy', () => {
  it('an unknown dealership is unknown-reference: dealership, before any candidate is read', async () => {
    const { db, recorded } = scriptedDb([{ rows: [] }]);
    expect(await bookAppointment(db, collectingDeps().deps, COMMAND)).toEqual({
      kind: 'unknown-reference',
      reference: 'dealership',
    });
    expect(recorded).toHaveLength(1);
  });

  it('an unknown service type is unknown-reference: service-type', async () => {
    const { db } = scriptedDb([
      { rows: [{ id: DEALERSHIP, time_zone: 'Europe/London' }] },
      { rows: OPEN_ALL_WEEK },
      { rows: [] },
    ]);
    expect(await bookAppointment(db, collectingDeps().deps, COMMAND)).toEqual({
      kind: 'unknown-reference',
      reference: 'service-type',
    });
  });

  it('NO QUALIFIED TECHNICIAN at this dealership is unknown-reference: service-type (I-02-8, ruled)', async () => {
    // An entirely ordinary state of an ordinary dealership — one that does not offer gearbox
    // rebuilds — and not broken data. The request names a (dealership, service-type) pair and
    // that pair does not resolve, which is the only sense in which this API knows service types.
    // A new `/problems/service-not-offered` row was considered and refused: no AC names it.
    const { db } = scriptedDb(
      bookingScript({ technicians: [], attempts: [] }),
    );
    expect(await bookAppointment(db, collectingDeps().deps, COMMAND)).toEqual({
      kind: 'unknown-reference',
      reference: 'service-type',
    });
  });

  it('ZERO BAYS is reference-data-invalid — a 500, and the OTHER half of the same ruling', async () => {
    // A dealership with no bays cannot perform ANY service. That is a mis-seeded dealership and
    // the system's fault, so a 422 would tell a service advisor to correct something they did
    // not send and cannot see. The two empty cases are different failures and collapsing them
    // was the design defect ruled at step 2.
    const { db } = scriptedDb(bookingScript({ bays: [], technicians: ['tech-0'], attempts: [] }));
    const { deps, lines } = collectingDeps();
    const outcome = await bookAppointment(db, deps, COMMAND);
    expect(outcome).toEqual({ kind: 'reference-data-invalid', detail: 'no-service-bays' });
    expect(lines[0]?.level).toBe('error');
    // The dealership id is the whole operational value of this line: the client is told nothing
    // it could act on, so the id is the only thing that says WHICH dealership is mis-seeded.
    expect(lines[0]?.record).toEqual({
      event: 'booking.reference-data-invalid',
      dealershipId: DEALERSHIP,
    });
    expect(lines[0]?.message).toBe('dealership has no service bays');
  });

  it('a 23503 on the ownership FK is disambiguated AFTER the refusal (ADR-0017)', async () => {
    for (const [row, expected] of [
      [{ customer_exists: false, vehicle_exists: true }, { kind: 'unknown-reference', reference: 'customer' }],
      [{ customer_exists: true, vehicle_exists: false }, { kind: 'unknown-reference', reference: 'vehicle' }],
      [{ customer_exists: true, vehicle_exists: true }, { kind: 'vehicle-not-owned' }],
    ] as const) {
      const { db } = scriptedDb(
        bookingScript({
          attempts: [
            ...attempt({ error: pgError('23503', 'appointment_vehicle_owned_by_customer') }),
            { rows: [row] },
          ],
        }),
      );
      expect(await bookAppointment(db, collectingDeps().deps, COMMAND)).toEqual(expected);
    }
  });

  it('a 23503 is NEVER retried — a reference resolves no better on another bay', async () => {
    const { db, recorded } = scriptedDb(
      bookingScript({
        bays: ['bay-0', 'bay-1', 'bay-2'],
        attempts: [
          ...attempt({ error: pgError('23503', 'appointment_vehicle_owned_by_customer') }),
          { rows: [{ customer_exists: true, vehicle_exists: true }] },
        ],
      }),
    );
    await bookAppointment(db, collectingDeps().deps, COMMAND);
    expect(recorded.filter((q) => q.sql.startsWith('insert'))).toHaveLength(1);
  });

  it('any OTHER composite FK is reference-data-invalid — the candidate query and the constraints disagree', async () => {
    const { db } = scriptedDb(
      bookingScript({
        attempts: [...attempt({ error: pgError('23503', 'appointment_technician_qualified') })],
      }),
    );
    const { deps, lines } = collectingDeps();
    expect(await bookAppointment(db, deps, COMMAND)).toEqual({
      kind: 'reference-data-invalid',
      detail: 'appointment_technician_qualified',
    });
    expect(lines[0]?.level).toBe('error');
    expect(lines[0]?.record).toEqual({
      event: 'booking.reference-data-invalid',
      constraint: 'appointment_technician_qualified',
      dealershipId: DEALERSHIP,
      bayId: 'bay-0',
      technicianId: 'tech-0',
    });
    expect(lines[0]?.message).toBe('a candidate was refused by a composite foreign key');
  });

  it('an unclassifiable error is RETHROWN, never turned into a refusal', async () => {
    // `classify` is total and everything it cannot name is a fault. Swallowing it here would
    // make an `undefined_column` look like a capacity problem to the client and to the metric.
    const broken = pgError('42703');
    const { db } = scriptedDb(bookingScript({ attempts: [...attempt({ error: broken })] }));
    await expect(bookAppointment(db, collectingDeps().deps, COMMAND)).rejects.toBe(broken);
  });
});

describe('bookAppointment — the derivation outcomes reach the edge unchanged', () => {
  it('an unparseable instant is malformed-instant', async () => {
    const { db } = scriptedDb(bookingScript({ attempts: [] }));
    expect(
      await bookAppointment(db, collectingDeps().deps, { ...COMMAND, startsAtMillis: Number.NaN }),
    ).toEqual({ kind: 'malformed-instant' });
  });

  it('an out-of-hours interval is outside-opening-hours, carrying the verdict', async () => {
    // AC-7 names this explicitly: out-of-hours is NOT a capacity conflict. The script has no
    // attempts at all, so any insert would be a loud failure — which is the assertion that this
    // is decided before capacity is ever consulted.
    const { db } = scriptedDb(bookingScript({ attempts: [] }));
    const outcome = await bookAppointment(db, collectingDeps().deps, {
      ...COMMAND,
      startsAtMillis: Date.parse('2026-09-08T22:00:00.000Z'),
    });
    expect(outcome.kind).toBe('outside-opening-hours');
  });

  it('an unresolvable time_zone is reference-data-invalid, logged at error', async () => {
    const { db } = scriptedDb(bookingScript({ timeZone: 'Not/AZone', attempts: [] }));
    const { deps, lines } = collectingDeps();
    expect(await bookAppointment(db, deps, COMMAND)).toEqual({
      kind: 'reference-data-invalid',
      detail: 'unknown-zone',
    });
    expect(lines[0]?.level).toBe('error');
    expect(lines[0]?.record).toEqual({
      event: 'booking.reference-data-invalid',
      dealershipId: DEALERSHIP,
      verdict: 'unknown-zone',
    });
    expect(lines[0]?.message).toBe('dealership reference data cannot be read');
  });

  it('a non-positive service type duration is reference-data-invalid, not a client error', async () => {
    // The column carries `CHECK (duration_minutes > 0)` and the client never sends a duration,
    // so a 4xx would blame the wrong party.
    const { db } = scriptedDb(bookingScript({ durationMinutes: 0, attempts: [] }));
    const { deps, lines } = collectingDeps();
    expect(await bookAppointment(db, deps, COMMAND)).toEqual({
      kind: 'reference-data-invalid',
      detail: 'service-type-duration',
    });
    expect(lines[0]?.record).toEqual({
      event: 'booking.reference-data-invalid',
      serviceTypeId: SERVICE_TYPE,
    });
    expect(lines[0]?.message).toBe('service type duration is not a positive integer');
  });
});

describe('toAppointmentView', () => {
  it('renders the instants as ISO-8601 UTC, never in a local zone (DA-02-2)', () => {
    const view = toAppointmentView({
      id: APPOINTMENT,
      dealershipId: DEALERSHIP,
      customerId: CUSTOMER,
      vehicleId: VEHICLE,
      serviceTypeId: SERVICE_TYPE,
      technicianId: 'tech-0',
      bayId: 'bay-0',
      startsAt: new Date('2026-09-08T09:00:00.000Z'),
      endsAt: new Date('2026-09-08T10:00:00.000Z'),
      status: 'confirmed',
    });
    // The dealership is in Europe/London and it is BST, so a local rendering would read 10:00
    // and 11:00. Rendering locally would put zone reasoning in a layer QS-12 forbids it in.
    expect(view.startsAt).toBe('2026-09-08T09:00:00.000Z');
    expect(view.endsAt).toBe('2026-09-08T10:00:00.000Z');
  });

  it('carries the status through rather than writing `confirmed` in', () => {
    // Slice 05 must render `cancelled` at this same URL. A hard-coded literal here — or in the
    // response schema — makes that slice's own test unable to fail (measurement 8).
    const view = toAppointmentView({
      id: APPOINTMENT,
      dealershipId: DEALERSHIP,
      customerId: CUSTOMER,
      vehicleId: VEHICLE,
      serviceTypeId: SERVICE_TYPE,
      technicianId: 'tech-0',
      bayId: 'bay-0',
      startsAt: new Date('2026-09-08T09:00:00.000Z'),
      endsAt: new Date('2026-09-08T10:00:00.000Z'),
      status: 'cancelled',
    });
    expect(view.status).toBe('cancelled');
  });
});
