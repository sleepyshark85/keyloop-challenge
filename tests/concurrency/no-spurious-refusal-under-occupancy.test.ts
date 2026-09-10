import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  at,
  blockPairs,
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
 * QS-16 / AC-4 — no spurious refusal under occupancy **and** contention.
 *
 * `docs/slices/19-attempt-cap-sized-against-occupancy.md` AC-4 · `19-design.md` §6 ruling 11,
 * §8 · arc42 §10.2 QS-16 · [`ADR-0040`](../../docs/adr/0040-order-candidates-free-first-from-one-advisory-read.md).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE IS THE FALSIFIER FOR.
 *
 * ADR-0004's occupancy snapshot is read once and never refreshed. Under free-first ordering
 * every racer released from the SAME barrier reads the SAME snapshot, so every one of them
 * agrees about which group to try first — and after the winners take the free resources, every
 * loser's remaining order still front-loads exactly what the winners just took. That is
 * ADR-0009's own rejection of Order-D returning at binary granularity (design §8), and QS-16 is
 * the falsifier: **if this file fails at any tuple, the slice's own Definition of Done commits
 * to a loopback, already spent 0 of 2.**
 *
 * The four tuples share one dealership shape — 12 bays and 12 technicians — with `k` pairs
 * pre-booked, leaving `M` of each free, and `N` racers released from a barrier for that
 * interval:
 *
 *   (N=20, M=1,  k=11)  — the residual at its narrowest: one free pair, twenty racers on it
 *   (N=20, M=4,  k=8)
 *   (N=8,  M=8,  k=4)   — where a spurious refusal is most VISIBLE (T-19-2)
 *   (N=20, M=8,  k=4)   — the same free group under 20 racers: `2M-1 = 15`, one below the cap
 *                          of 16 — where a spurious refusal is most LIKELY to be PRODUCED
 *
 * `BOOKING_SEED` is left unset for the same reason `no-spurious-refusal.test.ts` (QS-3) leaves
 * it unset: a constant seed hands every racer the identical permutation, which is ADR-0009's
 * Order-A, and this file exists to show occupancy-aware ordering holds up under a SPREAD of
 * per-request seeds, not under the degenerate case that would hide behind one.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE SECONDARY MEASURE — RECORDED, NOT THRESHOLDED (`19-attempt-cap-sized-against-occupancy.md`
 * AC-4).
 *
 * Beyond `min(N, M)` confirmed, the design records — but does not gate CI on — how many of the
 * refusals in each tuple exit `'capped'` rather than `'exhausted'`. ADR-0040 ruling 4: `capped`
 * becomes **unlikely, not impossible**, under free-first ordering; it is not claimed to reach
 * zero, and a hard threshold here would assert a guarantee the design explicitly declines to
 * make (`19-design.md` ruling 4). This file therefore `console.log`s the breakdown per tuple —
 * evidence for the gate to read, not a pass/fail line — while `min(N, M)` above stays a real
 * `expect`.
 */

const TUPLES = [
  { n: 20, m: 1, k: 11 },
  { n: 20, m: 4, k: 8 },
  { n: 8, m: 8, k: 4 },
  { n: 20, m: 8, k: 4 },
] as const;

interface TupleRun {
  readonly scenario: Scenario;
  readonly fixture: string;
  readonly answers: readonly HttpAnswer[];
  readonly conflicts: readonly ConflictRecord[];
  readonly refusals: readonly RefusalRecord[];
  readonly rows: readonly StoredAppointment[];
  readonly blocked: readonly string[];
  readonly loop: string;
}

async function runTuple(
  client: Client,
  namespace: string,
  n: number,
  m: number,
  k: number,
): Promise<{ readonly failure?: string; readonly run?: TupleRun }> {
  const scenario = await seedScenario(client, namespace, { bays: k + m, technicians: k + m, customers: n });
  const fixture = describeScenario(scenario);
  const blocked = await blockPairs(client, scenario, k, at(0), at(scenario.durationMinutes));

  const attempt = await startService({ databaseUrl: inject('databaseUrl'), logLevel: 'trace' });
  if (attempt.service === undefined) {
    return { failure: `${attempt.failure ?? 'the service did not start'}\n${fixture}` };
  }
  const service: StartedService = attempt.service;

  try {
    const answers = await releaseFromBarrier<HttpAnswer>(n, async (index) =>
      postBooking(service, bookingBody(scenario, { customerIndex: index })),
    );

    // Waited for against the ACTUAL responses, never the tuple's THEORETICAL min(N, M): AC-4
    // is exactly the claim that the two can differ, so a predicate built from the expected
    // count would stop draining before a genuine spurious refusal's own line ever arrived —
    // silently dropping the diagnostic (`exit`/`resource`) the failure message most needs.
    const actualRefusedCount = answers.filter((a) => a.status === 409).length;
    const records = await service.awaitLogRecords(
      (rs) => refusalRecords(rs).length >= actualRefusedCount,
      15_000,
    );

    const rows = await confirmedOverlapping(
      client,
      scenario.dealershipId,
      at(0),
      at(scenario.durationMinutes),
    );

    return {
      run: {
        scenario,
        fixture,
        answers,
        conflicts: conflictRecords(records),
        refusals: refusalRecords(records),
        rows,
        blocked,
        loop: describeLoopLines(records),
      },
    };
  } finally {
    await service.stop();
  }
}

function expectTuple(run: TupleRun, n: number, m: number, k: number): void {
  const confirmedCount = Math.min(n, m);
  const refusedCount = n - confirmedCount;
  const totalRows = k + confirmedCount;
  const cell = `(N=${String(n)}, M=${String(m)}, k=${String(k)})`;
  const where = `\n${run.fixture}\n${run.loop}`;

  const dropped = run.answers.filter((a) => a.transportFailure !== undefined);
  expect(
    dropped.map((a) => a.transportFailure),
    `${cell} — some racers never got an answer at all.${where}`,
  ).toEqual([]);

  // ── 1. Over the responses, ONE strict equality naming both numbers (I-02-9's rule, carried
  // from QS-3's own file): a filtered assertion passes vacuously on an empty list.
  const confirmed = run.answers.filter((a) => a.status === 201);
  const refused = run.answers.filter((a) => a.status === 409);
  expect(
    `${String(confirmed.length)} confirmed / ${String(refused.length)} refused`,
    `${cell} — QS-16 requires EXACTLY min(N, M) = ${String(confirmedCount)} confirmations and ` +
      `${String(refusedCount)} refusals. A refusal while capacity (M) remained is the spurious ` +
      `refusal this scenario is the falsifier for — free-first ordering degrading to Order-D's ` +
      `objection under a burst, every racer agreeing on the same never-refreshed snapshot.\n` +
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
    `${cell} — every refusal names the resource whose list emptied or capped (ADR-0016).${where}`,
  ).toEqual([]);

  // ── 2. Over the table. `k` pre-booked pairs stay confirmed AND untouched; `min(N, M)` NEW
  // rows join them — this is the claim AC-4 is actually about.
  expect(
    run.rows,
    `${cell} — exactly k + min(N, M) = ${String(totalRows)} non-cancelled appointments may ` +
      `overlap the interval: the ${String(k)} pre-booked pairs plus the ${String(confirmedCount)} ` +
      `newly confirmed. More is a double booking (§2.1 has failed); fewer is the spurious ` +
      `refusal this file exists to catch.${where}`,
  ).toHaveLength(totalRows);
  expect(
    new Set(run.rows.map((r) => r.bayId)).size,
    `${cell} — the ${String(totalRows)} stored rows must sit in ${String(totalRows)} DISTINCT bays.${where}`,
  ).toBe(totalRows);
  expect(
    new Set(run.rows.map((r) => r.technicianId)).size,
    `${cell} — and on ${String(totalRows)} DISTINCT technicians.${where}`,
  ).toBe(totalRows);
  expect(
    run.blocked.every((id) => run.rows.some((r) => r.id === id)),
    `${cell} — the ${String(k)} pre-booked pairs must SURVIVE this run untouched.${where}`,
  ).toBe(true);

  const newRowIds = run.rows.map((r) => r.id).filter((id) => !run.blocked.includes(id));
  expect(
    [...confirmed.map((a) => String((a.body as Record<string, unknown> | undefined)?.['id']))].sort(),
    `${cell} — the newly confirmed responses and the NEW stored rows must be the SAME ` +
      `appointments.${where}`,
  ).toEqual([...newRowIds].sort());

  // ── 3. Refusal exits: only 'exhausted' or 'capped' are legal values, one line per refusal.
  expect(
    run.refusals.length,
    `${cell} — one booking.refused line is owed per refused racer.${where}`,
  ).toBe(refusedCount);
  expect(
    run.refusals.map((r) => r.exit).filter((e) => e !== 'exhausted' && e !== 'capped'),
    `${cell} — every refusal exit must be 'exhausted' or 'capped' (ADR-0020).${where}`,
  ).toEqual([]);

  // ── 4. The secondary measure — RECORDED, not thresholded (AC-4's own wording). ADR-0040
  // ruling 4 makes 'capped' unlikely, not impossible, so no expect() gates on this count; it
  // is printed for the gate to read against the tuple and seeds it was produced with.
  const cappedCount = run.refusals.filter((r) => r.exit === 'capped').length;
  const exhaustedCount = run.refusals.filter((r) => r.exit === 'exhausted').length;
  // eslint-disable-next-line no-console
  console.log(
    `[QS-16] ${cell} capped=${String(cappedCount)} exhausted=${String(exhaustedCount)} ` +
      `(recorded, not thresholded — ADR-0040 ruling 4)`,
  );
}

describe('QS-16 — no spurious refusal under occupancy AND contention', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  for (const { n, m, k } of TUPLES) {
    const label = `(N=${String(n)},M=${String(m)},k=${String(k)})`;
    it(
      `AC-4 ${label} — exactly min(N, M) = ${String(Math.min(n, m))} newly confirmed, the ${String(k)} pre-booked pairs survive`,
      async () => {
        const namespace = `qs16-${String(n)}-${String(m)}-${String(k)}`;
        const { failure, run } = await runTuple(client, namespace, n, m, k);
        expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
        expectTuple(run as TupleRun, n, m, k);
      },
      120_000,
    );
  }
});
