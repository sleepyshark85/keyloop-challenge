import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';

/**
 * AC-1 — "Given a clean checkout on a machine with Docker, when `npm ci && npm test` is
 * run, then a PostgreSQL container starts, the suite connects to it, and the run exits 0."
 *
 * This file asserts the harness contract every later database-invariant test stands on, and
 * it reaches the database ONLY through a connection string — no src/ import — which is the
 * structural boundary docs/slices/00a-design.md §10 sets for `tests/integration/`
 * ownership. It is the test-engineer's on that rule and because it asserts AC-1 itself.
 *
 * The `pgmigrations` case is the seam slice 00 must find waiting for it (§4): globalSetup
 * calls the node-pg-migrate runner UNCONDITIONALLY against the migrations directory ADR-0007
 * names. The table's existence proves the runner ran. Slice 00 then adds `0001_*.sql` and
 * changes no other file — and if it had to add the call, the config AND the schema at once,
 * any failure among them would be ambiguous.
 *
 * ── RETIRED AT SLICE 00, IN PLACE, BECAUSE THE REASONING IS THE POINT ────────────────────
 *
 * This docblock used to continue: *"its emptiness proves zero migrations applied"*, and the
 * case below asserted `count === '0'` under the name *"zero migrations applied"*. That was
 * true at 00a and it was the wrong KIND of assertion for this file to make.
 *
 * A harness test asserts a property of the harness — something true at every commit of every
 * slice. `count === '0'` is a property of the CORPUS, which changes with each migrating
 * slice. It would have gone red at slice 00's green commit, and again at 05, and at every
 * slice after that carrying a migration; each of those reds would arrive in the implementer's
 * commit, in a file the implementer must not edit, tempting exactly the boundary violation
 * `CLAUDE.md` §5 forbids. (`tests/integration/` is not in `guard-paths.mjs`'s `TEST_OWNED`,
 * so the hook would have ALLOWED that edit — a gap in the hook, not permission.)
 *
 * So this case now asserts the seam **ran**, not what it **carried**: `pgmigrations` exists
 * and is reachable. What the seam carried moved to `exclusion-constraints.test.ts` case 0,
 * which asserts the three migration names — a per-slice fact, in the per-slice file, red
 * before the migrations land and green after, which is the correct polarity for it.
 *
 * Retired in place rather than deleted: the record of why an assertion was wrong is worth
 * more than the corrected assertion on its own.
 */
describe('AC-1 — the Testcontainers harness', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('provides a PostgreSQL connection URI to the suite', () => {
    const databaseUrl = inject('databaseUrl');

    expect(databaseUrl, 'globalSetup did not provide("databaseUrl")').toBeTypeOf('string');
    expect(databaseUrl).toMatch(/^postgres(ql)?:\/\//);
  });

  it('connects to the container and answers a query', async () => {
    const { rows } = await client.query<{ one: number }>('select 1 as one');

    expect(rows).toEqual([{ one: 1 }]);
  });

  it('runs PostgreSQL 16, the version arc42 §7.2 names', async () => {
    const { rows } = await client.query<{ server_version: string }>('show server_version');

    expect(rows[0]?.server_version).toMatch(/^16\./);
  });

  it('has run the migration seam: pgmigrations exists and is reachable', async () => {
    // `to_regclass` returns null rather than raising for a missing relation, so this is an
    // assertion about the harness and not an error escaping the case.
    const { rows } = await client.query<{ relation: string | null }>(
      "select to_regclass('public.pgmigrations')::text as relation",
    );

    expect(
      rows[0]?.relation,
      'pgmigrations does not exist, so globalSetup did not call the migration runner at all',
    ).toBe('pgmigrations');

    // Reachable, not merely present in the catalogue. The count's VALUE is deliberately not
    // asserted — see the retirement note above. What the corpus carries is case 0's, in
    // exclusion-constraints.test.ts.
    const { rows: applied } = await client.query<{ count: string }>(
      'select count(*)::text as count from pgmigrations',
    );

    expect(applied[0]?.count, 'pgmigrations exists but cannot be read').toMatch(/^\d+$/);
  });
});
