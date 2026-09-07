---
id: "0032"
title: Compose availability from two reads in the use case, so only appointmentRepository names the table
status: accepted
date: 2026-09-07
supersedes: null
superseded_by: null
arc42: ["§5.2", "§6.5", "§10.2"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: architect
ai-input: >
  RULED BY THE ARCHITECT at slice 08 step 1, under the standing delegation for architecture
  (CLAUDE.md §6 Authority). No human input; the human sees it at slice 08's gate.
  It exists because arc42 §6.5 already recorded the REJECTED option as chosen — a contradiction
  invisible from inside §6, nameable only by reading §6.5 against §10.2's QS-12 marker. A-07-3's
  countermeasure, applied to two documents rather than two representations of a value.
---

## Context and problem statement

`GET /availability` must read the `appointment` table. Nothing else in the read path does.

arc42 §6.5, written at phase 2, says the endpoint *"runs `candidateRepository.freeResources` over a
window"*. §10.2's QS-12 says the `appointment-table-access` marker resolves to **exactly**
`src/persistence/appointmentRepository.ts`, asserted by set equality — and
`tests/architecture/ambiguity-containment.test.ts` plants
`appointment-table-access src/persistence/candidateRepository.ts` as a control it expects to **fail**.

So arc42 specifies an implementation that an existing architecture control is built to reject. One of
the two is wrong, and the choice is not cosmetic: `candidateRepository.candidateResources` being
structurally unable to see `appointment` is what makes slice 05's AC-1 attributable (§6.4) and what
makes *"check-then-act is absent because there is nowhere else that could read"* true rather than
asserted (§5.2).

## Considered options

- **A — one joined query in `candidateRepository.ts`** (`freeResources`, as §6.5 says).
- **B — a `NOT EXISTS` clause added to `candidateResources` itself**, so one function serves both paths.
- **C — a new `availabilityRepository.ts`** naming the table.
- **D — `busyResources` in `appointmentRepository.ts`, subtracted in `src/application/queryAvailability.ts`.**

## Decision

Chosen option: **D**. `appointmentRepository.busyResources(db, dealershipId, from, to)` returns the
bay ids and technician ids occupied over the window; `queryAvailability` calls it alongside
`candidateResources` and subtracts. Two reads, one round trip each, no join across the boundary.

The marker's file list is **unchanged by this slice**, and that is the assertion — a stronger
statement than any fixture width, because it holds at every fixture width.

## Consequences

**Good**

- The booking path's candidate read still cannot see `appointment`, so §6.4's attribution for slice
  05's AC-1 survives structurally. Slice 08's inherited re-derivation is discharged by set equality
  rather than by keeping a 1×1 fixture that would stop working the moment it widened.
- The range expression QS-8 pins now sits in the module that already owns the table, one file from the
  migration that declares the constraint. §11 R-5's *"one idea in two files"* is unchanged in count and
  improved in adjacency.
- The subtraction is in `src/application`, which is where the advisory pre-filter must also compose
  (ADR-0033). One future edit, not two.
- The GiST partial indexes the exclusion constraints create serve `busyResources` directly (§8.2).

**Bad, or deferred**

- Two round trips where a join would take one. QS-14 budgets 200 ms p95 for a one-day window and slice
  09's AC-14 counts reads per *request*, not per candidate. If it ever binds, the join belongs in
  `appointmentRepository.ts` too — which is why this record fixes the marker, not the query shape.
- §6.5 has been wrong since phase 2 and no tool could see it. `docs:refs` checks that links resolve,
  not that two sections agree. Booked as a finding, not fixed by this ADR.

## Pros and cons of the options

### A — one joined query in `candidateRepository.ts`

- Good, because one round trip, and it is what arc42 says today.
- Bad, because it widens `appointment-table-access` to two files, and the marker is per **file**, not
  per function: `candidateResources` would sit in a module that *may* read `appointment`, and the only
  thing keeping it out would be that nobody had written the clause. That is the exact substitution
  §5.2's *"nowhere else that could read"* claim rests on being impossible.
- Bad, because an existing control plants this form and expects a violation. Choosing A means deleting
  a passing negative control to make room for the code it was written to catch.

### B — a `NOT EXISTS` inside `candidateResources`

- Good, because it would deliver the pre-filter and the endpoint in one change.
- Bad, because it ships the pre-filter *in front of* QS-8, which is exactly what I-04-5 ruled against,
  and it makes the booking path read `appointment` before anything validates that read.

### C — a new `availabilityRepository.ts`

- Good, because it keeps the availability read out of the write module.
- Bad, because it widens the marker to two files for no gain over D. The reason to keep the list at one
  is that *one* is checkable at a glance; two is a list, and a list grows.

### D — `busyResources` in `appointmentRepository.ts`

- Good, for the four reasons above.
- Bad, because `appointmentRepository.ts` grows a read whose consumer is not a write, so the module's
  one-line description in §5.2 stops being *"the write path's table access"* and becomes *"the table
  access"*. That is a truer description of what the marker already asserted.
