/**
 * The Kysely `Database` interface — a TYPE DECLARATION, not a data-model change.
 *
 * It was empty from slice 00a until here, deliberately: `Kysely<Database>` needs the type
 * parameter, so `db.ts` cannot export its `Db` alias without it, and a speculative `appointment`
 * member before slice 00 built the table would have been a data-model delta smuggled in as a
 * type. Slice 00 added the migrations; slice 02 is the first code to read or write them, so this
 * is where the interface is populated (design §1: no migration, no data-model delta).
 *
 * IT IS A SECOND STATEMENT OF A SCHEMA THE MIGRATIONS ALREADY OWN — arc42 §11's R-6, and it goes
 * live here rather than being introduced here. Nothing checks the two against each other: a
 * column renamed in `0002_reference_data.sql` and not renamed below is a compile-clean lie, and
 * the first thing that notices is an integration test failing with `42703 undefined_column`.
 * F-02-5 routes that to §11 rather than papering over it.
 *
 * Column names are the migrations' — snake_case, verbatim — because Kysely compiles the property
 * name straight into the SQL. `starts_at` and `ends_at` arrive as `Date` and `opens_at` /
 * `closes_at` as verbatim strings, both measured (design §1, measurement 9): `'24:00:00'` round-
 * trips as the JavaScript string `"24:00:00"`, which is exactly what `openingHours.ts` parses.
 *
 * `time_zone` below is the only reason this file carries a zone identifier at all. QS-12's
 * `zone-transport` marker permits it here: naming a column is transport, not reasoning — nothing
 * in this file interprets the value, and nothing can, because it is a type declaration.
 *
 * `Generated<T>` marks the three columns `0003_appointment.sql` gives a DEFAULT — `status`,
 * `created_at`, `updated_at`. It is not decoration: it is what makes them optional on an INSERT
 * and present on a SELECT, so `insertAppointment` CANNOT set a status. Slice 05 cancels through
 * an UPDATE, and until then "an appointment is created confirmed" is the database's statement
 * rather than a value the application repeats.
 */
import type { Generated } from 'kysely';

/** `appointment` — the one table the API writes (`0003_appointment.sql`). */
export interface AppointmentTable {
  id: string;
  dealership_id: string;
  customer_id: string;
  vehicle_id: string;
  service_type_id: string;
  technician_id: string;
  bay_id: string;
  starts_at: Date;
  ends_at: Date;
  /** The `appointment_status` enum. `cancelled` is slice 05's; the column exists today. */
  status: Generated<'confirmed' | 'cancelled'>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** `dealership` — reference data (`0002_reference_data.sql`), never written by the API (A-7). */
export interface DealershipTable {
  id: string;
  name: string;
  time_zone: string;
}

/** `opening_hours`. A day with NO ROW is a day the dealership is closed (slice 01, AC-4). */
export interface OpeningHoursTable {
  dealership_id: string;
  /** 0 = Sunday, mirroring `CHECK (day_of_week BETWEEN 0 AND 6)`. */
  day_of_week: number;
  opens_at: string;
  closes_at: string;
}

export interface ServiceTypeTable {
  id: string;
  name: string;
  duration_minutes: number;
}

export interface ServiceBayTable {
  id: string;
  dealership_id: string;
  name: string;
}

export interface TechnicianTable {
  id: string;
  dealership_id: string;
  name: string;
}

export interface TechnicianQualificationTable {
  technician_id: string;
  service_type_id: string;
}

export interface CustomerTable {
  id: string;
  name: string;
}

export interface VehicleTable {
  id: string;
  customer_id: string;
  vin: string;
  description: string;
}

export interface Database {
  appointment: AppointmentTable;
  dealership: DealershipTable;
  opening_hours: OpeningHoursTable;
  service_type: ServiceTypeTable;
  service_bay: ServiceBayTable;
  technician: TechnicianTable;
  technician_qualification: TechnicianQualificationTable;
  customer: CustomerTable;
  vehicle: VehicleTable;
}
