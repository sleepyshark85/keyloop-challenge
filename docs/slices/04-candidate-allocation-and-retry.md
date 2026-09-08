---
id: "04"
title: Candidate allocation and retry — no refusal while capacity remains
status: done
depends_on: ["02"]
arc42: ["§6.2", "§5.2", "§7.3", "§8.4", "§11", "§13"]
adr: [4, 9]
quality_scenarios: [QS-3]
loopbacks: 0
---

## Goal

A booking that loses a race for one bay-and-technician pair tries the next, and refuses only when the
candidate list is exhausted or the attempt cap is reached. The candidate read stays advisory —
correctness still comes from the insert — so this is not check-then-act. Ordering is a seeded
shuffle, and a failed attempt prunes by the constraint that actually fired.

## Acceptance criteria

- **AC-1** — Given *M* free bays and *M* free qualified technicians over one interval, when *N*
  concurrent bookings are released for it, then **exactly `min(N, M)`** are confirmed and the rest
  receive `409`. Asserted for (N,M) ∈ {(2,1), (5,3), (20,8), (8,20)}. A refusal while capacity
  remained fails this slice. *(QS-3)*
- **AC-2** — Given a booking whose first candidate loses, when it retries, then the retry is **not**
  wrapped in a transaction. A second attempt inside an aborted transaction raises `25P02` instead of
  retrying, and the test asserts the absence of that code.
- **AC-3** — Given an attempt fails on the bay constraint, when the next candidate is chosen, then
  every candidate sharing that bay is pruned; the same for the technician constraint. The loop's
  bound is additive, not multiplicative.
- **AC-4** — Given the attempt cap of 16 is reached with candidates remaining, when the loop stops,
  then `409` with `type=/problems/no-capacity` is returned and the cap is visible in telemetry rather
  than silent.
- **AC-5** — Given a fixed seed, when the same contention scenario runs twice, then the same
  interleaving of candidate choices results — a failing test is re-runnable, not a flake.

## In scope

- The retry loop in `src/application`, the seeded shuffle, and pruning on the constraint name the
  driver reports — available only because the query layer preserves it.
- `tests/concurrency/no-spurious-refusal.test.ts`.

## Out of scope

- Load balancing across bays. It was rejected because it degenerates to sorted order under burst,
  which is the quadratic contention the retry decision named.
- Changing what the client is told on refusal — the taxonomy is already fixed.

## Definition of done

Beyond `CLAUDE.md` §10:

- The pruning rule is the architect's own addition and was flagged at the phase-2 gate as
  theoretically over-eager if a blocking appointment is cancelled mid-loop. The reviewer checks that
  case explicitly; if it is real, it is a deferred improvement, not a defect.

## The concurrency fixture's two-attempt assertion is removed — ruled at step 4

Provisional until the gate; the constitution makes updating the slice file the remedy for a
clarification, so the ruling lands here.

**The defect.** The seeded shuffle removes the premise `no-technician-overlap.test.ts` states in its
own header. With 24 bays and one technician, a loser conflicts on the **technician** at attempt 1 and
refuses correctly unless it happened to draw the winner's bay — so the closing assertion that two
distinct attempts occurred holds only about 56 % of the time. The implementer's measurement is
confirmed.

**Why a clarification and not a defect or a deferral.** It is not a design defect: the ordering
decision, this design and the implementation are all correct, and nothing in this slice fails. Nor is
it a deferred improvement, because that outcome merges as-is and this cannot — it is green in the
merge run only 56 % of the time. The cost of merging it is nameable, and it is the standing invariant
that every slice begins with an observed failing test: a suite that fails ~44 % of the time
independently of the change under test makes both *red observed in CI* and its green counterpart
non-evidential for every slice after it. No loopback consumed; resume from step 3. A step-4 test
defect was ruled the same way once before — but that one failed loudly, and this one fails in the
passing direction, which is strictly worse.

**The obligation, which is the test-engineer's to write.** The two-attempt claim is unrepairable in
this fixture and must be **removed, not substituted**. What must still hold, and does under every
permutation: the 1/19 split, at least 19 technician conflicts, and a refusal naming the technician as
the contended resource. The *loop actually looped* obligation needs no new home — it is deterministic
in the acceptance test, where both bays are blocked and the attempt sequence is fixed, and gated in
the concurrency test's own maximum-attempt assertion. The header prose goes with the assertion.
Verified by repeated runs, not by one green.

**Blast radius: one file breaks.** Every other assertion is permutation-independent. The bay mirror
is safe *because* its scarce resource is the singleton list; the taxonomy test's two refusal cases
assert terminal state only; the two concurrency files were authored against the shuffle. Four files
carry stale premise **prose** with sound assertions, and they are fixed this slice anyway: a comment
that is false is the more dangerous half.

## The arc42 declaration is amended to §7.3 and §13 — ruled at step 5

Both sections moved on this branch and neither was declared. §7.3 gained the environment-variable
table and the sentence saying it is the deployment contract, which is mine. §13 is scribe-owned
prose, and it is **declared rather than exempted**: the declaration governs the branch, not the
author, and nobody silences a guard by writing a name into it.

Ruled a clarification. The content of both edits is correct and only the declaration was missing, so
no acceptance criterion, quality scenario or standing invariant fails either way. No loopback.

**The derivation the finding asks for already existed and had already fired.** `npm run slice:check
04` had been printing both undeclared files since the commit that made the second edit — 98 minutes
before step 5 — because it is branch-selected, so a commit subject cannot hide a mid-slice edit. The
reviewer re-derived it by reading the diff and found one of the two; the tool had both. **What is
missing is the reading, not the derivation**: the CI evidence record carries job outcomes only, so no
artifact carried this verdict and nothing failed loudly. Carrying the check grid into that record is
a change under `tools/`, which is not the architect's — the fourth slice running.
