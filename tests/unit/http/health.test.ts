import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance, RouteOptions } from 'fastify';
import { registerHealthRoute } from '../../../src/http/routes/health.js';
import { buildServer } from '../../../src/http/server.js';
import { createLogger } from '../../../src/platform/logger.js';
import type { HealthOutcome } from '../../../src/application/checkHealth.js';

/**
 * `app.inject` rather than a listening socket: this asserts the edge's own behaviour —
 * status code, content type, body shape — and it does so without a port, a process or a
 * database. AC-2 asserts the same two responses over a real socket against a real
 * container; that is the acceptance test's job and it is a different claim.
 *
 * What is worth pinning here and nowhere else:
 *
 *   - the edge never sees a database. `checkHealth` arrives ALREADY BOUND, which is the
 *     only shape the ruleset leaves available, and these tests are what that shape buys —
 *     the 503 path is reachable without an unreachable database.
 *   - the response SCHEMA is enforced on the way out. Fastify serialises through the
 *     TypeBox schema, so a handler that returned the wrong shape would not merely be
 *     wrong, it would be stripped — and the last test proves the schema is doing that
 *     rather than being decoration.
 */
// A real pino instance at level 'silent'. Fastify rejects a duck-typed logger outright,
// and this is the same object main.ts hands it — so 'a pino Logger structurally satisfies
// FastifyBaseLogger' is asserted by these tests rather than asserted in a comment.
const silentLogger = createLogger({ logLevel: 'silent' });

const apps: FastifyInstance[] = [];
function serverReporting(outcome: HealthOutcome | (() => Promise<HealthOutcome>)): FastifyInstance {
  const checkHealth = typeof outcome === 'function' ? outcome : async (): Promise<HealthOutcome> => outcome;
  const app = buildServer({ logger: silentLogger, checkHealth });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('GET /health', () => {
  it('answers 200 with database: up when the outcome is ok', async () => {
    const app = serverReporting({ kind: 'ok' });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.json()).toEqual({ status: 'ok', checks: { database: 'up' } });
  });

  it('answers 503 with database: down when the outcome is degraded', async () => {
    const app = serverReporting({ kind: 'degraded', reason: 'database-unreachable' });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.json()).toEqual({ status: 'degraded', checks: { database: 'down' } });
  });

  it('leaks no reason code to the client — the body is the whole contract', async () => {
    const app = serverReporting({ kind: 'degraded', reason: 'database-unreachable' });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.body).not.toMatch(/database-unreachable/);
  });

  it('calls the bound use case once per request and passes it nothing', async () => {
    const checkHealth = vi.fn(async (): Promise<HealthOutcome> => ({ kind: 'ok' }));
    const app = serverReporting(checkHealth);

    await app.inject({ method: 'GET', url: '/health' });
    await app.inject({ method: 'GET', url: '/health' });

    expect(checkHealth).toHaveBeenCalledTimes(2);
    expect(checkHealth).toHaveBeenCalledWith();
  });

  it('serialises through the response schema rather than echoing the handler', async () => {
    // Fastify strips anything the TypeBox schema does not declare. If the schema were
    // decoration rather than enforcement this would come back with the extra key.
    const app = serverReporting({ kind: 'ok' });
    app.get('/probe', { schema: { response: { 200: { type: 'object', properties: { kept: { type: 'string' } }, additionalProperties: false } } } }, async () => ({
      kept: 'yes',
      dropped: 'no',
    }));

    const response = await app.inject({ method: 'GET', url: '/probe' });

    expect(response.json()).toEqual({ kept: 'yes' });
  });

  it('has no other route — the skeleton walks one path', async () => {
    const app = serverReporting({ kind: 'ok' });

    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(404);
  });
});

/**
 * `buildServer` puts the injected logger into Fastify, and until mutation testing said so
 * nothing checked it: `Fastify({ loggerInstance: deps.logger })` could become `Fastify({})`
 * and every test still passed, because none of them ever looked at what the server logged
 * through. A server with no logger answers requests exactly the same way and produces no
 * operational output at all — the failure you notice in production and not in CI.
 */
describe('buildServer', () => {
  it('logs through the injected logger rather than discarding it', () => {
    const logger = createLogger({ logLevel: 'warn' });
    const app = buildServer({ logger, checkHealth: async () => ({ kind: 'ok' }) });
    apps.push(app);

    // `app.log` is typed FastifyBaseLogger, which declares neither `level` nor
    // `isLevelEnabled`; Fastify's own instance IS the pino logger it was handed, so the
    // assertion is on that, narrowed here rather than by widening the production type.
    const log = app.log as unknown as ReturnType<typeof createLogger>;
    expect(log.level).toBe('warn');
    expect(log.isLevelEnabled('info'), 'the server is not logging through the injected logger').toBe(
      false,
    );
  });
});

/**
 * The branch the types say is unreachable.
 *
 * `switch (outcome.kind)` is exhaustive over two members and the `default` holds a `never`
 * assignment, so the compiler will not let a third member be added without pointing here.
 * That is a compile-time guarantee about THIS code, not a runtime one about its callers:
 * `checkHealth` arrives as an injected function, and slice 02 onward will add use cases to
 * `ServerDeps` written by someone else. The question that matters is what an operator sees
 * if one of them ever returns something this route does not know.
 *
 * The answer must not be "200, healthy". A health endpoint that reports a state it cannot
 * interpret as `ok` is worse than one that errors, because everything downstream — a load
 * balancer, a readiness probe, a pager — believes it.
 */
describe('an outcome the route does not know', () => {
  it('is never reported as healthy', async () => {
    const app = serverReporting({ kind: 'sideways' } as unknown as HealthOutcome);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(500);
    expect(response.statusCode).not.toBe(200);
    expect(response.body).not.toContain('"status":"ok"');
  });

  it('says what it could not interpret, so the cause is in the log', async () => {
    const app = serverReporting({ kind: 'sideways' } as unknown as HealthOutcome);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.json().message).toMatch(/unhandled health outcome.*sideways/);
  });
});

/**
 * The response schemas are the endpoint's contract, and they are enforcement rather than
 * documentation: Fastify serialises THROUGH them, so a field the schema does not declare
 * never reaches the client. That is what stops a future handler leaking an internal —
 * a reason string, a driver error, a connection URL — by adding it to the object it sends.
 *
 * Asserted against the schema the route ACTUALLY declares, captured from the `onRoute`
 * hook, rather than against a copy. A copy would keep passing after the route stopped
 * declaring a schema at all, which is exactly the mutant this is here to catch: with
 * `{ schema: … }` emptied the endpoint still answers 200 and 503 with the right bodies, and
 * every other test in this file passes.
 */
describe('the declared response schemas', () => {
  function declaredSchemas(): Record<string, unknown> {
    const app = Fastify();
    const routes: RouteOptions[] = [];
    app.addHook('onRoute', (route) => {
      routes.push(route);
    });

    registerHealthRoute(app, { checkHealth: async () => ({ kind: 'ok' }) });

    const health = routes.find((route) => route.url === '/health');
    expect(health, 'no /health route was registered').toBeDefined();
    const response = (health?.schema as { response?: Record<string, unknown> } | undefined)
      ?.response;
    expect(response, 'the route declares no response schema, so nothing is enforced').toBeDefined();
    return response as Record<string, unknown>;
  }

  it('declares one for the healthy code and one for the degraded code', () => {
    expect(Object.keys(declaredSchemas()).sort()).toEqual(['200', '503']);
  });

  it('explains what each code means, because slice 10 emits these as the OpenAPI document', () => {
    // The weakest assertion in this file, and deliberately not on the wording: it pins that
    // both outcomes are documented at all. ADR-0005 chose TypeBox response schemas partly so
    // the published contract is generated from the thing that enforces it, and a blank
    // description ships an endpoint whose two states the reader has to guess between.
    for (const [code, schema] of Object.entries(declaredSchemas())) {
      const { description } = schema as { description?: string };
      expect(description, `the ${code} response schema documents nothing`).toBeTruthy();
      expect(description?.length ?? 0).toBeGreaterThan(20);
    }
  });

  it.each([
    ['200', { status: 'ok', checks: { database: 'up' } }],
    ['503', { status: 'degraded', checks: { database: 'down' } }],
  ])('strips fields it does not declare, on %s', async (code, body) => {
    const schema = declaredSchemas()[code];
    const app = Fastify();
    apps.push(app);
    app.get('/probe', { schema: { response: { 200: schema } } }, async (_request, reply) =>
      reply.code(200).send({
        ...body,
        leaked: 'a connection string, say',
        checks: { ...(body as { checks: object }).checks, leaked: 'a driver error, say' },
      }),
    );

    const response = await app.inject({ method: 'GET', url: '/probe' });

    expect(response.json()).toEqual(body);
    expect(response.body).not.toContain('leaked');
  });
});
