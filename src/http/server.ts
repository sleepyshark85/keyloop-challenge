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
 * ── `setErrorHandler` — AC-8, and it renders through the SAME builder the routes do ──────────
 *
 * A schema violation is answered BEFORE any handler runs, so no `BookOutcome` exists to map: the
 * `400` has to come from here. Measured (design §8, measurement 7): a body failing the RFC 3339
 * pattern gives `400` with `content-type: application/problem+json; charset=utf-8`, the handler
 * never runs, and the rendered body is the problem document. Fastify's validation error is an
 * `FST_ERR_VALIDATION` carrying `statusCode: 400`.
 *
 * It uses `problem()` rather than an object literal, and that is I-02-5 rather than tidiness: an
 * error handler that hand-rolls its own body is a SECOND place the taxonomy is written, and the
 * one place a mistyped `type` would escape the compile-time constructor and reach the client as
 * `FST_ERR_FAILED_ERROR_SERIALIZATION` — the backstop becoming the defect.
 *
 * Everything that is not a validation error is `500 /problems/internal`, logged at error with the
 * cause. §8.6's `500 | Anything else` row is a claim of TOTALITY, and this is where it is kept.
 */
import Fastify from 'fastify';
import type { FastifyBaseLogger, FastifyError, FastifyInstance } from 'fastify';
import { registerHealthRoute } from './routes/health.js';
import type { HealthRouteDeps } from './routes/health.js';
import { registerAppointmentRoutes } from './routes/appointments.js';
import type { AppointmentRouteDeps } from './routes/appointments.js';
import { PROBLEM_CONTENT_TYPE, problem } from './problem.js';

export interface ServerDeps extends HealthRouteDeps, AppointmentRouteDeps {
  readonly logger: FastifyBaseLogger;
}

/** Fastify sets `validation` on a schema failure and nothing else does. */
function isValidationError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as Partial<FastifyError>;
  return candidate.validation !== undefined || candidate.code === 'FST_ERR_VALIDATION';
}

/** The message a validation failure carries, without assuming the error is shaped like one. */
function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : 'the request body or path was not valid';
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ loggerInstance: deps.logger });

  app.setErrorHandler(async (error, request, reply) => {
    if (isValidationError(error)) {
      await reply
        .code(400)
        .type(PROBLEM_CONTENT_TYPE)
        .send(
          problem('/problems/malformed-request', 400, 'The request could not be understood', {
            detail: detailOf(error),
          }),
        );
      return;
    }

    // An escaped exception is a fault, never a refusal — `bookAppointment` rethrows everything
    // `classify` could not name, and this is where it stops. Logged with the cause, because the
    // client is told nothing it could act on.
    request.log.error({ err: error, event: 'request.failed' }, 'unhandled error');
    await reply
      .code(500)
      .type(PROBLEM_CONTENT_TYPE)
      .send(
        problem('/problems/internal', 500, 'The request could not be completed', {
          detail: 'the service could not complete this request; the failure has been logged',
        }),
      );
  });

  registerHealthRoute(app, deps);
  registerAppointmentRoutes(app, deps);

  return app;
}
