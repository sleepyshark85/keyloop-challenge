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

/**
 * Slice 02 — a `Db` whose driver answers a SCRIPT of results, recording the compiled SQL.
 *
 * It exists for one reason: the repositories in this slice make decisions ABOUT rows — a day
 * with no `opening_hours` row is a closed day, two `exists` flags choose between three ownership
 * verdicts, a `23P01` picks the next candidate — and those decisions are code, not persistence
 * invariants. `CLAUDE.md` §2.2 is not bent: every claim about what PostgreSQL DOES lives in
 * `tests/integration/` and `tests/concurrency/` against a real container, written by the
 * test-engineer. What is asserted here is the SQL that would be sent and what the caller does
 * with what comes back.
 *
 * The production compiler, adapter and introspector are kept — only the driver is replaced — so
 * `recorded[i].sql` is the text postgres would actually receive.
 */
export interface ScriptedStep {
  /** Rows this query resolves with. */
  readonly rows?: readonly unknown[];
  /** Or the error it rejects with — a `pg`-shaped one, for the SQLSTATE paths. */
  readonly error?: unknown;
}

function scripted(steps: readonly ScriptedStep[], recorded: CompiledQuery[]): DatabaseConnection {
  let index = 0;
  return {
    async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
      recorded.push(compiledQuery);
      const step = steps[index];
      index += 1;
      if (step === undefined) {
        // Deliberately loud. A repository issuing MORE queries than the script anticipated is
        // exactly the defect these tests exist to catch — AC-5 is a claim about how many
        // statements a booking attempt makes.
        throw new Error(
          `unscripted query #${String(index)}: ${compiledQuery.sql}`,
        );
      }
      if (step.error !== undefined) throw step.error;
      return { rows: (step.rows ?? []) as R[] };
    },
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error('nothing under test streams');
    },
  };
}

/**
 * A database that answers `steps` in order.
 *
 * `recorded` accumulates every compiled query the caller issued. `begin`, `commit` and `rollback`
 * are NOT among them: kysely raises those through the driver's own hooks rather than as queries,
 * so they are collected separately in `events`. That separation is what lets a test assert
 * AC-5's shape directly — "one transaction containing exactly one INSERT, preceded only by the
 * two advisory-lock acquisitions" is a claim about both lists at once.
 */
export function scriptedDb(steps: readonly ScriptedStep[]): {
  db: Db;
  recorded: CompiledQuery[];
  events: string[];
} {
  const recorded: CompiledQuery[] = [];
  const events: string[] = [];
  const connection = scripted(steps, recorded);

  class RecordingDriver extends StubDriver {
    override async beginTransaction(): Promise<void> {
      events.push('begin');
    }
    override async commitTransaction(): Promise<void> {
      events.push('commit');
    }
    override async rollbackTransaction(): Promise<void> {
      events.push('rollback');
    }
  }

  return { db: build(new RecordingDriver(connection)), recorded, events };
}
