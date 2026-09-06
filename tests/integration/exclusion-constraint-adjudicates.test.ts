import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client, Pool } from 'pg';
import { runner } from 'node-pg-migrate';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { at, describeScenario, seedScenario, uuidNamespaceOf } from '../support/booking.js';
import type { Scenario } from '../support/booking.js';

/**
 * §4.4 of `docs/slices/02-design.md` — the DDL-drop negative control.
 *
 * `CLAUDE.md` §2.1 (NON-NEGOTIABLE), §2.4, §5 · arc42 §8.2 · QS-1.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS FOR, AND WHY IT IS THE STRONGEST EVIDENCE IN THE SLICE.
 *
 * Every other test in slice 02 asserts that the SYSTEM does not double-book. None of them
 * says WHICH PART of the system prevented it: a check-then-act booking path would pass QS-1
 * and QS-2 too, because the constraint would still adjudicate the write behind it (design
 * §4's uncomfortable observation — you cannot detect check-then-act from behaviour, only
 * from the source tree, which is why AC-5 is a scan).
 *
 * This case answers it by REMOVING the mechanism and watching the property break:
 *
 *   with `no_bay_overlap`      twenty simultaneous inserts into one bay -> ONE row
 *   without it                 the same twenty inserts                  -> TWENTY rows
 *   with it restored           the same twenty inserts                  -> ONE row again
 *   without it, but with ADR-0018's two advisory locks held per insert  -> TWENTY rows
 *
 * The inserting code is byte-identical in all four phases — phase 4 wraps it, it does not
 * rewrite it. That converts §2.1 from "we wrote it this way" into "we removed the thing and
 * watched it break", which is the standard §2.4 sets for tests and which the design had not
 * applied to the invariant itself. The fourth line is R-02-2 and is separately argued at the
 * phase itself: it is the one line that says the LOCK is not a substitute for the constraint.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY IT RUNS IN A DATABASE OF ITS OWN, AND NOT IN A ROLLED-BACK TRANSACTION.
 *
 * §4.4 proposed "drop the constraint inside a transaction, race, roll back". Measured and
 * rejected: `ALTER TABLE … DROP CONSTRAINT` takes an ACCESS EXCLUSIVE lock held until commit,
 * so the twenty racing sessions BLOCK on the lock instead of racing — the case would deadlock
 * against its own premise rather than observe several rows.
 *
 * The remedy keeps everything the proposal was for and changes only the isolation: a scratch
 * database, built by running THE REAL MIGRATION CORPUS (ADR-0007) with the same
 * `node-pg-migrate` call `tests/setup/postgres.ts` uses. So `no_bay_overlap` here is the
 * migration's own constraint, asserted by name and by `pg_get_constraintdef` before it is
 * touched — not a hand-transcribed copy. Nothing else in the run can see this database, so
 * a DDL change inside it cannot race another test file, which a drop against the shared
 * database emphatically could (Vitest parallelises files).
 *
 * The constraint is restored from the definition PostgreSQL itself printed, so phase 3
 * cannot pass because the test rebuilt a weaker constraint from memory.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHOSE FILE THIS IS, AND WHAT IT LOOKS LIKE AT THE RED COMMIT.
 *
 * `CLAUDE.md` §5: a `tests/integration/` test asserting a DATABASE INVARIANT is the
 * test-engineer's. It imports no `src/` module and reaches the database through a connection
 * string only.
 *
 * It is GREEN at the red commit, and deliberately so — like AC-18, it is a negative control
 * over a mechanism that already exists. It asserts nothing about `src/`, which is precisely
 * what makes it evidence about the constraint rather than about the code around it.
 */

const CONTROL_DATABASE = 'keyloop_ddl_control';
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MIGRATIONS_DIR = join(REPO_ROOT, 'src', 'persistence', 'migrations');
const RACERS = 20;

/**
 * ADR-0018's Decision, HAND-TRANSCRIBED. A `tests/integration/` file may not import `src/`,
 * so these are copied from the ADR and not from `appointmentRepository.ts`; the divergence
 * that copying admits is what the positive control in phase 4 exists to catch.
 *
 *   SELECT pg_advisory_xact_lock(c, k)
 *   FROM unnest(ARRAY[1,2], ARRAY[hashtext($bay), hashtext($technician)]) AS t(c, k);
 *
 * Class 1 is bays and class 2 technicians — disjoint key spaces — and bay-then-technician is
 * a total order no attempt can take in reverse.
 */
const BAY_LOCK_CLASS = 1;
const TECHNICIAN_LOCK_CLASS = 2;
const LOCK_BOTH = `select pg_advisory_xact_lock(c, k)
     from unnest(array[$1::int, $2::int], array[hashtext($3::text), hashtext($4::text)]) as t(c, k)`;

/** How long phase 4 watches a blocked race before believing it is blocked. */
const BLOCKED_PROBE_MS = 2_000;
/** And how long it allows the released race to finish before calling it broken rather than slow. */
const RELEASE_DEADLINE_MS = 30_000;
const TIMED_OUT = Symbol('timed out');

async function within<T>(ms: number, work: Promise<T>): Promise<T | typeof TIMED_OUT> {
  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([work, expiry]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function controlUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${CONTROL_DATABASE}`;
  return url.toString();
}

interface RaceResult {
  readonly confirmed: number;
  readonly sqlstates: readonly string[];
  readonly constraints: readonly string[];
  /**
   * The largest number of racers that were inside the INSERT at the same instant. Measured in
   * every phase, asserted only in phase 4, where `1` is the claim that the twenty were
   * SERIALISED rather than merely slow. Sampled around the insert alone in both modes, so the
   * number means the same thing whether or not locks are held.
   */
  readonly maxInFlight: number;
  /** Barrier to last verdict. Phase 4 uses phase 2's value to size its probe window. */
  readonly elapsedMs: number;
}

/**
 * Twenty pooled sessions insert into the SAME bay over the SAME interval, each with its own
 * technician, released together. Distinct technicians on purpose: `no_technician_overlap`
 * must not be what serialises them, or phase 2 would still report one row and the control
 * would prove nothing.
 */
async function race(
  pool: Pool,
  scenario: Scenario,
  label: string,
  offsetMinutes: number,
  options: { readonly locks?: boolean } = {},
): Promise<RaceResult> {
  const locks = options.locks === true;
  let inFlight = 0;
  let maxInFlight = 0;
  const startsAt = at(offsetMinutes).toISOString();
  const endsAt = at(offsetMinutes + 60).toISOString();

  let open = (): void => {};
  const gate = new Promise<void>((resolveGate) => {
    open = () => resolveGate();
  });
  let parked = 0;
  let allParked = (): void => {};
  const everyoneParked = new Promise<void>((resolveParked) => {
    allParked = () => resolveParked();
  });

  const attempts = Array.from({ length: RACERS }, async (_unused, index) => {
    const client = await pool.connect();
    parked += 1;
    if (parked === RACERS) allParked();
    await gate;
    try {
      // ADR-0018's two locks, or nothing at all. The INSERT below is byte-identical either
      // way: `locks` may only ADD a transaction and the lock statement in front of it, never
      // change the write, or phase 4 would be comparing two different inserts.
      if (locks) {
        await client.query('begin');
        await client.query(LOCK_BOTH, [
          BAY_LOCK_CLASS,
          TECHNICIAN_LOCK_CLASS,
          scenario.bayIds[0],
          scenario.technicianIds[index],
        ]);
      }
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        await client.query(
          `insert into appointment
           (id, dealership_id, customer_id, vehicle_id, service_type_id, technician_id, bay_id, starts_at, ends_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            uuidNamespaceOf(scenario, `${label}/${String(index)}`),
            scenario.dealershipId,
            scenario.customers[index]?.customerId,
            scenario.customers[index]?.vehicleId,
            scenario.serviceTypeId,
            scenario.technicianIds[index],
            scenario.bayIds[0],
            startsAt,
            endsAt,
          ],
        );
      } finally {
        inFlight -= 1;
      }
      // The locks are `pg_advisory_xact_lock`, so this COMMIT is also what releases them.
      if (locks) await client.query('commit');
      return { ok: true as const };
    } catch (error) {
      if (locks) await client.query('rollback').catch(() => undefined);
      const e = error as { code?: string; constraint?: string };
      return { ok: false as const, code: e.code ?? '(no code)', constraint: e.constraint ?? '(none)' };
    } finally {
      client.release();
    }
  });

  await everyoneParked;
  const started = Date.now();
  open();
  const outcomes = await Promise.all(attempts);

  return {
    confirmed: outcomes.filter((o) => o.ok).length,
    sqlstates: outcomes.filter((o) => !o.ok).map((o) => (o.ok ? '' : o.code)),
    constraints: outcomes.filter((o) => !o.ok).map((o) => (o.ok ? '' : o.constraint)),
    maxInFlight,
    elapsedMs: Date.now() - started,
  };
}

/**
 * Live rows in the one bay overlapping the race window at `offsetMinutes`. COMMITTED rows
 * only, read from a session outside the race — which is what lets phase 4 use it both as a
 * result (twenty landed) and as a liveness probe (none has landed yet).
 */
async function overlappingRows(
  client: Client,
  scenario: Scenario,
  offsetMinutes: number,
): Promise<number> {
  const { rows } = await client.query<{ count: string }>(
    `select count(*) as count from appointment
      where bay_id = $1 and status <> 'cancelled'
        and tstzrange(starts_at, ends_at) && tstzrange($2, $3)`,
    [scenario.bayIds[0], at(offsetMinutes).toISOString(), at(offsetMinutes + 60).toISOString()],
  );
  return Number(rows[0]?.count ?? -1);
}

/** One row, inserted with no concurrency. Returns 'inserted' or the SQLSTATE. */
async function occupyDirect(
  client: Client,
  scenario: Scenario,
  label: string,
  offsetMinutes: number,
): Promise<string> {
  const result = await insertOverlapping(client, scenario, label, offsetMinutes);
  return result.code === 'OK' ? 'inserted' : `${result.code} ${result.constraint}`;
}

async function insertOverlapping(
  client: Client,
  scenario: Scenario,
  label: string,
  offsetMinutes: number,
): Promise<{ code: string; constraint: string }> {
  try {
    await client.query(
      `insert into appointment
         (id, dealership_id, customer_id, vehicle_id, service_type_id, technician_id, bay_id, starts_at, ends_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        uuidNamespaceOf(scenario, label),
        scenario.dealershipId,
        scenario.customers[0]?.customerId,
        scenario.customers[0]?.vehicleId,
        scenario.serviceTypeId,
        // A DIFFERENT technician from the seed row, so `no_technician_overlap` cannot be what
        // refuses the probe and the constraint name below is forced by the fixture.
        label.endsWith('seed') ? scenario.technicianIds[0] : scenario.technicianIds[1],
        scenario.bayIds[0],
        at(offsetMinutes).toISOString(),
        at(offsetMinutes + 60).toISOString(),
      ],
    );
    return { code: 'OK', constraint: '(none)' };
  } catch (error) {
    const e = error as { code?: string; constraint?: string };
    return { code: e.code ?? '(no code)', constraint: e.constraint ?? '(none)' };
  }
}

describe('§4.4 — the exclusion constraint is what adjudicates, shown by removing it', () => {
  let admin: Client;
  let control: Client;
  let pool: Pool;
  /** Phase 4's lock holder. A session of its own: the lock must outlive a single statement. */
  let holder: Client;

  // CONNECT AND NOTHING ELSE (slice 00's rule 1). Every statement that could fail because of
  // the schema runs inside the `it()` body, so this file's failures are assertions.
  beforeAll(async () => {
    admin = new Client({ connectionString: inject('databaseUrl') });
    await admin.connect();
  });

  afterAll(async () => {
    await holder?.end();
    await pool?.end();
    await control?.end();
    await admin?.end();
  });

  it('with the constraint one row survives, without it twenty do, and with it restored one does again', async () => {
    // ── the scratch database, from the real migration corpus ────────────────────────────
    await admin.query(`drop database if exists ${CONTROL_DATABASE} with (force)`);
    await admin.query(`create database ${CONTROL_DATABASE}`);

    const url = controlUrl(inject('databaseUrl'));
    await runner({
      databaseUrl: url,
      dir: MIGRATIONS_DIR,
      direction: 'up',
      migrationsTable: 'pgmigrations',
      log: () => {},
    });

    control = new Client({ connectionString: url });
    await control.connect();
    pool = new Pool({ connectionString: url, max: RACERS });

    // The constraint under test IS the migration's, named and defined by PostgreSQL rather
    // than transcribed here — and the definition is captured now so phase 3 can restore
    // exactly it.
    const { rows: before } = await control.query<{ def: string }>(
      `select pg_get_constraintdef(c.oid) as def
         from pg_constraint c join pg_class t on t.oid = c.conrelid
        where t.relname = 'appointment' and c.conname = 'no_bay_overlap'`,
    );
    const definition = before[0]?.def;
    expect(
      definition,
      'no_bay_overlap does not exist in the scratch database — the migration corpus did not ' +
        'build the schema this control is about, and nothing below means anything',
    ).toMatch(/^EXCLUDE USING gist \(bay_id WITH =, tstzrange\(starts_at, ends_at\) WITH &&\)/);

    const scenario = await seedScenario(control, 'ddl-control', {
      bays: 1,
      technicians: RACERS,
      customers: RACERS,
    });
    const fixture = describeScenario(scenario);

    // ── phase 0: the constraint's NAME, pinned without a race ────────────────────────────
    //
    // Measured at step 3 and recorded as finding T-02-9: under N-way SIMULTANEOUS contention
    // on one exclusion range, PostgreSQL refuses the losers with EITHER `23P01`
    // (exclusion_violation) OR `40P01` (deadlock_detected), all-or-nothing per race, in
    // roughly one race in three at every N from 2 to 20. `check_exclusion_constraint` inserts
    // the index tuple and THEN scans for conflicts, so simultaneous inserters wait on each
    // other's in-progress tuples and form a cycle.
    //
    // Exactly one row survives either way — §2.1 is untouched, and that is what phases 1 to 3
    // are about. But the constraint NAME is only reported on the `23P01` path, so asserting it
    // from a race would make this file's evidence a coin toss. It is pinned here instead,
    // sequentially, where the second inserter finds a COMMITTED conflicting row and cannot
    // wait on anything.
    const seedRow = await occupyDirect(control, scenario, 'phase0-seed', -240);
    expect(seedRow, 'the sequential probe row must exist before the overlapping insert').toBe(
      'inserted',
    );
    const sequential = await insertOverlapping(control, scenario, 'phase0-probe', -240);
    expect(
      `${sequential.code} ${sequential.constraint}`,
      'a second appointment overlapping the same bay, inserted with no concurrency, is refused ' +
        'by name. This is the fact AC-3 asserts through the service.',
    ).toBe('23P01 no_bay_overlap');

    // ── phase 1: the constraint is present ───────────────────────────────────────────────
    const withConstraint = await race(pool, scenario, 'phase1', 0);
    expect(
      withConstraint.confirmed,
      `with no_bay_overlap in place, exactly one of ${String(RACERS)} simultaneous inserts ` +
        `into one bay may survive.\nsqlstates: ${JSON.stringify(withConstraint.sqlstates)}\n${fixture}`,
    ).toBe(1);
    expect(
      [...new Set(withConstraint.sqlstates)].sort().filter((c) => c !== '23P01' && c !== '40P01'),
      'every loser must be refused BY THE DATABASE. `23P01` is the exclusion violation and ' +
        '`40P01` is the deadlock the exclusion check itself creates under simultaneous ' +
        'contention (T-02-9) — both are the constraint adjudicating, and neither is the ' +
        'application deciding. Any other SQLSTATE, or none, is.',
    ).toEqual([]);

    // ── phase 2: the SAME inserts, with the constraint removed ───────────────────────────
    await control.query('alter table appointment drop constraint no_bay_overlap');
    const withoutConstraint = await race(pool, scenario, 'phase2', 120);
    expect(
      withoutConstraint.confirmed,
      `THE HEADLINE CLAIM. With no_bay_overlap dropped and the inserting code byte-identical, ` +
        `all ${String(RACERS)} overlapping appointments land in the same bay. If this is 1, ` +
        `something OTHER than the constraint is serialising these writes and every "no double ` +
        `booking" assertion in this slice is evidence about that other thing instead.\n` +
        `sqlstates: ${JSON.stringify(withoutConstraint.sqlstates)}\n${fixture}`,
    ).toBe(RACERS);

    expect(
      await overlappingRows(control, scenario, 120),
      'and the table really does hold them — the double booking is representable the moment ' +
        'the constraint is not there',
    ).toBe(RACERS);

    // ── phase 4: the constraint is STILL gone, and now the locks are held ────────────────
    //
    // R-02-2. Numbered 4 because it is the fourth cell of ADR-0018's control table; RUN here,
    // before phase 3, because it needs the constraint PHASE 2 DROPPED and phase 3 puts it
    // back.
    //
    //                        constraint present            constraint dropped
    //     locks off          phases 1 and 3 -> 1 row       phase 2 -> 20 rows
    //     locks on           tests/concurrency/ -> 1 row   ** THIS ** -> 20 rows
    //
    // Three cells were measured. The fourth was ARGUED — ADR-0018's Decision says *"drop the
    // constraints and the lock lets twenty overlapping rows through: it prevents nothing"* —
    // and until this phase no file under `tests/` combined a `pg_advisory` call with a
    // dropped exclusion constraint at all.
    //
    // WHAT IT PROVES THAT PHASE 2 DOES NOT, which is the only reason it is worth a second
    // race over the same dropped constraint. Phase 2's twenty rows are equally consistent
    // with a reading nobody has closed: that the overlap follows from the writes being
    // UNSERIALISED, so mutual exclusion over the bay would have prevented it and §2.1's
    // constraint is belt and braces. That is the belief which reintroduces check-then-act,
    // and ADR-0018's own Consequences name it — under a per-resource lock check-then-act
    // becomes *"correct, not merely harmless"*. Phase 4 gives the racers perfect mutual
    // exclusion over precisely the bay and the same twenty rows land, one at a time, with not
    // one refusal. Serialisation is not the property: the lock buys liveness, and only the
    // constraint makes overlap unrepresentable.

    // THE POSITIVE CONTROL, and phase 4 is worth nothing without it. If the class constants
    // or the key derivation are wrong the racers take two locks nobody contends for,
    // serialise against nothing, and land twenty rows ANYWAY — passing for phase 2's reason
    // while claiming phase 4's, self-confirming in the one direction that matters. The
    // hand-transcription warned about at `LOCK_BOTH` is exactly how that happens.
    //
    // So a second session takes the BAY lock first — class 1, `hashtext(bay)` — and holds it
    // in an open transaction. Only the bay is needed: the racers take bay THEN technician, so
    // blocking on the bay blocks all twenty. While it is held, not one racer may commit.
    expect(
      withoutConstraint.elapsedMs * 5,
      `ARRANGE — the probe window is not long enough to discriminate. The same twenty ` +
        `inserts took ${String(withoutConstraint.elapsedMs)} ms unlocked in phase 2, so ` +
        `"nothing committed within ${String(BLOCKED_PROBE_MS)} ms" no longer means blocked. ` +
        `Raise BLOCKED_PROBE_MS rather than weakening the assertion.`,
    ).toBeLessThanOrEqual(BLOCKED_PROBE_MS);

    holder = new Client({ connectionString: url });
    await holder.connect();
    await holder.query('begin');
    const held = await holder.query('select pg_advisory_xact_lock($1, hashtext($2::text))', [
      BAY_LOCK_CLASS,
      scenario.bayIds[0],
    ]);
    expect(held.rowCount, 'ARRANGE — the holder session did not take the bay lock at all').toBe(1);

    let settled: RaceResult | undefined;
    const locked = race(pool, scenario, 'phase4', 360, { locks: true }).then((result) => {
      settled = result;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, BLOCKED_PROBE_MS));

    expect(
      settled === undefined ? 'still racing' : 'finished',
      `CONTROL — the locked race FINISHED while another session held ` +
        `pg_advisory_xact_lock(1, hashtext(bay)). The locks these racers take are therefore ` +
        `not ADR-0018's — a different class constant, a different key derivation, or no lock ` +
        `reached the server — and the twenty rows below would be phase 2 repeated rather ` +
        `than evidence about the lock.\n  ${JSON.stringify(settled)}\n${fixture}`,
    ).toBe('still racing');
    expect(
      await overlappingRows(control, scenario, 360),
      'CONTROL — a racer COMMITTED while the bay lock was held elsewhere, so the racers are ' +
        'not serialised on the bay and phase 4 proves nothing about the lock',
    ).toBe(0);

    // THE RELEASE WITNESS. Without it "blocked" is inferred from a timeout, and a race broken
    // for an unrelated reason reads exactly the same.
    await holder.query('rollback');
    const released = await within(RELEASE_DEADLINE_MS, locked);
    expect(
      released === TIMED_OUT ? 'never finished' : 'finished',
      `RELEASE WITNESS — the race did not finish within ${String(RELEASE_DEADLINE_MS)} ms of ` +
        `the bay lock being released, so the assertions above measured a broken race rather ` +
        `than a blocked one.${fixture}`,
    ).toBe('finished');
    const withLocks = released as RaceResult;

    // And the other half of the control: the twenty serialised against EACH OTHER, not merely
    // against the holder. `maxInFlight` is the most racers ever inside the INSERT at once,
    // sampled identically in every phase — phase 2's value is printed in the message below as
    // the unlocked comparison it is measured against.
    expect(
      withLocks.maxInFlight,
      `CONTROL — ADR-0018's locks did not serialise the racers: up to ` +
        `${String(withLocks.maxInFlight)} of them were inside the INSERT simultaneously ` +
        `(phase 2, unlocked: ${String(withoutConstraint.maxInFlight)}). The rows below would ` +
        `then be overlap from concurrency, which is phase 2's claim and not this one.`,
    ).toBe(1);

    expect(
      withLocks.confirmed,
      `THE FOURTH CELL. Twenty inserts, PERFECTLY SERIALISED by ADR-0018's own two locks, ` +
        `into one bay over one interval with no_bay_overlap dropped — and all ${String(RACERS)} ` +
        `were accepted. The lock cannot replace the constraint.\n` +
        `sqlstates: ${JSON.stringify(withLocks.sqlstates)}\n${fixture}`,
    ).toBe(RACERS);
    expect(
      [...new Set(withLocks.sqlstates)],
      'and not one racer was refused — no 23P01 to refuse it and, because the locks impose a ' +
        'total order, no 40P01 either. The deadlocks phase 1 sees are what ADR-0018 buys off; ' +
        'the overlap is what it does not.',
    ).toEqual([]);
    expect(
      await overlappingRows(control, scenario, 360),
      'and the table holds all twenty — the double booking is representable under the lock ' +
        'exactly as it is without it',
    ).toBe(RACERS);

    // ── phase 3: restored, from the definition PostgreSQL printed ────────────────────────
    await control.query(`delete from appointment`);
    await control.query(`alter table appointment add constraint no_bay_overlap ${definition ?? ''}`);
    const restored = await race(pool, scenario, 'phase3', 240);
    expect(
      restored.confirmed,
      `restoring the constraint restores the invariant — which is what makes phase 2 evidence ` +
        `about no_bay_overlap and not about some other difference between the two runs.\n` +
        `sqlstates: ${JSON.stringify(restored.sqlstates)}\n${fixture}`,
    ).toBe(1);
    expect(
      [...new Set(restored.sqlstates)].sort().filter((c) => c !== '23P01' && c !== '40P01'),
      'and the losers are refused by the database again — see phase 1 on why both SQLSTATEs count',
    ).toEqual([]);
  });
});
