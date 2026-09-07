import { describe, expect, it } from 'vitest';
import {
  classifyOwnership,
  findDealership,
  findServiceType,
} from '../../../src/persistence/referenceRepository.js';
import { scriptedDb } from '../helpers/stub-db.js';

/**
 * What is asserted here is the MAPPING and the SQL, never a persistence invariant — those live in
 * `tests/integration/` against a real container and belong to the test-engineer (`CLAUDE.md` §5).
 * The production query compiler is kept, so `recorded[i].sql` is the text postgres would receive.
 */

const DEALERSHIP = '11111111-1111-4111-8111-111111111111';
const CUSTOMER = '22222222-2222-4222-8222-222222222222';
const VEHICLE = '33333333-3333-4333-8333-333333333333';

describe('findDealership', () => {
  it('builds the seven-slot tuple, leaving a day with NO ROW as null', () => {
    // Slice 01's AC-4: a day with no `opening_hours` row is a CLOSED day, not an unbounded one.
    // This is the assertion that stops a future edit defaulting a missing day to the previous
    // one's hours, which would open a dealership on a day it is shut.
    return expectDealership(
      [
        { day_of_week: 1, opens_at: '09:00:00', closes_at: '17:00:00' },
        { day_of_week: 3, opens_at: '10:00:00', closes_at: '24:00:00' },
      ],
      [
        null,
        { opensAt: '09:00:00', closesAt: '17:00:00' },
        null,
        { opensAt: '10:00:00', closesAt: '24:00:00' },
        null,
        null,
        null,
      ],
    );
  });

  it("hands '24:00:00' across VERBATIM — this module performs no parse (AC-19)", async () => {
    const { db } = scriptedDb([
      { rows: [{ id: DEALERSHIP, time_zone: 'Europe/London' }] },
      { rows: [{ day_of_week: 6, opens_at: '00:00:00', closes_at: '24:00:00' }] },
    ]);
    const dealership = await findDealership(db, DEALERSHIP);
    // The `'24:00:00'` arm slice 01 recorded as unreachable becomes live because `pg` returns the
    // column as this exact string and nothing between the column and the parser touches it.
    expect(dealership?.weekly[6]).toEqual({ opensAt: '00:00:00', closesAt: '24:00:00' });
  });

  it('carries time_zone across as ianaZone, uninterpreted (QS-12: transport, not reasoning)', async () => {
    const { db } = scriptedDb([
      { rows: [{ id: DEALERSHIP, time_zone: 'Not/AZone' }] },
      { rows: [] },
    ]);
    // A zone this module cannot resolve is NOT this module's business to reject. It is
    // `openingHours.ts` that returns `unknown-zone`, and the taxonomy maps that to a 500 for
    // broken reference data — which is the route AC-12's `/problems/internal` row is reached by.
    expect((await findDealership(db, DEALERSHIP))?.ianaZone).toBe('Not/AZone');
  });

  it('returns null for an unknown dealership, and does NOT query opening_hours', async () => {
    // AC-9's `reference: 'dealership'` arm. One query, not two: the second would be a wasted
    // round trip on every unknown id, and the script makes an extra query a loud failure.
    const { db, recorded } = scriptedDb([{ rows: [] }]);
    expect(await findDealership(db, DEALERSHIP)).toBeNull();
    expect(recorded).toHaveLength(1);
  });

  it('a day_of_week outside 0-6 cannot widen the tuple — `toWeekly` reads seven named slots', async () => {
    // The column carries `CHECK (day_of_week BETWEEN 0 AND 6)`, so this row cannot exist; the
    // claim being pinned is that if it somehow did, `weekly` would still be the seven-slot tuple
    // `openingHours.ts` indexes into. There is deliberately no bound test in the loop — it would
    // be a second guard over the same fact whose effect nothing could observe, which the mutation
    // run named as a survivor and which is dead code either way.
    const { db } = scriptedDb([
      { rows: [{ id: DEALERSHIP, time_zone: 'Europe/London' }] },
      { rows: [{ day_of_week: 7, opens_at: '09:00:00', closes_at: '17:00:00' }] },
    ]);
    const dealership = await findDealership(db, DEALERSHIP);
    expect(dealership?.weekly).toHaveLength(7);
    expect(dealership?.weekly).toEqual([null, null, null, null, null, null, null]);
  });

  it('reads dealership and opening_hours, and NOTHING else', async () => {
    // GC-1 and AC-5, at the smallest scale they can be asserted: the booking path's reference
    // read must not touch `appointment`. The architecture scan says no file outside
    // `appointmentRepository.ts` may name the table; this says what this one actually queries.
    const { db, recorded } = scriptedDb([
      { rows: [{ id: DEALERSHIP, time_zone: 'Europe/London' }] },
      { rows: [] },
    ]);
    await findDealership(db, DEALERSHIP);
    expect(recorded.map((q) => q.sql.replace(/\s+/g, ' '))).toEqual([
      'select "id", "time_zone" from "dealership" where "id" = $1',
      'select "day_of_week", "opens_at", "closes_at" from "opening_hours" where "dealership_id" = $1',
    ]);
  });

  async function expectDealership(
    hoursRows: readonly Record<string, unknown>[],
    weekly: unknown,
  ): Promise<void> {
    const { db } = scriptedDb([
      { rows: [{ id: DEALERSHIP, time_zone: 'Europe/London' }] },
      { rows: hoursRows },
    ]);
    expect((await findDealership(db, DEALERSHIP))?.weekly).toEqual(weekly);
  }
});

describe('findServiceType', () => {
  it('returns the duration in minutes', async () => {
    const { db } = scriptedDb([{ rows: [{ duration_minutes: 45 }] }]);
    expect(await findServiceType(db, 'any')).toEqual({ durationMinutes: 45 });
  });

  it('returns null for an unknown service type (AC-9)', async () => {
    const { db } = scriptedDb([{ rows: [] }]);
    expect(await findServiceType(db, 'any')).toBeNull();
  });

  it('asks for the duration column by name, from service_type, by id', async () => {
    // A `select *` here would work and would also stop this file from noticing a renamed column
    // until an integration test failed with 42703 several layers away.
    const { db, recorded } = scriptedDb([{ rows: [] }]);
    await findServiceType(db, 'a-service-type');
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.sql).toBe('select "duration_minutes" from "service_type" where "id" = $1');
    expect(recorded[0]?.parameters).toEqual(['a-service-type']);
  });

  it('does not re-assert the duration rule — `serviceDuration` owns that', async () => {
    // A zero or negative duration is the domain's to refuse, and it does (`serviceDuration`
    // returns null, which is `invalid-duration`). Rejecting it here as well would put the same
    // rule in two places and make the domain's arm unreachable — R-01-4's shape.
    const { db } = scriptedDb([{ rows: [{ duration_minutes: 0 }] }]);
    expect(await findServiceType(db, 'any')).toEqual({ durationMinutes: 0 });
  });
});

describe('classifyOwnership — ADR-0017', () => {
  it('reports unknown-customer when the customer does not exist', async () => {
    const { db } = scriptedDb([{ rows: [{ customer_exists: false, vehicle_exists: true }] }]);
    expect(await classifyOwnership(db, CUSTOMER, VEHICLE)).toBe('unknown-customer');
  });

  it('reports unknown-vehicle when the customer exists and the vehicle does not', async () => {
    const { db } = scriptedDb([{ rows: [{ customer_exists: true, vehicle_exists: false }] }]);
    expect(await classifyOwnership(db, CUSTOMER, VEHICLE)).toBe('unknown-vehicle');
  });

  it('reports not-owned when both exist — the FK already refused the insert', async () => {
    expect(
      await classifyOwnership(
        scriptedDb([{ rows: [{ customer_exists: true, vehicle_exists: true }] }]).db,
        CUSTOMER,
        VEHICLE,
      ),
    ).toBe('not-owned');
  });

  it('reports unknown-customer when NEITHER exists — the customer is named first', async () => {
    // Both are unresolvable and only one `reference` can be reported. Naming the customer is the
    // outer-to-inner order: a vehicle is identified relative to its owner, so telling the caller
    // the vehicle is unknown when the customer is too would send them to the wrong record.
    const { db } = scriptedDb([{ rows: [{ customer_exists: false, vehicle_exists: false }] }]);
    expect(await classifyOwnership(db, CUSTOMER, VEHICLE)).toBe('unknown-customer');
  });

  it('is ONE statement, with no FROM on either table', async () => {
    // `select ... from vehicle limit 1` would return no row at all against an empty `vehicle`
    // table, so the classification would depend on the size of a table it is not asking about.
    // Two statements would also mean the two `exists` could see different snapshots.
    const { db, recorded } = scriptedDb([
      { rows: [{ customer_exists: true, vehicle_exists: true }] },
    ]);
    await classifyOwnership(db, CUSTOMER, VEHICLE);
    expect(recorded).toHaveLength(1);
    // The OUTER select has no FROM at all — both tables appear only inside a sub-select.
    expect(recorded[0]?.sql).toBe(
      'select exists (select "id" from "customer" where "id" = $1) as "customer_exists", ' +
        'exists (select "id" from "vehicle" where "id" = $2) as "vehicle_exists"',
    );
  });

  it('never queries the appointment table — it is a reference read, run AFTER the write', async () => {
    const { db, recorded } = scriptedDb([
      { rows: [{ customer_exists: true, vehicle_exists: true }] },
    ]);
    await classifyOwnership(db, CUSTOMER, VEHICLE);
    expect(recorded.map((q) => q.sql).join(' ')).not.toMatch(/"appointment"/);
  });
});
