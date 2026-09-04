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
 * calls the node-pg-migrate runner UNCONDITIONALLY against `src/persistence/migrations`,
 * which today holds nothing. The table's existence proves the runner ran; its emptiness
 * proves zero migrations applied. Slice 00 then adds `0001_*.sql` and changes no other
 * file — and if it had to add the call, the config AND the schema at once, any failure
 * among them would be ambiguous.
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

  it('has run the migration seam: pgmigrations exists and zero migrations applied', async () => {
    const { rows } = await client.query<{ count: string }>(
      'select count(*)::text as count from pgmigrations',
    );

    expect(rows[0]?.count, 'slice 00a applies no migrations').toBe('0');
  });
});
