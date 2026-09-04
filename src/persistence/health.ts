/**
 * The only frame in the process that sees a driver error.
 *
 * `pingDatabase` catches EVERYTHING and returns a boolean. That is not defensive coding,
 * it is the containment `sql-only-in-persistence` exists to provide and cannot itself
 * enforce: a `pg` error object propagating upward would be a `pg` VALUE inside a layer
 * that may not import `pg`, and dependency-cruiser cannot see it, because it is a value
 * and not an import. So the rule is stated here, in the one place where it is checkable
 * by reading a `catch` (docs/slices/00a-design.md §1).
 *
 * The bound on how long it may take to say `false` is `CONNECTION_TIMEOUT_MS` in `db.ts`.
 * Without it, AC-2's unreachable-database case hangs instead of returning 503.
 */
import { sql } from 'kysely';
import type { Db } from './db.js';

/** `true` if the database answered, `false` for every other outcome. Never rejects. */
export async function pingDatabase(db: Db): Promise<boolean> {
  try {
    await sql`select 1`.execute(db);
    return true;
  } catch {
    // Deliberately swallowed and deliberately not logged here: the caller decides what an
    // unreachable database means, and `/health` reports it. See application/checkHealth.ts.
    return false;
  }
}
