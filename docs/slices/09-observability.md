---
id: "09"
title: Close-out — observability, the OpenAPI contract with its cURL harness, and the performance budget
status: ready
depends_on: ["08"]
absorbs: ["10", "11"]
arc42: ["§3.1", "§8.4", "§8.6", "§10.2", "§11.1"]
adr: [5, 6, 10]
quality_scenarios: [QS-13, QS-11, QS-14]
loopbacks: 0
gate: light          # human cost ruling 2026-09-05; revoked by any open MAJOR/BLOCKING
---

> **Absorbs slices 10 and 11 by the Gate D ruling of 2026-09-04**, the second half of the C6 cut.
> The three were always the close-out of the backlog: none adds a behaviour, each puts a number or a
> document against behaviour that already exists. The OpenAPI half is the cheapest of the three
> because ADR-0005 emits the document from the TypeBox route schemas rather than hand-authoring it,
> so by the time this slice runs most of it has already been written by slices 02 to 08.
>
> **Fifteen acceptance criteria is the largest slice in the backlog and that is stated, not hidden.**
> The three parts are independent — telemetry, contract, budget — so they take three reds if they
> need three. `CLAUDE.md` §7 still applies: a commit over ~150 lines should probably have been two.

## Goal

A booking's advisory candidate read and its insert are separate spans, so the window the design
deliberately does not depend on is *visible* in a waterfall rather than merely argued about in
documentation. `booking_conflicts_total{resource}` makes quality goal 1 measurable in production and
not only in tests.

The contract the brief asks for, and a way to exercise it by hand — one source of truth, which is the
deciding argument in ADR-0005 and what puts the document in METHODOLOGY §4's *generated* tier.

And a number on performance, which is ranked fifth of five deliberately and with its cost stated:
the chosen correctness mechanism serialises conflicting writes at the database. A goal with no number
is a goal nobody can fail.

## Acceptance criteria

### Observability *(QS-13)*

- **AC-1** — Given an in-memory OTel exporter and a booking that retries once then succeeds, when the
  trace is read, then it contains an `availability.candidates` span that **ends before** the first
  `appointment.insert` span begins. *(QS-13)*
- **AC-2** — In the same trace, exactly two `appointment.insert` spans exist; the failed one carries
  `db.sqlstate=23P01` and `db.constraint`.
- **AC-3** — In the same run, `booking_conflicts_total{resource="bay",outcome="absorbed"}` increments
  by exactly 1 and **no** `outcome="refused"` increment occurs.
- **AC-4** — Given a booking that is refused after exhausting candidates, then `outcome="refused"`
  increments and `absorbed` does not.
- **AC-5** — Given a `409` from moving a cancelled appointment, when metrics are read, then
  `booking_conflicts_total` did **not** increment — it counts `23P01`, and a state conflict is not
  contention (§8.4, §8.6).
- **AC-6** — Given any request, when its logs are read, then they are structured `pino` output
  correlated to the trace, and contain no customer name, VIN or vehicle description.

### The OpenAPI document and the harness *(carried from slice 10)*

- **AC-7** — Given the route schemas, when the document is generated, then it matches the committed
  `openapi.json` byte for byte; a drifted document fails CI. *(QS-11, second half)*
- **AC-8** — Given the document, when it is validated, then it is a valid OpenAPI 3.1 description
  covering all five operations of §8.6.
- **AC-9** — Given every error `type` in §8.6, when the document is read, then each is described as
  an `application/problem+json` response on the operations that can produce it.
- **AC-10** — Given a running service seeded with fixtures, when the cURL harness is executed
  end to end, then it books, reads, reschedules and cancels, and prints the status and `type` of each
  response.
- **AC-11** — Given the harness, when the double-booking script is run, then it fires concurrent
  requests for one slot and shows exactly one `201` and the rest `409` — the invariant demonstrated
  from a terminal, without the test suite.

### The performance budget *(carried from slice 11)*

- **AC-12** — Given a seeded schedule of 5 bays, 20 technicians and 500 appointments in one dealership
  over one week, when an availability query over a one-day window runs 100 times on the CI container,
  then p95 is **under 200 ms**. *(QS-14)*
- **AC-13** — Given the same fixture, when an uncontended booking is measured, then p95 is **under
  100 ms** and it issues **exactly one** `INSERT`.
- **AC-14** — Given the booking path, when its queries are counted, then no N+1 pattern exists in
  candidate selection — one read of the candidate set, not one read per candidate.
- **AC-15** — Given the measured write throughput for a single contended resource, when it is recorded
  in §11, then the figure and the dealership scale at which it would become binding are both stated.

## In scope

- OpenTelemetry spans and metrics per §8.4, `pino` structured logging, and
  `tests/integration/telemetry-booking.test.ts`.
- The `grafana/otel-lgtm` stack from `docker-compose.yml` becoming useful for the demo.
- Emitting and committing the OpenAPI document; the contract test asserting it matches.
- `harness/` — cURL scripts covering the five operations plus the contention demonstration.
- `tests/performance/availability-budget.test.ts` and its seeded fixture.
- The §11 entry recording the measured ceiling — turning §1.2's stated-but-unquantified cost into a
  number.

## Out of scope

- Alerting, dashboards-as-code, or an SLO document. §11 carries them.
- Tracing the availability query's internals. The span that matters is the one that shows the window.
- A client SDK, a UI, or a Postman collection. `CLAUDE.md` §1 stubs the client layer at the contract
  and the harness.
- Reference-data endpoints. A-7 keeps seeding to migrations and fixtures precisely so this surface
  stays the five operations that carry risk.
- Optimising to beat the budget. If it passes, nothing changes: goal 3 beats goal 5, and §1.2 says to
  prefer the decomposition that isolates an ambiguity over the one that saves a query.
- Load testing beyond a single dealership, connection-pool tuning, or read replicas. §11 carries them.

## Definition of done

Beyond `CLAUDE.md` §10:

- A screenshot of the waterfall showing the window is captured for the phase 7 shot list. It is the
  clearest single image of what this architecture decided.
- The README's build-and-run section is proven by following it on a clean checkout, not by reading it.
- The budget is asserted on the CI container and the run's machine class is recorded with the figure,
  so a later regression is comparable rather than merely alarming.
