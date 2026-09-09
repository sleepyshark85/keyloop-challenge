---
id: "09"
title: Close-out — observability, the pool ceiling, and a performance budget that can fail
status: done
depends_on: ["08"]
absorbs: ["11"]     # 10 was absorbed 2026-09-04 and REOPENED 2026-09-08 by human ruling A-09-4
arc42: ["§3.1", "§5.2", "§5.3", "§8.4", "§8.5", "§8.6", "§10.2", "§11.1", "§11.2"]
                     # §5.2 and §8.5 added at step 7: this slice made both false. Declaring an edit
                     # after the fact is worse than leaving arc42 lying only if the edit is hidden.
adr: [5, 6, 10]
quality_scenarios: [QS-13, QS-14, QS-10, QS-12]   # QS-11 goes with the contract half to slice 10
inherits: ["OQ-05-2", "F-06-1", "T-06-5", "I-04-5", "R-07-12"]   # deferred here by ruling
loopbacks: 1   # (c) at step 5 — three criteria nameable; the architect declined a clarification
gate: light          # human cost ruling 2026-09-05; revoked by any open MAJOR/BLOCKING
                     # step 5: REVOKED by three BLOCKING findings, and the revocation lapsed when
                     # each was ruled. A-09-4 is the human gate this slice actually received
---

> **Split at step 7 by human ruling `A-09-4`, 2026-09-08.** This slice reached its gate with seventeen
> criteria and six inherited obligations, having absorbed two folded slices. **Slice 10 is reopened** and
> takes three criteria and one obligation — the contract half, where all three of step 5's blocking
> findings sat. Fourteen and five remain here. Two red commits, both observed red; the design-defect
> ruling re-enters the loop at step 1, so a step 3 follows it. The red set is a property rather than a
> count: every criterion this slice *introduces* failed in one, with a single named exception, AC-12.

## Goal

The candidate read and the insert become separate spans, so the window this design deliberately does not
depend on is *visible*, and a `booking_conflicts_total` metric labelled by resource makes the integrity
goal measurable in production rather than only in tests. The OpenAPI contract the brief asks for is
emitted, committed and pinned against drift here; **asserting that it describes what the wire actually
sends is the next slice's.** And a number on performance, because a goal with no number is a goal nobody
can fail.

## Acceptance criteria

### Observability *(QS-13)*

- **AC-1** — Given an in-memory OTel exporter and a booking that retries once then succeeds, when the
  trace is read, then it contains an `availability.candidates` span that **ends before** the first
  `appointment.insert` span begins. *(QS-13)*
- **AC-2** — In the same trace, exactly two `appointment.insert` spans exist; the failed one carries
  the SQLSTATE and the constraint name as attributes.
- **AC-3** — In the same run, the conflict counter for a bay conflict that the retry absorbed
  increments by exactly 1, with **no** increment of its refused counterpart.
- **AC-4** — Given a booking refused after exhausting candidates, then the refused counter increments
  and the absorbed one does not.
- **AC-5** — Given a `409` from moving a cancelled appointment, when metrics are read, then the
  conflict counter did **not** increment. It counts exclusion violations, and a state conflict is not
  contention.
- **AC-6** — Given any request, when its logs are read, then they are structured `pino` output
  correlated to the trace, carrying no customer name, VIN or vehicle description.

### The OpenAPI document

- **AC-7** — Given the route schemas, when the document is generated, then it matches the committed
  `docs/api/openapi.json` byte for byte; a drifted document fails CI.
- **AC-8** — Given the document, when it is validated, then it is a valid OpenAPI 3.1 description
  covering all five operations.
- **AC-5b** — Given the emitted document, when `GET /availability`'s operation is read, then it
  carries both of the advisory facts: a free answer is not a reservation, and it is true only of the
  interval queried. **The document must be reachable from a unit test too**, or the route's seven
  `description` mutants stay killable and unkilled. Measured at step 4: **88.10 %**, which closes
  that debt.
- ~~**AC-9**~~ media types per operation, ~~**AC-10**~~ the harness status binding and
  ~~**AC-11**~~ the double-booking script's own count → **[slice 10](10-openapi-and-curl-harness.md)
  AC-1, AC-4, AC-5**.

### Inherited from the cancellation slice

- **AC-6b** — Given `Content-Type: application/json` and an **empty body** on a route that reads no
  body, then the response is `200` rather than the `400` pinned today. It runs against the real
  client here, because the harness's booking helper sets that header reflexively. The remedy is a
  content-type parser mapping an empty body to `undefined`, routing it through the schema layer that
  owns that taxonomy row rather than through a special case in the handler.

### The performance budget

- **AC-12** — Given a seeded schedule of 5 bays, 20 technicians and 500 appointments in one
  dealership over one week, when a one-day availability query runs 100 times on the CI container,
  then p95 is **under 200 ms**. *(QS-14)*
  <br>**A guard, not a criterion this slice earns**: the endpoint shipped at the previous slice and
  met the budget on arrival, about 9 ms; threshold and fixture unchanged.
- **AC-13** — Given the same fixture, when an uncontended booking is measured, then p95 is **under
  100 ms** and it issues **exactly one** `INSERT`.
- **AC-14** — Given the booking path, when its queries are counted, then candidate selection reads
  the candidate set once rather than once per candidate.
- **AC-15** — Given the measured write throughput for one contended resource, when arc42 §11 records
  it, then the figure and the dealership scale at which it becomes binding are both stated.

## Inherited scope — six arrived, five discharged and one re-deferred

- **`F-06-1` — two attempt loops, one design. Discharged by extraction** into
  `src/application/attemptLoop.ts`, which carries the retry, both spans and the single conflict increment
  for booking and reschedule alike: one loop leaves one countable increment site. Mutation re-measured on
  arrival, 92.54 %.
- **`OQ-05-2` — an empty body on a bodyless route.** Discharged as AC-6b above.
- **`A-06-2` — nothing asserts that the id generator is the only place an appointment id is minted.** The
  design discharged it *over the emitted document* and **the assertion was never built**. **Re-deferred at
  step 7 to [slice 10](10-openapi-and-curl-harness.md) AC-3**, whose per-operation walk is the same
  traversal. Not claimed as discharged.
- **`T-06-5` — the lock does not prove the write shares its transaction.** A **negative result**: no
  black-box test observes it, the constraint backstopping correctness either way. The type remedy was
  accepted and **not built**. **Ruled at step 7: declined, not deferred** — nothing nameable fails without
  it, the same test that made it a deferred improvement in the first place.
- **`I-04-5` — free-first candidate ordering. Ruled at step 5: no.** Its whole warrant was that the
  uncontended-booking budget follows deductively, and that budget has since been **measured** and passes
  without it. A premise replaced by a measurement does not carry an optimisation onto the booking path on
  a project's last slice. **Declined, not deferred.**
- **`R-07-12` — the pool maximum of 10 matches the service's real ceiling only by coincidence.**
  **Discharged with the remedy inverted at step 5**: an outside-in test may not import `src/`, so it
  cannot *derive* the ceiling — it **dictates** it. `config.ts` reads `DB_POOL_MAX` defaulting to 10,
  `db.ts` takes the value with no second default, the spawn helper sets it, the test asserts what it set.
  What a saturated pool should answer stays open (arc42 §11.1 D-07-1).

## In scope

- The spans and metrics, `pino` structured logging, `tests/integration/telemetry-booking.test.ts`, and the
  telemetry stack in `docker-compose.yml` for the demo.
- The OpenAPI document with the contract test that matches and validates it, and `harness/`. **Both merge
  here and are amended by slice 10**, which asserts them.
- `tests/performance/availability-budget.test.ts` and its seeded fixture, plus the arc42 §11 entry
  recording the measured ceiling.

## Out of scope

- Alerting, dashboards-as-code or an SLO document; tracing the availability query's internals — the span
  that matters is the one that shows the window.
- A client SDK, a UI, a Postman collection, reference-data endpoints.
- Optimising to beat the budget. If it passes, nothing changes: integrity beats performance.
- What a saturated pool answers, load testing beyond one dealership, pool tuning, read replicas.

## Definition of done

Beyond `CLAUDE.md` §10:

- A screenshot of the trace waterfall showing the window, for the phase 7 shot list.
- The README's build-and-run section proven by following it on a clean checkout, not by reading it.
- The budget **and its headroom** recorded beside the machine class: the ceiling is the alarm, the
  headroom is the baseline a regression is measured against.
- **What merged undeclared, named in arc42 §11 rather than left for the next slice to find**: the document
  calls every error response `application/json` while the wire has sent `application/problem+json` since
  the taxonomy landed.
