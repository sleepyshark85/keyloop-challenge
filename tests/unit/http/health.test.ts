import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
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
