/**
 * The Fastify edge.
 *
 * `buildServer` takes ALREADY-BOUND use cases and never a database handle. That is not a
 * preference: `http-must-not-reach-persistence` forbids `src/http → src/persistence`, and
 * under `tsPreCompilationDeps: true` that includes `import type { Db }`, while
 * `sql-only-in-persistence` forbids `import type { Kysely }` outside persistence. So this
 * layer CANNOT NAME the handle's type — not `Kysely`, not `Db`.
 *
 * A generic parameter would evade that by declining to name it
 * (`interface GenericDeps<TDb> { db: TDb; … }` compiles and cruises clean), which is why
 * the honest claim is "the ruleset forecloses every shape that names the handle" rather
 * than "partial application is the only shape left". It buys nothing: the edge would hold
 * a value it cannot use, cannot type and must not touch. Partial application is the shape
 * taken, and from slice 02 onward `ServerDeps` is a record of bound use cases and nothing
 * else. (docs/slices/00a-design.md §2.)
 *
 * `logger` is typed `FastifyBaseLogger`, not pino's `Logger`. Fastify 5 specialises
 * `FastifyInstance` on whatever is passed as `loggerInstance`, so a pino `Logger` here
 * makes the declared return type unassignable. `main.ts` still passes the pino instance,
 * which satisfies it structurally.
 *
 * No `setErrorHandler` yet: `problem+json` and its taxonomy arrive with slice 03, and an
 * error handler with nothing to render is the first item in a junk drawer.
 */
import Fastify from 'fastify';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { registerHealthRoute } from './routes/health.js';
import type { HealthRouteDeps } from './routes/health.js';

export interface ServerDeps extends HealthRouteDeps {
  readonly logger: FastifyBaseLogger;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ loggerInstance: deps.logger });

  registerHealthRoute(app, deps);

  return app;
}
