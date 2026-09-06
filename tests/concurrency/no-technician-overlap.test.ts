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
 * QS-2 / AC-4 — no technician overlap, under twenty simultaneous requests.
 *
 * arc42 §10.2 QS-2 · `docs/slices/02-design.md` §0 (E-02-1), §2.6 · `CLAUDE.md` §2.1.
 *
 * "As AC-3 with bays plentiful and exactly one qualified technician free; the constraint
 * reported is `no_technician_overlap`."
 *
 * QS-2 says why it is run separately from QS-1 rather than parameterised with it: the two
 * constraints are two database objects and one passing is no evidence for the other.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT SURVIVES ADR-0009's SEEDED SHUFFLE, AND WHAT DID NOT (I-04-10, ruled (a)).
 *
 * Twenty-four bays, one qualified technician. Slice 02 wrote this header against a
 * DETERMINISTIC candidate order, in which every racer drew `(bay-000, technician 0)` first
 * and so every loser's first attempt violated BOTH constraints. **Order-C removed that
 * premise.** Each racer now draws its own permutation, so a loser whose head bay is free
 * conflicts on the TECHNICIAN at attempt 1, empties its length-one technician list and
 * refuses correctly with no wasted attempt. Only a loser that happens to draw the winner's
 * bay sees a bay violation at all — `1 - (23/24)^19 ~ 0.56` of runs.
 *
 * So every claim below is one that holds under EVERY permutation, which is the only kind a
 * shuffled fixture can carry:
 *
 *   - the 1 / 19 split, and exactly one row over the table — twenty-four bays against one
 *     technician means the technician is the only thing that could have serialised twenty
 *     requests;
 *   - `technicianConflicts >= 19` — the technician list has length ONE, so each of the
 *     nineteen losers must empty it, and emptying it costs exactly one
 *     `no_technician_overlap` whatever that loser drew first;
 *   - `resource === 'technician'` on every refusal — E-02-1's guard. The answer names the
 *     list that EMPTIED, never whichever index PostgreSQL happened to check. That is also
 *     why this file cannot borrow AC-3's shape and claim "every conflict names
 *     `no_technician_overlap`": both names legitimately appear here, so the claim has to be
 *     about the terminal one.
 *
 * WHAT WAS REMOVED, AND WHERE THE OBLIGATION ALREADY LIVES. "The loop actually looped" stood
 * here as `>= 2 distinct attempts`, commented "the first attempt fails on the bay, the second
 * on the technician". Under Order-C that is a coin flip — measured 6 failures in 20 local runs
 * — and it fails in the PASSING direction, which is the direction a merge runs in. No
 * permutation-independent version of it exists in this fixture, so it was REMOVED rather than
 * substituted (I-04-10): the three terminal claims above hold everywhere, and a fourth would
 * pad a hole that is not there. The looping obligation is deterministic in
 * `tests/acceptance/candidate-retry.test.ts` AC-3 — exactly `['1:no_bay_overlap',
 * '2:no_bay_overlap']` on a fixture where every bay is blocked — and gated in
 * `tests/concurrency/no-spurious-refusal.test.ts` AC-2, where twelve refusals against a list
 * of eight owe a correct build `max(attempt) >= 8`.
 *
 * The same shuffle softened what this file DISCRIMINATES, which is worth saying plainly: a
 * loop-less build is caught here in only that same ~56 % of runs, because a loser drawing a
 * free bay reports `technician` without ever looping. `candidate-retry.test.ts` AC-3 catches
 * it every time, and that is where E-02-1's guarantee is now anchored.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Re-runnability: F-02-7. `tests/support/booking.ts` carries the rule that decides whether a
 * contention fixture is permutation-safe at all; this one is, on the shape it seeds.
 */
const RACERS = 20;

describe('QS-2 / AC-4 — exactly one booking survives twenty simultaneous requests for one technician', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('one confirmed row for the technician, nineteen 409s naming resource=technician, and the refusals turn on no_technician_overlap', async () => {
    const scenario = await seedScenario(client, 'qs2-tech-race', {
      bays: 24,
      technicians: 1,
      customers: RACERS,
    });
    const fixture = describeScenario(scenario);

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

      expect(
        answers.filter((a) => a.transportFailure !== undefined).map((a) => a.transportFailure),
        `some racers never got an answer.\n${fixture}`,
      ).toEqual([]);

      // ── 1. OVER THE TABLE.
      const rows = await overlappingConfirmed(
        client,
        'technician_id',
        scenario.technicianIds[0] as string,
        at(0),
        at(60),
      );
      expect(
        rows.map((r) => `${r.id} ${r.startsAt} -> ${r.endsAt} (${r.status})`),
        `EXACTLY ONE non-cancelled appointment may overlap [anchor, anchor+60) for this ` +
          `technician. Two rows means one technician is in two bays at once.\n${fixture}`,
      ).toHaveLength(1);

      // Bays were plentiful, so the technician is the ONLY thing that could have serialised
      // these twenty requests. Without this the case would also pass on a fixture that had
      // accidentally become bay-constrained, and it would then be a second, weaker copy of
      // AC-3 wearing AC-4's name.
      const distinctBays = new Set(rows.map((r) => r.bayId));
      expect(
        `${String(scenario.bayIds.length)} bays seeded, ${String(distinctBays.size)} used`,
        'AC-4 requires bays to be PLENTIFUL — if the fixture has become bay-constrained this case proves nothing about the technician constraint',
      ).toBe(`24 bays seeded, 1 used`);

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
        refused.map((a) => member(a, 'resource')).filter((r) => r !== 'technician'),
        `the contended resource is the TECHNICIAN: 24 bays were seeded and one technician. ` +
          `'bay' here is the systematic mis-naming E-02-1 was ruled on — it is what a ` +
          `loop-less implementation reports whenever its single draw lands on the winner's ` +
          `bay and so violates both constraints at once.\n${fixture}`,
      ).toEqual([]);

      const winner = confirmed[0];
      expect(String(member(winner ?? {}, 'id')), 'the confirmed 201 must be the stored row').toBe(
        rows[0]?.id,
      );

      // ── 3. OVER THE CONSTRAINT NAME.
      const records = await service.awaitLogRecords((rs) =>
        conflictRecords(rs).filter((c) => c.constraint === 'no_technician_overlap').length >=
        RACERS - 1,
      );
      const conflicts = conflictRecords(records);
      expect(
        conflicts.length,
        `design §2.6 writes one 'booking.conflict' line per 23P01. None at all means the ` +
          `observer I-02-6 added is missing and the constraint name cannot be asserted at ` +
          `all.\n${describeServiceOutput(service)}\n${fixture}`,
      ).toBeGreaterThan(0);

      const technicianConflicts = conflicts.filter((c) => c.constraint === 'no_technician_overlap');
      expect(
        technicianConflicts.length,
        `the technician list has length ONE, so each of the ${String(RACERS - 1)} losers ` +
          `must empty it, and that costs exactly one no_technician_overlap under EVERY ` +
          `permutation. Zero means the refusals are being named from the bay index without ` +
          `the technician list ever emptying — the E-02-1 defect exactly.\nconstraints ` +
          `seen: ${JSON.stringify(
            conflicts.map((c) => c.constraint),
          )}\n${describeServiceOutput(service)}\n${fixture}`,
      ).toBeGreaterThanOrEqual(RACERS - 1);

      expect(
        [...new Set(technicianConflicts.map((c) => c.resource))].sort(),
        'the resource minted from no_technician_overlap must be `technician` — ADR-0016: a ' +
          'capacity refusal is not constructible without a database verdict',
      ).toEqual(['technician']);
    } finally {
      await service.stop();
    }
  });
});
