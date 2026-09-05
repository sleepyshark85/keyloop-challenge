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
  seedScenario,
} from '../support/booking.js';
import type { HttpAnswer } from '../support/booking.js';

/**
 * QS-11 / AC-7 to AC-12 — the error taxonomy is total and stable.
 *
 * arc42 §8.6 · `docs/slices/02-design.md` §2.7, §5 · ADR-0002, ADR-0017.
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
 * WHAT "EVERY ROW" MEANS HERE, AND WHY IT IS SEVEN AND NOT EIGHT.
 *
 * §8.6's table has eight rows. `409 /problems/appointment-not-confirmed` needs rescheduling
 * and is the slice file's out-of-scope — it lands with slice 06 and extends this file. The
 * seven in scope are `PROBLEM_TYPES` in design §2.7, and every one of them is EXERCISED
 * here: T-02-4 established at step 2 that `500 /problems/internal` is reachable over HTTP
 * through a dealership whose `time_zone` does not parse, so this slice has no
 * defended-but-unexercised row.
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

/** The seven §8.6 rows in scope for this slice, as `type` → status. Design §2.7 `PROBLEM_TYPES`. */
const TAXONOMY: ReadonlyArray<readonly [string, number]> = [
  ['/problems/malformed-request', 400],
  ['/problems/outside-opening-hours', 400],
  ['/problems/appointment-not-found', 404],
  ['/problems/no-capacity', 409],
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
        // `type`, and without the member a service advisor is told only that "something" was
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
    // One bay, three technicians, and the bay occupied by the third. The booking attempts
    // (bay 0, technician 0), is refused `no_bay_overlap`, prunes THAT BAY (per value, T-02-1),
    // finds the bay list empty and refuses — so `resource` is the list that emptied, which is
    // the scarce resource and not the abundant one. That distinction is the whole of E-02-1.
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
    // The mirror image, and it is not redundant: with three bays and one technician the FIRST
    // attempt violates both constraints and PostgreSQL names `no_bay_overlap` (design §8,
    // measurements 1-2 — index creation order). Only the retry loop turns that into the truth
    // about which resource was scarce. Without the loop this case reports `bay` while two
    // bays sit empty, and `booking_conflicts_total{resource}` inherits the lie at slice 09.
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
    // `/problems/internal` rather than a `4xx` telling a service advisor to correct something
    // they did not send and cannot see (design §2.7, OQ-02-2 closed).
    const brokenZone = await seedScenario(client, 'tax-total-zone', {
      bays: 1,
      technicians: 1,
      timeZone: 'Not/AZone',
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

      const pairs = observed
        .map((o) => `${String(o.status)} ${String(o.type)}`)
        .sort();
      expect(
        pairs,
        'AC-12 — the observed (status, type) pairs must be exactly §8.6\'s seven in-scope rows.\n' +
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
});
