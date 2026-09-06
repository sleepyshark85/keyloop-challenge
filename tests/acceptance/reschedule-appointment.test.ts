import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { uuidFor } from '../support/ids.js';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  bookingBody,
  describeAnswer,
  describeScenario,
  isoAt,
  member,
  postBooking,
  postCancellation,
  postReschedule,
  seedScenario,
} from '../support/booking.js';

/**
 * Slice 06 — AC-3, AC-4 and AC-5, over HTTP against the compiled artifact.
 *
 * `docs/slices/06-reschedule-atomic-move.md` · `docs/slices/06-design.md` §2.1, §3 ·
 * arc42 §6.3, §8.6 · ADR-0003, ADR-0025.
 *
 *   AC-3  a move outside the dealership's opening hours is `400 /problems/outside-opening-hours`
 *         — the SAME domain rule as booking, not a second copy of it — and NOT `409`
 *   AC-4  moving a CANCELLED appointment is `409 /problems/appointment-not-confirmed`, a
 *         DIFFERENT type from a contended `409`
 *   AC-5  moving an UNKNOWN id is `404 /problems/appointment-not-found`, decided by the read
 *         the move needs anyway — and (asserted in `tests/integration/reschedule-is-one-statement.test.ts`,
 *         the test-engineer's database-invariant file) the `UPDATE` is never issued for it
 *
 * `tests/acceptance/AC-1` (self-overlap, and the two constraint-name controls) and `AC-2`
 * ("exactly one statement") live in `tests/integration/`, per design §5 — AC-1 needs the
 * `booking.conflict` log line and AC-2 needs a database-invariant audit trigger, neither of
 * which this file's HTTP-only vantage point can see. This file covers the taxonomy half.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE RULED CONSEQUENCE (design §2.1): A CANCELLED APPOINTMENT MOVED OUT OF HOURS IS `400`,
 * NOT `409`.
 *
 * ADR-0025 decision 4 says the status guard lives ONLY in the guarded `UPDATE`'s `WHERE`
 * clause — never in a preceding check — so the domain rule (`openingHours`) is evaluated
 * FIRST and unconditionally, before the appointment's status is ever consulted at the
 * database. A doubly-invalid request (cancelled AND out of hours) therefore reports the
 * domain failure, not the state conflict. This is recorded in the design as a case a test
 * would hit at this step, so it is pinned here rather than found by surprise.
 *
 * AC-4's metric half — "and does NOT increment `booking_conflicts_total`" — is NOT asserted
 * anywhere in this slice: the metric does not exist until slice 09 (design §5), which carries
 * it as that slice's own AC. Only the status and the `type` are asserted here.
 */

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

describe('slice 06 — AC-3, AC-4, AC-5: the taxonomy half of rescheduling', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('AC-3 — a move outside the dealership\'s opening hours is 400 /problems/outside-opening-hours, and not 409', async () => {
    // The bay and technician are both free at the target interval, so a 409 here could only
    // mean the domain rule was skipped and capacity was consulted for a question that is not
    // about capacity — the same GC-1 argument AC-7 of the taxonomy makes for booking.
    const scenario = await seedScenario(client, 'r06-ac3-hours', {
      bays: 1,
      technicians: 1,
      hours: { opensAt: '09:00:00', closesAt: '17:00:00' },
    });
    const where = `\n${describeScenario(scenario)}`;

    await withService(async (service) => {
      const booked = await postBooking(service, bookingBody(scenario));
      expect(booked.status, `ARRANGE — the appointment to move was not booked.${where}`).toBe(201);
      const id = String(member(booked, 'id'));

      const answer = await postReschedule(service, id, isoAt(780)); // 23:00 local
      expect(
        answer.status,
        `AC-3 — 23:00 local against 09:00-17:00, with the bay and technician both free.\n${describeAnswer(answer)}${where}`,
      ).toBe(400);
      expect(answer.contentType, 'RFC 9457').toMatch(/application\/problem\+json/);
      expect(member(answer, 'type')).toBe('/problems/outside-opening-hours');
      expect(answer.status, 'AC-3 names this explicitly: out-of-hours is NOT a capacity conflict').not.toBe(
        409,
      );
    });
  });

  it('AC-4 — moving a CANCELLED appointment is 409 /problems/appointment-not-confirmed, a DIFFERENT type from a contended 409', async () => {
    const scenario = await seedScenario(client, 'r06-ac4-not-confirmed', {
      bays: 1,
      technicians: 1,
    });
    const where = `\n${describeScenario(scenario)}`;

    await withService(async (service) => {
      const booked = await postBooking(service, bookingBody(scenario));
      expect(booked.status, `ARRANGE — the appointment was not booked.${where}`).toBe(201);
      const id = String(member(booked, 'id'));

      const cancelled = await postCancellation(service, id);
      expect(cancelled.status, `ARRANGE — the appointment was not cancelled.${where}`).toBe(200);

      const answer = await postReschedule(service, id, isoAt(120));
      expect(
        answer.status,
        `AC-4 — a cancelled appointment is terminal (ADR-0003); it must not be movable.\n${describeAnswer(answer)}${where}`,
      ).toBe(409);
      expect(answer.contentType, 'RFC 9457').toMatch(/application\/problem\+json/);
      expect(
        member(answer, 'type'),
        `AC-4 — this 409 MUST NOT share its type with a contended one: a client that cannot ` +
          `retry a terminal appointment must be told so distinctly from one it may retry.${where}`,
      ).toBe('/problems/appointment-not-confirmed');
      expect(
        member(answer, 'type'),
        'AC-4 — and it must not collide with the contention type',
      ).not.toBe('/problems/no-capacity');
    });
  });

  it('AC-5 — moving an UNKNOWN but well-formed id is 404 /problems/appointment-not-found', async () => {
    const unknownId = uuidFor('r06-ac5-unknown', 'never-booked');

    await withService(async (service) => {
      const answer = await postReschedule(service, unknownId, isoAt(60));
      expect(answer.status, describeAnswer(answer)).toBe(404);
      expect(answer.contentType, 'RFC 9457').toMatch(/application\/problem\+json/);
      expect(
        member(answer, 'type'),
        `AC-5 — arc42 §8.6 gains no row for this: the existing appointment-not-found type is ` +
          `reused verbatim.\n${describeAnswer(answer)}`,
      ).toBe('/problems/appointment-not-found');
      expect(member(answer, 'status'), 'RFC 9457 repeats the status in the body').toBe(404);
    });
  });

  it('ruled consequence (design §2.1) — a CANCELLED appointment moved OUT OF HOURS is 400 outside-opening-hours, not 409', async () => {
    // ADR-0025 decision 4: the status guard lives ONLY in the guarded UPDATE, never in a
    // preceding check, so the domain rule is evaluated first and unconditionally. A request
    // that is BOTH cancelled and out of hours must therefore report the DOMAIN failure.
    const scenario = await seedScenario(client, 'r06-ruled-both-invalid', {
      bays: 1,
      technicians: 1,
      hours: { opensAt: '09:00:00', closesAt: '17:00:00' },
    });
    const where = `\n${describeScenario(scenario)}`;

    await withService(async (service) => {
      const booked = await postBooking(service, bookingBody(scenario));
      expect(booked.status, `ARRANGE — the appointment was not booked.${where}`).toBe(201);
      const id = String(member(booked, 'id'));

      const cancelled = await postCancellation(service, id);
      expect(cancelled.status, `ARRANGE — the appointment was not cancelled.${where}`).toBe(200);

      const answer = await postReschedule(service, id, isoAt(780)); // 23:00 local, out of hours
      expect(
        answer.status,
        `design §2.1's ruled consequence — the domain rule (openingHours) is evaluated before ` +
          `the database ever consults the row's status, so a doubly-invalid request reports ` +
          `the domain failure and not the state conflict.\n${describeAnswer(answer)}${where}`,
      ).toBe(400);
      expect(member(answer, 'type')).toBe('/problems/outside-opening-hours');
      expect(
        answer.status,
        'this must NOT be 409 — AC-4\'s type is reachable only when the interval is otherwise legal',
      ).not.toBe(409);
    });
  });
});
