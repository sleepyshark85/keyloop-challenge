import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { uuidFor } from '../support/ids.js';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  at,
  bookingBody,
  describeAnswer,
  describeScenario,
  getAppointment,
  isoAt,
  member,
  occupy,
  postBooking,
  postCancellation,
  postRaw,
  postReschedule,
  seedScenario,
} from '../support/booking.js';
import type { HttpAnswer } from '../support/booking.js';

/**
 * QS-11 / AC-7 to AC-12 — the error taxonomy is total and stable.
 *
 * arc42 §8.6 · `docs/slices/02-design.md` §2.7, §5 · `docs/slices/06-design.md` §2.4 ·
 * ADR-0002, ADR-0017, ADR-0024.
 *
 *   AC-7   an out-of-hours interval is `400 /problems/outside-opening-hours`, NOT `409`
 *   AC-8   a malformed body is `400 /problems/malformed-request`, before any handler runs
 *   AC-9   an unknown dealership, service type, customer or vehicle is
 *          `422 /problems/unknown-reference` carrying `reference`, NOT `404`
 *   AC-10  a vehicle that is not the named customer's is `422 /problems/vehicle-not-owned`,
 *          NOT `403` — validation, not authorisation (ADR-0002)
 *   AC-11  a contended booking is `409 /problems/no-capacity` carrying `resource`
 *   AC-12  every row of §8.6's table is reachable, and no two rows collide
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT "EVERY ROW" MEANS HERE, AND WHY IT IS NINE, NOT SEVEN, AS OF SLICE 06.
 *
 * §8.6's table had eight rows at slice 02; `409 /problems/appointment-not-confirmed` needed
 * rescheduling and was that slice's out-of-scope, deferred here in a comment that named
 * slice 06 as the destination. It has arrived, and ADR-0024 adds a NINTH that §8.6 never
 * had at slice 02 at all: `404 /problems/route-not-found`, the residual `setNotFoundHandler`
 * closes (measured there: `GET /nope` used to answer bare Fastify JSON with no `type`,
 * reaching the error handler at all). Both land in ONE taxonomy change (design §2.4): the
 * two rows are added together, so `PROBLEM_TYPES` goes seven to nine in a single step rather
 * than being revisited a second time.
 *
 * `appointment-not-confirmed`'s full acceptance coverage — a cancelled appointment refused a
 * move, distinctly from a contended one — lives in
 * `tests/acceptance/reschedule-appointment.test.ts` AC-4; what this file adds is that row's
 * membership in the CLOSED set (AC-12's sweep, below). `route-not-found` has no other home:
 * it is exercised here directly, because nothing else in this slice's acceptance suite hits a
 * genuinely unmatched route.
 *
 * AC-4's METRIC HALF IS NOT ASSERTED ANYWHERE IN THIS SLICE (design §5): `booking_conflicts_
 * total` does not exist until slice 09, which carries "does not increment" as its own AC.
 *
 * Every row EXERCISED here, old and new: T-02-4 established at step 2 that `500 /problems/
 * internal` is reachable over HTTP through a dealership whose `time_zone` does not parse, so
 * this slice has no defended-but-unexercised row.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE FIXTURES ARE UNCONTENDED, DELIBERATELY — design §5.2, measurement 3.
 *
 * A request that is BOTH contended and carries a bad vehicle raises `23P01`, not `23503`:
 * exclusion constraints are enforced at index insertion during the tuple insert, while the
 * composite FK is an `AFTER ROW` trigger at end of statement, so the exclusion always wins.
 * That is a precedence between two co-occurring failures rather than a QS-11 collision — but
 * a case that stages both and asserts the `422` is asserting the wrong one. Every AC-9 and
 * AC-10 namespace below is therefore freshly seeded with no `appointment` row in it.
 */

/** The NINE §8.6 rows in scope as of slice 06, as `type` → status. Design §2.7, §2.4 `PROBLEM_TYPES`. */
const TAXONOMY: ReadonlyArray<readonly [string, number]> = [
  ['/problems/malformed-request', 400],
  ['/problems/outside-opening-hours', 400],
  ['/problems/appointment-not-found', 404],
  ['/problems/route-not-found', 404],
  ['/problems/no-capacity', 409],
  ['/problems/appointment-not-confirmed', 409],
  ['/problems/unknown-reference', 422],
  ['/problems/vehicle-not-owned', 422],
  ['/problems/internal', 500],
];

/**
 * Assert the three things every row of the taxonomy owes a client, in one place: the status,
 * the media type, and the `type`. RFC 9457 is the contract, and `application/problem+json`
 * is half of it — a `400` carrying the right `type` as `application/json` is a client that
 * has to sniff.
 */
function expectProblem(answer: HttpAnswer, status: number, type: string, context: string): void {
  expect(answer.status, `${context}\n${describeAnswer(answer)}`).toBe(status);
  expect(
    answer.contentType,
    `${context} — RFC 9457 media type\n${describeAnswer(answer)}`,
  ).toMatch(/application\/problem\+json/);
  expect(member(answer, 'type'), `${context} — the taxonomy type\n${describeAnswer(answer)}`).toBe(
    type,
  );
  expect(member(answer, 'status'), `${context} — RFC 9457 repeats the status`).toBe(status);
}

async function withService<T>(
  run: (service: StartedService) => Promise<T>,
): Promise<T | undefined> {
  const attempt = await startService({ databaseUrl: inject('databaseUrl') });
  expect(attempt.failure ?? 'started', `the service did not start.\n${attempt.failure}`).toBe(
    'started',
  );
  const service = attempt.service;
  if (service === undefined) return undefined;
  try {
    return await run(service);
  } finally {
    await service.stop();
  }
}

describe('QS-11 — the error taxonomy is total and stable', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('AC-7 — an out-of-hours interval is 400 /problems/outside-opening-hours, and not 409', async () => {
    // GC-1: the decision is made by `domain/openingHours.ts`, which reads no booking. The
    // fixture has a completely free bay and a completely free technician, so a `409` here
    // would mean capacity was consulted for a question that is not about capacity.
    const scenario = await seedScenario(client, 'tax-hours', {
      bays: 1,
      technicians: 1,
      hours: { opensAt: '09:00:00', closesAt: '17:00:00' },
    });

    await withService(async (service) => {
      const answer = await postBooking(service, {
        ...bookingBody(scenario),
        startsAt: isoAt(780), // 23:00 local
      });
      expectProblem(
        answer,
        400,
        '/problems/outside-opening-hours',
        `AC-7 — 23:00 local against 09:00-17:00, with the bay and technician both free\n${describeScenario(scenario)}`,
      );
      expect(
        answer.status,
        'AC-7 names this explicitly: out-of-hours is NOT a capacity conflict',
      ).not.toBe(409);
    });
  });

  it('AC-8 — a malformed body is 400 /problems/malformed-request, rejected by the route schema', async () => {
    const scenario = await seedScenario(client, 'tax-malformed', { bays: 1, technicians: 1 });

    await withService(async (service) => {
      // (a) An unparseable timestamp. Measured in design §8 row 7: a body failing the
      // RFC 3339 pattern is answered `400` as `application/problem+json` and the handler
      // never runs.
      expectProblem(
        await postBooking(service, { ...bookingBody(scenario), startsAt: 'not-a-timestamp' }),
        400,
        '/problems/malformed-request',
        'AC-8 — an unparseable startsAt',
      );

      // (b) A missing required member.
      const withoutVehicle = { ...bookingBody(scenario) };
      delete withoutVehicle['vehicleId'];
      expectProblem(
        await postBooking(service, withoutVehicle),
        400,
        '/problems/malformed-request',
        'AC-8 — a body missing vehicleId',
      );

      // (c) A path segment that is not a uuid. Design §2.7 pins the path schema so that a
      // malformed id is `400` and only a WELL-FORMED unknown id is AC-2's `404` — without
      // it the two failures share a status and QS-11's "no two rows collide" is untestable
      // on this pair.
      expectProblem(
        await getAppointment(service, 'not-a-uuid'),
        400,
        '/problems/malformed-request',
        'AC-8 — a non-uuid path segment',
      );
    });
  });

  it('AC-9 — an unknown dealership, service type, customer or vehicle is 422 /problems/unknown-reference carrying reference, and not 404', async () => {
    const scenario = await seedScenario(client, 'tax-unknown', {
      bays: 1,
      technicians: 1,
      customers: 1,
    });
    const absent = (what: string): string => uuidFor('tax-unknown', `absent/${what}`);

    await withService(async (service) => {
      const cases: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
        ['dealership', { ...bookingBody(scenario), dealershipId: absent('dealership') }],
        ['service-type', { ...bookingBody(scenario), serviceTypeId: absent('service-type') }],
        ['customer', { ...bookingBody(scenario), customerId: absent('customer') }],
        ['vehicle', { ...bookingBody(scenario), vehicleId: absent('vehicle') }],
      ];

      for (const [reference, body] of cases) {
        const answer = await postBooking(service, body);
        expectProblem(
          answer,
          422,
          '/problems/unknown-reference',
          `AC-9 — an unknown ${reference}\n${describeScenario(scenario)}`,
        );
        // `reference` is what makes the row usable by a client: four failures share one
        // `type`, and without the member the caller is told only that "something" was
        // unknown.
        expect(
          member(answer, 'reference'),
          `AC-9 — the 422 must name WHICH reference was unknown.\n${describeAnswer(answer)}`,
        ).toBe(reference);
        expect(answer.status, 'AC-9 names this explicitly: an unknown reference is not a 404').not.toBe(
          404,
        );
      }
    });
  });

  it("AC-10 — a vehicle that is not the named customer's is 422 /problems/vehicle-not-owned, and not 403", async () => {
    // ADR-0017: the three failures sharing `appointment_vehicle_owned_by_customer` are
    // separated AFTER the insert is refused, never by a pre-flight check. This case and the
    // `customer`/`vehicle` rows of AC-9 above are the three, and QS-11 requires this one to
    // carry a DIFFERENT `type` from those two — which is the whole reason the
    // disambiguating step is structurally required rather than a design preference.
    const scenario = await seedScenario(client, 'tax-not-owned', {
      bays: 1,
      technicians: 1,
      customers: 2,
    });

    await withService(async (service) => {
      const answer = await postBooking(service, {
        ...bookingBody(scenario, { customerIndex: 0 }),
        vehicleId: scenario.customers[1]?.vehicleId,
      });
      expectProblem(
        answer,
        422,
        '/problems/vehicle-not-owned',
        `AC-10 — customer 0 naming customer 1's vehicle\n${describeScenario(scenario)}`,
      );
      expect(answer.status, 'ADR-0002 — validation, not authorisation').not.toBe(403);
      expect(
        member(answer, 'type'),
        'AC-10 must not collide with AC-9: both are 422, so the type is the only thing separating them',
      ).not.toBe('/problems/unknown-reference');
    });
  });

  it('AC-11 — when the bay list empties, the 409 carries resource=bay', async () => {
    // One bay, three technicians, and the bay occupied by the third. Under ADR-0009's
    // shuffle the draw is (the only bay, whichever technician this request's permutation put
    // first) — and the bay is a SINGLETON, so every permutation contends it. The attempt is
    // refused `no_bay_overlap`, prunes THAT BAY (per value, T-02-1), finds the bay list empty
    // and refuses, so `resource` is the list that emptied: the scarce resource and not the
    // abundant one. That distinction is the whole of E-02-1, and it is permutation-safe here
    // for the reason `tests/support/booking.ts` states at `seedScenario`.
    const scenario = await seedScenario(client, 'tax-cap-bay', { bays: 1, technicians: 3 });
    await occupy(client, scenario, {
      label: 'bay',
      bayId: scenario.bayIds[0] as string,
      technicianId: scenario.technicianIds[2] as string,
      startsAt: at(0),
      endsAt: at(60),
    });

    await withService(async (service) => {
      const answer = await postBooking(service, bookingBody(scenario));
      expectProblem(
        answer,
        409,
        '/problems/no-capacity',
        `AC-11 — the only bay is taken; two technicians are free\n${describeScenario(scenario)}`,
      );
      expect(
        member(answer, 'resource'),
        `AC-11 — the contended resource is the BAY. 'technician' here is the systematic ` +
          `mis-naming E-02-1 was ruled on: two technicians are demonstrably free.\n${describeAnswer(answer)}`,
      ).toBe('bay');
    });
  });

  it('AC-11 — when the technician list empties, the 409 carries resource=technician', async () => {
    // The mirror image, and it is not redundant. Slice 02 justified it by saying the FIRST
    // attempt violates both constraints and PostgreSQL names `no_bay_overlap` (design §8,
    // measurements 1-2 — index creation order), so only the loop could reach the truth about
    // which resource was scarce. ADR-0009's Order-C narrowed that: the three bays are the
    // ABUNDANT list, so the first draw lands on the occupied bay only 1 time in 3.
    //
    // The ASSERTION is unaffected, because it is terminal — the technician list is the
    // singleton, so it is the one that must empty under every permutation and `resource` is
    // `technician` either way. What changed is what the case DISCRIMINATES: a loop-less build
    // is caught here in 1 run in 3, not every run. `tests/acceptance/candidate-retry.test.ts`
    // AC-3, which blocks the whole abundant list, catches it deterministically (I-04-10).
    const scenario = await seedScenario(client, 'tax-cap-tech', { bays: 3, technicians: 1 });
    await occupy(client, scenario, {
      label: 'tech',
      bayId: scenario.bayIds[0] as string,
      technicianId: scenario.technicianIds[0] as string,
      startsAt: at(0),
      endsAt: at(60),
    });

    await withService(async (service) => {
      const answer = await postBooking(service, bookingBody(scenario));
      expectProblem(
        answer,
        409,
        '/problems/no-capacity',
        `AC-11 — the only technician is taken; two bays are free\n${describeScenario(scenario)}`,
      );
      expect(
        member(answer, 'resource'),
        `AC-11 — the contended resource is the TECHNICIAN. 'bay' here is exactly the defect ` +
          `E-02-1 names: bays 1 and 2 are free and the request was told the bay was the problem.\n${describeAnswer(answer)}`,
      ).toBe('technician');
    });
  });

  /* ────────────────────────────────────────────────────────────── slice 06, ADR-0024 ──
   *
   * THE HOSTILE CORPUS. Measured at slice 06 step 1 against merged code, before this route
   * existed: `GET /nope` answered `404 application/json` with NO `type` at all — Fastify's
   * OWN default not-found body, never reaching `setErrorHandler`. §8.6's residual invariant
   * — every response with status >= 400 is `problem+json` carrying a `type` from the closed
   * set — was false for exactly this request. ADR-0024 rules it: register
   * `setNotFoundHandler`, and give the row a name.
   *
   * ASSERTED IN THE DIRECTION THAT CAN FAIL (∀responses ∃row), per the design's own framing:
   * this is not "does route-not-found look right", it is "does a genuinely unmatched path
   * still answer inside the taxonomy" — the same shape the residual invariant demands of
   * every other response in this file.
   */
  it('ADR-0024 — a genuinely unmatched route is 404 /problems/route-not-found, not Fastify\'s bare default 404', async () => {
    await withService(async (service) => {
      // Two independent unmatched paths, neither ever registered by any route in this
      // service — the corpus is not a single accident of one shape of URL.
      const nope = await postRaw(service, '/nope-such-route-exists', {});
      expectProblem(
        nope,
        404,
        '/problems/route-not-found',
        'ADR-0024 — a path no route registers',
      );

      const alsoNope = await postRaw(
        service,
        `/appointments/${uuidFor('adr-0024-hostile', 'x')}/not-a-real-verb`,
        {},
      );
      expectProblem(
        alsoNope,
        404,
        '/problems/route-not-found',
        'ADR-0024 — a real resource prefix with no matching sub-route',
      );
    });
  });

  it('AC-12 — every row of §8.6 in scope for this slice is reachable, produces that status and that type, and no two collide', async () => {
    // The sweep. Each row is reached by its own fixture in one service, and the OBSERVED set
    // of (status, type) pairs is then compared to §8.6's table as a SET — so a row that has
    // become unreachable fails here even if every individual case above was deleted, and a
    // row that has acquired a second status fails too.
    const inHours = await seedScenario(client, 'tax-total-ok', { bays: 1, technicians: 2 });
    const notOwned = await seedScenario(client, 'tax-total-owned', {
      bays: 1,
      technicians: 1,
      customers: 2,
    });
    const outOfHours = await seedScenario(client, 'tax-total-hours', {
      bays: 1,
      technicians: 1,
      hours: { opensAt: '09:00:00', closesAt: '17:00:00' },
    });
    const contended = await seedScenario(client, 'tax-total-cap', { bays: 1, technicians: 2 });
    await occupy(client, contended, {
      label: 'cap',
      bayId: contended.bayIds[0] as string,
      technicianId: contended.technicianIds[1] as string,
      startsAt: at(0),
      endsAt: at(60),
    });
    // T-02-4's route to the `500`: broken reference data, which is the SYSTEM's fault and so
    // `/problems/internal` rather than a `4xx` telling the caller to correct something
    // they did not send and cannot see (design §2.7, OQ-02-2 closed).
    const brokenZone = await seedScenario(client, 'tax-total-zone', {
      bays: 1,
      technicians: 1,
      timeZone: 'Not/AZone',
    });
    // Slice 06's two new rows (design §2.4). `notConfirmed` needs a CANCELLED appointment to
    // move; `appointment-not-confirmed`'s own full acceptance coverage is
    // `tests/acceptance/reschedule-appointment.test.ts` AC-4 — this fixture exists only so
    // the row can be swept into the CLOSED-SET comparison below.
    const notConfirmed = await seedScenario(client, 'tax-total-notconfirmed', {
      bays: 1,
      technicians: 1,
    });

    await withService(async (service) => {
      const observed: Array<{ readonly row: string; readonly status: number; readonly type: unknown }> =
        [];

      const record = async (row: string, answer: HttpAnswer): Promise<void> => {
        expect(
          answer.transportFailure ?? 'completed',
          `AC-12 row "${row}" did not complete`,
        ).toBe('completed');
        expect(
          answer.contentType,
          `AC-12 row "${row}" must be problem+json\n${describeAnswer(answer)}`,
        ).toMatch(/application\/problem\+json/);
        observed.push({ row, status: answer.status as number, type: member(answer, 'type') });
      };

      await record(
        'malformed-request',
        await postBooking(service, { ...bookingBody(inHours), startsAt: 'nope' }),
      );
      await record(
        'outside-opening-hours',
        await postBooking(service, { ...bookingBody(outOfHours), startsAt: isoAt(780) }),
      );
      await record(
        'appointment-not-found',
        await getAppointment(service, uuidFor('tax-total', 'absent')),
      );
      await record('no-capacity', await postBooking(service, bookingBody(contended)));
      await record(
        'unknown-reference',
        await postBooking(service, {
          ...bookingBody(inHours),
          serviceTypeId: uuidFor('tax-total', 'absent-service-type'),
        }),
      );
      await record(
        'vehicle-not-owned',
        await postBooking(service, {
          ...bookingBody(notOwned, { customerIndex: 0 }),
          vehicleId: notOwned.customers[1]?.vehicleId,
        }),
      );
      // The `500` renders through the ONE status that carries no response schema (design
      // §2.7, I-02-5, measurements 14-15): a schema on the catch-all can fail its own
      // serialisation and produce a `FST_ERR_FAILED_ERROR_SERIALIZATION` that is neither
      // problem+json nor the right status — the backstop becoming the defect. The
      // content-type assertion in `record` is what would catch that.
      await record('internal', await postBooking(service, bookingBody(brokenZone)));

      // Slice 06's two new rows.
      const bookedToCancel = await postBooking(service, bookingBody(notConfirmed));
      expect(
        bookedToCancel.status,
        `AC-12 ARRANGE — the appointment-not-confirmed fixture was not booked.\n${describeAnswer(bookedToCancel)}`,
      ).toBe(201);
      const cancelledId = String(member(bookedToCancel, 'id'));
      const wasCancelled = await postCancellation(service, cancelledId);
      expect(
        wasCancelled.status,
        `AC-12 ARRANGE — the appointment-not-confirmed fixture was not cancelled.\n${describeAnswer(wasCancelled)}`,
      ).toBe(200);
      await record(
        'appointment-not-confirmed',
        await postReschedule(service, cancelledId, isoAt(120)),
      );
      await record(
        'route-not-found',
        await postRaw(service, '/appointments/not-a-real-sub-resource', {}),
      );

      const pairs = observed
        .map((o) => `${String(o.status)} ${String(o.type)}`)
        .sort();
      expect(
        pairs,
        'AC-12 — the observed (status, type) pairs must be exactly §8.6\'s nine in-scope rows.\n' +
          observed.map((o) => `  ${o.row.padEnd(24)} -> ${String(o.status)} ${String(o.type)}`).join('\n'),
      ).toEqual([...TAXONOMY].map(([type, status]) => `${String(status)} ${type}`).sort());

      // NO TWO ROWS COLLIDE, in the direction that matters: a `type` may not appear with two
      // different statuses. (The converse — two types sharing a status — is intended: `400`
      // and `422` each carry two rows, which is exactly why the `type` is the contract.)
      const statusesByType = new Map<string, Set<number>>();
      for (const o of observed) {
        const key = String(o.type);
        const set = statusesByType.get(key) ?? new Set<number>();
        set.add(o.status);
        statusesByType.set(key, set);
      }
      expect(
        [...statusesByType.entries()]
          .filter(([, statuses]) => statuses.size > 1)
          .map(([type, statuses]) => `${type}: ${[...statuses].join(', ')}`),
        'AC-12 — a type carrying two statuses is a client that cannot branch on it',
      ).toEqual([]);
    });
  });

  /* ─────────────────────────────────────────────────────────────────────── AC-5, slice 05 ──
   *
   * §8.6 CLAIMS TOTALITY. THESE TWO CASES ARE THAT CLAIM BEING KEPT, AND IT WAS NOT.
   *
   * `docs/slices/05-cancellation.md` AC-5 · `docs/slices/05-design.md` §4 · arc42 §8.6.
   *
   * Measured three times independently — by the architect, by the implementer, and again by
   * this role on the pinned `fastify@5.12.1` — a `POST` carrying `content-type:
   * application/json` and NO body, and the same header with an unparseable body, are raised by
   * Fastify's content-type parser as `FST_ERR_CTP_EMPTY_JSON_BODY` and
   * `FST_ERR_CTP_INVALID_JSON_BODY`. Both carry `statusCode: 400`; NEITHER sets `validation`.
   * `server.ts`'s `400` arm keys on `validation !== undefined`, so both miss it and fall to the
   * catch-all: `500 /problems/internal`, TODAY, on the already-merged booking route.
   *
   * §8.6 justifies its `500` row with "a 4xx would tell the caller to correct something
   * they did not send and cannot see". Here the client sent exactly that, can see it, and can
   * correct it. The row is inverted, and AC-5 is the ruling: both codes map to the EXISTING
   * `400 /problems/malformed-request`. No new status, no new type, no new `Problem` member —
   * a taxonomy that absorbs an operation without growing is evidence it was drawn correctly.
   *
   * THE TWO CASES ARE SPLIT BY WHICH ROUTE THEY PROBE, AND MEASURING THE RED CORRECTED WHAT
   * THIS COMMENT FIRST CLAIMED. The expectation was that the booking route would fail on the
   * content-type-parser path and the cancellation route on ROUTING, since it does not exist
   * yet. It does not: Fastify runs the content-type parser BEFORE the router, so an empty or
   * unparseable JSON body addressed to a route that has never been registered is still
   * `FST_ERR_CTP_EMPTY_JSON_BODY` and still falls to the catch-all. Both cases were observed
   * red at `500 /problems/internal`, neither at `404`:
   *
   *   POST /appointments                        500 /problems/internal   (the merged route)
   *   POST /appointments/{id}/cancellation      500 /problems/internal   (no such route)
   *
   * So BOTH halves of AC-5 are regression evidence about behaviour that is live today, and
   * neither is the routing failure the rest of this slice reds on. They stay two cases because
   * they will diverge once the route ships — the second then also asserts that the new route
   * did not arrive with the hole — but no claim here rests on the route being absent.
   *
   * UPDATE, SLICE 09 (`I-09-3`): AC-6b supersedes the empty-body half OF THE CANCELLATION
   * ROUTE ONLY, by name — it maps an empty body to `undefined` in the content-type parser
   * rather than rejecting it, for any route that reads no body, which the cancellation route
   * is. So the cancellation route's two bodies below split again: the unparseable body stays
   * in `MALFORMED_BODIES` and 400 here; the empty body leaves it, runs the route, and is
   * asserted as its own 404 `/problems/appointment-not-found` case just below. The booking
   * route reads a real body, so both of ITS cases are untouched by AC-6b and stay as one case.
   *
   * `postRaw` rather than `postBooking`: `JSON.stringify` cannot express "no body at all", and
   * both errors are raised before any route schema runs, so no value of a well-formed body can
   * reach them.
   */

  /** AC-5's two inputs, both against `content-type: application/json`. */
  const MALFORMED_BODIES: ReadonlyArray<readonly [string, string | undefined]> = [
    ['no body at all (FST_ERR_CTP_EMPTY_JSON_BODY)', undefined],
    ['an unparseable body (FST_ERR_CTP_INVALID_JSON_BODY)', '{oops'],
  ];

  it('AC-5 — on the ALREADY-MERGED POST /appointments, an empty or unparseable JSON body is 400 /problems/malformed-request and not 500', async () => {
    await withService(async (service) => {
      for (const [label, body] of MALFORMED_BODIES) {
        const answer = await postRaw(service, '/appointments', {
          contentType: 'application/json',
          ...(body === undefined ? {} : { body }),
        });

        expect(
          answer.status,
          `AC-5 — ${label}. A 500 here is the defect as it stands on merged code: the error ` +
            `carries statusCode 400 but no \`validation\`, so server.ts's 400 arm misses it ` +
            `and the catch-all answers. A 404 would mean POST /appointments has gone missing, ` +
            `which is a different failure entirely.\n${describeAnswer(answer)}`,
        ).toBe(400);
        expectProblem(answer, 400, '/problems/malformed-request', `AC-5 — ${label}`);
        expect(
          member(answer, 'type'),
          `AC-5 — and it must NOT be the internal-error row. §8.6's 500 is for a fault the ` +
            `client cannot see or correct; this one it sent.\n${describeAnswer(answer)}`,
        ).not.toBe('/problems/internal');
      }
    });
  });

  it('AC-5 — and on the cancellation route, an unparseable body is still 400 /problems/malformed-request', async () => {
    // MEASURED AT THE RED COMMIT (slice 05): this was a 500, not a 404. Fastify consults the
    // content-type parser BEFORE the router, so an unparseable body is rejected before
    // anything discovers that no such route exists — which makes this a claim about behaviour
    // that is live today rather than one waiting on the route. Once the route ships it keeps
    // the route from arriving with the same hole.
    //
    // The empty-body half of AC-5's original pair moved below (I-09-3): AC-6b superseded it
    // by name — an empty body on a route that reads no body, like this one, is no longer
    // malformed at all, so it never reaches this assertion.
    const id = uuidFor('ac5-cancel-malformed', 'never-booked');

    await withService(async (service) => {
      const answer = await postRaw(service, `/appointments/${id}/cancellation`, {
        contentType: 'application/json',
        body: '{oops',
      });

      // The BODY is malformed, so it is answered before the id is ever looked up: this is
      // 400 and not the 404 that AC-4's unknown id earns. Two rows of §8.6 that must not
      // collide on one request.
      expectProblem(
        answer,
        400,
        '/problems/malformed-request',
        `AC-5 — an unparseable body (FST_ERR_CTP_INVALID_JSON_BODY), on POST ` +
          `/appointments/{id}/cancellation. A 500 is the observed red: the content-type ` +
          `parser answers before the router does, so this is the same defect as the case ` +
          `above and not a missing-route failure. A 404 would mean the parser stopped ` +
          `running first, which no version of this fix should cause.`,
      );
    });
  });

  it('AC-5 / AC-6b — and an empty body on the cancellation route is no longer malformed: it runs the route, which reports the id was never booked', async () => {
    // I-09-3: AC-6b's remedy maps an empty body to `undefined` in the content-type parser
    // rather than rejecting it, so a route that reads no body — the cancellation route is one
    // — legitimately runs on an empty body and answers on the merits. For a never-booked id
    // that merit is 404 /problems/appointment-not-found, not the 400 this route used to pin.
    const id = uuidFor('ac5-cancel-malformed', 'never-booked');

    await withService(async (service) => {
      const answer = await postRaw(service, `/appointments/${id}/cancellation`, {
        contentType: 'application/json',
      });

      expectProblem(
        answer,
        404,
        '/problems/appointment-not-found',
        `AC-5 / AC-6b — no body at all (was FST_ERR_CTP_EMPTY_JSON_BODY, now \`undefined\`), ` +
          `on POST /appointments/{id}/cancellation. The parser no longer rejects an empty ` +
          `body, so the route runs and correctly reports that this id was never booked — a ` +
          `400 here would mean AC-6b's remedy regressed back to rejecting it.`,
      );
    });
  });
});
