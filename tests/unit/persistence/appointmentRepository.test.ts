import { describe, expect, it } from 'vitest';
import {
  busyResources,
  cancelAppointmentById,
  findAppointmentById,
  insertAppointment,
  lockAppointmentRow,
  lockResources,
  rescheduleAppointmentById,
} from '../../../src/persistence/appointmentRepository.js';
import type { ResourceLock } from '../../../src/persistence/appointmentRepository.js';
import { scriptedDb } from '../helpers/stub-db.js';

/**
 * The SQL, and only the SQL. What PostgreSQL DOES with it — that exactly one row survives twenty
 * racers, that `23P01` names `no_bay_overlap`, that the locks remove the deadlock — is asserted
 * against a real container in `tests/integration/` and `tests/concurrency/`, by the test-engineer.
 * `CLAUDE.md` §2.2: a test that mocks the database does not test the invariant that lives in it.
 *
 * These exist because the SQL is where three separate decisions of this slice are visible at once
 * and nowhere else: that the insert is ONE statement with no `ON CONFLICT`, that the two advisory
 * locks are ONE statement in the right classes, and that nothing on this path reads the table
 * before writing to it.
 */

const IDS = {
  appointment: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  dealership: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  customer: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  vehicle: 'vvvvvvvv-0000-4000-8000-000000000000',
  serviceType: 'ssssssss-0000-4000-8000-000000000000',
  technician: 'tttttttt-0000-4000-8000-000000000000',
  bay: 'bbbbbbbb-0000-4000-8000-000000000000',
};

const STARTS_AT = new Date('2026-09-08T09:00:00.000Z');
const ENDS_AT = new Date('2026-09-08T10:00:00.000Z');

/** ADR-0026: no `bayId`/`technicianId` here — the write reads them off the LOCK. */
const NEW_APPOINTMENT = {
  id: IDS.appointment,
  dealershipId: IDS.dealership,
  customerId: IDS.customer,
  vehicleId: IDS.vehicle,
  serviceTypeId: IDS.serviceType,
  startsAt: STARTS_AT,
  endsAt: ENDS_AT,
};

/** A `ResourceLock` a test can hand a write directly, without going through `lockResources`. */
const LOCK = { bayId: IDS.bay, technicianId: IDS.technician } as ResourceLock;

const RETURNED_ROW = {
  id: IDS.appointment,
  dealership_id: IDS.dealership,
  customer_id: IDS.customer,
  vehicle_id: IDS.vehicle,
  service_type_id: IDS.serviceType,
  technician_id: IDS.technician,
  bay_id: IDS.bay,
  starts_at: STARTS_AT,
  ends_at: ENDS_AT,
  status: 'confirmed',
};

const OTHER_BAY = 'bbbbbbbb-1111-4111-8111-111111111111';
const OTHER_TECHNICIAN = 'tttttttt-1111-4111-8111-111111111111';

describe('lockResources — ADR-0018, extended by ADR-0030', () => {
  it('booking (leave: null) is ONE statement, DISTINCT-collapsed to the same two keys ADR-0018 always locked', async () => {
    // `vacated = leave ?? { bayId, technicianId }` — a booking's `leave: null` folds `vacated`
    // back onto `take`, so the four-key array carries the same pair twice and `DISTINCT`
    // collapses it back to the two locks ADR-0018 always took, class 1 then class 2. R-07-8:
    // what is genuinely UNCHANGED by ADR-0030 is that SET of advisory locks acquired — not the
    // raw statement text. Slice 06 sent two parameters; this sends four (deduplicated inside
    // SQL, never in JS), so "byte-for-byte what slice 06 sent" was never literally true of the
    // parameter list below. No test executes the deduplicated lock set directly — it is argued
    // from `DISTINCT`, and this test pins the statement and parameters that argument rests on.
    const { db, recorded } = scriptedDb([{ rows: [{ pg_advisory_xact_lock: null }] }]);
    await lockResources(db, IDS.bay, IDS.technician, null);

    expect(recorded).toHaveLength(1);
    const sql = (recorded[0]?.sql ?? '').replace(/\s+/g, ' ').trim();
    expect(sql).toBe(
      'select pg_advisory_xact_lock(cl, k) from ( select distinct cl, hashtext(key) as k ' +
        'from unnest( array[1, 2, 1, 2], array[$1, $2, $3, $4] ) as t(cl, key) ' +
        'order by cl, hashtext(key) ) o',
    );
    expect(recorded[0]?.parameters).toEqual([IDS.bay, IDS.technician, IDS.bay, IDS.technician]);
  });

  it('a move (leave: the incumbent pair) locks the union — up to four keys, classes repeated 1, 2, 1, 2', async () => {
    // ADR-0030's whole mechanism: the pair the write TAKES and the pair it LEAVES both go in,
    // in that order, and `DISTINCT ... ORDER BY (class, hashtext(key))` is what turns that into
    // a total order rather than a coin flip between two racers who took the two pairs in
    // opposite roles.
    const { db, recorded } = scriptedDb([{ rows: [{}] }]);
    await lockResources(db, IDS.bay, IDS.technician, {
      bayId: OTHER_BAY,
      technicianId: OTHER_TECHNICIAN,
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.parameters).toEqual([
      IDS.bay,
      IDS.technician,
      OTHER_BAY,
      OTHER_TECHNICIAN,
    ]);
    const sql = (recorded[0]?.sql ?? '').replace(/\s+/g, ' ').trim();
    expect(sql).toContain('array[1, 2, 1, 2]');
    expect(sql).toContain('distinct');
    expect(sql).toContain('order by cl, hashtext(key)');
  });

  it('the two racers of a mutually-vacating pair send the same MULTISET of keys — necessary for the total order, not by itself what rules out a cycle (R-07-2)', async () => {
    // Racer 1 takes P1 and leaves P2; racer 2 takes P2 and leaves P1. Neither statement sorts
    // its own parameters in JS — the four keys arrive in call order and it is the SQL's
    // `DISTINCT ... ORDER BY (class, hashtext(key))` that turns them into one sequence, so the
    // only claim a unit test can pin is that both calls hand the database the SAME multiset.
    // What that multiset does NOT by itself establish is deadlock freedom — the docblock this
    // pins to (`lockResources`, R-07-2) names two other mechanisms this test does not exercise:
    // the total order's own acyclicity, and ADR-0030/ADR-0031's completeness for the tuple-wait
    // half. AC-4's own fixture is not even this symmetric case, and is protected regardless.
    const p1 = { bayId: IDS.bay, technicianId: IDS.technician };
    const p2 = { bayId: OTHER_BAY, technicianId: OTHER_TECHNICIAN };

    const racer1 = scriptedDb([{ rows: [{}] }]);
    await lockResources(racer1.db, p1.bayId, p1.technicianId, p2);
    const racer2 = scriptedDb([{ rows: [{}] }]);
    await lockResources(racer2.db, p2.bayId, p2.technicianId, p1);

    const keysOf = (recorded: typeof racer1.recorded): unknown[] =>
      [...((recorded[0]?.parameters ?? []) as unknown[])].sort();
    expect(keysOf(racer1.recorded)).toEqual(keysOf(racer2.recorded));
  });

  it('ADR-0026 — returns a lock carrying the pair it TOOK, never the pair it left', async () => {
    const { db } = scriptedDb([{ rows: [{}] }]);
    const lock = await lockResources(db, IDS.bay, IDS.technician, {
      bayId: OTHER_BAY,
      technicianId: OTHER_TECHNICIAN,
    });
    expect(lock).toEqual({ bayId: IDS.bay, technicianId: IDS.technician });
  });

  it('is the TRANSACTION-scoped lock, never the session-scoped one', async () => {
    // `pg_advisory_lock` would survive the attempt and be held across the next candidate, which
    // turns the retry loop into a lock accumulator and deadlocks on the second attempt. The two
    // functions differ by one word, so the word is asserted.
    const { db, recorded } = scriptedDb([{ rows: [{}] }]);
    await lockResources(db, IDS.bay, IDS.technician, null);
    expect(recorded[0]?.sql).toContain('pg_advisory_xact_lock');
    expect(recorded[0]?.sql).not.toMatch(/pg_advisory_lock\b/);
  });

  it('reads no table — the lock decides nothing (§4.5, ADR-0018)', async () => {
    // The keys are `hashtext` of REFERENCE ids. If this statement ever grew a read of
    // `appointment` the lock would stop being liveness and start being correctness, which is
    // precisely the reading ADR-0018's two controls exist to keep true.
    const { db, recorded } = scriptedDb([{ rows: [{}] }]);
    await lockResources(db, IDS.bay, IDS.technician, null);
    expect(recorded[0]?.sql).not.toMatch(/appointment/i);
    expect(recorded[0]?.sql).not.toMatch(/\bselect\b[\s\S]*\bfrom\b\s+"/);
  });
});

describe('lockAppointmentRow — ADR-0031', () => {
  it('is a `SELECT … FOR UPDATE` reading exactly bay_id and technician_id by id', async () => {
    const { db, recorded } = scriptedDb([
      { rows: [{ bay_id: IDS.bay, technician_id: IDS.technician }] },
    ]);
    await lockAppointmentRow(db, IDS.appointment);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.sql).toBe(
      'select "bay_id", "technician_id" from "appointment" where "id" = $1 for update',
    );
    expect(recorded[0]?.parameters).toEqual([IDS.appointment]);
  });

  it('maps the row to a ResourcePair, camelCased', async () => {
    const { db } = scriptedDb([{ rows: [{ bay_id: IDS.bay, technician_id: IDS.technician }] }]);
    const pair = await lockAppointmentRow(db, IDS.appointment);
    expect(pair).toEqual({ bayId: IDS.bay, technicianId: IDS.technician });
  });

  it('returns the pair the DATABASE holds NOW, not a value the caller already had', async () => {
    // The whole point of ADR-0031: whatever this statement returns is what `lockResources`
    // locks against, so a row relocated underneath a stale caller-held value is exactly what
    // a fresh read here corrects.
    const { db } = scriptedDb([{ rows: [{ bay_id: OTHER_BAY, technician_id: OTHER_TECHNICIAN }] }]);
    const pair = await lockAppointmentRow(db, IDS.appointment);
    expect(pair).toEqual({ bayId: OTHER_BAY, technicianId: OTHER_TECHNICIAN });
  });

  it('throws rather than returning null on zero rows — the read is TOTAL (ADR-0003: ids are minted, rows are never deleted)', async () => {
    // `executeTakeFirstOrThrow`, deliberately, not `| null`: an id this function is called
    // with is always the id `findAppointmentById` already found a row at, so zero rows here
    // is unreachable rather than a case to branch on.
    const { db } = scriptedDb([{ rows: [] }]);
    await expect(lockAppointmentRow(db, IDS.appointment)).rejects.toBeDefined();
  });
});

describe('insertAppointment', () => {
  it('is ONE statement, an INSERT, with no ON CONFLICT and no pre-read (AC-5)', async () => {
    const { db, recorded } = scriptedDb([{ rows: [RETURNED_ROW] }]);
    await insertAppointment(db, NEW_APPOINTMENT, LOCK);

    expect(recorded).toHaveLength(1);
    const sql = recorded[0]?.sql ?? '';
    expect(sql.startsWith('insert into "appointment"')).toBe(true);
    expect(sql).not.toMatch(/on conflict/i);
    expect(sql).not.toMatch(/\bselect\b/i);
  });

  it('sets no status — the column DEFAULT is what makes an appointment confirmed', async () => {
    // `Generated<>` in the schema is what forecloses it. An application that writes 'confirmed'
    // has two sources of truth for the enum, and slice 05's cancellation would then have to
    // agree with both.
    const { db, recorded } = scriptedDb([{ rows: [RETURNED_ROW] }]);
    await insertAppointment(db, NEW_APPOINTMENT, LOCK);
    // The INSERT's column list, not the RETURNING clause — which does read `status` back, and
    // must, because the 201 body carries it.
    const columnList = (recorded[0]?.sql ?? '').split(' values ')[0] ?? '';
    expect(columnList).not.toMatch(/"status"/);
    expect(recorded[0]?.sql).toMatch(/returning[^;]*"status"/);
    expect(recorded[0]?.parameters).toEqual([
      IDS.appointment,
      IDS.dealership,
      IDS.customer,
      IDS.vehicle,
      IDS.serviceType,
      IDS.technician,
      IDS.bay,
      STARTS_AT,
      ENDS_AT,
    ]);
  });

  it('DOES NOT CATCH: a refused insert propagates for `classify` to read', async () => {
    // The one place this differs from `pingDatabase`, which swallows everything. WHICH constraint
    // refused is the entire content of AC-3, AC-4 and AC-11, and a `try` here would be the second
    // SQLSTATE translation site `sql-only-in-persistence` forbids by name.
    const refusal = Object.assign(new Error('conflicting key value'), {
      code: '23P01',
      constraint: 'no_bay_overlap',
    });
    const { db } = scriptedDb([{ error: refusal }]);
    await expect(insertAppointment(db, NEW_APPOINTMENT, LOCK)).rejects.toBe(refusal);
  });

  it('is EXACTLY this statement — the columns written and the columns returned', async () => {
    // Same reason as the select above, and one more: `returning` is where the 201 body comes
    // from. A dropped column there is a member missing from `AppointmentView`, which the response
    // schema then strips rather than rejects.
    const { db, recorded } = scriptedDb([{ rows: [RETURNED_ROW] }]);
    await insertAppointment(db, NEW_APPOINTMENT, LOCK);
    expect(recorded[0]?.sql).toBe(
      'insert into "appointment" ("id", "dealership_id", "customer_id", "vehicle_id", ' +
        '"service_type_id", "technician_id", "bay_id", "starts_at", "ends_at") ' +
        'values ($1, $2, $3, $4, $5, $6, $7, $8, $9) ' +
        'returning "id", "dealership_id", "customer_id", "vehicle_id", "service_type_id", ' +
        '"technician_id", "bay_id", "starts_at", "ends_at", "status"',
    );
  });

  it('maps the returned row to camelCase, leaving the instants as Date', async () => {
    // DA-02-2 puts the ISO-8601 rendering in the use case, not here: a mapper that rendered
    // would be a second place the wire format is decided, and nobody reads a mapper.
    expect(await insertAppointment(scriptedDb([{ rows: [RETURNED_ROW] }]).db, NEW_APPOINTMENT, LOCK)).toEqual({
      id: IDS.appointment,
      dealershipId: IDS.dealership,
      customerId: IDS.customer,
      vehicleId: IDS.vehicle,
      serviceTypeId: IDS.serviceType,
      technicianId: IDS.technician,
      bayId: IDS.bay,
      startsAt: STARTS_AT,
      endsAt: ENDS_AT,
      status: 'confirmed',
    });
  });

  it('returns the row the DATABASE wrote, not the values it was handed', async () => {
    // The distinction AC-1's word "allocated" is about. If this returned `values` the response
    // could name a bay the row does not hold, and every assertion on the body would still pass.
    const elsewhere = { ...RETURNED_ROW, bay_id: 'a-different-bay' };
    const row = await insertAppointment(scriptedDb([{ rows: [elsewhere] }]).db, NEW_APPOINTMENT, LOCK);
    expect(row.bayId).toBe('a-different-bay');
  });
});

describe('findAppointmentById', () => {
  it('returns the mapped row for a known id (AC-2)', async () => {
    const row = await findAppointmentById(scriptedDb([{ rows: [RETURNED_ROW] }]).db, IDS.appointment);
    expect(row?.id).toBe(IDS.appointment);
    expect(row?.status).toBe('confirmed');
  });

  it('returns null for an unknown id, rather than throwing (AC-2 is a 404, not a 500)', async () => {
    expect(await findAppointmentById(scriptedDb([{ rows: [] }]).db, IDS.appointment)).toBeNull();
  });

  it('reads a cancelled row too — cancellation is a sub-resource, so the appointment stays readable', async () => {
    // §8.6: slice 05 cancels through a sub-resource precisely so the appointment remains
    // readable at the same URL. A `where status = 'confirmed'` here would break that slice
    // silently, which is why the filter's ABSENCE is asserted rather than assumed.
    const { db, recorded } = scriptedDb([{ rows: [{ ...RETURNED_ROW, status: 'cancelled' }] }]);
    const row = await findAppointmentById(db, IDS.appointment);
    expect(row?.status).toBe('cancelled');
    expect(recorded[0]?.sql).not.toMatch(/"status"\s*(=|<>)/);
  });

  it('selects by id and nothing else', async () => {
    const { db, recorded } = scriptedDb([{ rows: [] }]);
    await findAppointmentById(db, IDS.appointment);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.parameters).toEqual([IDS.appointment]);
  });

  it('selects EXACTLY the ten columns the view needs — the whole statement, not a substring', async () => {
    // Pinning the whole text rather than probing it: a column name is what the `AppointmentView`
    // is built from, and a mapper reading `row.bay_id` from a select that never asked for it
    // yields `undefined` and a 201 naming no bay. That is AC-1's "allocated" failing quietly, and
    // no partial assertion over the SQL catches it.
    const { db, recorded } = scriptedDb([{ rows: [] }]);
    await findAppointmentById(db, IDS.appointment);
    expect(recorded[0]?.sql).toBe(
      'select "id", "dealership_id", "customer_id", "vehicle_id", "service_type_id", ' +
        '"technician_id", "bay_id", "starts_at", "ends_at", "status" ' +
        'from "appointment" where "id" = $1',
    );
  });
});

describe('cancelAppointmentById — slice 05, D1 and ADR-0023', () => {
  const CANCELLED_ROW = { ...RETURNED_ROW, status: 'cancelled' };

  it('is ONE unconditional UPDATE — no pre-read, no guard, and §2.1 never arises', async () => {
    // The shape is the argument. There is no `select` to check availability with and no
    // `AND status <> 'cancelled'` to decide on, so there is no check for an act to follow:
    // `CLAUDE.md` §2.1 is not obeyed here, it is unreachable. And the guard D1 rejects is
    // asserted ABSENT rather than assumed absent, because it is the natural thing to write and
    // it is what makes zero rows ambiguous (§6.6, AC-3 and AC-4 would then collide).
    const { db, recorded } = scriptedDb([{ rows: [CANCELLED_ROW] }]);
    await cancelAppointmentById(db, IDS.appointment);

    expect(recorded).toHaveLength(1);
    const sql = recorded[0]?.sql ?? '';
    expect(sql.startsWith('update "appointment"')).toBe(true);
    expect(sql).not.toMatch(/\bselect\b/i);
    // The WHERE clause on its own, because `returning` names "status" a few words later and a
    // whole-statement probe for it would pass over the guarded statement too.
    expect(sql.split(' where ')[1]?.split(' returning ')[0]).toBe('"id" = $2');
  });

  it('takes NO advisory lock and opens NO transaction — ADR-0023, and F-05-1 is what makes it worth asserting', async () => {
    // ADR-0023 exempts this path from F-02-9 because a cancelled row satisfies no constraint's
    // `WHERE (status <> 'cancelled')`, so there is no adjudication for a lock to serialise.
    // F-05-1: this file now holds two write functions, one locking and one not, and "correctly
    // exempt" reads identically to "forgot the lock". Until slice 06's branded `ResourceLock`
    // makes that a compile error, this is the cheapest thing that fails when someone adds the
    // lock here for uniformity — `tests/concurrency/` measures the consequence, this names it.
    const { db, recorded, events } = scriptedDb([{ rows: [CANCELLED_ROW] }]);
    await cancelAppointmentById(db, IDS.appointment);

    expect(recorded[0]?.sql).not.toMatch(/pg_advisory/);
    // One statement IS its own transaction. An explicit block would be a second thing that can
    // wait, which is exactly the case ADR-0023's "the unit is the transaction" clause excludes
    // from the exemption.
    expect(events).toEqual([]);
  });

  it('advances `updated_at` on the FIRST cancellation and leaves it alone on a replay — the CASE, pinned', async () => {
    // AC-3 taken literally: a replayed cancellation changes NO COLUMN. A plain
    // `updated_at = now()` advances it on the second call, which would make a replay a
    // client-reachable write to a column arc42 §8.1 says the application maintains. The CASE
    // reads `status` inside the statement that writes it — atomic under the row's own lock,
    // and not a check-then-act window, because nothing decides WHETHER to write.
    //
    // `tests/integration/cancellation-releases-slot.test.ts` is what proves this over a real
    // row; this pins the text, which is where a mutant would land.
    const { db, recorded } = scriptedDb([{ rows: [CANCELLED_ROW] }]);
    await cancelAppointmentById(db, IDS.appointment);
    const sql = recorded[0]?.sql ?? '';
    expect(sql).toContain(
      '"updated_at" = case when "status" = \'cancelled\' then "updated_at" else now() end',
    );
  });

  it('is EXACTLY this statement — one UPDATE, the CASE, `where id`, and the ten returned columns', async () => {
    // Pinned whole, for `insertAppointment`'s reason and one more: `returning` is where the
    // 200 body comes from, so a dropped column is a member missing from `AppointmentView` that
    // the response schema strips rather than rejects.
    const { db, recorded } = scriptedDb([{ rows: [CANCELLED_ROW] }]);
    await cancelAppointmentById(db, IDS.appointment);
    expect(recorded[0]?.sql).toBe(
      'update "appointment" set "status" = $1, ' +
        '"updated_at" = case when "status" = \'cancelled\' then "updated_at" else now() end ' +
        'where "id" = $2 ' +
        'returning "id", "dealership_id", "customer_id", "vehicle_id", "service_type_id", ' +
        '"technician_id", "bay_id", "starts_at", "ends_at", "status"',
    );
    expect(recorded[0]?.parameters).toEqual(['cancelled', IDS.appointment]);
  });

  it('returns the mapped row the DATABASE wrote, cancelled', async () => {
    expect(await cancelAppointmentById(scriptedDb([{ rows: [CANCELLED_ROW] }]).db, IDS.appointment)).toEqual({
      id: IDS.appointment,
      dealershipId: IDS.dealership,
      customerId: IDS.customer,
      vehicleId: IDS.vehicle,
      serviceTypeId: IDS.serviceType,
      technicianId: IDS.technician,
      bayId: IDS.bay,
      startsAt: STARTS_AT,
      endsAt: ENDS_AT,
      status: 'cancelled',
    });
  });

  it('returns null for zero rows — which means EXACTLY ONE thing: no such id (§6.6, AC-4)', async () => {
    // The whole reason D1 carries no `AND status <> 'cancelled'`. Under that guard zero rows
    // would also mean "already cancelled", and this null would become a 404 for a row that
    // exists — AC-3 answered as AC-4.
    expect(await cancelAppointmentById(scriptedDb([{ rows: [] }]).db, IDS.appointment)).toBeNull();
  });

  it('DOES NOT CATCH — SQLSTATE is read in exactly one module', async () => {
    const failure = Object.assign(new Error('deadlock detected'), { code: '40P01' });
    const { db } = scriptedDb([{ error: failure }]);
    await expect(cancelAppointmentById(db, IDS.appointment)).rejects.toBe(failure);
  });
});

describe('rescheduleAppointmentById — slice 06, ADR-0025 and ADR-0026', () => {
  const MOVED_ROW = { ...RETURNED_ROW, starts_at: new Date('2026-09-08T09:15:00.000Z'), ends_at: new Date('2026-09-08T10:15:00.000Z') };
  const MOVE = { id: IDS.appointment, startsAt: MOVED_ROW.starts_at, endsAt: MOVED_ROW.ends_at };

  it('is ONE guarded UPDATE — no pre-read, and the guard is `status = \'confirmed\'` (ADR-0025)', async () => {
    // The shape is the argument, same reason `cancelAppointmentById`'s is: no `select` exists to
    // check availability with, so there is no check for an act to follow. Unlike D1, THIS write
    // DOES carry a guard — the read that decided existence already ran, and this statement's
    // job is only to decide LEGALITY (decision 2), never to re-establish existence.
    const { db, recorded } = scriptedDb([{ rows: [MOVED_ROW] }]);
    await rescheduleAppointmentById(db, MOVE, LOCK);

    expect(recorded).toHaveLength(1);
    const sql = recorded[0]?.sql ?? '';
    expect(sql.startsWith('update "appointment"')).toBe(true);
    expect(sql).not.toMatch(/\bselect\b/i);
    expect(sql).toMatch(/where "id" = \$\d+ and "status" = \$\d+/);
  });

  it('bay_id and technician_id come off the LOCK, never off `move` (ADR-0026)', async () => {
    // `Move` carries no `bayId`/`technicianId` at all — a compile-time argument this test backs
    // with a runtime one: the values written are the LOCK's, and a lock minted for a different
    // pair than `move`'s own would write the LOCK's pair, not silently ignore it.
    const { db, recorded } = scriptedDb([{ rows: [MOVED_ROW] }]);
    const differentLock = { bayId: 'a-different-bay', technicianId: 'a-different-tech' } as ResourceLock;
    await rescheduleAppointmentById(db, MOVE, differentLock);
    expect(recorded[0]?.parameters).toContain('a-different-bay');
    expect(recorded[0]?.parameters).toContain('a-different-tech');
  });

  it('advances `updated_at` to the DATABASE\'s clock, UNCONDITIONALLY and with no CASE', async () => {
    // `now()`, never `new Date()` — the same clock `0003_appointment.sql`'s column DEFAULT and
    // `cancelAppointmentById`'s CASE both use, so this statement's timestamp cannot disagree
    // with either. Unconditional because a move is never idempotent (this slice's own "Out of
    // scope": a move to the identical instant still executes this statement and is a request,
    // not a replay of one) — unlike D1, there is no unchanged-row case for a CASE to protect.
    const { db, recorded } = scriptedDb([{ rows: [MOVED_ROW] }]);
    await rescheduleAppointmentById(db, MOVE, LOCK);
    const sql = recorded[0]?.sql ?? '';
    expect(sql).toContain('"updated_at" = now()');
    expect(sql).not.toMatch(/case/i);
  });

  it('is EXACTLY this statement — one UPDATE, both guards, no CASE, and the ten returned columns', async () => {
    const { db, recorded } = scriptedDb([{ rows: [MOVED_ROW] }]);
    await rescheduleAppointmentById(db, MOVE, LOCK);
    expect(recorded[0]?.sql).toBe(
      'update "appointment" set "bay_id" = $1, "technician_id" = $2, "starts_at" = $3, ' +
        '"ends_at" = $4, "updated_at" = now() ' +
        'where "id" = $5 and "status" = $6 ' +
        'returning "id", "dealership_id", "customer_id", "vehicle_id", "service_type_id", ' +
        '"technician_id", "bay_id", "starts_at", "ends_at", "status"',
    );
    expect(recorded[0]?.parameters).toEqual([
      IDS.bay,
      IDS.technician,
      MOVE.startsAt,
      MOVE.endsAt,
      IDS.appointment,
      'confirmed',
    ]);
  });

  it('returns the mapped row the DATABASE wrote, moved', async () => {
    expect(await rescheduleAppointmentById(scriptedDb([{ rows: [MOVED_ROW] }]).db, MOVE, LOCK)).toEqual({
      id: IDS.appointment,
      dealershipId: IDS.dealership,
      customerId: IDS.customer,
      vehicleId: IDS.vehicle,
      serviceTypeId: IDS.serviceType,
      technicianId: IDS.technician,
      bayId: IDS.bay,
      startsAt: MOVE.startsAt,
      endsAt: MOVE.endsAt,
      status: 'confirmed',
    });
  });

  it('returns null for zero rows — ADR-0025: legality only, because existence was already read', async () => {
    // The whole reason this write DOES carry a guard where D1 does not: the read that ran before
    // this already established the row exists, so zero rows here means exactly one thing — not
    // confirmed — and there is no ambiguity with "unknown id" for the caller to disambiguate.
    expect(await rescheduleAppointmentById(scriptedDb([{ rows: [] }]).db, MOVE, LOCK)).toBeNull();
  });

  it('DOES NOT CATCH — a refused UPDATE propagates for `classify` to read (AC-1)', async () => {
    const refusal = Object.assign(new Error('conflicting key value'), {
      code: '23P01',
      constraint: 'no_bay_overlap',
    });
    const { db } = scriptedDb([{ error: refusal }]);
    await expect(rescheduleAppointmentById(db, MOVE, LOCK)).rejects.toBe(refusal);
  });
});

describe('busyResources — slice 08, ADR-0032 Option D', () => {
  const FROM = new Date('2026-09-08T09:00:00.000Z');
  const TO = new Date('2026-09-08T10:00:00.000Z');

  it('is EXACTLY the constraint\'s own predicate: dealership, not cancelled, tstzrange overlap', async () => {
    // Design §2 gives this SQL verbatim, one file removed from `0003_appointment.sql`'s own
    // `EXCLUDE` predicate — pinned whole so a reviewer can diff the two texts directly.
    const { db, recorded } = scriptedDb([{ rows: [] }]);
    await busyResources(db, IDS.dealership, FROM, TO);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.sql).toBe(
      'select "bay_id", "technician_id" from "appointment" ' +
        'where "dealership_id" = $1 and "status" <> $2 ' +
        'and tstzrange(starts_at, ends_at) && tstzrange($3, $4)',
    );
    expect(recorded[0]?.parameters).toEqual([IDS.dealership, 'cancelled', FROM, TO]);
  });

  it('reads no other table and no other appointment column', async () => {
    const { db, recorded } = scriptedDb([{ rows: [] }]);
    await busyResources(db, IDS.dealership, FROM, TO);
    expect(recorded[0]?.sql).not.toMatch(/service_bay|technician_qualification|customer|vehicle/i);
  });

  it('collapses repeated bay and technician ids — two overlapping rows, one id each', async () => {
    // A dealership with two confirmed jobs occupying the SAME bay across the window must not
    // report that bay twice; `queryAvailability`'s subtraction only needs membership.
    const { db } = scriptedDb([
      {
        rows: [
          { bay_id: IDS.bay, technician_id: IDS.technician },
          { bay_id: IDS.bay, technician_id: OTHER_TECHNICIAN },
        ],
      },
    ]);
    const busy = await busyResources(db, IDS.dealership, FROM, TO);
    expect(busy).toEqual({
      bays: [IDS.bay],
      technicians: [IDS.technician, OTHER_TECHNICIAN],
    });
  });

  it('returns empty lists rather than throwing when nothing overlaps', async () => {
    const { db } = scriptedDb([{ rows: [] }]);
    expect(await busyResources(db, IDS.dealership, FROM, TO)).toEqual({
      bays: [],
      technicians: [],
    });
  });

  it('is exactly one statement — the whole answer in one round trip', async () => {
    const { db, recorded } = scriptedDb([{ rows: [] }]);
    await busyResources(db, IDS.dealership, FROM, TO);
    expect(recorded).toHaveLength(1);
  });
});
