# SAMPLE — a rewrite of ADR-0032 for readability

> **Not an ADR.** This file is a proposal for how ADRs could read; the underscore prefix keeps it out
> of `docs:adr-check`'s scan. `0032-availability-is-two-reads-composed-in-the-use-case.md` is
> unchanged and still accepted. Nothing here changes a decision — only how it is told.
>
> **What is different, and why:**
> 1. The problem is stated in plain terms *before* any section number.
> 2. **Cross-references cut from ~14 to 2.** `§6.4`, `§5.2`, `§11 R-5`, `§8.2`, `QS-8`, `QS-12`,
>    `QS-14`, `AC-1`, `AC-14`, `I-04-5`, `A-07-3` are gone — each replaced by the *fact* it pointed
>    at, in a clause. A reference the reader must chase is a pointer; the fact is the record.
> 3. Same option set, same chosen option, same consequences.
>
> **Updated after the human's ruling.** This sample originally opened with a "What changes in the
> application" section carrying the call shape. The human ruled it out for every ADR — *"I don't
> want to go into implementation detail in the ADR"* — and it is removed here so the two samples
> show one form rather than two. What the decision constrains still belongs; the code it produced
> belongs to the slice design.

---

## Context and problem statement

`GET /availability` tells a service advisor which bays and technicians are free over a window. It is
the only **read** in the system that needs the `appointment` table.

One rule governs that table: exactly one file may name it —
`src/persistence/appointmentRepository.ts`. An architecture test enforces this on every commit, and a
second test deliberately tries to add `candidateRepository.ts` to the permitted list **and expects to
be rejected**.

**arc42 §6.5 specifies this endpoint inside `candidateRepository` — the file that test rejects.** The
architecture document and the architecture test have contradicted each other since phase 2. This
slice is the first to build the endpoint, so it is the first to make them collide.

The rule is not bookkeeping. Booking asks *"which pairs are free?"* through `candidateResources`, and
the fact that this function **cannot** see appointments is what makes the system's central claim
provable: there is no check-then-act on the booking path, because there is nowhere for a check to
read from. Put the availability query in that file and the claim becomes a promise instead of a
property.

## Considered options

- **A — one joined query in `candidateRepository.ts`**, as arc42 §6.5 says today.
- **B — a `NOT EXISTS` clause inside `candidateResources`**, so one function serves booking and
  availability.
- **C — a new `availabilityRepository.ts`.**
- **D — `busyResources` in `appointmentRepository.ts`, subtracted in the use case.**

## Decision

Chosen option: **D**.

The permitted-file list stays at exactly one file. That is the assertion, and it is stronger than any
test fixture, because it holds however wide the fixture gets.

## Consequences

**Good**

- Booking's candidate read still cannot see `appointment`, so the check-then-act claim stays a
  structural fact rather than a convention.
- The overlap expression sits in the module that owns the table, one file from the migration that
  declares the matching database constraint.
- The subtraction lives in `src/application`, where a future advisory pre-filter (ADR-0033) must also
  compose. One place to edit later, not two.
- The database indexes backing the exclusion constraints serve `busyResources` directly.

**Bad, or deferred**

- **Two round trips where a join would take one.** The performance budget allows 200 ms p95 for a
  one-day window and counts reads per *request*, not per candidate, so this is affordable. If it ever
  binds, the join belongs in `appointmentRepository.ts` as well — which is why this record fixes
  *which file*, not *which query shape*.
- **arc42 §6.5 has been wrong since phase 2 and no tool could have caught it.** The link checker
  verifies that references resolve, not that two sections agree. Recorded as a finding; not fixed
  here.

## Pros and cons of the options

### A — one joined query in `candidateRepository.ts`

- Good, because it is one round trip, and it is what arc42 says today.
- Bad, because the permitted-file rule is per **file**, not per function. `candidateResources` would
  then live in a module that *may* read `appointment`, and the only thing keeping it out would be
  that nobody had yet written the clause. The claim it supports needs that to be impossible, not
  merely unwritten.
- Bad, because choosing A means deleting a passing negative control to make room for the exact code
  it was written to catch.

### B — a `NOT EXISTS` inside `candidateResources`

- Good, because it would deliver the endpoint and a booking-time pre-filter in one change.
- Bad, because it ships that pre-filter **before** the property that would validate it, and makes the
  booking path read `appointment` before anything proves the read is trustworthy.

### C — a new `availabilityRepository.ts`

- Good, because it keeps the availability read out of the write module.
- Bad, because it widens the permitted list to two files for no gain over D. One file is checkable at
  a glance; two is a list, and lists grow.

### D — `busyResources` in `appointmentRepository.ts`

- Good, for the four reasons above.
- Bad, because that module gains a read whose consumer is not a write, so its one-line description
  stops being *"the write path's table access"* and becomes *"the table access"* — which is a truer
  description of what the rule already asserted.
