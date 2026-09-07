---
id: "0003"
title: Support cancellation and rescheduling, and move an appointment with one atomic UPDATE
status: accepted
date: 2026-09-03
supersedes: null
superseded_by: null
arc42: ["§1.4", "§3.1", "§3.2", "§3.3", "§5", "§6", "§8", "§10", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  MODIFIED — the recommendation was accepted in part and deliberately expanded. The
  architect recommended OQ-3 be answered "cancellation in scope, rescheduling
  deferred to a backlog slice with a proposed ADR". The human accepted cancellation
  and OVERRODE the deferral, pulling rescheduling into scope on the grounds that it is
  the technically interesting case and the one that most tests the standing invariant.
  The human also fixed the mechanism: a move is a single atomic UPDATE guarded by the
  same exclusion constraint, never a delete or cancel followed by an insert. The
  architect did not propose that constraint; it is recorded here because getting it
  wrong is the most plausible way this system could develop a race after all the care
  taken elsewhere.
---

## Context and problem statement

The customer calls back: the car is fine after all, cancel it. Or something came up — can we do
Thursday? The brief stops at booking and says nothing about either.

Cancellation is the easy half, and the data model already concedes it: the exclusion constraint
carries `WHERE (status <> 'cancelled')`. Only the behaviour was undecided.

Rescheduling is hard, because a move *replaces* a fact and must satisfy a property a fresh booking
need not:

> A refused move leaves the original appointment intact and confirmed.

Naive implementations violate it only under contention.

## Considered options

- **Option A — Neither in scope.** Booking only.
  - Good, because it is the narrowest reading of the brief
  - Bad, because the exclusion constraint's partial predicate already presupposes cancellation
  - Bad, because an appointment that can never be cancelled leaves a slot occupied
- **Option B — Cancellation only; rescheduling deferred to a backlog slice.**
  *(The architect's recommendation.)*
  - Good, because it makes the partial constraint testable
  - Good, because it protects the work-in-progress limit and one engineer's capacity
  - Bad, because it leaves out the case where the design is most likely to be got wrong
  - Bad, because deferring it to a backlog slice would have parked the single most interesting
    decision here.
- **Option C — Cancellation and rescheduling, the move being a single atomic `UPDATE` on the existing
  row.** **Chosen.**
  - Good, because a refused move leaves the original intact, by statement atomicity
  - Good, because it introduces no second mechanism
  - Good, because it preserves the appointment's identity
  - Bad, because it expands scope past the recommendation
  - Bad, because it relies on the reader understanding that the row does not conflict with its
    own prior version
- **Option D — Cancellation and rescheduling, the move being a compensating pair:** cancel, then
  insert.
  - Good, because it reuses the booking path verbatim
  - Bad, because it transiently releases the slot — committed, in the two-transaction form, so the
    customer can end with *no appointment at all*.
  - Bad, because it turns a free failure ("refused, original stands") into a compensation
  - Bad, because it changes the appointment's id on every move

## Decision

Chosen option: **Option C — both in scope; a move is one atomic `UPDATE`.**

**Cancellation** is a status transition on the existing row, `confirmed → cancelled`, terminal. The
row leaves the constraint's scope, so the slot frees itself by the mechanism guarding every other
write.

**Rescheduling** changes an **existing** row's interval, and may change bay and technician:

- The exclusion constraints on `bay_id` and `technician_id` are checked against the *new* row version:
  a move onto a held slot raises `23P01`, leaving **the original untouched**.
- Two racing reschedules onto the same slot behave like two racing bookings: one commits, the
  other gets `23P01`
- **No `AND id <> :id` predicate, no pre-read of the target slot, and no application-side "is it
  free?" step.**
- The appointment's **identity is preserved**: the id given at booking still names it.

**A move must never be a delete-then-insert or a cancel-then-insert** — the explicit prohibition,
and Option D's costs are why.

Supporting rules:

- The new interval is validated against the dealership's opening hours before any candidate; an
  out-of-hours move is a `400`.
- Where the move needs a different bay or technician, the booking path's candidate selection and
  retry apply.
- Only a `confirmed` appointment may be moved; rescheduling a cancelled one is refused
- **A move onto an interval overlapping the appointment's own current interval must succeed** — a
  quality scenario must **pin it**.

## Consequences

**Good**

- The partial predicate `WHERE (status <> 'cancelled')` acquires behaviour, and therefore a test
- The concurrency story gets a second act with no second mechanism: reschedule, book and
  book-versus-reschedule are one constraint
- The lifecycle is complete enough to be credible — a booking system that cannot change a booking
- The most plausible race a competent implementer could still introduce is named and prohibited

**Bad, or deferred**

- Scope grows past the recommendation: two more endpoints, an appointment state model, one
  quality scenario.
- The write path is no longer a single insert; the argument that one insert keeps the invariant
  simple holds for booking only.
- There is no history: a moved appointment shows only its current interval, and who moved it from
  when is unrecoverable.
- Cancellation has no policy — no notice period, no fee, no restriction on cancelling an
  appointment already started.
