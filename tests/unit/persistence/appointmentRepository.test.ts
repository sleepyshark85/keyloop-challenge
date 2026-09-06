import { describe, expect, it } from 'vitest';
import {
  cancelAppointmentById,
  findAppointmentById,
  insertAppointment,
  lockResources,
} from '../../../src/persistence/appointmentRepository.js';
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

const NEW_APPOINTMENT = {
  id: IDS.appointment,
  dealershipId: IDS.dealership,
  customerId: IDS.customer,
  vehicleId: IDS.vehicle,
  serviceTypeId: IDS.serviceType,
  technicianId: IDS.technician,
  bayId: IDS.bay,
  startsAt: STARTS_AT,
  endsAt: ENDS_AT,
};

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

describe('lockResources — ADR-0018', () => {
  it('is ONE statement taking both locks, bay in class 1 and technician in class 2', async () => {
    // The classes are the whole mechanism: disjoint key spaces make bay-then-technician a total
    // order no attempt can take in reverse, so there is no sort for anyone to keep sorted. A
    // mutant that swaps 1 and 2 leaves the order total and is harmless; one that makes both
    // classes the same collapses the two key spaces into one, and THAT is what this pins.
    const { db, recorded } = scriptedDb([{ rows: [{ pg_advisory_xact_lock: null }] }]);
    await lockResources(db, IDS.bay, IDS.technician);

    expect(recorded).toHaveLength(1);
    const sql = (recorded[0]?.sql ?? '').replace(/\s+/g, ' ').trim();
    expect(sql).toBe(
      'select pg_advisory_xact_lock(c, k) from unnest( array[1, 2], ' +
        'array[hashtext($1), hashtext($2)] ) as t(c, k)',
    );
    expect(recorded[0]?.parameters).toEqual([IDS.bay, IDS.technician]);
  });

  it('is the TRANSACTION-scoped lock, never the session-scoped one', async () => {
    // `pg_advisory_lock` would survive the attempt and be held across the next candidate, which
    // turns the retry loop into a lock accumulator and deadlocks on the second attempt. The two
    // functions differ by one word, so the word is asserted.
    const { db, recorded } = scriptedDb([{ rows: [{}] }]);
    await lockResources(db, IDS.bay, IDS.technician);
    expect(recorded[0]?.sql).toContain('pg_advisory_xact_lock');
    expect(recorded[0]?.sql).not.toMatch(/pg_advisory_lock\b/);
  });

  it('reads no table — the lock decides nothing (§4.5, ADR-0018)', async () => {
    // The keys are `hashtext` of two REFERENCE ids. If this statement ever grew a read of
    // `appointment` the lock would stop being liveness and start being correctness, which is
    // precisely the reading ADR-0018's two controls exist to keep true.
    const { db, recorded } = scriptedDb([{ rows: [{}] }]);
    await lockResources(db, IDS.bay, IDS.technician);
    expect(recorded[0]?.sql).not.toMatch(/appointment/i);
    expect(recorded[0]?.sql).not.toMatch(/\bselect\b[\s\S]*\bfrom\b\s+"/);
  });
});

describe('insertAppointment', () => {
  it('is ONE statement, an INSERT, with no ON CONFLICT and no pre-read (AC-5)', async () => {
    const { db, recorded } = scriptedDb([{ rows: [RETURNED_ROW] }]);
    await insertAppointment(db, NEW_APPOINTMENT);

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
    await insertAppointment(db, NEW_APPOINTMENT);
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
    await expect(insertAppointment(db, NEW_APPOINTMENT)).rejects.toBe(refusal);
  });

  it('is EXACTLY this statement — the columns written and the columns returned', async () => {
    // Same reason as the select above, and one more: `returning` is where the 201 body comes
    // from. A dropped column there is a member missing from `AppointmentView`, which the response
    // schema then strips rather than rejects.
    const { db, recorded } = scriptedDb([{ rows: [RETURNED_ROW] }]);
    await insertAppointment(db, NEW_APPOINTMENT);
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
    expect(await insertAppointment(scriptedDb([{ rows: [RETURNED_ROW] }]).db, NEW_APPOINTMENT)).toEqual({
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
    const row = await insertAppointment(scriptedDb([{ rows: [elsewhere] }]).db, NEW_APPOINTMENT);
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
