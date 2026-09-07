---
id: "09"
title: Close-out — observability, the OpenAPI contract with its cURL harness, and the performance budget
status: ready
depends_on: ["08"]
absorbs: ["10", "11"]
arc42: ["§3.1", "§8.4", "§8.6", "§10.2", "§11.1"]
adr: [5, 6, 10]
quality_scenarios: [QS-13, QS-11, QS-14]
inherits: ["OQ-05-2", "F-06-1", "A-06-2", "T-06-5", "I-04-5", "R-07-12"]   # deferred here by ruling; slice:check enforces it (A-05-5). I-04-5 and R-07-12 admitted by the human at O-59, 2026-09-08
loopbacks: 0
gate: light          # human cost ruling 2026-09-05; revoked by any open MAJOR/BLOCKING
---

> **Absorbs slices 10 and 11 (Gate D, 2026-09-04).** None of the three adds a behaviour; each puts a
> number or a document against behaviour that already exists.
>
> **Seventeen acceptance criteria and six inherited obligations: the largest slice in the project,
> stated rather than hidden.** The three parts are *not* independent — `A-06-4`, plus three further
> couplings in [the design](09-design.md) — so this is **one red commit** across three test files and
> one observed red run (§7), whose ~150-line guidance still governs every green commit after it.

## Goal

The candidate read and the insert become separate spans, so the window the design deliberately does
not depend on is *visible*, and `booking_conflicts_total{resource}` makes goal 1 measurable in
production rather than only in tests.

The contract the brief asks for, and a way to exercise it by hand. And a number on performance: a
goal with no number is a goal nobody can fail.

## Acceptance criteria

### Observability *(QS-13)*

- **AC-1** — Given an in-memory OTel exporter and a booking that retries once then succeeds, when the
  trace is read, then it contains an `availability.candidates` span that **ends before** the first
  `appointment.insert` span begins. *(QS-13)*
- **AC-2** — In the same trace, exactly two `appointment.insert` spans exist; the failed one carries
  `db.sqlstate=23P01` and `db.constraint`.
- **AC-3** — In the same run, `booking_conflicts_total{resource="bay",outcome="absorbed"}` increments
  by exactly 1, with **no** `outcome="refused"` increment.
- **AC-4** — Given a booking refused after exhausting candidates, then `outcome="refused"`
  increments and `absorbed` does not.
- **AC-5** — Given a `409` from moving a cancelled appointment, when metrics are read, then
  `booking_conflicts_total` did **not** increment — it counts `23P01`, and a state conflict is not
  contention (§8.4, §8.6).
- **AC-6** — Given any request, when its logs are read, then they are structured `pino` output
  correlated to the trace, carrying no customer name, VIN or vehicle description.

### The OpenAPI document and the harness *(carried from slice 10)*

- **AC-7** — Given the route schemas, when the document is generated, then it matches the committed
  `openapi.json` byte for byte; a drifted document fails CI. *(QS-11, second half)*
- **AC-8** — Given the document, when it is validated, then it is a valid OpenAPI 3.1 description
  covering all five operations of §8.6.
- **AC-9** — Given every error `type` in §8.6, when the document is read, then each is described as
  an `application/problem+json` response on the operations that can produce it.
- **AC-5b** — Given the emitted document, when `GET /availability`'s response schema is read, then it
  carries AC-5's two facts — not a reservation, true only of the interval queried. Split from slice
  08's AC-5 (`R-08-2`). **The document must be reachable from a unit test too**, or this leaves
  `routes/availability.ts`'s seven `description` mutants killable and unkilled (`D-08-1`, §11 R-12).
- **AC-10** — Given a seeded running service, when the cURL harness runs end to end, then it books,
  reads, reschedules and cancels, printing the status and `type` of each response.
- **AC-11** — Given the harness, when the double-booking script runs, then concurrent requests for
  one slot show exactly one `201` and the rest `409` — the invariant demonstrated from a terminal,
  without the test suite.

### Inherited from slice 05 — OQ-05-2, re-routed here (R-05-2)

- **AC-6b** — Given `Content-Type: application/json` and an **empty body** on a route that reads no
  body, then the response is `200` rather than the `400` slice 05's AC-5 pins today. Slice 05 sent it
  to **slice 10, a tombstone since 2026-09-04**; corrected to 09, where the harness went —
  `postBooking` sets that header reflexively, so the assertion runs against the real client emitting
  it. The remedy is a content-type parser mapping an empty body to `undefined`, routing it through
  TypeBox — §8.6's declared owner for that row — not through a special case in the handler.

### The performance budget *(carried from slice 11)*

- **AC-12** — Given a seeded schedule of 5 bays, 20 technicians and 500 appointments in one
  dealership over one week, when a one-day availability query runs 100 times on the CI container,
  then p95 is **under 200 ms**. *(QS-14)*
- **AC-13** — Given the same fixture, when an uncontended booking is measured, then p95 is **under
  100 ms** and it issues **exactly one** `INSERT`.
- **AC-14** — Given the booking path, when its queries are counted, then candidate selection reads
  the candidate set once rather than once per candidate.
- **AC-15** — Given the measured write throughput for one contended resource, when §11 records it,
  then the figure and the dealership scale at which it becomes binding are both stated.

## Inherited scope — written here, not only where it was deferred

Six obligations: what is owed, and where it is discharged. `R-05-2` fired twice on a destination
that lived only in the ruling naming it.

- **F-06-1 — two attempt loops, one design.** `bookAppointment` and `rescheduleAppointment` each
  carry ADR-0004's retry loop in their own file — same pruning, same cap, two deadlock names.
  **Discharged by extraction**, here because §8.4 must instrument both loops anyway: *cheaper*, both
  files being open, and *stronger*, an extracted loop being instrumented once and its increment site
  countable at one. The loops start on different first attempts, so the extraction takes a parameter
  rather than being a lift. Re-measured on arrival (`D-05-3`).
- **OQ-05-2** — deferred at slice 05; discharged as **AC-6b** above.
- **A-06-2 — nothing asserts that `deps.newId()` is the only place an appointment id is minted.**
  ADR-0025 rests on it: an id unreachable before it exists makes the read's `absent` answer
  permanent, so the `404` cannot go stale. **Discharged over the emitted document** — every
  operation asserted to accept no caller-supplied id, rather than the files someone grepped. A
  `dependency-cruiser` rule is file-granular and cannot see it; *"the reviewer looked"* is not
  executable.
- **T-06-5 — the lock does not prove the write shares its transaction.** Slice 06 named the hole and
  the test-engineer returned a **negative result**: no black-box test observes it, the exclusion
  constraint backstopping correctness either way. **Discharged by types — accepted, not
  merely inherited**: `ResourceLock` carries the `Db` it was taken on, so the signature changes once
  over the extracted loop instead of twice. Slice 06 declined it as (b) because nothing fails
  without it; that is still true, and the price has fallen.
- **I-04-5 — the advisory read must order candidates before AC-13 can pass.** Re-deferred here at
  slice 08 step 5 on a third argument: the deduction runs through QS-8, which said nothing about a
  cancelled row until mechanic 6 landed, so shipping the bias earlier rested it on a premise weaker
  than its own. **Discharged by accepting or superseding that `proposed` decision on measurement**,
  in [`08-design.md`](08-design.md) where the ADR retirement put it — after F-06-1's extraction, so
  the bias lands at one site.
- **R-07-12 — `POOL_MAX = 10` matches the service's real ceiling only by coincidence**, and
  `D-07-1`'s own fix is what breaks it. **Discharged by deriving the bound from the pool the service
  built** — the ceiling becomes one named value. Not by bumping the literal, the failure mode being
  precisely that a literal and a config value drift silently; and not by answering `D-07-1` whole,
  which the design splits and Out of scope carries.

## In scope

- §8.4's spans and metrics, `pino` structured logging, `tests/integration/telemetry-booking.test.ts`,
  and the `grafana/otel-lgtm` stack in `docker-compose.yml` becoming useful for the demo.
- Emitting and committing the OpenAPI document; the contract test asserting it matches.
- `harness/` — cURL scripts covering the five operations plus the contention demonstration.
- `tests/performance/availability-budget.test.ts` and its seeded fixture.
- The §11 entry recording the measured ceiling, turning §1.2's unquantified cost into a number.

## Out of scope

- Alerting, dashboards-as-code, or an SLO document. §11 carries them.
- Tracing the availability query's internals: the span that matters is the one showing the window.
- A client SDK, a UI, or a Postman collection — `CLAUDE.md` §1 stubs the client at the contract and
  the harness — and reference-data endpoints (A-7), so the surface stays the five risk-carrying
  operations.
- Optimising to beat the budget. If it passes, nothing changes: goal 3 beats goal 5.
- What a saturated pool answers (`D-07-1`'s other half), load testing beyond one dealership, pool
  tuning, read replicas. §11 carries them.

## Definition of done

Beyond `CLAUDE.md` §10:

- A screenshot of the waterfall showing the window, for the phase 7 shot list: the clearest single
  image of what this architecture decided.
- The README's build-and-run section proven by following it on a clean checkout, not by reading it.
- The budget asserted on the CI container, with the run's machine class recorded beside the figure so
  a later regression is comparable rather than merely alarming.
