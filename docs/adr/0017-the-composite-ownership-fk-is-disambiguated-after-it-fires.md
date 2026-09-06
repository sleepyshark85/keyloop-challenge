---
id: "0017"
title: Disambiguate the composite ownership foreign key after it fires, not before — three failures share one constraint name and only a post-failure read separates them
status: proposed
date: 2026-09-05
supersedes: null
superseded_by: null
arc42: ["§5.2", "§6.1", "§6.6", "§8.6", "§11"]

# Condensed 2026-09-06 under the merged-design ruling. `contested: true` because the decision rests
# on two measurements this record is the only home for — the five inserts, and `23P01` beating
# `23503` — and because the genuinely argued half is WHERE the disambiguation goes, not whether.
contested: true

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

`0003_appointment.sql` carries seven named constraints, deliberately exactly seven. Ownership is one:

```sql
-- A-6 / ADR-0002: the vehicle belongs to the named customer. Validation, not authorisation.
CONSTRAINT appointment_vehicle_owned_by_customer
  FOREIGN KEY (vehicle_id, customer_id) REFERENCES vehicle (id, customer_id)
```

That composite key makes *"this vehicle belongs to this customer"* unrepresentable rather than
checked, like the exclusion constraints. Slice 00's migration says why the singleton foreign keys were
left out: they *"would make the REPORTED constraint non-deterministic when two are violable at once"*.

**§8.6 then asks that key to distinguish three things it cannot** — AC-9's
`/problems/unknown-reference` and AC-10's `/problems/vehicle-not-owned` both sit on it, and QS-11
requires the taxonomy to be total and stable, *"each reachable and no two rows colliding"*.

### The measurement

Five inserts against this repository's migrations, on `postgres:16-alpine`, reading `err.constraint`:

| Failure | SQLSTATE | Constraint reported |
|---|---|---|
| unknown vehicle id, real customer | `23503` | `appointment_vehicle_owned_by_customer` |
| unknown customer id, real vehicle | `23503` | `appointment_vehicle_owned_by_customer` |
| both real, vehicle owned by a **different** customer | `23503` | `appointment_vehicle_owned_by_customer` |
| unknown service type | `23503` | `appointment_technician_qualified` |
| unknown dealership | `23503` | `appointment_bay_in_dealership` |

**The first three are the same error.** The `DETAIL` line differs, but it is localised,
version-dependent prose and not a contract. So `err.constraint` suffices for `23P01` — two
constraints, two resources — and is **insufficient for `23503`**. The decision is *what* separates
them and, more interestingly, *where*.

Rows four and five are **unreachable through the booking path**: an unknown dealership yields no
candidate bays and an unknown service type no duration. Whatever is chosen must not quietly add a
third unreachable arm.

## Considered options

| | Option | Why not, in a clause |
|---|---|---|
| **A** | Validate ownership with a read **before** the insert; treat any `23503` as `500` | Simplest, cheapest on the failure path, and what most reviewers would write — **and it makes the composite FK's `23503` arm unreachable.** See below |
| **B** | Classify with a read **after** the insert is refused, on `appointment_vehicle_owned_by_customer` only | **Chosen** |
| **C** | Add singleton foreign keys on `customer_id` and `vehicle_id` so the three failures report different names | Slice 00 rejected exactly this on exactly this reasoning: an unknown customer would violate both the singleton and the composite, and which one PostgreSQL names is index order. It trades a deterministic problem (three failures, one name) for a non-deterministic one, and it is a migration in a slice whose data-model delta is otherwise zero |
| **D** | Collapse the two taxonomy rows: return `/problems/unknown-reference` for all three | AC-10 requires `/problems/vehicle-not-owned` and acceptance criteria are the human's, so this is a scope change wearing a design decision's clothes. It also erases the identity of the rule that would become an authorisation boundary if GC-2 arrives (ADR-0002), and it degrades the API: a service advisor can act on *"that vehicle is not that customer's"* and not on *"one of these four ids is wrong"* |
| **E** | Parse the `DETAIL` line of the PostgreSQL error | `DETAIL` is localised prose that changes with `lc_messages` and is not a documented interface. It also cannot separate the three cases — all produce the same sentence with different key values — and it would put string-parsing of driver output inside the one module this architecture asks a reviewer to trust completely |

## Decision

Chosen option: **B — on `23503` naming `appointment_vehicle_owned_by_customer`, and only then, run one
classification statement and map its verdict.**

```ts
// src/persistence/referenceRepository.ts
export type OwnershipVerdict = 'unknown-customer' | 'unknown-vehicle' | 'not-owned';
export function classifyOwnership(db: Db, customerId: string, vehicleId: string): Promise<OwnershipVerdict>;
```

One statement of **two** `EXISTS` sub-selects over `customer` and `vehicle`. *(Three as first
written; the third asked what the FK had just answered, so its only reachable value was `false` — an
equivalent mutant. Corrected at slice 02 step 4; the count was never the decision.)* It is never
retried, and it runs where an `INSERT` has already been refused.

### Why this is not check-then-act, stated rather than assumed

1. **It runs strictly after the write.** There is no window between check and act, because there is no
   act after it. Nothing this read learns can change what was written.
2. **Its result cannot permit anything.** `OwnershipVerdict` has three members and **none is `'ok'`**.
   The type cannot express permission, so an edit turning this into a pre-flight gate has to change
   the type first — visible in a diff, and failing to compile in the meantime.
3. **It reads reference data only** — `customer` and `vehicle`, never `appointment`: exactly the
   category ADR-0001 admits for opening hours, a static property of the request that a concurrent
   booking cannot invalidate.

The forbidden shape fails all three: it runs before the write, its result *is* permission, and it
reads the live schedule.

### Why not before the insert, which is the tempting answer

> A pre-flight ownership check makes the composite FK's `23503` arm **unreachable**. The constraint
> would still be in the schema, still be correct, never fire — and its mutants would be unkillable.

That is precisely finding R-01-4 at slice 01: a correct, measured artefact rendered inert by the
design of its consumer, whose mutants then propped up a score. ADR-0015 exists because the obvious
remedy for a dead branch — delete it — was exactly wrong there. Manufacturing the same shape one slice
after ratifying that record would be hard to defend. **arc42 already says which way this goes** and
arc42 is the source of truth: §6.6 and §8.6 both name the composite FK as the decider. This ADR adds
the step arc42 does not name — how one constraint name becomes two problem types — and moves nothing.

### One consequence that constrains the tests

Measured: an insert violating **both** the ownership FK and an exclusion constraint raises **`23P01`,
not `23503`**. Exclusion constraints are enforced at index insertion during the tuple insert; the
composite FK is an `AFTER ROW` trigger at end of statement. **The exclusion always wins.**

So a contended booking for an unknown vehicle is a `409`, not a `422`. That is not a QS-11 collision —
each failure still has one status and one `type` — it is a **precedence** between co-occurring
failures. **AC-9's and AC-10's fixtures must therefore be uncontended**, or the contract test asserts
on the wrong one and passes or fails for a reason unrelated to what it names.

## Consequences

**Good.** AC-9 and AC-10 become distinguishable and QS-11 survives. The database stays the decider
exactly as §6.6 and §8.6 specify: the classification read explains a refusal, it authorises nothing.
The happy path pays nothing — the statement runs only after a `23503` on one constraint. The FK's arm
stays live and its mutants killable, and `OwnershipVerdict`'s missing `'ok'` is what stops this
becoming a pre-flight check by accretion.

**Bad, or deferred.** A refusal costs two round trips — deliberately acceptable on a `4xx` path, with
§1.2 ranking performance last and QS-14 measuring the *uncontended* booking. It is a read on the
booking path, so the argument above is rerun by every reviewer meeting this code, which is why it is
written here and not in a comment. **A concurrent delete between the insert and the classification**
would produce a verdict describing a world that has moved on: a vehicle deleted in that window
classifies as `unknown-vehicle` when the cause was `not-owned`. Both are `422` client errors and
neither can produce a wrong booking, but the `type` is the less accurate — theoretical while reference
data is seeded rather than managed through the API (A-7), real the day a reference-data API exists,
and §11 should carry it. Finally, the statement is a **fourth** place naming `customer` and `vehicle`,
after the migration, the schema interface and the seed loader, with nothing forcing the four to
agree — R-6, live here for the first time.
