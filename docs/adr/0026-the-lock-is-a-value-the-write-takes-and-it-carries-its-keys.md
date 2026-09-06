---
id: "0026"
title: The lock is a value the write takes, and it carries the keys it took
status: accepted
date: 2026-09-06
supersedes: null
superseded_by: null
arc42: ["§5.2", "§6.1", "§6.3", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: reviewer
decided-by: architect
ai-input: >
  F-05-1 was raised by the architect at slice 05 step 5 and deferred to slice 06 under ADR-0019.
  RULED IN at slice 06 step 1 under the standing delegation, PROVISIONAL until the gate, and
  STRENGTHENED past what slice 05 specified: the token slice 05 described carried a residue it
  named and accepted — "it does not prove the keys match the row" — and the residue costs nothing
  to remove at the moment the signature changes, where removing it later means changing the same
  signature twice.

  ADR-0018 stands unweakened and is not superseded. This changes how its locks are *carried*,
  not when they are taken; ADR-0023's exemption is what the shape is designed to make legible.
---

## Context and problem statement

`appointmentRepository.ts` holds two write functions, one taking ADR-0018's advisory locks and
one **correctly** not taking them (ADR-0023) — and *"correctly exempt"* reads identically to
*"forgot the lock"*. That is §11 F-05-1, and a docblock is a marker rather than a mitigation.

Slice 06 adds the third write. `rescheduleAppointmentById` **does** take the locks: under
ADR-0023's iff, a confirmed row's new version lands inside both constraints' `WHERE`, so there
is an adjudication for a lock to serialise. This is the first moment the mistake is live rather
than historical — a newly written locking path, next to a correctly exempt one, in one file.

## Considered options

- **Option A — keep the docblock.** Good, because it costs nothing. Bad, because the defect it
  describes is that the code reads wrong, and a comment does not change how code reads.
- **Option B — a branded `ResourceLock` token**: `lockResources` returns it, the writes take it
  as a parameter. Slice 05's specification.
  - Good, because *"forgot the lock"* becomes a compile error and *"correctly exempt"* becomes a
    signature that does not ask for one
  - Bad, because it leaves a residue slice 05 named and accepted: the token proves *a* lock was
    taken, not that it was taken on **these** keys
- **Option C — Option B, and the lock carries the keys it took**, the write reading bay and
  technician off the lock rather than out of its own parameters. **Chosen.**
- **Option D — an `ambiguity-containment` marker or a `dependency-cruiser` rule.**
  - Good, because it needs no signature change
  - Bad, because both are file-granular, and the two functions this is about are in one file —
    QS-12's markers cannot see inside it

## Decision

Chosen option: **C.**

```ts
// src/persistence/appointmentRepository.ts — the ONLY minting site
export interface ResourceLock {
  readonly bayId: string;
  readonly technicianId: string;
  readonly __brand: 'ResourceLock';
}

export function lockResources(db: Db, bayId: string, technicianId: string): Promise<ResourceLock>;
export function insertAppointment(db: Db, values: NewAppointment, lock: ResourceLock): Promise<AppointmentRow>;
export function rescheduleAppointmentById(db: Db, move: Move, lock: ResourceLock): Promise<AppointmentRow | null>;
export function cancelAppointmentById(db: Db, id: string): Promise<AppointmentRow | null>; // ADR-0023, in the signature
```

`NewAppointment` and `Move` carry **no** `bayId` or `technicianId`; the writes read them off the
lock. One minting cast, in `lockResources`, the ADR-0016 shape one layer down.

**What it forecloses, stated at the width the tooling supports.**

- *Forgot the lock* — foreclosed. A write cannot be called without a value only `lockResources`
  produces, and there is no shape that declines to name it: the parameter is required.
- *Locked the wrong keys* — foreclosed **between the lock and the write**, because the write has
  no second copy to disagree with. What is left unproven is that the keys the caller handed
  `lockResources` are the candidate it meant, which is one expression at one call site per loop.
- *Correctly exempt* — readable off `cancelAppointmentById`'s signature without the docblock.
- **Not** foreclosed: the type does not prove the write runs in the *same transaction* as the
  lock, and `pg_advisory_xact_lock` is transaction-scoped. Both parameters take the same `Db` at
  every call site, so a mismatch is visible in one expression — but it is care, not a compiler.

## Consequences

**Good**

- The one sentence F-02-9 got wrong, and ADR-0023 narrowed to an iff, is now enforced by the
  types on the side where it is still true
- Slice 06's new locking path cannot ship without its locks, which is the moment the control was
  deferred to (ADR-0019)

**Bad, or deferred**

- It touches `bookAppointment`, a merged and heavily measured path, for a defect that is not on
  it. The existing acceptance and concurrency suites are the regression evidence
- The transaction-identity hole above is real and goes to §11
- A brand is erased at runtime: nothing stops a hand-written object literal cast to `ResourceLock`
