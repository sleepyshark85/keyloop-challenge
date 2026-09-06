import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  at,
  bookingBody,
  describeAnswer,
  describeScenario,
  getAppointment,
  member,
  occupy,
  postBooking,
  postCancellation,
  seedScenario,
} from '../support/booking.js';

/**
 * Slice 05 — AC-2 and AC-3's contract half.
 *
 * `docs/slices/05-cancellation.md` · `docs/slices/05-design.md` D1, D3 · arc42 §6.6, §8.6 ·
 * ADR-0003, ADR-0012.
 *
 *   AC-2  a cancelled appointment still READS at its URL: `200` with `status: cancelled`,
 *         never a `404`. (A sub-resource rather than `DELETE` for exactly this reason.)
 *   AC-3  cancelling twice answers `200` with an IDENTICAL body. The other half of AC-3 —
 *         that no COLUMN of the row changes — is a database invariant and lives in
 *         `tests/integration/cancellation-releases-slot.test.ts` (CLAUDE.md §5).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * AC-2 IS GREEN AT THE RED COMMIT IN ONE OF ITS TWO CASES, DELIBERATELY, AND IT IS DECLARED.
 *
 * Design D3 withdrew step 1's claim that AC-2 is "still honestly red": AC-2 needs no
 * production line, `readAppointment` already returns `found` for a cancelled row, and
 * `AppointmentBody.status` is already a two-member union rather than a `Type.Literal`. What
 * AC-2 is, is a REGRESSION GUARD over slice 02's read path that slice 02 could not reach
 * because nothing could produce a cancelled row. D3 left the arrangement to this role and
 * asked it to be stated. Both arrangements are here, because they buy different things:
 *
 *   (a) THE SEEDED CASE — the cancelled row is written directly (ADR-0012), so this case is
 *       GREEN FROM THE RED COMMIT ONWARD. It is named here rather than discovered at review.
 *       It is not vacuous and never becomes vacuous: it kills the `Type.Literal('confirmed')`
 *       substitution in the response schema TODAY, against merged code, which is the mutant
 *       D3 says AC-2 exists to kill. A test that only ever runs after the route ships would
 *       not have killed it for the three slices it has been alive.
 *
 *   (b) THE CRITERION AS WRITTEN — "given A HAS BEEN CANCELLED" means the operation, so this
 *       case cancels through the API. At the red commit it fails at its ARRANGE step, for the
 *       same reason every other case in this slice fails: the route 404s. That failure is
 *       evidence about the route's absence and NOT about AC-2, and this file says so rather
 *       than letting the count of red assertions imply otherwise.
 *
 * §2.4's letter is discharged by AC-1, AC-3 and AC-4, each of which fails for its own reason
 * once the route exists. Claiming a red for AC-2 that carries meaning it does not have would
 * be worse than the limitation.
 */

async function withService<T>(run: (service: StartedService) => Promise<T>): Promise<T | undefined> {
  const attempt = await startService({ databaseUrl: inject('databaseUrl') });
  expect(attempt.failure ?? 'started', `the service did not start.\n${attempt.failure}`).toBe(
    'started',
  );
  const service = attempt.service;
  if (service === undefined) return undefined;
  try {
    return await run(service);
  } finally {
    await service.stop();
  }
}

/** The ten members of `AppointmentView`, pinned in `docs/slices/02-design.md` §2.6. */
const APPOINTMENT_VIEW_KEYS = [
  'bayId',
  'customerId',
  'dealershipId',
  'endsAt',
  'id',
  'serviceTypeId',
  'startsAt',
  'status',
  'technicianId',
  'vehicleId',
];

describe('slice 05 — a cancelled appointment still reads, and cancelling twice changes nothing', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('AC-2 (a) — a cancelled row reads 200 with status=cancelled, and this case is GREEN AT THE RED COMMIT by design', async () => {
    const scenario = await seedScenario(client, 'ac2-seeded-cancelled', {
      bays: 1,
      technicians: 1,
    });
    const id = await occupy(client, scenario, {
      label: 'to-cancel',
      bayId: scenario.bayIds[0] as string,
      technicianId: scenario.technicianIds[0] as string,
      startsAt: at(0),
      endsAt: at(60),
    });
    // Written directly, under ADR-0012: this case is about the READ path, and arranging it
    // through the cancellation route would couple a regression guard over merged code to a
    // route that does not exist yet.
    const update = await client.query("update appointment set status = 'cancelled' where id = $1", [
      id,
    ]);
    expect(update.rowCount, 'the fixture did not produce a cancelled row').toBe(1);

    await withService(async (service) => {
      const read = await getAppointment(service, id);

      expect(
        read.status,
        `AC-2 — a cancelled appointment must remain readable at its URL. A 404 here is what a ` +
          `DELETE-shaped design would produce, and is the reason the slice file chose a ` +
          `sub-resource.\n${describeAnswer(read)}\n${describeScenario(scenario)}`,
      ).toBe(200);
      expect(read.contentType, 'the 200 must be JSON').toMatch(/application\/json/);
      expect(
        member(read, 'status'),
        `AC-2 — THE MUTANT THIS CASE KILLS: \`AppointmentBody.status\` narrowed from the ` +
          `two-member union to \`Type.Literal('confirmed')\`. A response schema literal ` +
          `SUBSTITUTES the constant for whatever the handler computed (slice 02, measurement ` +
          `8), so under that mutant this reads "confirmed" over a row that is cancelled.` +
          `\n${describeAnswer(read)}`,
      ).toBe('cancelled');
      const body = read.body as Record<string, unknown> | undefined;
      expect(
        body === undefined ? undefined : Object.keys(body).sort(),
        `AC-2 — the whole of AppointmentView, not a subset.\n${describeAnswer(read)}`,
      ).toEqual(APPOINTMENT_VIEW_KEYS);
      expect(member(read, 'id')).toBe(id);
      expect(member(read, 'bayId')).toBe(scenario.bayIds[0]);
      expect(member(read, 'technicianId')).toBe(scenario.technicianIds[0]);
    });
  });

  it('AC-2 (b) — after cancelling through the API, GET /appointments/{id} is 200 with status=cancelled and not 404', async () => {
    // AT THE RED COMMIT THIS FAILS AT ITS ARRANGE STEP, not at its claim. The cancellation
    // route 404s, so the assertion that fails is the one on `cancelled.status` below. That is
    // a fact about the route's absence; AC-2's own claim is asserted by case (a) above.
    const scenario = await seedScenario(client, 'ac2-cancel-then-read', {
      bays: 1,
      technicians: 1,
    });

    await withService(async (service) => {
      const booked = await postBooking(service, bookingBody(scenario));
      expect(booked.status, `the appointment to cancel was not booked.\n${describeAnswer(booked)}`).toBe(
        201,
      );
      const id = String(member(booked, 'id'));

      const cancelled = await postCancellation(service, id);
      expect(
        cancelled.status,
        `ARRANGE — POST /appointments/${id}/cancellation must answer 200. At the red commit ` +
          `this is a 404 because the route does not exist, and that failure is evidence about ` +
          `the route rather than about AC-2.\n${describeAnswer(cancelled)}`,
      ).toBe(200);

      const read = await getAppointment(service, id);
      expect(
        read.status,
        `AC-2 — it is not a 404.\n${describeAnswer(read)}\n${describeScenario(scenario)}`,
      ).toBe(200);
      expect(member(read, 'status'), 'AC-2 — the read must show the cancellation').toBe('cancelled');
      expect(
        read.body,
        `AC-2 — the read and the cancellation describe the SAME appointment through the same ` +
          `schema; a client parses one thing.\n${describeAnswer(read)}\n${describeAnswer(cancelled)}`,
      ).toEqual(cancelled.body);
    });
  });

  it('AC-3 — cancelling an already-cancelled appointment answers 200 with a byte-identical body', async () => {
    const scenario = await seedScenario(client, 'ac3-idempotent', { bays: 1, technicians: 1 });

    await withService(async (service) => {
      const booked = await postBooking(service, bookingBody(scenario));
      expect(booked.status, `the appointment to cancel was not booked.\n${describeAnswer(booked)}`).toBe(
        201,
      );
      const id = String(member(booked, 'id'));

      const first = await postCancellation(service, id);
      expect(
        first.status,
        `ARRANGE — the first cancellation must answer 200.\n${describeAnswer(first)}`,
      ).toBe(200);

      const second = await postCancellation(service, id);
      expect(
        second.status,
        `AC-3 — a replayed cancellation is 200, not 404 and not 409. arc42 §6.6 records the ` +
          `UPDATE's zero rows as meaning EXACTLY ONE thing — no such id — which is why D1's ` +
          `statement carries no \`AND status <> 'cancelled'\` guard: that guard returns zero ` +
          `rows for an already-cancelled row too, and a 404 here is what it looks like at the ` +
          `edge.\n${describeAnswer(second)}\n${describeScenario(scenario)}`,
      ).toBe(200);
      expect(second.contentType, 'the replay must be JSON, not problem+json').toMatch(
        /application\/json/,
      );
      const body = second.body as Record<string, unknown> | undefined;
      expect(
        body === undefined ? undefined : Object.keys(body).sort(),
        `AC-3 — the whole of AppointmentView.\n${describeAnswer(second)}`,
      ).toEqual(APPOINTMENT_VIEW_KEYS);
      expect(
        second.body,
        `AC-3 — "nothing changes", taken literally on the wire: the replay's body must equal ` +
          `the first cancellation's, member for member.\n${describeAnswer(first)}\n${describeAnswer(second)}`,
      ).toEqual(first.body);
      expect(member(second, 'status')).toBe('cancelled');

      // AND THE LIMIT OF THIS HALF, stated where it can be read (design D1, T-05-6 OBJ-3):
      // `updated_at` is in neither AppointmentView nor the response body, so the assertion
      // above is satisfied EQUALLY by D1's `CASE` and by the plain `updated_at = now()` D1
      // rejects. It does no discriminating work between those two. The half that does is the
      // `to_jsonb(appointment)` equality in tests/integration/cancellation-releases-slot.test.ts.
    });
  });
});
