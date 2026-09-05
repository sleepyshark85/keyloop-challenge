import { describe, expect, it } from 'vitest';
import { readAppointment } from '../../../src/application/readAppointment.js';
import { scriptedDb } from '../helpers/stub-db.js';

const APPOINTMENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const ROW = {
  id: APPOINTMENT,
  dealership_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  customer_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  vehicle_id: 'vvvvvvvv-0000-4000-8000-000000000000',
  service_type_id: 'ssssssss-0000-4000-8000-000000000000',
  technician_id: 'tech-0',
  bay_id: 'bay-0',
  starts_at: new Date('2026-09-08T09:00:00.000Z'),
  ends_at: new Date('2026-09-08T10:00:00.000Z'),
  status: 'confirmed',
};

describe('readAppointment — AC-2', () => {
  it('returns `found` with the SAME view shape the 201 returns', async () => {
    const { db } = scriptedDb([{ rows: [ROW] }]);
    const outcome = await readAppointment(db, APPOINTMENT);
    expect(outcome).toEqual({
      kind: 'found',
      appointment: {
        id: APPOINTMENT,
        dealershipId: ROW.dealership_id,
        customerId: ROW.customer_id,
        vehicleId: ROW.vehicle_id,
        serviceTypeId: ROW.service_type_id,
        technicianId: 'tech-0',
        bayId: 'bay-0',
        startsAt: '2026-09-08T09:00:00.000Z',
        endsAt: '2026-09-08T10:00:00.000Z',
        status: 'confirmed',
      },
    });
  });

  it('returns `not-found` for an unknown id — a 404, not a throw and not a 500', async () => {
    const { db } = scriptedDb([{ rows: [] }]);
    expect(await readAppointment(db, APPOINTMENT)).toEqual({ kind: 'not-found' });
  });

  it('a CANCELLED appointment is found, not missing', async () => {
    // §8.6 makes cancellation a sub-resource precisely so the appointment stays readable at the
    // same URL, and `status` is what tells the client which it is. Returning `not-found` here
    // would break slice 05 silently, so the behaviour is pinned before slice 05 depends on it.
    const outcome = await readAppointment(
      scriptedDb([{ rows: [{ ...ROW, status: 'cancelled' }] }]).db,
      APPOINTMENT,
    );
    expect(outcome.kind).toBe('found');
    if (outcome.kind !== 'found') return;
    expect(outcome.appointment.status).toBe('cancelled');
  });

  it('issues exactly one query, by id', async () => {
    const { db, recorded } = scriptedDb([{ rows: [] }]);
    await readAppointment(db, APPOINTMENT);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.parameters).toEqual([APPOINTMENT]);
  });
});
