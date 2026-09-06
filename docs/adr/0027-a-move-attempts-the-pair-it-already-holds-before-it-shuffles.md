---
id: "0027"
title: A move attempts the pair it already holds before it shuffles
status: accepted
date: 2026-09-06
supersedes: null
superseded_by: null
arc42: ["§5.2", "§6.3", "§10"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: implementer
decided-by: architect
ai-input: >
  RAISED BY THE IMPLEMENTER as I-06-2 at slice 06 step 2, before it committed around the
  ambiguity rather than after — the useful direction. RULED by the architect under the
  standing delegation, PROVISIONAL until the gate.

  The implementer understated its own case on two counts, both decisive, and the architect
  supplied them: under a shuffle-from-first order AC-1 CANNOT FAIL, and T-06-3's
  discarded-candidate assertion is unconstructible. The first names a criterion, so this
  could have been ruled a (c) design defect; it did not need to be, because nothing was
  built. The omission was the architect's own — 06-design.md §1 described the move's loop
  as "a second copy of `bookAppointment`'s loop" without saying where it starts.

  ADR-0004 and ADR-0009 are not superseded. This says where the loop STARTS, which neither
  had occasion to answer, because booking has no incumbent pair.
---

## Context and problem statement

[ADR-0003](0003-cancellation-and-rescheduling-in-scope.md) says a move *"needing a different bay or
technician"* re-runs ADR-0004's candidate selection and retry. The conditional is the whole
sentence, and nothing said what *needing* means operationally.

[ADR-0009](0009-candidate-ordering-and-attempt-cap.md) fixed ordering for **booking**, where there
is no incumbent: Order-C, a seeded shuffle, chosen to spread contention. A move is the case
ADR-0009 never had — the appointment already holds a `(bay_id, technician_id)`, and the move may
not need to leave it.

## Considered options

- **Option A — shuffle from the first attempt**, `bookAppointment`'s order applied unchanged.
- **Option B — the current pair is attempt 1, then ADR-0009's seeded shuffle over the remainder.**
  **Chosen.**
- **Option C — the current pair only; refuse if it conflicts.**
- **Option D — order by distance from the current pair** — current, then same bay other technician,
  then the rest shuffled.

## Decision

Chosen option: **B.** Attempt 1 is the appointment's own `(bay_id, technician_id)`. On a `23P01`
for that pair, ADR-0009 applies unchanged: the constraint that fired prunes its resource (Bound-2),
and the remainder is traversed in the seeded shuffle. The cap of 16 is unchanged; the incumbent
costs one attempt, so the bound is Bound-2's plus one.

## Consequences

**Good**

- **AC-1 can fail.** Its subject is that a row does not conflict with the version it replaces,
  which is only exercised when the new version lands in the *same* bay with the *same* technician.
  With the bay-and-technician clause added to AC-1 at step 2, QS-6 is pinned rather than named.
- T-06-3's discarded-candidate case becomes constructible: a contended *original* slot forcing a
  second candidate means nothing unless there is an original slot in the order.
- A move that did not need reassigning does not get one. `AppointmentView` renders `bayId` and
  `technicianId`, so a gratuitous reassignment is visible to the client and was never requested —
  the slice's *Out of scope* already says reassigning to a named technician is not a move.

**Bad, or deferred**

- **Attempt 1 is Order-A, and that is the honest cost.** Every move of a given appointment starts
  on the same pair, which is precisely the collision ADR-0009's Order-C exists to spread. It is
  **bounded at one attempt**: two moves of the *same* appointment contend for a row lock rather
  than a candidate; two moves of *different* appointments share attempt 1 only if they already
  share both resources, and both fall into the shuffle on the first `23P01`. So ADR-0004's
  quadratic retry is reachable at attempt 1 only and cannot compound. Re-measurable at slice 07.
- The two loops now differ in their first attempt, so extracting the shared loop takes a parameter
  rather than being a lift. Stated here so the extraction is not surprised by it.
- Nothing asserts the shuffle is reached at all if every fixture leaves the incumbent pair free.
  The bay control on AC-1 is the case that reaches it.

## Pros and cons of the options

### Option A — shuffle from the first attempt

- Good, because it is literally one loop, and the extraction later is a lift
- Bad, because a move can be silently reassigned while its own pair was free
- Bad, because **AC-1 could not fail** — `[09:00,10:00) → [09:15,10:15)` may be satisfied by
  allocating bay 2, and the self-overlap semantics are never exercised. A quality scenario a
  passing build need not touch is not pinned
- Bad, because it makes T-06-3 unconstructible

### Option B — current pair first, then the shuffle

- Good, for the three reasons under *Consequences*
- Bad, because attempt 1 is Order-A, bounded as described above

### Option C — current pair only

- Good, because it is the smallest thing that could work, with no second loop at all
- Bad, because `PATCH` then **refuses while capacity exists**, which is the one behaviour this
  system is about (QS-3), and it contradicts ADR-0003. Considered and rejected at step 1 already

### Option D — order by distance from the current pair

- Good, because it minimises visible reassignment beyond B
- Bad, because it is an allocation *policy* — ADR-0009's rejected Order-D in a smaller costume,
  and §3.3 excludes scheduling policy
- Bad, because the remainder exists to spread contention, which distance-ordering undoes
