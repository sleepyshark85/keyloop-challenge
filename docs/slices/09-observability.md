---
id: "09"
title: Close-out — observability, the pool ceiling, and a performance budget that can fail
status: ready
depends_on: ["08"]
absorbs: ["11"]     # 10 was absorbed 2026-09-04 and REOPENED 2026-09-08 by human ruling A-09-4
arc42: ["§3.1", "§5.2", "§5.3", "§8.4", "§8.5", "§8.6", "§10.2", "§11.1", "§11.2"]
                     # §5.2 and §8.5 added at step 7, with the reason: this slice made both
                     # false — §5.2 said telemetry was still slice 09's and that the move ran a
                     # second attempt loop; §8.5 said `npm test` runs two projects, and `perf`
                     # is a third. Declaring an edit after the fact is worse than leaving arc42
                     # lying only if the edit is hidden; the gate is shown both.
adr: [5, 6, 10]
quality_scenarios: [QS-13, QS-14, QS-10, QS-12]   # QS-11 goes with the contract half to slice 10
inherits: ["OQ-05-2", "F-06-1", "T-06-5", "I-04-5", "R-07-12"]   # deferred here by ruling; slice:check enforces it (A-05-5). I-04-5 and R-07-12 admitted by the human at O-59. A-06-2 re-deferred to slice 10 at step 7
loopbacks: 1   # (c) at step 5 — AC-9, QS-11 and AC-6 nameable; architect declined (a)
gate: light          # human cost ruling 2026-09-05; revoked by any open MAJOR/BLOCKING
                     # step 5: REVOKED by three BLOCKING findings. The revocation lapsed when
                     # each was ruled; A-09-4 is the human gate this slice actually received
---

> **Split at step 7 by human ruling `A-09-4`, 2026-09-08.** Seventeen criteria and six inherited
> obligations at Gate D, absorbing slices 10 and 11. **Slice 10 is reopened** and takes three
> criteria and one obligation — the contract half, where all three of step 5's BLOCKING findings
> sat. Fourteen and five remain.
>
> Two red commits, both observed red (§7), the second licensed by the `(c)` — which re-enters at
> step 1, so step 3 follows. The red set is a property, not a count (`T-09-2`, bounded by
> `T-09-4`): every criterion this slice *introduces* failed in one, AC-12 excepted and named.

## Goal

The candidate read and the insert become separate spans, so the window the design deliberately does
not depend on is *visible*, and `booking_conflicts_total{resource}` makes goal 1 measurable in
production rather than only in tests. The contract the brief asks for is emitted, committed and
pinned against drift here; **asserting that it describes what the wire sends is slice 10's**
(`A-09-4`). And a number on performance: a goal with no number is a goal nobody can fail.

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

### The OpenAPI document *(carried from slice 10; three criteria returned to it at step 7)*

- **AC-7** — Given the route schemas, when the document is generated, then it matches the committed
  `docs/api/openapi.json` byte for byte; a drifted document fails CI.
- **AC-8** — Given the document, when it is validated, then it is a valid OpenAPI 3.1 description
  covering all five operations of §8.6.
- **AC-5b** — Given the emitted document, when `GET /availability`'s operation is read, then it
  carries AC-5's two facts — not a reservation, true only of the interval queried. Split from slice
  08's AC-5 (`R-08-2`). **The document must be reachable from a unit test too**, or this leaves
  `routes/availability.ts`'s seven `description` mutants killable and unkilled (`D-08-1`, §11 R-12).
  Measured at step 4: **88.10 %**, and `D-08-1` closes.
- ~~**AC-9**~~ media types per operation, ~~**AC-10**~~ the harness status binding and
  ~~**AC-11**~~ the double-booking script's own count → **[slice 10](10-openapi-and-curl-harness.md)
  AC-1, AC-4, AC-5**.

### Inherited from slice 05 — OQ-05-2, re-routed here (R-05-2)

- **AC-6b** — Given `Content-Type: application/json` and an **empty body** on a route that reads no
  body, then the response is `200` rather than the `400` slice 05's AC-5 pins today. Slice 05 sent it
  to **slice 10, a tombstone at the time**; corrected to 09, where the harness went (`R-05-2`) —
  `postBooking` sets that header reflexively, so it runs against the real client emitting it. The remedy is a content-type parser mapping an empty body to `undefined`, routing it through
  TypeBox — §8.6's declared owner for that row — not through a special case in the handler.

### The performance budget *(carried from slice 11)*

- **AC-12** — Given a seeded schedule of 5 bays, 20 technicians and 500 appointments in one
  dealership over one week, when a one-day availability query runs 100 times on the CI container,
  then p95 is **under 200 ms**. *(QS-14)*
  <br>**A guard, not a criterion this slice earns** (`T-09-4`): the endpoint shipped at 08 and met
  the budget on arrival, ≈9 ms; threshold and fixture unchanged.
- **AC-13** — Given the same fixture, when an uncontended booking is measured, then p95 is **under
  100 ms** and it issues **exactly one** `INSERT`.
- **AC-14** — Given the booking path, when its queries are counted, then candidate selection reads
  the candidate set once rather than once per candidate.
- **AC-15** — Given the measured write throughput for one contended resource, when §11 records it,
  then the figure and the dealership scale at which it becomes binding are both stated.

## Inherited scope — and what step 7 did with each

Six arrived; **five discharged, one re-deferred**. `R-05-2` fired twice on a destination that lived
only in the ruling naming it, so each bullet says where it landed.

- **F-06-1 — two attempt loops, one design.** **Discharged by extraction** into
  `src/application/attemptLoop.ts`, now carrying ADR-0004's retry, both spans and the single
  conflict increment for booking and reschedule alike. Here because §8.4 must instrument both loops
  anyway: *cheaper*, both files open; *stronger*, one loop and one countable increment site.
  Re-measured on arrival (`D-05-3`): 92.54 %.
- **OQ-05-2** — deferred at slice 05; discharged as **AC-6b** above.
- **A-06-2 — nothing asserts that `deps.newId()` is the only place an appointment id is minted.**
  Discharged *over the emitted document* by the design, and **the assertion was never built**.
  **Re-deferred at step 7 to [slice 10](10-openapi-and-curl-harness.md) AC-3**, cheaper there
  because AC-1's per-operation walk is the same traversal. Not claimed as discharged.
- **T-06-5 — the lock does not prove the write shares its transaction.** Slice 06 returned a
  **negative result**: no black-box test observes it, the exclusion constraint backstopping
  correctness either way. The design accepted the type remedy — `ResourceLock` carrying its `Db` —
  and **it was not built**: `appointmentRepository.ts:86` still brands `{ bayId, technicianId }`
  and its docblock says so. **Ruled at step 7: declined, not deferred.** The price fell as predicted
  and nothing nameable fails without it — the test that made it (b) at slice 06. §11 carries it.
- **I-04-5 — free-first candidate ordering.** **Ruled at step 5: no.** The bias's whole warrant was
  *"AC-13 then follows deductively"*, and AC-13 has since been **measured** and passes under its
  100 ms budget without it. A premise replaced by a measurement does not carry an optimisation onto
  the booking path on a project's last slice, its scope saying goal 3 beats goal 5. **Declined, not
  deferred**, in [`08-design.md`](08-design.md) where the human put it; §11 has the row.
- **R-07-12 — `POOL_MAX = 10` matches the service's real ceiling only by coincidence**, and
  `D-07-1`'s own fix breaks it. **Discharged, remedy inverted at step 5**: an outside-in test may
  not import `src/`, so it cannot *derive* the ceiling — it **dictates** it. `config.ts` reads
  `DB_POOL_MAX` (default 10), `db.ts` takes `poolMax` with no second default, the spawn helper sets
  it, the test asserts what it set. `D-07-1`'s other half stays open, its reason in §11.

## In scope

- §8.4's spans and metrics, `pino` structured logging, `tests/integration/telemetry-booking.test.ts`,
  and `docker-compose.yml`'s `grafana/otel-lgtm` stack, useful for the demo.
- The OpenAPI document with the contract test that matches and validates it, and `harness/`. **Both
  merge here and are amended by slice 10**, which asserts them.
- `tests/performance/availability-budget.test.ts` and its seeded fixture; the §11 entry recording
  the measured ceiling, turning §1.2's unquantified cost into a number.

## Out of scope

- Alerting, dashboards-as-code or an SLO document; tracing the availability query's internals — the
  span that matters shows the window. §11 carries them.
- A client SDK, a UI or a Postman collection (`CLAUDE.md` §1 stubs the client at the contract and
  the harness), and reference-data endpoints (A-7).
- Optimising to beat the budget. If it passes, nothing changes: goal 3 beats goal 5.
- What a saturated pool answers (`D-07-1`'s other half), load testing beyond one dealership, pool
  tuning, read replicas. §11 carries them.

## Definition of done

Beyond `CLAUDE.md` §10:

- A screenshot of the waterfall showing the window, for the phase 7 shot list: the clearest image
  of what this architecture decided.
- The README's build-and-run section proven by following it on a clean checkout, not by reading it.
- The budget **and its headroom** recorded in §11 beside the machine class: the ceiling is the
  alarm, the headroom the baseline a regression is measured against (`T-09-4`).
- **What merged undeclared, named in §11 rather than left for slice 10 to find**: the document
  calls every error response `application/json` while the wire has sent `application/problem+json`
  since slice 03.
