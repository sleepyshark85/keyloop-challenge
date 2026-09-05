import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { uuidFor } from '../support/ids.js';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  bookingBody,
  describeAnswer,
  describeScenario,
  findStoredAppointment,
  getAppointment,
  isoAt,
  member,
  postBooking,
  seedScenario,
} from '../support/booking.js';

/**
 * Slice 02 — AC-1, AC-2, AC-6 and AC-19, over HTTP against the compiled artifact.
 *
 * `docs/slices/02-book-and-read-an-appointment.md` · `docs/slices/02-design.md` §2.6, §2.7 ·
 * arc42 §8.6 · ADR-0015.
 *
 *   AC-1   a booking is confirmed `201`, NAMING the allocated bay and technician, and one
 *          `confirmed` row exists
 *   AC-2   `GET /appointments/{id}` returns `200` with the same appointment; an unknown id
 *          returns `404` with `type=/problems/appointment-not-found`
 *   AC-6   a request carrying an explicit end time has it ignored; the interval is derived
 *          from the service type's duration
 *   AC-19  reference data holding `'24:00:00'` in a closing-time column yields 86 400 and is
 *          not rejected as `malformed-hours`
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY EVERY FAILURE HERE IS AN ASSERTION (process criterion C1).
 *
 * At the red commit `dist/main.js` exists and starts — slice 00a built it and `/health`
 * answers — but has no `/appointments` route. So `postBooking` completes and returns
 * Fastify's `404`, and the assertion that fails is `expect(status).toBe(201)` inside a test
 * body. Nothing is imported that does not exist and nothing is stubbed.
 *
 * The service is started INSIDE each test rather than in a `beforeAll`, on 00a's rule: a
 * failure in a hook is a hook error, not a failed assertion in a collected file.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * AC-2's `404` IS A VACUOUS-GREEN TRAP, AND THIS FILE IS WRITTEN AROUND IT.
 *
 * At the red commit `GET /appointments/{a real uuid}` ALREADY returns `404` — because the
 * route does not exist, so Fastify's default not-found handler answers. A test asserting the
 * STATUS alone would be green at the red commit and green forever after, including over an
 * implementation that never registered the route at all. So the unknown-id case asserts the
 * media type (`application/problem+json`) and the `type` member, which Fastify's own
 * not-found body carries neither of.
 */
describe('slice 02 — booking an appointment and reading it back', () => {
  let client: Client;

  // CONNECT AND NOTHING ELSE — no DDL, no DML, no seeding and no assertions (slice 00's
  // rule 1, and the reason this file's red is a set of assertion failures).
  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('AC-1 — a booking is confirmed 201, naming the ALLOCATED bay and technician, and exactly one confirmed row exists', async () => {
    const scenario = await seedScenario(client, 'ac1-book', { bays: 1, technicians: 1 });

    const attempt = await startService({ databaseUrl: inject('databaseUrl') });
    expect(attempt.failure ?? 'started', `the service did not start.\n${attempt.failure}`).toBe(
      'started',
    );
    const service = attempt.service as StartedService;

    try {
      const answer = await postBooking(service, bookingBody(scenario));

      expect(
        answer.status,
        `POST /appointments did not confirm the booking.\n${describeAnswer(answer)}\n${describeScenario(scenario)}`,
      ).toBe(201);
      expect(answer.contentType, 'the 201 must be JSON').toMatch(/application\/json/);

      // THE WHOLE BODY, not a subset. `AppointmentView` is pinned in design §2.6 precisely
      // because two roles guessed at it independently at step 2 (T-02-3, I-02-7), and
      // measurement 8 makes guessing unsafe: a `Type.Literal` in a response schema
      // SUBSTITUTES the constant for whatever the handler computed, so a partial assertion
      // over a substituted field cannot fail.
      const body = answer.body as Record<string, unknown> | undefined;
      expect(
        body === undefined ? undefined : Object.keys(body).sort(),
        `the 201 body is not AppointmentView.\n${describeAnswer(answer)}`,
      ).toEqual(
        [
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
        ],
      );

      expect(member(answer, 'dealershipId')).toBe(scenario.dealershipId);
      expect(member(answer, 'customerId')).toBe(scenario.customers[0]?.customerId);
      expect(member(answer, 'vehicleId')).toBe(scenario.customers[0]?.vehicleId);
      expect(member(answer, 'serviceTypeId')).toBe(scenario.serviceTypeId);
      expect(member(answer, 'startsAt'), 'DA-02-2 — ISO-8601 UTC, never the local zone').toBe(
        isoAt(0),
      );
      expect(member(answer, 'endsAt'), 'derived from the service type duration').toBe(isoAt(60));
      expect(member(answer, 'status')).toBe('confirmed');
      expect(
        member(answer, 'bayId'),
        'the response must name a bay the dealership actually has',
      ).toBe(scenario.bayIds[0]);
      expect(
        member(answer, 'technicianId'),
        'the response must name a technician the dealership actually has',
      ).toBe(scenario.technicianIds[0]);

      // "NAMING THE ALLOCATED bay and technician" — the claim is about the row that was
      // written, not about any two plausible ids. A response naming bay B while the row
      // holds bay A satisfies every assertion above and is exactly the defect AC-1's word
      // "allocated" is guarding, so the row is read back and compared to the body.
      const id = String(member(answer, 'id'));
      const stored = await findStoredAppointment(client, id);
      expect(
        stored,
        `no appointment row exists with the id the 201 returned (${id}).\n${describeScenario(scenario)}`,
      ).not.toBeNull();
      expect(stored, 'the confirmed row must be the appointment the response described').toEqual({
        id,
        dealershipId: scenario.dealershipId,
        customerId: scenario.customers[0]?.customerId,
        vehicleId: scenario.customers[0]?.vehicleId,
        serviceTypeId: scenario.serviceTypeId,
        technicianId: member(answer, 'technicianId'),
        bayId: member(answer, 'bayId'),
        startsAt: isoAt(0),
        endsAt: isoAt(60),
        status: 'confirmed',
      });
    } finally {
      await service.stop();
    }
  });

  it('AC-2 — GET /appointments/{id} returns 200 with the same appointment', async () => {
    const scenario = await seedScenario(client, 'ac2-read', { bays: 1, technicians: 1 });

    const attempt = await startService({ databaseUrl: inject('databaseUrl') });
    expect(attempt.failure ?? 'started', `the service did not start.\n${attempt.failure}`).toBe(
      'started',
    );
    const service = attempt.service as StartedService;

    try {
      const booked = await postBooking(service, bookingBody(scenario));
      expect(
        booked.status,
        `the booking this case reads back was not confirmed.\n${describeAnswer(booked)}`,
      ).toBe(201);

      const id = String(member(booked, 'id'));
      const read = await getAppointment(service, id);

      expect(read.status, `GET /appointments/${id}\n${describeAnswer(read)}`).toBe(200);
      expect(read.contentType, 'the 200 must be JSON').toMatch(/application\/json/);
      // The SAME shape from the SAME schema (design §2.7): a client parses one thing, and
      // AC-1's "naming the allocated bay and technician" is asserted against the same fields
      // on both paths.
      expect(read.body, 'the 200 body must be the 201 body').toEqual(booked.body);
    } finally {
      await service.stop();
    }
  });

  it('AC-2 — an unknown but well-formed id returns 404 as application/problem+json with type=/problems/appointment-not-found', async () => {
    // THE VACUOUS-GREEN TRAP. At the red commit this id already answers 404, from Fastify's
    // default not-found handler, because the route does not exist. Asserting the status
    // alone would pass here and pass over an implementation that never registered the route.
    // The media type and the `type` member are what discriminate, and neither is present in
    // Fastify's own not-found body — measured: `{"message":"Route GET:/appointments/… not
    // found","error":"Not Found","statusCode":404}` as `application/json`.
    const unknownId = uuidFor('ac2-read', 'never-booked');

    const attempt = await startService({ databaseUrl: inject('databaseUrl') });
    expect(attempt.failure ?? 'started', `the service did not start.\n${attempt.failure}`).toBe(
      'started',
    );
    const service = attempt.service as StartedService;

    try {
      const read = await getAppointment(service, unknownId);

      expect(read.status, describeAnswer(read)).toBe(404);
      expect(
        read.contentType,
        `the 404 must be RFC 9457 problem+json, not Fastify's default not-found body.\n${describeAnswer(read)}`,
      ).toMatch(/application\/problem\+json/);
      expect(
        member(read, 'type'),
        `the 404 must carry the taxonomy's type.\n${describeAnswer(read)}`,
      ).toBe('/problems/appointment-not-found');
      expect(member(read, 'status'), 'RFC 9457 repeats the status in the body').toBe(404);
    } finally {
      await service.stop();
    }
  });

  it('AC-6 — a supplied end time is ignored; the interval is derived from the service type duration', async () => {
    const scenario = await seedScenario(client, 'ac6-derived', {
      bays: 1,
      technicians: 1,
      durationMinutes: 30,
    });

    const attempt = await startService({ databaseUrl: inject('databaseUrl') });
    expect(attempt.failure ?? 'started', `the service did not start.\n${attempt.failure}`).toBe(
      'started',
    );
    const service = attempt.service as StartedService;

    try {
      // Eight hours, against a thirty-minute service type. The two answers are far apart on
      // purpose: an implementation that honours the supplied end returns `isoAt(480)` and
      // this case names which of the two it got.
      const answer = await postBooking(service, {
        ...bookingBody(scenario),
        endsAt: isoAt(480),
      });

      expect(
        answer.status,
        `an extra endsAt must not prevent the booking — design §2.7 measured that Fastify STRIPS it (removeAdditional).\n${describeAnswer(answer)}`,
      ).toBe(201);
      expect(
        member(answer, 'endsAt'),
        `the supplied end was honoured instead of the derived one.\n${describeAnswer(answer)}`,
      ).toBe(isoAt(30));

      // And in the table, because the response is one place the derived end could be
      // rendered correctly over a row that holds the client's.
      const stored = await findStoredAppointment(client, String(member(answer, 'id')));
      expect(stored?.endsAt, 'the stored interval must be the derived one').toBe(isoAt(30));
    } finally {
      await service.stop();
    }
  });

  it("AC-19 — a dealership whose closing time is '24:00:00' can be booked up to local midnight", async () => {
    // ADR-0015, end to end through REFERENCE DATA rather than through a hand-built weekly
    // tuple. Measured in design §8 row 9: `pg` returns a `time` column holding `'24:00:00'`
    // as the JavaScript string `"24:00:00"`, which is exactly what the parser takes — so the
    // `'24:00:00'` arm slice 01 recorded as unreachable becomes live here, which is what
    // retires that finding by making the branch REACHABLE AND KILLED rather than by deleting
    // it (the slice file's out-of-scope, ADR-0015 Option C refused).
    //
    // Written over HTTP because a test that hands the parser a hand-built `'24:00:00'`
    // asserts nothing about whether reference data can hold one. AC-19 says "given reference
    // data holding '24:00:00' in a closing-time column"; the column is where it must live.
    const scenario = await seedScenario(client, 'ac19-midnight', {
      bays: 1,
      technicians: 1,
      hours: { opensAt: '09:00:00', closesAt: '24:00:00' },
    });

    const attempt = await startService({ databaseUrl: inject('databaseUrl') });
    expect(attempt.failure ?? 'started', `the service did not start.\n${attempt.failure}`).toBe(
      'started',
    );
    const service = attempt.service as StartedService;

    try {
      // ANCHOR is 10:00 Europe/London (BST) on Tuesday 2026-09-08; +780 minutes is 23:00
      // local, and a 60-minute job ends at 00:00 local on 2026-09-09 — exactly the interval
      // ADR-0015 normalises to `secondsOfDay = 86400` on the start's day.
      const answer = await postBooking(service, {
        ...bookingBody(scenario),
        startsAt: isoAt(780),
      });

      expect(
        answer.status,
        'a 23:00-24:00 local job at a dealership open until 24:00 must be CONFIRMED. ' +
          "A 400 /problems/outside-opening-hours means step 4 still reads the end as the next local day (ADR-0015 unbuilt); a 500 /problems/internal means '24:00:00' was rejected as malformed-hours, which is AC-19's other half.\n" +
          `${describeAnswer(answer)}`,
      ).toBe(201);
      expect(member(answer, 'endsAt')).toBe(isoAt(840));
    } finally {
      await service.stop();
    }
  });

  it('AC-19 negative control — the same 23:00 job at a dealership closing at 17:00 is refused, so the case above is not passing because hours are ignored', async () => {
    const scenario = await seedScenario(client, 'ac19-control', {
      bays: 1,
      technicians: 1,
      hours: { opensAt: '09:00:00', closesAt: '17:00:00' },
    });

    const attempt = await startService({ databaseUrl: inject('databaseUrl') });
    expect(attempt.failure ?? 'started', `the service did not start.\n${attempt.failure}`).toBe(
      'started',
    );
    const service = attempt.service as StartedService;

    try {
      const answer = await postBooking(service, {
        ...bookingBody(scenario),
        startsAt: isoAt(780),
      });

      expect(
        answer.status,
        `23:00 local is outside 09:00-17:00 and must be refused — if this is 201 the opening-hours check is not running at all, and AC-19's green above proves nothing.\n${describeAnswer(answer)}`,
      ).toBe(400);
      expect(member(answer, 'type')).toBe('/problems/outside-opening-hours');
    } finally {
      await service.stop();
    }
  });
});
