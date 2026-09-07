import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  bookingBody,
  describeAnswer,
  describeScenario,
  member,
  postBooking,
  postRaw,
  seedScenario,
} from '../support/booking.js';
import type { HttpAnswer, Scenario } from '../support/booking.js';

/**
 * Slice 09 — AC-6b, `OQ-05-2` re-routed here (`R-05-2`). `docs/slices/09-observability.md`
 * · arc42 §8.6's status table, the `400 /problems/malformed-request` row.
 *
 * `tests/acceptance/cancel-appointment.test.ts` already pins `postCancellation`'s CLIENT as
 * one that never sends `content-type` at all, and its own docblock records the OLD, still
 * correct-until-this-slice behaviour: `content-type: application/json` with an empty body on
 * `POST /appointments/{id}/cancellation` answered `400 FST_ERR_CTP_EMPTY_JSON_BODY`, because
 * the route reads no body and Fastify's content-type parser raises before any route schema
 * runs. This slice's harness (`AC-10`) sets `content-type` reflexively on every `POST`, so
 * that `400` would fire on a real client's happy path — this file is the acceptance test for
 * the fix, over the SAME route, with the header sent and the body genuinely empty.
 *
 * Deliberately does **not** edit `tests/unit/http/appointments.test.ts:381`, which pins the
 * OLD `400` at the unit level — that file is the implementer's, and the design says this
 * moves at green, not at this red commit (`CLAUDE.md` §5).
 */

describe('AC-6b — Content-Type: application/json with an empty body, on a route that reads no body, is 200', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  async function withService<T>(body: (service: StartedService) => Promise<T>): Promise<{ failure?: string; value?: T }> {
    const attempt = await startService({ databaseUrl: inject('databaseUrl'), logLevel: 'silent' });
    if (attempt.service === undefined) return { failure: attempt.failure ?? 'the service did not start' };
    const service = attempt.service;
    try {
      return { value: await body(service) };
    } finally {
      await service.stop();
    }
  }

  it('AC-6b — POST /appointments/{id}/cancellation with content-type json and no body answers 200, not 400', async () => {
    const scenario: Scenario = await seedScenario(client, 'ac6b-empty-body-cancel', { bays: 1, technicians: 1 });

    const { failure, value } = await withService(async (service) => {
      const booked = await postBooking(service, bookingBody(scenario));
      const id = String(member(booked, 'id'));
      const cancelled = await postRaw(service, `/appointments/${id}/cancellation`, {
        contentType: 'application/json',
      });
      return { booked, cancelled };
    });

    expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
    const { booked, cancelled } = value as { booked: HttpAnswer; cancelled: HttpAnswer };
    const fixture = describeScenario(scenario);

    expect(booked.status, `ARRANGE — booking failed.\n${fixture}\n${describeAnswer(booked)}`).toBe(201);
    expect(
      cancelled.status,
      `AC-6b — a reflexive content-type header on an empty body must not turn the harness's ` +
        `happy path into a 400.\n${fixture}\n${describeAnswer(cancelled)}`,
    ).toBe(200);
    expect(member(cancelled, 'status')).toBe('cancelled');
  });

  it('AC-6b regression control — content-type json with a genuinely malformed body is still 400', async () => {
    const scenario: Scenario = await seedScenario(client, 'ac6b-malformed-body-cancel', { bays: 1, technicians: 1 });

    const { failure, value } = await withService(async (service) => {
      const booked = await postBooking(service, bookingBody(scenario));
      const id = String(member(booked, 'id'));
      const cancelled = await postRaw(service, `/appointments/${id}/cancellation`, {
        contentType: 'application/json',
        body: '{oops',
      });
      return { cancelled };
    });

    expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
    const { cancelled } = value as { cancelled: HttpAnswer };
    expect(
      cancelled.status,
      `the fix must map an empty body to undefined, not stop parsing invalid JSON.\n${describeAnswer(cancelled)}`,
    ).toBe(400);
    expect(member(cancelled, 'type')).toBe('/problems/malformed-request');
  });
});
