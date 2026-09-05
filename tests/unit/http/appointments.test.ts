import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import { pino } from 'pino';
import { buildServer } from '../../../src/http/server.js';
import { PROBLEM_TYPES, problem } from '../../../src/http/problem.js';
import type { BookOutcome } from '../../../src/application/bookAppointment.js';
import type { ReadOutcome } from '../../../src/application/readAppointment.js';
import type { HealthOutcome } from '../../../src/application/checkHealth.js';
import { createLogger } from '../../../src/platform/logger.js';

/**
 * The status mapping and the taxonomy, through `app.inject` — no database and no network.
 *
 * The contract test in `tests/contract/` asserts the same rows END TO END against a real
 * container, and it is the test-engineer's. This file exists beside it for the two things an
 * outside-in test cannot reach: the outcomes that are hard to STAGE (a `no-verdict`, a
 * `reference-data-invalid` from a route other than a broken zone) and the ones whose mutants no
 * fixture kills. A route with seven arms needs seven cases, and staging seven database states to
 * get them is how a contract test becomes slow and flaky without becoming better evidence.
 */

const silentLogger = createLogger({ logLevel: 'silent' });

const APPOINTMENT_ID = '11111111-1111-4111-8111-111111111111';
const VIEW = {
  id: APPOINTMENT_ID,
  dealershipId: '22222222-2222-4222-8222-222222222222',
  customerId: '33333333-3333-4333-8333-333333333333',
  vehicleId: '44444444-4444-4444-8444-444444444444',
  serviceTypeId: '55555555-5555-4555-8555-555555555555',
  technicianId: '66666666-6666-4666-8666-666666666666',
  bayId: '77777777-7777-4777-8777-777777777777',
  startsAt: '2026-09-08T09:00:00.000Z',
  endsAt: '2026-09-08T10:00:00.000Z',
  status: 'confirmed' as const,
};

const VALID_BODY = {
  dealershipId: VIEW.dealershipId,
  customerId: VIEW.customerId,
  vehicleId: VIEW.vehicleId,
  serviceTypeId: VIEW.serviceTypeId,
  startsAt: '2026-09-08T09:00:00.000Z',
};

const apps: FastifyInstance[] = [];

function serverAnswering(options: {
  readonly book?: BookOutcome | ((command: unknown) => BookOutcome);
  readonly read?: ReadOutcome;
  readonly logger?: ReturnType<typeof createLogger>;
}): FastifyInstance {
  const app = buildServer({
    logger: options.logger ?? silentLogger,
    checkHealth: async (): Promise<HealthOutcome> => ({ kind: 'ok' }),
    bookAppointment: async (command) => {
      const book = options.book ?? { kind: 'confirmed', appointment: VIEW };
      return typeof book === 'function' ? book(command) : book;
    },
    readAppointment: async () => options.read ?? { kind: 'not-found' },
  });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

async function post(
  app: FastifyInstance,
  payload: Record<string, unknown>,
): Promise<LightMyRequestResponse> {
  return await app.inject({ method: 'POST', url: '/appointments', payload });
}

describe('POST /appointments — the exhaustive status mapping (§8.6)', () => {
  it('confirmed is 201 with the AppointmentView, as application/json', async () => {
    const response = await post(serverAnswering({}), VALID_BODY);
    expect(response.statusCode).toBe(201);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.json()).toEqual(VIEW);
  });

  it.each([
    [
      'malformed-instant',
      { kind: 'malformed-instant' } as BookOutcome,
      400,
      '/problems/malformed-request',
    ],
    [
      'outside-opening-hours',
      { kind: 'outside-opening-hours', verdict: { kind: 'closed-day', dayOfWeek: 0 } } as BookOutcome,
      400,
      '/problems/outside-opening-hours',
    ],
    [
      'unknown-reference',
      { kind: 'unknown-reference', reference: 'customer' } as BookOutcome,
      422,
      '/problems/unknown-reference',
    ],
    ['vehicle-not-owned', { kind: 'vehicle-not-owned' } as BookOutcome, 422, '/problems/vehicle-not-owned'],
    [
      'no-capacity',
      { kind: 'no-capacity', resource: 'bay', attempts: 1 } as unknown as BookOutcome,
      409,
      '/problems/no-capacity',
    ],
    ['no-verdict', { kind: 'no-verdict' } as BookOutcome, 500, '/problems/internal'],
    [
      'reference-data-invalid',
      { kind: 'reference-data-invalid', detail: 'unknown-zone' } as BookOutcome,
      500,
      '/problems/internal',
    ],
  ])('%s renders %d %s as problem+json', async (_label, outcome, status, type) => {
    const response = await post(serverAnswering({ book: outcome }), VALID_BODY);
    expect(response.statusCode).toBe(status);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(response.json().type).toBe(type);
    // RFC 9457 repeats the status in the body, and the contract test asserts it there too.
    expect(response.json().status).toBe(status);
  });

  it('AC-7 — outside-opening-hours is 400 and never 409', async () => {
    // Named explicitly by the criterion: out-of-hours is a fact about the dealership's schedule,
    // decided by a module that reads no booking, so answering 409 would say capacity was
    // consulted for a question that is not about capacity.
    const response = await post(
      serverAnswering({
        book: {
          kind: 'outside-opening-hours',
          verdict: { kind: 'outside-window', dayOfWeek: 2, opensAt: '09:00:00', closesAt: '17:00:00' },
        },
      }),
      VALID_BODY,
    );
    expect(response.statusCode).toBe(400);
    expect(response.statusCode).not.toBe(409);
    // The hours themselves are carried: "outside opening hours" without the hours is a client
    // that has to guess what would have worked.
    expect(response.json()).toMatchObject({ opensAt: '09:00:00', closesAt: '17:00:00' });
  });

  it('AC-9 — the 422 names WHICH reference was unknown', async () => {
    for (const reference of ['dealership', 'service-type', 'customer', 'vehicle'] as const) {
      const response = await post(serverAnswering({ book: { kind: 'unknown-reference', reference } }), VALID_BODY);
      // Four failures share one `type`; without `reference` a service advisor is told only that
      // "something" was unknown.
      expect(response.json().reference).toBe(reference);
      expect(response.statusCode).not.toBe(404);
    }
  });

  it('AC-10 — vehicle-not-owned is 422 and never 403 (ADR-0002: validation, not authorisation)', async () => {
    const response = await post(serverAnswering({ book: { kind: 'vehicle-not-owned' } }), VALID_BODY);
    expect(response.statusCode).toBe(422);
    expect(response.statusCode).not.toBe(403);
    expect(response.json().type).not.toBe('/problems/unknown-reference');
  });

  it('AC-11 — the 409 carries the contended resource, both ways round', async () => {
    for (const resource of ['bay', 'technician'] as const) {
      const response = await post(
        serverAnswering({
          book: { kind: 'no-capacity', resource, attempts: 2 } as unknown as BookOutcome,
        }),
        VALID_BODY,
      );
      expect(response.json().resource).toBe(resource);
    }
  });

  it('the two 500 OUTCOMES render identically — one taxonomy row, two outcomes', async () => {
    // T-02-9 grew `BookOutcome` by one member and §8.6's client contract by nothing. They stay
    // separate in the union so the exhaustive switch names them apart and the operator's log line
    // can; to the client they are the same row.
    const deadlock = await post(serverAnswering({ book: { kind: 'no-verdict' } }), VALID_BODY);
    const broken = await post(
      serverAnswering({ book: { kind: 'reference-data-invalid', detail: 'unknown-zone' } }),
      VALID_BODY,
    );
    expect(deadlock.json()).toEqual(broken.json());
  });

  it('the 500 renders as problem+json even though it carries NO response schema — I-02-5', async () => {
    // Measured: a `Problem` response schema on this status can fail its own serialisation and
    // produce `500 application/json FST_ERR_FAILED_ERROR_SERIALIZATION` — neither problem+json
    // nor the right shape, the backstop becoming the defect. Unschema'd, Fastify renders exactly
    // what the handler sent. This is the assertion that the omission works.
    const response = await post(serverAnswering({ book: { kind: 'no-verdict' } }), VALID_BODY);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(response.json()).toMatchObject({ type: '/problems/internal', status: 500 });
  });
});

describe('POST /appointments — the request schema (AC-6, AC-8)', () => {
  it('AC-6 — a supplied endsAt is STRIPPED and never reaches the use case', async () => {
    let seen: unknown;
    const response = await post(
      serverAnswering({
        book: (command) => {
          seen = command;
          return { kind: 'confirmed', appointment: VIEW };
        },
      }),
      { ...VALID_BODY, endsAt: '2026-09-08T17:00:00.000Z' },
    );

    expect(response.statusCode).toBe(201);
    // Fastify's default ajv sets `removeAdditional: true`, so `additionalProperties: false`
    // strips rather than rejects — measured, and the opposite of what the design first assumed.
    // The structural reason stands beside it: `BookCommand` has no member for an end.
    expect(Object.keys(seen as Record<string, unknown>).sort()).toEqual([
      'customerId',
      'dealershipId',
      'serviceTypeId',
      'startsAtMillis',
      'vehicleId',
    ]);
  });

  it.each([
    ['an unparseable startsAt', { ...VALID_BODY, startsAt: 'not-a-timestamp' }],
    ['a startsAt with NO offset', { ...VALID_BODY, startsAt: '2026-09-08T09:00:00' }],
    ['a missing vehicleId', { dealershipId: VALID_BODY.dealershipId, customerId: VALID_BODY.customerId, serviceTypeId: VALID_BODY.serviceTypeId, startsAt: VALID_BODY.startsAt }],
    ['a non-uuid dealershipId', { ...VALID_BODY, dealershipId: 'nope' }],
  ])('AC-8 — %s is 400 /problems/malformed-request, before the handler runs', async (_label, payload) => {
    let handlerRan = false;
    const response = await post(
      serverAnswering({
        book: () => {
          handlerRan = true;
          return { kind: 'confirmed', appointment: VIEW };
        },
      }),
      payload,
    );

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(response.json().type).toBe('/problems/malformed-request');
    expect(handlerRan, 'the schema must reject before any use case is called').toBe(false);
  });

  it('a startsAt with an explicit numeric offset is accepted — the pattern is not Z-only', async () => {
    // The negative control for the case above: if the pattern rejected everything the AC-8 cases
    // would pass over a route that accepted no timestamp at all.
    const response = await post(serverAnswering({}), { ...VALID_BODY, startsAt: '2026-09-08T10:00:00+01:00' });
    expect(response.statusCode).toBe(201);
  });
});

describe('GET /appointments/:id — AC-2', () => {
  it('found is 200 with the SAME body shape the 201 returns', async () => {
    const app = serverAnswering({ read: { kind: 'found', appointment: VIEW } });
    const read = await app.inject({ method: 'GET', url: `/appointments/${APPOINTMENT_ID}` });
    const booked = await post(app, VALID_BODY);

    expect(read.statusCode).toBe(200);
    expect(read.json(), 'a client parses ONE thing on both paths').toEqual(booked.json());
  });

  it('an unknown but WELL-FORMED id is 404 problem+json, not Fastify\'s default not-found body', async () => {
    // The vacuous-green trap the acceptance test is written around: at the red commit this id
    // already answered 404, from Fastify's own not-found handler, because the route did not
    // exist. The media type and the `type` are what discriminate — Fastify's body carries
    // neither.
    const app = serverAnswering({ read: { kind: 'not-found' } });
    const response = await app.inject({ method: 'GET', url: `/appointments/${APPOINTMENT_ID}` });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(response.json().type).toBe('/problems/appointment-not-found');
    expect(response.json().status).toBe(404);
  });

  it('AC-8 — a NON-uuid path segment is 400, so the two failures do not share a status', async () => {
    // Without the path pattern, a malformed id and an unknown id both answer 404 and QS-11's
    // "no two rows collide" is untestable on that pair.
    let readRan = false;
    const app = buildServer({
      logger: silentLogger,
      checkHealth: async (): Promise<HealthOutcome> => ({ kind: 'ok' }),
      bookAppointment: async () => ({ kind: 'confirmed', appointment: VIEW }),
      readAppointment: async () => {
        readRan = true;
        return { kind: 'not-found' };
      },
    });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/appointments/not-a-uuid' });
    expect(response.statusCode).toBe(400);
    expect(response.json().type).toBe('/problems/malformed-request');
    expect(readRan).toBe(false);
  });

  it('a CANCELLED appointment renders at the same URL — the status is not substituted', async () => {
    // Measurement 8: a `Type.Literal('confirmed')` in the response schema would silently write
    // `confirmed` over whatever the handler computed, and slice 05's own test could not fail.
    // The union of literals enforces without substituting, and this is the case that shows it.
    const app = serverAnswering({
      read: { kind: 'found', appointment: { ...VIEW, status: 'cancelled' } },
    });
    const response = await app.inject({ method: 'GET', url: `/appointments/${APPOINTMENT_ID}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('cancelled');
  });
});

describe('setErrorHandler — §8.6\'s "Anything else" row is where totality is kept', () => {
  it('an escaped exception is 500 /problems/internal, and the cause goes to the LOG', async () => {
    const lines: string[] = [];
    const capturing = pino({ level: 'error' }, { write: (line: string): void => void lines.push(line) });
    const app = buildServer({
      logger: capturing,
      checkHealth: async (): Promise<HealthOutcome> => ({ kind: 'ok' }),
      bookAppointment: async () => {
        throw Object.assign(new Error('undefined column "bya_id"'), { code: '42703' });
      },
      readAppointment: async () => ({ kind: 'not-found' }),
    });
    apps.push(app);

    const response = await post(app, VALID_BODY);

    expect(response.statusCode).toBe(500);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(response.json().type).toBe('/problems/internal');
    // The client is told nothing it could act on — no SQLSTATE, no column name, no stack.
    expect(response.body).not.toContain('42703');
    expect(response.body).not.toContain('bya_id');
    // But the operator is. A 500 whose cause is nowhere is the failure this row exists to avoid.
    expect(lines.join('\n')).toContain('42703');
  });

  it('renders through the SAME builder the routes use, so the taxonomy cannot escape itself', async () => {
    // I-02-5: an error handler that hand-rolls its own body is a second place the taxonomy is
    // written, and the one place a mistyped `type` reaches the client as
    // `FST_ERR_FAILED_ERROR_SERIALIZATION`. Both of this handler's outputs must be rows of the
    // taxonomy, and that is checkable from outside.
    const app = serverAnswering({});
    const validation = await post(app, { ...VALID_BODY, startsAt: 'nope' });
    expect(PROBLEM_TYPES).toContain(validation.json().type);
  });
});

describe('every row carries a title and a detail a client can read', () => {
  /**
   * The `title` and `detail` of each row are client-visible contract text, and until the mutation
   * run said so nothing asserted any of them: every string literal in the route survived. A row
   * whose title became `""` still passed every status and `type` assertion in this file, which is
   * the same shape of false green as a substituted literal — the response looks right where the
   * test looks.
   */
  it.each([
    [
      'malformed-instant',
      { kind: 'malformed-instant' } as BookOutcome,
      'The request could not be understood',
      'startsAt is not a usable instant',
    ],
    [
      'outside-opening-hours',
      { kind: 'outside-opening-hours', verdict: { kind: 'closed-day', dayOfWeek: 0 } } as BookOutcome,
      "The requested interval is outside the dealership's opening hours",
      'closed-day',
    ],
    [
      'unknown-reference',
      { kind: 'unknown-reference', reference: 'vehicle' } as BookOutcome,
      'A named reference does not exist',
      'no vehicle matches the id in this request',
    ],
    [
      'vehicle-not-owned',
      { kind: 'vehicle-not-owned' } as BookOutcome,
      "The vehicle is not this customer's",
      'the named vehicle does not belong to the named customer',
    ],
    [
      'no-capacity',
      { kind: 'no-capacity', resource: 'technician', attempts: 3 } as unknown as BookOutcome,
      'No bay and technician are both free',
      'every candidate technician was already occupied for this interval',
    ],
    [
      'no-verdict',
      { kind: 'no-verdict' } as BookOutcome,
      'The request could not be completed',
      'the service could not complete this request; the failure has been logged',
    ],
  ])('%s', async (_label, outcome, title, detail) => {
    const response = await post(serverAnswering({ book: outcome }), VALID_BODY);
    expect(response.json().title).toBe(title);
    expect(response.json().detail).toBe(detail);
  });

  it("the outside-hours detail NAMES the verdict, so two different refusals do not read alike", async () => {
    // `closed-day`, `outside-window` and `spans-local-days` are three different things to fix and
    // they share one `type`. A constant detail would make them indistinguishable to a client.
    const spans = await post(
      serverAnswering({
        book: {
          kind: 'outside-opening-hours',
          verdict: { kind: 'spans-local-days', startsOn: '2026-09-08', endsOn: '2026-09-09' },
        },
      }),
      VALID_BODY,
    );
    expect(spans.json().detail).toBe('spans-local-days');
    expect(spans.json().opensAt, 'only outside-window carries the window').toBeUndefined();
  });

  it('the GET 404 carries its own title and detail', async () => {
    const app = serverAnswering({ read: { kind: 'not-found' } });
    const response = await app.inject({ method: 'GET', url: `/appointments/${APPOINTMENT_ID}` });
    expect(response.json().title).toBe('No such appointment');
    expect(response.json().detail).toBe('no appointment exists with that id');
  });

  it('the validation 400 carries the framework\'s own message as the detail', async () => {
    // `detail: error.message` rather than a constant: a client that is told only "the request
    // could not be understood" cannot find which member was wrong, and the schema already knows.
    const response = await post(serverAnswering({}), { ...VALID_BODY, startsAt: 'nope' });
    expect(response.json().title).toBe('The request could not be understood');
    expect(String(response.json().detail)).toMatch(/startsAt/);
  });
});

describe('problem() and PROBLEM_TYPES', () => {
  it('is exactly §8.6\'s seven in-scope rows', () => {
    // `/problems/appointment-not-confirmed` is slice 06's and its absence is deliberate: it needs
    // rescheduling. The union is what makes adding it a one-line, compiler-visible change.
    expect([...PROBLEM_TYPES]).toEqual([
      '/problems/malformed-request',
      '/problems/outside-opening-hours',
      '/problems/appointment-not-found',
      '/problems/no-capacity',
      '/problems/unknown-reference',
      '/problems/vehicle-not-owned',
      '/problems/internal',
    ]);
    expect(new Set(PROBLEM_TYPES).size, 'a duplicated row would make the taxonomy ambiguous').toBe(7);
  });

  it('builds the three mandatory members and merges the extras', () => {
    expect(problem('/problems/no-capacity', 409, 'No capacity', { resource: 'technician' })).toEqual({
      type: '/problems/no-capacity',
      title: 'No capacity',
      status: 409,
      resource: 'technician',
    });
  });

  it('omits the optional members when no extras are given', () => {
    // `additionalProperties: false` plus an absent optional is what keeps the body minimal; an
    // implementation that emitted `resource: undefined` would serialise a null-ish member on
    // every row of the taxonomy.
    expect(Object.keys(problem('/problems/internal', 500, 'Internal')).sort()).toEqual([
      'status',
      'title',
      'type',
    ]);
  });
});
