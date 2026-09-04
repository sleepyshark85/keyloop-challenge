import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONNECTION_TIMEOUT_MS,
  closeDb,
  createDb,
  createPool,
} from '../../../src/persistence/db.js';
import { pingDatabase } from '../../../src/persistence/health.js';

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

const pools: Array<{ end(): Promise<void>; ended: boolean }> = [];
function track<T extends { end(): Promise<void>; ended: boolean }>(pool: T): T {
  pools.push(pool);
  return pool;
}

afterEach(async () => {
  // `ended` is checked because some of these tests close the pool THROUGH `closeDb`, which
  // is the behaviour under test; pg throws on a second end().
  await Promise.all(pools.splice(0).map(async (pool) => (pool.ended ? undefined : pool.end())));
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

  it('builds a USABLE pool when none is injected', async () => {
    // `expect(db).toBeDefined()` was the old assertion and it was worthless: Kysely is
    // constructed happily around a missing pool, so `options.pool ?? createPool(...)`
    // could become `&&` — handing the dialect `undefined` — and still produce an object.
    // Closing it is what proves a pool was built: destroy() reaches through to pool.end().
    const db = createDb(UNREACHABLE);

    await expect(closeDb(db)).resolves.toBeUndefined();
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
    // The ERROR itself has to reach the log, not just a sentence saying one happened.
    // pino renders `err` specially; a report that drops it tells an operator that
    // something went wrong and nothing about what.
    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      err: expect.objectContaining({ message: 'connection terminated unexpectedly' }),
    });
  });

  it('tolerates having no logger at all', () => {
    const pool = track(createPool(UNREACHABLE));
    expect(() => pool.emit('error', new Error('boom'))).not.toThrow();
  });
});

/**
 * `main.ts` calls this on SIGTERM and SIGINT, and the acceptance harness spawns and kills
 * the service twice per run with a five-second SIGKILL behind it. A `closeDb` that resolves
 * without releasing anything looks identical to one that works — until a leaked pool keeps
 * the process alive past the kill and an unrelated failure becomes a hung suite.
 *
 * The handle is USED first, deliberately. Kysely creates its driver lazily, so a handle
 * that never ran a query has no pool to end and `destroy()` is correctly a no-op — which
 * means asserting on a never-used handle would assert nothing. The lifecycle that matters
 * is the one the service has: it answered `/health` at least once, then got a signal.
 */
describe('closeDb', () => {
  it('ends the pool the handle was actually using', async () => {
    const pool = track(createPool(UNREACHABLE));
    const db = createDb(UNREACHABLE, { pool });

    // Fails — nothing listens on port 1 — but it initialises the driver, which is what
    // gives `destroy()` a pool to release. This also pins that the INJECTED pool is the
    // one used: build a second pool instead and this one is never ended.
    await expect(pingDatabase(db)).resolves.toBe(false);
    expect(pool.ended).toBe(false);

    await closeDb(db);

    expect(pool.ended, 'closeDb resolved without ending the pool it had been using').toBe(true);
  });

  it('leaves the pool unusable afterwards, so a late acquisition fails loudly', async () => {
    const pool = track(createPool(UNREACHABLE));
    const db = createDb(UNREACHABLE, { pool });
    await pingDatabase(db);
    await closeDb(db);

    await expect(pool.connect()).rejects.toThrow(/after calling end/i);
  });
});
