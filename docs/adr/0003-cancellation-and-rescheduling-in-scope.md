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

§1.4 OQ-3 asked what happens to an appointment once made. The §2.1 constraint carries
`WHERE (status <> 'cancelled')`, so the data model already assumes cancellation; only the
behaviour was undecided. Cancellation is the easy half. Rescheduling is hard: a move *replaces* a
fact, so it must satisfy a property a fresh booking need not —

> A refused move leaves the original appointment intact and confirmed.

Naive implementations violate it only under contention.

## Considered options

- **Option A — Neither in scope.** Booking only.
  - Good, because it is the narrowest reading of the brief
  - Bad, because the constraint mandated by `CLAUDE.md` §2.1 already presupposes cancellation
  - Bad, because an appointment that can never be cancelled leaves a slot occupied
- **Option B — Cancellation only; rescheduling deferred to a backlog slice.**
  *(The architect's recommendation.)*
  - Good, because it makes the partial constraint testable
  - Good, because it protects the WIP limit and OC-3
  - Bad, because it leaves out the case where the design is most likely to be got wrong
  - Bad, because "deferred to a backlog slice with a proposed ADR" would have parked the single
    most interesting decision here.
- **Option C — Cancellation and rescheduling, the move being a single atomic `UPDATE` on the existing
  row.** **Chosen.**
  - Good, because a refused move leaves the original intact, by statement atomicity
  - Good, because it introduces no second mechanism
  - Good, because it preserves the appointment's identity
  - Bad, because it expands scope past the recommendation
  - Bad, because it relies on the reader understanding that the row does not conflict with its
    own prior version
- **Option D — Cancellation and rescheduling, the move being implemented as a compensating pair:**
  cancel, then insert.
  - Good, because it reuses the booking path verbatim
  - Bad, because it transiently releases the slot. In the two-transaction form the release is
    committed, and the customer can end with *no appointment at all*.
  - Bad, because it turns a free failure ("refused, original stands") into a compensation
  - Bad, because it changes the appointment's id on every move

## Decision

Chosen option: **Option C — both in scope; a move is one atomic `UPDATE`.**

**Cancellation** is a status transition on the existing row, `confirmed → cancelled`, terminal. The
row leaves the constraint's scope through the partial predicate, so the slot frees itself by the
mechanism guarding every other write.

**Rescheduling** changes an **existing** row's interval, and may change bay and technician:

- The exclusion constraints on `bay_id` and `technician_id` are checked against the *new* row version:
  a move onto a held slot raises `23P01`, leaving **the original untouched**.
- Two racing reschedules onto the same slot behave exactly like two racing bookings: one commits,
  the other gets `23P01`
- **No `AND id <> :id` predicate, no pre-read of the target slot, and no application-side "is it
  free?" step.**
- The appointment's **identity is preserved**: the id a caller was given at booking still names
  it.

**A move must never be a delete-then-insert, or a cancel-then-insert.** This is the explicit
prohibition; Option D's costs are why.

Supporting rules:

- The new interval is validated against the dealership's opening hours (ADR-0001) before any
  candidate; an out-of-hours move is a `400`.
- Where the move needs a different bay or technician, candidate selection and the retry policy
  of ADR-0004 apply.
- Only a `confirmed` appointment may be moved; rescheduling a cancelled one is refused
- **A move onto an interval that overlaps the appointment's own current interval must succeed** —
  §10 must **pin it**.

## Consequences

**Good**

- The partial predicate `WHERE (status <> 'cancelled')` acquires behaviour, and therefore a test
- The concurrency story gets its second act with no second mechanism: reschedule, book, and
  book-versus-reschedule are one constraint
- The lifecycle is complete enough to be credible — a booking system that cannot change a booking
- The most plausible race a competent implementer could still introduce is named and prohibited

**Bad, or deferred**

- Scope grows beyond the architect's recommendation: two more endpoints, an appointment state
  model, one §10 scenario.
- The write path is no longer a single insert. A-6's rationale — that keeping booking a single
  insert keeps the invariant simple — holds for booking.
- There is no history: a moved appointment shows only its current interval. Who moved it and from
  when is unrecoverable.
- Cancellation has no policy attached — no notice period, no fee, no restriction on cancelling an
  appointment already started.
