import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  at,
  bookingBody,
  describeAnswer,
  describeScenario,
  getAvailability,
  isoAt,
  member,
  occupy,
  postBooking,
  postCancellation,
  seedScenario,
} from '../support/booking.js';
import type { HttpAnswer } from '../support/booking.js';

/**
 * AC-2 through AC-6 — `docs/slices/08-availability-query.md`, `docs/slices/08-design.md` §2.
 * arc42 §6.5, §8.6 · ADR-0032.
 *
 * AC-1 (QS-8, the property that ties the query to the constraint) is
 * `tests/property/availability-agrees-with-constraint.db.test.ts` — see that file's header for
 * why the `.db.` infix is there and arc42/the slice file's stated path is not.
 *
 *   AC-2  a confirmed appointment makes its bay unavailable over an overlapping window, and
 *         available again the instant the window moves past it (`[)`, back-to-back is free)
 *   AC-3  a technician qualified at dealership X only is never returned for dealership Y
 *   AC-4  cancelling frees the resources it held
 *   AC-5  every response carries an explicit advisory flag and states both facts (not a
 *         reservation; true only of the interval queried)
 *   AC-6  `to <= from` is 400 /problems/malformed-request — both `to < from` and `to === from`
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * AC-5 IS PARTLY UNASSERTABLE HERE, AND THAT IS RECORDED RATHER THAN WORKED AROUND.
 *
 * The slice file requires both facts in the response **and** the OpenAPI description. Nothing
 * in this repository yet emits an OpenAPI document a test can fetch — `package.json` has no
 * `docs:openapi` script, no `docs/api/openapi.json` exists, and QS-11's own row says as much of
 * an adjacent claim: *"the OpenAPI half is slice 09's and unasserted."* This file therefore
 * asserts only the response-body half; the OpenAPI-description half is left to the reviewer to
 * confirm by reading the route's TypeBox schema, exactly as QS-11 already leaves its half
 * unasserted for the identical reason. Recorded here so it reads as a decision, not a gap.
 *
 * AC-5 ALSO PINS NO WIRE FIELD NAME OR WORDING — neither the slice file nor the design's
 * `AvailabilityOutcome` sketch names one, and inventing an exact string this file must match
 * would be this role deciding the wire contract rather than the architect. What is asserted
 * instead is substance a correct implementation cannot avoid carrying under any reasonable
 * naming: a boolean `advisory` member (the vocabulary the whole slice uses for this endpoint,
 * in `docs/slices/08-availability-query.md`'s own title and throughout ADR-0032/0033), and the
 * two facts present as free text ANYWHERE in the body, matched by keyword rather than by exact
 * phrase. If the implementer's shape genuinely cannot satisfy this, that is a DCR against this
 * assumption — not a license to leave the disclosure out.
 */

const ADVISORY_FIELD = 'advisory';

function stringArray(answer: HttpAnswer, name: string): readonly string[] {
  const body = answer.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return [];
  const value = (body as Record<string, unknown>)[name];
  return Array.isArray(value) ? value.map(String) : [];
}

function bays(answer: HttpAnswer): readonly string[] {
  return stringArray(answer, 'bays');
}

function technicians(answer: HttpAnswer): readonly string[] {
  return stringArray(answer, 'technicians');
}

function expectProblem(answer: HttpAnswer, status: number, type: string, context: string): void {
  expect(answer.status, `${context}\n${describeAnswer(answer)}`).toBe(status);
  expect(
    answer.contentType,
    `${context} — RFC 9457 media type\n${describeAnswer(answer)}`,
  ).toMatch(/application\/problem\+json/);
  expect(member(answer, 'type'), `${context} — the taxonomy type\n${describeAnswer(answer)}`).toBe(
    type,
  );
}

async function withService<T>(
  run: (service: StartedService) => Promise<T>,
): Promise<T | undefined> {
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

describe('GET /availability — AC-2 through AC-6', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('AC-2 — a confirmed appointment makes its bay unavailable over an overlapping window, and available once the window is back-to-back with it', async () => {
    const scenario = await seedScenario(client, 'avail-ac2', { bays: 1, technicians: 1 });
    await occupy(client, scenario, {
      label: 'busy',
      bayId: scenario.bayIds[0] as string,
      technicianId: scenario.technicianIds[0] as string,
      startsAt: at(0),
      endsAt: at(60),
    });
    const where = `\n${describeScenario(scenario)}`;

    await withService(async (service) => {
      const overlapping = await getAvailability(service, {
        dealershipId: scenario.dealershipId,
        serviceTypeId: scenario.serviceTypeId,
        from: isoAt(30),
        to: isoAt(90),
      });
      expect(
        overlapping.status,
        `AC-2 — GET /availability did not answer 200.\n${describeAnswer(overlapping)}${where}`,
      ).toBe(200);
      expect(
        bays(overlapping),
        `AC-2 — [09:30, 10:30) overlaps the confirmed [09:00, 10:00) appointment, so the bay ` +
          `must NOT be reported free.\n${describeAnswer(overlapping)}${where}`,
      ).not.toContain(scenario.bayIds[0]);

      const backToBack = await getAvailability(service, {
        dealershipId: scenario.dealershipId,
        serviceTypeId: scenario.serviceTypeId,
        from: isoAt(60),
        to: isoAt(120),
      });
      expect(
        backToBack.status,
        `AC-2 — GET /availability did not answer 200.\n${describeAnswer(backToBack)}${where}`,
      ).toBe(200);
      expect(
        bays(backToBack),
        `AC-2 — [10:00, 11:00) starts exactly where the appointment ends: half-open ranges do ` +
          `not overlap here, so the bay must be reported free.\n${describeAnswer(backToBack)}${where}`,
      ).toContain(scenario.bayIds[0]);
    });
  });

  it('AC-3 — a technician qualified at dealership X only is never returned when availability is queried at dealership Y', async () => {
    const x = await seedScenario(client, 'avail-ac3-x', { bays: 1, technicians: 1 });
    // Y has no technician of its own for X's service type: the point is X's technician's
    // ABSENCE at Y, not a competing technician's presence.
    const y = await seedScenario(client, 'avail-ac3-y', { bays: 1, technicians: 0 });
    const where = `\n  X: ${describeScenario(x)}\n  Y: ${describeScenario(y)}`;

    await withService(async (service) => {
      // ARRANGE / positive control: X's own query must see its own technician, or the
      // absence asserted below would be trivially true for the wrong reason (nothing is
      // ever returned, for any dealership).
      const atX = await getAvailability(service, {
        dealershipId: x.dealershipId,
        serviceTypeId: x.serviceTypeId,
        from: isoAt(0),
        to: isoAt(60),
      });
      expect(
        atX.status,
        `ARRANGE — GET /availability at X did not answer 200.\n${describeAnswer(atX)}${where}`,
      ).toBe(200);
      expect(
        technicians(atX),
        `ARRANGE — X's own technician must be visible when X is queried, or AC-3's negative ` +
          `below proves nothing.\n${describeAnswer(atX)}${where}`,
      ).toContain(x.technicianIds[0]);

      const atY = await getAvailability(service, {
        dealershipId: y.dealershipId,
        serviceTypeId: x.serviceTypeId,
        from: isoAt(0),
        to: isoAt(60),
      });
      expect(
        atY.status,
        `AC-3 — GET /availability at Y did not answer 200.\n${describeAnswer(atY)}${where}`,
      ).toBe(200);
      expect(
        technicians(atY),
        `AC-3 (A-3, A-9) — X's technician belongs to X, not Y, and must not be returned for a ` +
          `query at Y even though the service type is the same row.\n${describeAnswer(atY)}${where}`,
      ).not.toContain(x.technicianIds[0]);
    });
  });

  it('AC-4 — cancelling an appointment frees the resources it held', async () => {
    const scenario = await seedScenario(client, 'avail-ac4', { bays: 1, technicians: 1 });
    const where = `\n${describeScenario(scenario)}`;

    await withService(async (service) => {
      const booked = await postBooking(service, bookingBody(scenario));
      expect(
        booked.status,
        `ARRANGE — the appointment was not booked.\n${describeAnswer(booked)}${where}`,
      ).toBe(201);
      const id = String(member(booked, 'id'));

      const whileConfirmed = await getAvailability(service, {
        dealershipId: scenario.dealershipId,
        serviceTypeId: scenario.serviceTypeId,
        from: isoAt(0),
        to: isoAt(60),
      });
      expect(
        bays(whileConfirmed),
        `ARRANGE — the booked bay must be reported busy before cancellation, or AC-4's release ` +
          `below proves nothing.\n${describeAnswer(whileConfirmed)}${where}`,
      ).not.toContain(scenario.bayIds[0]);

      const cancelled = await postCancellation(service, id);
      expect(
        cancelled.status,
        `ARRANGE — the appointment was not cancelled.\n${describeAnswer(cancelled)}${where}`,
      ).toBe(200);

      const afterCancel = await getAvailability(service, {
        dealershipId: scenario.dealershipId,
        serviceTypeId: scenario.serviceTypeId,
        from: isoAt(0),
        to: isoAt(60),
      });
      expect(
        afterCancel.status,
        `AC-4 — GET /availability did not answer 200.\n${describeAnswer(afterCancel)}${where}`,
      ).toBe(200);
      expect(
        bays(afterCancel),
        `AC-4 — a cancelled appointment leaves the exclusion constraint's scope (§6.4), and the ` +
          `bay it held must be reported free.\n${describeAnswer(afterCancel)}${where}`,
      ).toContain(scenario.bayIds[0]);
      expect(
        technicians(afterCancel),
        `AC-4 — and the technician it held.\n${describeAnswer(afterCancel)}${where}`,
      ).toContain(scenario.technicianIds[0]);
    });
  });

  it('AC-5 — every availability response carries an explicit advisory flag and states both facts: not a reservation, and true only of the interval queried', async () => {
    const scenario = await seedScenario(client, 'avail-ac5', { bays: 1, technicians: 1 });
    const where = `\n${describeScenario(scenario)}`;

    await withService(async (service) => {
      const answer = await getAvailability(service, {
        dealershipId: scenario.dealershipId,
        serviceTypeId: scenario.serviceTypeId,
        from: isoAt(0),
        to: isoAt(60),
      });
      expect(
        answer.status,
        `AC-5 — GET /availability did not answer 200.\n${describeAnswer(answer)}${where}`,
      ).toBe(200);
      expect(
        member(answer, ADVISORY_FIELD),
        `AC-5 — the response must carry an explicit advisory flag ('${ADVISORY_FIELD}: true'). ` +
          `See this file's header if the implementation carries the fact under a different ` +
          `name — that is a naming assumption, arguable as a DCR, not licence to omit the ` +
          `flag.\n${describeAnswer(answer)}${where}`,
      ).toBe(true);

      const text = (answer.rawBody ?? '').toLowerCase();
      expect(
        text.includes('reservation'),
        `AC-5 — the response must say a free result is NOT A RESERVATION.\n${describeAnswer(answer)}${where}`,
      ).toBe(true);
      expect(
        text.includes('interval') || text.includes('window'),
        `AC-5 — the response must say the answer is true ONLY OF THE INTERVAL QUERIED.\n${describeAnswer(answer)}${where}`,
      ).toBe(true);
    });
  });

  it('AC-6 — to <= from is 400 /problems/malformed-request, for to < from AND for to === from', async () => {
    const scenario = await seedScenario(client, 'avail-ac6', { bays: 1, technicians: 1 });
    const where = `\n${describeScenario(scenario)}`;

    await withService(async (service) => {
      const reversed = await getAvailability(service, {
        dealershipId: scenario.dealershipId,
        serviceTypeId: scenario.serviceTypeId,
        from: isoAt(60),
        to: isoAt(30),
      });
      expectProblem(
        reversed,
        400,
        '/problems/malformed-request',
        `AC-6 — to < from${where}`,
      );

      // F-08-3: from === to is an empty tstzrange, overlapping nothing, so an unguarded query
      // would vacuously report EVERYTHING free. The route must reject it the same way round
      // the database guards ends_at > starts_at, not merely the strict inequality.
      const equal = await getAvailability(service, {
        dealershipId: scenario.dealershipId,
        serviceTypeId: scenario.serviceTypeId,
        from: isoAt(0),
        to: isoAt(0),
      });
      expectProblem(
        equal,
        400,
        '/problems/malformed-request',
        `AC-6 — to === from (F-08-3's empty-tstzrange case) is ALSO 400, not merely to < from${where}`,
      );
    });
  });
});
