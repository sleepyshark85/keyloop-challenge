import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { runner } from 'node-pg-migrate';
import type { TestProject } from 'vitest/node';

/**
 * globalSetup for the `db` project — docs/slices/00a-design.md §4, arc42 §7.2.
 *
 * ONE container per run, not per file: the concurrency tests of slice 07 need several real
 * pooled connections against one instance, and per-file containers would multiply startup
 * cost by the file count for no isolation benefit. Isolation is by data, never by
 * truncation — truncating between tests serialises the suite and makes the concurrency
 * tests race the cleanup rather than each other. In 00a there is no data at all, so the
 * rule is stated and unexercised; the seeding helpers arrive with slice 00's schema.
 *
 * `withReuse()` is deliberately NOT used. It depends on `testcontainers.reuse.enable` in
 * the developer's own ~/.testcontainers.properties, leaves state between runs, and makes a
 * suite behave differently on its second invocation than its first. A run whose result
 * depends on whether a previous run happened is not evidence. The cost is a few seconds of
 * container start per `npm test`; accepted.
 *
 * This file may not import src/ — `outside-in-tests-do-not-import-src` covers tests/setup/
 * precisely so that a globalSetup cannot launder an implementation detail into an
 * outside-in test through `provide()`. Seeding, when it arrives, goes through raw SQL.
 */

declare module 'vitest' {
  export interface ProvidedContext {
    /** Connection URI of the per-run PostgreSQL container. */
    databaseUrl: string;
  }
}

/**
 * The seam slice 00 must find waiting for it (§4).
 *
 * The migration runner is called UNCONDITIONALLY against the directory ADR-0007 names, with
 * the same package `npm run db:migrate` uses. Today it applies zero migrations and creates
 * `pgmigrations`; slice 00 drops `0001_*.sql` in and changes no other file.
 *
 * The `mkdirSync` is not defensive coding. At the red commit `src/persistence/migrations/`
 * cannot exist — the test-engineer is denied every write under src/ and the implementer's
 * commits all come later — so without it the runner throws ENOENT, globalSetup aborts and
 * NO test runs at all. That would turn this commit's evidence from a set of assertion
 * failures into a setup crash, which is "red for the wrong reason" in the most literal
 * sense, and since the `test` job runs on the red commit the crash would be the observation
 * itself. The property that matters is preserved: the runner is always called; only the
 * directory's existence is guaranteed rather than assumed.
 */
const MIGRATIONS_DIR = 'src/persistence/migrations';

let container: StartedPostgreSqlContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:16').start();
  const databaseUrl = container.getConnectionUri();

  const dir = resolve(project.vitest.config.root, MIGRATIONS_DIR);
  mkdirSync(dir, { recursive: true });

  await runner({
    databaseUrl,
    dir,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });

  // Typed provide/inject rather than ambient process.env: AC-2's second case needs a
  // service pointed at a deliberately UNREACHABLE database in the same run, and ambient
  // inheritance makes that awkward and invisible at the call site. The acceptance harness
  // passes DATABASE_URL into the spawned process explicitly.
  project.provide('databaseUrl', databaseUrl);
}

export async function teardown(): Promise<void> {
  await container?.stop();
  container = undefined;
}
