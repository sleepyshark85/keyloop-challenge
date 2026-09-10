# 4. Solution strategy

> Owner: architect · Written: phase 2 · Gate B

**§4.1 is one decision — how a booking is made — and it is the decision this system exists for.** §4.2
adds the four technology choices Gate B reserved, plus one rejection belonging to neither. Everything in
§5 to §8 follows from those. If a choice needs a sixth paragraph, it belongs in an ADR.

## 4.1 How a booking is made

§6.1 has the runtime sequence, §8.2 the DDL, and
[ADR-0036](../adr/0036-overlap-is-unrepresentable-the-database-adjudicates.md) the decision with the
options it beat.

### The problem

The brief asks for the defect in as many words — *"Before confirming, check for the availability of both
a ServiceBay and a qualified Technician"*:

```ts
// REJECTED — the shape the brief's wording invites
const free = await checkAvailability(bayId, interval);
if (free) await createAppointment(bayId, interval);   // ← another request booked it here
```

Two requests arriving at 09:00:00.000 both read *free*, both insert, and both customers are told bay 3 is
theirs. The window cannot be closed by care in application code: the read's result stops being true the
instant it is returned.

### Chosen — overlap is made unrepresentable

**The system does not check whether a resource is free before booking it. It attempts the booking and
lets PostgreSQL refuse.** Two exclusion constraints (verbatim in §8.2) make a row overlapping a
non-cancelled appointment on the same bay, or the same technician, an object the database will not store.
Rejected: check-then-act itself; a per-dealership lock or `SERIALIZABLE`, under which it would be
*correct*; a `UNIQUE` index; an overlap trigger; and a `BookingRepository` port, whose in-memory
implementation would be one
([ADR-0036](../adr/0036-overlap-is-unrepresentable-the-database-adjudicates.md),
[ADR-0008](../adr/0008-module-decomposition.md)). Four consequences run through the whole design:

- **Correctness is a property of the data, not of the code.** It holds for the API, for a migration, for
  a `psql` session, for a bug. There is no call site to forget.
- **The write is the decision.** A booking exists if and only if PostgreSQL accepted the statement.
- **Availability queries are advisory**, and the API says so (§3.1, §8.6).
- **The failure mode is specific and catchable**: SQLSTATE `23P01` with the violated constraint named,
  which §8.6 maps to `409 Conflict` and §8.4 counts as `booking_conflicts_total{resource}`.

Each attempt takes `pg_advisory_xact_lock` over its bay and then its technician before the write. That
buys a determinate *verdict* and decides nothing: unlocked, the losers deadlock, and a deadlock carries no
constraint name to render as a `409`
([ADR-0018](../adr/0018-lock-the-bay-and-the-technician-before-each-insert.md), measured both ways).

### On top — retry, which prevents a different failure

**The constraints prevent double-booking, completely and alone. Retry and candidate ordering prevent
*spurious refusal*** — QS-3: with *M* free bays and *M* qualified technicians over one interval and *N*
concurrent bookings, exactly `min(N, M)` are confirmed. Without retry the system would be correct and
useless: no double-booking, and customers refused while bays stood empty. §10 files QS-3 under goal 1
beside the constraints, but the mechanisms are two.

Candidates are ordered **free-first from one advisory read of occupancy** and shuffled **within** each
group on a seeded stream, so concurrent requests still disagree about what to try first, and a `23P01`
prunes the **whole resource** the violated constraint names, making a cap of **16** meaningful
([ADR-0004](../adr/0004-retry-across-remaining-candidates.md),
[ADR-0040](../adr/0040-order-candidates-free-first-from-one-advisory-read.md), superseding
[ADR-0009](../adr/0009-candidate-ordering-and-attempt-cap.md)). That read **reorders and never removes**,
so the insert stays the only adjudicator and a stale snapshot can cost attempts but not a refusal.
A `409` therefore means the dealership was full rather than that the allocator guessed badly — **all but
always**, and §11.2 R-4 owns the qualifier: the cap is a latency guard rather than a termination bound,
so a refusal while capacity remains is now *unlikely*, where before this ordering it was measured at
roughly one booking in six at high occupancy.

### And requirement 2's other half

*"A qualified Technician"* is a composite foreign key from `appointment (technician_id,
service_type_id)` to `technician_qualification`, so qualification is adjudicated by the database too,
never by the caller (§8.1). Two decisions sit on top without moving any of this: a reschedule is one
atomic `UPDATE` on the existing row, so a refused move never transiently releases its slot
([ADR-0003](../adr/0003-cancellation-and-rescheduling-in-scope.md)); and opening hours, decidable from
the request alone, are validated before any candidate and so reintroduce no window
([ADR-0001](../adr/0001-validate-dealership-opening-hours.md), GC-1).

## 4.2 Technology decisions

§2.2 fixes the language, runtime, database and the test, mutation, layering and telemetry tooling — the
human's, at phase 0 — and reserves four choices to this gate. Each is taken with the alternative it beat:
**a technology named without a rejected alternative is a preference, not a decision.**

| Choice | Decision | The rejected alternative that mattered | Record |
|---|---|---|---|
| **HTTP framework** | **Fastify** with TypeBox route schemas; the OpenAPI document is *emitted* from those schemas, not written | **Express** — the contract would be hand-authored beside hand-written validation, two sources of truth for one fact. **NestJS** — its module system is a second answer to "what is a layer" beside `dependency-cruiser`, which TC-7 makes authoritative | [ADR-0005](../adr/0005-fastify-with-typebox-schemas.md) |
| **Query layer** | **Kysely** as a typed SQL builder over `pg`. No ORM anywhere | **Prisma**, disqualified twice: exclusion constraints and `tstzrange` are absent from its schema language, and it wraps the driver error, so `23P01` and `err.constraint` would be recovered by parsing a string. **`pg` alone** lost only on modifiability | [ADR-0006](../adr/0006-kysely-as-typed-sql-builder.md) |
| **Migration tool** | **`node-pg-migrate`** running plain `.sql` files | **`drizzle-kit` / `prisma migrate`** — a generator that cannot express the exclusion constraint would be confidently incomplete about the schema's most important object. **A hand-rolled runner** — a small program with a large blast radius | [ADR-0007](../adr/0007-node-pg-migrate-with-sql-files.md) |
| **Module decomposition** | **Five layered modules around a dependency-free policy core**, boundaries chosen so each §1.4 ambiguity lands in one module | **Ports and adapters**, rejected in §4.1: the port is the loophole | [ADR-0008](../adr/0008-module-decomposition.md) |

One rejection is in no table. There is **no shared SQL function** defining "the interval the constraint
sees", even though A-4 asks for that concept to be named and a function would appear to unify the
exclusion constraint with the availability query. Redefining an `IMMUTABLE` function a GiST index depends
on does not rebuild the index — the index simply becomes wrong, silently. The concept is named in
`src/domain/interval.ts` and the agreement between the two SQL expressions is held by a test instead
(QS-8), which is slower to write and impossible to get silently wrong.

## 4.3 Achieving the quality goals

| Goal | How it is bought |
|---|---|
| **1 · Integrity** | §4.1, in the database. Structurally supported by `sql-only-in-persistence`: `pg` and `kysely` are importable from `src/persistence` and nowhere else, so SQLSTATE translation has exactly one site and a second cannot be added without failing CI. QS-1 to QS-9 assert the property against real PostgreSQL under concurrency |
| **2 · Verifiability** | Nothing is asserted here that nothing can check: the invariant by concurrency tests, the layering by `dependency-cruiser`, test quality by Stryker, the OpenAPI contract by regenerating it and failing on a diff, *done* by `npm run slice:check`. §10 names the enforcing artifact for every scenario, and the requirement that the system be testable by a role that has never read `src/` is itself a rule |
| **3 · Modifiability** | Defined as *one building block plus a migration*, and it chose the decomposition rather than the other way round: duration lives only in `duration.ts` (A-1), the occupancy interval only in `interval.ts` (A-4), wall-clock reasoning only in `openingHours.ts` (GC-1). ADR-0008 carries the containment table, including the row that is honestly *not* contained — authentication |
| **4 · Observability** | The availability read and the write are separate spans, deliberately, so the window check-then-act would have raced in is visible in a waterfall even though no code relies on it. `booking_conflicts_total{resource, outcome}` distinguishes a conflict absorbed by a retry from one that ended in a refusal (§8.4) |
| **5 · Performance** | Ranked last with its cost stated: the exclusion constraint serialises writers that actually conflict, capping write throughput for one contended resource (§11.2 R-1). The compensation is that the GiST indexes the constraints create are the same indexes the availability query uses, so the mechanism that costs throughput pays for the read path. QS-14 states a budget rather than leaving performance unmeasured because it ranked last |
