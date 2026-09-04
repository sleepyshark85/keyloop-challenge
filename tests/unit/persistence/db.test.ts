import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONNECTION_TIMEOUT_MS,
  closeDb,
  createDb,
  createPool,
} from '../../../src/persistence/db.js';

/**
 * Two properties are pinned here, and both are load-bearing for AC-2 rather than being
 * unit-test hygiene. Prose in a design document cannot fail; these can.
 *
 *   1. Building the handle opens NO connection. design §3 forbids an eager connect at
 *      boot precisely so the service can START against a database that is not there —
 *      which is the only reason AC-2's 503 case is testable at all. If someone later adds
 *      a `SELECT 1` "to fail fast", `totalCount` stops being 0 and this fails.
 *
 *   2. An idle-client error does not reach the process. `pg.Pool` emits 'error' on idle
 *      clients, and an EventEmitter 'error' with no listener is RETHROWN — it kills the
 *      process. A service that dies when its database restarts cannot report `database:
 *      down`, so this listener is on the AC-2 path.
 *
 * The URL below is well-formed and certain not to answer: port 1 is reserved. Nothing in
 * this file talks to a database, which is why it lives in the `nodb` Vitest project.
 */
const UNREACHABLE = { databaseUrl: 'postgresql://keyloop:keyloop@127.0.0.1:1/keyloop' };

const pools: Array<{ end(): Promise<void> }> = [];
function track<T extends { end(): Promise<void> }>(pool: T): T {
  pools.push(pool);
  return pool;
}

afterEach(async () => {
  await Promise.all(pools.splice(0).map(async (pool) => pool.end()));
});

describe('createDb', () => {
  it('opens no connection — the pool is still empty once the handle exists', async () => {
    const pool = track(createPool(UNREACHABLE));

    const db = createDb(UNREACHABLE, { pool });

    expect(db).toBeDefined();
    expect(pool.totalCount, 'createDb connected eagerly; AC-2 503 case is now untestable').toBe(
      0,
    );
    expect(pool.idleCount).toBe(0);
    expect(pool.waitingCount).toBe(0);
  });

  it('builds its own pool when none is injected', () => {
    const db = createDb(UNREACHABLE);
    expect(db).toBeDefined();
    void closeDb(db);
  });
});

describe('createPool', () => {
  it('bounds the connection attempt, so an unreachable database fails rather than hangs', () => {
    const pool = track(createPool(UNREACHABLE));

    expect(CONNECTION_TIMEOUT_MS).toBe(1_000);
    expect(pool.options.connectionTimeoutMillis).toBe(CONNECTION_TIMEOUT_MS);
  });

  it('swallows an idle-client error instead of letting it terminate the process', () => {
    const pool = track(createPool(UNREACHABLE));

    expect(pool.listenerCount('error'), 'no listener means the error is rethrown').toBeGreaterThan(
      0,
    );
    expect(() => pool.emit('error', new Error('connection terminated unexpectedly'))).not.toThrow();
  });

  it('reports the idle-client error through the logger when one is supplied', () => {
    const warn = vi.fn();
    const logger = { warn } as unknown as Parameters<typeof createPool>[1];
    const pool = track(createPool(UNREACHABLE, logger));

    pool.emit('error', new Error('connection terminated unexpectedly'));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[1]).toMatch(/idle database client/);
  });

  it('tolerates having no logger at all', () => {
    const pool = track(createPool(UNREACHABLE));
    expect(() => pool.emit('error', new Error('boom'))).not.toThrow();
  });
});
