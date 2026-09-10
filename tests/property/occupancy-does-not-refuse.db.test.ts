import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  at,
  bookingBody,
  blockPairs,
  conflictRecords,
  describeAnswer,
  describeScenario,
  postBooking,
  refusalRecords,
  seedScenario,
} from '../support/booking.js';
import type { HttpAnswer, RefusalRecord, Scenario } from '../support/booking.js';

/**
 * QS-15 / AC-1, AC-2 — no spurious refusal under occupancy, with **no concurrency at all**.
 *
 * `docs/slices/19-attempt-cap-sized-against-occupancy.md` AC-1, AC-2 · `19-design.md` §1, §6
 * ruling 1, §7 · arc42 §10.2 QS-15 · [`ADR-0040`](../../docs/adr/0040-order-candidates-free-first-from-one-advisory-read.md).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE IS FOR, PRECISELY.
 *
 * `H-19-1` was executed once, by hand, against real PostgreSQL, and recorded as a number in
 * `19-design.md` and ADR-0040: **35 of 200 single-threaded bookings refused `409` with one bay
 * and one technician free**, at 12 bays / 12 technicians with 11 pairs already `confirmed`.
 * The slice's own Definition of Done requires that figure to be **reproducible from the
 * repository, not quoted from a transcript** — this file is that reproduction. It drives the
 * real HTTP path end to end (no domain-level seam), so it compiles today against the shipped
 * artifact and simply refuses too often: the red here is `AC-1`'s and `AC-2`'s failing
 * *assertions*, not a missing export.
 *
 * `BOOKING_SEED` is deliberately **never set**. `tests/support/service.ts` documents the
 * unset case as "a seed per request" — every `POST /appointments` the running service answers
 * draws its own fresh seed from `crypto.getRandomValues`. Sequential, zero-concurrency trials
 * against one running service therefore already give 200 *distinct* seeds without this file
 * needing to name any of them; the one a REFUSED trial actually drew is on its own
 * `booking.refused` line (`refusalRecords` below), which is what a failure message prints so a
 * refused trial is diagnosable rather than merely counted.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY "ATTEMPTS" IS COUNTED BY BUCKETING THE LOG STREAM, NOT BY A RESPONSE FIELD.
 *
 * ADR-0016 gives `BookOutcome` no member for the retry count — the loop's internals are
 * observable on stdout only (`docs/slices/04-design.md` §4, restated at slice 19 ruling on
 * `T-19-1`). A refusal's `booking.refused` line carries `attempts` directly. A **confirmed**
 * booking's attempt count is not logged as a single number anywhere; it is the count of
 * `booking.conflict` lines that preceded its own successful insert, plus one. Because every
 * trial in this file runs to completion before the next one starts (true zero concurrency,
 * not merely a low `N`), the log stream cannot interleave two trials' lines, so a **bounded
 * drain wait after each request, then a running total of conflict/refusal lines consumed so
 * far**, correctly attributes every line to the trial that produced it. `bookOnce` below is
 * that bookkeeping, shared by AC-1 and AC-2 so the attribution logic exists in exactly one
 * place.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY EVERY TRIAL RE-SEEDS A FRESH DEALERSHIP RATHER THAN REUSING ONE.
 *
 * AC-1 is a claim about *this exact occupancy* — 11 of 12 pairs booked, one of each free —
 * repeated 200 times. Booking into a shared dealership would consume the one free pair on the
 * first success and turn every subsequent trial into a *correct* refusal (no capacity left),
 * which is not what AC-1 measures. Each trial therefore gets its own namespace, exactly as
 * `H-19-1`'s own fixture did.
 */

const BAYS = 12;
const TECHNICIANS = 12;

/** `mulberry32`-adjacent nearest-rank p95, matching `tests/performance/availability-budget.test.ts`'s own definition, so QS-14 and QS-15 report the same statistic the same way. */
function p95NearestRank(samples: readonly number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.ceil(0.95 * sorted.length) - 1;
  const value = sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  if (value === undefined) throw new Error('p95NearestRank: no samples');
  return value;
}

interface BookOnceResult {
  readonly scenario: Scenario;
  readonly answer: HttpAnswer;
  /** `null` only if the log stream never delivered the line this trial needed — a tooling failure, asserted on separately. */
  readonly attempts: number | null;
  readonly refusal?: RefusalRecord;
}

/** Running totals of conflict/refusal lines already attributed to a PRIOR trial on this service. */
interface LogCursor {
  conflicts: number;
  refusals: number;
}

/**
 * Seed one fresh dealership at (12, 12), block `k` pairs over `[0, duration)`, issue ONE
 * booking for that same interval, and attribute the attempt count to it from the log stream.
 */
async function bookOnce(
  client: Client,
  service: StartedService,
  namespace: string,
  k: number,
  cursor: LogCursor,
): Promise<BookOnceResult> {
  const scenario = await seedScenario(client, namespace, { bays: BAYS, technicians: TECHNICIANS });
  await blockPairs(client, scenario, k, at(0), at(scenario.durationMinutes));
  const answer = await postBooking(service, bookingBody(scenario));

  const records =
    answer.status === 409
      ? // A refusal owes exactly one MORE booking.refused line than we have already consumed.
        await service.awaitLogRecords((rs) => refusalRecords(rs).length > cursor.refusals, 5_000)
      : // A confirmation may owe zero NEW lines at all (a first-attempt success). There is no
        // predicate that distinguishes "nothing more is coming" from "it hasn't arrived yet",
        // so this is a bounded DRAIN wait rather than a predicate wait — `awaitLogRecords`'s
        // own contract ("never throws... returns whatever was there") is exactly this shape.
        await service.awaitLogRecords(() => false, 40);

  const conflictsNow = conflictRecords(records).length;
  const refusalsNow = refusalRecords(records).length;

  let attempts: number | null = null;
  let refusal: RefusalRecord | undefined;
  if (answer.status === 201) {
    attempts = conflictsNow - cursor.conflicts + 1;
  } else if (answer.status === 409) {
    refusal = refusalRecords(records)[cursor.refusals];
    attempts = refusal === undefined ? null : Number(refusal.attempts);
  }
  cursor.conflicts = conflictsNow;
  cursor.refusals = refusalsNow;

  return { scenario, answer, attempts, refusal };
}

describe('QS-15 — no spurious refusal under occupancy, with no concurrency at all', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it(
    'AC-1 — 12 bays + 12 technicians, k=11 pre-booked, zero concurrency: all 200 distinct-seed single bookings confirm',
    async () => {
      const K = 11;
      const TRIALS = 200;

      const attempt = await startService({ databaseUrl: inject('databaseUrl'), logLevel: 'trace' });
      expect(attempt.service, attempt.failure ?? 'the service did not start').toBeDefined();
      const service = attempt.service as StartedService;
      const cursor: LogCursor = { conflicts: 0, refusals: 0 };
      const failures: string[] = [];
      let confirmedCount = 0;

      try {
        for (let i = 0; i < TRIALS; i += 1) {
          const namespace = `qs15-ac1-${String(i).padStart(3, '0')}`;
          const { scenario, answer, attempts, refusal } = await bookOnce(client, service, namespace, K, cursor);
          if (answer.status === 201) {
            confirmedCount += 1;
            continue;
          }
          failures.push(
            `  [${String(i)}] ${describeAnswer(answer)} exit=${refusal?.exit ?? '(none)'} ` +
              `attempts=${String(attempts)} seed=${String(refusal?.seed)}\n${describeScenario(scenario)}`,
          );
        }
      } finally {
        await service.stop();
      }

      // eslint-disable-next-line no-console
      console.log(`[QS-15 AC-1] ${String(confirmedCount)}/${String(TRIALS)} confirmed at k=${String(K)}`);

      expect(
        failures,
        `AC-1 — every one of ${String(TRIALS)} single-threaded bookings at k=${String(K)} of ` +
          `${String(BAYS)} must be CONFIRMED: one bay and one technician are free in every ` +
          `trial and no racer exists to explain a refusal. ADR-0040's context: measured red at ` +
          `165/200 (17.5% refused) on the shipped ADR-0009 ordering. A non-empty list here IS ` +
          `that residual, reproduced from this repository rather than quoted from a ` +
          `transcript — got ${String(confirmedCount)}/${String(TRIALS)} confirmed.\n` +
          failures.join('\n'),
      ).toEqual([]);
    },
    600_000,
  );

  it(
    'AC-2 — attempts made are p95 <= 2 for every k in {0, 3, 6, 9, 11}',
    async () => {
      const K_VALUES = [0, 3, 6, 9, 11] as const;
      const TRIALS_PER_K = 100; // nearest-rank p95 over 100 samples — QS-14's own convention

      const attempt = await startService({ databaseUrl: inject('databaseUrl'), logLevel: 'trace' });
      expect(attempt.service, attempt.failure ?? 'the service did not start').toBeDefined();
      const service = attempt.service as StartedService;

      const samplesByK = new Map<number, number[]>();
      const unresolved: string[] = [];

      try {
        for (const k of K_VALUES) {
          const cursor: LogCursor = { conflicts: 0, refusals: 0 };
          const samples: number[] = [];
          for (let i = 0; i < TRIALS_PER_K; i += 1) {
            const namespace = `qs15-ac2-k${String(k)}-${String(i).padStart(3, '0')}`;
            const { answer, attempts } = await bookOnce(client, service, namespace, k, cursor);
            if (attempts === null) {
              unresolved.push(
                `k=${String(k)} [${String(i)}] ${describeAnswer(answer)} — the log stream never ` +
                  `delivered the line this trial needed`,
              );
              continue;
            }
            samples.push(attempts);
          }
          samplesByK.set(k, samples);
        }
      } finally {
        await service.stop();
      }

      // The bookkeeping failing is a DIFFERENT defect from the slice's own (a missed log line
      // versus a spurious refusal), and conflating them would let one hide the other.
      expect(
        unresolved,
        `AC-2 — every trial's attempt count must be observable from the log stream.\n${unresolved.join('\n')}`,
      ).toEqual([]);

      const failing: string[] = [];
      for (const k of K_VALUES) {
        const samples = samplesByK.get(k) ?? [];
        const p95 = p95NearestRank(samples);
        // eslint-disable-next-line no-console
        console.log(
          `[QS-15 AC-2] k=${String(k)} p95=${String(p95)} over ${String(samples.length)} samples ` +
            `(max=${String(Math.max(...samples))})`,
        );
        if (!(p95 <= 2)) {
          failing.push(`  k=${String(k)}: p95=${String(p95)} over ${String(samples.length)} samples`);
        }
      }

      expect(
        failing,
        `AC-2 — attempts p95 must be <= 2 at every k in {${K_VALUES.join(', ')}}. ADR-0040's ` +
          `context names k=11 as the cell where the shipped ordering's p95 blows out (T-19-1's ` +
          `objection reply).\n${failing.join('\n')}`,
      ).toEqual([]);
    },
    600_000,
  );
});
