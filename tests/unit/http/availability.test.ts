import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../../src/http/server.js';
import type { AvailabilityOutcome } from '../../../src/application/queryAvailability.js';
import type { HealthOutcome } from '../../../src/application/checkHealth.js';
import { createLogger } from '../../../src/platform/logger.js';

/**
 * `GET /availability` through `app.inject` — no database, no network. AC-2 through AC-6 assert
 * the same route end to end against a real container (`tests/acceptance/availability.test.ts`)
 * and QS-8 asserts the query agrees with the constraint
 * (`tests/property/availability-agrees-with-constraint.db.test.ts`); both are the
 * test-engineer's. What is here instead: the exhaustive switch's three arms render the right
 * status and taxonomy `type`, the querystring schema rejects what it should before any handler
 * runs, and the AC-5 fields survive the response schema unchanged (`Type.Boolean()`/
 * `Type.String()`, not `Type.Literal` — see `routes/availability.ts`'s own docblock for why a
 * literal would let a wrongly-computed value through silently).
 */

const silentLogger = createLogger({ logLevel: 'silent' });

const DEALERSHIP = '11111111-1111-4111-8111-111111111111';
const SERVICE_TYPE = '22222222-2222-4222-8222-222222222222';
const FROM = '2026-09-08T09:00:00.000Z';
const TO = '2026-09-08T10:00:00.000Z';

const apps: FastifyInstance[] = [];

/** Every route but `GET /availability` is unused here — a throwing stub, not a plausible fake. */
const unusedRouteDeps = {
  bookAppointment: (): never => {
    throw new Error('GET /availability must not book an appointment');
  },
  readAppointment: (): never => {
    throw new Error('GET /availability must not read an appointment');
  },
  cancelAppointment: (): never => {
    throw new Error('GET /availability must not cancel an appointment');
  },
  rescheduleAppointment: (): never => {
    throw new Error('GET /availability must not reschedule an appointment');
  },
};

function serverAnswering(
  outcome: AvailabilityOutcome | ((query: unknown) => AvailabilityOutcome),
): FastifyInstance {
  const app = buildServer({
    logger: silentLogger,
    checkHealth: async (): Promise<HealthOutcome> => ({ kind: 'ok' }),
    ...unusedRouteDeps,
    queryAvailability: async (query) =>
      typeof outcome === 'function' ? outcome(query) : outcome,
  });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

async function get(app: FastifyInstance, query: Record<string, string>): Promise<{
  readonly statusCode: number;
  readonly contentType: string | undefined;
  readonly json: () => unknown;
}> {
  const response = await app.inject({
    method: 'GET',
    url: `/availability?${new URLSearchParams(query).toString()}`,
  });
  return {
    statusCode: response.statusCode,
    contentType: response.headers['content-type'] as string | undefined,
    json: () => response.json(),
  };
}

const VALID_QUERY = {
  dealershipId: DEALERSHIP,
  serviceTypeId: SERVICE_TYPE,
  from: FROM,
  to: TO,
};

describe('GET /availability — the exhaustive status mapping', () => {
  it('available is 200 with bays, technicians, advisory: true and a disclaimer', async () => {
    const app = serverAnswering({ kind: 'available', bays: ['bay-1'], technicians: ['tech-1'] });
    const response = await get(app, VALID_QUERY);

    expect(response.statusCode).toBe(200);
    expect(response.contentType).toMatch(/application\/json/);
    const body = response.json() as Record<string, unknown>;
    expect(body['bays']).toEqual(['bay-1']);
    expect(body['technicians']).toEqual(['tech-1']);
    expect(body['advisory']).toBe(true);
    expect(typeof body['disclaimer']).toBe('string');
    expect((body['disclaimer'] as string).toLowerCase()).toContain('reservation');
    expect((body['disclaimer'] as string).toLowerCase()).toMatch(/interval|window/);
  });

  it('an EMPTY available answer is still 200 with two empty arrays, not a problem document', async () => {
    const app = serverAnswering({ kind: 'available', bays: [], technicians: [] });
    const response = await get(app, VALID_QUERY);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ bays: [], technicians: [] });
  });

  it('malformed-window is 400 /problems/malformed-request (AC-6, F-08-3)', async () => {
    const app = serverAnswering({ kind: 'malformed-window' });
    const response = await get(app, VALID_QUERY);
    expect(response.statusCode).toBe(400);
    expect(response.contentType).toMatch(/application\/problem\+json/);
    expect((response.json() as Record<string, unknown>)['type']).toBe(
      '/problems/malformed-request',
    );
  });

  it.each(['dealership', 'service-type'] as const)(
    'unknown-reference (%s) is 422, and names WHICH reference',
    async (reference) => {
      const app = serverAnswering({ kind: 'unknown-reference', reference });
      const response = await get(app, VALID_QUERY);
      expect(response.statusCode).toBe(422);
      expect(response.contentType).toMatch(/application\/problem\+json/);
      const body = response.json() as Record<string, unknown>;
      expect(body['type']).toBe('/problems/unknown-reference');
      expect(body['reference']).toBe(reference);
    },
  );

  it('passes from/to through as the query named them, verbatim', async () => {
    let seen: unknown;
    const app = serverAnswering((query) => {
      seen = query;
      return { kind: 'available', bays: [], technicians: [] };
    });
    await get(app, VALID_QUERY);
    expect(seen).toEqual({
      dealershipId: DEALERSHIP,
      serviceTypeId: SERVICE_TYPE,
      fromMillis: Date.parse(FROM),
      toMillis: Date.parse(TO),
    });
  });
});

describe('GET /availability — the querystring schema', () => {
  it('a non-UUID dealershipId is 400, before the use case ever runs', async () => {
    const app = serverAnswering((): never => {
      throw new Error('a schema violation must never reach the handler');
    });
    const response = await get(app, { ...VALID_QUERY, dealershipId: 'not-a-uuid' });
    expect(response.statusCode).toBe(400);
    expect(response.contentType).toMatch(/application\/problem\+json/);
  });

  it('a from value with no explicit offset is 400 — the same RFC 3339 discipline booking uses', async () => {
    const app = serverAnswering((): never => {
      throw new Error('a schema violation must never reach the handler');
    });
    const response = await get(app, { ...VALID_QUERY, from: '2026-09-08T09:00:00' });
    expect(response.statusCode).toBe(400);
  });

  it("a to value with no explicit offset is 400 — from's twin pattern, not from's mutant (I-08-6)", async () => {
    // `to`'s own `{ pattern: RFC3339_PATTERN }` (routes/availability.ts:57) is a distinct
    // property from `from`'s (line 56); this is the case that removeAdditional/the fixed-shape
    // literal cannot reach, and it is a different code path from the route's own to<=from guard
    // above — a schema violation here answers via server.ts's catch-all (`detail: error.message`),
    // never the route's fixed 'to must be strictly later than from'.
    const app = serverAnswering((): never => {
      throw new Error('a schema violation must never reach the handler');
    });
    const response = await get(app, { ...VALID_QUERY, to: '2026-09-08T10:00:00' });
    expect(response.statusCode).toBe(400);
  });

  it(
    "an unknown extra query parameter is STRIPPED, not rejected — Fastify's default ajv " +
      'removeAdditional: true, measured identically on the booking route (routes/appointments.ts)',
    async () => {
      const app = serverAnswering({ kind: 'available', bays: [], technicians: [] });
      const response = await get(app, { ...VALID_QUERY, extra: 'nope' });
      expect(response.statusCode).toBe(200);
    },
  );

  it('a missing required parameter is 400', async () => {
    const app = serverAnswering((): never => {
      throw new Error('a schema violation must never reach the handler');
    });
    const response = await app.inject({
      method: 'GET',
      url: `/availability?dealershipId=${DEALERSHIP}&serviceTypeId=${SERVICE_TYPE}&from=${FROM}`,
    });
    expect(response.statusCode).toBe(400);
  });

  it('a non-UUID serviceTypeId is ALSO 400 — dealershipId is not the only pattern-guarded field', async () => {
    // The dealershipId case above and this one are the querystring's two UUID members; each has
    // its own `{ pattern: UUID_PATTERN }` option, and only asserting one leaves the other's
    // pattern removable without any test noticing (R-08-5).
    const app = serverAnswering((): never => {
      throw new Error('a schema violation must never reach the handler');
    });
    const response = await get(app, { ...VALID_QUERY, serviceTypeId: 'not-a-uuid' });
    expect(response.statusCode).toBe(400);
    expect(response.contentType).toMatch(/application\/problem\+json/);
  });

  it(
    'an unknown query parameter never reaches the use case, alongside the ones that do (R-08-5)',
    async () => {
      // The stripped-not-rejected test above shows the STATUS this route answers with; this one
      // shows what `queryAvailability` actually receives — proof the extra key is gone by the
      // time it would matter, not just that the response happened to still be 200.
      let seen: unknown;
      const app = serverAnswering((query) => {
        seen = query;
        return { kind: 'available', bays: [], technicians: [] };
      });
      await get(app, { ...VALID_QUERY, extra: 'nope' });
      expect(seen).toEqual({
        dealershipId: DEALERSHIP,
        serviceTypeId: SERVICE_TYPE,
        fromMillis: Date.parse(FROM),
        toMillis: Date.parse(TO),
      });
      expect(seen).not.toHaveProperty('extra');
    },
  );
});

describe('GET /availability — the whole problem document on both error arms (R-08-5)', () => {
  /**
   * Until now this file asserted `type`, `status` and `reference` and never `title` or `detail`
   * — the same shape of gap `routes/appointments.ts` closed for its own arms (that file's own
   * `describe('every row carries a title and a detail a client can read', …)`). A `title` or
   * `detail` string reduced to `''` passed every assertion this file had.
   */
  it('malformed-window (400) carries its title and detail, not just its type and status', async () => {
    const app = serverAnswering({ kind: 'malformed-window' });
    const response = await get(app, VALID_QUERY);
    const body = response.json() as Record<string, unknown>;
    expect(response.statusCode).toBe(400);
    expect(body['type']).toBe('/problems/malformed-request');
    expect(body['status']).toBe(400);
    expect(body['title']).toBe('The request could not be understood');
    expect(body['detail']).toBe('to must be strictly later than from');
  });

  it.each(['dealership', 'service-type'] as const)(
    'unknown-reference (%s, 422) carries its title and detail, not just its type, status and reference',
    async (reference) => {
      const app = serverAnswering({ kind: 'unknown-reference', reference });
      const response = await get(app, VALID_QUERY);
      const body = response.json() as Record<string, unknown>;
      expect(response.statusCode).toBe(422);
      expect(body['type']).toBe('/problems/unknown-reference');
      expect(body['status']).toBe(422);
      expect(body['title']).toBe('A named reference does not exist');
      expect(body['reference']).toBe(reference);
      expect(body['detail']).toBe(`no ${reference} matches the id in this request`);
    },
  );
});
