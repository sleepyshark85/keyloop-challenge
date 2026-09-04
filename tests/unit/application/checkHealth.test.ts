import { describe, expect, it } from 'vitest';
import { checkHealth } from '../../../src/application/checkHealth.js';
import type { HealthOutcome } from '../../../src/application/checkHealth.js';
import { reachableDb, refusingDb, unconnectableDb } from '../helpers/stub-db.js';

/**
 * The use case turns a boolean into an OUTCOME, and the outcome is what the edge switches
 * on. Two things are worth asserting beyond the mapping itself.
 *
 * The degraded outcome carries a `reason`. A bare `{ kind: 'degraded' }` would answer 503
 * just as well today and would have nothing to say when slice 09 wants to know which
 * dependency was down — the reason is what keeps the union extensible without the edge
 * having to grow a second signal.
 *
 * And nothing about `pg`, SQLSTATE or a connection appears in the returned value. That is
 * the property `src/http` depends on: the route decides a status code without ever
 * touching a driver concept.
 */
describe('checkHealth', () => {
  it('is ok when the database answers', async () => {
    const { db, recorded } = reachableDb();

    await expect(checkHealth(db)).resolves.toEqual({ kind: 'ok' });
    expect(recorded[0]?.sql).toBe('select 1');
  });

  it('is degraded, with a reason, when the query fails', async () => {
    await expect(checkHealth(refusingDb())).resolves.toEqual({
      kind: 'degraded',
      reason: 'database-unreachable',
    });
  });

  it('is degraded when the database cannot be connected to at all', async () => {
    await expect(checkHealth(unconnectableDb())).resolves.toEqual({
      kind: 'degraded',
      reason: 'database-unreachable',
    });
  });

  it('resolves rather than rejecting, so the route never needs a try/catch', async () => {
    const outcome: unknown = await checkHealth(refusingDb()).catch((error: unknown) => error);

    expect(outcome).not.toBeInstanceOf(Error);
  });

  it('carries no driver detail into the outcome', async () => {
    const outcome = await checkHealth(refusingDb());

    expect(JSON.stringify(outcome)).not.toMatch(/ECONNREFUSED|postgres|pg|sql/i);
  });

  it('has exactly the two members the route switches over', async () => {
    const outcomes: HealthOutcome[] = [
      await checkHealth(reachableDb().db),
      await checkHealth(refusingDb()),
    ];

    expect(outcomes.map((outcome) => outcome.kind)).toEqual(['ok', 'degraded']);
  });
});
