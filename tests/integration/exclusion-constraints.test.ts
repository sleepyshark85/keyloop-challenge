import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { at, seedDealership, type DealershipFixture } from '../support/seed.js';
import { uuidFor as idFor } from '../support/ids.js';

/**
 * Slice 00 — AC-1 to AC-9. The database refuses to represent a double booking, and it does
 * so with NO application code in existence to help it.
 *
 * docs/slices/00-schema-and-exclusion-constraints.md · design §4 · arc42 §8.1, §8.2 ·
 * CLAUDE.md §2.1 (NON-NEGOTIABLE), §2.2, §5.
 *
 * WHOSE FILE THIS IS. `CLAUDE.md` §5 gives database-invariant integration tests to the
 * test-engineer, on 00a's structural rule: a `tests/integration/` file that reaches the
 * database only through a connection string is the test-engineer's; one that imports a
 * `src/` module is the implementer's. This file imports no `src/` module — there is none to
 * import, which is the point of the slice.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * TWO STRUCTURAL RULES, both from design §4 and §8, and both protecting this slice's
 * evidence rather than its tidiness.
 *
 * 1. `beforeAll` MAY ONLY CONNECT. No DDL, no DML, no seeding — and no assertions, which is
 *    the same rule for the same reason. Every schema-dependent statement runs inside an
 *    `it()` body, so at the red commit this file produces a set of FAILED ASSERTIONS in a
 *    collected file rather than a hook error, whose representation in Vitest's JSON reporter
 *    the design has not measured and therefore must not depend on (§11.2 A-1). `red-proof`
 *    and criterion C1 both read that distinction.
 *
 * 2. EACH CASE SEEDS ITS OWN NAMESPACE, in its own body. There is no shared fixture and no
 *    cleanup: rows accumulate for the life of the run and die with the container. Isolation
 *    is by data, never by truncation (arc42 §7.2), and what the namespace buys inside this
 *    file is attributability — AC-3's row count is a claim about AC-3 only because no other
 *    case can write into that bay (§3.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE ORDER OF THE CASES IS PART OF THE ARGUMENT.
 *
 * Case 0 is a PRECONDITION of every case below it, not a companion to it (§4.2). Every
 * isolation rule the AC cases rely on reasons about which constraints a fixture can trip,
 * and every one of them assumes the constraints are keyed on the columns §8.1 names. They
 * are not self-supporting: a `no_bay_overlap` keyed on `dealership_id` instead of `bay_id`
 * passes the whole of AC-3 and all of AC-1, and is separated from a correct schema only by
 * AC-2 reporting one of two simultaneously violable constraints — which §11.2 A-2 says is
 * NOT guaranteed. Measured at step 2. If case 0 fails, nothing after it means anything.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * HOW A REJECTION IS ASSERTED (§5). `expect(...).rejects.toThrow()` is satisfied by a
 * `TypeError` from a typo in a helper, so every negative case CAPTURES the thrown value,
 * asserts a truthy SQLSTATE first, and only then asserts which one and which constraint.
 * Assert what you caught before asserting what it says. `err.message` and `err.detail` are
 * never asserted: they are localised by `lc_messages` and reworded between major versions,
 * and matching prose would make the constraint-name assertion redundant with a substring.
 */

/* ══════════════════════════════════════════════════════════════════════════════ case 0 ══ */

/** The nine relations of arc42 §8.1. */
const RELATIONS = [
  'dealership',
  'opening_hours',
  'service_type',
  'service_bay',
  'technician',
  'technician_qualification',
  'customer',
  'vehicle',
  'appointment',
] as const;

/**
 * The seven named constraints on `appointment`, as PostgreSQL renders them.
 *
 * HAND-TRANSCRIBED FROM arc42 §8.1 AND §8.2. Never captured from the database under test: a
 * snapshot taken from the running schema asserts that the schema equals itself, which is the
 * vacuous-pass failure mode this whole file exists to avoid, turned against its own remedy.
 *
 * Two normalisations are applied to the transcription, both from measurement M-3, because
 * `pg_get_constraintdef` re-renders rather than echoes:
 *   - the enum comparison gains an explicit cast: `WHERE (status <> 'cancelled')` renders as
 *     `WHERE ((status <> 'cancelled'::appointment_status))`;
 *   - the outer parentheses of a predicate or a CHECK are doubled.
 * A literal transcribed from the migration source WITHOUT those two would fail on a correct
 * schema.
 *
 * WHY EQUALITY AND NOT SUBSTRINGS. `conname` plus `contype` plus a substring for
 * `tstzrange(...)`, `&&` and the predicate — the step-1 specification — is satisfied by a
 * constraint keyed on the wrong column, and `contype = 'f'` cannot see whether a composite
 * foreign key points at `service_bay (id, dealership_id)` or at some other matching pair.
 * Equality on the rendered definition closes both classes with one mechanism.
 *
 * THE TRADE, ACCEPTED RATHER THAN INHERITED. Rendered catalogue text is fragile against a
 * PostgreSQL major-version bump. That fragility is bounded: the image is pinned to
 * `postgres:16` in `tests/setup/postgres.ts`, and `postgres-harness.test.ts` already asserts
 * `server_version` matches `^16\.`. A rendering change on a bump fails these seven loudly,
 * once, in the same commit as the bump, with the diff naming exactly what moved. Loud on a
 * version bump beats silent on a wrong column.
 *
 * THE LIMIT, STATED SO NOBODY MISTAKES THIS FOR A WHOLE-SCHEMA GUARANTEE. This proves the
 * seven NAMED constraints are exactly right. It proves nothing about what else is in the
 * schema — an extra constraint, a missing NOT NULL, a wrong column type — and nothing about
 * whether any of them FIRE. Cases 1 to 9 prove firing.
 */
const EXPECTED_CONSTRAINT_DEFS: Readonly<Record<string, string>> = {
  no_bay_overlap:
    'EXCLUDE USING gist (bay_id WITH =, tstzrange(starts_at, ends_at) WITH &&) ' +
    "WHERE ((status <> 'cancelled'::appointment_status))",
  no_technician_overlap:
    'EXCLUDE USING gist (technician_id WITH =, tstzrange(starts_at, ends_at) WITH &&) ' +
    "WHERE ((status <> 'cancelled'::appointment_status))",
  appointment_interval_ordered: 'CHECK ((ends_at > starts_at))',
  appointment_technician_qualified:
    'FOREIGN KEY (technician_id, service_type_id) ' +
    'REFERENCES technician_qualification(technician_id, service_type_id)',
  appointment_bay_in_dealership:
    'FOREIGN KEY (bay_id, dealership_id) REFERENCES service_bay(id, dealership_id)',
  appointment_technician_in_dealership:
    'FOREIGN KEY (technician_id, dealership_id) REFERENCES technician(id, dealership_id)',
  appointment_vehicle_owned_by_customer:
    'FOREIGN KEY (vehicle_id, customer_id) REFERENCES vehicle(id, customer_id)',
};

/* ═══════════════════════════════════════════════════════════════════════════════ helpers ══ */

interface AppointmentRow {
  readonly id: string;
  readonly dealershipId: string;
  readonly customerId: string;
  readonly vehicleId: string;
  readonly serviceTypeId: string;
  readonly technicianId: string;
  readonly bayId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

/** Every column the writer supplies. `id` has no default (§6.4) and `status` defaults to `confirmed`. */
const INSERT_APPOINTMENT = `
  insert into appointment
    (id, dealership_id, customer_id, vehicle_id, service_type_id, technician_id, bay_id, starts_at, ends_at)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

async function insertAppointment(client: Client, row: AppointmentRow): Promise<void> {
  await client.query(INSERT_APPOINTMENT, [
    row.id,
    row.dealershipId,
    row.customerId,
    row.vehicleId,
    row.serviceTypeId,
    row.technicianId,
    row.bayId,
    row.startsAt,
    row.endsAt,
  ]);
}

interface StoredAppointment {
  readonly id: string;
  readonly bay_id: string;
  readonly technician_id: string;
  readonly starts_at: Date;
  readonly ends_at: Date;
  readonly status: string;
}

async function readBack(client: Client, id: string): Promise<StoredAppointment | undefined> {
  const { rows } = await client.query<StoredAppointment>(
    `select id, bay_id, technician_id, starts_at, ends_at, status::text as status
       from appointment where id = $1`,
    [id],
  );
  return rows[0];
}

/** The fields of `pg`'s `DatabaseError` this file trusts (§5). Never `message`, `detail`, `hint` or `severity`. */
interface CapturedError {
  readonly code?: unknown;
  readonly constraint?: unknown;
  readonly table?: unknown;
}

/**
 * Run `attempt`, require it to have been rejected BY THE DATABASE, and hand back the error.
 *
 * The truthy-`code` assertion is not ceremony: it is what separates "PostgreSQL refused the
 * row" from "the helper threw a TypeError", and without it every negative case below would
 * pass on a typo. §5's rule, in one place so no case can forget it.
 */
async function rejection(what: string, attempt: Promise<unknown>): Promise<CapturedError> {
  let caught: unknown;
  try {
    await attempt;
  } catch (error: unknown) {
    caught = error;
  }

  expect(caught, `${what}: expected the database to REJECT this insert, but it succeeded`).toBeDefined();

  const err = caught as CapturedError;
  expect(
    err.code,
    `${what}: caught a value with no SQLSTATE, so this is not a database rejection — ${String(caught)}`,
  ).toBeTruthy();

  return err;
}

/**
 * Assert a rejection is the specific one the acceptance criterion names.
 *
 * The constraint NAME is the load-bearing half. `23503` is produced by four different
 * constraints on this table, so the SQLSTATE alone does not say which requirement was
 * enforced; the name is what ADR-0009 prunes on and what will label
 * `booking_conflicts_total{resource}`. Renaming one is a behaviour change.
 */
function expectRejection(err: CapturedError, what: string, code: string, constraint: string): void {
  expect(
    { code: err.code, constraint: err.constraint, table: err.table },
    `${what}: wrong rejection`,
  ).toEqual({ code, constraint, table: 'appointment' });
}

/** Non-cancelled appointments for one resource inside a window. The invariant is a property of the TABLE. */
async function countLive(
  client: Client,
  column: 'bay_id' | 'technician_id',
  resourceId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const { rows } = await client.query<{ count: string }>(
    `select count(*)::text as count from appointment
      where ${column} = $1 and status <> 'cancelled' and starts_at >= $2 and ends_at <= $3`,
    [resourceId, from, to],
  );
  return Number(rows[0]?.count ?? '-1');
}

/** Every id in `AppointmentRow` except the ones a case is deliberately varying. */
function validRow(
  f: DealershipFixture,
  over: Partial<AppointmentRow> & Pick<AppointmentRow, 'id' | 'startsAt' | 'endsAt'>,
): AppointmentRow {
  return {
    dealershipId: f.dealershipId,
    customerId: f.customers.custA,
    vehicleId: f.vehicles.vehA,
    serviceTypeId: f.serviceTypes.standard,
    technicianId: f.technicians.techA,
    bayId: f.bays.bayA,
    ...over,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════ ══ */

describe('slice 00 — the schema, the exclusion constraints and the seed fixtures', () => {
  let client: Client;

  // CONNECT AND NOTHING ELSE. No DDL, no DML, no seeding, no assertions. See rule 1 above.
  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('case 0 — the schema under test IS arc42 §8.1 and §8.2 (a precondition for every case below)', async () => {
    // (a) The extension. `bay_id WITH =` is an equality operator on a uuid and plain GiST
    // cannot index it; `btree_gist` supplies `gist_uuid_ops`. TC-3, §8.2 consequence 5.
    const { rows: extensions } = await client.query<{ extname: string }>(
      "select extname from pg_extension where extname = 'btree_gist'",
    );
    expect(
      extensions.map((row) => row.extname),
      'btree_gist is absent, so no exclusion constraint on (uuid, tstzrange) can exist at all',
    ).toEqual(['btree_gist']);

    // (b) The nine relations. `to_regclass` returns null rather than raising for a missing
    // relation, so this is an ASSERTION about the schema and not an error escaping the case.
    const { rows: relations } = await client.query<{ relation: string; oid: string | null }>(
      `select r.relation, to_regclass('public.' || r.relation)::text as oid
         from unnest($1::text[]) as r(relation)`,
      [[...RELATIONS]],
    );
    expect(
      relations.filter((row) => row.oid === null).map((row) => row.relation),
      'relations of arc42 §8.1 that do not exist',
    ).toEqual([]);

    // (c) The seven named constraints, by FULL NORMALISED DEFINITION.
    //
    // Joined through pg_class by name rather than cast through `'appointment'::regclass`, so
    // a missing table yields zero rows and an assertion failure rather than a thrown 42P01.
    const { rows: constraints } = await client.query<{ conname: string; def: string }>(
      `select c.conname, pg_get_constraintdef(c.oid) as def
         from pg_constraint c
         join pg_class t on t.oid = c.conrelid
         join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public' and t.relname = 'appointment' and c.contype <> 'p'`,
    );
    const actual = new Map(constraints.map((row) => [row.conname, row.def]));

    for (const [name, expected] of Object.entries(EXPECTED_CONSTRAINT_DEFS)) {
      const found = actual.get(name);
      expect(
        found,
        [
          `pg_get_constraintdef(${name}) does not match arc42 §8.1/§8.2.`,
          `  expected: ${expected}`,
          `  actual:   ${found ?? '<no constraint of that name on public.appointment>'}`,
        ].join('\n'),
      ).toBe(expected);
    }
  });

  it('AC-1 — a second appointment overlapping a bay is rejected 23P01 on no_bay_overlap', async () => {
    const f = await seedDealership(client, 'ac1');

    // 1. The first row, and PROOF it was stored. A conflict test whose first row was never
    //    written asserts nothing at all.
    await insertAppointment(
      client,
      validRow(f, { id: idFor('ac1', 'first'), startsAt: at(f, 0), endsAt: at(f, 60) }),
    );

    const stored = await readBack(client, idFor('ac1', 'first'));
    expect(stored?.status, 'the first appointment was not stored').toBe('confirmed');
    expect(stored?.bay_id).toBe(f.bays.bayA);
    expect(stored?.technician_id).toBe(f.technicians.techA);
    expect(stored?.starts_at.getTime(), `starts_at: ${stored?.starts_at.toISOString()}`).toBe(
      at(f, 0).getTime(),
    );
    expect(stored?.ends_at.getTime(), `ends_at: ${stored?.ends_at.toISOString()}`).toBe(
      at(f, 60).getTime(),
    );

    // 2. The overlap — SAME BAY, OTHER TECHNICIAN. Freeing the technician is what makes
    //    exactly one constraint violable; with both violable only one is reported and which
    //    one is index order rather than a guarantee (§11.2 A-2). techB is qualified for
    //    `quick` only, so the service type moves with the technician.
    const err = await rejection(
      'AC-1',
      insertAppointment(
        client,
        validRow(f, {
          id: idFor('ac1', 'overlapping'),
          technicianId: f.technicians.techB,
          serviceTypeId: f.serviceTypes.quick,
          startsAt: at(f, 30),
          endsAt: at(f, 90),
        }),
      ),
    );
    expectRejection(err, 'AC-1', '23P01', 'no_bay_overlap');

    // 3. The invariant is a property of the table, not of the error message.
    expect(
      await countLive(client, 'bay_id', f.bays.bayA, at(f, 0), at(f, 90)),
      'bayA must still hold exactly one live appointment across the overlapping window',
    ).toBe(1);
  });

  it('AC-2 — a second appointment overlapping a technician is rejected 23P01 on no_technician_overlap', async () => {
    const f = await seedDealership(client, 'ac2');

    await insertAppointment(
      client,
      validRow(f, { id: idFor('ac2', 'first'), startsAt: at(f, 0), endsAt: at(f, 60) }),
    );
    const stored = await readBack(client, idFor('ac2', 'first'));
    expect(stored?.status, 'the first appointment was not stored').toBe('confirmed');
    expect(stored?.technician_id).toBe(f.technicians.techA);
    expect(stored?.bay_id).toBe(f.bays.bayA);

    // SAME TECHNICIAN, OTHER BAY. Reusing bayA here would assert `no_technician_overlap` and
    // receive `no_bay_overlap` — §4.2 rule 1, and the reason AC-2 is asserted separately from
    // AC-1 rather than being treated as its mirror image: two constraints are two objects,
    // and one passing is no evidence for the other.
    const err = await rejection(
      'AC-2',
      insertAppointment(
        client,
        validRow(f, {
          id: idFor('ac2', 'overlapping'),
          bayId: f.bays.bayB,
          startsAt: at(f, 30),
          endsAt: at(f, 90),
        }),
      ),
    );
    expectRejection(err, 'AC-2', '23P01', 'no_technician_overlap');

    expect(
      await countLive(client, 'technician_id', f.technicians.techA, at(f, 0), at(f, 90)),
      'techA must still hold exactly one live appointment across the overlapping window',
    ).toBe(1);
  });

  it('AC-3 — adjacency is not overlap: back-to-back appointments coexist in one bay', async () => {
    const f = await seedDealership(client, 'ac3');

    // AC-3 is a SUCCESS assertion, so every way of succeeding trivially has to be closed:
    // the neighbour was never inserted; it was inserted cancelled; the rows are in different
    // bays through a fixture slip; or `no_bay_overlap` does not exist (case 0 closes that).

    // 1. The neighbour, on techB/`quick` so techA stays free for the control and the criteria.
    const neighbour = validRow(f, {
      id: idFor('ac3', 'neighbour'),
      technicianId: f.technicians.techB,
      serviceTypeId: f.serviceTypes.quick,
      startsAt: at(f, 0),
      endsAt: at(f, 60),
    });
    await insertAppointment(client, neighbour);

    // 2. Coverage. Compared as INSTANTS, not as strings.
    const stored = await readBack(client, idFor('ac3', 'neighbour'));
    expect(stored, 'the neighbour was never inserted').toBeDefined();
    expect(stored?.status, 'a cancelled neighbour is outside the constraint and proves nothing').toBe(
      'confirmed',
    );
    expect(stored?.bay_id, 'a neighbour in another bay makes the adjacency result vacuous').toBe(
      f.bays.bayA,
    );
    expect(stored?.starts_at.getTime()).toBe(at(f, 0).getTime());
    expect(stored?.ends_at.getTime()).toBe(at(f, 60).getTime());

    // 3. NEGATIVE CONTROL, on this exact fixture. This is what makes AC-3 falsifiable: it
    //    proves `no_bay_overlap` is live for THIS bay and THIS neighbour, so the adjacency
    //    result that follows is about adjacency rather than about an absent constraint.
    const err = await rejection(
      'AC-3 negative control',
      insertAppointment(
        client,
        validRow(f, { id: idFor('ac3', 'control'), startsAt: at(f, 30), endsAt: at(f, 90) }),
      ),
    );
    expectRejection(err, 'AC-3 negative control', '23P01', 'no_bay_overlap');

    // 4. THE CRITERION. `tstzrange` is half-open, so [anchor+1h, anchor+2h) does not overlap
    //    [anchor+0h, anchor+1h) and back-to-back work in one bay is legal. That is A-4 — no
    //    setup or cleanup buffer — expressed as a bound rather than as prose.
    await insertAppointment(
      client,
      validRow(f, { id: idFor('ac3', 'after'), startsAt: at(f, 60), endsAt: at(f, 120) }),
    );
    const after = await readBack(client, idFor('ac3', 'after'));
    expect(after?.starts_at.getTime()).toBe(at(f, 60).getTime());

    // 5. The same claim in the other insertion order. REDUNDANT WITH STEP 4 AND KEPT AS
    //    COVERAGE, NOT AS A CRITERION: both rows come from the same `tstzrange(starts_at,
    //    ends_at)` expression and `&&` is symmetric, so `upper(neighbour) = lower(new)` and
    //    `upper(new) = lower(neighbour)` are one predicate with the operands swapped. Against
    //    the closed-range mutant, both steps reject — measured at step 2. It earns its place
    //    by making step 6 a count of three rather than two, and by exercising the anchor
    //    arithmetic in the negative direction. It is not kept under an invented second reason.
    await insertAppointment(
      client,
      validRow(f, { id: idFor('ac3', 'before'), startsAt: at(f, -60), endsAt: at(f, 0) }),
    );
    const before = await readBack(client, idFor('ac3', 'before'));
    expect(before?.ends_at.getTime()).toBe(at(f, 0).getTime());

    // 6. Coverage for steps 4 and 5 together: three inserts, three rows, no silent no-ops.
    //    Meaningful only because no other case can write into this bay (§3.2).
    expect(
      await countLive(client, 'bay_id', f.bays.bayA, at(f, -60), at(f, 120)),
      'three adjacent non-overlapping appointments must coexist in one bay',
    ).toBe(3);

    // What steps 4 and 5 establish is that the range is NOT CLOSED. They cannot distinguish
    // `[)` from `(]`: for intervals with ends_at > starts_at, which
    // `appointment_interval_ordered` guarantees, the two agree on every reachable pair, so no
    // test can separate them and this one does not claim to.
  });

  it('AC-4 — cancelling frees the slot: the WHERE (status <> \'cancelled\') predicate is live and not decorative', async () => {
    const f = await seedDealership(client, 'ac4');

    // 1. Appointment A.
    await insertAppointment(
      client,
      validRow(f, { id: idFor('ac4', 'A'), startsAt: at(f, 0), endsAt: at(f, 60) }),
    );
    const a = await readBack(client, idFor('ac4', 'A'));
    expect(a?.status, 'appointment A was not stored confirmed').toBe('confirmed');

    // The row that will be attempted twice — once before the cancellation and once after.
    // Identical both times, so the ONLY thing that changed between rejection and acceptance
    // is A's status. techB/`quick` keeps the technician free so the bay is the only conflict.
    const contender = validRow(f, {
      id: idFor('ac4', 'contender'),
      technicianId: f.technicians.techB,
      serviceTypeId: f.serviceTypes.quick,
      startsAt: at(f, 30),
      endsAt: at(f, 90),
    });

    // 2. BEFORE. This is what turns step 5 from "an insert worked" into "the predicate is
    //    live", which is the acceptance criterion's own wording.
    const err = await rejection('AC-4 before', insertAppointment(client, contender));
    expectRejection(err, 'AC-4 before', '23P01', 'no_bay_overlap');

    // 3. The cancellation. A status transition, never a delete (ADR-0003).
    const update = await client.query(
      "update appointment set status = 'cancelled' where id = $1",
      [idFor('ac4', 'A')],
    );
    expect(update.rowCount, 'the cancellation matched no row').toBe(1);

    // 4. Coverage. Without this, a test that DELETED A would pass — and a delete frees the
    //    slot for an entirely different reason from the one AC-4 names.
    const cancelled = await readBack(client, idFor('ac4', 'A'));
    expect(cancelled, 'A must still exist after cancellation, not be deleted').toBeDefined();
    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.bay_id).toBe(f.bays.bayA);
    expect(cancelled?.technician_id).toBe(f.technicians.techA);
    expect(cancelled?.starts_at.getTime()).toBe(at(f, 0).getTime());
    expect(cancelled?.ends_at.getTime()).toBe(at(f, 60).getTime());

    // 5. AFTER. The slot freed itself through the same mechanism that guards every write; no
    //    compensating release exists to be forgotten.
    await insertAppointment(client, contender);
    const stored = await readBack(client, idFor('ac4', 'contender'));
    expect(stored?.status, 'the overlapping insert must succeed once A is cancelled').toBe(
      'confirmed',
    );
    expect(stored?.starts_at.getTime()).toBe(at(f, 30).getTime());
  });

  /*
   * ── AC-5, AC-6, AC-7, AC-8: every negative case carries a positive control ──────────────
   *
   * §4.2 rule 3 was a promise about the fixture until step 2; it is now an assertion about
   * it. The sibling is the same row with the single intended defect REPAIRED, asserted to
   * succeed. If a fixture drifts into violating something else as well, the accepted half is
   * rejected and the case fails loudly naming the drifted constraint.
   *
   * Why a promise was not enough: when two foreign keys are violable at once PostgreSQL
   * reports one of them, and which one follows trigger firing order, which follows
   * declaration order in `0003_appointment.sql`. Measured at step 2 — an AC-5 fixture drifted
   * into a second violation still reports `appointment_technician_qualified` and passes
   * silently, while the identical drift in AC-6 reports the other constraint and fails
   * loudly. The difference is nothing but the order the constraints happen to be listed in.
   * A discipline whose enforcement depends on an arbitrary ordering is not a discipline.
   *
   * THE ORDERING RULE, AND IT IS NOT OPTIONAL (§4.6):
   *
   *     The negative case runs FIRST. The control runs after it, or in a disjoint interval.
   *
   * The exclusion constraints are evaluated BEFORE the foreign-key triggers (M-2). A control
   * run first succeeds and OCCUPIES THE INTERVAL, so the negative insert that follows hits
   * `23P01` instead of the `23503` the case exists to assert — the control would break the
   * very case it was added to validate, and the failure would read as a schema defect rather
   * than a test-ordering defect. Every control below runs second AND in the interval its
   * rejected sibling vacated, which is the tightest available form of "one column different".
   */

  it('AC-5 — an appointment naming a technician unqualified for the service type is rejected 23503 on appointment_technician_qualified', async () => {
    const f = await seedDealership(client, 'ac5');

    // In a window with NO appointments, so no exclusion constraint can pre-empt the foreign
    // key. techB is in the dealership and the bay, vehicle and customer are all valid, so
    // `appointment_technician_qualified` is the only violable constraint: techB is qualified
    // for `quick` and not for `standard`.
    const err = await rejection(
      'AC-5',
      insertAppointment(
        client,
        validRow(f, {
          id: idFor('ac5', 'unqualified'),
          technicianId: f.technicians.techB,
          serviceTypeId: f.serviceTypes.standard,
          startsAt: at(f, 0),
          endsAt: at(f, 60),
        }),
      ),
    );
    expectRejection(err, 'AC-5', '23503', 'appointment_technician_qualified');

    // POSITIVE CONTROL — one column different: the service type techB IS qualified for. If
    // techB had drifted out of the dealership, or the vehicle away from the customer, this
    // insert is rejected and names the drift.
    await insertAppointment(
      client,
      validRow(f, {
        id: idFor('ac5', 'control'),
        technicianId: f.technicians.techB,
        serviceTypeId: f.serviceTypes.quick,
        startsAt: at(f, 0),
        endsAt: at(f, 60),
      }),
    );
    expect(
      (await readBack(client, idFor('ac5', 'control')))?.status,
      'AC-5 control: the same row with the qualification repaired must be bookable — if it is not, the fixture is violating something other than the constraint under test',
    ).toBe('confirmed');

    // AC-5's constraint is unreachable from HTTP: under A-10 the SYSTEM allocates the
    // technician, so only an allocator bug can violate it. This slice is the only place it
    // can ever be shown to fire.
  });

  it('AC-6 — an appointment naming a vehicle not owned by the named customer is rejected 23503 on appointment_vehicle_owned_by_customer', async () => {
    const f = await seedDealership(client, 'ac6');

    // vehA belongs to custA. There is NO standalone foreign key from appointment.customer_id
    // to customer, so a custB that exists and a custB that does not both reach this same
    // constraint — which is why custB is a real, seeded customer here.
    const err = await rejection(
      'AC-6',
      insertAppointment(
        client,
        validRow(f, {
          id: idFor('ac6', 'not-owned'),
          customerId: f.customers.custB,
          vehicleId: f.vehicles.vehA,
          startsAt: at(f, 0),
          endsAt: at(f, 60),
        }),
      ),
    );
    expectRejection(err, 'AC-6', '23503', 'appointment_vehicle_owned_by_customer');

    // POSITIVE CONTROL — one column different: the vehicle's actual owner.
    await insertAppointment(
      client,
      validRow(f, {
        id: idFor('ac6', 'control'),
        customerId: f.customers.custA,
        vehicleId: f.vehicles.vehA,
        startsAt: at(f, 0),
        endsAt: at(f, 60),
      }),
    );
    expect(
      (await readBack(client, idFor('ac6', 'control')))?.status,
      'AC-6 control: the same row with the ownership repaired must be bookable',
    ).toBe('confirmed');
  });

  it('AC-7 — an appointment naming a bay from another dealership is rejected 23503 on appointment_bay_in_dealership', async () => {
    // Two dealerships, two namespaces, two disjoint subtrees. A-9: resources never span
    // dealerships.
    const d1 = await seedDealership(client, 'ac7-d1');
    const d2 = await seedDealership(client, 'ac7-d2');

    // Everything comes from D2 except the bay, which is D1's. Getting the technician wrong
    // here would make `appointment_technician_in_dealership` violable too, and §11.2 A-2 says
    // which of two is reported is not guaranteed — so the technician, its qualification, the
    // customer and the vehicle are all D2's.
    const err = await rejection(
      'AC-7',
      insertAppointment(client, {
        id: idFor('ac7', 'foreign-bay'),
        dealershipId: d2.dealershipId,
        customerId: d2.customers.custA,
        vehicleId: d2.vehicles.vehA,
        serviceTypeId: d2.serviceTypes.standard,
        technicianId: d2.technicians.techA,
        bayId: d1.bays.bayA,
        startsAt: at(d2, 0),
        endsAt: at(d2, 60),
      }),
    );
    // The acceptance criterion says only "rejected". Asserted at the name because "rejected"
    // alone is satisfied by any of four constraints and would not be evidence for A-9.
    expectRejection(err, 'AC-7', '23503', 'appointment_bay_in_dealership');

    // POSITIVE CONTROL — one column different: D2's own bay.
    await insertAppointment(client, {
      id: idFor('ac7', 'control'),
      dealershipId: d2.dealershipId,
      customerId: d2.customers.custA,
      vehicleId: d2.vehicles.vehA,
      serviceTypeId: d2.serviceTypes.standard,
      technicianId: d2.technicians.techA,
      bayId: d2.bays.bayA,
      startsAt: at(d2, 0),
      endsAt: at(d2, 60),
    });
    expect(
      (await readBack(client, idFor('ac7', 'control')))?.status,
      'AC-7 control: the same row with D2\'s own bay must be bookable',
    ).toBe('confirmed');
  });

  it('AC-8 — an appointment with ends_at <= starts_at is rejected 23514 on appointment_interval_ordered', async () => {
    const f = await seedDealership(client, 'ac8');

    // A `tstzrange(x, y)` with y < x raises 22000 from the range constructor — so if the
    // exclusion index were evaluated before the CHECK, this case would fail with the wrong
    // SQLSTATE. It is not: the CHECK fires first, measured in all three variants (M-1).
    for (const [label, endMinutes] of [
      ['ends_at = starts_at', 0],
      ['ends_at < starts_at', -60],
    ] as const) {
      const err = await rejection(
        `AC-8 ${label}`,
        insertAppointment(
          client,
          validRow(f, {
            id: idFor('ac8', label),
            startsAt: at(f, 0),
            endsAt: at(f, endMinutes),
          }),
        ),
      );
      expectRejection(err, `AC-8 ${label}`, '23514', 'appointment_interval_ordered');
    }

    // POSITIVE CONTROL, and AC-8 needs it MORE than the other three rather than less — which
    // is the reverse of how CHECK precedence first reads. Because a CHECK fires before every
    // foreign key AND before both exclusion constraints, a drifted row that ALSO named an
    // unqualified technician, a foreign bay and a mismatched vehicle would still report
    // `23514` / `appointment_interval_ordered`. The reported name masks every other defect
    // the row carries, so AC-8's assertion is the least attributable of the nine. This
    // control is the only thing establishing that the rest of that row was ever bookable.
    await insertAppointment(
      client,
      validRow(f, { id: idFor('ac8', 'control'), startsAt: at(f, 0), endsAt: at(f, 60) }),
    );
    expect(
      (await readBack(client, idFor('ac8', 'control')))?.status,
      'AC-8 control: the same row with a valid interval must be bookable — without this, 23514 says nothing about the other six columns',
    ).toBe('confirmed');
  });

  it('AC-9 — the seed fixtures populate every reference table and the suite books against them deterministically', async () => {
    const f = await seedDealership(client, 'ac9');

    // "Every reference table is populated" is a COVERAGE claim, so it is asserted as one:
    // all eight non-appointment relations, each scoped as tightly as the table allows.
    //
    // service_type, customer and vehicle are NOT dealership-scoped, so isolation by data is
    // genuinely partial — every case's rows land in those three tables side by side. An
    // assertion over them must scope by returned id and NEVER by a table-wide count, or it
    // becomes a race against every other case in the run.
    const counts = await Promise.all([
      scalar(client, 'select count(*)::text from dealership where id = $1', [f.dealershipId]),
      scalar(client, 'select count(*)::text from opening_hours where dealership_id = $1', [
        f.dealershipId,
      ]),
      scalar(client, 'select count(*)::text from service_type where id = any($1::uuid[])', [
        [f.serviceTypes.standard, f.serviceTypes.quick],
      ]),
      scalar(client, 'select count(*)::text from service_bay where dealership_id = $1', [
        f.dealershipId,
      ]),
      scalar(client, 'select count(*)::text from technician where dealership_id = $1', [
        f.dealershipId,
      ]),
      scalar(
        client,
        'select count(*)::text from technician_qualification where technician_id = any($1::uuid[])',
        [[f.technicians.techA, f.technicians.techB]],
      ),
      scalar(client, 'select count(*)::text from customer where id = any($1::uuid[])', [
        [f.customers.custA, f.customers.custB],
      ]),
      scalar(client, 'select count(*)::text from vehicle where id = any($1::uuid[])', [
        [f.vehicles.vehA, f.vehicles.vehB],
      ]),
    ]);

    expect(
      Object.fromEntries(
        [
          'dealership',
          'opening_hours',
          'service_type',
          'service_bay',
          'technician',
          'technician_qualification',
          'customer',
          'vehicle',
        ].map((table, index) => [table, counts[index]]),
      ),
      'every reference table of arc42 §8.1 must be populated by one seedDealership call',
    ).toEqual({
      dealership: 1,
      opening_hours: 7,
      service_type: 2,
      service_bay: 2,
      technician: 2,
      technician_qualification: 3,
      customer: 2,
      vehicle: 2,
    });

    // "The suite can book against them deterministically" — one successful INSERT using ONLY
    // returned ids, read back. No test discovers a fixture by query.
    await insertAppointment(
      client,
      validRow(f, { id: idFor('ac9', 'booking'), startsAt: at(f, 0), endsAt: at(f, 60) }),
    );
    const booked = await readBack(client, idFor('ac9', 'booking'));
    expect(booked?.status, 'the fixtures must be bookable against').toBe('confirmed');
    expect(booked?.bay_id).toBe(f.bays.bayA);
    expect(booked?.technician_id).toBe(f.technicians.techA);
    expect(booked?.starts_at.getTime()).toBe(at(f, 0).getTime());
    expect(booked?.ends_at.getTime()).toBe(at(f, 60).getTime());
  });
});

/* ══════════════════════════════════════════════════════════════════════ small helpers ══ */

async function scalar(client: Client, sql: string, params: unknown[]): Promise<number> {
  const { rows } = await client.query<{ count: string }>(sql, params);
  return Number(rows[0]?.count ?? '-1');
}
