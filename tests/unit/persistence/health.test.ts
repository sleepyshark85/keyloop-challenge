import { describe, expect, it } from 'vitest';
import { pingDatabase } from '../../../src/persistence/health.js';
import { reachableDb, refusingDb, unconnectableDb } from '../helpers/stub-db.js';

/**
 * No database here — this file is in the `nodb` Vitest project. The real `select 1` against
 * a real postgres:16 is AC-1's job (tests/integration) and AC-2's (tests/acceptance); what
 * is asserted here is the CONTAINMENT, which no integration test can show: that a driver
 * error becomes a `false` and never escapes as a value.
 */
describe('pingDatabase', () => {
  it('issues `select 1` and returns true when the database answers', async () => {
    const { db, recorded } = reachableDb();

    await expect(pingDatabase(db)).resolves.toBe(true);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.sql).toBe('select 1');
    expect(recorded[0]?.parameters).toEqual([]);
  });

  it('returns false rather than rethrowing when the query fails', async () => {
    await expect(pingDatabase(refusingDb())).resolves.toBe(false);
  });

  it('returns false when a connection cannot even be acquired', async () => {
    await expect(pingDatabase(unconnectableDb())).resolves.toBe(false);
  });

  it('lets no driver value escape — the failure is a boolean, not an error object', async () => {
    const outcome: unknown = await pingDatabase(refusingDb()).catch((error: unknown) => error);

    expect(typeof outcome).toBe('boolean');
    expect(outcome).not.toBeInstanceOf(Error);
  });
});
