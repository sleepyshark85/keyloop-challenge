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

- The retry loop in `src/application`, the seeded shuffle, and pruning on the constraint name the driver
  reports — available only because the query layer preserves it.
- `tests/concurrency/no-spurious-refusal.test.ts`.

## Out of scope

- Load balancing across bays: it degenerates to sorted order under burst, which is the quadratic
  contention the retry decision named.
- Changing what the client is told on refusal — the taxonomy is already fixed.

## Definition of done

Beyond `CLAUDE.md` §10:

- The pruning rule was flagged at the phase-2 gate as theoretically over-eager if a blocking appointment
  is cancelled mid-loop. The reviewer checks that case explicitly; if it is real, it is a deferred
  improvement, not a defect.

## Mid-slice rulings — both clarifications, no loopback

Recorded here because the constitution makes updating the slice file the remedy for a clarification;
the reasoning for each is in the event log, which `npm run slice:check 04` prints.

- **`I-04-10`, step 4 — the concurrency fixture's two-attempt assertion is removed, not substituted.**
  The seeded shuffle removes the premise `no-technician-overlap.test.ts` states in its own header: with
  24 bays and one technician a loser conflicts on the **technician** at attempt 1 and refuses correctly
  unless it drew the winner's bay, so the closing two-attempt assertion holds about 56 % of the time. Not
  a design defect — ordering, design and implementation are all correct — and not a deferred improvement,
  because that outcome merges as-is and this is green in the merge run only 56 % of the time. The cost of
  merging it is nameable and it is the standing invariant that every slice begins with an observed
  failing test. What still holds under every permutation, and stays: the 1/19 split, at least 19
  technician conflicts, and a refusal naming the technician as the contended resource. Blast radius one
  file; four others carry stale premise **prose** with sound assertions, fixed this slice.
- **`R-04-1`, step 5 — the arc42 declaration is amended to §7.3 and §13.** Both sections moved on this
  branch and neither was declared; the content of both edits is correct, so nothing fails either way. §13
  is scribe-owned prose and is **declared rather than exempted**: the declaration governs the branch, not
  the author. `npm run slice:check 04` had been printing both undeclared files for 98 minutes before step
  5 — what was missing is the reading, not the derivation, the CI evidence record carrying job outcomes
  only.
