import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import { uuidFor } from '../support/ids.js';
import {
  at,
  bookingBody,
  describeAnswer,
  describeScenario,
  getAvailability,
  getAvailabilityWithParams,
  isoAt,
  member,
  occupy,
  postBooking,
  postCancellation,
  seedScenario,
} from '../support/booking.js';
import type { BookingBody, HttpAnswer } from '../support/booking.js';

/**
 * AC-1 through AC-4, AC-7 — `docs/slices/16-availability-derives-its-own-window.md`,
 * `docs/slices/16-design.md` · arc42 §6.5, §8.6, §10.2, §11.1 · ADR-0039.
 *
 * AC-5 (QS-8, the property that ties the query to the constraint) is
 * `tests/property/availability-agrees-with-constraint.db.test.ts`. AC-6 (the performance
 * budget) is `tests/performance/availability-budget.test.ts`. AC-3's contract half (the
 * emitted `docs/api/openapi.json` declares exactly three query parameters and the closed
 * problem-type set) and AC-7's document half (the `200` schema requires `startsAt`/`endsAt`)
 * are `tests/contract/openapi-document.test.ts`. This file carries the two endpoints' live,
 * black-box behaviour: what `GET /availability` and `POST /appointments` actually answer.
 *
 * This file SUPERSEDES slice 08's version at the same path (`docs/slices/08-availability-
 * query.md`'s old AC-2 through AC-6): the querystring shape changed underneath it (ADR-0039,
 * "replaced not extended"), so every case here is rewritten against `startsAt` rather than
 * amended in place — the old `from`/`to` cases (a confirmed appointment makes its bay
 * unavailable over an overlapping window; a technician qualified elsewhere is never returned;
 * cancelling frees the resources it held; `to <= from` is malformed) do not disappear as
 * FACTS, they are subsumed: AC-1 below is exactly the overlap/back-to-back distinction, driven
 * through `startsAt` instead of a caller-chosen window, and AC-4's cancellation-frees-resources
 * fact is unconditionally exercised as part of AC-1's own flow so each case starts clean.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * AC-7 IS PARTLY UNASSERTABLE HERE, AND THAT IS RECORDED RATHER THAN WORKED AROUND — carried
 * forward from slice 08's own note. Neither the slice file nor the design's `AvailabilityOutcome`
 * sketch pins an exact wire field name or wording for the disclosure; inventing one here would
 * be this role deciding the wire contract rather than the architect. What is asserted instead
 * is substance a correct implementation cannot avoid carrying under any reasonable naming: a
 * boolean `advisory` member, the two facts present as free text ANYWHERE in the body (matched
 * by keyword, not exact phrase), and — new to slice 16 — `startsAt`/`endsAt` present as
 * strings in the SAME response, because AC-7's whole point is that the interval disclosed is
 * now the one this response names. If the implementer's shape genuinely cannot satisfy this,
 * that is a DCR against this assumption — not a licence to leave the disclosure out.
 */

const ADVISORY_FIELD = 'advisory';

function stringArray(answer: HttpAnswer, name: string): readonly string[] {
  const body = answer.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return [];
  const value = (body as Record<string, unknown>)[name];
  return Array.isArray(value) ? value.map(String) : [];
}

function bays(answer: HttpAnswer): readonly string[] {
  return stringArray(answer, 'bays');
}

function technicians(answer: HttpAnswer): readonly string[] {
  return stringArray(answer, 'technicians');
}

function expectProblem(answer: HttpAnswer, status: number, type: string, context: string): void {
  expect(answer.status, `${context}\n${describeAnswer(answer)}`).toBe(status);
  expect(
    answer.contentType,
    `${context} — RFC 9457 media type\n${describeAnswer(answer)}`,
  ).toMatch(/application\/problem\+json/);
  expect(member(answer, 'type'), `${context} — the taxonomy type\n${describeAnswer(answer)}`).toBe(
    type,
  );
}

/**
 * AC-4's own shape: run the SAME (dealershipId, serviceTypeId, startsAt) triple — the booking
 * additionally valid on customer/vehicle — through both endpoints and require the SAME status
 * and the SAME `type`. `expectedReference`, when given, is checked on BOTH answers too (the
 * `reference` member of `/problems/unknown-reference`).
 */
async function expectAgreement(
  service: StartedService,
  context: string,
  availabilityQuery: { readonly dealershipId: string; readonly serviceTypeId: string; readonly startsAt: string },
  booking: BookingBody,
  expectedStatus: number,
  expectedType: string,
  expectedReference?: string,
): Promise<void> {
  const availabilityAnswer = await getAvailability(service, availabilityQuery);
  const bookingAnswer = await postBooking(service, booking);

  expect(
    availabilityAnswer.status,
    `${context} — GET /availability status\n${describeAnswer(availabilityAnswer)}`,
  ).toBe(expectedStatus);
  expect(
    member(availabilityAnswer, 'type'),
    `${context} — GET /availability type\n${describeAnswer(availabilityAnswer)}`,
  ).toBe(expectedType);
  expect(
    bookingAnswer.status,
    `${context} — POST /appointments status\n${describeAnswer(bookingAnswer)}`,
  ).toBe(expectedStatus);
  expect(
    member(bookingAnswer, 'type'),
    `${context} — POST /appointments type\n${describeAnswer(bookingAnswer)}`,
  ).toBe(expectedType);

  if (expectedReference !== undefined) {
    expect(
      member(availabilityAnswer, 'reference'),
      `${context} — GET /availability reference\n${describeAnswer(availabilityAnswer)}`,
    ).toBe(expectedReference);
    expect(
      member(bookingAnswer, 'reference'),
      `${context} — POST /appointments reference\n${describeAnswer(bookingAnswer)}`,
    ).toBe(expectedReference);
  }
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

describe('GET /availability — AC-1 through AC-4, AC-7', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it(
    'AC-1 (H-16-1, the reported defect) — availability and booking agree at both boundaries of a 60-minute occupied appointment',
    async () => {
      const scenario = await seedScenario(client, 'avail-ac1', { bays: 1, technicians: 1 });
      // Busy [09:30, 10:30) — the human's own reproduction, ANCHOR-relative.
      await occupy(client, scenario, {
        label: 'busy',
        bayId: scenario.bayIds[0] as string,
        technicianId: scenario.technicianIds[0] as string,
        startsAt: at(30),
        endsAt: at(90),
      });
      const where = `\n${describeScenario(scenario)}`;

      await withService(async (service) => {
        // Case 1 — startsAt=09:00 derives [09:00, 10:00), overlapping the busy appointment.
        const before = await getAvailability(service, {
          dealershipId: scenario.dealershipId,
          serviceTypeId: scenario.serviceTypeId,
          startsAt: isoAt(0),
        });
        expect(
          before.status,
          `AC-1 — GET /availability did not answer 200.\n${describeAnswer(before)}${where}`,
        ).toBe(200);
        expect(
          bays(before),
          `AC-1 — startsAt=09:00 derives [09:00,10:00), overlapping the busy [09:30,10:30): ` +
            `bays must be empty.\n${describeAnswer(before)}${where}`,
        ).toEqual([]);
        expect(
          technicians(before),
          `AC-1 — and technicians must be empty too.\n${describeAnswer(before)}${where}`,
        ).toEqual([]);

        const beforeBooking = await postBooking(service, bookingBody(scenario, { startsAtMinutes: 0 }));
        expect(
          beforeBooking.status,
          `AC-1 — a booking at the same startsAt=09:00 must answer 409.\n${describeAnswer(beforeBooking)}${where}`,
        ).toBe(409);

        // Case 2 — startsAt=10:30 derives [10:30, 11:30), back-to-back with the busy interval.
        const after = await getAvailability(service, {
          dealershipId: scenario.dealershipId,
          serviceTypeId: scenario.serviceTypeId,
          startsAt: isoAt(90),
        });
        expect(
          after.status,
          `AC-1 — GET /availability did not answer 200.\n${describeAnswer(after)}${where}`,
        ).toBe(200);
        expect(
          bays(after),
          `AC-1 — startsAt=10:30 derives [10:30,11:30), back-to-back with [09:30,10:30): the ` +
            `bay must be reported free.\n${describeAnswer(after)}${where}`,
        ).toContain(scenario.bayIds[0]);
        expect(
          technicians(after),
          `AC-1 — and the technician too.\n${describeAnswer(after)}${where}`,
        ).toContain(scenario.technicianIds[0]);

        const afterBooking = await postBooking(service, bookingBody(scenario, { startsAtMinutes: 90 }));
        expect(
          afterBooking.status,
          `AC-1 — a booking at the same startsAt=10:30 must answer 201.\n${describeAnswer(afterBooking)}${where}`,
        ).toBe(201);

        // "The 201 is cancelled between cases, so each case starts from the same state"
        // (slice file, AC-1) — cleanup, so this scenario's subtree is left exactly as it was
        // observed in case 1 rather than one booking richer.
        const cancelled = await postCancellation(service, String(member(afterBooking, 'id')));
        expect(
          cancelled.status,
          `ARRANGE (cleanup) — the case-2 booking was not cancelled.\n${describeAnswer(cancelled)}${where}`,
        ).toBe(200);
      });
    },
  );

  it('AC-2 — one derivation, made mechanical: the 200\'s startsAt/endsAt are string-equal to the 201\'s', async () => {
    const scenario = await seedScenario(client, 'avail-ac2', { bays: 1, technicians: 1 });
    const where = `\n${describeScenario(scenario)}`;

    await withService(async (service) => {
      const query = {
        dealershipId: scenario.dealershipId,
        serviceTypeId: scenario.serviceTypeId,
        startsAt: isoAt(0),
      };
      const availabilityAnswer = await getAvailability(service, query);
      expect(
        availabilityAnswer.status,
        `AC-2 — GET /availability did not answer 200.\n${describeAnswer(availabilityAnswer)}${where}`,
      ).toBe(200);

      const bookingAnswer = await postBooking(service, bookingBody(scenario, { startsAtMinutes: 0 }));
      expect(
        bookingAnswer.status,
        `AC-2 — POST /appointments did not answer 201.\n${describeAnswer(bookingAnswer)}${where}`,
      ).toBe(201);

      // A test that recomputed the end from durationMinutes would be asserting its own
      // arithmetic (slice file, AC-2). This compares the SYSTEM's two answers instead.
      expect(
        member(availabilityAnswer, 'startsAt'),
        `AC-2 — the two endpoints' startsAt must be STRING-EQUAL.\n` +
          `availability: ${describeAnswer(availabilityAnswer)}\nbooking:      ${describeAnswer(bookingAnswer)}${where}`,
      ).toBe(member(bookingAnswer, 'startsAt'));
      expect(
        member(availabilityAnswer, 'endsAt'),
        `AC-2 — and endsAt too.\n` +
          `availability: ${describeAnswer(availabilityAnswer)}\nbooking:      ${describeAnswer(bookingAnswer)}${where}`,
      ).toBe(member(bookingAnswer, 'endsAt'));
    });
  });

  it('AC-3 — a request carrying from and to, and no startsAt, answers 400 malformed-request', async () => {
    const scenario = await seedScenario(client, 'avail-ac3', { bays: 1, technicians: 1 });
    const where = `\n${describeScenario(scenario)}`;

    await withService(async (service) => {
      const answer = await getAvailabilityWithParams(service, {
        dealershipId: scenario.dealershipId,
        serviceTypeId: scenario.serviceTypeId,
        from: isoAt(0),
        to: isoAt(60),
      });
      expectProblem(
        answer,
        400,
        '/problems/malformed-request',
        `AC-3 — from/to with no startsAt (ADR-0039: the retired parameters are no longer ` +
          `accepted, not silently ignored)${where}`,
      );
    });
  });

  describe('AC-4 — the two endpoints agree on every shared failure, including precedence', () => {
    it('an unknown dealership answers 422 unknown-reference (reference: dealership) from both', async () => {
      const scenario = await seedScenario(client, 'avail-ac4-dealer', { bays: 1, technicians: 1 });
      const bogusDealership = uuidFor('avail-ac4-dealer', 'absent-dealership');
      const where = `\n${describeScenario(scenario)}\n  bogus dealership: ${bogusDealership}`;

      await withService(async (service) => {
        await expectAgreement(
          service,
          `AC-4 (unknown dealership)${where}`,
          { dealershipId: bogusDealership, serviceTypeId: scenario.serviceTypeId, startsAt: isoAt(0) },
          { ...bookingBody(scenario), dealershipId: bogusDealership },
          422,
          '/problems/unknown-reference',
          'dealership',
        );
      });
    });

    it('an unknown service type answers 422 unknown-reference (reference: service-type) from both', async () => {
      const scenario = await seedScenario(client, 'avail-ac4-servicetype', { bays: 1, technicians: 1 });
      const bogusServiceType = uuidFor('avail-ac4-servicetype', 'absent-service-type');
      const where = `\n${describeScenario(scenario)}\n  bogus serviceType: ${bogusServiceType}`;

      await withService(async (service) => {
        await expectAgreement(
          service,
          `AC-4 (unknown service type)${where}`,
          { dealershipId: scenario.dealershipId, serviceTypeId: bogusServiceType, startsAt: isoAt(0) },
          { ...bookingBody(scenario), serviceTypeId: bogusServiceType },
          422,
          '/problems/unknown-reference',
          'service-type',
        );
      });
    });

    it('a startsAt that satisfies the wire pattern but is not a renderable instant answers 400 malformed-request from both, FOR THE INSTANT, not for a missing from/to', async () => {
      const scenario = await seedScenario(client, 'avail-ac4-instant', { bays: 1, technicians: 1 });
      // Hour 25: two digits, matches the RFC 3339 pattern's `\d{2}` generically, but
      // `new Date(...)` renders it NaN — measured directly (Node 22): getTime() is NaN and
      // toISOString() throws. A calendar-invalid DAY (e.g. 2026-02-30) is insufficient here —
      // measured to roll over to a valid date instead, which is why hour/minute is used.
      const unrenderable = '2026-01-01T25:00:00.000Z';
      const where = `\n${describeScenario(scenario)}\n  unrenderable startsAt: ${unrenderable}`;

      await withService(async (service) => {
        await expectAgreement(
          service,
          `AC-4 (unrenderable startsAt)${where}`,
          { dealershipId: scenario.dealershipId, serviceTypeId: scenario.serviceTypeId, startsAt: unrenderable },
          { ...bookingBody(scenario), startsAt: unrenderable },
          400,
          '/problems/malformed-request',
        );

        // Today's server still requires `from`/`to` and would answer this exact (status,
        // type) pair for the WRONG reason — a missing required querystring property, not the
        // unrenderable instant this case is about. Pin the `detail` too, so a coincidental
        // pass here cannot be mistaken for the case this test exists to prove.
        const availabilityAnswer = await getAvailability(service, {
          dealershipId: scenario.dealershipId,
          serviceTypeId: scenario.serviceTypeId,
          startsAt: unrenderable,
        });
        expect(
          String(member(availabilityAnswer, 'detail')),
          `AC-4 (unrenderable startsAt) — the 400 must be ABOUT startsAt, not a missing ` +
            `required querystring property (ADR-0039: from/to are retired, not optional).` +
            `\n${describeAnswer(availabilityAnswer)}${where}`,
        ).not.toMatch(/required property 'from'/);
      });
    });

    it('a derived interval outside the dealership\'s opening hours answers 400 outside-opening-hours from both', async () => {
      const scenario = await seedScenario(client, 'avail-ac4-hours', {
        bays: 1,
        technicians: 1,
        hours: { opensAt: '09:00:00', closesAt: '17:00:00' },
      });
      const where = `\n${describeScenario(scenario)}`;

      await withService(async (service) => {
        await expectAgreement(
          service,
          `AC-4 (outside opening hours)${where}`,
          { dealershipId: scenario.dealershipId, serviceTypeId: scenario.serviceTypeId, startsAt: isoAt(780) },
          bookingBody(scenario, { startsAtMinutes: 780 }),
          400,
          '/problems/outside-opening-hours',
        );
      });
    });

    it('a dealership whose opening-hours reference data cannot be read answers 500 internal from both', async () => {
      const scenario = await seedScenario(client, 'avail-ac4-zone', {
        bays: 1,
        technicians: 1,
        timeZone: 'Not/AZone',
      });
      const where = `\n${describeScenario(scenario)}`;

      await withService(async (service) => {
        const availabilityAnswer = await getAvailability(service, {
          dealershipId: scenario.dealershipId,
          serviceTypeId: scenario.serviceTypeId,
          startsAt: isoAt(0),
        });
        const bookingAnswer = await postBooking(service, bookingBody(scenario, { startsAtMinutes: 0 }));

        expect(
          availabilityAnswer.status,
          `AC-4 (unreadable opening-hours reference data) — GET /availability status\n${describeAnswer(availabilityAnswer)}${where}`,
        ).toBe(500);
        expect(
          member(availabilityAnswer, 'type'),
          `AC-4 — GET /availability type\n${describeAnswer(availabilityAnswer)}${where}`,
        ).toBe('/problems/internal');
        expect(
          bookingAnswer.status,
          `AC-4 — POST /appointments status\n${describeAnswer(bookingAnswer)}${where}`,
        ).toBe(500);
        expect(
          member(bookingAnswer, 'type'),
          `AC-4 — POST /appointments type\n${describeAnswer(bookingAnswer)}${where}`,
        ).toBe('/problems/internal');
      });
    });

    it('precedence: an unknown dealership AND an unusable startsAt together answer 422 from both (the dealership check wins)', async () => {
      const scenario = await seedScenario(client, 'avail-ac4-precedence', { bays: 1, technicians: 1 });
      const bogusDealership = uuidFor('avail-ac4-precedence', 'absent-dealership');
      const unrenderable = '2026-01-01T25:00:00.000Z';
      const where = `\n${describeScenario(scenario)}\n  bogus dealership: ${bogusDealership}\n  unrenderable startsAt: ${unrenderable}`;

      await withService(async (service) => {
        await expectAgreement(
          service,
          `AC-4 (precedence: unknown dealership + unusable startsAt)${where}`,
          { dealershipId: bogusDealership, serviceTypeId: scenario.serviceTypeId, startsAt: unrenderable },
          { ...bookingBody(scenario), dealershipId: bogusDealership, startsAt: unrenderable },
          422,
          '/problems/unknown-reference',
          'dealership',
        );
      });
    });
  });

  it(
    'AC-7 (regression guard) — a 200 still carries an explicit advisory flag and a disclaimer stating both facts, and now also names the interval it answered about',
    async () => {
      const scenario = await seedScenario(client, 'avail-ac7', { bays: 1, technicians: 1 });
      const where = `\n${describeScenario(scenario)}`;

      await withService(async (service) => {
        const answer = await getAvailability(service, {
          dealershipId: scenario.dealershipId,
          serviceTypeId: scenario.serviceTypeId,
          startsAt: isoAt(0),
        });
        expect(
          answer.status,
          `AC-7 — GET /availability did not answer 200.\n${describeAnswer(answer)}${where}`,
        ).toBe(200);
        expect(
          member(answer, ADVISORY_FIELD),
          `AC-7 — the response must carry an explicit advisory flag ('${ADVISORY_FIELD}: true'). ` +
            `See this file's header if the implementation carries the fact under a different ` +
            `name — that is a naming assumption, arguable as a DCR, not licence to omit the ` +
            `flag.\n${describeAnswer(answer)}${where}`,
        ).toBe(true);

        const text = (answer.rawBody ?? '').toLowerCase();
        expect(
          text.includes('reservation'),
          `AC-7 — the response must say a free result is NOT A RESERVATION.\n${describeAnswer(answer)}${where}`,
        ).toBe(true);
        expect(
          text.includes('interval') || text.includes('window'),
          `AC-7 — the response must say the answer is true only of ONE interval.\n${describeAnswer(answer)}${where}`,
        ).toBe(true);

        // NEW to slice 16: that interval is now the one this SAME response names, not a
        // window the caller supplied.
        expect(
          typeof member(answer, 'startsAt'),
          `AC-7 — the 200 must name the interval it answered about: 'startsAt' must be a string.\n${describeAnswer(answer)}${where}`,
        ).toBe('string');
        expect(
          typeof member(answer, 'endsAt'),
          `AC-7 — and 'endsAt' too.\n${describeAnswer(answer)}${where}`,
        ).toBe('string');
      });
    },
  );
});
