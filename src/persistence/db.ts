/**
 * The database handle: one `pg.Pool`, one Kysely instance over it, and the `Db` alias
 * every layer above uses to name it.
 *
 * ── Why the alias exists (design §2(b)) ───────────────────────────────────────────────
 * `sql-only-in-persistence` forbids `pg` and `kysely` — including `import type` under
 * `tsPreCompilationDeps: true` — anywhere outside this directory. So `src/application`
 * imports `type { Db }` from here, a plain `src/` edge, and never writes the word
 * `Kysely`. The alias is not sugar; it is what keeps that rule enforceable at the one
 * place it is most likely to be evaded.
 *
 * ── Why the pool must not connect at boot (design §3) ─────────────────────────────────
 * `pg.Pool` is lazy by construction and nothing here may make it eager. A service that
 * verified connectivity at startup could not START against a dead database, and AC-2's
 * 503 case would be untesting a process that had already exited. Configuration fails
 * fast; CONNECTIVITY is only ever probed by `GET /health`.
 *
 * ── Why the 'error' listener is mandatory, not hygiene (design §1) ────────────────────
 * `pg.Pool` emits `'error'` on IDLE clients — a database restart, a dropped connection —
 * and an `EventEmitter` `'error'` with no listener is rethrown, which terminates the
 * process. AC-2 deliberately runs this service against a database that is not there, so
 * this listener is on the AC-2 path rather than being defensive. It swallows, it reports
 * through `src/platform` (a permitted persistence → platform edge), and it never rethrows:
 * connectivity is reported by `/health`, never by a crash.
 */
import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { Logger } from '../platform/logger.js';
import type { Database } from './schema.js';

const { Pool } = pg;

/** The handle. Nothing above `src/persistence` may name anything narrower than this. */
export type Db = Kysely<Database>;

/**
 * A CONSTANT, not an environment variable (design §3). arc42 §7.3's table gains no row;
 * if this ever needs to be tunable that is a deliberate config change and a §7.3 edit.
 * Without a bound, AC-2's unreachable-database case hangs instead of answering 503.
 */
export const CONNECTION_TIMEOUT_MS = 1_000;

export type DbConfig = { readonly databaseUrl: string };

export interface CreateDbOptions {
  /** Where an idle-client error is reported. Absent in unit tests; present in `main.ts`. */
  readonly logger?: Logger;
  /**
   * The pool to build on. Production passes nothing and gets {@link createPool}; the unit
   * test passes one so it can assert that building the handle opened no connection.
   */
  readonly pool?: pg.Pool;
}

/** A pool that has not connected to anything yet, and will not until something asks it to. */
export function createPool(config: DbConfig, logger?: Logger): pg.Pool {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });

  pool.on('error', (error: Error) => {
    logger?.warn({ err: error }, 'idle database client errored; the pool will replace it');
  });

  return pool;
}

export function createDb(config: DbConfig, options: CreateDbOptions = {}): Db {
  const pool = options.pool ?? createPool(config, options.logger);
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

/** Ends the pool. `main.ts` calls this on SIGTERM/SIGINT so a killed process leaks nothing. */
export async function closeDb(db: Db): Promise<void> {
  await db.destroy();
}
