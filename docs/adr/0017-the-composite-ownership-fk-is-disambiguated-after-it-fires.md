---
id: "0017"
title: Disambiguate the composite ownership foreign key after it fires, not before — three failures share one constraint name and only a post-failure read separates them
status: proposed
date: 2026-09-05
supersedes: null
superseded_by: null
arc42: ["§5.2", "§6.1", "§6.6", "§8.6", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  PROPOSED by the architect at slice 02 step 1. It is forced work rather than an improvement: AC-9 and
  AC-10 require two different problem types from three failures that PostgreSQL reports under ONE
  constraint name, and QS-11 requires that no two taxonomy rows collide. Something has to separate
  them and nothing in the schema does.

  THE MEASUREMENT IS THE ARGUMENT. The architect did not reason about which constraint fires; it ran
  five inserts against this repository's own migrations on a real postgres:16-alpine and read the
  constraint names back. Three distinct failures — unknown vehicle, unknown customer, and a vehicle
  not owned by the named customer — all report `appointment_vehicle_owned_by_customer`. Without that
  measurement the obvious design (map err.constraint to a problem type) looks correct and ships a
  taxonomy that collapses two of §8.6's rows into one.

  The genuinely contested part is WHERE the disambiguation goes, and the architect chose the less
  obvious option. Validating ownership BEFORE the insert is simpler, cheaper on the failure path and
  is the shape most reviewers would expect. It is rejected because it would make the composite FK's
  23503 arm unreachable — which is EXACTLY the shape of finding R-01-4 at slice 01, where a correct,
  measured constraint was made inert by the design of its consumer, and it took an ADR to avoid
  "fixing" it by deletion. Repeating that pattern one slice after writing ADR-0015 about it would be
  hard to defend.

  Recommended as written and put to the human's ruling at slice 02's gate. Carried in arc42 §11 as
  debt until ruled.
---

## Context and problem statement

`0003_appointment.sql` carries seven named constraints and, deliberately, exactly seven. Ownership is
one of them:

```sql
-- A-6 / ADR-0002: the vehicle belongs to the named customer. Validation, not authorisation.
CONSTRAINT appointment_vehicle_owned_by_customer
  FOREIGN KEY (vehicle_id, customer_id) REFERENCES vehicle (id, customer_id)
```

That composite key is elegant: it makes "this vehicle belongs to this customer" unrepresentable rather
than checked, in the same spirit as the exclusion constraints. Slice 00's migration comment says why
the singleton foreign keys were left out — adding them *"would make the REPORTED constraint
non-deterministic when two are violable at once"*.

**§8.6 then asks that key to distinguish three things it cannot distinguish.** Two rows of the
taxonomy sit on it:

| Status | `type` | When | AC |
|---|---|---|---|
| `422` | `/problems/unknown-reference` | Unknown dealership, service type, customer **or vehicle**. Carries `reference` | AC-9 |
| `422` | `/problems/vehicle-not-owned` | The vehicle is not the named customer's | AC-10 |

and QS-11 requires the taxonomy to be **total and stable** — *"each is reachable and no two rows
collide"*.

### The measurement

Five inserts against this repository's migrations, on `postgres:16-alpine`, reading `err.constraint`
back:

| Failure | SQLSTATE | Constraint reported |
|---|---|---|
| unknown vehicle id, real customer | `23503` | `appointment_vehicle_owned_by_customer` |
| unknown customer id, real vehicle | `23503` | `appointment_vehicle_owned_by_customer` |
| both real, vehicle owned by a **different** customer | `23503` | `appointment_vehicle_owned_by_customer` |
| unknown service type | `23503` | `appointment_technician_qualified` |
| unknown dealership | `23503` | `appointment_bay_in_dealership` |

**The first three are the same error.** The `DETAIL` line differs — it names the failing key pair —
but parsing a PostgreSQL `DETAIL` string is not a contract; it is localised, version-dependent prose,
and building a status code on it would be worse than any option below.

So: `err.constraint` is sufficient for `23P01` (two constraints, two resources, ADR-0009 prunes on it)
and **insufficient for `23503`**. Something has to separate three failures that the database reports
identically, and the decision is *what* and, much more interestingly, *where*.

A second fact shapes the answer. Rows four and five are **unreachable through the booking path**: an
unknown dealership yields no candidate bays and an unknown service type yields no duration, so both are
refused before any `INSERT`. Whatever is chosen must not quietly add a third unreachable arm to a file
that already has to account for two.

## Considered options

- **Option A** — validate ownership with a read **before** the insert; treat any `23503` as `500`.
- **Option B** — classify with a read **after** the insert is refused, on
  `appointment_vehicle_owned_by_customer` only.
- **Option C** — add singleton foreign keys on `customer_id` and `vehicle_id` so the three failures
  report different constraint names.
- **Option D** — collapse the two taxonomy rows: return `/problems/unknown-reference` for all three.
- **Option E** — parse the `DETAIL` line of the PostgreSQL error.

## Decision

Chosen option: **B — on `23503` naming `appointment_vehicle_owned_by_customer`, and only then, run one
classification statement and map its verdict.**

```ts
// src/persistence/referenceRepository.ts
export type OwnershipVerdict = 'unknown-customer' | 'unknown-vehicle' | 'not-owned';
export function classifyOwnership(db: Db, customerId: string, vehicleId: string): Promise<OwnershipVerdict>;
```

One statement, three `EXISTS` sub-selects over `customer` and `vehicle`. It is never retried, and it
runs on a path where an `INSERT` has already been refused.

### Why this is not check-then-act, stated rather than assumed

`CLAUDE.md` §2.1 is NON-NEGOTIABLE and this option adds a read to the booking path, so the burden is
on the ADR. Three properties, and all three are load-bearing:

1. **It runs strictly after the write.** There is no window between check and act because there is no
   act after it — the write already happened and was already refused. Nothing this read learns can
   change what was written.
2. **Its result cannot permit anything.** `OwnershipVerdict` has three members and **none of them is
   `'ok'`**. The type cannot express permission. A later edit that turns this into a pre-flight gate
   has to change the type first, which is visible in a diff and fails to compile in the meantime.
3. **It reads reference data only** — `customer` and `vehicle`, never `appointment`. That is exactly
   the category ADR-0001 already admits for opening hours: a static property of the request, whose
   answer cannot be invalidated by a concurrent booking.

Contrast the forbidden shape, which fails all three: it runs *before* the write, its result *is*
permission, and it reads the live schedule.

### Why not before the insert, which is the tempting answer

Option A is simpler, is cheaper on the failure path, and is what most reviewers would write. It is
rejected on the strength of a precedent this project set one slice ago.

> A pre-flight ownership check makes the composite FK's `23503` arm **unreachable**. The constraint
> would still be in the schema, still be correct, and never fire — and its mutants would be
> unkillable.

That is precisely finding R-01-4 at slice 01: a correct, measured artefact (the `'24:00:00'` parser
arm) rendered inert by the design of its consumer, whose mutants then propped up a score. ADR-0015 was
written because the obvious remedy for a dead branch — delete it — would have been exactly wrong there.
Writing a design that manufactures the same shape, one slice after ratifying that record, would be
hard to defend at review and harder to defend in the retro.

**arc42 already says which way this goes**, and arc42 is the source of truth (`CLAUDE.md` §4). §6.6:
*"Vehicle not owned by the named customer | **composite FK (`23503`)** | reference data | `422`"*.
§8.6: *"`/problems/vehicle-not-owned` | The vehicle is not the named customer's | **Composite FK,
`23503`**"*. The FK is specified as the decider. This ADR adds the step arc42 does not currently name
— how one constraint name becomes two problem types — and does not move the decision elsewhere.

### One consequence that must be recorded because it constrains the tests

Measured: an insert violating **both** the ownership FK and an exclusion constraint raises **`23P01`,
not `23503`**. Exclusion constraints are enforced at index insertion during the tuple insert; the
composite FK is an `AFTER ROW` trigger at end of statement. **The exclusion always wins.**

So a contended booking for an unknown vehicle is a `409`, not a `422`. That is not a QS-11 collision —
each failure still has exactly one status and one `type` — it is a **precedence** between two
co-occurring failures. AC-9's and AC-10's fixtures must therefore be **uncontended**, or the contract
test asserts on the wrong one and passes or fails for a reason unrelated to what it names.

## Consequences

**Good**

- AC-9 and AC-10 become distinguishable, which is the requirement, and QS-11's "no two rows collide"
  survives.
- The database stays the decider for ownership, exactly as §6.6 and §8.6 specify. The classification
  read explains a refusal; it does not authorise anything.
- The happy path pays nothing. The extra statement runs only when an insert has already failed with a
  `23503` on one specific constraint — a client error, not a hot path.
- The composite FK's arm stays live and its mutants stay killable, so the ownership constraint keeps
  earning its place in the mutation report.
- `OwnershipVerdict`'s three-member type is itself a small structural guard: the absence of `'ok'` is
  what stops this becoming a pre-flight check by accretion.

**Bad, or deferred**

- **A refusal costs two round trips.** Acceptable here, deliberately: it is a `4xx` path, and §1.2
  ranks performance last with QS-14 as the only budget, which measures the *uncontended booking*.
- **It is a read on the booking path**, and every read on this path has to be argued about rather than
  waved through. That cost is real and recurring — the argument above will have to be rerun by every
  reviewer who meets this code for the first time, which is why it is written here rather than in a
  comment.
- **A concurrent delete between the insert and the classification** would produce a verdict describing
  a world that has already moved on: a vehicle deleted in that window classifies as `unknown-vehicle`
  when the real cause was `not-owned`. Both are `422`, both are client errors, and neither can produce
  a wrong booking — but the `type` can be the less accurate of the two. Reference data is seeded and
  not managed through the API (A-7), so the window is theoretical today; it becomes real the day a
  reference-data API exists, and §11 should carry it.
- The classification statement is a **fourth** place that names `customer` and `vehicle`, after the
  migration, the schema interface and the seed loader. Nothing forces the four to agree — R-6, which
  this slice makes live for the first time.

## Pros and cons of the options

### Option A — validate ownership before the insert

- Good, because it is the simplest and most familiar shape, and it gives a `422` in one round trip.
- Good, because it matches how opening hours are already handled — a validation read before the loop —
  so it needs no new argument about §2.1.
- Bad, because it makes the composite FK's `23503` arm unreachable, which is R-01-4's exact shape and
  the thing ADR-0015 exists to stop being repeated.
- Bad, because the FK would then be defence-in-depth only, and defence-in-depth that never fires is
  indistinguishable from defence that does not work.
- **Bad, decisively:** it moves the decision away from where arc42 §6.6 and §8.6 both put it, and
  arc42 is the source of truth. Moving it is a supersession of those sections, not an implementation
  choice — and it would need to be argued as one, which this option does not do.

### Option B — classify after the failure

- Good, for the three reasons in **Decision**: after the write, cannot permit, reference data only.
- Good, because the FK stays live, so the constraint the migration argued for keeps doing work.
- Good, because it costs the happy path nothing.
- Bad, because it adds a branch to a failure path and a read that has to be justified every time
  someone reads it.
- Bad, because of the theoretical concurrent-delete misclassification above.

### Option C — add singleton foreign keys on `customer_id` and `vehicle_id`

- Good, because the database would then report three distinct constraint names and no extra read would
  be needed at all — the most direct answer to the problem as posed.
- Good, because it needs no application logic: `err.constraint` would map straight to a problem type.
- Bad, because slice 00's migration explicitly rejected exactly this, on exactly this reasoning:
  *"Adding the singleton foreign keys for tidiness would be redundant AND would make the REPORTED
  constraint non-deterministic when two are violable at once."* An unknown customer would violate both
  the singleton `customer_id` FK and the composite, and which one PostgreSQL names is then index
  order — the same undefined ordering measured for the two exclusion constraints at slice 02.
- Bad, because it is a migration in a slice whose data-model delta is otherwise zero, changing a table
  whose constraint set was argued at length one slice ago.
- **Bad, decisively:** it trades a deterministic problem (three failures, one name) for a
  non-deterministic one (some failures, an unpredictable name). That is the wrong direction.

### Option D — collapse the rows; return `unknown-reference` for all three

- Good, because it needs no read, no branch and no ADR, and the client still gets a `422`.
- Good, because arguably "the vehicle is not the customer's" *is* an unknown (vehicle, customer) pair.
- **Bad, decisively:** AC-10 requires `/problems/vehicle-not-owned` and AC-9 requires
  `/problems/unknown-reference`, and acceptance criteria are the human's. This option is a scope
  change wearing a design decision's clothes.
- Bad, because ADR-0002 makes the ownership rule a *named* validation failure on purpose — it is the
  rule that would become an authorisation boundary if GC-2 ever arrives, and erasing its identity now
  is precisely the retrofit ADR-0002 warns is not additive.
- Bad, because it degrades the API for a service advisor, who can act on "that vehicle is not that
  customer's" and cannot act on "one of these four ids is wrong".

### Option E — parse the error's `DETAIL` line

- Good, because the information genuinely is there — `Key (vehicle_id, customer_id)=(…) is not present
  in table "vehicle"` names the failing pair — and it needs no extra round trip.
- Bad, because `DETAIL` is localised prose. It changes with `lc_messages`, and it is not a documented
  interface in the way SQLSTATE and `constraint` are.
- Bad, because it still cannot separate the three cases: all three produce the same *sentence*, with
  only the key values differing, so the parse would tell you which pair failed and not which half of
  it was wrong.
- **Bad, decisively:** it would put string-parsing of a driver's human-readable output inside
  `pgError.ts`, the one module this architecture asks a reviewer to trust completely.
