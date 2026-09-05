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
 * THIS CASE IS THE ONE E-02-1 WAS RULED FOR, AND IT CANNOT PASS WITHOUT THE RETRY LOOP.
 *
 * Twenty-four bays, one qualified technician. Candidate ordering is deterministic, so every
 * racer attempts the same pair first — `(bay-000, technician 0)` — and every loser's FIRST
 * attempt violates BOTH constraints. Under double violation PostgreSQL names whichever
 * constraint's index was created first, which is `no_bay_overlap` (design §8, measurements
 * 1-2: `RelationGetIndexList` returns indexes by OID and `0003_appointment.sql` creates
 * `no_bay_overlap` first). Without a loop, AC-4 fails twenty times out of twenty — and,
 * worse than a failing fixture, AC-11's `resource` would systematically name the ABUNDANT
 * resource, and `booking_conflicts_total{resource}` would inherit that at slice 09.
 *
 * With ADR-0004's loop, pruning is per resource VALUE (T-02-1): `no_bay_overlap` drops THAT
 * BAY, the next attempt is `(bay-001, technician 0)`, which violates only the technician —
 * and the technician list empties first. So what this case asserts is not "which constraint
 * PostgreSQL happened to check" but **which resource was actually scarce**, which is what
 * AC-4 is asking about.
 *
 * That is also why the constraint assertion below is shaped differently from AC-3's. AC-3
 * can say "every conflict names `no_bay_overlap`" because one bay makes it true. Here both
 * names legitimately appear — the bay violation at attempt 1, the technician violation at
 * attempt 2 — so the claim is about the TERMINAL one: the list that emptied.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Re-runnability: F-02-7, exactly as in `no-bay-overlap.test.ts`. There is no seed to record
 * in slice 02; the candidate order is deterministic and every failure message carries it.
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
        refused.map((a) => member(a, 'resource')).filter((r) => r !== 'technician'),
        `the contended resource is the TECHNICIAN: 24 bays were seeded and one technician. ` +
          `'bay' here is the systematic mis-naming E-02-1 was ruled on — it is what a ` +
          `loop-less implementation reports, because the first attempt violates both ` +
          `constraints and the bay index is checked first.\n${fixture}`,
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
        `each of the ${String(RACERS - 1)} losers exhausts its technician list, so each ` +
          `records at least one no_technician_overlap. Zero means the loop never reached a ` +
          `second candidate and the refusals are being named from the bay index — the E-02-1 ` +
          `defect exactly.\nconstraints seen: ${JSON.stringify(
            conflicts.map((c) => c.constraint),
          )}\n${describeServiceOutput(service)}\n${fixture}`,
      ).toBeGreaterThanOrEqual(RACERS - 1);

      expect(
        [...new Set(technicianConflicts.map((c) => c.resource))].sort(),
        'the resource minted from no_technician_overlap must be `technician` — ADR-0016: a ' +
          'capacity refusal is not constructible without a database verdict',
      ).toEqual(['technician']);

      // THE LOOP ACTUALLY LOOPED. Numbering-agnostic on purpose: the claim is that at least
      // two distinct attempts occurred per refusal path, not that the counter starts at 0 or
      // at 1. A single attempt index across every conflict line means no retry happened, and
      // then the `technician` resource above arrived by some route other than exhaustion.
      expect(
        [...new Set(conflicts.map((c) => String(c.attempt)))].length,
        `the refusal path must show more than one attempt: the first attempt fails on the ` +
          `bay, the second on the technician.\nattempts seen: ${JSON.stringify(
            conflicts.map((c) => c.attempt),
          )}\n${fixture}`,
      ).toBeGreaterThanOrEqual(2);
    } finally {
      await service.stop();
    }
  });
});
