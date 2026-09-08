import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { tracing } from '@opentelemetry/sdk-node';
import { cancelAppointment } from '../../../src/application/cancelAppointment.js';
import { scriptedDb } from '../helpers/stub-db.js';

/**
 * Slice 05 — the use case, which is one repository call and one mapping.
 *
 * What it is NOT is the interesting part: no pre-read, no branch on the current status, no
 * transaction and no lock. AC-3's idempotency is a property of D1's statement rather than of
 * anything here, so there is nothing in this module for a second cancellation to take a
 * different path through — and these tests are what say so.
 */

const APPOINTMENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const CANCELLED_ROW = {
  id: APPOINTMENT,
  dealership_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  customer_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  vehicle_id: 'vvvvvvvv-0000-4000-8000-000000000000',
  service_type_id: 'ssssssss-0000-4000-8000-000000000000',
  technician_id: 'tech-0',
  bay_id: 'bay-0',
  starts_at: new Date('2026-09-08T09:00:00.000Z'),
  ends_at: new Date('2026-09-08T10:00:00.000Z'),
  status: 'cancelled',
};

describe('cancelAppointment — AC-3, AC-4', () => {
  it('returns `cancelled` carrying the SAME AppointmentView the 201 and the 200 return', async () => {
    // One shape on the wire, from one mapper: `toAppointmentView` is `bookAppointment`'s, reused
    // rather than restated, so DA-02-2's ISO-8601 UTC rendering cannot differ between the routes
    // a client parses with one parser.
    const { db } = scriptedDb([{ rows: [CANCELLED_ROW] }]);
    expect(await cancelAppointment(db, APPOINTMENT)).toEqual({
      kind: 'cancelled',
      appointment: {
        id: APPOINTMENT,
        dealershipId: CANCELLED_ROW.dealership_id,
        customerId: CANCELLED_ROW.customer_id,
        vehicleId: CANCELLED_ROW.vehicle_id,
        serviceTypeId: CANCELLED_ROW.service_type_id,
        technicianId: 'tech-0',
        bayId: 'bay-0',
        startsAt: '2026-09-08T09:00:00.000Z',
        endsAt: '2026-09-08T10:00:00.000Z',
        status: 'cancelled',
      },
    });
  });

  it('returns `not-found` when the UPDATE matched no row — the only thing zero rows can mean', async () => {
    // §6.6, and it is only unambiguous because D1's statement carries no `AND status <>
    // 'cancelled'`. Under that guard this arm would also fire for an already-cancelled row and
    // AC-3's replay would be answered as AC-4's 404.
    expect(await cancelAppointment(scriptedDb([{ rows: [] }]).db, APPOINTMENT)).toEqual({
      kind: 'not-found',
    });
  });

  it('issues EXACTLY ONE statement, by id — nothing reads the row before writing it', async () => {
    const { db, recorded, events } = scriptedDb([{ rows: [CANCELLED_ROW] }]);
    await cancelAppointment(db, APPOINTMENT);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.sql.startsWith('update "appointment"')).toBe(true);
    expect(recorded[0]?.parameters).toEqual(['cancelled', APPOINTMENT]);
    // No transaction either: ADR-0023's exemption is a property of the TRANSACTION, and a block
    // opened here would be a second thing that can wait inside it.
    expect(events).toEqual([]);
  });

  it('a REPLAY takes the identical path and yields the identical outcome (AC-3)', async () => {
    // Idempotency is the statement's, not this module's. Two calls, one script, and no branch
    // between them: if a `switch` on the current status ever appeared here, the second call
    // would issue a different statement and this would catch it.
    const { db, recorded } = scriptedDb([{ rows: [CANCELLED_ROW] }, { rows: [CANCELLED_ROW] }]);
    const first = await cancelAppointment(db, APPOINTMENT);
    const second = await cancelAppointment(db, APPOINTMENT);

    expect(second).toEqual(first);
    expect(recorded[1]?.sql).toBe(recorded[0]?.sql);
    expect(recorded[1]?.parameters).toEqual(recorded[0]?.parameters);
  });

  it('does not catch — a driver failure is a fault, and faults are the edge\'s 500', async () => {
    const failure = Object.assign(new Error('connection terminated'), { code: '57P01' });
    const { db } = scriptedDb([{ error: failure }]);
    await expect(cancelAppointment(db, APPOINTMENT)).rejects.toBe(failure);
  });
});

/**
 * §8.4's `appointment.cancel` span (`R-09-9`, step 5 finding 9): a real, in-memory
 * `TracerProvider` registered so `tracer.startActiveSpan` in `cancelAppointment.ts` reaches an
 * exporter this file can read back, the same shape `attemptLoop.test.ts` and `telemetry.test.ts`
 * use for the same reason (`src/platform/telemetry.ts`'s docblock: a span started through the
 * exported `tracer` defers to whatever provider is registered at CALL time, `ProxyTracer`'s own
 * behaviour, not the meter's).
 */
describe('cancelAppointment — appointment.cancel span (arc42 §8.4)', () => {
  const spanExporter = new tracing.InMemorySpanExporter();
  const tracerProvider = new tracing.BasicTracerProvider({
    spanProcessors: [new tracing.SimpleSpanProcessor(spanExporter)],
  });

  beforeAll(() => {
    trace.setGlobalTracerProvider(tracerProvider);
  });

  afterEach(() => {
    spanExporter.reset();
  });

  afterAll(() => {
    trace.disable();
  });

  function cancelSpans(): readonly ReturnType<typeof spanExporter.getFinishedSpans>[number][] {
    return spanExporter.getFinishedSpans().filter((s) => s.name === 'appointment.cancel');
  }

  it('a cancellation opens exactly one span, carrying the id, with no ERROR status', async () => {
    const { db } = scriptedDb([{ rows: [CANCELLED_ROW] }]);
    await cancelAppointment(db, APPOINTMENT);

    const spans = cancelSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.attributes['appointment.id']).toBe(APPOINTMENT);
    expect(spans[0]?.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('a not-found replay ALSO opens and ends its span — the span wraps the use case, not just the write', async () => {
    const { db } = scriptedDb([{ rows: [] }]);
    await cancelAppointment(db, APPOINTMENT);

    expect(cancelSpans()).toHaveLength(1);
  });

  it('a driver failure marks the span ERROR, ends it, and still rethrows the SAME error', async () => {
    const failure = Object.assign(new Error('connection terminated'), { code: '57P01' });
    const { db } = scriptedDb([{ error: failure }]);

    await expect(cancelAppointment(db, APPOINTMENT)).rejects.toBe(failure);

    const spans = cancelSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
  });
});
