import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  at,
  bookingBody,
  confirmedOverlapping,
  conflictRecords,
  describeAnswer,
  describeScenario,
  describeServiceOutput,
  isoAt,
  member,
  occupy,
  postBooking,
  postReschedule,
  seedScenario,
} from '../support/booking.js';
import type { ConflictRecord } from '../support/booking.js';

/**
 * Slice 06 — AC-1, over HTTP against the compiled artifact, with the observations an
 * outside-in test can actually make: the response, the database, and stdout.
 *
 * `docs/slices/06-reschedule-atomic-move.md` AC-1 · `docs/slices/06-design.md` §2.2 ·
 * arc42 §8.2 consequence 4 · ADR-0025, ADR-0026, ADR-0027 · CLAUDE.md §2.1, §5.
 *
 * WHOSE FILE THIS IS. `CLAUDE.md` §5 gives `tests/integration/` tests that assert a
 * DATABASE INVARIANT to the test-engineer. This file's claim is exactly that: a row does not
 * conflict with the version it replaces, and the exclusion constraints still adjudicate every
 * OTHER conflict on the move path. It imports no `src/` module.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THREE CASES, EACH PROVING A DIFFERENT HALF OF §2.2's ARGUMENT.
 *
 *   1. THE BASE CASE — an uncontended appointment moved twice onto intervals overlapping its
 *      own prior interval. Nothing else exists to conflict with, so this is the property in
 *      its purest form: two successive `200`s, the id/bay/technician unchanged, and NO
 *      `booking.conflict` line at all — because arc42 §8.2 consequence 4 says the index
 *      never sees the superseded tuple, there is nothing for `23P01` to fire on.
 *
 *   2. THE BAY CONTROL and 3. THE TECHNICIAN CONTROL (design §2.2's table) — what makes AC-1's
 *      pass HONEST rather than an accident of an under-specified fixture. Each stages a SECOND
 *      confirmed appointment that contends the moving appointment's OWN bay (or technician)
 *      at the target interval, so attempt 1 — which ADR-0027 fixes as the appointment's OWN
 *      current pair — is refused, and the refused constraint's NAME is read off the
 *      `booking.conflict` log line (I-02-6's observer, reused verbatim: design §2.2 says the
 *      observation is on this SAME line, and nothing else carries the constraint's name).
 *
 *      THEY ASSERT THE CONSTRAINT NAME, NOT THE RESPONSE STATUS. Under ADR-0004's retry a
 *      move onto a bay held by another confirmed appointment does NOT produce a `409` — it
 *      produces a SUCCESSFUL move to a different bay, because the loop re-allocates exactly
 *      as booking does (design §1's "one behaviour this system is about", QS-3). A control
 *      asserting a refusal would either fail outright or pass for the wrong reason, so what
 *      is asserted is that ATTEMPT 1 — deterministically the appointment's own pair, per
 *      ADR-0027, never shuffled — is refused naming the expected constraint, and the request
 *      may then succeed by re-allocation, which is correct rather than a control failure.
 *
 *      THE TWO SETUP APPOINTMENTS ARE WRITTEN DIRECTLY (`occupy`), never through the booking
 *      API. `occupy` is the established pattern for a contention fixture the test must
 *      CONTROL exactly (`tests/acceptance/error-taxonomy` cases 11/12, `candidate-retry`'s
 *      AC-3): booking allocates its bay and technician by ADR-0009's shuffle, so it cannot be
 *      relied on to land a specific appointment on a specific pair.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ONE DEPARTURE FROM AC-1's LITERAL WORDING, RAISED RATHER THAN TAKEN.
 *
 * The slice file's worked example says A confirmed `[09:00, 10:00)` is "rescheduled to
 * `[09:15, 10:15)` and then extended to `[09:15, 11:15)`" — a SECOND interval that is two
 * hours long where the first was one. `PATCH`'s body carries `startsAt` only (design §3); the
 * interval's DURATION is derived from the appointment's service type (ADR-0025) and a move
 * cannot change it (this slice's own "Out of scope": no change of service type). So a second
 * `startsAt` cannot reproduce `[09:15, 11:15)` against a fixed 60-minute service type without
 * ALSO changing the duration, which nothing on this path does or is asked to.
 *
 * What the wording is evidently FOR — the self-overlap semantics exercised twice in a row,
 * not the literal clock arithmetic — is preserved by moving to a second interval that
 * overlaps the FIRST move's interval instead: `[09:15, 10:15)` then `[09:45, 10:45)`, which
 * overlap at `[09:45, 10:15)`. Every property AC-1 names — both succeed, the id/bay/technician
 * survive, no `23P01` — is asserted on this pair. If this is ruled the other way (a genuine
 * duration change belongs on the move path after all), that is a design change and not a
 * wording one; recorded for the architect rather than invented past.
 */

async function withService<T>(
  run: (service: StartedService) => Promise<T>,
): Promise<T | undefined> {
  const attempt = await startService({
    databaseUrl: inject('databaseUrl'),
    // The constraint-name controls are read off stdout (I-02-6); `silent` would make that
    // half of the file vacuous.
    logLevel: 'trace',
  });
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

describe('slice 06 — AC-1: a row does not conflict with the version it replaces', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('AC-1 (base case) — two successive self-overlapping moves both succeed, the id/bay/technician survive, and no 23P01 is ever raised', async () => {
    const scenario = await seedScenario(client, 'ac1-self-overlap', { bays: 1, technicians: 1 });
    const where = `\n${describeScenario(scenario)}`;

    await withService(async (service) => {
      const booked = await postBooking(service, bookingBody(scenario));
      expect(booked.status, `ARRANGE — A was not booked.\n${describeAnswer(booked)}${where}`).toBe(
        201,
      );
      const id = String(member(booked, 'id'));
      const bayId = member(booked, 'bayId');
      const technicianId = member(booked, 'technicianId');

      // Move 1: [09:00,10:00) -> [09:15,10:15). Overlaps A's OWN prior interval.
      const first = await postReschedule(service, id, isoAt(15));
      expect(
        first.status,
        `AC-1 — the first move, onto an interval overlapping A's own prior one, must ` +
          `succeed.\n${describeAnswer(first)}${where}`,
      ).toBe(200);
      expect(first.contentType, 'the 200 must be JSON').toMatch(/application\/json/);
      expect(member(first, 'id'), 'AC-1 — the SAME appointment, not a new one').toBe(id);
      expect(member(first, 'bayId'), 'AC-1 — the bay is unchanged').toBe(bayId);
      expect(member(first, 'technicianId'), 'AC-1 — the technician is unchanged').toBe(
        technicianId,
      );
      expect(member(first, 'startsAt')).toBe(isoAt(15));
      expect(member(first, 'endsAt'), 'a 60-minute service type').toBe(isoAt(75));

      // Move 2 (the departure recorded in the header): [09:15,10:15) -> [09:45,10:45),
      // overlapping the FIRST move's interval at [09:45,10:15).
      const second = await postReschedule(service, id, isoAt(45));
      expect(
        second.status,
        `AC-1 — the second move, onto an interval overlapping the FIRST move's own interval, ` +
          `must also succeed.\n${describeAnswer(second)}${where}`,
      ).toBe(200);
      expect(member(second, 'id')).toBe(id);
      expect(member(second, 'bayId'), 'AC-1 — still the same bay').toBe(bayId);
      expect(member(second, 'technicianId'), 'AC-1 — still the same technician').toBe(
        technicianId,
      );
      expect(member(second, 'startsAt')).toBe(isoAt(45));
      expect(member(second, 'endsAt')).toBe(isoAt(105));

      // OVER THE TABLE: exactly one non-cancelled row overlaps the final interval, and it is A.
      const rows = await confirmedOverlapping(client, scenario.dealershipId, at(45), at(105));
      expect(
        rows.map((r) => `${r.id} ${r.startsAt} -> ${r.endsAt} (${r.status})`),
        `AC-1 — exactly one row, A's own, may overlap its final interval. A second row would ` +
          `mean the move inserted rather than updated.${where}`,
      ).toEqual([`${id} ${isoAt(45)} -> ${isoAt(105)} (confirmed)`]);

      // OVER STDOUT: no 23P01 was ever raised. Nothing else exists in this scenario to
      // conflict with, so the ONLY possible source of a booking.conflict line is A's own
      // superseded version — which arc42 §8.2 consequence 4 says the index never sees.
      const records = service.logRecords();
      expect(
        conflictRecords(records),
        `AC-1 — a row must not conflict with the version it replaces. Any booking.conflict ` +
          `line here means the UPDATE was checked against A's own prior tuple.\n` +
          `${describeServiceOutput(service)}${where}`,
      ).toEqual([]);
    });
  });

  it('AC-1 bay control — the appointment\'s own bay held by a different confirmed appointment at the target interval, its technician free: attempt 1 names no_bay_overlap, and the move may then succeed by re-allocation', async () => {
    const scenario = await seedScenario(client, 'ac1-bay-control', {
      bays: 2,
      technicians: 2,
    });
    const where = `\n${describeScenario(scenario)}`;
    const [bay1] = scenario.bayIds as readonly [string, string];
    const [tech1, tech2] = scenario.technicianIds as readonly [string, string];

    const aId = await occupy(client, scenario, {
      label: 'a',
      bayId: bay1,
      technicianId: tech1,
      startsAt: at(0),
      endsAt: at(60),
    });
    // C holds A's OWN bay (bay1) during the TAIL of the target interval, on the OTHER
    // technician — so tech1 (A's own) is free at the target, and only the BAY is violable on
    // attempt 1. C's interval starts at A's CURRENT end (`at(60)`), not at the target's own
    // start: A still physically occupies bay1 over `[0,60)` until it moves, so C's own
    // insert must not overlap that — `[60,75)` overlaps the TARGET `[15,75)` at `[60,75)`
    // without ever overlapping A's prior interval.
    const cId = await occupy(client, scenario, {
      label: 'c',
      bayId: bay1,
      technicianId: tech2,
      startsAt: at(60),
      endsAt: at(75),
    });

    await withService(async (service) => {
      const answer = await postReschedule(service, aId, isoAt(15));
      expect(
        answer.status,
        `A's own bay (bay1) is taken by C at the target interval; bay2/tech1 is free, so the ` +
          `move must succeed BY RE-ALLOCATION rather than be refused.\n${describeAnswer(answer)}${where}`,
      ).toBe(200);
      expect(member(answer, 'id')).toBe(aId);

      const records = await service.awaitLogRecords((rs) => conflictRecords(rs).length >= 1);
      const conflicts = [...conflictRecords(records)].sort(
        (x, y) => Number(x.attempt) - Number(y.attempt),
      ) as ConflictRecord[];
      expect(
        conflicts.length,
        `AC-1 bay control — attempt 1 (ADR-0027: the appointment's OWN pair, never shuffled) ` +
          `must be refused; C occupies bay1 for the whole target interval.\n` +
          `${describeServiceOutput(service)}${where} c=${cId}`,
      ).toBeGreaterThanOrEqual(1);
      const attemptOne = conflicts[0] as ConflictRecord;
      expect(String(attemptOne.attempt)).toBe('1');
      expect(
        attemptOne.constraint,
        `AC-1 bay control — A's own technician (tech1) is free at the target interval; only ` +
          `the bay is contended, so PostgreSQL must name no_bay_overlap and NOT ` +
          `no_technician_overlap.${where}`,
      ).toBe('no_bay_overlap');
      expect(attemptOne.resource).toBe('bay');

      // The re-allocated appointment must not have landed back on bay1 (still held by C).
      expect(
        member(answer, 'bayId'),
        'AC-1 bay control — the move must not have landed on the contended bay',
      ).not.toBe(bay1);
    });
  });

  it('AC-1 technician control — the appointment\'s own technician held by a different confirmed appointment at the target interval, its bay free: attempt 1 names no_technician_overlap, and the move may then succeed by re-allocation', async () => {
    const scenario = await seedScenario(client, 'ac1-technician-control', {
      bays: 2,
      technicians: 2,
    });
    const where = `\n${describeScenario(scenario)}`;
    const [bay1, bay2] = scenario.bayIds as readonly [string, string];
    const [tech1] = scenario.technicianIds as readonly [string, string];

    const aId = await occupy(client, scenario, {
      label: 'a',
      bayId: bay1,
      technicianId: tech1,
      startsAt: at(0),
      endsAt: at(60),
    });
    // D holds A's OWN technician (tech1) during the TAIL of the target interval, on the
    // OTHER bay — so bay1 (A's own) is free at the target, and only the TECHNICIAN is
    // violable on attempt 1. As with the bay control above, D's interval starts at A's
    // CURRENT end (`at(60)`): A still physically holds tech1 over `[0,60)` until it moves,
    // so D's own insert must not overlap that — `[60,75)` overlaps the TARGET `[15,75)` at
    // `[60,75)` without ever overlapping A's prior interval.
    const dId = await occupy(client, scenario, {
      label: 'd',
      bayId: bay2,
      technicianId: tech1,
      startsAt: at(60),
      endsAt: at(75),
    });

    await withService(async (service) => {
      const answer = await postReschedule(service, aId, isoAt(15));
      expect(
        answer.status,
        `A's own technician (tech1) is taken by D at the target interval; bay1/tech2 is free, ` +
          `so the move must succeed BY RE-ALLOCATION rather than be refused.\n${describeAnswer(answer)}${where}`,
      ).toBe(200);
      expect(member(answer, 'id')).toBe(aId);

      const records = await service.awaitLogRecords((rs) => conflictRecords(rs).length >= 1);
      const conflicts = [...conflictRecords(records)].sort(
        (x, y) => Number(x.attempt) - Number(y.attempt),
      ) as ConflictRecord[];
      expect(
        conflicts.length,
        `AC-1 technician control — attempt 1 (A's OWN pair) must be refused; D occupies tech1 ` +
          `for the whole target interval.\n${describeServiceOutput(service)}${where} d=${dId}`,
      ).toBeGreaterThanOrEqual(1);
      const attemptOne = conflicts[0] as ConflictRecord;
      expect(String(attemptOne.attempt)).toBe('1');
      expect(
        attemptOne.constraint,
        `AC-1 technician control — A's own bay (bay1) is free at the target interval; only the ` +
          `technician is contended, so PostgreSQL must name no_technician_overlap and NOT ` +
          `no_bay_overlap. A control asserting no_bay_overlap here would pass a build that got ` +
          `the bay right and left the technician side able to self-conflict (T-06-2).${where}`,
      ).toBe('no_technician_overlap');
      expect(attemptOne.resource).toBe('technician');

      expect(
        member(answer, 'technicianId'),
        'AC-1 technician control — the move must not have landed on the contended technician',
      ).not.toBe(tech1);
    });
  });
});
