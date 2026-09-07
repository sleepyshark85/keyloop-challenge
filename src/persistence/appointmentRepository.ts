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
 * What a move writes. Same shape as {@link NewAppointment} minus the columns a move cannot
 * touch (ADR-0025: no dealership, customer, vehicle or service type change — "Out of scope" in
 * the slice file) and minus `bayId`/`technicianId` for the same reason as above.
 */
export interface Move {
  readonly id: string;
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

/**
 * ADR-0030 — the pair a write is ALSO in flight against, when it also vacates one. Unbranded,
 * unlike {@link ResourceLock}: this names a pair to lock, not a value a write is entitled to
 * write from — `leave` is never read back by an INSERT or UPDATE, only handed to
 * {@link lockResources}, so it earns none of the brand's guarantees and should not look like it
 * does.
 */
export interface ResourcePair {
  readonly bayId: string;
  readonly technicianId: string;
}

/** The terminal status. ADR-0003: cancellation is a transition, never a delete. */
const CANCELLED = 'cancelled';

/** Advisory-lock classes. Disjoint key spaces are what make the order total — ADR-0018. */
const BAY_LOCK_CLASS = 1;
const TECHNICIAN_LOCK_CLASS = 2;

/**
 * ADR-0018, extended by ADR-0030 — take a lock for every resource the write is IN FLIGHT
 * against, in one statement, before the write.
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
 * and decides no outcome; it only stops two writers being in flight against the same bay or the
 * same technician at once. Measured both ways, and the pair is what turns that from a claim into
 * a reading: drop the CONSTRAINTS and keep the lock, and 20 overlapping rows are written — it
 * prevents nothing; drop the LOCK and keep the constraints, and there is still exactly one row
 * (with 108 deadlocks) — it decides nothing. Correctness is entirely the constraint's; liveness is
 * entirely the lock's. `tests/integration/exclusion-constraint-adjudicates.test.ts` runs both.
 *
 * ── ADR-0030: NOT ALWAYS TWO LOCKS, AND NOT MERELY CLASSES ────────────────────────────────────
 *
 * Class 1 is bays and class 2 is technicians, disjoint by construction — but a move past attempt
 * 1 is in flight against BOTH the pair it takes (`bayId`/`technicianId`) and the pair it is
 * leaving (`leave`), because the row it is about to supersede still occupies that pair until this
 * transaction commits (ADR-0023's own M1: a conflicting writer waits on an uncommitted vacated
 * entry, not merely on a live one). So up to FOUR keys go in. `vacated = leave ?? take` folds a
 * booking's absent `leave` back onto its own pair, so `take` and `vacated` are identical and
 * `DISTINCT` collapses the statement to today's two keys — the SQL TEXT is one static string for
 * both writes, and booking's behaviour is unchanged rather than merely compatible.
 *
 * The result is `DISTINCT`-ed and `ORDER BY (class, hashtext(key))` — a total order over a
 * shared key space computed FROM A VALUE, inside the statement, rather than maintained by a
 * caller: there is no sort for a human to keep sorted, and no call-site fact (which pair a racer
 * happened to pass as `take` versus `leave`) enters the order at all.
 *
 * ── R-07-2: DEADLOCK FREEDOM IS TWO MECHANISMS, AND SYMMETRY IS NEITHER OF THEM ───────────────
 *
 * A prior version of this docblock claimed the load-bearing fact was that a MUTUALLY-VACATING
 * pair's two racers compute the SAME MULTISET of four keys. That is true and is not what does
 * the work — AC-4's own fixture races `{bay0, bay1, tA}` against `{bay0, bay1, tB}`, which is
 * not that symmetric case, and is protected regardless. What actually holds:
 *
 *   (i)   THE ADVISORY WAITS ARE ACYCLIC because the order is TOTAL: a cycle needs some `k1 <
 *         k2` with each side holding one and waiting on the other, which cannot arise when
 *         every transaction acquires its whole set in ONE statement walked in that same order —
 *         nothing ever holds `k2` while still waiting to acquire `k1`.
 *   (ii)  `DISTINCT` is over `(cl, hashtext(key))`, the SAME tuple `ORDER BY` sorts on, so no
 *         two rows in the ordered set can tie, and a `hashtext` COLLISION between two different
 *         keys collapses them to one lock rather than leaving the order ambiguous.
 *   (iii) THE TUPLE WAITS (the exclusion check blocking on another transaction's live or
 *         vacated index entry) ARE ACYCLIC because of ADR-0030's completeness — every resource
 *         a write is in flight against is locked — made ACCURATE by ADR-0031: that resource set
 *         is now computed FROM STATE READ INSIDE THE TRANSACTION, not carried from before it
 *         opened. Two mechanisms, not one, and neither is the multiset argument.
 *
 * Measured (ADR-0030): 20 mutually-vacating pairs, 25 trials, `23P01` 883/1000 and
 * `40P01` 117/1000 locking the target pair alone; `23P01` 1000/1000 and `40P01` 0 locking the
 * union.
 *
 * F-02-9, inherited by slice 06 and slice 07 and corrected by ADR-0030: EVERY write path to
 * `appointment` must lock every resource it is in flight against, in this order — not merely the
 * pair it takes. One that skips a resource it is in flight against reintroduces a deadlock — and
 * because a `40P01` is not retried, it surfaces as a `500` rather than as a latency blip.
 *
 * ── IT RETURNS THE LOCK IT TOOK, AND THAT IS ADR-0026 RATHER THAN A CONVENIENCE ───────────────
 *
 * This is the ONLY minting site for {@link ResourceLock}. F-05-1: this file held two write
 * functions, one locking and one not (ADR-0023), and "correctly exempt" read identically to
 * "forgot the lock". A write that needs the lock now cannot be called without a value only this
 * function produces, so the mistake is a compile error rather than a docblock. The returned lock
 * NEVER carries `leave` — a write reads bay and technician off the pair it TOOK, never off the
 * pair it left, so there is no field here for one to be confused with the other.
 */
export async function lockResources(
  db: Db,
  bayId: string,
  technicianId: string,
  /**
   * ADR-0030 — REQUIRED so omission is `TS2554`, and `null` only where the write vacates
   * nothing (booking). A move passes the pair its row CURRENTLY occupies, read inside this
   * same transaction under the row's own lock ({@link lockAppointmentRow}, ADR-0031) — never a
   * value carried from before the transaction opened, which is what "constant across attempts
   * because every prior attempt aborted" turned out to be silent about (another request's
   * commit; R-07-1).
   */
  leave: ResourcePair | null,
): Promise<ResourceLock> {
  const vacated = leave ?? { bayId, technicianId };

  await sql`
    select pg_advisory_xact_lock(cl, k)
      from (
        select distinct cl, hashtext(key) as k
          from unnest(
                 array[${sql.lit(BAY_LOCK_CLASS)}, ${sql.lit(TECHNICIAN_LOCK_CLASS)},
                       ${sql.lit(BAY_LOCK_CLASS)}, ${sql.lit(TECHNICIAN_LOCK_CLASS)}],
                 array[${bayId}, ${technicianId}, ${vacated.bayId}, ${vacated.technicianId}]
               ) as t(cl, key)
          order by cl, hashtext(key)
      ) o
  `.execute(db);

  // The ONE cast this brand costs, confined to this function — the ADR-0016 shape one layer
  // down, and the same house pattern `candidates.ts`'s three casts already use.
  return { bayId, technicianId } as ResourceLock;
}

/**
 * ADR-0031 — read the pair a move is about to LEAVE from inside the attempt's OWN
 * transaction, under the row's own lock, so `lockResources`' `leave` argument is derived from
 * state this transaction itself observed rather than a value read before it opened.
 *
 * ── WHY THIS EXISTS: THE CLAIM `lockResources`' DOCBLOCK USED TO MAKE WAS FALSE ───────────────
 *
 * `rescheduleAppointment` used to compute the pair a move leaves ONCE, before the attempt
 * loop, off the pre-loop existence read — true of that ONE request's own attempts, silent
 * about another request committing a move of the SAME row in between. R-07-1 named the cycle
 * that reopens: two stale movers, each locking a pair the row has already left, reach their
 * writes and tuple-wait on each other's vacated-but-uncommitted index entries — `40P01`
 * where ADR-0030 promised a database verdict. `SELECT … FOR UPDATE` under this row's own lock
 * is the fix: nothing can move the row again until this transaction commits or rolls back, so
 * the pair read here is the pair `lockResources` and the subsequent `UPDATE` will act against.
 *
 * ── LOCK ORDER: ROW LOCK, THEN ADVISORY LOCKS, THEN THE WRITE ─────────────────────────────────
 *
 * That order is what keeps this addition free of a NEW cycle: a transaction holding an
 * advisory lock never afterwards waits for a row lock, so the two lock kinds cannot wait on
 * each other in both directions (ADR-0031).
 *
 * `FOR UPDATE`, not `FOR NO KEY UPDATE`: acceptable either way here, since this row's own
 * `UPDATE` takes at least as strong a lock a moment later regardless — but `FOR UPDATE` is
 * what {@link rescheduleAppointmentById}'s own guarded `UPDATE` takes on any row it actually
 * writes, so this read asks for nothing the write would not have asked for itself.
 *
 * `executeTakeFirstOrThrow`, DELIBERATELY, NOT `| null`: this read is TOTAL. Appointment ids
 * are minted by `deps.newId()` and never client-supplied (ADR-0003), and a row is NEVER
 * deleted, only transitioned to `cancelled` — so an id this function is called with (always
 * the id `findAppointmentById` already found `existing` at) names exactly one row, always. An
 * `| null` branch here would be unreachable and therefore an unkillable mutation survivor in a
 * file `appointmentRepository.ts` currently holds at 100.00 with zero survivors.
 */
export async function lockAppointmentRow(db: Db, id: string): Promise<ResourcePair> {
  const row = await db
    .selectFrom('appointment')
    .select(['bay_id', 'technician_id'])
    .where('id', '=', id)
    .forUpdate()
    .executeTakeFirstOrThrow();

  return { bayId: row.bay_id, technicianId: row.technician_id };
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
 * ResourceLock} that {@link insertAppointment} and {@link rescheduleAppointmentById} take as a
 * parameter, so "forgot the lock" is a compile error and this function's signature — a plain
 * {@link Db} and no lock parameter — is now itself the readable statement of "correctly exempt",
 * with no docblock required to tell the two apart.
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

/**
 * Slice 06 — `PATCH /appointments/{id}`, as ONE guarded `UPDATE`. ADR-0025's chosen Option C.
 *
 * ── EXISTENCE IS THE READ'S; LEGALITY IS THIS STATEMENT'S ─────────────────────────────────────
 *
 * `findAppointmentById` already decided the id exists before this is ever called (ADR-0025
 * decision 1) — absence is permanent, because appointment ids are minted by `deps.newId()` and
 * never client-supplied. What THIS statement decides is legality: `WHERE id = $1 AND status =
 * 'confirmed'` means zero rows here can mean exactly one thing, a row that exists but is not
 * `confirmed` (decision 2) — there is no follow-up read (decision 3), and the caller maps `null`
 * straight to `not-confirmed`.
 *
 * THE STATUS GUARD LIVES ONLY HERE, never in a preceding check (decision 4): a cancelled
 * appointment moved to an out-of-hours interval never reaches this statement at all, because the
 * domain rule (`deriveInterval`) is evaluated first and unconditionally in the use case — the
 * ruled consequence is a `400`, not a `409`, and it is a fact about ORDER in the caller, not
 * about this SQL.
 *
 * NOT CHECK-THEN-ACT (decision 5). The read this statement follows touches one row by primary
 * key and answers nothing about any OTHER appointment's interval — nothing on this path can
 * answer "is that bay free". Its `absent` answer cannot go stale; its `confirmed` answer can, and
 * is re-adjudicated atomically by this statement's own `status = 'confirmed'`. A read is
 * check-then-act when the write TRUSTS it; this write re-asks the question the read cannot
 * answer for itself.
 *
 * `bay_id` AND `technician_id` COME OFF THE LOCK, NOT OFF `move` — ADR-0026, the same reason
 * {@link insertAppointment} does. `updated_at = now()`, WITH NO `CASE`: unlike D1's cancellation,
 * a move is never idempotent (there is no client-reachable no-op interval, per the slice's own
 * "Out of scope" — a move to the identical instant still executes this statement and is a
 * request, not a replay of one), so `now()` is never a write to an unchanged row.
 *
 * THE TWO PARTIAL GiST INDEXES NEVER SEE THE SUPERSEDED VERSION (AC-1, arc42 §8.2 consequence
 * 4). An `UPDATE` writes a new heap tuple and stamps the old one's `xmax` with this transaction's
 * own xid; `check_exclusion_constraint` runs after the new index entry exists, skips it by
 * `ctid`, and every other candidate is tested for liveness — the superseded version's `xmax` is
 * this transaction's own xid, so it is "deleted by me" rather than a live conflict. That is a
 * property of the enforcement MECHANISM, not of this statement, and it is why there is no `AND
 * id <> $1` anywhere here: a `BEFORE UPDATE` trigger computing the same overlap would need one,
 * because it reads the heap and would see the prior version; this statement never does.
 */
export async function rescheduleAppointmentById(
  db: Db,
  move: Move,
  lock: ResourceLock,
): Promise<AppointmentRow | null> {
  const row = await db
    .updateTable('appointment')
    .set({
      bay_id: lock.bayId,
      technician_id: lock.technicianId,
      starts_at: move.startsAt,
      ends_at: move.endsAt,
      // The database's own clock, exactly as `0003_appointment.sql`'s column DEFAULT and
      // `cancelAppointmentById`'s CASE both use it — never `new Date()`, which would be a
      // second clock this statement's timestamp could disagree with.
      updated_at: sql<Date>`now()`,
    })
    .where('id', '=', move.id)
    .where('status', '=', 'confirmed')
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

/** The bay and technician ids `busyResources` reports occupied. Two lists, nothing else. */
export interface BusyResources {
  readonly bays: readonly string[];
  readonly technicians: readonly string[];
}

/**
 * Slice 08 (ADR-0032, Option D) — `GET /availability`'s ADVISORY read.
 *
 * ── THE RANGE EXPRESSION IS THE CONSTRAINT'S OWN, RESTATED IN ONE PLACE ───────────────────────
 *
 * `tstzrange(starts_at, ends_at) && tstzrange($from, $to)` is `0003_appointment.sql`'s own
 * predicate, scoped by `dealership_id` (a candidate pair is never asked about a resource at
 * another dealership) and `status <> 'cancelled'` (the same denylist the two exclusion
 * constraints use, for the same reason: a status added later is inside this query's scope by
 * default, never silently treated as occupying nothing).
 *
 * ADR-0032 is precise about how much of that QS-8 actually proves: "the range expression QS-8
 * pins" — and, after mechanic 6 (T-08-7's cancelled witness), the `status <> 'cancelled'`
 * conjunct as well, now that the generator writes a `cancelled` row BY CONSTRUCTION, not often
 * enough for the property to see one.
 * The `dealership_id` conjunct is **not** pinned by QS-8 or by anything else — it is
 * redundant-by-composite-FK instead: `technician` and `service_bay` each carry `dealership_id
 * NOT NULL`, and `appointment`'s composite foreign keys make `appointment.dealership_id`
 * functionally determined by `technician_id`/`bay_id`, so this predicate and the constraint's
 * dealership-free one cannot diverge — unless a technician is ever allowed at two dealerships,
 * which nothing here tests (the reviewer's finding, step 5).
 *
 * ── STILL THE ONLY MODULE NAMING `appointment` ────────────────────────────────────────────────
 *
 * This is a SECOND query against the table this file already owns, not a second file: the
 * `appointment-table-access` marker in `tests/architecture/ambiguity-containment.test.ts` asserts
 * EXACTLY `src/persistence/appointmentRepository.ts`, unchanged by this slice (§3, AC-7 of slice
 * 05, discharged by citation rather than a new criterion). `candidateRepository.ts` still cannot
 * see this table — `queryAvailability.ts` composes the two reads, and only this file executes
 * either of them.
 *
 * ── DISTINCT IN APPLICATION CODE, NOT SQL ─────────────────────────────────────────────────────
 *
 * A dealership with several confirmed appointments occupying the SAME bay across the queried
 * window (two back-to-back jobs, say) returns that bay's id once per overlapping row; `Set`
 * collapses it before this function returns, so the caller never has to. A `SELECT DISTINCT`
 * would do the identical job in SQL — this file already has one row `bay_id`/`technician_id`
 * pair to de-duplicate per side, and either place is equally correct; JS is where the existing
 * mappers in this file already do their shaping (`toAppointmentRow`), so the query itself stays
 * the same three-predicate shape a reviewer can compare line-by-line against `0003_appointment.sql`.
 *
 * ── ADVISORY, STRUCTURALLY — NOT MERELY BY THE RESPONSE'S OWN FLAG ────────────────────────────
 *
 * This function's result reaches nowhere near an `INSERT`: `bookAppointment.ts` and
 * `rescheduleAppointment.ts` call `candidateResources` and `lockResources`/`insertAppointment`,
 * never this. Design §1.3: what makes "advisory" true is that there is no representation of a
 * hold anywhere in this system for a caller to mistakenly trust — not a promise kept by this
 * function's caller.
 */
export async function busyResources(
  db: Db,
  dealershipId: string,
  from: Date,
  to: Date,
): Promise<BusyResources> {
  const rows = await db
    .selectFrom('appointment')
    .select(['bay_id', 'technician_id'])
    .where('dealership_id', '=', dealershipId)
    .where('status', '<>', CANCELLED)
    .where(sql<boolean>`tstzrange(starts_at, ends_at) && tstzrange(${from}, ${to})`)
    .execute();

  return {
    bays: [...new Set(rows.map((row) => row.bay_id))],
    technicians: [...new Set(rows.map((row) => row.technician_id))],
  };
}
