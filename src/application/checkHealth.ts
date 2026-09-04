/**
 * The health use case, and the first instance of arc42 §5.2's *outcomes, not exceptions*
 * convention.
 *
 * `HealthOutcome` is a discriminated union rather than a thrown error or a bare boolean,
 * and it is declared HERE rather than in `src/http` for two reasons. The route can then
 * decide the status code with a `switch` the compiler checks for exhaustiveness — two
 * members today, which is the point of doing it now rather than when there are seven. And
 * `application-must-not-reach-http` means a use case is callable without a server, so the
 * outcome has to be expressible without a status code attached to it.
 *
 * ADR-0008 removed the repository port deliberately, so the seam a reader looks for at
 * `application → persistence` is not here: `pingDatabase` is imported by name and the
 * handle is a parameter. That is the decision made concrete — the socket a port would
 * offer is the socket an in-memory check-then-act implementation would plug into, and
 * `CLAUDE.md` §2.1 says there is not going to be one.
 */
import type { Db } from '../persistence/db.js';
import { pingDatabase } from '../persistence/health.js';

export type HealthOutcome =
  | { readonly kind: 'ok' }
  | { readonly kind: 'degraded'; readonly reason: 'database-unreachable' };

export async function checkHealth(db: Db): Promise<HealthOutcome> {
  const reachable = await pingDatabase(db);

  return reachable ? { kind: 'ok' } : { kind: 'degraded', reason: 'database-unreachable' };
}
