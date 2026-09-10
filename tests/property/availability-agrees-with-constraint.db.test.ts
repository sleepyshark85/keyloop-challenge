import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import fc from 'fast-check';
import { Client } from 'pg';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  at,
  describeScenario,
  getAvailability,
  member,
  seedScenario,
  uuidNamespaceOf,
} from '../support/booking.js';
import type { HttpAnswer, Scenario } from '../support/booking.js';

/**
 * QS-8 / AC-5 — availability agrees with the constraint under quiescence.
 *
 * `docs/slices/08-availability-query.md` AC-1 (the architect's exact wording, amended at step 1
 * and again at step 2 under T-08-1/T-08-3) · `docs/slices/08-design.md` §1.1, §2 · arc42 §6.5,
 * §8.2, §10.2 · ADR-0032 (retired).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * SLICE 16 AMENDMENT (`docs/slices/16-availability-derives-its-own-window.md` AC-5,
 * `16-design.md` ruling 2, ADR-0039) — carried here rather than in a second file, because the
 * six mechanics below survive unchanged in kind and a second property asserting the same
 * schedule/probe machinery over the same endpoint would be the duplication ADR-0039 itself
 * argues against.
 *
 * The generator gives up `to` and gains an arbitrary `startsAt` (`AIM_DURATION_MINUTES` below
 * — `seedScenario`'s own default duration — is used ONLY to AIM the boundary items and the
 * cancelled witness onto the instants the server is expected to derive; it is never the probe).
 * **The probe interval is read from the response and never recomputed** — `answer1`'s own
 * `startsAt`/`endsAt` become `probeStart`/`probeEnd` below, so a server that derived a wrong
 * window is probed over the window it actually answered about, not over one this file computes
 * independently. That is deliberate and is ruling 2's own point: this property is now
 * internally consistent by construction and CANNOT catch a wrong window — AC-2 (
 * `tests/acceptance/availability.test.ts`) is the assertion that does, by requiring the
 * availability and booking answers to name the same two instants. What this property still
 * catches, exactly as before: a candidate reported free that the constraint refuses, or a
 * candidate omitted that the constraint would accept — now measured against whichever window
 * the response actually named.
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
 * other test. Six mechanics close six distinct ways a wrong implementation could pass this
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
 *   6. every run carries a CANCELLED WITNESS, BY CONSTRUCTION  — one item written `cancelled`,
 *      inside `[from, to)`, on a bay and technician no other in-window item uses; delete
 *      `status <> 'cancelled'` from the busy-resources predicate and that pair reports busy
 *      while its probe is accepted — direction B, every run, not a weighted probability (T-08-7)
 *
 * WHAT WOULD STILL PASS WHILE WRONG, beyond these six — see this role's step-3 report. In
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
  // Mechanic 6 (R-08-1, corrected by T-08-7): a query and the constraint can agree on the
  // range and disagree on the predicate that scopes it — `status <> 'cancelled'` — and no run
  // can distinguish an allowlist (`status = 'confirmed'`) from the denylist the constraint
  // actually uses unless a cancelled item is BOTH in-window and unmasked by a confirmed one on
  // the same bay or technician. A weight alone missed that: 8/35 mutation trials survived
  // because the two conditions coincide only 1033/5000 times under uniform generation. This
  // field, and the witness's placement, are now set BY CONSTRUCTION below
  // (`witnessItemArbitrary` / `otherScheduleItemArbitrary`), not sampled independently per
  // item. The probe is still the oracle: no expectation is recomputed, this only changes what
  // gets written.
  readonly status: 'confirmed' | 'cancelled';
}

interface RunSpec {
  readonly bayCount: number;
  readonly technicianCount: number;
  /** The query's own `startsAt`, arbitrary — the slice-16 amendment. There is no arbitrary
   * window width any more: the width is `AIM_DURATION_MINUTES`, `seedScenario`'s own service
   * duration, because the server derives it and the caller no longer states one. */
  readonly startsAtMinutes: number;
  readonly items: readonly ScheduleItemSpec[];
}

/**
 * `seedScenario`'s default `durationMinutes` (booking.ts), restated as a constant so the
 * generator can AIM boundary items onto the instants the server is expected to derive —
 * `startsAtMinutes` and `startsAtMinutes + AIM_DURATION_MINUTES` — without ever standing in
 * for the probe itself (ruling 2: aiming and probing are different privileges).
 */
const AIM_DURATION_MINUTES = 60;

/**
 * Mechanic 6, corrected (T-08-7): every OTHER item (i.e. every item but the witness, below)
 * must leave the witness's (bay, technician) pair — index 0 of each — unshared while it could
 * be in-window, or the witness's discriminating power is masked: a confirmed item that
 * independently makes the pair busy is indistinguishable, at this pair, from the mutant this
 * mechanic exists to kill. With more than one bay or technician to choose from, other items
 * simply draw their index from the REMAINING ones (1..count-1), leaving index 0 to the witness
 * alone regardless of kind. With only one bay or one technician there IS no remaining index —
 * every item is forced onto it — so the only way to stay clear of the window is the kind
 * itself: mechanic 5 already places 'boundaryEnd'/'boundaryStart' items outside the AIMED
 * `[startsAt, startsAt + AIM_DURATION_MINUTES)` by construction, so restricting to those two
 * kinds keeps the pair unshared without an index to fall back on.
 */
const otherScheduleItemArbitrary = (
  bayCount: number,
  technicianCount: number,
): fc.Arbitrary<ScheduleItemSpec> => {
  const mustStayOutOfWindow = bayCount === 1 || technicianCount === 1;
  return fc.record({
    // Boundary-biased (mechanic 5): pinned to end exactly at the AIMED derived start or start
    // exactly at the AIMED derived end, which uniform random generation would hit only by
    // chance. AC-1 (`tests/acceptance/availability.test.ts`) pins the concrete example this
    // exists to reach by design rather than by luck.
    kind: mustStayOutOfWindow
      ? fc.oneof(
          fc.constant<'boundaryEnd'>('boundaryEnd'),
          fc.constant<'boundaryStart'>('boundaryStart'),
        )
      : fc.oneof(
          { weight: 2, arbitrary: fc.constant<'boundaryEnd'>('boundaryEnd') },
          { weight: 2, arbitrary: fc.constant<'boundaryStart'>('boundaryStart') },
          { weight: 4, arbitrary: fc.constant<'random'>('random') },
        ),
    bayIndex: bayCount > 1 ? fc.integer({ min: 1, max: bayCount - 1 }) : fc.constant(0),
    technicianIndex:
      technicianCount > 1 ? fc.integer({ min: 1, max: technicianCount - 1 }) : fc.constant(0),
    randomStartOffsetMinutes: fc.integer({ min: -240, max: 240 }),
    durationMinutes: fc.integer({ min: 15, max: 90 }),
    // AC-1: "the remaining items are drawn confirmed:cancelled at 4:1" — kept verbatim from the
    // architect's wording. The witness below is no longer part of this population; it is
    // guaranteed, not sampled.
    status: fc.oneof(
      { weight: 4, arbitrary: fc.constant<'confirmed'>('confirmed') },
      { weight: 1, arbitrary: fc.constant<'cancelled'>('cancelled') },
    ),
  });
};

/**
 * The witness itself (T-08-7): always `cancelled`, always at (bayIndex=0, technicianIndex=0),
 * and always starting inside the AIMED `[startsAtMinutes, startsAtMinutes +
 * AIM_DURATION_MINUTES)` — `randomStartOffsetMinutes` is the ABSOLUTE offset from t=0 that a
 * 'random'-kind item reads (see the assembly loop below), so it is drawn directly from that
 * range here rather than shifted later. Any positive duration keeps the interval overlapping
 * the aimed window, since only the START needs to land inside it.
 */
const witnessItemArbitrary = (
  startsAtMinutes: number,
  aimDurationMinutes: number,
): fc.Arbitrary<ScheduleItemSpec> =>
  fc.record({
    kind: fc.constant<'random'>('random'),
    bayIndex: fc.constant(0),
    technicianIndex: fc.constant(0),
    randomStartOffsetMinutes: fc.integer({
      min: startsAtMinutes,
      max: startsAtMinutes + aimDurationMinutes - 1,
    }),
    durationMinutes: fc.integer({ min: 15, max: 90 }),
    status: fc.constant<'cancelled'>('cancelled'),
  });

const runArbitrary: fc.Arbitrary<RunSpec> = fc
  .record({
    bayCount: fc.integer({ min: 1, max: MAX_BAYS }),
    technicianCount: fc.integer({ min: 1, max: MAX_TECHNICIANS }),
    startsAtMinutes: fc.integer({ min: 0, max: 240 }),
  })
  .chain((base) =>
    fc
      .record({
        witness: witnessItemArbitrary(base.startsAtMinutes, AIM_DURATION_MINUTES),
        // MAX_SCHEDULE_ITEMS bounds the run's total size; the witness now occupies one slot of
        // it, so the other population's own ceiling drops by one to keep that total unchanged.
        others: fc.array(otherScheduleItemArbitrary(base.bayCount, base.technicianCount), {
          minLength: 0,
          maxLength: MAX_SCHEDULE_ITEMS - 1,
        }),
      })
      .map(({ witness, others }) => ({ ...base, items: [witness, ...others] })),
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
    'AC-5 — over the candidate universe, every pair reported free is accepted by an INSERT of exactly the interval the response named, and every pair omitted is rejected with 23P01',
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

            // AIMED, not probed: the schedule is built before any response exists, so
            // boundary items are placed at the instants the server is EXPECTED to derive
            // (`seedScenario`'s own duration, `AIM_DURATION_MINUTES`) — ruling 2's "aiming and
            // probing are different privileges". A generator that aims wrong produces dull
            // cases; the probe below never uses these two values.
            const aimedStart = at(run.startsAtMinutes);
            const aimedEnd = at(run.startsAtMinutes + AIM_DURATION_MINUTES);

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
                  ? [at(run.startsAtMinutes - item.durationMinutes), aimedStart]
                  : item.kind === 'boundaryStart'
                    ? [aimedEnd, at(run.startsAtMinutes + AIM_DURATION_MINUTES + item.durationMinutes)]
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
                item.status,
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
            const query = {
              dealershipId: scenario.dealershipId,
              serviceTypeId: scenario.serviceTypeId,
              startsAt: aimedStart.toISOString(),
            };
            const answer1 = await getAvailability(service, query);
            expect(
              answer1.status,
              `AC-5 ARRANGE — GET /availability did not answer 200.\n${describeAnswer(answer1)}${where}`,
            ).toBe(200);

            // THE PROBE INTERVAL IS READ FROM THE RESPONSE, NEVER RECOMPUTED (ruling 2). A
            // server that derived a wrong window is probed over the window it actually
            // answered about — this property cannot catch a wrong window (AC-2 does); it can
            // still catch a candidate the CONSTRAINT disagrees with the RESPONSE about, over
            // whatever window the response named.
            const probeStartRaw = member(answer1, 'startsAt');
            const probeEndRaw = member(answer1, 'endsAt');
            expect(
              typeof probeStartRaw === 'string' && typeof probeEndRaw === 'string',
              `AC-5 ARRANGE — the 200 must name the interval it answered about as string ` +
                `'startsAt'/'endsAt'.\n${describeAnswer(answer1)}${where}`,
            ).toBe(true);
            const probeStart = new Date(String(probeStartRaw));
            const probeEnd = new Date(String(probeEndRaw));
            expect(
              !Number.isNaN(probeStart.getTime()) && !Number.isNaN(probeEnd.getTime()),
              `AC-5 ARRANGE — the named startsAt/endsAt must both render as instants.\n${describeAnswer(answer1)}${where}`,
            ).toBe(true);

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
                    probeStart,
                    probeEnd,
                  );
                  const label =
                    `(bay=${bayId}, technician=${technicianId}) reportedFree=${String(reportedFree)} ` +
                    `verdict=${verdict.accepted ? 'accepted' : verdict.code}`;

                  if (!verdict.accepted && verdict.code !== '23P01') {
                    // Mechanic 2, and the "distinct" half of AC-5: a 23503/23514/40P01 inside
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
                      `${label} — reported FREE but the INSERT of exactly the named interval ` +
                        `was REJECTED with 23P01`,
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
            const answer2 = await getAvailability(service, query);
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
              `AC-5 — one or more probes left the candidate universe.\n${invalidVerdict.join('\n')}${where}`,
            ).toEqual([]);
            expect(
              freeButRejected,
              `AC-5 direction A (free ⇒ accepted) — one or more pairs reported free were ` +
                `rejected.\n${freeButRejected.join('\n')}${where}`,
            ).toEqual([]);
            expect(
              busyButAccepted,
              `AC-5 direction B (omitted ⇒ rejected 23P01) — one or more pairs reported busy ` +
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
  // Mechanic 6 (R-08-1, corrected by T-08-7): written explicitly rather than left at its
  // column default, so the guaranteed witness occupies a slot the constraint does not police
  // and a query that used the allowlist spelling (`status = 'confirmed'`) instead of the
  // denylist (`status <> 'cancelled'`) would disagree on. No expectation is recomputed here —
  // the probe stays the oracle regardless of which status a schedule item carries.
  status: 'confirmed' | 'cancelled',
): Promise<ProbeVerdict> {
  const customer = scenario.customers[0];
  if (customer === undefined) throw new Error('probeInsertCommitted() needs at least one seeded customer');
  try {
    await client.query(
      `insert into appointment
         (id, dealership_id, customer_id, vehicle_id, service_type_id, technician_id, bay_id, starts_at, ends_at, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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
        status,
      ],
    );
    return { accepted: true };
  } catch (error) {
    const code = (error as { code?: string }).code ?? '(no code)';
    return { accepted: false, code };
  }
}
