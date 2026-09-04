import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import type {
  CompiledQuery,
  DatabaseConnection,
  Dialect,
  Driver,
  QueryResult,
} from 'kysely';
import type { Db } from '../../../src/persistence/db.js';

/**
 * A `Db` with the production dialect's compiler, introspector and adapter, and only its
 * DRIVER replaced.
 *
 * Unit-test scaffolding, and only for tests that assert something about the code around
 * the database rather than about the database itself. `CLAUDE.md` §2.2 is not bent here:
 * nothing in `tests/unit/` asserts a persistence invariant — those live in
 * `tests/integration/` and run against a real postgres:16 — and a stub driver is how a
 * unit test reaches a `catch` block that a reachable database would never enter.
 *
 * Keeping the real compiler matters: the SQL these tests observe is the SQL postgres would
 * receive, so an assertion on it is not an assertion about a mock.
 *
 * `tests/unit/` legitimately imports `src/` (CLAUDE.md §5) and is deliberately outside
 * `outside-in-tests-do-not-import-src`.
 */

class StubDriver implements Driver {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly onAcquire?: () => never,
  ) {}
  async init(): Promise<void> {}
  async acquireConnection(): Promise<DatabaseConnection> {
    this.onAcquire?.();
    return this.connection;
  }
  async beginTransaction(): Promise<void> {}
  async commitTransaction(): Promise<void> {}
  async rollbackTransaction(): Promise<void> {}
  async releaseConnection(): Promise<void> {}
  async destroy(): Promise<void> {}
}

function build(driver: Driver): Db {
  const dialect: Dialect = {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => driver,
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  };
  return new Kysely({ dialect }) as Db;
}

function answering(recorded: CompiledQuery[]): DatabaseConnection {
  return {
    async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
      recorded.push(compiledQuery);
      return { rows: [{ '?column?': 1 }] as R[] };
    },
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error('nothing under test streams');
    },
  };
}

function refusing(message: string): DatabaseConnection {
  return {
    async executeQuery<R>(): Promise<QueryResult<R>> {
      throw Object.assign(new Error(message), { code: 'ECONNREFUSED', severity: 'FATAL' });
    },
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error('nothing under test streams');
    },
  };
}

/** A database that answers every query. `recorded` accumulates the compiled SQL. */
export function reachableDb(): { db: Db; recorded: CompiledQuery[] } {
  const recorded: CompiledQuery[] = [];
  return { db: build(new StubDriver(answering(recorded))), recorded };
}

/** A database whose queries fail the way a dead server's do. */
export function refusingDb(message = 'connection refused'): Db {
  return build(new StubDriver(refusing(message)));
}

/** A database that cannot even be connected to — `connectionTimeoutMillis` elapsed. */
export function unconnectableDb(): Db {
  const explode = (): never => {
    throw Object.assign(new Error('timeout exceeded when trying to connect'), {
      code: 'ETIMEDOUT',
    });
  };
  return build(new StubDriver(answering([]), explode));
}
