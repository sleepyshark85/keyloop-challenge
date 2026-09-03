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

§1.4 OQ-3 asked what happens to an appointment after it is made. Cancellation and rescheduling are
not among the brief's three stated criteria, but they are not cleanly absent either: the exclusion
constraint mandated by `CLAUDE.md` §2.1 carries `WHERE (status <> 'cancelled')`. The *data model* has
therefore already assumed that cancellation exists and that a cancelled appointment stops occupying
its resources. What was undecided is whether the *behaviour* gets built.

Cancellation is the easy half — one status transition, and the thing that makes the constraint's
partial predicate mean anything and be testable. Without it, `WHERE (status <> 'cancelled')` is a
clause no test ever exercises.

Rescheduling is the hard half, and it is where the standing invariant gets a genuine second act. A
move is not a new fact, it is a *replacement* of an existing one, and it must satisfy a property that
a fresh booking does not have to:

> A refused move leaves the original appointment intact and confirmed.

The naive implementations violate this in a way that is easy to miss, because they look correct in a
single-threaded test and correct in code review. The failure only appears under contention, which is
exactly the class of defect this system exists to demonstrate competence against.

## Considered options

- **Option A — Neither in scope.** Booking only. The `WHERE (status <> 'cancelled')` clause stays as
  a data-model hook with no behaviour behind it.
- **Option B — Cancellation only; rescheduling deferred to a backlog slice.**
  *(The architect's recommendation.)*
- **Option C — Cancellation and rescheduling, the move being a single atomic `UPDATE` on the existing
  row, guarded by the same exclusion constraint.**
- **Option D — Cancellation and rescheduling, the move being implemented as a compensating pair:**
  cancel (or delete) the old appointment, then insert a new one at the new time.

## Decision

Chosen option: **Option C — both in scope; a move is one atomic `UPDATE`.**

### Cancellation

A status transition on the existing row: `confirmed → cancelled`. Cancelled is terminal. The row
leaves the exclusion constraint's scope through the partial predicate, so the slot becomes bookable
again by the same mechanism that guards every other write — no bookkeeping, no compensation, no
separate release step. Cancelling an already-cancelled appointment is not an error path worth
inventing behaviour for; it is idempotent.

### Rescheduling — the mechanism is part of the decision

A reschedule changes the interval of an **existing** appointment row, and may also change the bay and
the technician, since the resources free at the new time need not be the ones free at the old time. It
is performed as **one `UPDATE` statement against the existing row**:

- The exclusion constraints on `bay_id` and `technician_id` are checked against the *new* row version.
  A move onto a slot another live appointment already holds raises SQLSTATE `23P01`, the statement
  aborts, and **the original row is left exactly as it was**. The atomicity is the statement's, not
  the application's — nothing has to be undone, because nothing was released.
- Two racing reschedules onto the same slot behave exactly like two racing bookings: one commits, the
  other gets `23P01`. A reschedule racing a fresh booking behaves the same way. There is one
  mechanism, and adding rescheduling does not add a second.
- **No `AND id <> :id` predicate, no pre-read of the target slot, and no application-side "is it
  free?" step may be added.** Correctness comes from the constraint, as it does everywhere else.
- The appointment's **identity is preserved**: the id a caller was given at booking still names the
  same appointment after a move.

**A move must never be a delete-then-insert, or a cancel-then-insert.** This is the explicit
prohibition, and the reasons are ordered by how badly they bite:

1. **In the most likely naive form the slot is genuinely released.** Two API calls, two transactions,
   or an ORM's `cancel()` followed by `book()` produce a committed intermediate state in which the
   appointment does not occupy its slot. A concurrent request can take it. The customer who asked to
   move from Tuesday to Wednesday can end up with *no appointment at all* — Wednesday refused, Tuesday
   already given away. That is a strictly worse outcome than the move simply being refused, and it is
   invisible to any single-threaded test.
2. **It inverts the failure mode.** With one `UPDATE`, the failure is "the move is refused, the
   original stands" and it is free. With a compensating pair — even collapsed into one transaction —
   the failure is "the original has been destroyed, and the replacement may not exist", and the
   correct outcome depends on rollback discipline the application must get right every time.
3. **It destroys identity.** A new row means a new id, so references held by the caller break, and the
   appointment's history becomes two unrelated records with a cancellation between them.

Supporting rules, so the implementation is not left to infer them:

- The new interval is validated against the dealership's opening hours (ADR-0001) before any candidate
  is considered, and an out-of-hours move is a `400`, not a `409`.
- Where the move needs a different bay or technician, candidate selection and the retry policy of
  ADR-0004 apply unchanged, with the `UPDATE` in place of the `INSERT` as the attempted write.
- Only a `confirmed` appointment may be moved; rescheduling a cancelled one is refused. The exact
  status code is a Gate B contract detail, not a Gate A ruling.
- **A move onto an interval that overlaps the appointment's own current interval must succeed** —
  extending a job by thirty minutes, or shifting it fifteen minutes later, is an ordinary request. A
  row must not conflict with the version it replaces. This is the behaviour PostgreSQL gives for an
  in-place `UPDATE`; §10 must **pin it with a test rather than assume it**, because it is the one
  place where the constraint's semantics are being relied on without being obvious.

## Consequences

**Good**

- The partial predicate `WHERE (status <> 'cancelled')` acquires behaviour, and therefore a test. A
  clause no test exercises is an unverified claim (§1.2 goal 2).
- The concurrency story gets its second act with no second mechanism: reschedule, book, and
  book-versus-reschedule are all the same exclusion constraint doing the same job, which is a
  stronger demonstration than booking alone.
- The lifecycle is complete enough to be credible — a booking system that cannot change a booking is
  not one a dealership would recognise.
- The most plausible race a competent implementer could still introduce is named and prohibited in
  writing before any code exists, which is the point of having ADRs at all.

**Bad, or deferred**

- Scope grows beyond the architect's recommendation: two more endpoints, an appointment state model,
  and at least one more concurrency quality scenario in §10 (racing moves onto one slot, and a
  refused move leaving the original confirmed).
- The write path is no longer a single insert. A-6's rationale — that keeping booking a single insert
  is what makes the invariant simple to state — still holds for booking, but the move path is now a
  second write shape that has to be reasoned about separately, even though it shares the mechanism.
- There is no history: a moved appointment shows only its current interval. Who moved it and from
  when is unrecoverable, compounded by ADR-0002 leaving no actor on the record. §11 carries this.
- Cancellation has no policy attached — no notice period, no fee, no restriction on cancelling an
  appointment that has already started. Deliberate, and out of scope per §3.3.

## Pros and cons of the options

### Option A — Neither in scope

- Good, because it is the narrowest reading of the three stated criteria, and the smallest surface.
- Bad, because the constraint mandated by `CLAUDE.md` §2.1 already presupposes cancellation, so the
  data model would carry a clause the behaviour never justifies and no test ever covers.
- Bad, because an appointment that can never be cancelled leaves a slot occupied forever, which is not
  a defensible model of a dealership even inside an assessment.

### Option B — Cancellation only, rescheduling deferred

- Good, because it is the minimum that makes the partial constraint meaningful and testable.
- Good, because it protects the WIP limit and the scarce human review budget (OC-3).
- Bad, because it leaves out the case where the design is most likely to be got wrong, and therefore
  the case where demonstrating it right is worth the most. The assessment grades judgement under
  concurrency; deferring the hard concurrency case is a poor trade even though it is the cheap one.
- Bad, because "deferred to a backlog slice with a proposed ADR" would have parked the single most
  interesting decision in this document behind a status that means *not decided*.

### Option C — Both in scope, move as one atomic `UPDATE`

- Good, because the property that matters — a refused move leaves the original intact — falls out of
  statement atomicity rather than out of application care.
- Good, because it introduces no second mechanism: one constraint covers booking, moving, and any
  race between them.
- Good, because it preserves the appointment's identity across a move, which is what a caller holding
  an id expects.
- Bad, because it expands scope past the recommendation and costs at least one more slice.
- Bad, because it relies on the reader understanding that the row does not conflict with its own prior
  version — non-obvious, and therefore something a test must pin rather than a comment assert.

### Option D — Both in scope, move as cancel-then-insert

- Good, because it reuses the booking path verbatim and needs no new write shape, which is why it is
  the form an implementer is most likely to reach for.
- Bad, because it transiently releases the slot. In the two-transaction form the release is committed
  and a concurrent request can take it, so a customer can lose their appointment while trying to move
  it — a race reintroduced into a system built expressly to have none.
- Bad, because it turns a free failure ("refused, original stands") into a compensation problem where
  the good outcome depends on the application unwinding correctly.
- Bad, because it changes the appointment's id on every move, breaking every reference a caller holds.
