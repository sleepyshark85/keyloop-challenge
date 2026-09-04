/**
 * The suite's reference-data fixtures — test-engineer's, slice 00 step 3.
 *
 * ADR-0012 (Option D) and docs/slices/00-design.md §3. One complete dealership subtree per
 * call, raw SQL over the injected connection, every id RETURNED rather than discovered.
 *
 * Three properties this file exists to have, all of them load-bearing:
 *
 * 1. **It is an independent transcription of arc42 §8.1.** It is written by a role that
 *    cannot read `src/persistence/migrations/`, from arc42 alone, and its INSERTs name
 *    every column of every reference table. A renamed or dropped column in
 *    `0002_reference_data.sql` fails loudly with `42703`. Scoped honestly: it detects
 *    COLUMN-LEVEL divergence on the eight tables it writes. It detects nothing about
 *    constraints — that is case 0's job — and nothing about an extra column.
 *
 * 2. **No `ON CONFLICT DO NOTHING`, anywhere.** Two cases sharing a namespace must fail
 *    loudly on `dealership_pkey` rather than silently sharing a subtree, because a silently
 *    shared fixture is exactly how a vacuous pass is manufactured.
 *
 * 3. **No test discovers a fixture by query.** `select id from service_bay limit 1` is a
 *    fixture shared by accident; every id below comes back in the return value.
 *
 * What per-case namespaces buy is ATTRIBUTABILITY, not concurrency (§3.2). Vitest
 * parallelises files, not cases, and the cases in `exclusion-constraints.test.ts` run
 * sequentially in one worker. Within that file the namespace is what makes AC-3's row count
 * a claim about AC-3: no other case can write into that bay.
 *
 * No import from src/ — `outside-in-tests-do-not-import-src` covers tests/support/, and
 * there is no src/ module to import in this slice, which is the point of the slice.
 */
import type { Client } from 'pg';
import { uuidFor, vinFor } from './ids.js';

/**
 * The one named instant every interval in the suite is expressed as an offset from, so no
 * literal timestamp is scattered through a test file.
 *
 * 2026-09-08 is a Tuesday. In `Europe/London` (BST, +01:00) this instant is 10:00 local, so
 * the whole window the suite writes into — anchor-1h to anchor+3h, 09:00 to 13:00 local —
 * sits inside the 08:00-18:00 opening hours seeded for all seven days. Nothing in slice 00
 * validates opening hours (there is no domain code yet), so this is future-proofing rather
 * than a current dependency, and it is why §3.3 seeds every day rather than one.
 */
export const ANCHOR = new Date('2026-09-08T09:00:00.000Z');

/** Every id `seedDealership` created, plus the anchor. Nothing here is discovered. */
export interface DealershipFixture {
  readonly namespace: string;
  readonly dealershipId: string;
  /** `standard` is 60 minutes; `quick` is 30. */
  readonly serviceTypes: { readonly standard: string; readonly quick: string };
  readonly bays: { readonly bayA: string; readonly bayB: string };
  /** `techA` is qualified for both service types; `techB` for `quick` ONLY — that asymmetry is AC-5's whole fixture. */
  readonly technicians: { readonly techA: string; readonly techB: string };
  readonly customers: { readonly custA: string; readonly custB: string };
  /** `vehA` belongs to `custA`, `vehB` to `custB` — the pairing AC-6 violates. */
  readonly vehicles: { readonly vehA: string; readonly vehB: string };
  readonly anchor: Date;
}

/** An instant `minutes` from the fixture's anchor. Negative offsets are intended (AC-3). */
export function at(fixture: DealershipFixture, minutes: number): Date {
  return new Date(fixture.anchor.getTime() + minutes * 60_000);
}

/**
 * Insert one complete dealership subtree under `namespace` and return every id.
 *
 * Two cases must never share a namespace: the ids are derived from it, so a shared namespace
 * collides on `dealership_pkey` and the case fails loudly. That is deliberate.
 */
export async function seedDealership(
  client: Client,
  namespace: string,
): Promise<DealershipFixture> {
  const id = (name: string): string => uuidFor(namespace, name);

  const fixture: DealershipFixture = {
    namespace,
    dealershipId: id('dealership'),
    serviceTypes: { standard: id('service_type/standard'), quick: id('service_type/quick') },
    bays: { bayA: id('service_bay/bayA'), bayB: id('service_bay/bayB') },
    technicians: { techA: id('technician/techA'), techB: id('technician/techB') },
    customers: { custA: id('customer/custA'), custB: id('customer/custB') },
    vehicles: { vehA: id('vehicle/vehA'), vehB: id('vehicle/vehB') },
    anchor: ANCHOR,
  };

  // dealership (id, name, time_zone) — an IANA zone, ADR-0001 / A-8.
  await client.query('insert into dealership (id, name, time_zone) values ($1, $2, $3)', [
    fixture.dealershipId,
    `${namespace} motors`,
    'Europe/London',
  ]);

  // opening_hours (dealership_id, day_of_week, opens_at, closes_at) — all seven days, so
  // the anchor is inside opening hours whichever weekday it falls on and no claim about a
  // date can go stale. A day with no row is a day the dealership is closed (§8.1), which is
  // why seeding all seven sidesteps that rule rather than depending on it.
  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
    await client.query(
      'insert into opening_hours (dealership_id, day_of_week, opens_at, closes_at) values ($1, $2, $3, $4)',
      [fixture.dealershipId, dayOfWeek, '08:00', '18:00'],
    );
  }

  // service_type (id, name, duration_minutes) — NOT dealership-scoped (§3.5).
  await client.query(
    'insert into service_type (id, name, duration_minutes) values ($1, $2, $3), ($4, $5, $6)',
    [fixture.serviceTypes.standard, 'standard', 60, fixture.serviceTypes.quick, 'quick', 30],
  );

  // service_bay (id, dealership_id, name) — two, so AC-2 can free the bay while holding the
  // technician, and AC-3's control can hold the bay while freeing the technician.
  await client.query(
    'insert into service_bay (id, dealership_id, name) values ($1, $2, $3), ($4, $5, $6)',
    [fixture.bays.bayA, fixture.dealershipId, 'bayA', fixture.bays.bayB, fixture.dealershipId, 'bayB'],
  );

  // technician (id, dealership_id, name) — two, for the mirror-image reason.
  await client.query(
    'insert into technician (id, dealership_id, name) values ($1, $2, $3), ($4, $5, $6)',
    [
      fixture.technicians.techA,
      fixture.dealershipId,
      'techA',
      fixture.technicians.techB,
      fixture.dealershipId,
      'techB',
    ],
  );

  // technician_qualification (technician_id, service_type_id) — THREE rows, not four.
  // techB is qualified for `quick` and NOT for `standard`. Without that asymmetry there is
  // no fixture that violates `appointment_technician_qualified` while satisfying every other
  // constraint, and AC-5 cannot be isolated at all (§3.3, §4.6).
  await client.query(
    'insert into technician_qualification (technician_id, service_type_id) values ($1, $2), ($3, $4), ($5, $6)',
    [
      fixture.technicians.techA,
      fixture.serviceTypes.standard,
      fixture.technicians.techA,
      fixture.serviceTypes.quick,
      fixture.technicians.techB,
      fixture.serviceTypes.quick,
    ],
  );

  // customer (id, name) — NOT dealership-scoped (§3.5).
  await client.query('insert into customer (id, name) values ($1, $2), ($3, $4)', [
    fixture.customers.custA,
    'custA',
    fixture.customers.custB,
    'custB',
  ]);

  // vehicle (id, customer_id, vin, description) — NOT dealership-scoped, and `vin` carries a
  // GLOBAL UNIQUE, which is why it is derived rather than literal (§3.4).
  await client.query(
    'insert into vehicle (id, customer_id, vin, description) values ($1, $2, $3, $4), ($5, $6, $7, $8)',
    [
      fixture.vehicles.vehA,
      fixture.customers.custA,
      vinFor(namespace, 'vehA'),
      'vehA — custA',
      fixture.vehicles.vehB,
      fixture.customers.custB,
      vinFor(namespace, 'vehB'),
      'vehB — custB',
    ],
  );

  return fixture;
}
