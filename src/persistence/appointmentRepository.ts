/**
 * The one table the API writes, and the only module permitted to name it.
 *
 * `tests/architecture/ambiguity-containment.test.ts` asserts `appointment-table-access` matches
 * EXACTLY this file — not at most this file. AC-5's mechanism: "no code path reads availability
 * and then decides whether to insert" is enforced by there being nowhere else that can read.
 *
 * ── THE INSERT DOES NOT CATCH ─────────────────────────────────────────────────────────────────
 *
 * It lets `pg`'s error out so the caller classifies it through the one site. That is the opposite
 * of `pingDatabase`, which swallows everything and returns a boolean — and the difference is the
 * contract: a boolean is `pingDatabase`'s whole answer, whereas WHICH constraint refused this
 * insert is the entire content of AC-3, AC-4 and AC-11. A `try` here would be the second
 * translation site `sql-only-in-persistence` exists to forbid.
 *
 * ── EACH ATTEMPT IS ITS OWN TRANSACTION, AND THE LOOP IS NOT WRAPPED IN ONE ───────────────────
 *
 * ADR-0004 required this before ADR-0018 gave it a second reason: a constraint violation aborts
 * the enclosing transaction, so a second attempt inside one fails with `25P02 in_failed_sql_
 * transaction` rather than retrying — measured at step 2. ADR-0018's locks are
 * `pg_advisory_xact_lock`, the TRANSACTION-scoped form and not the session-scoped one, precisely
 * so an attempt releases them as it ends and no lock survives into the next candidate. The two
 * requirements are compatible only if the transaction boundary is exactly one attempt wide, which
 * is why {@link lockResources} takes the same handle {@link insertAppointment} does and the
 * caller opens one transaction per attempt.
 */
import { sql } from 'kysely';
import type { Db } from './db.js';

/** The ten columns the API sets or reads. `created_at` and `updated_at` are the database's. */
export interface AppointmentRow {
  readonly id: string;
  readonly dealershipId: string;
  readonly customerId: string;
  readonly vehicleId: string;
  readonly serviceTypeId: string;
  readonly technicianId: string;
  readonly bayId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: 'confirmed' | 'cancelled';
}

/**
 * What one attempt writes. There is NO `endsAt` the client can supply — AC-6, structurally.
 *
 * NO `bayId` AND NO `technicianId` — ADR-0026 decision C. Both are read off the {@link
 * ResourceLock} the write takes, so a caller cannot construct one and separately choose what to
 * lock: there is exactly one value in scope naming the pair, and it is the one `lockResources`
 * minted.
 */
export interface NewAppointment {
  readonly id: string;
  readonly dealershipId: string;
  readonly customerId: string;
  readonly vehicleId: string;
  readonly serviceTypeId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

/**
 * ADR-0026 — a value the write takes, carrying the keys it took.
 *
 * `lockResources` is the ONLY minting site: a write cannot be called without one, and there is
 * no shape that declines to name it (the parameter is required). This forecloses two things
 * between the lock and the write — "forgot the lock" (a compile error) and "locked the wrong
 * keys" (there is no second copy of `bayId`/`technicianId` for the write to disagree with) —
 * and leaves ONE thing open, recorded rather than hidden: the brand is erased at runtime, and
 * nothing here proves the write runs in the SAME transaction the lock was taken on
 * (`pg_advisory_xact_lock` is transaction-scoped). Both parameters take the same `Db` at every
 * call site today, so a mismatch is one expression rather than a compiler fact — ADR-0028,
 * `proposed`, would close that; it is not built here.
 */
export interface ResourceLock {
  readonly bayId: string;
  readonly technicianId: string;
  readonly __brand: 'ResourceLock';
}

/** The terminal status. ADR-0003: cancellation is a transition, never a delete. */
const CANCELLED = 'cancelled';

/** Advisory-lock classes. Disjoint key spaces are what make the order total — ADR-0018. */
const BAY_LOCK_CLASS = 1;
const TECHNICIAN_LOCK_CLASS = 2;

/**
 * ADR-0018 — take the bay lock and then the technician lock, in one statement, before the insert.
 *
 * WHY THIS EXISTS AT ALL. Measured on this repository's migrations, `postgres:16-alpine`, 20
 * racers on one bay released from a hard barrier over 20 trials: 20 confirmed, 95 `23P01` and
 * **285 `40P01`**. `check_exclusion_constraint` inserts the index tuple and THEN scans, so
 * simultaneous inserters wait on each other's in-progress tuples and cycle. Exactly one row
 * survived every trial — §2.1 was never in question — but three losers in four were told `500`
 * where AC-3 and AC-4 require `409`. Retry cannot rescue it: all five measured configurations
 * LIVELOCK, because an aborted racer re-inserts its index tuple and the population of in-flight
 * inserters never falls to one.
 *
 * WHY IT IS NOT A CORRECTNESS MECHANISM, WHICH IS THE PART THAT MATTERS. The lock reads no table
 * and decides no outcome; it only stops two inserters being in flight against the same bay or the
 * same technician at once. Measured both ways, and the pair is what turns that from a claim into
 * a reading: drop the CONSTRAINTS and keep the lock, and 20 overlapping rows are written — it
 * prevents nothing; drop the LOCK and keep the constraints, and there is still exactly one row
 * (with 108 deadlocks) — it decides nothing. Correctness is entirely the constraint's; liveness is
 * entirely the lock's. `tests/integration/exclusion-constraint-adjudicates.test.ts` runs both.
 *
 * ONE STATEMENT, not two, and classes rather than a sorted pair: class 1 is bays and class 2 is
 * technicians, so the key spaces are disjoint by construction and *bay-then-technician* is a total
 * order no attempt can take in reverse. There is no sort for anyone to keep sorted, which is a
 * whole category of lock-ordering bug that cannot be written here.
 *
 * F-02-9, inherited by slice 06 and slice 07: EVERY write path to `appointment` must take these
 * two locks in this order. One that skips them reintroduces the deadlock against a booking — and
 * because a `40P01` is not retried, it surfaces as a `500` rather than as a latency blip.
 *
 * ── IT RETURNS THE LOCK IT TOOK, AND THAT IS ADR-0026 RATHER THAN A CONVENIENCE ───────────────
 *
 * This is the ONLY minting site for {@link ResourceLock}. F-05-1: this file held two write
 * functions, one locking and one not (ADR-0023), and "correctly exempt" read identically to
 * "forgot the lock". A write that needs the lock now cannot be called without a value only this
 * function produces, so the mistake is a compile error rather than a docblock.
 */
export async function lockResources(
  db: Db,
  bayId: string,
  technicianId: string,
): Promise<ResourceLock> {
  await sql`
    select pg_advisory_xact_lock(c, k)
      from unnest(
             array[${sql.lit(BAY_LOCK_CLASS)}, ${sql.lit(TECHNICIAN_LOCK_CLASS)}],
             array[hashtext(${bayId}), hashtext(${technicianId})]
           ) as t(c, k)
  `.execute(db);

  // The ONE cast this brand costs, confined to this function — the ADR-0016 shape one layer
  // down, and the same house pattern `candidates.ts`'s three casts already use.
  return { bayId, technicianId } as ResourceLock;
}

/**
 * ONE statement. No pre-read, no `ON CONFLICT`, and no `catch`.
 *
 * `ON CONFLICT DO NOTHING` was measured and is worse than the deadlock it avoids: all twenty
 * racers bail on each other's in-progress tuples, 193 of 200 statements returned zero rows, and
 * **3 of 10 trials produced no appointment at all**. It converts a deadlock into a silent total
 * loss of capacity and returns no `err.constraint` for AC-3 and AC-4 to assert on.
 */
export async function insertAppointment(
  db: Db,
  values: NewAppointment,
  lock: ResourceLock,
): Promise<AppointmentRow> {
  const row = await db
    .insertInto('appointment')
    .values({
      id: values.id,
      dealership_id: values.dealershipId,
      customer_id: values.customerId,
      vehicle_id: values.vehicleId,
      service_type_id: values.serviceTypeId,
      // ADR-0026: off the LOCK, never a second copy of the pair carried on `values`.
      technician_id: lock.technicianId,
      bay_id: lock.bayId,
      starts_at: values.startsAt,
      ends_at: values.endsAt,
    })
    .returning([
      'id',
      'dealership_id',
      'customer_id',
      'vehicle_id',
      'service_type_id',
      'technician_id',
      'bay_id',
      'starts_at',
      'ends_at',
      'status',
    ])
    .executeTakeFirstOrThrow();

  return toAppointmentRow(row);
}

export async function findAppointmentById(db: Db, id: string): Promise<AppointmentRow | null> {
  const row = await db
    .selectFrom('appointment')
    .select([
      'id',
      'dealership_id',
      'customer_id',
      'vehicle_id',
      'service_type_id',
      'technician_id',
      'bay_id',
      'starts_at',
      'ends_at',
      'status',
    ])
    .where('id', '=', id)
    .executeTakeFirst();

  return row === undefined ? null : toAppointmentRow(row);
}

/**
 * The row mapper. `starts_at` and `ends_at` arrive as `Date` — measured (design §1, measurement
 * 9) — and stay `Date` here: rendering them is `src/application`'s, because DA-02-2 puts the
 * ISO-8601 UTC decision in the use case and not in a mapper nobody reads.
 */
function toAppointmentRow(row: {
  id: string;
  dealership_id: string;
  customer_id: string;
  vehicle_id: string;
  service_type_id: string;
  technician_id: string;
  bay_id: string;
  starts_at: Date;
  ends_at: Date;
  status: 'confirmed' | 'cancelled';
}): AppointmentRow {
  return {
    id: row.id,
    dealershipId: row.dealership_id,
    customerId: row.customer_id,
    vehicleId: row.vehicle_id,
    serviceTypeId: row.service_type_id,
    technicianId: row.technician_id,
    bayId: row.bay_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
  };
}

/**
 * Slice 05 — `POST /appointments/{id}/cancellation`, as ONE unconditional statement.
 *
 * ── IT TAKES NO ADVISORY LOCK, AND THAT IS ADR-0023 RATHER THAN AN OMISSION ───────────────────
 *
 * {@link lockResources}'s docblock carries F-02-9 — "EVERY write path to `appointment` must take
 * these two locks in this order" — and this is the one path that sentence was wrong about.
 * ADR-0023 narrows it to an iff: a TRANSACTION takes the locks iff some statement in it writes a
 * row version INTO an exclusion constraint's scope. Both constraints in `0003_appointment.sql`
 * read
 *
 *     EXCLUDE USING gist (…) WHERE (status <> 'cancelled')
 *
 * so a row this statement writes satisfies neither predicate: there is no adjudication here for a
 * lock to serialise, and the exemption is readable off two adjacent lines — what the statement
 * sets, and what the predicate excludes. Measured (ADR-0023 M1-M3): an inserter waits on an
 * uncommitted cancel and then gets its `201`; the cancel never waits on an exclusion check; the
 * wait is one-directional, and a one-directional wait cannot cycle.
 *
 * F-05-1, RESOLVED at slice 06 by ADR-0026: `lockResources` returns a branded {@link
 * ResourceLock} that {@link insertAppointment} takes as a parameter (and the reschedule write
 * about to land beside it will too), so "forgot the lock" is a compile error and this function's
 * signature — a plain {@link Db} and no lock parameter — is now itself the readable statement of
 * "correctly exempt", with no docblock required to tell the two apart.
 *
 * ── ONE STATEMENT, NO GUARD, AND §2.1 NEVER ARISES ────────────────────────────────────────────
 *
 * There is no pre-read and no `AND status <> 'cancelled'`, so nothing here checks anything before
 * acting: the forbidden shape has no subject. The guard is rejected on its own merits too — it
 * returns zero rows for an ALREADY-CANCELLED row as well as for an unknown id, which is arc42
 * §6.6's ambiguity and would answer AC-3's replay with AC-4's `404`. Unguarded, `null` means
 * exactly one thing: no such id.
 *
 * ── THE `CASE`, WHICH IS AC-3 TAKEN LITERALLY ─────────────────────────────────────────────────
 *
 * A plain `updated_at = now()` advances the column on a replay, making a repeated cancellation a
 * client-reachable write to a column arc42 §8.1 says the APPLICATION maintains. The `CASE` reads
 * `status` inside the statement that writes it — the old row version, under that row's own lock —
 * so the replay changes no column at all. It is not a check-then-act window: nothing decides
 * WHETHER to write, only what one column is set to.
 *
 * The strongest TRUE claim, because `tests/integration/cancellation-releases-slot.test.ts`
 * measures it: *changes no column* holds; *writes nothing* does not. A replay still takes the row
 * lock and leaves a dead tuple — `xmin` advances 739 -> 740.
 */
export async function cancelAppointmentById(db: Db, id: string): Promise<AppointmentRow | null> {
  const row = await db
    .updateTable('appointment')
    .set({
      status: CANCELLED,
      // Kysely renders this verbatim; `sql.lit` rather than a bound parameter so the comparison
      // and the value written are one token apart in the statement a reader sees.
      updated_at: sql<Date>`case when "status" = ${sql.lit(CANCELLED)} then "updated_at" else now() end`,
    })
    .where('id', '=', id)
    .returning([
      'id',
      'dealership_id',
      'customer_id',
      'vehicle_id',
      'service_type_id',
      'technician_id',
      'bay_id',
      'starts_at',
      'ends_at',
      'status',
    ])
    .executeTakeFirst();

  return row === undefined ? null : toAppointmentRow(row);
}
