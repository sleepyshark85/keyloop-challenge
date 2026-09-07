import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import fc from 'fast-check';
import { Client } from 'pg';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  at,
  describeScenario,
  getAvailability,
  seedScenario,
  uuidNamespaceOf,
} from '../support/booking.js';
import type { HttpAnswer, Scenario } from '../support/booking.js';

/**
 * QS-8 / AC-1 — availability agrees with the constraint under quiescence.
 *
 * `docs/slices/08-availability-query.md` AC-1 (the architect's exact wording, amended at step 1
 * and again at step 2 under T-08-1/T-08-3) · `docs/slices/08-design.md` §1.1, §2 · arc42 §6.5,
 * §8.2, §10.2 · ADR-0032.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE IS `*.db.test.ts` WHEN ARC42 §10.2 AND THE SLICE FILE BOTH NAME IT WITHOUT THE
 * `.db.` INFIX. NOT ANTICIPATED AT STEP 2 — RECORDED HERE RATHER THAN SILENTLY RESOLVED.
 *
 * `vitest.config.ts` splits `tests/property/` by database need (ADR-0013, slice 01): a plain
 * `tests/property/*.test.ts` file runs in the `nodb` project, which has NO `globalSetup` and
 * therefore never calls `project.provide('databaseUrl', …)` — `inject('databaseUrl')` in that
 * project throws before a single assertion runs, which is "red for the wrong reason" in
 * exactly the sense `tests/setup/postgres.ts`'s own docblock warns about. Only a
 * `tests/property/**\/*.db.test.ts` file is routed to the `db` project, which starts the real
 * PostgreSQL container this property needs — QS-8 generates schedules and probes them with
 * real `INSERT`s, so there is no version of it that could run without one.
 *
 * §10.2's QS-8 row and the slice file's "In scope" section both predate that split at this
 * literal path — `opening-hours-dst.test.ts` (QS-9, slice 01) is the only precedent, and it
 * needs no database, so this is the first property file the rule actually binds. Filed as a
 * finding for the architect's as-built reconciliation (§7 of the slice loop) rather than
 * worked around by naming this file what the documents say and letting it fail to run at all.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT MAKES THIS THE ONLY THING STANDING BETWEEN A WRONG ANSWER AND A GREEN BUILD.
 *
 * `GET /availability` is advisory by contract (design §1.1): nothing refuses a wrong answer,
 * so a query that is subtly wrong produces no `23P01`, increments no counter and fails no
 * other test. Five mechanics close five distinct ways a wrong implementation could pass this
 * property anyway; each is called out at the assertion it protects, below.
 *
 *   1. every probe is a SAVEPOINT, rolled back                — a committed probe would make
 *      pair k+1's verdict depend on pair k's probe, against a schedule the query never saw
 *   2. the verdict is the SQLSTATE, 23P01 EXACTLY              — 23503/23514/40P01 fail the
 *      run DISTINCTLY from a genuine disagreement, never folded into "any error counts"
 *   3. quiescence is WITNESSED, not declared                   — re-run the query after every
 *      probe and require a byte-identical answer, plus an unchanged (count, max(updated_at))
 *      taken in one row over the fixture's OWN dealership (T-08-1)
 *   4. both directions counted APART                           — a merely conservative query
 *      (reports too little free) passes the "free ⇒ accepted" direction outright
 *   5. the generator is BOUNDARY-BIASED                        — appointments ending exactly
 *      at `from` and starting exactly at `to`, because `[)` vs `[]` is the likeliest place two
 *      independently written range expressions diverge and uniform generation hits it with
 *      probability ≈ 0
 *
 * WHAT WOULD STILL PASS WHILE WRONG, beyond these five — see this role's step-3 report. In
 * short: a bug that moves BOTH the query's answer and every probe's fixture data the same way
 * (there is no such shared code path — ADR-0032 keeps the range expression's two copies in two
 * files with no shared constant a bug could move once and have both sides agree on), or a bug
 * whose wrongness lies OUTSIDE the candidate universe (a resource this dealership does not
 * have) — which is exactly the scope T-08-1 corrected AC-1 to, and which QS-8's own words
 * (§10.2, before F-08-2's correction) got wrong the first time.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY THE SCHEDULE IS BUILT WITH RAW SQL AND NOT THROUGH `POST /appointments`.
 *
 * The booking route CHOOSES its own bay and technician (ADR-0009's shuffle); this property
 * needs to place a generated appointment at a SPECIFIC (bay, technician, interval) triple to
 * build an arbitrary schedule at all. `occupy()`-style direct inserts are the established
 * pattern for this in `tests/support/booking.ts`, used elsewhere only to stage fixtures never
 * to exercise the behaviour under test — here the "behaviour under test" is the READ, so
 * writing the schedule directly is the fixture, not a shortcut around the assertion.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY ONE SERVICE PROCESS SERVES ALL RUNS, AND ONE FRESH DEALERSHIP PER RUN.
 *
 * `startService` spawns a real child process; doing that once per `fc.assert` run (up to
 * `NUM_RUNS`, plus fast-check's shrinking) would dominate the property's wall-clock cost for
 * no isolation benefit, since the service holds no state of its own. Each run instead seeds a
 * FRESH dealership under its own namespace, so the run's evidence is about its own subtree —
 * the quiescence witness below is scoped to `dealership_id = $1` for exactly this reason
 * (T-08-1: composite FKs put every bay and technician at exactly one dealership, so nothing
 * elsewhere in the shared container's non-cleanup-between-tests corpus can move this run's
 * candidate universe or this run's probes).
 */

/** Kept modest: each run seeds a dealership, builds a schedule and probes every candidate
 * pair with a real INSERT — real I/O, not a pure-function property. 30 runs times fast-check's
 * shrinking on a failure is the trade the architect's step-1 design accepted implicitly by
 * putting this in `tests/property/` at all rather than pinning a fixed corpus; raising it is a
 * cost/confidence call for a later slice, not this file's to make unilaterally. */
const NUM_RUNS = 30;
const MAX_BAYS = 3;
const MAX_TECHNICIANS = 3;
const MAX_SCHEDULE_ITEMS = 6;

interface ScheduleItemSpec {
  readonly kind: 'boundaryEnd' | 'boundaryStart' | 'random';
  readonly bayIndex: number;
  readonly technicianIndex: number;
  readonly randomStartOffsetMinutes: number;
  readonly durationMinutes: number;
}

interface RunSpec {
  readonly bayCount: number;
  readonly technicianCount: number;
  readonly windowStartMinutes: number;
  readonly windowDurationMinutes: number;
  readonly items: readonly ScheduleItemSpec[];
}

const scheduleItemArbitrary = (bayCount: number, technicianCount: number): fc.Arbitrary<ScheduleItemSpec> =>
  fc.record({
    // Boundary-biased (mechanic 5): a third of items are pinned to end exactly at the query's
    // `from` or start exactly at its `to`, which uniform random generation would hit only by
    // chance. AC-2 (the acceptance file) pins the concrete example this exists to reach by
    // design rather than by luck.
    kind: fc.oneof(
      { weight: 2, arbitrary: fc.constant<'boundaryEnd'>('boundaryEnd') },
      { weight: 2, arbitrary: fc.constant<'boundaryStart'>('boundaryStart') },
      { weight: 4, arbitrary: fc.constant<'random'>('random') },
    ),
    bayIndex: fc.nat({ max: bayCount - 1 }),
    technicianIndex: fc.nat({ max: technicianCount - 1 }),
    randomStartOffsetMinutes: fc.integer({ min: -240, max: 240 }),
    durationMinutes: fc.integer({ min: 15, max: 90 }),
  });

const runArbitrary: fc.Arbitrary<RunSpec> = fc
  .record({
    bayCount: fc.integer({ min: 1, max: MAX_BAYS }),
    technicianCount: fc.integer({ min: 1, max: MAX_TECHNICIANS }),
    windowStartMinutes: fc.integer({ min: 0, max: 240 }),
    windowDurationMinutes: fc.integer({ min: 15, max: 120 }),
  })
  .chain((base) =>
    fc
      .array(scheduleItemArbitrary(base.bayCount, base.technicianCount), {
        minLength: 0,
        maxLength: MAX_SCHEDULE_ITEMS,
      })
      .map((items) => ({ ...base, items })),
  );

/** Every SQLSTATE this file must be able to tell apart, distinctly (mechanic 2). */
type ProbeVerdict = { readonly accepted: true } | { readonly accepted: false; readonly code: string };

async function probeInsert(
  client: Client,
  scenario: Scenario,
  probeId: string,
  bayId: string,
  technicianId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<ProbeVerdict> {
  const customer = scenario.customers[0];
  if (customer === undefined) throw new Error('probeInsert() needs at least one seeded customer');
  await client.query('SAVEPOINT qs8_probe');
  try {
    await client.query(
      `insert into appointment
         (id, dealership_id, customer_id, vehicle_id, service_type_id, technician_id, bay_id, starts_at, ends_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        probeId,
        scenario.dealershipId,
        customer.customerId,
        customer.vehicleId,
        scenario.serviceTypeId,
        technicianId,
        bayId,
        startsAt.toISOString(),
        endsAt.toISOString(),
      ],
    );
    return { accepted: true };
  } catch (error) {
    const code = (error as { code?: string }).code ?? '(no code)';
    return { accepted: false, code };
  } finally {
    // Mechanic 1: the probe is undone before the next one runs, whatever its verdict, so no
    // probe ever sees a prior probe's row.
    await client.query('ROLLBACK TO SAVEPOINT qs8_probe');
  }
}

interface Witness {
  readonly count: number;
  readonly maxUpdatedAt: string | null;
}

/**
 * `count(*)` and `max(updated_at)` in ONE row, NULL-safely (T-08-1's mechanical note: `max`
 * over an empty set is NULL before this dealership's first write, and comparing that against
 * a later NULL must read as "unchanged", not as two absent values that happen not to throw).
 * Scoped to `dealership_id = $1` — T-08-1: no other dealership shares a bay or technician
 * with this run's, so nothing outside this subtree can move this witness.
 */
async function quiescenceWitness(client: Client, dealershipId: string): Promise<Witness> {
  const { rows } = await client.query<{ cnt: string; mx: Date | null }>(
    `select count(*) as cnt, max(updated_at) as mx from appointment where dealership_id = $1`,
    [dealershipId],
  );
  const row = rows[0];
  return {
    count: Number(row?.cnt ?? '-1'),
    maxUpdatedAt: row?.mx instanceof Date ? row.mx.toISOString() : null,
  };
}

function stringArray(answer: HttpAnswer, name: string): readonly string[] {
  const body = answer.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return [];
  const value = (body as Record<string, unknown>)[name];
  return Array.isArray(value) ? value.map(String) : [];
}

function describeAnswer(answer: HttpAnswer): string {
  if (answer.transportFailure !== undefined) return answer.transportFailure;
  return `${String(answer.status)} ${answer.contentType ?? '(no content-type)'} ${answer.rawBody ?? ''}`;
}

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

describe('QS-8 — availability agrees with the constraint under quiescence', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it(
    'AC-1 — over the candidate universe, every pair reported free is accepted by an INSERT of exactly [from, to), and every pair omitted is rejected with 23P01',
    async () => {
      await withService(async (service) => {
        let runIndex = 0;

        await fc.assert(
          fc.asyncProperty(runArbitrary, async (run) => {
            runIndex += 1;
            const namespace = `qs8-${String(runIndex)}-${String(Date.now())}`;
            const scenario = await seedScenario(client, namespace, {
              bays: run.bayCount,
              technicians: run.technicianCount,
            });
            const where = `\n${describeScenario(scenario)}`;

            const windowStart = at(run.windowStartMinutes);
            const windowEnd = at(run.windowStartMinutes + run.windowDurationMinutes);

            // ── build an arbitrary schedule by direct INSERT, autocommitted per statement ──
            //
            // A generated pair may legitimately overlap another already in the schedule; that
            // attempt is simply refused by the constraint and does not join the schedule — an
            // arbitrary sequence of bookings is exactly a sequence some of which lose the race
            // to an earlier one. Only 23P01 is an acceptable refusal here: the fixture's own
            // bays/technicians are this scenario's own (so no 23503), every interval has a
            // strictly positive duration (so no 23514, F-08-3's case), and these inserts are
            // fully sequential on one connection (so no 40P01) — any other code is a fixture
            // defect, not a QS-8 observation, and fails loudly rather than being folded in.
            for (const [index, item] of run.items.entries()) {
              const bayId = scenario.bayIds[item.bayIndex % scenario.bayIds.length] as string;
              const technicianId = scenario.technicianIds[
                item.technicianIndex % scenario.technicianIds.length
              ] as string;
              const [startsAt, endsAt] =
                item.kind === 'boundaryEnd'
                  ? [at(run.windowStartMinutes - item.durationMinutes), windowStart]
                  : item.kind === 'boundaryStart'
                    ? [windowEnd, at(run.windowStartMinutes + run.windowDurationMinutes + item.durationMinutes)]
                    : [
                        at(item.randomStartOffsetMinutes),
                        at(item.randomStartOffsetMinutes + item.durationMinutes),
                      ];
              const scheduleId = uuidNamespaceOf(scenario, `schedule/${String(index)}`);
              const verdict = await probeInsertCommitted(
                client,
                scenario,
                scheduleId,
                bayId,
                technicianId,
                startsAt,
                endsAt,
              );
              if (!verdict.accepted && verdict.code !== '23P01') {
                throw new Error(
                  `ARRANGE — building the generated schedule hit ${verdict.code}, not 23P01 ` +
                    `or acceptance. That is a fixture defect (an out-of-universe reference, a ` +
                    `degenerate interval, or unexpected concurrency), not a QS-8 case.${where}`,
                );
              }
            }

            // ── the query, once, before any probe touches the table ──────────────────────
            const answer1 = await getAvailability(service, {
              dealershipId: scenario.dealershipId,
              serviceTypeId: scenario.serviceTypeId,
              from: windowStart.toISOString(),
              to: windowEnd.toISOString(),
            });
            expect(
              answer1.status,
              `AC-1 ARRANGE — GET /availability did not answer 200.\n${describeAnswer(answer1)}${where}`,
            ).toBe(200);

            const freeBays = new Set(stringArray(answer1, 'bays'));
            const freeTechnicians = new Set(stringArray(answer1, 'technicians'));
            const witnessBefore = await quiescenceWitness(client, scenario.dealershipId);

            // ── probe every pair of the CANDIDATE UNIVERSE (T-08-1) ───────────────────────
            const invalidVerdict: string[] = [];
            const freeButRejected: string[] = [];
            const busyButAccepted: string[] = [];
            const probeId = uuidNamespaceOf(scenario, 'probe');

            await client.query('BEGIN');
            try {
              for (const bayId of scenario.bayIds) {
                for (const technicianId of scenario.technicianIds) {
                  const reportedFree = freeBays.has(bayId) && freeTechnicians.has(technicianId);
                  const verdict = await probeInsert(
                    client,
                    scenario,
                    probeId,
                    bayId,
                    technicianId,
                    windowStart,
                    windowEnd,
                  );
                  const label =
                    `(bay=${bayId}, technician=${technicianId}) reportedFree=${String(reportedFree)} ` +
                    `verdict=${verdict.accepted ? 'accepted' : verdict.code}`;

                  if (!verdict.accepted && verdict.code !== '23P01') {
                    // Mechanic 2, and the "distinct" half of AC-1: a 23503/23514/40P01 inside
                    // the candidate universe is a failure of a DIFFERENT kind from a QS-8
                    // disagreement, and must not be silently accepted as "an error, so the
                    // pair must be busy".
                    invalidVerdict.push(
                      `${label} — expected 'accepted' or '23P01' ONLY, inside the candidate ` +
                        `universe (T-08-1). This SQLSTATE means the fixture or the query left ` +
                        `the universe QS-8 is stated over.`,
                    );
                    continue;
                  }
                  if (reportedFree && !verdict.accepted) {
                    // direction A: reported free ⇒ must be accepted
                    freeButRejected.push(
                      `${label} — reported FREE but the INSERT of exactly [from, to) was ` +
                        `REJECTED with 23P01`,
                    );
                  }
                  if (!reportedFree && verdict.accepted) {
                    // direction B: omitted ⇒ must be rejected with 23P01 (mechanic 4 — a
                    // merely conservative query passes this direction only by accident)
                    busyButAccepted.push(
                      `${label} — reported BUSY (omitted) but the INSERT was ACCEPTED: the ` +
                        `query is under-reporting availability`,
                    );
                  }
                }
              }
            } finally {
              await client.query('ROLLBACK');
            }

            // ── quiescence, WITNESSED (mechanic 3) ────────────────────────────────────────
            const answer2 = await getAvailability(service, {
              dealershipId: scenario.dealershipId,
              serviceTypeId: scenario.serviceTypeId,
              from: windowStart.toISOString(),
              to: windowEnd.toISOString(),
            });
            const witnessAfter = await quiescenceWitness(client, scenario.dealershipId);

            const quiescenceHeld =
              answer1.rawBody === answer2.rawBody &&
              witnessBefore.count === witnessAfter.count &&
              witnessBefore.maxUpdatedAt === witnessAfter.maxUpdatedAt;

            // Discarded through fc.pre() — NEVER swallowed by a try/catch around it — so a
            // SYSTEMIC leak (every run invalid) trips fast-check's own too-many-discards error
            // and the property fails loud rather than reporting a hollow pass.
            fc.pre(quiescenceHeld);

            expect(
              invalidVerdict,
              `AC-1 — one or more probes left the candidate universe.\n${invalidVerdict.join('\n')}${where}`,
            ).toEqual([]);
            expect(
              freeButRejected,
              `AC-1 direction A (free ⇒ accepted) — one or more pairs reported free were ` +
                `rejected.\n${freeButRejected.join('\n')}${where}`,
            ).toEqual([]);
            expect(
              busyButAccepted,
              `AC-1 direction B (omitted ⇒ rejected 23P01) — one or more pairs reported busy ` +
                `were actually free.\n${busyButAccepted.join('\n')}${where}`,
            ).toEqual([]);
          }),
          { numRuns: NUM_RUNS },
        );
      });
    },
    120_000,
  );
});

/**
 * A schedule-building insert, autocommitted (no SAVEPOINT): unlike `probeInsert`, a SUCCESSFUL
 * schedule item must persist so the running service's own connection can see it when the
 * query runs. Only a REJECTED attempt needs no undo — PostgreSQL never applied it.
 */
async function probeInsertCommitted(
  client: Client,
  scenario: Scenario,
  id: string,
  bayId: string,
  technicianId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<ProbeVerdict> {
  const customer = scenario.customers[0];
  if (customer === undefined) throw new Error('probeInsertCommitted() needs at least one seeded customer');
  try {
    await client.query(
      `insert into appointment
         (id, dealership_id, customer_id, vehicle_id, service_type_id, technician_id, bay_id, starts_at, ends_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        scenario.dealershipId,
        customer.customerId,
        customer.vehicleId,
        scenario.serviceTypeId,
        technicianId,
        bayId,
        startsAt.toISOString(),
        endsAt.toISOString(),
      ],
    );
    return { accepted: true };
  } catch (error) {
    const code = (error as { code?: string }).code ?? '(no code)';
    return { accepted: false, code };
  }
}
