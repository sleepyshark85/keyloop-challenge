import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { uuidFor } from '../support/ids.js';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  at,
  bookingBody,
  conflictRecords,
  describeAnswer,
  describeLoopLines,
  describeScenario,
  isoAt,
  member,
  occupy,
  postBooking,
  postReschedule,
  releaseFromBarrier,
  seedScenario,
} from '../support/booking.js';
import type { Scenario } from '../support/booking.js';

/**
 * Slice 07 — AC-1 and AC-4: a refused move writes nothing, whether it loses alone or races
 * another move for the pair it is trying to leave.
 *
 * `docs/slices/07-reschedule-under-contention.md` AC-1, AC-4 · `docs/slices/07-design.md`
 * §1, §2.1, §2.3 · ADR-0003, ADR-0018, ADR-0023, ADR-0026, ADR-0027, ADR-0029, ADR-0030 ·
 * arc42 §5.2, §6.1, §6.3, §8.6 · CLAUDE.md §2.1, §2.2, §5.
 *
 * WHOSE FILE THIS IS. `CLAUDE.md` §5 gives `tests/concurrency/` to the test-engineer. This
 * file imports no `src/` module: it reaches the database through a bare `pg.Client` and the
 * application only over HTTP, exactly as `cancellation-releases-slot.test.ts` and
 * `cancellation-takes-no-lock.test.ts` already do.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * AC-1 — WHY xmin AND ctid, NOT JUST COLUMN EQUALITY.
 *
 * `to_jsonb(appointment)` equality is satisfied by a compensating cancel-then-restore that
 * writes the row twice and lands back on the same visible values. `xmin` and `ctid` are not:
 * a genuinely refused `UPDATE` — the guarded `WHERE` matching zero rows, or a `23P01` aborting
 * the statement — never produces a new heap tuple, so both are byte-identical before and
 * after. `tests/integration/cancellation-releases-slot.test.ts` established this exact
 * instrument for slice 05's cancel; this is the same query with `ctid` added, read on the
 * move path.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * AC-4 — THE FIXTURE, AND WHY IT DOES NOT DEPEND ON ADR-0009's SHUFFLE.
 *
 * ADR-0027 fixes attempt 1 as "the pair the row already holds" — deterministic, never
 * shuffled. Everything from attempt 2 is drawn from `orderCandidates(bays, technicians,
 * seed)`, which is the FULL CROSS PRODUCT of the dealership's bays and its qualified
 * technicians (`candidate-retry.test.ts`: "16 x 16 = 256 pairs"). A 2-bay/2-technician
 * dealership therefore offers FOUR candidates, and pruning by whichever resource conflicts
 * removes two at a time — not one — so a naive 2-bay/2-technician race leaves TWO candidates
 * after attempt 1 fails, and which of those two attempt 2 draws is a coin flip neither this
 * file nor ADR-0027 controls.
 *
 * This file removes the coin flip structurally rather than relying on it: each mover's own
 * SERVICE TYPE qualifies exactly ONE technician (a second, per-mover service type is inserted
 * for this purpose; two "blocker" technicians hold no qualification at all and so never
 * appear as a candidate for either mover). That shrinks each mover's own candidate space to
 * exactly TWO pairs — its own bay and the other bay, both under its own single qualified
 * technician — so after attempt 1's own-pair failure there is exactly ONE remaining
 * candidate, and it is unconditionally the OTHER mover's own currently-held bay. No seed, no
 * shuffle, no randomness: attempt 2 is forced.
 *
 * Per race pair (A, B), sharing one dealership, one interval `I` and one target `J` (`J`
 * overlapping `I`, both disjoint from the "blocker" interval so seeding it never itself
 * conflicts with A's or B's own committed row):
 *
 *   A  bay0, tA  @ I         (own service type, qualifies tA only)
 *   B  bay1, tB  @ I         (own service type, qualifies tB only)
 *   CA bay0, btA @ blocker   (occupies A's own bay at J; unqualified technician, so it
 *                             conflicts on the BAY axis only, never pruning A's technician)
 *   CB bay1, btB @ blocker   (occupies B's own bay at J, symmetrically)
 *
 * A's attempt 1 = (bay0, tA)@J: refused by CA on the bay -> prune bay0 -> ONE candidate left,
 * (bay1, tA)@J, which is B's bay held at an interval overlapping J. B's attempt 1 = (bay1,
 * tB)@J: refused by CB -> prune bay1 -> ONE candidate left, (bay0, tB)@J, A's bay. Each
 * mover's only remaining move is TAKING the bay the other is simultaneously VACATING — the
 * mutual cross-vacate ADR-0030's measurement is built on, forced by construction rather than
 * left to a shuffle.
 *
 * NEITHER MOVE CAN EVER SUCCEED, in either the built or the fixed database — this is a
 * structural fact about the fixture, not a probability, and it is what makes the file's
 * central assertion so sharp. A's target bay only frees once B's row moves off it, and B's
 * target bay only frees once A's row moves off it; there is no order in which one commits
 * first, since each one's own read finds the other's row still (or again, after a rollback)
 * confirmed on the bay it needs. So the row-level claims below — unchanged, including
 * `xmin` — hold for EVERY racer in EVERY trial regardless of which build is running. The
 * ONLY thing that differs between the built (target-only) lock and ADR-0030's (union) lock is
 * whether that inevitable refusal is reported as a database VERDICT (`23P01`/`409`) or as an
 * unresolved deadlock surfacing as `40P01`/`500` — which is exactly AC-4's claim.
 *
 * `RACE_COUNT` independent pairs (distinct dealerships, so no pair's resources can interact
 * with another's), released together from ONE barrier **whose batch size never exceeds the
 * service's connection pool** (R-07-4, below), over `TRIAL_COUNT` trials. Each dealership is
 * seeded ONCE and reused across every trial; each trial's four rows sit at an interval offset
 * by `trial * 1440` minutes (whole days) so no trial's rows can ever collide with another's on
 * the same bay, and so every trial lands at the SAME local wall-clock time on a different
 * calendar day — never spanning local midnight, which is refused independently of the
 * opening-hours window itself (slice 13). Opening hours are additionally set to the whole
 * day (`00:00:00`-`24:00:00`) so the window itself can never be the reason a target is
 * refused — this file is about contention, not GC-1.
 *
 * ── R-07-4: THE IN-FLIGHT BOUND, AND WHY IT IS NOT A FLAKE DODGE ────────────────────────
 *
 * At the red commit this file released `RACE_COUNT = 20` pairs — 40 movers — from ONE barrier
 * per trial, against a service whose `createPool` sets no `max` and so runs at pg's
 * unconfigured default of 10 (D-07-1). The reviewer named two effects of that, and the second
 * is the one that matters: 40-in-flight-against-10 **manufactures a codeless `500`** the
 * assertion below then blamed on a deadlock without having measured one, **and** it
 * **serialises the very simultaneity this criterion is about** — the pool can queue a pair's
 * two movers apart, so they never actually race the exclusion check at the same instant. The
 * slice file's own amended text: *"bounding concurrency should make the mutant control
 * stronger"*, and the architect asked to be contradicted if the re-measurement did not bear
 * that out.
 *
 * **The fix is `RACE_COUNT = 5`, not a new synchronisation primitive.** `movers.length` per
 * trial is `RACE_COUNT * 2 = 10`, exactly pg's unconfigured pool ceiling, so the EXISTING
 * `releaseFromBarrier` — already a true release-together barrier, never a queue — never has
 * more than 10 requests in flight at once. `TRIAL_COUNT` rises to 100 to hold total attempt
 * volume at `5 * 100 * 2 = 1000`: the AC's own floor, and ADR-0030's own measurement scale
 * (20 pairs x 25 trials x 2 = 1000).
 *
 * ── THE RE-MEASUREMENT (R-07-4's own discipline: measure, don't assume) ─────────────────
 *
 * The architect's own measurement — 117 `40P01` per 1000 contended attempts, 11.7% — is on a
 * different fixture (`docs/adr/0030-...md`'s own). The RED-COMMIT shape of THIS fixture (40
 * in flight against a 10-client pool, `RACE_COUNT = 20`, unbounded barrier) measured 41
 * `40P01` in 7800 attempts across six throwaway runs — a point estimate of **0.5%**, 95% CI
 * roughly 0.27%-0.80%.
 *
 * Re-measured at THIS shape (`RACE_COUNT = 5`, `TRIAL_COUNT = 100`, a 10-wide barrier per
 * trial, never exceeding the pool) against the SAME unfixed build (`783f323`, ADR-0030 not
 * yet applied — a throwaway worktree, three runs of 1000 attempts each): **20, 23, 13
 * `40P01`** — 56 in 3000 attempts, a point estimate of **1.87%**, 95% CI roughly
 * **1.38%-2.35%**. That interval sits entirely above the unbounded shape's 0.27%-0.80% —
 * **the rate rose, roughly 2x-4x, and the two intervals do not overlap.** This CONFIRMS the
 * architect's reading: queue-serialisation, not the extra-round-trip explanation the
 * red-commit header gave, is why the unbounded shape under-measured. Bounding concurrency to
 * the pool did not merely avoid the codeless `500` — it let more of the true contention
 * happen, which is what a mutant control is for. (As a positive control on the measurement
 * method itself: the SAME bounded shape against the FIXED build — current `HEAD`, ADR-0030
 * applied — measured 0/1000, confirming the harness discriminates rather than always firing.)
 *
 * At the new point estimate the false-pass arithmetic is no longer the file's binding
 * concern: `(1 - 0.0138)^1000` (the interval's LOWER bound, which is what matters for a
 * silent false pass) is on the order of `1e-6` — several orders below the old shape's worst
 * case. `TRIAL_COUNT = 100` is kept at the AC's own floor of 1000 total attempts rather than
 * raised further, because the margin no longer needs it; a single green run is still not
 * proof on its own, so the positive witnesses below (attempt >= 2, forced by construction)
 * remain load-bearing exactly as `no-spurious-refusal.test.ts`'s own standard (T-04-4) requires.
 */

const RACE_COUNT = 5;
/** pg's unconfigured pool default (D-07-1) — `RACE_COUNT * 2` must never exceed this. */
const POOL_MAX = 10;
/**
 * `RACE_COUNT * TRIAL_COUNT * 2 = 1000` — the AC's own floor, and ADR-0030's own measurement
 * scale (20 x 25 x 2). See the R-07-4 re-measurement above for why this shape's false-pass
 * risk is lower than the red-commit shape's despite fewer pairs.
 */
const TRIAL_COUNT = 100;

interface RowSnapshot {
  readonly columns: unknown;
  readonly xmin: string;
  readonly ctid: string;
}

async function snapshot(client: Client, id: string): Promise<RowSnapshot | null> {
  const { rows } = await client.query<{ row: unknown; xmin: string; ctid: string }>(
    'select to_jsonb(appointment) as row, xmin::text as xmin, ctid::text as ctid ' +
      'from appointment where id = $1',
    [id],
  );
  const row = rows[0];
  return row === undefined ? null : { columns: row.row, xmin: row.xmin, ctid: row.ctid };
}

async function snapshotMany(
  client: Client,
  ids: readonly string[],
): Promise<ReadonlyMap<string, RowSnapshot>> {
  const { rows } = await client.query<{ id: string; row: unknown; xmin: string; ctid: string }>(
    'select id, to_jsonb(appointment) as row, xmin::text as xmin, ctid::text as ctid ' +
      'from appointment where id = any($1::uuid[])',
    [ids],
  );
  const out = new Map<string, RowSnapshot>();
  for (const row of rows) out.set(row.id, { columns: row.row, xmin: row.xmin, ctid: row.ctid });
  return out;
}

function render(label: string, snap: RowSnapshot | null): string {
  return snap === null
    ? `  ${label}: NO ROW`
    : `  ${label}: xmin=${snap.xmin} ctid=${snap.ctid} ${JSON.stringify(snap.columns)}`;
}

async function withService<T>(
  run: (service: StartedService) => Promise<T>,
): Promise<T | undefined> {
  const attempt = await startService({
    databaseUrl: inject('databaseUrl'),
    // trace: AC-4's positive witness is read off `booking.conflict` lines (I-02-6's observer).
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

describe('slice 07 — AC-1: a refused single move leaves the row unchanged, xmin and ctid included', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('AC-1 — A confirmed [t0,t0+60), the dealership fully booked at the target: the move is refused and A is unchanged, including xmin and ctid', async () => {
    const scenario = await seedScenario(client, 'ac1-refused-move-unchanged', {
      bays: 1,
      technicians: 1,
      customers: 1,
    });
    const where = `\n${describeScenario(scenario)}`;
    const bayId = scenario.bayIds[0] as string;
    const technicianId = scenario.technicianIds[0] as string;

    await withService(async (service) => {
      const booked = await postBooking(service, bookingBody(scenario, { startsAtMinutes: 0 }));
      expect(
        booked.status,
        `ARRANGE — A was not booked.\n${describeAnswer(booked)}${where}`,
      ).toBe(201);
      const id = String(member(booked, 'id'));

      // Occupy the ONLY candidate at the target interval directly (`occupy`, not through the
      // booking API): with bays:1/technicians:1 the appointment's own pair IS its only
      // candidate (ADR-0027), so this alone is enough to make the move unconditionally
      // refused — no shuffle exists to escape through.
      await occupy(client, scenario, {
        label: 'target-blocker',
        bayId,
        technicianId,
        startsAt: at(120),
        endsAt: at(180),
      });

      const before = await snapshot(client, id);
      expect(before, `ARRANGE — A's row is missing before the attempt.${where}`).not.toBeNull();
      expect(
        (before?.columns as Record<string, unknown> | undefined)?.['status'],
        'ARRANGE — A must be confirmed before the attempt',
      ).toBe('confirmed');

      const answer = await postReschedule(service, id, isoAt(120));
      expect(
        answer.status,
        `AC-1 — the target interval is fully booked on the dealership's only bay and ` +
          `technician, so the move must be refused. At the red commit the route may not ` +
          `exist at all (404).\n${describeAnswer(answer)}${where}`,
      ).toBe(409);
      expect(answer.contentType, 'RFC 9457').toMatch(/application\/problem\+json/);
      expect(
        member(answer, 'type'),
        `AC-1 — a capacity refusal (arc42 §8.6), not the terminal-state or domain-rule types.${where}`,
      ).toBe('/problems/no-capacity');

      const after = await snapshot(client, id);
      expect(after, `A's row disappeared after the refused move.${where}`).not.toBeNull();

      const columnsWhere = `\n${render('before', before)}\n${render('after', after)}${where}`;
      expect(
        after?.columns,
        `AC-1 — every column of A's row must be unchanged after a refused move.${columnsWhere}`,
      ).toEqual(before?.columns);
      expect(
        (after?.columns as Record<string, unknown> | undefined)?.['status'],
        `AC-1 — A must still be confirmed.${columnsWhere}`,
      ).toBe('confirmed');
      expect(
        (after?.columns as Record<string, unknown> | undefined)?.['id'],
        `AC-1 — the same appointment id.${columnsWhere}`,
      ).toBe(id);
      expect(
        (after?.columns as Record<string, unknown> | undefined)?.['bay_id'],
        `AC-1 — the same bay.${columnsWhere}`,
      ).toBe(bayId);
      expect(
        (after?.columns as Record<string, unknown> | undefined)?.['technician_id'],
        `AC-1 — the same technician.${columnsWhere}`,
      ).toBe(technicianId);

      // THE CLAUSE THAT MAKES "unchanged" MEAN NOT WRITTEN, not merely "no column differs":
      // a compensating cancel-then-restore passes the to_jsonb equality above and fails this.
      expect(
        after?.xmin,
        `AC-1 — xmin must be UNCHANGED: a refused move must not write the row at all, not ` +
          `even a write that restores every visible column. xmin advancing here is what a ` +
          `cancel-then-restore compensation looks like from the table's own version counter.` +
          `${columnsWhere}`,
      ).toBe(before?.xmin);
      expect(
        after?.ctid,
        `AC-1 — ctid must be UNCHANGED for the same reason: an UPDATE that matches zero rows ` +
          `or aborts on 23P01 never produces a new heap tuple.${columnsWhere}`,
      ).toBe(before?.ctid);
    });
  });
});

// ───────────────────────────────────────────────────────────────── AC-4: racing moves ──

interface RaceFixture {
  readonly namespace: string;
  readonly dealershipId: string;
  readonly bay0: string;
  readonly bay1: string;
  readonly tA: string;
  readonly tB: string;
  readonly serviceTypeA: string;
  readonly serviceTypeB: string;
  readonly serviceTypeBlocker: string;
  readonly customerId: string;
  readonly vehicleId: string;
  readonly durationMinutes: number;
}

/**
 * One race's dealership: 2 bays, no auto-qualified technicians (`technicians: 0`), plus —
 * inserted directly, exactly as `occupy()`'s own header argues a controlled contention
 * fixture must be — THREE service types and four technicians. `appointment` carries a
 * composite FK (`appointment_technician_qualified`) tying every row's `(technician_id,
 * service_type_id)` to `technician_qualification`, so the two "blocker" technicians need
 * their OWN service type to be insertable at all — reusing A's or B's would qualify them for
 * it and reopen the cross-product this fixture exists to avoid. See the file header for why
 * this shape, not a plain 2x2 grid, is what forces attempt 2 rather than leaving it to
 * ADR-0009's shuffle: A's and B's own service types each qualify exactly one technician, so
 * neither mover's candidate generation ever sees the blockers at all, qualified or not.
 */
async function setupRace(client: Client, namespace: string, index: number): Promise<RaceFixture> {
  const ns = `${namespace}-race${String(index).padStart(3, '0')}`;
  const scenario: Scenario = await seedScenario(client, ns, {
    bays: 2,
    technicians: 0,
    customers: 1,
    hours: { opensAt: '00:00:00', closesAt: '24:00:00' },
  });
  const [bay0, bay1] = scenario.bayIds as readonly [string, string];
  const tA = uuidFor(ns, 'technician/a');
  const tB = uuidFor(ns, 'technician/b');
  const btA = uuidFor(ns, 'technician/blocker-a');
  const btB = uuidFor(ns, 'technician/blocker-b');
  const serviceTypeB = uuidFor(ns, 'service_type/b');
  const serviceTypeBlocker = uuidFor(ns, 'service_type/blocker');
  const customer = scenario.customers[0];
  if (customer === undefined) throw new Error('setupRace() needs a seeded customer');

  await client.query(
    `insert into technician (id, dealership_id, name) values
       ($1, $5, 'a'), ($2, $5, 'b'), ($3, $5, 'blocker-a'), ($4, $5, 'blocker-b')`,
    [tA, tB, btA, btB, scenario.dealershipId],
  );
  await client.query(
    `insert into service_type (id, name, duration_minutes) values
       ($1, $3, $5), ($2, $4, $5)`,
    [serviceTypeB, serviceTypeBlocker, `${ns} service b`, `${ns} service blocker`, scenario.durationMinutes],
  );
  // tA qualifies ONLY for the scenario's own (A-side) service type; tB ONLY for the new
  // B-side one; btA and btB qualify ONLY for the third, blocker-only service type — so
  // neither A's nor B's own candidate generation (scoped to ITS OWN service type) ever sees
  // a blocker technician, qualified or not.
  await client.query(
    `insert into technician_qualification (technician_id, service_type_id) values
       ($1, $2), ($3, $4), ($5, $6), ($7, $6)`,
    [tA, scenario.serviceTypeId, tB, serviceTypeB, btA, serviceTypeBlocker, btB],
  );

  return {
    namespace: ns,
    dealershipId: scenario.dealershipId,
    bay0,
    bay1,
    tA,
    tB,
    serviceTypeA: scenario.serviceTypeId,
    serviceTypeB,
    serviceTypeBlocker,
    customerId: customer.customerId,
    vehicleId: customer.vehicleId,
    durationMinutes: scenario.durationMinutes,
  };
}

async function insertAppointment(
  client: Client,
  args: {
    readonly id: string;
    readonly dealershipId: string;
    readonly customerId: string;
    readonly vehicleId: string;
    readonly serviceTypeId: string;
    readonly technicianId: string;
    readonly bayId: string;
    readonly startsAt: Date;
    readonly endsAt: Date;
  },
): Promise<void> {
  await client.query(
    `insert into appointment
       (id, dealership_id, customer_id, vehicle_id, service_type_id, technician_id, bay_id,
        starts_at, ends_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      args.id,
      args.dealershipId,
      args.customerId,
      args.vehicleId,
      args.serviceTypeId,
      args.technicianId,
      args.bayId,
      args.startsAt.toISOString(),
      args.endsAt.toISOString(),
    ],
  );
}

interface TrialMover {
  readonly race: number;
  readonly side: 'A' | 'B';
  readonly id: string;
  readonly bayId: string;
}

/**
 * Occupy this trial's four rows for every race, at an interval offset so no trial's rows can
 * ever collide with another trial's on the same bay. Returns the movers in barrier order.
 */
async function occupyTrial(
  client: Client,
  races: readonly RaceFixture[],
  trial: number,
): Promise<readonly TrialMover[]> {
  const base = trial * 1440;
  const i = { start: at(base), end: at(base + 60) };
  const j = { start: at(base + 30), end: at(base + 90) };
  const blocker = { start: at(base + 60), end: at(base + 90) };
  const movers: TrialMover[] = [];

  for (const race of races) {
    const aId = uuidFor(race.namespace, `a-t${String(trial)}`);
    const bId = uuidFor(race.namespace, `b-t${String(trial)}`);
    const caId = uuidFor(race.namespace, `ca-t${String(trial)}`);
    const cbId = uuidFor(race.namespace, `cb-t${String(trial)}`);

    await insertAppointment(client, {
      id: aId,
      dealershipId: race.dealershipId,
      customerId: race.customerId,
      vehicleId: race.vehicleId,
      serviceTypeId: race.serviceTypeA,
      technicianId: race.tA,
      bayId: race.bay0,
      startsAt: i.start,
      endsAt: i.end,
    });
    await insertAppointment(client, {
      id: bId,
      dealershipId: race.dealershipId,
      customerId: race.customerId,
      vehicleId: race.vehicleId,
      serviceTypeId: race.serviceTypeB,
      technicianId: race.tB,
      bayId: race.bay1,
      startsAt: i.start,
      endsAt: i.end,
    });
    // CA blocks A's own bay at the target interval, using a technician unqualified for
    // EITHER service type — a bay-axis conflict only, never a technician-axis one.
    const btA = uuidFor(race.namespace, 'technician/blocker-a');
    const btB = uuidFor(race.namespace, 'technician/blocker-b');
    await insertAppointment(client, {
      id: caId,
      dealershipId: race.dealershipId,
      customerId: race.customerId,
      vehicleId: race.vehicleId,
      serviceTypeId: race.serviceTypeBlocker,
      technicianId: btA,
      bayId: race.bay0,
      startsAt: blocker.start,
      endsAt: blocker.end,
    });
    await insertAppointment(client, {
      id: cbId,
      dealershipId: race.dealershipId,
      customerId: race.customerId,
      vehicleId: race.vehicleId,
      serviceTypeId: race.serviceTypeBlocker,
      technicianId: btB,
      bayId: race.bay1,
      startsAt: blocker.start,
      endsAt: blocker.end,
    });

    movers.push({ race: races.indexOf(race), side: 'A', id: aId, bayId: race.bay0 });
    movers.push({ race: races.indexOf(race), side: 'B', id: bId, bayId: race.bay1 });
  }

  return movers;
}

/** This trial's target `startsAt`, matching `occupyTrial`'s `j.start`. */
function targetIso(trial: number): string {
  return isoAt(trial * 1440 + 30);
}

describe('slice 07 — AC-4: racing moves on different incumbent pairs never deadlock', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it(
    `AC-4 — ${String(RACE_COUNT)} independent mutually-vacating pairs over ${String(TRIAL_COUNT)} trials: every attempt gets a database verdict, 23P01 never 40P01, no 500, no overlap, every refused row unchanged`,
    async () => {
      const races: RaceFixture[] = [];
      for (let index = 0; index < RACE_COUNT; index += 1) {
        races.push(await setupRace(client, 'ac4-racing-moves', index));
      }
      const dealershipIds = races.map((r) => r.dealershipId);

      await withService(async (service) => {
        const badAnswers: string[] = [];
        const unchangedViolations: string[] = [];
        let refusedCount = 0;
        let succeededCount = 0;

        for (let trial = 0; trial < TRIAL_COUNT; trial += 1) {
          const movers = await occupyTrial(client, races, trial);
          const before = await snapshotMany(
            client,
            movers.map((m) => m.id),
          );

          // R-07-4: `movers.length` is `RACE_COUNT * 2` and must never exceed `POOL_MAX` —
          // this barrier releases its whole batch AT ONCE (never a queue), so exceeding the
          // pool here is exactly the shape that manufactures a codeless `500` and serialises
          // the simultaneity this criterion measures. An arrangement failure, not a race.
          expect(
            movers.length,
            `ARRANGE — ${String(movers.length)} movers would be released at once against a ` +
              `pool of at most ${String(POOL_MAX)}; RACE_COUNT must shrink.`,
          ).toBeLessThanOrEqual(POOL_MAX);

          const answers = await releaseFromBarrier(movers.length, async (index) => {
            const mover = movers[index] as TrialMover;
            return {
              mover,
              answer: await postReschedule(service, mover.id, targetIso(trial)),
            };
          });

          const after = await snapshotMany(
            client,
            movers.map((m) => m.id),
          );

          for (const { mover, answer } of answers) {
            if (answer.transportFailure !== undefined) {
              badAnswers.push(
                `trial=${String(trial)} race=${String(mover.race)} side=${mover.side} ` +
                  `TRANSPORT FAILURE: ${answer.transportFailure}`,
              );
              continue;
            }
            if (answer.status !== 200 && answer.status !== 409) {
              badAnswers.push(
                `trial=${String(trial)} race=${String(mover.race)} side=${mover.side} -> ` +
                  describeAnswer(answer),
              );
            }
            if (answer.status === 409) {
              refusedCount += 1;
              const b = before.get(mover.id) ?? null;
              const a = after.get(mover.id) ?? null;
              if (a?.xmin !== b?.xmin || a?.ctid !== b?.ctid || a === null || b === null) {
                unchangedViolations.push(
                  `trial=${String(trial)} race=${String(mover.race)} side=${mover.side} id=${mover.id}\n` +
                    `${render('before', b)}\n${render('after', a)}`,
                );
              }
            } else if (answer.status === 200) {
              succeededCount += 1;
            }
          }
        }

        // R-07-11: DRAIN, DON'T SNAPSHOT — a child's stdout reaches this process
        // asynchronously (`service.ts`'s own reason `awaitLogRecords` exists), so a bare
        // `logRecords()` right after the last trial's last answer can still be missing that
        // trial's final lines, including a `reschedule.deadlock` this file most needs to see.
        // `no-spurious-refusal.test.ts` already adopts this convention; this file diverged
        // from it at the red commit with no stated reason, and is brought in line with it here
        // rather than justified as an exception.
        //
        // THE FLOOR IS RACE_COUNT * TRIAL_COUNT * 4, NOT * 2: on a build where neither move
        // ever succeeds nor deadlocks (this file's own structural claim, asserted above and
        // below), every one of the RACE_COUNT * TRIAL_COUNT * 2 attempts owes TWO
        // booking.conflict lines — attempt 1 against its own bay's blocker, attempt 2 against
        // the cross-vacate — so the full drain is RACE_COUNT * TRIAL_COUNT * 4 conflict lines,
        // not the RACE_COUNT * TRIAL_COUNT * 2 the attempt-1 population alone already
        // satisfies. Polling for only * 2 would let the predicate resolve on trial 0-38's
        // attempt-1 lines alone and return before trial 39's attempt-2 or deadlock lines ever
        // arrived — passing the drain call without draining the one trial R-07-11 is about. A
        // build that regresses into deadlocks or successes never reaches * 4 (a deadlocked or
        // successful attempt produces no attempt-2 conflict line), so that case spends the
        // full bound as a passive wait instead — the same trade-off
        // `no-spurious-refusal.test.ts` accepts for its own `expectedRefusals === 0` branch.
        const allRecords = await service.awaitLogRecords(
          (rs) => conflictRecords(rs).length >= RACE_COUNT * TRIAL_COUNT * 4,
          10_000,
        );
        const conflicts = conflictRecords(allRecords);
        const loop = describeLoopLines(allRecords);
        // Computed HERE, ahead of `badAnswers` below, so THAT assertion can report the
        // MEASURED cause of a `500` rather than assume one (R-07-4): ADR-0029's per-path
        // naming means a deadlock on the reschedule path carries no SQLSTATE text on stdout,
        // only this event — so "a 500 happened" and "a 40P01 happened" are two different
        // measurements, and one is not evidence for the other without being read off it.
        const deadlocks = allRecords.filter(
          (r) => r['event'] === 'reschedule.deadlock' || r['msg'] === 'reschedule.deadlock',
        );

        // ── THE POSITIVE WITNESS, FIRST (T-07-2 / T-04-4's principle). Every race is BUILT
        // to force both movers past attempt 1 (see the file header): attempt 1 always fails
        // against its own bay's blocker, so a correct build reaches at least attempt 2 in
        // every one of the RACE_COUNT * TRIAL_COUNT * 2 attempts. Without this, "zero 40P01"
        // below would be true of a fixture where the union-lock code path was never reached.
        const deepestAttempt = Math.max(0, ...conflicts.map((c) => Number(c.attempt)));
        expect(
          deepestAttempt,
          `the positive witness is missing: no booking.conflict line reports attempt >= 2 ` +
            `anywhere across ${String(TRIAL_COUNT)} trials of ${String(RACE_COUNT)} pairs. ` +
            `Every attempt 1 in this fixture is built to fail against its own bay's blocker, ` +
            `so this can only mean the fixture itself is not reaching the code path AC-4 is ` +
            `about, and the assertions below would be evidence about an inert race rather ` +
            `than about ADR-0030.\n${loop}`,
        ).toBeGreaterThanOrEqual(2);
        expect(
          conflicts.length,
          `each of the ${String(RACE_COUNT * TRIAL_COUNT * 2)} attempts across this run must ` +
            `fail at least once (its own bay, blocked by construction), so at least that many ` +
            `booking.conflict lines are owed.`,
        ).toBeGreaterThanOrEqual(RACE_COUNT * TRIAL_COUNT * 2);

        // ── R-07-5: THE POSITIVE WITNESS, SHARPENED. `deepestAttempt >= 2` is a MAXIMUM and
        // `conflicts.length` above a FLOOR over ALL attempts together — both are satisfied by
        // ONE mover reaching attempt 2 and the other 1599 sitting at attempt 1, which is not
        // what the file header claims. The header argues every one of the
        // RACE_COUNT * TRIAL_COUNT * 2 attempts is forced past its own attempt-1 refusal into
        // the mutual cross-vacate at attempt 2 (see "NEITHER MOVE CAN EVER SUCCEED" above),
        // which means at least that many booking.conflict lines must themselves report
        // attempt >= 2 — counted directly, T-07-2's own standard applied to this file rather
        // than inferred from an unrelated max and an unrelated total.
        const deepAttempts = conflicts.filter((c) => Number(c.attempt) >= 2).length;
        expect(
          deepAttempts,
          `every one of the ${String(RACE_COUNT * TRIAL_COUNT * 2)} attempts is forced by ` +
            `construction (file header) past its own attempt-1 refusal into a second ` +
            `candidate, so at least that many booking.conflict lines must report attempt >= 2. ` +
            `Only ${String(deepAttempts)} did — a heterogeneous shortfall a bare max()/floor ` +
            `pair does not catch.\n${loop}`,
        ).toBeGreaterThanOrEqual(RACE_COUNT * TRIAL_COUNT * 2);

        // ── R-07-3: THE STRUCTURAL CLAIM ITSELF, MEASURED — T-07-2's own vacuity standard
        // applied to the file that raised it. The header argues NEITHER MOVE CAN EVER SUCCEED:
        // every one of the RACE_COUNT * TRIAL_COUNT * 2 attempts is refused, never a 200.
        // `succeededCount` was computed above but, until this line, never asserted — a
        // fixture regression (a blocker interval that stopped overlapping, a qualification
        // wired to a second technician) that let some movers succeed at attempt 1 would still
        // pass every assertion in this file: `badAnswers` accepts 200, `unchangedViolations`
        // only inspects 409s, and the remaining movers' extra conflicts keep `conflicts.length`
        // and `deepAttempts` over their floors regardless. Asserting it directly also PINS
        // `refusedCount` at RACE_COUNT * TRIAL_COUNT * 2 by arithmetic, since `badAnswers`
        // below is already required empty (every attempt is 200 or 409).
        expect(
          succeededCount,
          `the fixture is built so neither move in a pair can ever succeed (file header): ` +
            `every attempt must be refused. ${String(succeededCount)} of ` +
            `${String(RACE_COUNT * TRIAL_COUNT * 2)} attempts answered 200, which means at ` +
            `least one mover never entered a contended cross-vacate at all — a fixture defect, ` +
            `not evidence about ADR-0030.`,
        ).toBe(0);

        // ── THE CORE CLAIM. Every attempt receives a database verdict: 200 or 409, never a
        // 500 — which is what an unresolved 40P01 looks like at the edge (arc42 §8.6,
        // ADR-0029). This is the assertion the R-07-4 re-measurement above is about, and it
        // is expected to FAIL at this red commit: ADR-0030 is not built, and the
        // re-measurement at THIS shape found 20/23/13 per 1000 against the unfixed build.
        //
        // R-07-4: the message reports `deadlocks.length` — WHAT WAS MEASURED — rather than
        // naming a cause it did not check. A `500` with zero `reschedule.deadlock` lines is
        // not this criterion's failure mode (D-07-1's pool-saturation fault is out of slice,
        // and the movers.length guard above keeps this fixture under the pool ceiling), and
        // the message says so rather than assuming every `500` is a 40P01.
        expect(
          badAnswers,
          `AC-4 — every attempt must be answered 200 or 409, never anything else (500 above ` +
            `all: an unresolved 40P01 surfacing at the edge). ${String(badAnswers.length)} of ` +
            `${String(RACE_COUNT * TRIAL_COUNT * 2)} attempts violated this; ` +
            `${String(deadlocks.length)} reschedule.deadlock event(s) were logged` +
            (badAnswers.length > 0 && deadlocks.length === 0
              ? ' — NONE, so this run\'s 500s are NOT explained by a measured 40P01 and the ' +
                'cause is something else (see stdout below).'
              : '.') +
            `\n` +
            badAnswers.slice(0, 10).join('\n') +
            (badAnswers.length > 10 ? `\n  … and ${String(badAnswers.length - 10)} more` : ''),
        ).toEqual([]);

        // ── THE SQLSTATE ITSELF, over everything the process wrote — the direct claim
        // ADR-0029/ADR-0030 are about, and a stronger discriminator than the status split
        // above: it would catch a build that maps 40P01 to something other than 500 by
        // accident. MEASURED (this file's own instrumentation): ADR-0029's per-path naming
        // means a deadlock on the reschedule path never carries the literal string "40P01"
        // anywhere in this service's structured output — it is reported as the event
        // `reschedule.deadlock`, with no SQLSTATE text alongside it — so the claim is read
        // off THAT event (computed above, ahead of `badAnswers`), not off a raw substring
        // search that would pass vacuously here.
        expect(
          deadlocks.length,
          `AC-4 — a reschedule.deadlock event was logged (ADR-0029's per-path deadlock name, ` +
            `raised where a move's exclusion check waited on another writer and PostgreSQL ` +
            `broke the cycle with 40P01). ADR-0030's whole argument is that a move past ` +
            `attempt 1 is in flight against the pair it is leaving as well as the pair it is ` +
            `taking, and two such moves can cycle unless both are locked; this fixture forces ` +
            `every one of ${String(RACE_COUNT * TRIAL_COUNT)} pairs into exactly that mutual ` +
            `cross-vacate.\nrefused=${String(refusedCount)} succeeded=${String(succeededCount)} ` +
            `of ${String(RACE_COUNT * TRIAL_COUNT * 2)} attempts\n` +
            deadlocks.slice(0, 5).map((d) => JSON.stringify(d)).join('\n'),
        ).toBe(0);
        // ── EVERY REFUSED MOVE'S ROW IS UNCHANGED, xmin AND ctid INCLUDED — AC-1's claim,
        // repeated here because a racing refusal is a harder case for it than a solitary one.
        expect(
          unchangedViolations,
          `AC-4 — a refused move's row must be byte-identical to before the attempt, xmin and ` +
            `ctid included. ${String(unchangedViolations.length)} violation(s):\n` +
            unchangedViolations.slice(0, 5).join('\n\n'),
        ).toEqual([]);

        // ── NO TWO CONFIRMED ROWS OVERLAP ON A BAY OR A TECHNICIAN. Tautological while the
        // exclusion constraints are intact (CLAUDE.md §2.1 makes the alternative
        // unrepresentable), asserted anyway because it is what AC-4 names and because a
        // build that dropped or narrowed a constraint to chase a deadlock fix would show up
        // here first.
        const { rows: liveRows } = await client.query<{
          bay_id: string;
          technician_id: string;
          starts_at: string;
          ends_at: string;
        }>(
          `select bay_id, technician_id, starts_at, ends_at
             from appointment
            where dealership_id = any($1::uuid[]) and status <> 'cancelled'
            order by bay_id, starts_at`,
          [dealershipIds],
        );
        const overlaps = (column: 'bay_id' | 'technician_id'): string[] => {
          const byResource = new Map<string, { start: number; end: number }[]>();
          for (const row of liveRows) {
            const key = row[column];
            const list = byResource.get(key) ?? [];
            list.push({
              start: new Date(row.starts_at).getTime(),
              end: new Date(row.ends_at).getTime(),
            });
            byResource.set(key, list);
          }
          const bad: string[] = [];
          for (const [key, intervals] of byResource) {
            intervals.sort((a, b) => a.start - b.start);
            for (let k = 1; k < intervals.length; k += 1) {
              const prev = intervals[k - 1] as { start: number; end: number };
              const cur = intervals[k] as { start: number; end: number };
              if (cur.start < prev.end) bad.push(`${column}=${key}`);
            }
          }
          return bad;
        };
        expect(
          [...new Set([...overlaps('bay_id'), ...overlaps('technician_id')])],
          `AC-4 — no two CONFIRMED rows may overlap on the same bay or the same technician.`,
        ).toEqual([]);
      });
    },
    300_000,
  );
});

// ──────────────────────────────────────── AC-5: the lock set is derived from state the ──
// ──────────────────────────────────────── transaction itself observed (ADR-0031) ────────

/**
 * Slice 07 — AC-5, added at step 5 (`R-07-1`, the loopback): a move's advisory lock set must
 * reflect the pair the row *currently* occupies, never a pair read before the transaction
 * opened. `docs/slices/07-reschedule-under-contention.md` AC-5 · `docs/slices/07-design.md`
 * §11 `R-07-1` · ADR-0027, ADR-0030, ADR-0031 · arc42 §5.2, §6.3.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS DETERMINISTIC, NOT A RACE — the architect's own instruction.
 *
 * A probabilistic witness for this rule is the thing ADR-0030 (and now ADR-0031) exists to
 * replace: racing four movers into the exact stale interleaving would be exactly that. This
 * file instead CHOREOGRAPHS the interleaving with two ordinary PostgreSQL locks, so the
 * sequence below happens on every run or the ARRANGE step fails loudly rather than the
 * assertion passing vacuously:
 *
 *   1. `holder` takes A's OWN ROW LOCK (`SELECT … FOR UPDATE`) before the mover is even
 *      issued. A move's PLAIN pre-loop existence read is NEVER blocked by a row lock — MVCC
 *      serves it the last COMMITTED version regardless — so the mover reads A at P1 exactly
 *      as ADR-0027 intends, then blocks the instant it needs A's row for itself: at its own
 *      fresh `FOR UPDATE` read under ADR-0031 (blocks BEFORE `lockResources`), or at the
 *      guarded `UPDATE`'s implicit row lock under the pre-loop-read build (blocks AFTER
 *      `lockResources`, since advisory locks depend on no table state). Either way the
 *      mover is now genuinely parked on `holder`, confirmed by a bounded probe that it has
 *      NOT answered (`within`, below) rather than inferred from a sleep.
 *   2. `holder`, STILL the session holding A's row lock, relocates A itself — from P1 to P2
 *      — and commits. This is the moment ADR-0031's text names: *"relocate the row between
 *      [the pre-loop read] and the attempt."* Only the lock's own holder may write the row
 *      while it is held, which is exactly what makes the ordering deterministic rather than
 *      raced: the mover cannot observe P2 one instant sooner or later than this commit.
 *   3. `blocker` already holds an UNCOMMITTED row at P1 — attempt 1's TARGET, which ADR-0027
 *      pins to "the pair the row already holds" regardless of which build is running and
 *      regardless of the relocation in step 2. Once `holder` releases A, the mover reaches
 *      its own `UPDATE`'s exclusion check against P1 and waits on `blocker`'s uncommitted
 *      row — a second, confirmed park, this time strictly AFTER `lockResources` on EVERY
 *      build (advisory locks never depend on `blocker`'s row). THIS is "in flight between
 *      `lockResources` and its `UPDATE`," and it is where `pg_locks` is read.
 *   4. `pg_locks` is read for exactly four `(classid, objid)` pairs — P1's bay and
 *      technician, P2's bay and technician — computed via the SAME `hashtext` the service
 *      itself uses (`docs/slices/07-design.md` §3), never inferred from a backend pid: since
 *      nothing else in this run takes an advisory lock on these four specific keys, whatever
 *      rows appear are the mover's, full stop.
 *   5. `blocker` releases and the mover is awaited to completion (the release witness —
 *      `cancellation-takes-no-lock.test.ts`'s own three-step shape), so a hung promise is a
 *      test failure rather than a leaked timer.
 *
 * MEASURED against the current build (a throwaway run, this exact construction, `postgres:16`,
 * ADR-0030 applied and ADR-0031 not): the mover parks exactly as predicted at both steps 1
 * and 3, and `pg_locks` shows ONLY P1's two keys — P2's are absent. That is this file's RED:
 * the transaction that is, at that moment, "in flight between `lockResources` and its
 * `UPDATE`" against the row's ACTUAL current pair (P2) holds no lock on it at all.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY ATTEMPT 1, NOT A FORCED RETRY.
 *
 * ADR-0031's own text: *"Attempt 1's take stays existing's pair (ADR-0027, unchanged) …
 * Where the row did move underneath, attempt 1 locks four keys instead of two."* Attempt 1
 * already exercises the discriminating case once the row is relocated between the pre-loop
 * read and the attempt — no candidate shuffle, no second mover, no seed is needed to reach
 * it, which is exactly why a mutant control built from real locks rather than four racing
 * movers is possible at all.
 */

const ADVISORY_BAY_CLASS = 1;
const ADVISORY_TECHNICIAN_CLASS = 2;

const AC5_TIMED_OUT = Symbol('AC-5: still in flight');

/** `work`, or `AC5_TIMED_OUT` if it has not settled within `ms`. Never rejects, never hangs. */
async function ac5Within<T>(ms: number, work: Promise<T>): Promise<T | typeof AC5_TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<typeof AC5_TIMED_OUT>((resolveExpiry) => {
    timer = setTimeout(() => resolveExpiry(AC5_TIMED_OUT), ms);
  });
  try {
    return await Promise.race([work, expiry]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** How long the mover gets to reach each park point before ARRANGE is declared failed. */
const AC5_PARK_PROBE_MS = 2_000;
/** How long the mover gets to resolve once every lock it was waiting on is released. */
const AC5_RELEASE_DEADLINE_MS = 20_000;

describe('slice 07 — AC-5: the lock set is derived from state the transaction itself observed (ADR-0031)', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it(
    'AC-5 — a move relocated between the pre-loop read and the attempt holds advisory locks on the pair the row NOW occupies, not the pair it was read at',
    async () => {
      const scenario = await seedScenario(client, 'ac5-lock-set-reflects-current-pair', {
        bays: 2,
        technicians: 2,
        customers: 1,
        hours: { opensAt: '00:00:00', closesAt: '24:00:00' },
      });
      const where = `\n${describeScenario(scenario)}`;
      const [p1Bay, p2Bay] = scenario.bayIds as readonly [string, string];
      const [p1Tech, p2Tech] = scenario.technicianIds as readonly [string, string];

      // A confirmed at P1 = (p1Bay, p1Tech) @ I.
      const aId = await occupy(client, scenario, {
        label: 'a',
        bayId: p1Bay,
        technicianId: p1Tech,
        startsAt: at(0),
        endsAt: at(60),
      });
      // Attempt 1's TARGET (ADR-0027: "the pair the row already holds") is P1 at the NEW
      // interval J, regardless of build and regardless of the relocation below.
      const targetStart = at(1440);
      const targetEnd = at(1500);

      const holder = new Client({ connectionString: inject('databaseUrl') });
      const blocker = new Client({ connectionString: inject('databaseUrl') });
      await holder.connect();
      await blocker.connect();

      await withService(async (service) => {
        try {
          // ── STEP 3's SETUP (done first; independent of steps 1-2's timing). `blocker`
          // occupies P1 @ J, UNCOMMITTED, so the mover's own UPDATE — whichever build,
          // since ADR-0027's TAKE for attempt 1 is unaffected by ADR-0031 — waits on it.
          await blocker.query('begin');
          await blocker.query(
            `insert into appointment
               (id, dealership_id, customer_id, vehicle_id, service_type_id, technician_id,
                bay_id, starts_at, ends_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              uuidFor(scenario.namespace, 'blocker'),
              scenario.dealershipId,
              scenario.customers[0]?.customerId,
              scenario.customers[0]?.vehicleId,
              scenario.serviceTypeId,
              p1Tech,
              p1Bay,
              targetStart.toISOString(),
              targetEnd.toISOString(),
            ],
          );

          // ── STEP 1. `holder` takes A's own row lock BEFORE the mover is issued.
          await holder.query('begin');
          const held = await holder.query('select id from appointment where id = $1 for update', [
            aId,
          ]);
          expect(held.rowCount, `ARRANGE — holder did not lock A's row.${where}`).toBe(1);

          // ── ISSUE THE MOVER. Its own plain pre-loop read of A is unaffected by `holder`'s
          // row lock (MVCC), so it reads P1 — exactly the value ADR-0031's text calls stale.
          let settled: import('../support/booking.js').HttpAnswer | undefined;
          const moverPromise = postReschedule(service, aId, targetStart.toISOString()).then(
            (answer) => {
              settled = answer;
              return answer;
            },
          );

          const firstProbe = await ac5Within(AC5_PARK_PROBE_MS, moverPromise);
          expect(
            firstProbe === AC5_TIMED_OUT ? 'still in flight' : 'answered',
            `ARRANGE — the mover answered before \`holder\`'s row lock on A was ever released ` +
              `(${firstProbe === AC5_TIMED_OUT ? '' : describeAnswer(settled as never)}). It ` +
              `must park on \`holder\` — either at its own fresh row read (ADR-0031) or at its ` +
              `guarded UPDATE's implicit row lock (the pre-loop-read build) — before this file's ` +
              `choreography means anything.${where}`,
          ).toBe('still in flight');

          // ── STEP 2. RELOCATE A, from the session that HOLDS its row lock, then commit —
          // the moment ADR-0031's own text names: "relocate the row between [the pre-loop
          // read] and the attempt."
          await holder.query('update appointment set bay_id = $1, technician_id = $2 where id = $3', [
            p2Bay,
            p2Tech,
            aId,
          ]);
          await holder.query('commit');

          // ── STEP 3. The mover is now unblocked from `holder` and must park a SECOND time,
          // on `blocker` — either immediately (the pre-loop-read build, which already ran
          // `lockResources` before parking on `holder`) or after its own fresh read and
          // `lockResources` call (ADR-0031). THIS is "in flight between lockResources and
          // its UPDATE" on every build, which is where pg_locks is read next.
          const secondProbe = await ac5Within(AC5_PARK_PROBE_MS, moverPromise);
          expect(
            secondProbe === AC5_TIMED_OUT ? 'still in flight' : 'answered',
            `ARRANGE — the mover answered before \`blocker\`'s uncommitted row at P1 was ever ` +
              `released (${secondProbe === AC5_TIMED_OUT ? '' : describeAnswer(settled as never)}). ` +
              `Attempt 1's target is P1 (ADR-0027) on every build, so it must wait on \`blocker\` ` +
              `here — without this park the pg_locks read below could land before lockResources ` +
              `ever ran.${where}`,
          ).toBe('still in flight');

          // ── STEP 4. THE ASSERTION. Read pg_locks for exactly the four keys this scenario
          // can produce, via the SAME hashtext the service itself uses (design §3).
          const hash = async (value: string): Promise<number> => {
            const { rows } = await client.query<{ h: number }>('select hashtext($1::text) as h', [
              value,
            ]);
            return Number(rows[0]?.h);
          };
          const p1BayHash = await hash(p1Bay);
          const p1TechHash = await hash(p1Tech);
          const p2BayHash = await hash(p2Bay);
          const p2TechHash = await hash(p2Tech);

          const { rows: locks } = await client.query<{
            classid: string;
            objid: string;
            granted: boolean;
          }>(
            `select classid, objid, granted
               from pg_locks
              where locktype = 'advisory' and granted = true
                and classid in ($1, $2)
                and objid in ($3, $4, $5, $6)`,
            [ADVISORY_BAY_CLASS, ADVISORY_TECHNICIAN_CLASS, p1BayHash, p1TechHash, p2BayHash, p2TechHash],
          );
          const holds = (classid: number, objid: number): boolean =>
            locks.some((l) => Number(l.classid) === classid && Number(l.objid) === objid);

          const locksWhere =
            `\n  P1 bay=${p1Bay} (hash ${String(p1BayHash)}) tech=${p1Tech} (hash ${String(p1TechHash)})` +
            `\n  P2 bay=${p2Bay} (hash ${String(p2BayHash)}) tech=${p2Tech} (hash ${String(p2TechHash)})` +
            `\n  granted advisory locks on these keys: ${JSON.stringify(locks)}${where}`;

          // ── THE POSITIVE WITNESS, FIRST (T-07-2 / T-04-4's principle): the harness itself
          // reached the intended state. P1's keys are held on EVERY build — the pre-loop-read
          // build takes them because take=leave=P1 there; ADR-0031 takes them too, because
          // ADR-0027's TAKE for attempt 1 is unaffected by the fix. Their absence means the
          // mover never reached lockResources at all (a fixture defect), not evidence about
          // ADR-0031.
          expect(
            holds(ADVISORY_BAY_CLASS, p1BayHash) && holds(ADVISORY_TECHNICIAN_CLASS, p1TechHash),
            `the positive witness is missing: the mover holds no advisory lock on P1 at all, ` +
              `on EITHER build — the fixture never reached lockResources.${locksWhere}`,
          ).toBe(true);

          // ── THE CLAIM ITSELF. P2 is the pair A ACTUALLY occupies right now (step 2's
          // commit). A transaction whose lock set is "derived from state the transaction
          // itself observed" (AC-5's own words) must hold P2's keys too — ADR-0031's fix
          // takes FOUR keys at attempt 1 exactly when the row moved underneath (its own
          // Decision section). The pre-loop-read build never re-reads, so it never acquires
          // them: this is expected to FAIL at this commit.
          expect(
            holds(ADVISORY_BAY_CLASS, p2BayHash) && holds(ADVISORY_TECHNICIAN_CLASS, p2TechHash),
            `AC-5 — the transaction must hold advisory locks on P2 (${p2Bay} / ${p2Tech}), the ` +
              `pair A's row CURRENTLY occupies (relocated at step 2, under A's own row lock, ` +
              `before the mover's lockResources call could have run against it). It does not: ` +
              `the lock set reflects the STALE pair read before this attempt's transaction ` +
              `opened, not the row's current state — ADR-0031's own subject.${locksWhere}`,
          ).toBe(true);

          // ── STEP 5. RELEASE WITNESS. Without it "in flight" is inferred from a timeout
          // that never resolves, and a mover broken for an unrelated reason reads the same.
          await blocker.query('rollback');
          const finalAnswer = await ac5Within(AC5_RELEASE_DEADLINE_MS, moverPromise);
          expect(
            finalAnswer === AC5_TIMED_OUT ? 'never completed' : 'completed',
            `RELEASE WITNESS — the mover did not complete within ` +
              `${String(AC5_RELEASE_DEADLINE_MS)} ms of \`blocker\`'s row being released, so the ` +
              `park above measured a broken request rather than a blocked one.${where}`,
          ).toBe('completed');
        } finally {
          await holder.query('rollback').catch(() => undefined);
          await blocker.query('rollback').catch(() => undefined);
          await holder.end();
          await blocker.end();
        }
      });
    },
    60_000,
  );
});
