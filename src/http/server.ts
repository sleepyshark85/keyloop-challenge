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
 * Everything that reaches this handler and is not a malformed request is `500 /problems/internal`,
 * logged at error with the cause.
 *
 * ── `setNotFoundHandler` — ADR-0024, and the CORRECTION this docblock owed §8.6 ───────────────
 *
 * §8.6's `500 | Anything else` row is a claim of TOTALITY, and an earlier version of this
 * paragraph said `setErrorHandler` was where it was kept. Measured at slice 06 step 1, against
 * merged code, and it was FALSE: a genuinely unmatched route — `GET /nope` — never reaches
 * `setErrorHandler` at all. Fastify answers it itself, by default, with `404 application/json`
 * and no `type`, before this handler is ever consulted — the one response in the whole service
 * that was outside the taxonomy `tests/contract/error-taxonomy.test.ts` asserts totality over.
 *
 * `setNotFoundHandler` is the second handler totality is kept in, and it renders through the
 * SAME `problem()` constructor for I-02-5's reason: `404 /problems/route-not-found`, RFC 9457,
 * indistinguishable in media type from a domain `404` — which is why the discriminator a client
 * (and `tests/acceptance/cancel-appointment.test.ts`) must read is the `type`, not the content
 * type, once this handler exists.
 *
 * ── AC-6b — AN EMPTY BODY MAPS TO `undefined`, THROUGH TYPEBOX, NOT THROUGH A SPECIAL CASE ──────
 *
 * `docs/slices/09-observability.md` AC-6b: the cURL harness sets `content-type: application/json`
 * reflexively on every `POST` (AC-10), so Fastify's OWN default JSON parser turning an empty body
 * into `FST_ERR_CTP_EMPTY_JSON_BODY` would fire on the harness's happy path against a route that
 * reads no body — `POST /appointments/{id}/cancellation`. The fix replaces the DEFAULT parser for
 * `application/json` with one that maps a zero-length body to `undefined` and otherwise behaves
 * identically (an unparseable body still raises `FST_ERR_CTP_INVALID_JSON_BODY`, still mapped to
 * `400` by `isMalformedBody` below — the regression control in `tests/acceptance/
 * empty-body-content-type.test.ts`). What happens to that `undefined` from there is TypeBox's
 * job, never a branch in this file or in a handler: a route with no `body` schema (cancellation)
 * never looks at `request.body` at all, so `undefined` is inert; a route WITH one (booking,
 * reschedule) fails validation against it exactly as it would against any other missing required
 * property, landing on the SAME `400 /problems/malformed-request` an empty body already produced
 * there. §8.6's declared owner for "is this body acceptable" stays TypeBox in every case.
 *
 * ── `@fastify/swagger` — ADR-0005, registered on every server so `buildOpenApiDocument` can ask
 * ONE of them for its document rather than building a second, undocumented one ──────────────────
 *
 * Registered unconditionally rather than only when generating the document: `@fastify/swagger`
 * decorates routes as they are added via an `onRoute` hook, so it must be registered BEFORE
 * `registerAppointmentRoutes`/`registerAvailabilityRoute`/`registerHealthRoute` run — which rules
 * out registering it only inside `buildOpenApiDocument`, after `buildServer` has already added
 * every route. It adds no HTTP route of its own (that is `@fastify/swagger-ui`'s job, not used
 * here) and costs nothing a production server would notice.
 */
import Fastify, { errorCodes } from 'fastify';
import type { FastifyBaseLogger, FastifyError, FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import { registerHealthRoute } from './routes/health.js';
import type { HealthRouteDeps } from './routes/health.js';
import { registerAppointmentRoutes } from './routes/appointments.js';
import type { AppointmentRouteDeps } from './routes/appointments.js';
import { registerAvailabilityRoute } from './routes/availability.js';
import type { AvailabilityRouteDeps } from './routes/availability.js';
import { PROBLEM_CONTENT_TYPE, problem } from './problem.js';
import { createLogger } from '../platform/logger.js';

export interface ServerDeps extends HealthRouteDeps, AppointmentRouteDeps, AvailabilityRouteDeps {
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
 * AC-5 — Fastify's content-type-parser error, NAMED, because §8.6 has a row for it and it was
 * not the one it was reaching.
 *
 * Measured three times independently on the pinned `fastify@5.12.1`: a `POST` carrying
 * `content-type: application/json` with an unparseable body raises `FST_ERR_CTP_INVALID_JSON_BODY`,
 * `statusCode: 400`, with `validation` unset — so it missed the arm above and fell to the
 * catch-all, `500 /problems/internal`, live on the already-merged booking route. §8.6 justifies
 * its `500` row with *"a 4xx would tell the caller to correct something they did not send and
 * cannot see"*, and here the client sent exactly that, can see it, and can correct it. The row
 * was inverted, not missing: this maps to the `/problems/malformed-request` that already exists,
 * and the taxonomy gains nothing.
 *
 * BY CODE, NEVER BY `statusCode < 500`. The comment above this one records a broader disjunction
 * being deleted after mutation because no input reached its second arm; widening this one would
 * be that mistake with a worse consequence. Fastify's other 4xx errors — a media type, an
 * unrouted path — have no §8.6 row, and widening a predicate until the taxonomy has to grow to
 * meet it is the tail wagging the dog.
 *
 * The parser runs BEFORE the router, measured: a malformed body addressed to a path that is not
 * registered raises this too. So this arm is not per-route and cannot be.
 *
 * `FST_ERR_CTP_EMPTY_JSON_BODY` NAMED NO LONGER, having named it once (`R-09-14`). It was the
 * pair's other half until AC-6b's content-type parser above started mapping a zero-length body to
 * `undefined` before Fastify's own default parser ever runs — the case this arm existed to catch
 * cannot occur any more, on ANY route, and a set with that code in it was unreachable rather than
 * a belt to the braces. Removed rather than kept for a mutant to survive against: an unkillable
 * arm is not a safety margin, the same finding `isValidationError`'s own docblock already made
 * about its own second arm.
 */
function isMalformedBody(error: FastifyError): boolean {
  return error.code === 'FST_ERR_CTP_INVALID_JSON_BODY';
}

/** ADR-0005 — one title, one description, shared between the live server and the emitted document. */
const OPENAPI_INFO = {
  title: 'Keyloop Unified Service Scheduler',
  description:
    'Service-appointment scheduling for automotive dealerships. No authentication (ADR-0002); ' +
    'a candidate list is advisory only — every write is adjudicated by PostgreSQL (CLAUDE.md §2.1).',
  version: '1.0.0',
};

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ loggerInstance: deps.logger });

  // AC-6b — see the file docblock. `parseAs: 'string'` mirrors Fastify's own default JSON
  // parser; the only change is the zero-length case.
  app.addContentTypeParser<string>(
    'application/json',
    { parseAs: 'string' },
    (_request, body, done) => {
      if (body.length === 0) {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(body));
      } catch {
        done(new errorCodes.FST_ERR_CTP_INVALID_JSON_BODY(), undefined);
      }
    },
  );

  // ADR-0005 — registered before any route, so its `onRoute` hook sees every schema.
  //
  // BOTH `.register()` CALLS, DELIBERATELY — measured. `@fastify/swagger` attaches its
  // `onRoute` hook from INSIDE its own plugin body, which `.register()` defers to Fastify's
  // boot sequence (avvio); the route-registration functions below call `.get()`/`.post()`
  // directly, which fire `onRoute` SYNCHRONOUSLY, at the moment they run. Calling them as plain
  // functions at this same top level — as they were before this slice — runs them BEFORE
  // swagger's plugin body ever executes, so its hook does not exist yet and the emitted document
  // has an empty `paths`. Wrapping them in their own `.register()` puts them in the SAME
  // deferred boot queue as swagger, in registration order, so swagger's hook is attached by the
  // time these routes are added. No `hideUntagged`, no exposed UI route: `buildOpenApiDocument`
  // below is the only consumer.
  void app.register(fastifySwagger, {
    openapi: { openapi: '3.1.0', info: OPENAPI_INFO },
  });

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

  // ADR-0024 — the second handler §8.6's totality claim is kept in. Fastify's own default
  // not-found body never reaches `setErrorHandler` above; this is what stops it being the one
  // response outside the taxonomy.
  app.setNotFoundHandler(async (request, reply) => {
    await reply
      .code(404)
      .type(PROBLEM_CONTENT_TYPE)
      .send(
        problem('/problems/route-not-found', 404, 'No such route', {
          detail: `no route matches ${request.method} ${request.url}`,
        }),
      );
  });

  void app.register(async (instance) => {
    registerHealthRoute(instance, deps);
    registerAppointmentRoutes(instance, deps);
    registerAvailabilityRoute(instance, deps);
  });

  return app;
}

/**
 * `T-09-1` / ADR-0005 — the OpenAPI document, generated from the SAME route schemas the live
 * server registers, via `@fastify/swagger`'s `app.swagger()`. `npm run docs:openapi`
 * (`tools/docs/openapi.mjs`) is this function's only caller in production; AC-5b needs a second
 * one — `tests/unit/http/availability.test.ts` — which is the entire reason this is a callable
 * function and not only a script (design decision 4): the seven `description` mutants in
 * `routes/availability.ts` are otherwise unreachable from `vitest.mutation.config.ts`'s
 * `tests/unit/**`-only scope (`D-08-1`).
 *
 * The bound use cases are never called: `app.ready()` only runs each route's `onRoute`
 * registration and schema compilation, never a handler. Every one throws if it somehow were, so a
 * change that made one reachable fails loudly rather than silently answering with nonsense data.
 */
export async function buildOpenApiDocument(): Promise<object> {
  const unreachable = (name: string): (() => Promise<never>) => {
    return async () => {
      throw new Error(`buildOpenApiDocument: ${name} is not callable while generating the document`);
    };
  };

  const app = buildServer({
    logger: createLogger({ logLevel: 'silent' }),
    checkHealth: unreachable('checkHealth'),
    bookAppointment: unreachable('bookAppointment'),
    readAppointment: unreachable('readAppointment'),
    cancelAppointment: unreachable('cancelAppointment'),
    rescheduleAppointment: unreachable('rescheduleAppointment'),
    queryAvailability: unreachable('queryAvailability'),
  });

  try {
    await app.ready();
    return app.swagger();
  } finally {
    await app.close();
  }
}
