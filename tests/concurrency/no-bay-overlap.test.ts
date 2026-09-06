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
 * WHY THE BAY IS THE SCARCE RESOURCE AND THE TECHNICIAN IS NOT, AND WHY ADR-0009 DID NOT
 * TOUCH THAT ARGUMENT (I-04-10).
 *
 * Twenty-four technicians against one bay. With one bay every attempt is on that bay, so
 * every `23P01` includes a bay violation and PostgreSQL names `no_bay_overlap` — whether or
 * not the technician was also taken (design §8, measurements 1-2: under double violation the
 * constraint reported is decided by index creation order, and `0003_appointment.sql` creates
 * `no_bay_overlap` first). That is what makes "every conflict names `no_bay_overlap`" a safe
 * assertion here.
 *
 * Slice 02 wrote that against a deterministic candidate order, and ADR-0009's Order-C then
 * replaced the order with a per-request seeded shuffle. **The argument is unaffected, and it
 * is worth being explicit about why, because the mirror file's was not.** The claim above
 * never depended on WHICH permutation a racer drew — with `bays: 1` every permutation has the
 * same head bay, so every draw contends the singleton and every `23P01` includes it. The
 * technician file reasoned about the ABUNDANT side's draw order instead, and Order-C made a
 * coin flip of it. `tests/support/booking.ts` states the rule that separates the two cases;
 * read it before choosing the shape of the next contention fixture.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * RE-RUNNABILITY — F-02-7.
 *
 * The Definition of Done asks for "ADR-0009's seed in the failure message". Slice 02 had no
 * seed to record: the seeded shuffle and the attempt cap arrived with slice 04, and ordering
 * here was `ORDER BY name` throughout. Now that ADR-0021 wires `BOOKING_SEED`, this file
 * still records no seed and deliberately sets none — a constant seed hands every racer the
 * same permutation, which is the Order-A degeneracy the shuffle exists to remove, and this
 * fixture's argument does not need one. What every failure message below carries instead is
 * the candidate lists as seeded and the ids in them — `describeScenario`.
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
      // T-02-9, raised at step 3 with its measurement: under N SIMULTANEOUS inserts against one
      // exclusion range PostgreSQL refused the losers with `40P01` (deadlock_detected) rather
      // than `23P01` — `check_exclusion_constraint` inserts the index tuple and THEN scans, so
      // simultaneous inserters wait on each other's in-progress tuples and form a cycle. Exactly
      // one row survived either way, so §2.1 was never in question; the losers' STATUS was.
      //
      // ADR-0018 ruled it: two class-scoped advisory locks, bay then technician, before every
      // insert, and a `40P01` that still arrives is `no-verdict` ⇒ `500 /problems/internal`,
      // never a `409`. Measured there across 56 locked races at N = 20 and N = 40 — 0 deadlocks,
      // every racer a verdict. So the split below is no longer a finding waiting to happen: a
      // racer answered with anything other than 201 or 409 means a write path reached
      // `appointment` without those locks, which is F-02-9's obligation broken. That is a defect
      // in the booking path and must not be read here as expected noise.
      //
      // ONE strict equality, not a count each (I-02-9): every other assertion in this file
      // filters `refused` and so passes VACUOUSLY on an empty list. This is the only assertion
      // that fails when the nineteen losers come back with the wrong status, which is why both
      // counts are named inside it.
      const confirmed = answers.filter((a) => a.status === 201);
      const refused = answers.filter((a) => a.status === 409);
      expect(
        `${String(confirmed.length)} confirmed / ${String(refused.length)} refused`,
        `the ${String(RACERS)} racers must split 1 / ${String(RACERS - 1)}.\n` +
          answers.map((a, i) => `  [${String(i)}] ${describeAnswer(a)}`).join('\n') +
          `\n${fixture}`,
      ).toBe(`1 confirmed / ${String(RACERS - 1)} refused`);

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
