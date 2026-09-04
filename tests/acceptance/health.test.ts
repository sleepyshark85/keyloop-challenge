import { describe, expect, inject, it } from 'vitest';
import { startService, UNREACHABLE_DATABASE_URL } from '../support/service.js';

/**
 * AC-2 — "Given the service is started, when GET /health is requested, then it returns 200
 * with a body reporting database connectivity, and returns 503 when the database is
 * unreachable."  (docs/slices/00a-walking-skeleton.md)
 *
 * Black box, both cases. The service is reached over HTTP on a port, exactly as a client
 * would reach it; nothing here imports src/, and the response body is the whole contract.
 * The two response shapes are the ones docs/slices/00a-design.md §3 fixes:
 *
 *   200  { "status": "ok",       "checks": { "database": "up" } }
 *   503  { "status": "degraded", "checks": { "database": "down" } }
 *
 * The service is started INSIDE each test body rather than in a `beforeAll`. That is
 * deliberate and is what makes this file usable as slice 00a's red: at the red commit there
 * is no `dist/main.js`, and a failure in a hook is reported as a hook error rather than as
 * a failed assertion in a collected file. `startService` never throws — it returns a
 * diagnosis naming the argv, the cwd, the port and the DATABASE_URL it used — so the
 * failure the CI artifact records is an assertion, not a load error (§7).
 */
describe('AC-2 — GET /health reports database connectivity', () => {
  it('returns 200 and reports the database up when the database is reachable', async () => {
    const databaseUrl = inject('databaseUrl');

    const attempt = await startService({ databaseUrl });
    expect(attempt.failure ?? 'started', `the service did not start.\n${attempt.failure}`).toBe(
      'started',
    );
    const service = attempt.service!;

    try {
      const response = await fetch(`${service.baseUrl}/health`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toMatch(/application\/json/);
      await expect(response.json()).resolves.toEqual({
        status: 'ok',
        checks: { database: 'up' },
      });
    } finally {
      await service.stop();
    }
  });

  it('returns 503 and reports the database down when the database is unreachable', async () => {
    // A well-formed URL for a port nothing listens on. The service must still START —
    // §3 forbids an eager connect at boot precisely so that this case is testable at all —
    // and must report the failure through /health rather than by crashing.
    const attempt = await startService({ databaseUrl: UNREACHABLE_DATABASE_URL });
    expect(attempt.failure ?? 'started', `the service did not start.\n${attempt.failure}`).toBe(
      'started',
    );
    const service = attempt.service!;

    try {
      const response = await fetch(`${service.baseUrl}/health`);

      expect(response.status).toBe(503);
      expect(response.headers.get('content-type')).toMatch(/application\/json/);
      await expect(response.json()).resolves.toEqual({
        status: 'degraded',
        checks: { database: 'down' },
      });
    } finally {
      await service.stop();
    }
  });
});
