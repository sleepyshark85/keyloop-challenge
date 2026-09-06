---
id: "04"
title: Candidate allocation and retry — no refusal while capacity remains
status: ready
depends_on: ["02"]
arc42: ["§6.2", "§5.2", "§11"]
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

## I-04-10 — ruled (a), step 4, provisional until the gate

`CLAUDE.md` §6 makes "update the slice file" the remedy for (a), so the ruling lands here.

**The defect.** ADR-0009's Order-C removes the premise `tests/concurrency/no-technician-overlap.test.ts`
states in its own header. With 24 bays and 1 technician a loser conflicts on the **technician** at
attempt 1 and refuses correctly unless it drew the winner's bay, so the closing distinct-attempt
assertion holds only at `1 − (23/24)¹⁹ ≈ 0.56`. The implementer's measurement is confirmed.

**Why (a).** Not **(c)**: (c) supersedes an ADR at fault and returns to step 1 — ADR-0009, this
design and the implementation are all correct, and nothing in slice 04 fails. Not **(b)**: (b) merges
as-is, and this cannot, because it is green in the merge run 56 % of the time. What (b) would cost is
nameable — **§2.4**. A suite failing ~44 % independently of the change under test makes "red observed
in CI", and its green counterpart, non-evidential for slice 05 onward. No loopback consumed (0 of 2);
resume from step 3. Precedent: I-02-9, a step-4 test defect ruled (a). It failed **loudly**; this one
fails in the passing direction, which is strictly worse.

**The obligation — the assertion is the test-engineer's to write (§5).** The two-attempt claim is
unrepairable in this fixture and must be **removed, not substituted**. What must still hold, and
already does under every permutation: the 1/19 split, `technicianConflicts >= 19`, and
`resource === 'technician'` — which is E-02-1's guard. The *loop actually looped* obligation needs no
new home: it is deterministic in `tests/acceptance/candidate-retry.test.ts` AC-3 (exactly
`['1:no_bay_overlap','2:no_bay_overlap']`, both bays blocked) and gated in
`tests/concurrency/no-spurious-refusal.test.ts` AC-2 (`max(attempt) >= 2`). The header prose goes
with the assertion. Verified by repeated runs, not one green.

**Blast radius — one file breaks; the rest was checked and withdrawn.** Every other assertion is
permutation-independent. `no-bay-overlap.test.ts` is the mirror and is safe *because* its scarce
resource is the singleton list; `error-taxonomy.test.ts`'s two AC-11 cases assert terminal state
only; `no-spurious-refusal.test.ts` and `candidate-retry.test.ts` were authored against the shuffle.
Four files carry stale premise **prose** with sound assertions — `no-bay-overlap.test.ts`,
`error-taxonomy.test.ts`, `tests/support/booking.ts` (test-engineer) and
`tests/unit/persistence/candidateRepository.test.ts` (implementer, `ORDER BY` is now the shuffle's
stable *input*, which is a better reason than the one recorded). Non-blocking, but fixed this slice:
I-02-9 ruled the false comment the more dangerous half.
