import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { uuidFor } from '../support/ids.js';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  at,
  bookingBody,
  confirmedOverlapping,
  describeAnswer,
  describeScenario,
  findStoredAppointment,
  isoAt,
  member,
  postBooking,
  postCancellation,
  postRaw,
  seedScenario,
} from '../support/booking.js';

/**
 * Slice 05 — AC-1 and AC-4, over HTTP against the compiled artifact.
 *
 * `docs/slices/05-cancellation.md` · `docs/slices/05-design.md` §1, §3 · arc42 §6.5, §8.6,
 * §10.2 QS-7 · ADR-0003, ADR-0023.
 *
 *   AC-1  a booking refused `409` while A holds the slot SUCCEEDS once A is cancelled
 *   AC-4  cancelling an unknown id is `404 /problems/appointment-not-found`
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT AC-1 UNIQUELY PROVES, AND IT IS NOT WHAT STEP 1 CLAIMED (design §1, T-05-1).
 *
 * The step-1 design said this criterion was the entire guard on `WHERE (status <> 'cancelled')`.
 * It is not: `tests/integration/exclusion-constraints.test.ts` already pins the predicate by
 * string equality (case 0's `EXPECTED_CONSTRAINT_DEFS`) and already exercises it behaviourally
 * (its own AC-4, titled "the predicate is live and not decorative"). Both were committed at
 * slice 00 and both are on the BAY side, over a hand-written pair of INSERTs.
 *
 * What is unproven, and what this file is for, is one step further out:
 *
 *   **a cancelled row leaves BOTH exclusion constraints, proved through the booking API.**
 *
 * Slice 00 proves the bay side over two hand-written INSERTs. This fixture is 1×1, so the
 * contender's `201` requires `no_technician_overlap`'s predicate to release as well — and slice
 * 00's AC-4 (`exclusion-constraints.test.ts:605`) puts its neighbour on `techB` so that only
 * `no_bay_overlap` is ever violated there. Nothing else asserts the technician side behaviourally.
 *
 * NOT YET — corrected here, after I-05-5. An earlier draft of this header claimed AC-1 also holds
 * the seam arc42 §6.5 names: the constraint's predicate and `freeResources`'s overlap predicate as
 * two copies with nothing forcing them to agree. **There is no second copy at this slice.**
 * `freeResources` serves `GET /availability`, which is slice 08, and §6.5 describes the finished
 * system; the candidate read on the booking path carries no availability filter yet. That absence
 * is load-bearing below — it is *why* the candidate pair offered before and after the cancel is
 * identical. This case will hold §6.5's seam once the second copy exists. Today it holds the
 * constraint, which is the stronger of the two claims anyway.
 *
 * THE MUTANT, MEASURED BEFORE THIS FILE WAS WRITTEN so the assertion is aimed rather than
 * hopeful. It was measured against a STUB of the slice-08 filter, not against shipped code, so it
 * is evidence that this case will catch that mutant when it becomes reachable — not a diagnosis
 * available today. `postgres:16`, this repository's own migrations, one bay, A cancelled:
 *
 *   free bays, predicate as designed  (`and a.status <> 'cancelled'`)   1
 *   free bays, predicate dropped      (the mutant)                      0
 *
 * And then the same two predicates behind a stub route, driven through this case's own three
 * requests, to check that the difference survives to the edge rather than only to a row count:
 *
 *   predicate as designed   before 409   cancel 200   AFTER 201   (this case passes)
 *   predicate dropped       before 409   cancel 200   AFTER 409   (this case fails, here)
 *
 * The cancel answers 200 under BOTH, and the refusal before it is identical under both. Nothing
 * else in the sequence moves. So the assertion below is the only thing that separates them, and
 * it fails with `409 /problems/no-capacity` — not a 404, not a timeout, not a silent pass.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE FOUR WAYS TO SATISFY AC-1 DISHONESTLY, CLOSED HERE BY SHAPE (design §3).
 *
 *   1. `bays: 1, technicians: 1`. With |B| = |T| = 1 there is one permutation, so ADR-0009's
 *      shuffle cannot vary the candidate and `BOOKING_SEED` is deliberately NOT pinned —
 *      pinning it would be ADR-0021's Order-A, making the case depend on a knob instead of on
 *      the fixture.
 *   2. ONE request value, posted twice. `contender` is a `const` sent again, so "the same
 *      booking" is enforced by the program and not by a reader comparing two literals.
 *   3. The refusal must be the RIGHT refusal — `409`, `type=/problems/no-capacity`, `resource`
 *      present. A `400` read as "refused" would make the sequence pass with no capacity
 *      conflict in it at all.
 *   4. The `201` must name A's bay and A's technician, and carry a different id. With this
 *      fixture it must; asserting it makes any future widening of the fixture fail loudly.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY EVERY FAILURE HERE IS AN ASSERTION (process criterion C1).
 *
 * At the red commit `dist/main.js` exists, starts, and serves `POST /appointments` and
 * `GET /appointments/{id}` — slices 00a to 04 built them. Only the cancellation route is
 * missing, so `postCancellation` completes and returns Fastify's `404`, and what fails is
 * `expect(cancelled.status).toBe(200)` inside a test body. Nothing is imported that does not
 * exist and nothing is stubbed.
 *
 * That first red is cheap and this file says so: it proves the route is absent, which nobody
 * doubted. The assertion that carries AC-1's meaning is the one AFTER the cancellation, and it
 * only becomes reachable once the route exists. Both are here, in order, and the messages say
 * which is which.
 */

async function withService<T>(run: (service: StartedService) => Promise<T>): Promise<T | undefined> {
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

describe('slice 05 — cancelling an appointment frees its slot through the allocator', () => {
  let client: Client;

  // CONNECT AND NOTHING ELSE (slice 00's rule 1): every schema-dependent statement runs inside
  // an `it()` body, so this file's red is a set of failed assertions in a collected file.
  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('AC-1 — the SAME booking, refused 409 while A holds the slot, is confirmed 201 once A is cancelled', async () => {
    const scenario = await seedScenario(client, 'ac1-cancel-frees', {
      bays: 1,
      technicians: 1,
      customers: 2,
    });
    const where = `\n${describeScenario(scenario)}`;

    // TRAP 2 — one request value, posted twice. Never two literals that a reader must compare.
    const contender = bookingBody(scenario, { customerIndex: 1 });

    await withService(async (service) => {
      // ── A takes the only bay and the only technician for [09:00, 10:00).
      const a = await postBooking(service, bookingBody(scenario, { customerIndex: 0 }));
      expect(
        a.status,
        `AC-1's arrangement failed: appointment A was not confirmed, so nothing below is about ` +
          `cancellation.\n${describeAnswer(a)}${where}`,
      ).toBe(201);
      const aId = String(member(a, 'id'));
      const aBay = member(a, 'bayId');
      const aTechnician = member(a, 'technicianId');
      expect(aBay, 'A must occupy the only bay').toBe(scenario.bayIds[0]);
      expect(aTechnician, 'A must occupy the only technician').toBe(scenario.technicianIds[0]);

      // ── BEFORE. This is the control: the same request, refused, with nothing else changed.
      const before = await postBooking(service, contender);
      expect(
        before.status,
        `AC-1 — the contender must be REFUSED while A holds the slot. A 201 here means the ` +
          `fixture is not contended and the 201 after the cancellation would prove nothing.` +
          `\n${describeAnswer(before)}${where}`,
      ).toBe(409);
      // TRAP 3 — and it must be the RIGHT refusal. A 400 or a differently-typed 409 read as
      // "refused" would make this whole sequence pass with no capacity conflict in it.
      expect(
        before.contentType,
        `AC-1 — the refusal must be RFC 9457 problem+json.\n${describeAnswer(before)}`,
      ).toMatch(/application\/problem\+json/);
      expect(
        member(before, 'type'),
        `AC-1 — the refusal must be the CAPACITY row of arc42 §8.6, not some other 409.` +
          `\n${describeAnswer(before)}`,
      ).toBe('/problems/no-capacity');
      expect(
        ['bay', 'technician'],
        `AC-1 — the refusal must name which list emptied (ADR-0016).\n${describeAnswer(before)}`,
      ).toContain(member(before, 'resource'));

      // ── THE CANCELLATION. A status transition, never a delete (ADR-0003).
      const cancelled = await postCancellation(service, aId);
      expect(
        cancelled.status,
        `AC-1 — POST /appointments/${aId}/cancellation must answer 200. A 404 as ` +
          `application/json is the red commit's expected first failure: the route does not ` +
          `exist yet.\n${describeAnswer(cancelled)}${where}`,
      ).toBe(200);
      expect(member(cancelled, 'id'), 'the 200 must describe the appointment that was cancelled').toBe(
        aId,
      );
      expect(
        member(cancelled, 'status'),
        `AC-1 — the cancelled appointment's status must be 'cancelled'.\n${describeAnswer(cancelled)}`,
      ).toBe('cancelled');

      // ── AFTER. The same `const`, posted again. THIS is the slice.
      const after = await postBooking(service, contender);
      expect(
        after.status,
        `AC-1 IS THE SLICE, and this is its assertion.\n\n` +
          `A 409 /problems/no-capacity here means the cancellation did NOT take A's row out of ` +
          `the exclusion constraints' scope. Exactly two places can do that, and this message ` +
          `names both because the assertions that would separate them are BELOW this line and ` +
          `will not have run: either D1's UPDATE did not move the stored row (the 200 above ` +
          `asserted the RESPONSE says 'cancelled', which is not the same claim), or the ` +
          `\`WHERE (status <> 'cancelled')\` predicate on no_bay_overlap / no_technician_overlap ` +
          `still counts a cancelled row. \`SELECT status FROM appointment WHERE id = '${aId}'\` ` +
          `decides between them in one query.\n\n` +
          `Nothing else in the sequence can have moved. One bay and one technician means a ` +
          `single candidate pair, and as of this slice the candidate read carries no ` +
          `availability filter (I-05-5), so that identical pair is offered before and after the ` +
          `cancel. The only thing that changed between the 409 above and the 201 here is the ` +
          `database's verdict on ADR-0004's retry attempts — which makes this a proof AT THE ` +
          `EDGE that a cancelled row leaves BOTH constraints, the technician side included.\n\n` +
          `A 404 here would instead mean the booking route has gone missing, which is a ` +
          `different failure entirely.\n${describeAnswer(after)}${where}`,
      ).toBe(201);
      // TRAP 4 — it must be A's OWN bay and technician that were freed, and a NEW appointment.
      expect(
        member(after, 'bayId'),
        `AC-1 — the confirmed booking must occupy the bay A released. Anything else means the ` +
          `fixture has more than one bay and the case is no longer about the freed slot.` +
          `\n${describeAnswer(after)}`,
      ).toBe(aBay);
      expect(
        member(after, 'technicianId'),
        `AC-1 — and the technician A released. Slice 00's AC-4 keeps its technician ` +
          `deliberately free so the bay is the only conflict; this is the technician side, ` +
          `behaviourally.\n${describeAnswer(after)}`,
      ).toBe(aTechnician);
      expect(
        member(after, 'id'),
        'AC-1 — a NEW appointment, not A resurrected. Restoring a cancelled appointment is out of scope.',
      ).not.toBe(aId);
      expect(member(after, 'startsAt'), 'the same interval as the refused attempt').toBe(isoAt(0));

      // ── AND OVER THE TABLE, because a response is one place a freed slot could be reported
      //    correctly over a database that holds two overlapping confirmed rows.
      const live = await confirmedOverlapping(
        client,
        scenario.dealershipId,
        at(0),
        at(scenario.durationMinutes),
      );
      expect(
        live.map((r) => `${r.id} ${r.bayId} ${r.technicianId} (${r.status})`),
        `AC-1 — exactly ONE non-cancelled appointment may overlap the interval. Two is a ` +
          `double booking and CLAUDE.md §2.1 has failed.${where}`,
      ).toEqual([`${String(member(after, 'id'))} ${String(aBay)} ${String(aTechnician)} (confirmed)`]);

      // A is still there. Without this a build that DELETED A would satisfy everything above,
      // and a delete frees the slot for an entirely different reason from the one AC-1 names.
      const stored = await findStoredAppointment(client, aId);
      expect(stored, `A must still exist after cancellation, not be deleted.${where}`).not.toBeNull();
      expect(stored?.status, 'A must be cancelled, not removed (ADR-0003)').toBe('cancelled');
      expect(stored?.bayId, 'A keeps the resources it held; only its status moved').toBe(aBay);
      expect(stored?.technicianId).toBe(aTechnician);
      expect(stored?.startsAt, 'A keeps its interval').toBe(isoAt(0));
      expect(stored?.endsAt).toBe(isoAt(60));
    });
  });

  it('AC-4 — cancelling an unknown but well-formed id is 404 /problems/appointment-not-found', async () => {
    // THE VACUOUS-GREEN TRAP, the same one slice 02's AC-2 documents. At the ORIGINAL slice
    // 05 red commit this request answered 404 from Fastify's OWN default not-found handler,
    // because the route did not exist yet — a case asserting the STATUS alone would have
    // been green then and green forever after, including over an implementation that never
    // registered the route.
    //
    // RE-DERIVED AT SLICE 06 UNDER ADR-0024 (design §2.4 warning 1), IN THIS SAME RED COMMIT,
    // so no merged test is ever degraded by a later fix. Slice 06 registers
    // `setNotFoundHandler`, which answers a genuinely UNMATCHED route with `404
    // /problems/route-not-found` — RFC 9457 problem+json, same as every other row. That
    // means the MEDIA TYPE alone no longer discriminates "the route answered" from "the
    // route does not exist": both now render `application/problem+json`. What still
    // discriminates is the `type` member — `appointment-not-found` here, `route-not-found`
    // for a genuinely absent route — and the media-type assertion is kept below as a plain
    // correctness check (still true, no longer load-bearing on its own).
    //
    // THE CONTROL THE MEDIA TYPE USED TO SUPPLY FOR FREE is the next case: a request to a
    // path this resource's routes do not register answers `route-not-found`, proving the
    // CANCELLATION route itself genuinely exists and this 404 is the domain's, not a routing
    // miss silently sharing the same shape.
    const unknownId = uuidFor('ac4-cancel-unknown', 'never-booked');

    await withService(async (service) => {
      const answer = await postCancellation(service, unknownId);

      expect(answer.status, describeAnswer(answer)).toBe(404);
      expect(
        answer.contentType,
        `AC-4 — the 404 must be RFC 9457 problem+json.\n${describeAnswer(answer)}`,
      ).toMatch(/application\/problem\+json/);
      expect(
        member(answer, 'type'),
        `AC-4 — THE DISCRIMINATOR, post-ADR-0024: appointment-not-found and NOT route-not-` +
          `found. arc42 §8.6 gains no row for this case: the existing appointment-not-found ` +
          `type is reused verbatim.\n${describeAnswer(answer)}`,
      ).toBe('/problems/appointment-not-found');
      expect(member(answer, 'status'), 'RFC 9457 repeats the status in the body').toBe(404);
    });
  });

  it('AC-4 control (ADR-0024) — POST /appointments/{id}/nonsense is 404 /problems/route-not-found, proving the cancellation route genuinely exists rather than sharing the case above\'s shape by accident', async () => {
    // What the MEDIA TYPE used to prove for free, before setNotFoundHandler made every 404
    // problem+json: that the request above was answered BY THE CANCELLATION ROUTE'S OWN
    // not-found arm, and not by a routing miss that happens to look the same. This case
    // targets a path adjacent to a REAL resource (a well-formed appointment id) but naming
    // no sub-route this service registers, so the ONLY way it can differ from the case above
    // is the `type`.
    const id = uuidFor('ac4-cancel-route-control', 'never-booked');

    await withService(async (service) => {
      const answer = await postRaw(service, `/appointments/${id}/nonsense`, {});

      expect(answer.status, describeAnswer(answer)).toBe(404);
      expect(
        answer.contentType,
        `must be RFC 9457 problem+json, same shape as the domain 404 above.\n${describeAnswer(answer)}`,
      ).toMatch(/application\/problem\+json/);
      expect(
        member(answer, 'type'),
        `must be route-not-found, NOT appointment-not-found: this path matches no registered ` +
          `route at all, so it must not be confused with a domain refusal.\n${describeAnswer(answer)}`,
      ).toBe('/problems/route-not-found');
    });
  });
});
