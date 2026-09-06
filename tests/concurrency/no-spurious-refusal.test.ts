import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  at,
  bookingBody,
  conflictRecords,
  confirmedOverlapping,
  describeAnswer,
  describeLoopLines,
  describeScenario,
  postBooking,
  refusalRecords,
  releaseFromBarrier,
  seedScenario,
} from '../support/booking.js';
import type {
  ConflictRecord,
  HttpAnswer,
  RefusalRecord,
  Scenario,
  StoredAppointment,
} from '../support/booking.js';

/**
 * QS-3 / AC-1 — no spurious refusal under retry, and AC-2 — no transaction around the loop.
 *
 * `docs/slices/04-candidate-allocation-and-retry.md` · `docs/slices/04-design.md` §5 ·
 * arc42 §6.2, §10.2 QS-3 · ADR-0004, ADR-0009, ADR-0018, ADR-0020.
 *
 *   AC-1  given *M* free bays and *M* free qualified technicians over one interval, when *N*
 *         concurrent bookings are released for it, EXACTLY `min(N, M)` are confirmed and the
 *         rest receive `409`. (N,M) ∈ {(2,1), (5,3), (20,8), (8,20)}
 *   AC-2  the retry is not wrapped in a transaction — a second attempt inside an aborted one
 *         raises `25P02` rather than retrying, and that code must appear nowhere
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE EVIDENCE SHAPE, WHICH IS THE POINT OF THIS FILE AND NOT A DETAIL OF IT.
 *
 * Counting confirmations is NOT evidence that the database refused. It was measured at step 2
 * and the measurement is recorded in `04-design.md` §5, so it is restated here where it has
 * to survive an edit:
 *
 *   - **(2,1) is a control, not a discriminator.** Simulated at 20 000 runs against a
 *     no-retry build it failed 0 % of the time — every build in this repository passes it.
 *     The three cells that discriminate are (5,3) at 80.3 %, (20,8) at 98.7 % and (8,20) at
 *     96.0 %.
 *   - **A per-dealership global mutex — ADR-0004's REJECTED Option D — confirms exactly
 *     `min(N, M)` in all four cells, with zero retries, and passes AC-1 outright.** Serialise
 *     every booking for a dealership, check availability inside the lock, and the counts come
 *     out right while §2.1 is violated in spirit and the throughput goal is gone.
 *
 * So the counts are accompanied, in every cell that has a refusal, by three claims Option D
 * cannot satisfy:
 *
 *   E1  every `booking.conflict` line names `no_bay_overlap` or `no_technician_overlap` —
 *       the refusals came from PostgreSQL's exclusion constraints, not from application code
 *       that serialised and then decided
 *   E2  `max(attempt) >= 2` somewhere in the run — a retry actually happened. Under Option D
 *       every racer attempts at most once, so this is the assertion that fails there. It is
 *       ONLY claimed for M >= 2: at (2,1) the loser's single candidate is its only candidate
 *       and one attempt is correct, which is the arithmetic behind "(2,1) is a control"
 *   E3  every `booking.refused` line carries `attempts >= M` — a refusal costs at least one
 *       attempt per resource in the list that emptied, so a refusal after ONE attempt while
 *       M-1 candidates stood untried is exactly the spurious refusal AC-1 forbids
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * AC-2 LIVES INSIDE (20,8) AND IS GATED ON A POSITIVE WITNESS (T-04-4).
 *
 * "No `25P02` appeared" is vacuously true of a service that never retried, of a service that
 * never started, and of a run whose stdout was empty — the assertion cannot fail for the
 * reason it is about. So it is asserted only after E2 has witnessed a second attempt in the
 * same run: pigeonhole says at least 12 of the 20 racers are refused, and a refusal requires
 * a list of 8 to empty, so `max(attempt) >= 8` is certain of a correct build. Then zero
 * `500`s, then the absence. A transaction-wrapped loop fails the first two before the third
 * is reached, which makes the absence a confirmation rather than the evidence.
 *
 * `25P02` surfaces as `500 /problems/internal` and never as a `409` — arc42 §8.6 has no row
 * that maps it to a client error — which is why the status split is asserted alongside it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `BOOKING_SEED` IS NOT SET IN THIS FILE, DELIBERATELY (ADR-0021).
 *
 * A constant seed hands every racer the same permutation, which IS ADR-0009's Order-A. Set it
 * here and the scenario that exists to show the shuffle spreads contention would be measuring
 * the degeneracy the shuffle was chosen to remove. Re-runnability in this file comes from
 * `describeScenario` and from the loop lines rendered into every failure message.
 */

/** Every cell of QS-3. `m` is BOTH the bay count and the qualified-technician count. */
const CELLS = [
  { n: 2, m: 1 },
  { n: 5, m: 3 },
  { n: 20, m: 8 },
  { n: 8, m: 20 },
] as const;

interface CellRun {
  readonly scenario: Scenario;
  readonly fixture: string;
  readonly answers: readonly HttpAnswer[];
  readonly conflicts: readonly ConflictRecord[];
  readonly refusals: readonly RefusalRecord[];
  readonly rows: readonly StoredAppointment[];
  /** stdout and stderr concatenated, verbatim — AC-2 scans it for `25P02`. */
  readonly raw: string;
  readonly loop: string;
}

/**
 * Seed the cell, race it, drain the log and stop the service.
 *
 * Returns `failure` rather than throwing, on 00a's rule (C1): the service failing to start is
 * asserted on inside the test body, so the red is a failed assertion in a collected file.
 */
async function runCell(
  client: Client,
  namespace: string,
  n: number,
  m: number,
): Promise<{ readonly failure?: string; readonly run?: CellRun }> {
  const scenario = await seedScenario(client, namespace, {
    bays: m,
    technicians: m,
    customers: n,
  });
  const fixture = describeScenario(scenario);

  // `trace`, not the harness default of `silent`: E1, E2 and E3 are all read off stdout, and
  // a silent process would make three of this file's four claims vacuous.
  const attempt = await startService({ databaseUrl: inject('databaseUrl'), logLevel: 'trace' });
  if (attempt.service === undefined) {
    return { failure: `${attempt.failure ?? 'the service did not start'}\n${fixture}` };
  }
  const service: StartedService = attempt.service;

  try {
    const answers = await releaseFromBarrier<HttpAnswer>(n, async (index) =>
      postBooking(service, bookingBody(scenario, { customerIndex: index })),
    );

    const expectedRefusals = Math.max(0, n - Math.min(n, m));
    // Wait for the refusal lines a CORRECT build owes. When none are owed — cell (8,20) — the
    // predicate is "a refusal appeared", which cannot be satisfied by a correct build, so the
    // call spends its bound letting stdout drain and returns whatever arrived. Either way the
    // assertions below run against the records that were actually delivered.
    const records = await service.awaitLogRecords(
      (rs) =>
        expectedRefusals === 0
          ? refusalRecords(rs).length > 0
          : refusalRecords(rs).length >= expectedRefusals,
      expectedRefusals === 0 ? 2_000 : 10_000,
    );

    const rows = await confirmedOverlapping(
      client,
      scenario.dealershipId,
      at(0),
      at(scenario.durationMinutes),
    );
    const { stdout, stderr } = service.output();

    return {
      run: {
        scenario,
        fixture,
        answers,
        conflicts: conflictRecords(records),
        refusals: refusalRecords(records),
        rows,
        raw: `${stdout}\n${stderr}`,
        loop: describeLoopLines(records),
      },
    };
  } finally {
    await service.stop();
  }
}

/** Everything AC-1 claims about a cell, plus the three evidence assertions E1-E3. */
function expectCell(run: CellRun, n: number, m: number): void {
  const confirmedCount = Math.min(n, m);
  const refusedCount = n - confirmedCount;
  const cell = `(N=${String(n)}, M=${String(m)})`;
  const where = `\n${run.fixture}\n${run.loop}`;

  const dropped = run.answers.filter((a) => a.transportFailure !== undefined);
  expect(
    dropped.map((a) => a.transportFailure),
    `${cell} — some racers never got an answer at all.${where}`,
  ).toEqual([]);

  // ── 1. OVER THE RESPONSES. One strict equality, never a count each (I-02-9): every
  // assertion that FILTERS the answers passes vacuously on an empty list, so this is the one
  // that fails when the split is wrong, and it names both numbers inside itself.
  const confirmed = run.answers.filter((a) => a.status === 201);
  const refused = run.answers.filter((a) => a.status === 409);
  expect(
    `${String(confirmed.length)} confirmed / ${String(refused.length)} refused`,
    `${cell} — AC-1 requires EXACTLY min(N, M) = ${String(confirmedCount)} confirmations and ` +
      `${String(refusedCount)} refusals. A refusal while capacity remained fails this slice; ` +
      `a status that is neither 201 nor 409 means a write path reached \`appointment\` without ` +
      `ADR-0018's locks, or a 25P02 escaped as a 500.\n` +
      run.answers.map((a, i) => `  [${String(i)}] ${describeAnswer(a)}`).join('\n') +
      where,
  ).toBe(`${String(confirmedCount)} confirmed / ${String(refusedCount)} refused`);

  expect(
    refused.map((a) => a.contentType).filter((c) => !/application\/problem\+json/.test(c ?? '')),
    `${cell} — every refusal must be RFC 9457 problem+json.${where}`,
  ).toEqual([]);
  expect(
    [...new Set(refused.map((a) => (a.body as Record<string, unknown> | undefined)?.['type']))],
    `${cell} — every refusal must carry the contention type of arc42 §8.6.${where}`,
  ).toEqual(refusedCount === 0 ? [] : ['/problems/no-capacity']);
  expect(
    refused
      .map((a) => (a.body as Record<string, unknown> | undefined)?.['resource'])
      .filter((r) => r !== 'bay' && r !== 'technician'),
    `${cell} — every refusal names the resource whose list emptied (ADR-0016).${where}`,
  ).toEqual([]);

  // ── 2. OVER THE TABLE. This is the claim QS-3 is about; everything else supports it.
  expect(
    run.rows.map((r) => `${r.id} ${r.bayId} ${r.technicianId} ${r.startsAt} (${r.status})`),
    `${cell} — exactly min(N, M) = ${String(confirmedCount)} non-cancelled appointments may ` +
      `overlap the interval in this dealership. More is a double booking and CLAUDE.md §2.1 ` +
      `has failed; fewer is the spurious refusal ADR-0004 exists to remove.${where}`,
  ).toHaveLength(confirmedCount);
  expect(
    new Set(run.rows.map((r) => r.bayId)).size,
    `${cell} — the ${String(confirmedCount)} stored rows must sit in ${String(confirmedCount)} ` +
      `DISTINCT bays.${where}`,
  ).toBe(confirmedCount);
  expect(
    new Set(run.rows.map((r) => r.technicianId)).size,
    `${cell} — and on ${String(confirmedCount)} DISTINCT technicians.${where}`,
  ).toBe(confirmedCount);
  expect(
    [...confirmed.map((a) => String((a.body as Record<string, unknown> | undefined)?.['id']))].sort(),
    `${cell} — the confirmed responses and the stored rows must be the SAME appointments, or ` +
      `"min(N, M) rows" and "min(N, M) 201s" are two facts about two different things.${where}`,
  ).toEqual([...run.rows.map((r) => r.id)].sort());

  // ── 3. E1 — OVER THE CONSTRAINT NAMES. What makes this evidence about the DATABASE.
  expect(
    [...new Set(run.conflicts.map((c) => c.constraint))]
      .filter((name) => name !== 'no_bay_overlap' && name !== 'no_technician_overlap')
      .sort(),
    `${cell} — E1: every booking.conflict line must name one of the two exclusion ` +
      `constraints of arc42 §8.2. A conflict named by anything else did not come from the ` +
      `constraint this slice's retry is built on.${where}`,
  ).toEqual([]);

  if (refusedCount === 0) {
    // (8,20). Capacity is abundant: nothing may be refused and no refusal line may exist.
    expect(
      run.refusals.map((r) => `${r.exit}/${r.resource}`),
      `${cell} — capacity exceeds demand, so no booking.refused line may be written at all.${where}`,
    ).toEqual([]);
    return;
  }

  // ── 4. E1 continued — a refusal that emitted NO conflict line is a refusal PostgreSQL was
  // never asked to adjudicate.
  expect(
    run.conflicts.length,
    `${cell} — E1: ${String(refusedCount)} racers were refused and a refusal requires a list ` +
      `of ${String(m)} to empty, so at least ${String(refusedCount * m)} booking.conflict lines ` +
      `are owed. Zero means the observer of design §2.6 is missing and no claim about the ` +
      `database can be made here at all.${where}`,
  ).toBeGreaterThanOrEqual(refusedCount * m);

  // ── 5. E3 — one refusal line per refused racer, and the attempt arithmetic of ADR-0009's
  // Bound-2: a refusal costs at least M attempts (the list that emptied) and at most
  // |bays| + |technicians| - 1 = 2M-1 (the additive bound; the loop's tail is unreachable).
  expect(
    run.refusals.length,
    `${cell} — design §4 writes one booking.refused line at each refusal exit, so ` +
      `${String(refusedCount)} are owed.${where}`,
  ).toBe(refusedCount);
  expect(
    run.refusals.map((r) => r.exit).filter((e) => e !== 'exhausted'),
    `${cell} — every refusal here is 'exhausted': the additive bound is ${String(2 * m)} and ` +
      `ATTEMPT_CAP is 16, so a list empties before the cap can be reached. A 'capped' exit in ` +
      `this cell means D-04-1 has started biting inside QS-3, which the design says it cannot.${where}`,
  ).toEqual([]);
  expect(
    run.refusals.map((r) => r.attempts).filter((a) => typeof a !== 'number'),
    `${cell} — E3: booking.refused must carry a NUMERIC attempts count.${where}`,
  ).toEqual([]);
  expect(
    run.refusals
      .map((r) => Number(r.attempts))
      .filter((a) => !(a >= m && a <= 2 * m - 1))
      .sort((x, y) => x - y),
    `${cell} — E3: a refusal costs between M = ${String(m)} attempts (the list that emptied) ` +
      `and ${String(2 * m - 1)} (ADR-0009's additive Bound-2, minus the attempt that returns). ` +
      `Fewer means a candidate was left untried, which is the spurious refusal AC-1 forbids — ` +
      `and it is what a per-dealership global mutex (ADR-0004's rejected Option D) produces, ` +
      `since it never attempts twice. More means the bound is multiplicative.${where}`,
  ).toEqual([]);
  expect(
    run.conflicts.length,
    `${cell} — one booking.conflict line per 23P01, so the total must cover every attempt the ` +
      `refusals themselves report.${where}`,
  ).toBeGreaterThanOrEqual(run.refusals.reduce((sum, r) => sum + Number(r.attempts), 0));

  // ── 6. E2 — a retry actually happened. Claimed only for M >= 2 (see the header).
  if (m >= 2) {
    expect(
      Math.max(0, ...run.conflicts.map((c) => Number(c.attempt))),
      `${cell} — E2: at least one racer must reach a SECOND attempt. This is the assertion a ` +
        `per-dealership global mutex fails: it serialises, finds a free pair or none, and ` +
        `never retries — while confirming exactly min(N, M) and passing every count above.${where}`,
    ).toBeGreaterThanOrEqual(2);
  }
}

describe('QS-3 / AC-1 — exactly min(N, M) confirmed, and the rest refused', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  for (const { n, m } of CELLS) {
    const label = `(${String(n)},${String(m)})`;
    it(`AC-1 ${label} — ${String(Math.min(n, m))} confirmed, ${String(n - Math.min(n, m))} refused, and the database is what refused them`, async () => {
      const { failure, run } = await runCell(client, `qs3-${String(n)}-${String(m)}`, n, m);
      expect(failure ?? 'started', `${label} — the service did not start.\n${failure ?? ''}`).toBe(
        'started',
      );
      expectCell(run as CellRun, n, m);
    });
  }

  it('AC-2 (20,8) — a second attempt is witnessed, no racer gets a 500, and 25P02 appears nowhere', async () => {
    const { failure, run } = await runCell(client, 'ac2-no-transaction', 20, 8);
    expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
    const cell = run as CellRun;
    const where = `\n${cell.fixture}\n${cell.loop}`;

    // ── THE WITNESS, FIRST. Everything below is vacuous without it (T-04-4).
    const deepest = Math.max(0, ...cell.conflicts.map((c) => Number(c.attempt)));
    expect(
      deepest,
      `AC-2 — 12 of the 20 racers must be refused and a refusal requires the 8-long list to ` +
        `empty, so a correct build reaches at least attempt 8. Without a SECOND attempt in ` +
        `this run there is no retry for a transaction to have wrapped, and the absence of ` +
        `25P02 below would be true of a service that never retried at all.${where}`,
    ).toBeGreaterThanOrEqual(2);

    // ── THEN the statuses. A loop inside one transaction raises 25P02 on the second attempt,
    // which arc42 §8.6 maps to 500 /problems/internal — never to a 409.
    const unexpected = cell.answers.filter((a) => a.status !== 201 && a.status !== 409);
    expect(
      unexpected.map((a) => describeAnswer(a)),
      `AC-2 — every racer must be answered 201 or 409. A 500 here is what a retry inside an ` +
        `aborted transaction looks like at the edge.${where}`,
    ).toEqual([]);
    expect(
      cell.answers
        .map((a) => String((a.body as Record<string, unknown> | undefined)?.['type'] ?? ''))
        .filter((t) => t === '/problems/internal'),
      `AC-2 — no racer may be answered with the internal-error problem type.${where}`,
    ).toEqual([]);

    // ── THEN the absence itself, over everything the process wrote.
    expect(
      cell.raw.includes('25P02'),
      `AC-2 — SQLSTATE 25P02 (in_failed_sql_transaction) appeared in the service's output. ` +
        `That is a second attempt issued inside a transaction the first attempt aborted, ` +
        `which is a retry loop wrapped in one transaction — arc42 §6.2 puts exactly one ` +
        `transaction per ATTEMPT and none around the loop (ADR-0018).${where}\n${cell.raw}`,
    ).toBe(false);
  });
});
