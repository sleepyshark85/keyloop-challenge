---
id: "0029"
title: A deadlock event names the write path it happened on; a conflict event does not
status: accepted
date: 2026-09-06
supersedes: null
superseded_by: null
arc42: ["§8.4", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: implementer
decided-by: architect
ai-input: >
  RULED AT SLICE 06 STEP 7 under the human's standing delegation, and reviewed at the delegated
  Gate E rather than by a later human gate.

  The content was proposed by the implementer, in a docblock, during a remediation pass scoped to
  killing surviving mutants — O-46. It renamed an emitted event and then asserted the new name.
  RATIFYING THE CONTENT DOES NOT RATIFY THE ROUTE: a name the system emits is a taxonomy
  decision, slice 09's QS-13 work counts these names, and the implementer does not own it. The
  correct move was to assert `'booking.deadlock'` and raise the rename. The reviewer's own
  sentence proposing a rename was a failure scenario showing the mutant survives, not a
  prescription, and it was read as one.

  The architect ruled on the substance because the mutant is killed either way and only the
  emitted string differs, so reverting would have cost a re-run of a merged suite for no
  observable gain — and because the substance is right, which is a separate finding from the
  route being wrong.
---

## Context and problem statement

`rescheduleAppointment.ts` is the second write path through ADR-0018's advisory locks. It emits
four structured log events, three of which reuse `bookAppointment.ts`'s strings verbatim:
`booking.conflict`, `booking.refused`, `booking.reference-data-invalid`. The fourth is the
`40P01` arm. As merged it emits `reschedule.deadlock` where booking emits `booking.deadlock`.

Slice 09 builds the observability contract (§8.4, QS-13) and will count on these names, so which
of the two shapes is right has to be settled before something keys on the wrong one. Nothing
outside `bookAppointment.test.ts` asserts the old string — measured by repo-wide search — so the
cost of deciding now is zero and the cost of deciding later is a migration.

## Considered options

- **Option A — every event name is shared with booking.** One taxonomy, no exceptions.
  - Good, because it is a rule with no cases, and cases are what rot
  - Bad, because the payload carries `bayId`, `technicianId` and `attempt` and **no path**, so
    the two deadlock sources become indistinguishable in the only place they are recorded
- **Option B — every event name is per use case**: `reschedule.conflict`, `reschedule.refused`.
  - Good, because it is also a rule with no cases
  - Bad, because it breaks I-02-6's observer. QS-1 and QS-2 read the constraint name off one
    `booking.conflict` line, and slice 06 design §2.2 requires the move's controls to observe the
    same line — an outside-in test may read the response, the table and stdout, and this is the
    only route the constraint name has to any of them
- **Option C — shared where the event is the same event; distinct where the path is the finding.**
  **Chosen.**
- **Option D — one `booking.deadlock` name plus a `path` field.**
  - Good, because it keeps the taxonomy flat and is more extensible
  - Bad, because it is a third design proposed at step 7 over merged, measured code, and the
    field it adds is one slice 09 would design properly alongside the metric

## Decision

Chosen option: **C.** `DEADLOCK_EVENT` is `'reschedule.deadlock'` on the move path and
`'booking.deadlock'` on the booking path. The other three names stay shared.

The line that separates them is **what the event is evidence of**, not which use case emitted it.

- `booking.conflict` is a **`23P01` on a shared constraint**, and the same fact whichever
  statement provoked it. It is also I-02-6's observer and design §2.2 pins the move's two controls
  to it. Sharing is load-bearing.
- `booking.refused` and `booking.reference-data-invalid` render the same §8.6 taxonomy rows from
  either path. Sharing costs nothing.
- A `40P01` is **not a taxonomy row at all**. Under ADR-0018's locks it can only mean a write path
  skipped them (§6.1, §11 F-02-9), so its entire diagnostic content is *which path*. Folding both
  into one name deletes the only field that carries it. The totals still sum; nothing tells them
  apart.

**Cost if this is wrong:** slice 09 must sum two names for a total deadlock rate, and any future
locking path must remember to add a third. That is the reason this is written here rather than
left in a docblock.

**The docblock's citation is corrected, not the docblock** — `src/` is not the architect's to
edit. `rescheduleAppointment.ts` attributes *"one taxonomy of log lines, not two"* to I-02-6.
I-02-6 ruled that the constraint name reached no observer the test-engineer may use, and its
remedy created the `booking.conflict` line; it ruled nothing about sharing names across use cases.
The observer citation on `RescheduleDeps.logger` is sound. The principle is this ADR's. §11 D-06-4
carries the residue until a slice reopens the file.

## Consequences

**Good**

- The two lock-skipping paths are distinguishable in production from the day the second one ships
- I-02-6's observer is untouched, so slice 06's controls and QS-1/QS-2 read the same line
- Slice 09 inherits a decided taxonomy instead of a merged accident

**Bad, or deferred**

- The naming rule now has a case in it, and a case has to be re-argued at every new event
- A deadlock **rate** across the service is two counters, not one
- Option D is probably the better long-run shape and is not booked: proposing a third design at
  step 7 over merged code buys less than slice 09 designing it beside the metric
