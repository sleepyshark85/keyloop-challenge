---
id: "11"
title: The stated performance budget — a goal ranked last is still a goal with a number
status: ready
depends_on: ["10"]
arc42: ["§10.2", "§11.1"]
adr: [6]
quality_scenarios: [QS-14]
loopbacks: 0
---

## Goal

Performance is ranked fifth of five, deliberately and with its cost stated: the chosen correctness
mechanism serialises conflicting writes at the database. This slice puts a number on it anyway,
because a goal with no number is a goal nobody can fail — and records the scale at which the trade
would need revisiting.

## Acceptance criteria

- **AC-1** — Given a seeded schedule of 5 bays, 20 technicians and 500 appointments in one dealership
  over one week, when an availability query over a one-day window runs 100 times on the CI container,
  then p95 is **under 200 ms**. *(QS-14)*
- **AC-2** — Given the same fixture, when an uncontended booking is measured, then p95 is **under
  100 ms** and it issues **exactly one** `INSERT`.
- **AC-3** — Given the booking path, when its queries are counted, then no N+1 pattern exists in
  candidate selection — one read of the candidate set, not one read per candidate.
- **AC-4** — Given the measured write throughput for a single contended resource, when it is recorded
  in §11, then the figure and the dealership scale at which it would become binding are both stated.

## In scope

- `tests/performance/availability-budget.test.ts` and its seeded fixture.
- The §11 entry recording the measured ceiling — turning §1.2's stated-but-unquantified cost into a
  number.

## Out of scope

- Optimising to beat the budget. If it passes, nothing changes: goal 3 beats goal 5, and §1.2 says to
  prefer the decomposition that isolates an ambiguity over the one that saves a query.
- Load testing beyond a single dealership, connection-pool tuning, or read replicas. §11 carries them.

## Definition of done

Beyond `CLAUDE.md` §10:

- The budget is asserted on the CI container and the run's machine class is recorded with the figure,
  so a later regression is comparable rather than merely alarming.
