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
 *
 * The inserting code is byte-identical in all three phases. That converts §2.1 from "we
 * wrote it this way" into "we removed the thing and watched it break", which is the standard
 * §2.4 sets for tests and which the design had not applied to the invariant itself.
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

function controlUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${CONTROL_DATABASE}`;
  return url.toString();
}

interface RaceResult {
  readonly confirmed: number;
  readonly sqlstates: readonly string[];
  readonly constraints: readonly string[];
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
): Promise<RaceResult> {
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
      return { ok: true as const };
    } catch (error) {
      const e = error as { code?: string; constraint?: string };
      return { ok: false as const, code: e.code ?? '(no code)', constraint: e.constraint ?? '(none)' };
    } finally {
      client.release();
    }
  });

  await everyoneParked;
  open();
  const outcomes = await Promise.all(attempts);

  return {
    confirmed: outcomes.filter((o) => o.ok).length,
    sqlstates: outcomes.filter((o) => !o.ok).map((o) => (o.ok ? '' : o.code)),
    constraints: outcomes.filter((o) => !o.ok).map((o) => (o.ok ? '' : o.constraint)),
  };
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

  // CONNECT AND NOTHING ELSE (slice 00's rule 1). Every statement that could fail because of
  // the schema runs inside the `it()` body, so this file's failures are assertions.
  beforeAll(async () => {
    admin = new Client({ connectionString: inject('databaseUrl') });
    await admin.connect();
  });

  afterAll(async () => {
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

    const { rows: overlapping } = await control.query<{ count: string }>(
      `select count(*) as count from appointment
        where bay_id = $1 and status <> 'cancelled'
          and tstzrange(starts_at, ends_at) && tstzrange($2, $3)`,
      [scenario.bayIds[0], at(120).toISOString(), at(180).toISOString()],
    );
    expect(
      Number(overlapping[0]?.count ?? 0),
      'and the table really does hold them — the double booking is representable the moment ' +
        'the constraint is not there',
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
