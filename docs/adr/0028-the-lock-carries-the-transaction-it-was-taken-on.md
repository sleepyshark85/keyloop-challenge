---
id: "0028"
title: The lock carries the transaction it was taken on
status: proposed
date: 2026-09-06
supersedes: null
superseded_by: null
arc42: ["§5.2", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: architect
ai-input: >
  PROPOSED, NOT ACCEPTED, and the distinction is the record worth keeping. The architect
  found this remedy WHILE ADJUDICATING T-06-5 — the test-engineer reported the hole and
  proposed no fix — and then DECLINED ITS OWN IMPROVEMENT as CLAUDE.md §6 outcome (b),
  because it cannot name an acceptance criterion, a QS or a §2 clause that ADR-0026's
  shape fails.

  Ruling (c) on an improvement the adjudicator invented itself, at step 2, against an ADR
  one day old, is the failure mode §6 describes by name: preference dressed as a blocker.
  ADR-0026 is NOT wrong, is not superseded, and slice 06 ships on it.

  Accepting this ADR is the human's at a gate, or the architect's at slice 09 when the
  signature is open anyway.
---

## Context and problem statement

[ADR-0026](0026-the-lock-is-a-value-the-write-takes-and-it-carries-its-keys.md) made *"forgot the
lock"* a compile error and *"locked the wrong keys"* unrepresentable between the lock and the
write. It named, honestly, what it did not close: the type does not prove the write runs in the
**same transaction** as the lock, and `pg_advisory_xact_lock` is transaction-scoped. Both
parameters take the same `Db` at every call site today, so a mismatch is one expression — *"care,
not a compiler"*, in ADR-0026's own words. That went to §11.

**What is new is a measurement, and it is a negative result.** T-06-5, at slice 06 step 2: no
black-box test can observe this hole. The exclusion constraint is a correctness backstop whether or
not the advisory lock and the write share a transaction, so any test that saw the defect would be
seeing a failure the constraint already prevents. It is defence in depth with **no external
witness** — which is precisely why a type is the only available control, rather than merely the
convenient one. Nothing in `tests/` can be written to guard it, and that is a finding rather than
an omission.

## Considered options

- **Option A — leave it as §11 debt**, ADR-0026's position.
- **Option B — a runtime identity assertion** in each write.
- **Option C — the lock carries the `Db` it was taken on**, and the write takes no `Db` of its own.
  **Proposed.**
- **Option D — a `dependency-cruiser` rule or an `ambiguity-containment` marker.**

## Decision

Chosen option: **C, proposed and not applied.**

```ts
export interface ResourceLock {
  readonly db: Db;              // the transaction the advisory locks were taken on
  readonly bayId: string;
  readonly technicianId: string;
  readonly __brand: 'ResourceLock';
}

export function insertAppointment(lock: ResourceLock, values: NewAppointment): Promise<AppointmentRow>;
export function rescheduleAppointmentById(lock: ResourceLock, move: Move): Promise<AppointmentRow | null>;
```

The write has no second `Db` to disagree with, so the mismatch becomes unrepresentable rather than
visible — ADR-0026's own Option C argument carried one step further, from the keys to the
connection.

**It is deferred to slice 09** under [ADR-0019](0019-defer-a-control-only-to-the-slice-that-makes-it-cheaper-or-stronger.md),
alongside F-06-1 and for the same reason: that slice reopens both write paths to instrument them
and to extract the shared attempt loop, so the signature changes once over one loop instead of
twice over two. Both premises are re-measurable on arrival; if the extraction does not happen, say
so in the PR.

## Consequences

**Good**

- The last hole ADR-0026 named is closed by the compiler rather than by care, and the erased-brand
  caveat narrows: a hand-written literal must now also produce a live `Db`.
- The reason no test guards this is **recorded as measured** rather than assumed. A control with no
  possible external witness is exactly the case a type system is for, and saying so is worth more
  than the change itself.

**Bad, or deferred**

- It touches every write call site a second time. That is the price of not doing it inside slice
  06, and it is stated rather than discovered later.
- **Residue, narrower than the hole it closes:** the lock still does not prove a *neighbouring*
  statement runs on the same `Db`. A caller holding two `Db` values can pass `lock.db` to the write
  and a different one to a query beside it. There is no compiler for that, and no test either.
- A `proposed` ADR is a debt item. This one **replaces** ADR-0026's transaction-identity entry in
  §11 rather than adding a second; if it is never accepted, that entry stands as it is.

## Pros and cons of the options

### Option A — leave it as §11 debt

- Good, because it costs nothing and the exclusion constraint means it is not a correctness bug
- Bad, because every future locking path inherits the same care requirement

### Option B — a runtime identity assertion

- Good, because it would actually fire
- Bad, because it is a runtime check for a compile-time fact, on the hottest write path
- Bad, because T-06-5's negative result applies to it too: nothing exercises it, so it is an
  unfalsifiable guard — the shape this project has now catalogued six times

### Option C — the lock carries its `Db`

- Good, because the mismatch is unrepresentable rather than visible
- Bad, because it is a second pass over merged, heavily measured code

### Option D — a rule or a marker

- Good, because it needs no signature change
- Bad, because both are file-granular. ADR-0026 rejected this a day ago for a defect inside one
  file; this defect is inside one **expression**
