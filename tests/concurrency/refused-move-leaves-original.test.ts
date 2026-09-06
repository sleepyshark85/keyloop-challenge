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
 * `P = 20` independent pairs (distinct dealerships, so no pair's resources can interact with
 * another's), released together from ONE barrier, over `TRIAL_COUNT` trials — at least the
 * AC's floor of 25, matching ADR-0030's own measurement scale (20 x 25 x 2 = 1000) so this
 * file's counts are comparable in KIND to the 117/1000 the architect measured (see the
 * false-pass analysis below for why the RATE is not the same, and why `TRIAL_COUNT` is set
 * higher). Each dealership is seeded ONCE and reused across every trial; each trial's four
 * rows sit at an interval offset by
 * `trial * 1440` minutes (whole days) so no trial's rows can ever collide with another's on
 * the same bay, and so every trial lands at the SAME local wall-clock time on a different
 * calendar day — never spanning local midnight, which is refused independently of the
 * opening-hours window itself (slice 13). Opening hours are additionally set to the whole
 * day (`00:00:00`-`24:00:00`) so the window itself can never be the reason a target is
 * refused — this file is about contention, not GC-1.
 *
 * ── THE FALSE-PASS ARITHMETIC THIS FILE'S "NEVER 40P01" ASSERTION RESTS ON ──────────────
 *
 * The architect's own measurement — 117 `40P01` per 1000 contended attempts, 11.7% — is on a
 * DIFFERENT fixture (`docs/adr/0030-...md`'s own, not this one), and it does not transfer
 * uncritically: this fixture forces every attempt 1 to fail first, which costs an extra
 * round trip before the two movers' contended attempt 2 statements are in flight together,
 * and that changes how often their timing actually aligns into a cycle. MEASURED on this
 * file's own fixture against the unfixed build, six throwaway runs: three at RACE_COUNT x 25
 * trials (1000 attempts each — 6, 5, 5 `40P01`) and three at RACE_COUNT x 40 trials (1600
 * attempts each — 13, 4, 8). 41 `40P01` in 7800 attempts total, roughly 0.5% — an order of
 * magnitude below the architect's own number and worth recording rather than assuming.
 *
 * R-07-6: 0.5% IS A POINT ESTIMATE OF AN UNKNOWN RATE `p`, NOT `p` ITSELF, and `p` is
 * machine-dependent — unmeasured on whatever machine actually runs this file in CI — so the
 * false-pass arithmetic below must carry that uncertainty rather than treat 41/7800 as exact.
 * A 95% binomial confidence interval on 41/7800 is roughly 0.27%-0.80%, not a single number.
 *
 * Modelled as independent Bernoulli draws at each bound (a simplification — the two attempts
 * of one pair are not independent of each other, but the pairs are): at the POINT ESTIMATE
 * (0.5%), a single run of RACE_COUNT x 25 trials (1000 attempts) observes ZERO deadlocks by
 * chance alone with probability (1 - 0.005)^1000, on the order of 0.67% — small, but not the
 * negligible figure the architect's own 11.7% would suggest. `TRIAL_COUNT` is therefore set
 * to 40, not 25 (the AC's floor is "≥ 25"): at 1000 -> 1600 attempts, the same point-estimate
 * arithmetic gives (1 - 0.005)^1600, on the order of 0.034%.
 *
 * THAT 0.034% IS ALSO A POINT ESTIMATE, and reporting it alone overstates confidence. At the
 * LOWER bound of the interval (0.27%) — the bound that matters, since a lower `p` is what
 * makes a silent false pass MORE likely, not less — `(1 - 0.0027)^1600` is on the order of
 * 1.3%: 38x worse than the 0.034% headline, and worse than the 0.67% the raise from 25 to 40
 * trials was made to fix in the first place. The raise is still the right call: at that same
 * lower bound, 25 trials gives `(1 - 0.0027)^1000` on the order of 6.7%, so going to 40 trials
 * still cuts the worst-case false-pass risk roughly 5x even though it falls well short of the
 * 0.034% the point estimate implied. State the interval, not the point. It is still not
 * zero, and a single green run is still not proof on its own; it is the same standard
 * `no-spurious-refusal.test.ts` applies to its own absence assertions (T-04-4): a positive
 * witness (attempt >= 2 for both movers of a pair, forced by construction here rather than
 * merely likely) must be on the record before the absence of `40P01` is trusted as evidence
 * about ADR-0030 rather than about a race that never bit.
 */

const RACE_COUNT = 20;
/**
 * ADR-0030's own measurement used 25 trials (20 x 25 x 2 = 1000). Empirically, THIS fixture's
 * observed deadlock rate under the built (target-only) lock is lower than the 11.7% the
 * architect measured on their own fixture — a point estimate of 0.5% per attempt over six
 * throwaway runs (41 `40P01` in 7800 attempts; 95% CI roughly 0.27%-0.80%, see the false-pass
 * analysis below). 40 trials is kept as the floor here rather than 25 for exactly the reason
 * stated there: it is still >= the AC's "≥ 25", and it materially reduces the false-pass
 * probability at both the point estimate and the interval's lower bound, even though it does
 * not reach the headline point-estimate figure once that uncertainty is carried through.
 */
const TRIAL_COUNT = 40;

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
        // rather than justified as an exception. The predicate waits for the `conflicts.length`
        // floor asserted below (RACE_COUNT * TRIAL_COUNT * 2) — a bound a correct OR a
        // defective build both owe, unlike `deadlocks.length`, which a correct build must hold
        // at zero and so can never be the thing polled for.
        const allRecords = await service.awaitLogRecords(
          (rs) => conflictRecords(rs).length >= RACE_COUNT * TRIAL_COUNT * 2,
          10_000,
        );
        const conflicts = conflictRecords(allRecords);
        const loop = describeLoopLines(allRecords);

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
        // ADR-0029). This is the assertion the false-pass arithmetic in the file header is
        // about, and it is expected to FAIL at this red commit: ADR-0030 is not built, and
        // the architect measured the unfixed shape at 117 40P01 per 1000 contended attempts.
        expect(
          badAnswers,
          `AC-4 — every attempt must be answered 200 or 409, never anything else (500 above ` +
            `all: an unresolved 40P01 surfacing at the edge). ${String(badAnswers.length)} of ` +
            `${String(RACE_COUNT * TRIAL_COUNT * 2)} attempts violated this.\n` +
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
        // off THAT event, not off a raw substring search that would pass vacuously here.
        const deadlocks = allRecords.filter(
          (r) => r['event'] === 'reschedule.deadlock' || r['msg'] === 'reschedule.deadlock',
        );
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
