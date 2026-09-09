---
id: "15"
title: The harness seeds from a declared fixture, and demonstrates capacity as well as scarcity
status: ready
depends_on: ["10"]
arc42: ["§3.1", "§11.1"]
adr: [38]
quality_scenarios: [QS-3]
loopbacks: 0
scope_ruled_at: 2026-09-09
scope_ruled_by: human
---

> **Asked for by the human, 2026-09-09**, in three parts: read the seed's data from a JSON file
> rather than hard-coding it; make the default fixture carry enough data for the important test
> cases; and extend the concurrency demonstration to multiple bays, multiple qualified technicians
> and multiple simultaneous requests.

## Goal

`tests/concurrency/no-spurious-refusal.test.ts` already proves the harder half of §2.1's invariant —
given *M* free bays and *M* free qualified technicians and *N* concurrent bookings, exactly
`min(N, M)` are confirmed — across `(N,M) ∈ {(2,1), (5,3), (20,8), (8,20)}`. **Nothing runnable from a
terminal can show it**, because `harness/seed.mjs` hard-codes one bay and one technician. So the demo
proves "we never double-book" and cannot prove "we never refuse you while a bay is free", which is the
claim a dealership cares about more. This slice makes the second claim runnable, and moves the seed's
reference data into a declared fixture so the world the demo runs against is readable rather than
buried in nine `INSERT`s.

## Acceptance criteria

Verbatim from [`15-design.md`](15-design.md); that file's reasoning is the design of record.

- **AC-1** — `npm run --silent harness:seed` reads `harness/fixture.json` and prints, on stdout,
  export-shaped lines carrying non-empty `DEALERSHIP_ID`, `SERVICE_TYPE_ID`, `CUSTOMER_ID`,
  `VEHICLE_ID`, `STARTS_AT` — unprefixed — and nothing that is not an export line.
- **AC-2** — the same run prints `CAPACITY_DEALERSHIP_ID`, `CAPACITY_SERVICE_TYPE_ID`,
  `CAPACITY_CUSTOMER_ID`, `CAPACITY_VEHICLE_ID`, `CAPACITY_STARTS_AT`, `CAPACITY_BAY_COUNT` and
  `CAPACITY_QUALIFIED_TECHNICIAN_COUNT`; the two counts are equal and ≥ 2; and **the database agrees** —
  that dealership holds exactly that many `service_bay` rows and that many technicians qualified for
  the exported service type. *A count asserted from stdout alone is a claim about a `console.log`.*
- **AC-3** — an invalid fixture fails **loudly and atomically**. For each of: an unknown key; a
  `qualifiedFor` naming an undeclared service type; a `vehicles[].owner` naming an undeclared
  customer; **a duplicate key within a collection**; no subtree with an empty `exportPrefix`; a
  duplicate prefix — the seed exits non-zero, names the offending JSON path on **stderr**, prints
  **nothing** on stdout, and **inserts no row**. *Six of the validator's ten rules, chosen by a stated
  test — a rule earns a case when its breach is **silent**. `days ⊆ 0..6`, `opensAt < closesAt` and
  `durationMinutes > 0` are refused loudly by CHECK constraints at
  `src/persistence/migrations/0002_reference_data.sql:21,25,31`, so a case for each buys no
  discrimination; `purpose` and the ≥ 1-per-collection minimums fail at AC-1/AC-2's own exports.*
- **AC-4** — `harness/spurious-refusal.sh` with `REQUEST_COUNT=10` against the capacity subtree exits
  0, prints one line per racer, and sees exactly `min(N, M)` confirmations and `N - min(N, M)`
  refusals, with *M* taken from the exported counts.
- **AC-5** — and the confirmed appointments name `min(N, M)` **distinct** bay ids and `min(N, M)`
  distinct technician ids, read from the response bodies; the database holds exactly `min(N, M)`
  non-cancelled appointments for that dealership.
- **AC-6** — *(negative control)* with `CAPACITY` overridden to any value other than the true
  capacity, the script exits non-zero. *This is what makes AC-4 an assertion rather than a print
  statement, and it needs no fault injected into the service to prove it.*
- **AC-7** — *(negative control)* with the capacity subtree's interval already fully taken, `N` racers
  see zero confirmations and the script exits non-zero.
- **AC-8** — *(guards)* `REQUEST_COUNT < 2`, `CAPACITY < 2`, and `BAY_COUNT ≠
  QUALIFIED_TECHNICIAN_COUNT` each exit 2 **without firing a request**, each naming which guard fired.
- **AC-9** — *(guard; passes today, and is the no-amendment claim made mechanical)*
  `tests/acceptance/harness.test.ts` and `harness/double-booking.sh` are **unchanged** by this slice's
  diff, and every case in that file still passes. Verified by the **reviewer** against
  `git diff main --stat`, plus CI for the second half.
- **AC-10** — from the default fixture and **one** seed run: booking `VEHICLE_ID_2` with `CUSTOMER_ID`
  answers `422 /problems/vehicle-not-owned`, and booking `SERVICE_TYPE_ID_2` at `DEALERSHIP_ID`
  answers `422 /problems/unknown-reference`. *This is "enough data for the important cases" as a
  criterion rather than a claim.*

**The red set: AC-1 to AC-8 and AC-10 must all fail in the one red commit** — no `fixture.json`, no
`CAPACITY_*` export, no script, no second customer or service type. **AC-9 is the named exception**: it
passes today and exists to fail if this slice breaks it.

## In scope

- `harness/fixture.json` (default) and `HARNESS_FIXTURE` to override; a hand-written validator that
  runs to completion **before the first `INSERT`** and rejects unknown keys.
- Two subtrees, which must be two **dealerships** because bays and technicians are `dealership_id`-scoped
  (arc42 §8.1): a **scarce** one at the empty export prefix — today's shape exactly — and an **abundant**
  one under `CAPACITY_`. Exports are derived mechanically as first-of-each, so slice 10's exported names
  are reproduced **by construction** rather than by care.
- `harness/spurious-refusal.sh`, deriving *M* from the exported declared counts, never from the answers.

## Out of scope

- **Amending slice 10's contract.** `harness/double-booking.sh` and `tests/acceptance/harness.test.ts`
  are not edited; AC-9 makes that mechanical.
- QS-9's DST case (needs a pinned date, which contradicts the rolled-forward instant), ADR-0009's
  cap-exceeded case (needs >16 candidate pairs), QS-14's performance shape.
- An `npm run harness:*` entry for the new script — neither sibling has one, and adding one drags
  slice 10's README set-equality case red for nothing.

## Definition of done

Beyond the standing DoD in `CLAUDE.md` §10:

- ADR-0038 written to `docs/adr/` (drafted `proposed` at step 1, accepted at step 7).
- **No mutation evidence exists for this slice** — nothing under `src/` changes, and Stryker mutates
  neither `harness/**` nor tests. The four negative controls (AC-3, AC-6, AC-7, AC-8) are what stands
  in for it, and the reviewer weighs those rather than reading a vacuous green score.

## Known limits, recorded at step 1

- **The terminal demo cannot discriminate ADR-0004's rejected global-mutex option.**
  `no-spurious-refusal.test.ts` needs its conflict lines and `max(attempt) ≥ 2` precisely because a
  per-dealership mutex would also confirm `min(N, M)`. A script sees responses, not the log stream.
  QS-3's test remains the evidence; this slice is a demonstration of it.
- **A-15-1** — that *N* concurrent `curl` processes contend at all rather than serialising.
  **Closed at step 2, and its step-1 rationale was wrong.** No response-only assertion discriminates a
  serialised run, AC-5's distinctness included; A-15-1 rests on the captured `double-booking.sh`
  transcript, where racer 4 wins. Distinctness is *implied by the exclusion constraints* — two live
  rows cannot share a bay or a technician over one interval, under any interleaving — so it is a
  consequence of the invariant rather than a witness of contention. This demo's contention is over
  **persisted rows, not instants**, which is the one fact behind both this limit and ADR-0004's
  global-mutex limit above.
- **D-15-1** — ADR-0009's cap of 16 is not encoded in the harness (one home for the constant), so a
  fixture author setting *M* = 9 gets an unwarned flaky demo.
- **D-15-3** — the `ROLLBACK` path has no acceptance criterion. An AC for it would need a fixture that
  passes validation and fails at insert; any such fixture can later be moved *into* the validator, at
  which point the control passes for the wrong reason — no rows because nothing was attempted, which is
  `R-10-5`'s vacuity pattern and has already cost this project a cycle. The test-engineer **may** add a
  case at step 3 if it makes the failure's *cause* assertable — stderr naming a SQLSTATE rather than a
  JSON path. Its call, not an obligation.
