---
id: "04"
title: Candidate allocation and retry — no refusal while capacity remains
status: ready
depends_on: ["03"]
arc42: ["§6.2", "§5.2"]
adr: [4, 9]
quality_scenarios: [QS-3]
loopbacks: 0
---

## Goal

A booking that loses a race for one candidate tries the next, and refuses only when the candidate
list is exhausted or the attempt cap is reached. The candidate read stays advisory — correctness
still comes from the insert — so this is not check-then-act. Ordering is a seeded shuffle, and a
failed attempt prunes by the constraint that actually fired (ADR-0009).

## Acceptance criteria

- **AC-1** — Given *M* free bays and *M* free qualified technicians over one interval, when *N*
  concurrent bookings are released for it, then **exactly `min(N, M)`** are confirmed and the rest
  receive `409`. Asserted for (N,M) ∈ {(2,1), (5,3), (20,8), (8,20)}. A refusal while capacity
  remained fails this slice. *(QS-3)*
- **AC-2** — Given a booking whose first candidate loses, when it retries, then the retry is **not**
  wrapped in a transaction — a second attempt inside an aborted transaction would raise `25P02`
  rather than retrying, and the test asserts the absence of that code (§6.2).
- **AC-3** — Given an attempt fails with `no_bay_overlap`, when the next candidate is chosen, then
  every candidate sharing that bay is pruned; the same for `no_technician_overlap`. The loop's bound
  is additive, not multiplicative.
- **AC-4** — Given the attempt cap of 16 is reached with candidates remaining, when the loop stops,
  then `409` with `type=/problems/no-capacity` is returned and the cap is visible in telemetry rather
  than silent.
- **AC-5** — Given a fixed seed, when the same contention scenario runs twice, then the same
  interleaving of candidate choices results — a failing test is re-runnable, not a flake.

## In scope

- The retry loop in `src/application`, the seeded shuffle, and pruning on `err.constraint` — which is
  only available because ADR-0006 chose a query layer that preserves it.
- `tests/concurrency/no-spurious-refusal.test.ts`.

## Out of scope

- Load balancing across bays. ADR-0009 rejected it: it degenerates to sorted order under burst, which
  is the O(n²) failure ADR-0004 named.
- Changing what the client is told on refusal — that is slice 03's taxonomy, already fixed.

## Definition of done

Beyond `CLAUDE.md` §10:

- The pruning rule is the architect's own addition and was flagged at Gate B as theoretically
  over-eager if a blocking appointment is cancelled mid-loop. The reviewer checks that case
  explicitly; if it is real, it is a `(b)` deferral, not a defect.
