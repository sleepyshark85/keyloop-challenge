/**
 * Reference data — the eight relations the API never writes (A-7), read for one booking.
 *
 * Everything here is a STATIC PROPERTY OF THE REQUEST: a dealership's zone and weekly hours, a
 * service type's duration, whether a vehicle belongs to a customer. None of it can be invalidated
 * by a concurrent booking, which is exactly the category ADR-0001 admits for opening hours and is
 * why reading it before the insert is not check-then-act. Nothing in this file reads
 * `appointment`.
 *
 * QS-12: this module carries `time_zone` and `ianaZone` — it is on the `zone-transport` permitted
 * list — and it must never REASON about either. It hands `time_zone` across as the string `pg`
 * gave it and hands `opens_at` / `closes_at` across as the strings `pg` gave them; the parse and
 * the zone conversion both belong to `src/domain/openingHours.ts` and are unreachable from here,
 * because `domain-is-pure` means that module imports nothing and this one calls it never.
 */
import type { Db } from './db.js';
import type { DayHours, WeeklyOpeningHours } from '../domain/openingHours.js';

/**
 * One dealership, in the shape the booking path needs and no wider.
 *
 * `weekly` is the seven-slot tuple `openingHours.ts` defines, built from the `opening_hours`
 * rows: A DAY WITH NO ROW STAYS `null`, which is the closed day slice 01's AC-4 specified. Nothing
 * here defaults a missing day to "open" or to yesterday's hours.
 */
export interface DealershipReference {
  readonly id: string;
  readonly ianaZone: string;
  readonly weekly: WeeklyOpeningHours;
}

/** The shape `service_type` contributes. Structurally `ServiceTypeDuration` from src/domain. */
export interface ServiceTypeReference {
  readonly durationMinutes: number;
}

/**
 * ADR-0017's verdicts. THERE IS NO `'ok'` MEMBER, deliberately: the type cannot express
 * permission, so no later edit can turn this into a pre-flight gate without changing the type —
 * which is visible in a diff and arguable at review. See {@link classifyOwnership}.
 */
export type OwnershipVerdict = 'unknown-customer' | 'unknown-vehicle' | 'not-owned';

/**
 * Seven slots, one per `day_of_week`, written out rather than cast from an array. `null` is a
 * closed day and not an unbounded one, and under `noUncheckedIndexedAccess` a `readonly [7]` tuple
 * cannot be produced from a `[]` without an assertion — so the seven positions are named. A day
 * the query returned no row for stays `null` here, which is where slice 01's AC-4 lives.
 */
function toWeekly(slots: readonly (DayHours | null)[]): WeeklyOpeningHours {
  const at = (dayOfWeek: number): DayHours | null => slots[dayOfWeek] ?? null;
  return [at(0), at(1), at(2), at(3), at(4), at(5), at(6)];
}

export async function findDealership(
  db: Db,
  id: string,
): Promise<DealershipReference | null> {
  const dealership = await db
    .selectFrom('dealership')
    .select(['id', 'time_zone'])
    .where('id', '=', id)
    .executeTakeFirst();

  if (dealership === undefined) return null;

  const rows = await db
    .selectFrom('opening_hours')
    .select(['day_of_week', 'opens_at', 'closes_at'])
    .where('dealership_id', '=', id)
    .execute();

  // A `day_of_week` outside 0-6 is not re-checked here, and that is a decision rather than an
  // omission: `toWeekly` reads seven named positions, so a row claiming day 7 lands in a slot
  // nothing ever looks at. Adding a bound test would be a second guard over the same fact whose
  // effect no test could observe — dead code, and a surviving mutant wearing a guard's clothes.
  // The column's own `CHECK (day_of_week BETWEEN 0 AND 6)` is what rules it out at the source.
  const slots: (DayHours | null)[] = [];
  for (const row of rows) {
    slots[row.day_of_week] = { opensAt: row.opens_at, closesAt: row.closes_at };
  }

  return {
    id: dealership.id,
    ianaZone: dealership.time_zone,
    weekly: toWeekly(slots),
  };
}

export async function findServiceType(
  db: Db,
  id: string,
): Promise<ServiceTypeReference | null> {
  const row = await db
    .selectFrom('service_type')
    .select(['duration_minutes'])
    .where('id', '=', id)
    .executeTakeFirst();

  return row === undefined ? null : { durationMinutes: row.duration_minutes };
}

/**
 * ADR-0017 — §5.3. Called ONLY after an `INSERT` has already been refused with `23503` on
 * `appointment_vehicle_owned_by_customer`, to separate the three failures that share that one
 * constraint name (measured: unknown vehicle, unknown customer and not-owned are indistinguishable
 * from the error alone, and AC-9 and AC-10 need two different `type`s out of them — so the
 * disambiguating step is structurally required, not a design preference).
 *
 * IT IS NOT CHECK-THEN-ACT, and the reason is not "it is only a read". Three properties, all
 * three needed:
 *
 *  1. It runs STRICTLY AFTER the write. There is no window, because there is nothing after it to
 *     have a window before.
 *  2. Its result cannot permit anything — {@link OwnershipVerdict} has no `'ok'`.
 *  3. It reads reference data only, the category ADR-0001 admits.
 *
 * One statement, so the two sub-selects see one snapshot and cannot disagree with each other.
 * Validating ownership BEFORE the insert instead is genuinely tempting and is rejected in
 * ADR-0017: it would make the composite FK's `23503` arm unreachable, which is R-01-4's exact
 * shape — a correct, measured constraint made inert by its consumer.
 */
export async function classifyOwnership(
  db: Db,
  customerId: string,
  vehicleId: string,
): Promise<OwnershipVerdict> {
  // `selectNoFrom`, not a `FROM` on either table: a `select ... from vehicle limit 1` would
  // return NO ROW at all against an empty `vehicle` table and the classification would depend on
  // the size of a table it is not asking about.
  const row = await db
    .selectNoFrom((eb) => [
      eb
        .exists(eb.selectFrom('customer').select('id').where('id', '=', customerId))
        .as('customer_exists'),
      eb
        .exists(eb.selectFrom('vehicle').select('id').where('id', '=', vehicleId))
        .as('vehicle_exists'),
    ])
    .executeTakeFirstOrThrow();

  if (!row.customer_exists) return 'unknown-customer';
  if (!row.vehicle_exists) return 'unknown-vehicle';
  // Both exist and the composite FK still refused the insert, so the vehicle is not this
  // customer's. There is no third sub-select for that: it would be a read whose only possible
  // answer here is `false`, and a query nobody can make return `true` is not evidence.
  return 'not-owned';
}
