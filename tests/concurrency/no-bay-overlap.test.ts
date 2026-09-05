import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  at,
  bookingBody,
  conflictRecords,
  describeAnswer,
  describeScenario,
  describeServiceOutput,
  member,
  overlappingConfirmed,
  postBooking,
  releaseFromBarrier,
  seedScenario,
} from '../support/booking.js';
import type { HttpAnswer } from '../support/booking.js';

/**
 * QS-1 / AC-3 — no bay overlap, under twenty simultaneous requests.
 *
 * arc42 §10.2 QS-1 · `docs/slices/02-design.md` §0 (E-02-1), §2.6, §7 · `CLAUDE.md` §2.1.
 *
 * "Given one free bay over `[09:00, 10:00)`, when 20 booking requests for that interval are
 * released simultaneously from a barrier across pooled connections, then **exactly one**
 * non-cancelled row exists for that bay over any overlapping range, the other 19 receive
 * `409` with `type=/problems/no-capacity`, and the constraint PostgreSQL reports is
 * `no_bay_overlap`. Asserted over the table, never over the responses alone."
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE THREE ASSERTIONS ARE THREE DIFFERENT CLAIMS AND NONE OF THEM SUBSUMES THE OTHERS.
 *
 * 1. **Over the table.** One row for the bay over any OVERLAPPING range — the constraint's
 *    own `&&` predicate, not an equality on the interval. A system that booked twenty
 *    overlapping-but-unequal appointments passes an equality count and is the exact defect
 *    §2.1 exists to make unrepresentable.
 * 2. **Over the responses.** Nineteen `409`s with the taxonomy's `type` and `resource`. The
 *    table alone would be satisfied by a service that returned `500` nineteen times.
 * 3. **Over the constraint name.** `no_bay_overlap` — the fact that makes this evidence
 *    about the DATABASE rather than about application code that happened to serialise. It
 *    is read from the service's stdout, through the `booking.conflict` line design §2.6
 *    puts there (I-02-6): an outside-in test can observe the response, the database and the
 *    process's output, and the constraint name is in none of the first two.
 *
 * The alternative — having this test reproduce the conflict with its own SQL and read
 * `err.constraint` itself — was rejected at step 2 and the reason is worth keeping in front
 * of a future reader: choosing the probe row's bay lets the test make either constraint
 * appear at will, so the assertion goes vacuous while staying green.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY THE BAY IS THE SCARCE RESOURCE AND THE TECHNICIAN IS NOT.
 *
 * Twenty-four technicians against one bay. With one bay every attempt is on that bay, so
 * every `23P01` includes a bay violation and PostgreSQL names `no_bay_overlap` — whether or
 * not the technician was also taken (design §8, measurements 1-2: under double violation the
 * constraint reported is decided by index creation order, and `0003_appointment.sql` creates
 * `no_bay_overlap` first). That is what makes "every conflict names `no_bay_overlap`" a safe
 * assertion here and an unsafe one in AC-4's mirror image.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * RE-RUNNABILITY — F-02-7.
 *
 * The Definition of Done asks for "ADR-0009's seed in the failure message". There is no seed
 * in slice 02: the seeded shuffle and the attempt cap are slice 04's, and candidate ordering
 * here is deterministic (`ORDER BY name` for bays). A deterministic order is re-runnable by
 * construction with nothing to record, so what every failure message below carries instead is
 * the order that was used and the ids it was used on — `describeScenario`.
 */
const RACERS = 20;

describe('QS-1 / AC-3 — exactly one booking survives twenty simultaneous requests for one bay', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('one confirmed row for the bay, nineteen 409 /problems/no-capacity, and every conflict names no_bay_overlap', async () => {
    const scenario = await seedScenario(client, 'qs1-bay-race', {
      bays: 1,
      technicians: 24,
      customers: RACERS,
    });
    const fixture = describeScenario(scenario);

    // LOG_LEVEL is raised from the harness default of `silent`: the conflict line IS the
    // observation this case is built on, and a silent process would make assertion 3 vacuous.
    const attempt = await startService({
      databaseUrl: inject('databaseUrl'),
      logLevel: 'trace',
    });
    expect(attempt.failure ?? 'started', `the service did not start.\n${attempt.failure}`).toBe(
      'started',
    );
    const service = attempt.service as StartedService;

    try {
      const answers = await releaseFromBarrier<HttpAnswer>(RACERS, async (index) =>
        postBooking(service, bookingBody(scenario, { customerIndex: index })),
      );

      const failed = answers.filter((a) => a.transportFailure !== undefined);
      expect(
        failed.map((a) => a.transportFailure),
        `some racers never got an answer.\n${fixture}`,
      ).toEqual([]);

      // ── 1. OVER THE TABLE. This is the assertion QS-1 is about; the two below support it.
      const rows = await overlappingConfirmed(
        client,
        'bay_id',
        scenario.bayIds[0] as string,
        at(0),
        at(60),
      );
      expect(
        rows.map((r) => `${r.id} ${r.startsAt} -> ${r.endsAt} (${r.status})`),
        `EXACTLY ONE non-cancelled appointment may overlap [anchor, anchor+60) in this bay. ` +
          `More than one is a double booking and CLAUDE.md §2.1 has failed; zero means nothing ` +
          `was booked at all.\n${fixture}`,
      ).toHaveLength(1);

      // ── 2. OVER THE RESPONSES.
      // T-02-9, raised at step 3 with its measurement. Under N SIMULTANEOUS inserts against one
      // exclusion range PostgreSQL refuses the losers with EITHER `23P01` OR `40P01`
      // (deadlock_detected), all-or-nothing per race, in roughly one race in three at every N
      // from 2 to 20 — `check_exclusion_constraint` inserts the index tuple and THEN scans, so
      // simultaneous inserters wait on each other's in-progress tuples and form a cycle.
      // Exactly one row survives either way, so §2.1 is untouched; but design §2.6 classifies
      // `40P01` as `other`, which is a rethrow and a `500`. If the split below reads
      // "1 confirmed / 0 refused" with nineteen 500s, that is this finding and not a defect in
      // the booking path — see the step-3 report.
      const confirmed = answers.filter((a) => a.status === 201);
      const refused = answers.filter((a) => a.status === 409);
      expect(
        `${String(confirmed.length)} confirmed / ${String(refused.length)} refused`,
        `the ${String(RACERS)} racers must split 1 / ${String(RACERS - 1)}.\n` +
          answers.map((a, i) => `  [${String(i)}] ${describeAnswer(a)}`).join('\n') +
          `\n${fixture}`,
      ).toBe(`1 / ${String(RACERS - 1)}`);

      expect(
        refused.map((a) => member(a, 'type')).filter((t) => t !== '/problems/no-capacity'),
        'every refusal must carry the taxonomy type for contention',
      ).toEqual([]);
      expect(
        refused.map((a) => a.contentType).filter((c) => !/application\/problem\+json/.test(c ?? '')),
        'every refusal must be RFC 9457 problem+json',
      ).toEqual([]);
      expect(
        refused.map((a) => member(a, 'resource')).filter((r) => r !== 'bay'),
        `the contended resource is the BAY: 24 technicians were seeded and one bay.\n${fixture}`,
      ).toEqual([]);

      // The confirmed response and the stored row must be the same appointment — otherwise
      // "exactly one row" and "exactly one 201" are two facts about two different things.
      const winner = confirmed[0];
      expect(String(member(winner ?? {}, 'id')), 'the confirmed 201 must be the stored row').toBe(
        rows[0]?.id,
      );

      // ── 3. OVER THE CONSTRAINT NAME.
      const records = await service.awaitLogRecords(
        (rs) => conflictRecords(rs).length >= RACERS - 1,
      );
      const conflicts = conflictRecords(records);
      expect(
        conflicts.length,
        `design §2.6 writes one 'booking.conflict' line per 23P01, carrying { constraint, ` +
          `resource, attempt }. Nineteen racers were refused, so at least nineteen lines are ` +
          `owed. None at all means the observer I-02-6 added is missing and the constraint ` +
          `name cannot be asserted at all.\n${describeServiceOutput(service)}\n${fixture}`,
      ).toBeGreaterThanOrEqual(RACERS - 1);
      expect(
        [...new Set(conflicts.map((c) => c.constraint))].sort(),
        `with ONE bay every attempt is on that bay, so every 23P01 includes a bay violation ` +
          `and PostgreSQL names no_bay_overlap (design §8, measurements 1-2).\n${fixture}`,
      ).toEqual(['no_bay_overlap']);
      expect(
        [...new Set(conflicts.map((c) => c.resource))].sort(),
        'the resource minted from that constraint name',
      ).toEqual(['bay']);
    } finally {
      await service.stop();
    }
  });
});
