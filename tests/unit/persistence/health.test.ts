import { describe, expect, it } from 'vitest';
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
import { pingDatabase } from '../../../src/persistence/health.js';
import type { Db } from '../../../src/persistence/db.js';

/**
 * No database here — this file is in the `nodb` Vitest project. The real `select 1` against
 * a real postgres:16 is AC-1's job (tests/integration) and AC-2's (tests/acceptance); what
 * is asserted here is the CONTAINMENT, which no integration test can show: that a driver
 * error becomes a `false` and never escapes as a value.
 *
 * The dialect below is the production one with its driver replaced, so the query still goes
 * through Kysely's real compiler and executor and the assertion about the SQL issued is an
 * assertion about what postgres would receive.
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

function dbWith(driver: Driver, recorded: CompiledQuery[] = []): { db: Db; recorded: CompiledQuery[] } {
  const dialect: Dialect = {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => driver,
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  };
  return { db: new Kysely({ dialect }) as Db, recorded };
}

function answering(recorded: CompiledQuery[]): DatabaseConnection {
  return {
    async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
      recorded.push(compiledQuery);
      return { rows: [{ '?column?': 1 }] as R[] };
    },
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error('pingDatabase must not stream');
    },
  };
}

function refusing(message: string): DatabaseConnection {
  return {
    async executeQuery<R>(): Promise<QueryResult<R>> {
      throw Object.assign(new Error(message), { code: 'ECONNREFUSED', severity: 'FATAL' });
    },
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error('pingDatabase must not stream');
    },
  };
}

describe('pingDatabase', () => {
  it('issues `select 1` and returns true when the database answers', async () => {
    const recorded: CompiledQuery[] = [];
    const { db } = dbWith(new StubDriver(answering(recorded)));

    await expect(pingDatabase(db)).resolves.toBe(true);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.sql).toBe('select 1');
    expect(recorded[0]?.parameters).toEqual([]);
  });

  it('returns false rather than rethrowing when the query fails', async () => {
    const { db } = dbWith(new StubDriver(refusing('connection refused')));

    await expect(pingDatabase(db)).resolves.toBe(false);
  });

  it('returns false when a connection cannot even be acquired', async () => {
    const explode = (): never => {
      throw Object.assign(new Error('timeout exceeded when trying to connect'), {
        code: 'ETIMEDOUT',
      });
    };
    const { db } = dbWith(new StubDriver(answering([]), explode));

    await expect(pingDatabase(db)).resolves.toBe(false);
  });

  it('lets no driver value escape — the failure is a boolean, not an error object', async () => {
    const { db } = dbWith(new StubDriver(refusing('connection refused')));

    const outcome: unknown = await pingDatabase(db).catch((error: unknown) => error);

    expect(typeof outcome).toBe('boolean');
    expect(outcome).not.toBeInstanceOf(Error);
  });
});
