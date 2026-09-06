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
 * Everything that is not a malformed request is `500 /problems/internal`, logged at error with
 * the cause. §8.6's `500 | Anything else` row is a claim of TOTALITY, and this is where it is
 * kept — AC-5 is that claim being kept rather than assumed.
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

/**
 * Fastify populates `validation` on a schema failure and on nothing else, so ONE test decides
 * which of the two arms below runs.
 *
 * It was two — `validation !== undefined || code === 'FST_ERR_VALIDATION'` — and the second half
 * was removed after the mutation run: no input reaches it, because Fastify sets both together, so
 * it was an unkillable alternative rather than a belt to the braces. A condition no test can
 * distinguish is not a safety margin.
 */
function isValidationError(error: FastifyError): boolean {
  return error.validation !== undefined;
}

/**
 * AC-5 — the two Fastify content-type-parser errors, NAMED, because §8.6 has a row for them and
 * it was not the one they were reaching.
 *
 * Measured three times independently on the pinned `fastify@5.12.1`: a `POST` carrying
 * `content-type: application/json` with no body raises `FST_ERR_CTP_EMPTY_JSON_BODY`, and with an
 * unparseable body `FST_ERR_CTP_INVALID_JSON_BODY`. Both carry `statusCode: 400`; NEITHER sets
 * `validation`. So both missed the arm above and fell to the catch-all — `500 /problems/internal`,
 * live on the already-merged booking route. §8.6 justifies its `500` row with *"a 4xx would tell a
 * service advisor to correct something they did not send and cannot see"*, and here the client
 * sent exactly that, can see it, and can correct it. The row was inverted, not missing: this maps
 * to the `/problems/malformed-request` that already exists, and the taxonomy gains nothing.
 *
 * BY CODE, NEVER BY `statusCode < 500`. The comment above this one records a broader disjunction
 * being deleted after mutation because no input reached its second arm; widening this one would
 * be that mistake with a worse consequence. Fastify's other 4xx errors — a media type, an
 * unrouted path — have no §8.6 row, and widening a predicate until the taxonomy has to grow to
 * meet it is the tail wagging the dog.
 *
 * The parser runs BEFORE the router, measured: a malformed body addressed to a path that is not
 * registered raises this too. So this arm is not per-route and cannot be, which is also why
 * `POST /appointments/{id}/cancellation` — a route that reads no body — is answered by it.
 *
 * OQ-05-2, deferred to slice 10 and pinned at `400` meanwhile: a correct client that sets
 * `application/json` reflexively on a bodyless request is now told to fix something the endpoint
 * never reads. The alternative is a content-type parser mapping an empty body to `undefined`,
 * which lands with the cURL harness that is the real client emitting the header.
 */
const MALFORMED_BODY_CODES: ReadonlySet<string> = new Set([
  'FST_ERR_CTP_EMPTY_JSON_BODY',
  'FST_ERR_CTP_INVALID_JSON_BODY',
]);

function isMalformedBody(error: FastifyError): boolean {
  return MALFORMED_BODY_CODES.has(error.code);
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ loggerInstance: deps.logger });

  app.setErrorHandler<FastifyError>(async (error, request, reply) => {
    if (isValidationError(error) || isMalformedBody(error)) {
      await reply
        .code(400)
        .type(PROBLEM_CONTENT_TYPE)
        .send(
          problem('/problems/malformed-request', 400, 'The request could not be understood', {
            detail: error.message,
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
