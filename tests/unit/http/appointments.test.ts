import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import { pino } from 'pino';
import { buildServer } from '../../../src/http/server.js';
import { PROBLEM_TYPES, problem } from '../../../src/http/problem.js';
import type { BookOutcome } from '../../../src/application/bookAppointment.js';
import type { ReadOutcome } from '../../../src/application/readAppointment.js';
import type { CancelOutcome } from '../../../src/application/cancelAppointment.js';
import type { RescheduleOutcome } from '../../../src/application/rescheduleAppointment.js';
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
  readonly cancel?: CancelOutcome | ((id: string) => CancelOutcome);
  readonly reschedule?: RescheduleOutcome | ((command: unknown) => RescheduleOutcome);
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
    cancelAppointment: async (id) => {
      const cancel = options.cancel ?? { kind: 'not-found' };
      return typeof cancel === 'function' ? cancel(id) : cancel;
    },
    rescheduleAppointment: async (command) => {
      const reschedule = options.reschedule ?? { kind: 'moved', appointment: VIEW };
      return typeof reschedule === 'function' ? reschedule(command) : reschedule;
    },
    // Slice 08's route is `routes/availability.ts`'s own file, asserted there — this file's
    // whole subject is `POST /appointments`, `GET /appointments/{id}` and cancellation/reschedule.
    queryAvailability: (): never => {
      throw new Error('the appointment routes must not query availability');
    },
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
    // All four id members carry the pattern, and each needs its own case: three of them were
    // unasserted until the mutation run said so, and a member whose pattern is dropped reaches
    // `bookAppointment` as arbitrary text and comes back a 422 instead of a 400.
    ['a non-uuid customerId', { ...VALID_BODY, customerId: 'nope' }],
    ['a non-uuid vehicleId', { ...VALID_BODY, vehicleId: 'nope' }],
    ['a non-uuid serviceTypeId', { ...VALID_BODY, serviceTypeId: 'nope' }],
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
      cancelAppointment: async () => ({ kind: 'not-found' }),
      rescheduleAppointment: async () => ({ kind: 'not-found' }),
      queryAvailability: (): never => {
        throw new Error('this test must not query availability');
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

  it('a member the 200 schema does not declare is STRIPPED — the schema is a WHITELIST', async () => {
    // The same control the 201 and the cancellation 200 already carry; the GET was the one route
    // without it. Emptying this route's `response` map changes nothing else observable — the 200
    // still renders and the 404 sets its own media type — so without this case an internal field
    // added to `AppointmentView` (a retry count, a lock key, an id from another table) would
    // reach every client of this route silently and become the contract by use.
    //
    // No cast and no production change: TypeScript's excess-property check fires on FRESH
    // literals at the use site, so a widened const assigns to `AppointmentView` cleanly.
    const internalNote = 'seeded by the reconciliation job';
    const WITH_EXTRA = { ...VIEW, internalNote, retryCount: 3 };

    const app = serverAnswering({ read: { kind: 'found', appointment: WITH_EXTRA } });
    const response = await app.inject({ method: 'GET', url: `/appointments/${APPOINTMENT_ID}` });

    expect(response.statusCode).toBe(200);
    // Sorted deliberately: key ORDER differs between the serialiser the schema compiles and the
    // fallback, and pinning it would assert an incidental fact about `fast-json-stringify`.
    expect(Object.keys(response.json() as object).sort()).toEqual([
      'bayId',
      'customerId',
      'dealershipId',
      'endsAt',
      'id',
      'serviceTypeId',
      'startsAt',
      'status',
      'technicianId',
      'vehicleId',
    ]);
  });
});

describe('POST /appointments/:id/cancellation — AC-3, AC-4', () => {
  const CANCELLED = { ...VIEW, status: 'cancelled' as const };

  async function cancel(app: FastifyInstance, id = APPOINTMENT_ID): Promise<LightMyRequestResponse> {
    // NO `content-type` AND NO PAYLOAD, exactly as `tests/support/booking.ts` sends it. The route
    // reads no body — the id is a path parameter and that is the whole input — and with AC-5 in
    // place a reflexive `application/json` on a bodyless POST is answered 400 (OQ-05-2, deferred
    // to slice 10). A test that set the header would be testing that friction, not this route.
    return await app.inject({ method: 'POST', url: `/appointments/${id}/cancellation` });
  }

  it('cancelled is 200 with the AppointmentView, as application/json', async () => {
    const response = await cancel(serverAnswering({ cancel: { kind: 'cancelled', appointment: CANCELLED } }));
    expect(response.statusCode).toBe(200);
    expect(response.statusCode, 'a cancellation is not a creation').not.toBe(201);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.json()).toEqual(CANCELLED);
  });

  it('the 200 says `cancelled`, and the response schema does not write it back to `confirmed`', async () => {
    // Measurement 8 again, from the other side: `AppointmentBody.status` is a UNION of literals
    // precisely so this route can render a value the booking route never produces. Under
    // `Type.Literal('confirmed')` this body would come back confirmed over a cancelled row and
    // every acceptance assertion downstream would pass.
    const response = await cancel(serverAnswering({ cancel: { kind: 'cancelled', appointment: CANCELLED } }));
    expect(response.json().status).toBe('cancelled');
  });

  it('not-found is 404 /problems/appointment-not-found — the arm D4 clause 3 watches', async () => {
    // §8.6 gains no row: the type slice 02 minted for `GET` is reused verbatim. The design names
    // a survivor on this switch as a MAJOR finding, because the outcome union has two members and
    // both are client-visible — an unasserted arm here is half the route.
    const response = await cancel(serverAnswering({ cancel: { kind: 'not-found' } }));
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(response.json().type).toBe('/problems/appointment-not-found');
    expect(response.json().status).toBe(404);
    expect(response.json().title).toBe('No such appointment');
    // The title AND the detail, because this file's own mutation history is that every string
    // literal in a route survived until something asserted it: a row whose detail became `""`
    // passes every status and `type` assertion above.
    expect(response.json().detail).toBe('no appointment exists with that id');
  });

  it('the id from the PATH is what reaches the use case', async () => {
    // Without this, a handler that passed a constant would answer 200 for every id and AC-4
    // would be the only thing that noticed — as a 404 arm that never fired.
    const other = '99999999-9999-4999-8999-999999999999';
    let seen: string | undefined;
    const app = serverAnswering({
      cancel: (id) => {
        seen = id;
        return { kind: 'cancelled', appointment: CANCELLED };
      },
    });
    await cancel(app, other);
    expect(seen).toBe(other);
  });

  it('AC-8 — a NON-uuid id is 400 before the use case runs, so 400 and 404 do not collide', async () => {
    let cancelRan = false;
    const app = serverAnswering({
      cancel: () => {
        cancelRan = true;
        return { kind: 'not-found' };
      },
    });

    const response = await cancel(app, 'not-a-uuid');
    expect(response.statusCode).toBe(400);
    expect(response.json().type).toBe('/problems/malformed-request');
    expect(cancelRan, 'the params schema must reject before any use case is called').toBe(false);
  });

  it('AC-3 at the edge — a replay renders a byte-identical body, because nothing here branches', async () => {
    const app = serverAnswering({ cancel: { kind: 'cancelled', appointment: CANCELLED } });
    const first = await cancel(app);
    const second = await cancel(app);
    expect(second.statusCode).toBe(200);
    expect(second.body).toBe(first.body);
  });

  it('the cancellation and the READ describe one appointment through one schema', async () => {
    // AC-2 (b) asserts this end to end. Here it is structural: both routes send an
    // `AppointmentView` through `AppointmentBody`, so a client parses one thing.
    const app = serverAnswering({
      cancel: { kind: 'cancelled', appointment: CANCELLED },
      read: { kind: 'found', appointment: CANCELLED },
    });
    const cancelled = await cancel(app);
    const read = await app.inject({ method: 'GET', url: `/appointments/${APPOINTMENT_ID}` });
    expect(read.json()).toEqual(cancelled.json());
  });

  it('a member the 200 schema does not declare is STRIPPED', async () => {
    // The `response` schema on this route is what does it, and without this assertion emptying
    // that schema changes NOTHING observable: the 200 still renders and the 404 sets its own
    // media type. An internal field added to `AppointmentView` — a retry count, a lock key —
    // would then reach every client of this route silently.
    const response = await cancel(
      serverAnswering({
        cancel: {
          kind: 'cancelled',
          appointment: { ...CANCELLED, internalAttempts: 7 },
        } as unknown as CancelOutcome,
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json() as object)).not.toContain('internalAttempts');
  });

  it('cancellation is a SUB-RESOURCE, not a DELETE — the appointment keeps its URL (ADR-0003)', async () => {
    // The shape of the API is the criterion here: `DELETE /appointments/{id}` would misdescribe
    // a status transition, and AC-2 exists because the appointment must still read afterwards.
    const app = serverAnswering({ cancel: { kind: 'cancelled', appointment: CANCELLED } });
    const deleted = await app.inject({ method: 'DELETE', url: `/appointments/${APPOINTMENT_ID}` });
    expect(deleted.statusCode).toBe(404);
  });
});

describe('PATCH /appointments/:id — slice 06, the exhaustive status mapping', () => {
  const MOVED = { ...VIEW, startsAt: '2026-09-08T09:15:00.000Z', endsAt: '2026-09-08T10:15:00.000Z' };

  async function patch(
    app: FastifyInstance,
    id = APPOINTMENT_ID,
    startsAt = MOVED.startsAt,
  ): Promise<LightMyRequestResponse> {
    return await app.inject({
      method: 'PATCH',
      url: `/appointments/${id}`,
      payload: { startsAt },
    });
  }

  it('moved is 200 with the AppointmentView, as application/json — not 201, a move creates nothing', async () => {
    const response = await patch(serverAnswering({ reschedule: { kind: 'moved', appointment: MOVED } }));
    expect(response.statusCode).toBe(200);
    expect(response.statusCode).not.toBe(201);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.json()).toEqual(MOVED);
  });

  it.each([
    ['not-found', { kind: 'not-found' } as RescheduleOutcome, 404, '/problems/appointment-not-found'],
    ['not-confirmed', { kind: 'not-confirmed' } as RescheduleOutcome, 409, '/problems/appointment-not-confirmed'],
    ['malformed-instant', { kind: 'malformed-instant' } as RescheduleOutcome, 400, '/problems/malformed-request'],
    [
      'outside-opening-hours',
      { kind: 'outside-opening-hours', verdict: { kind: 'closed-day', dayOfWeek: 0 } } as RescheduleOutcome,
      400,
      '/problems/outside-opening-hours',
    ],
    [
      'no-capacity',
      { kind: 'no-capacity', resource: 'bay', attempts: 5, exit: 'exhausted' } as unknown as RescheduleOutcome,
      409,
      '/problems/no-capacity',
    ],
    ['no-verdict', { kind: 'no-verdict' } as RescheduleOutcome, 500, '/problems/internal'],
    [
      'reference-data-invalid',
      { kind: 'reference-data-invalid', detail: 'dealership' } as RescheduleOutcome,
      500,
      '/problems/internal',
    ],
  ])('%s renders %d %s as problem+json', async (_label, outcome, status, type) => {
    const response = await patch(serverAnswering({ reschedule: outcome }));
    expect(response.statusCode).toBe(status);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(response.json().type).toBe(type);
    expect(response.json().status).toBe(status);
  });

  it('AC-4 — not-confirmed is a DIFFERENT type from a contended 409, so the two never collide', async () => {
    const notConfirmed = await patch(serverAnswering({ reschedule: { kind: 'not-confirmed' } }));
    const contended = await patch(
      serverAnswering({
        reschedule: { kind: 'no-capacity', resource: 'bay', attempts: 1, exit: 'capped' } as unknown as RescheduleOutcome,
      }),
    );
    expect(notConfirmed.statusCode).toBe(409);
    expect(contended.statusCode).toBe(409);
    expect(notConfirmed.json().type).not.toBe(contended.json().type);
  });

  it('AC-3 — outside-opening-hours is 400 and never 409, the same rule booking renders', async () => {
    const response = await patch(
      serverAnswering({
        reschedule: {
          kind: 'outside-opening-hours',
          verdict: { kind: 'outside-window', dayOfWeek: 2, opensAt: '09:00:00', closesAt: '17:00:00' },
        },
      }),
    );
    expect(response.statusCode).toBe(400);
    expect(response.statusCode).not.toBe(409);
    expect(response.json()).toMatchObject({ opensAt: '09:00:00', closesAt: '17:00:00' });
  });

  it('the id from the PATH and the startsAt from the BODY are what reach the use case', async () => {
    const other = '99999999-9999-4999-8999-999999999999';
    let seen: unknown;
    const app = serverAnswering({
      reschedule: (command) => {
        seen = command;
        return { kind: 'moved', appointment: MOVED };
      },
    });
    await patch(app, other, '2026-09-08T09:30:00.000Z');
    expect(seen).toEqual({ id: other, startsAtMillis: Date.parse('2026-09-08T09:30:00.000Z') });
  });

  it('AC-8 — a NON-uuid id is 400 before the use case runs, so 400 and 404 do not collide', async () => {
    let rescheduleRan = false;
    const app = serverAnswering({
      reschedule: () => {
        rescheduleRan = true;
        return { kind: 'not-found' };
      },
    });
    const response = await patch(app, 'not-a-uuid');
    expect(response.statusCode).toBe(400);
    expect(response.json().type).toBe('/problems/malformed-request');
    expect(rescheduleRan, 'the params schema must reject before any use case is called').toBe(false);
  });

  it('AC-6\'s structural argument — a bay or technician the client names is STRIPPED before the handler runs', async () => {
    // `additionalProperties: false` on `RescheduleBody`: there is no parameter on this path a
    // client could use to smuggle either in, so the field never reaches `request.body` at all.
    let seen: unknown;
    const app = serverAnswering({
      reschedule: (command) => {
        seen = command;
        return { kind: 'moved', appointment: MOVED };
      },
    });
    const response = await app.inject({
      method: 'PATCH',
      url: `/appointments/${APPOINTMENT_ID}`,
      payload: { startsAt: MOVED.startsAt, bayId: 'sneaked-in', technicianId: 'sneaked-in' },
    });
    expect(response.statusCode).toBe(200);
    expect(seen).toEqual({ id: APPOINTMENT_ID, startsAtMillis: Date.parse(MOVED.startsAt) });
  });

  it('a member the 200 schema does not declare is STRIPPED', async () => {
    const response = await patch(
      serverAnswering({
        reschedule: {
          kind: 'moved',
          appointment: { ...MOVED, internalAttempts: 7 },
        } as unknown as RescheduleOutcome,
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json() as object)).not.toContain('internalAttempts');
  });

  it('the moved appointment and the READ describe one appointment through one schema', async () => {
    const app = serverAnswering({
      reschedule: { kind: 'moved', appointment: MOVED },
      read: { kind: 'found', appointment: MOVED },
    });
    const moved = await patch(app);
    const read = await app.inject({ method: 'GET', url: `/appointments/${APPOINTMENT_ID}` });
    expect(read.json()).toEqual(moved.json());
  });
});

describe('setNotFoundHandler — ADR-0024, the second handler §8.6\'s totality is kept in', () => {
  it('a genuinely unmatched route is 404 /problems/route-not-found, not Fastify\'s bare default 404', async () => {
    const response = await serverAnswering({}).inject({ method: 'GET', url: '/nope-such-route-exists' });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(response.json().type).toBe('/problems/route-not-found');
    expect(response.json().status).toBe(404);
  });

  it('a real resource prefix with no matching sub-route is ALSO route-not-found, not a domain 404', async () => {
    // The control ADR-0024's warning names: this must not collide with `appointment-not-found`.
    const response = await serverAnswering({}).inject({
      method: 'GET',
      url: `/appointments/${APPOINTMENT_ID}/not-a-real-sub-resource`,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().type).toBe('/problems/route-not-found');
    expect(response.json().type).not.toBe('/problems/appointment-not-found');
  });
});

describe('a 500 the route KNOWS about is not an unhandled fault', () => {
  /**
   * `no-verdict` and `reference-data-invalid` render the same document as an escaped exception,
   * so from the body alone the three are indistinguishable — which is what the two `case` labels
   * surviving mutation said. The difference that matters is operational: a known outcome must not
   * be logged as `request.failed`, or the one line an operator greps for a genuine fault fires on
   * every deadlock and every mis-seeded dealership too.
   */
  it.each([
    ['no-verdict', { kind: 'no-verdict' } as BookOutcome],
    ['reference-data-invalid', { kind: 'reference-data-invalid', detail: 'unknown-zone' } as BookOutcome],
  ])('%s answers 500 without reaching the error handler', async (_label, outcome) => {
    const lines: string[] = [];
    const capturing = pino({ level: 'error' }, { write: (line: string): void => void lines.push(line) });
    const app = buildServer({
      logger: capturing,
      checkHealth: async (): Promise<HealthOutcome> => ({ kind: 'ok' }),
      bookAppointment: async () => outcome,
      readAppointment: async () => ({ kind: 'not-found' }),
      cancelAppointment: async () => ({ kind: 'not-found' }),
      rescheduleAppointment: async () => ({ kind: 'not-found' }),
      queryAvailability: (): never => {
        throw new Error('this test must not query availability');
      },
    });
    apps.push(app);

    const response = await post(app, VALID_BODY);
    expect(response.statusCode).toBe(500);
    expect(response.json().type).toBe('/problems/internal');
    expect(
      lines.join('\n'),
      'a known outcome must not be reported as an unhandled error',
    ).not.toContain('request.failed');
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
      cancelAppointment: async () => ({ kind: 'not-found' }),
      rescheduleAppointment: async () => ({ kind: 'not-found' }),
      queryAvailability: (): never => {
        throw new Error('this test must not query availability');
      },
    });
    apps.push(app);

    const response = await post(app, VALID_BODY);

    expect(response.statusCode).toBe(500);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(response.json().type).toBe('/problems/internal');
    // The client is told nothing it could act on — no SQLSTATE, no column name, no stack.
    expect(response.body).not.toContain('42703');
    expect(response.body).not.toContain('bya_id');
    // But the operator is. A 500 whose cause is nowhere is the failure this row exists to avoid,
    // and the line is asserted by its event name and its message as well as by the cause — the
    // three are what make it greppable, and all three survived mutation until this was written.
    expect(lines.join('\n')).toContain('42703');
    expect(lines.join('\n')).toContain('"event":"request.failed"');
    expect(lines.join('\n')).toContain('unhandled error');
    // The catch-all's own title and detail are contract text too, exactly as the routed rows' are.
    expect(response.json().title).toBe('The request could not be completed');
    expect(response.json().detail).toBe(
      'the service could not complete this request; the failure has been logged',
    );
  });

  it.each<[string, string | undefined]>([
    ['an EMPTY body (FST_ERR_CTP_EMPTY_JSON_BODY)', undefined],
    ['an UNPARSEABLE body (FST_ERR_CTP_INVALID_JSON_BODY)', '{oops'],
  ])(
    'AC-5 — %s with content-type: application/json is 400 /problems/malformed-request, on BOTH routes',
    async (_label, payload) => {
      // §8.6 CLAIMS TOTALITY, AND THIS IS THE CLAIM BEING KEPT. Measured on the pinned
      // fastify@5.12.1 — by the architect, the implementer and the test-engineer independently —
      // both errors carry `statusCode: 400` and NEITHER sets `validation`, so before this they
      // missed the validation arm and fell to the catch-all: `500 /problems/internal`, live on
      // the already-merged booking route. §8.6 justifies its 500 row with "a 4xx would tell a
      // service advisor to correct something they did not send and cannot see" — here the client
      // sent exactly that, can see it, and can correct it. The row was inverted.
      //
      // The content-type parser runs BEFORE the router (measured: even an unrouted path raises
      // it), which is why the cancellation route is included: a route reads no body and still
      // answers this.
      for (const url of [
        '/appointments',
        `/appointments/${APPOINTMENT_ID}/cancellation`,
      ]) {
        const response = await serverAnswering({}).inject({
          method: 'POST',
          url,
          headers: { 'content-type': 'application/json' },
          ...(payload === undefined ? {} : { payload }),
        });

        expect(response.statusCode, url).toBe(400);
        expect(response.statusCode, `${url} — the row that was inverted`).not.toBe(500);
        expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
        expect(response.json().type).toBe('/problems/malformed-request');
        expect(response.json().status).toBe(400);
        // The client is told what to fix, which is the entire argument for moving this off the
        // 500 row. Both Fastify messages name the header that made the body mandatory.
        expect(String(response.json().detail)).toContain('content-type');
      }
    },
  );

  it('AC-5 — and a malformed body is NOT logged as an unhandled fault', async () => {
    // It is the client's mistake, not the system's. If it reached `request.failed` the one line
    // an operator greps for a genuine fault would fire on every mistyped curl.
    const lines: string[] = [];
    const capturing = pino({ level: 'error' }, { write: (line: string): void => void lines.push(line) });
    const app = serverAnswering({ logger: capturing });

    const response = await app.inject({
      method: 'POST',
      url: '/appointments',
      headers: { 'content-type': 'application/json' },
      payload: '{oops',
    });

    expect(response.statusCode).toBe(400);
    expect(lines.join('\n')).not.toContain('request.failed');
  });

  it('AC-5 is named BY CODE — a DIFFERENT error carrying statusCode 400 is still a 500', async () => {
    // The predicate is two named codes, never `statusCode < 500`. This file already records that
    // a broader disjunction was deleted after mutation because no input reached its second arm;
    // widening it here would be the same mistake with a worse consequence — Fastify's other 4xx
    // codes have no §8.6 row, so the taxonomy would have to grow to meet the predicate rather
    // than the other way round. This is the case that fails if someone widens it.
    const app = serverAnswering({
      book: () => {
        throw Object.assign(new Error('some other 4xx'), {
          code: 'FST_ERR_SOMETHING_ELSE',
          statusCode: 400,
        });
      },
    });

    const response = await post(app, VALID_BODY);
    expect(response.statusCode).toBe(500);
    expect(response.json().type).toBe('/problems/internal');
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

describe('the response schemas ENFORCE rather than decorate (measurement 8, re-measured here)', () => {
  /**
   * Design §8 row 8 measured three response-schema forms on one field: `Type.Literal` SUBSTITUTES
   * silently, `Type.String({enum})` passes the wrong value through, and a UNION OF LITERALS is the
   * only one that both enforces and does not substitute. That measurement was taken on `type`;
   * these cases take it on the two other union-valued fields the taxonomy has, because a schema
   * that is only asserted where it is already right is decoration.
   *
   * Re-measured on this repository's pinned Fastify while writing them: a union of two literals
   * refuses a third value with `500 FST_ERR_FAILED_ERROR_SERIALIZATION`, and an EMPTY union lets
   * it through as if no schema were there. That difference is what these assert.
   */
  it('a `resource` outside {bay, technician} never reaches the client as a 409', async () => {
    // The failure mode is deliberately ugly and that is I-02-5's whole point: the schema enforces
    // by FAILING TO SERIALISE, which is why `/problems/internal` — the row that must never fail —
    // carries no schema at all. What must not happen is a 409 carrying an invented resource,
    // because ADR-0009 prunes on it and slice 09's metric is labelled by it.
    const response = await post(
      serverAnswering({
        book: { kind: 'no-capacity', resource: 'lift', attempts: 1 } as unknown as BookOutcome,
      }),
      VALID_BODY,
    );
    expect(response.statusCode).not.toBe(409);
    expect(response.body).not.toContain('lift');
  });

  it('a `status` outside {confirmed, cancelled} never reaches the client as a 201', async () => {
    const response = await post(
      serverAnswering({
        book: {
          kind: 'confirmed',
          appointment: { ...VIEW, status: 'pencilled-in' },
        } as unknown as BookOutcome,
      }),
      VALID_BODY,
    );
    expect(response.statusCode).not.toBe(201);
    expect(response.body).not.toContain('pencilled-in');
  });

  it('a member the schema does not declare is STRIPPED, on the view and on a problem', async () => {
    // `additionalProperties: false`. Without it an internal field added to `AppointmentView` — a
    // retry count, a lock key, an id from another table — reaches every client silently, and the
    // first anyone knows is when it becomes part of the contract by use.
    const confirmed = await post(
      serverAnswering({
        book: {
          kind: 'confirmed',
          appointment: { ...VIEW, internalAttempts: 7 },
        } as unknown as BookOutcome,
      }),
      VALID_BODY,
    );
    expect(confirmed.statusCode).toBe(201);
    expect(Object.keys(confirmed.json() as object)).not.toContain('internalAttempts');

    const refused = await post(
      serverAnswering({
        book: { kind: 'no-capacity', resource: 'bay', attempts: 7, leaked: 'x' } as unknown as BookOutcome,
      }),
      VALID_BODY,
    );
    expect(refused.statusCode).toBe(409);
    expect(Object.keys(refused.json() as object).sort()).toEqual([
      'detail',
      'resource',
      'status',
      'title',
      'type',
    ]);
  });
});

describe('problem() and PROBLEM_TYPES', () => {
  it('is exactly §8.6\'s nine in-scope rows, as of slice 06', () => {
    // I-06-1, corrected: this array is `as const`, and `@stryker-mutator/instrumenter` skips a
    // `TSAsExpression` subtree, so this assertion is a compiler-and-assertion fact rather than a
    // kill — `problem.ts` scores 9/12 with or without it. It stays mandatory anyway: it is what
    // would catch a DELETED row, since the mutation score cannot (F-06-2).
    expect([...PROBLEM_TYPES]).toEqual([
      '/problems/malformed-request',
      '/problems/outside-opening-hours',
      '/problems/appointment-not-found',
      '/problems/no-capacity',
      '/problems/unknown-reference',
      '/problems/vehicle-not-owned',
      '/problems/internal',
      '/problems/appointment-not-confirmed',
      '/problems/route-not-found',
    ]);
    expect(new Set(PROBLEM_TYPES).size, 'a duplicated row would make the taxonomy ambiguous').toBe(9);
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
