import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  at,
  bookingBody,
  describeAnswer,
  describeScenario,
  member,
  postBooking,
  postCancellation,
  seedScenario,
  uuidNamespaceOf,
} from '../support/booking.js';

/**
 * Slice 05 — the two claims about the TABLE. AC-3's other half, and the slot being freed once.
 *
 * `docs/slices/05-cancellation.md` · `docs/slices/05-design.md` D1, §1 · arc42 §8.1, §8.2,
 * §8.5, §6.4 · CLAUDE.md §2.1, §5 · ADR-0003.
 *
 * WHOSE FILE THIS IS. `CLAUDE.md` §5 gives `tests/integration/` tests that assert a DATABASE
 * INVARIANT to the test-engineer, on slice 00a's structural rule: a file that reaches the
 * database only through a connection string is the test-engineer's; one that imports a `src/`
 * module is the implementer's. This file imports no `src/` module.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * CASE 1 — WHY `to_jsonb(appointment)` AND NOT A READ OF `updated_at`.
 *
 * AC-3 says a replayed cancellation "changes nothing". The contract test takes the `200` and
 * the identical body, and CANNOT reach this: `updated_at` is in neither `AppointmentView`'s
 * ten members nor the response body, so the wire assertion is satisfied EQUALLY by D1's
 * `CASE WHEN status = 'cancelled' THEN updated_at ELSE now() END` and by the plain
 * `updated_at = now()` D1 rejects. Something has to distinguish them or the `CASE` is a
 * construct no test can see — which is the design's own §4 argument against shipping a module
 * with no caller, turned on the design (T-05-6, OBJ-3).
 *
 * `to_jsonb(appointment)` rather than a hand-picked column list, because it asserts over EVERY
 * user column of the row — including ones a future migration adds that nobody remembers to
 * name here. An author who picks the columns is choosing what may silently change.
 *
 * AND THE LIMIT OF THE CLAIM, stated because the strongest TRUE claim is the one worth making
 * (design D1): *changes no column* is true; *writes nothing* is false. A replay takes the row
 * lock, writes a new row version and leaves a dead tuple — the implementer measured `xmin`
 * advancing 739 -> 740. So `xmin` is READ AND RENDERED into the failure message here, and
 * deliberately NOT asserted in either direction: asserting it advances would pin the
 * implementation to writing, and asserting it does not would be false of the designed
 * statement. arc42 §6.4 carries the sentence at step 7.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * CASE 2 — THE SLOT IS FREED ONCE, NOT MADE PERMANENTLY FREE.
 *
 * Slice 00 pins `WHERE (status <> 'cancelled')` by string equality and exercises it once, on
 * the bay side, over hand-written INSERTs. What no committed test says is that the predicate
 * is still SELECTIVE after a cancellation has been served through the route: a build that
 * dropped the exclusion constraints outright, or widened the predicate to `WHERE true`, would
 * satisfy every response-level assertion in this slice — cancel answers 200, the re-booking
 * answers 201 — while having made the bay permanently bookable. The negative probe is a direct
 * INSERT this test issues itself, refused `23P01`, which is the only observation that
 * distinguishes "the slot was released" from "the guard was removed".
 *
 * HOW A REJECTION IS ASSERTED (slice 00's rule): capture the thrown value, assert a truthy
 * SQLSTATE first, and only then assert which one and which constraint. `expect(...).rejects`
 * is satisfied by a TypeError from a typo in a helper.
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

interface RowSnapshot {
  /** Every user column of the row, as PostgreSQL renders it. */
  readonly columns: unknown;
  /** The row version. Read for the failure message; never asserted. See the header. */
  readonly xmin: string;
}

async function snapshot(client: Client, id: string): Promise<RowSnapshot | null> {
  const { rows } = await client.query<{ row: unknown; xmin: string }>(
    'select to_jsonb(appointment) as row, xmin::text as xmin from appointment where id = $1',
    [id],
  );
  const row = rows[0];
  return row === undefined ? null : { columns: row.row, xmin: row.xmin };
}

function render(label: string, snap: RowSnapshot | null): string {
  return snap === null
    ? `  ${label}: NO ROW`
    : `  ${label}: xmin=${snap.xmin} ${JSON.stringify(snap.columns)}`;
}

/** The captured rejection of a statement that must be refused. Never a bare `.rejects`. */
async function rejection(what: string, work: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await work;
    return { caught: false, what };
  } catch (error) {
    return { caught: true, what, ...(error as Record<string, unknown>) };
  }
}

describe('slice 05 — what the appointment table says about cancellation', () => {
  let client: Client;

  // CONNECT AND NOTHING ELSE (slice 00's rule 1).
  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('AC-3 — a replayed cancellation changes NO COLUMN of the row: to_jsonb(appointment) is equal across the replay', async () => {
    const scenario = await seedScenario(client, 'ac3-tojsonb', { bays: 1, technicians: 1 });
    const where = `\n${describeScenario(scenario)}`;

    await withService(async (service) => {
      const booked = await postBooking(service, bookingBody(scenario));
      expect(
        booked.status,
        `ARRANGE — the appointment to cancel was not booked.\n${describeAnswer(booked)}${where}`,
      ).toBe(201);
      const id = String(member(booked, 'id'));

      const first = await postCancellation(service, id);
      expect(
        first.status,
        `ARRANGE — the first cancellation must answer 200. At the red commit this is a 404: ` +
          `the route does not exist.\n${describeAnswer(first)}${where}`,
      ).toBe(200);

      const before = await snapshot(client, id);
      expect(before, `the cancelled row is missing from the table entirely.${where}`).not.toBeNull();
      expect(
        (before?.columns as Record<string, unknown> | undefined)?.['status'],
        'ARRANGE — the row must actually be cancelled before the replay is meaningful',
      ).toBe('cancelled');

      const second = await postCancellation(service, id);
      expect(
        second.status,
        `ARRANGE — the replay must answer 200.\n${describeAnswer(second)}${where}`,
      ).toBe(200);

      const after = await snapshot(client, id);

      expect(
        after?.columns,
        `AC-3 — NO COLUMN of the row may change across a replayed cancellation, and this is ` +
          `the only assertion in the slice that can see it. The likely difference is ` +
          `\`updated_at\`: a plain \`updated_at = now()\` advances it on the second call, ` +
          `which makes a replayed cancellation a client-reachable write to a column arc42 ` +
          `§8.1 says the APPLICATION maintains. D1's \`CASE WHEN status = 'cancelled' THEN ` +
          `updated_at ELSE now() END\` is the statement that passes this.\n` +
          `${render('before the replay', before)}\n${render('after  the replay', after)}\n` +
          `The row VERSION is expected to differ (a replay takes the row lock and leaves a ` +
          `dead tuple); the row's COLUMNS are not.${where}`,
      ).toEqual(before?.columns);
    });
  });

  it("AC-1 (over the table) — the released slot is released ONCE: a third overlapping row is still refused 23P01", async () => {
    const scenario = await seedScenario(client, 'ac1-freed-once', {
      bays: 1,
      technicians: 1,
      customers: 2,
    });
    const where = `\n${describeScenario(scenario)}`;
    const bayId = scenario.bayIds[0] as string;
    const technicianId = scenario.technicianIds[0] as string;

    await withService(async (service) => {
      const a = await postBooking(service, bookingBody(scenario, { customerIndex: 0 }));
      expect(a.status, `ARRANGE — A was not confirmed.\n${describeAnswer(a)}${where}`).toBe(201);
      const aId = String(member(a, 'id'));

      const cancelled = await postCancellation(service, aId);
      expect(
        cancelled.status,
        `ARRANGE — A was not cancelled. At the red commit this is a 404.\n${describeAnswer(cancelled)}${where}`,
      ).toBe(200);

      const b = await postBooking(service, bookingBody(scenario, { customerIndex: 1 }));
      expect(
        b.status,
        `ARRANGE — the freed slot was not re-booked; that is AC-1's own assertion and it lives ` +
          `in tests/acceptance/cancel-appointment.test.ts.\n${describeAnswer(b)}${where}`,
      ).toBe(201);

      // THE PROBE. A third row over the same bay, technician and interval, inserted directly
      // by this test — so nothing about the application's allocator can influence the answer.
      const probe = await rejection(
        'the third overlapping row',
        client.query(
          `insert into appointment
             (id, dealership_id, customer_id, vehicle_id, service_type_id, technician_id, bay_id, starts_at, ends_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            uuidNamespaceOf(scenario, 'probe/third'),
            scenario.dealershipId,
            scenario.customers[0]?.customerId,
            scenario.customers[0]?.vehicleId,
            scenario.serviceTypeId,
            technicianId,
            bayId,
            at(0).toISOString(),
            at(scenario.durationMinutes).toISOString(),
          ],
        ),
      );

      expect(
        probe['caught'],
        `AC-1 — the insert SUCCEEDED. The slot was not released, it was made permanently free: ` +
          `either the exclusion constraints are gone or their predicate no longer excludes an ` +
          `overlapping CONFIRMED row. Every response-level assertion in this slice passes over ` +
          `such a build, which is why this probe exists.${where}`,
      ).toBe(true);
      expect(
        probe['code'],
        `AC-1 — the refusal must carry a SQLSTATE. Something other than PostgreSQL rejected ` +
          `this statement.\n${String(probe['message'])}${where}`,
      ).toBeTruthy();
      expect(
        probe['code'],
        `AC-1 — 23P01 is exclusion_violation, CLAUDE.md §2.1's mechanism. A 23505 would mean ` +
          `a unique index is doing this work instead.\n${String(probe['message'])}${where}`,
      ).toBe('23P01');
      expect(
        probe['constraint'],
        `AC-1 — and it must be one of arc42 §8.2's two exclusion constraints.\n${String(probe['message'])}${where}`,
      ).toBe('no_bay_overlap');

      // AND THE ROW COUNT, so "freed once" is a claim about the table and not about one probe:
      // two rows for this bay over this interval — A cancelled, B confirmed — and no more.
      const { rows } = await client.query<{ id: string; status: string }>(
        `select id, status::text as status from appointment
          where bay_id = $1 and tstzrange(starts_at, ends_at) && tstzrange($2, $3)
          order by status, id`,
        [bayId, at(0).toISOString(), at(scenario.durationMinutes).toISOString()],
      );
      expect(
        rows.map((r) => `${r.id} ${r.status}`).sort(),
        `AC-1 — exactly two rows overlap this bay's interval: A cancelled and B confirmed. ` +
          `A missing cancelled row means the cancellation DELETED rather than transitioned ` +
          `(ADR-0003); a second confirmed row is a double booking.${where}`,
      ).toEqual([`${aId} cancelled`, `${String(member(b, 'id'))} confirmed`].sort());
    });
  });
});
