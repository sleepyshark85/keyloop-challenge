# 10. Quality requirements

> Owner: architect · Written: phase 2

## 10.1 Quality tree

The §1.2 ranking, refined into the scenarios below it. The ranking is the human's, ratified at Gate
A; this section only says how each goal is made checkable.

```
Keyloop service scheduler
│
├─ 1 · Booking integrity under concurrency ..................... QS-1 … QS-9
│    ├─ no two live appointments share a bay over one instant ......... QS-1
│    ├─ no two live appointments share a technician ................... QS-2
│    ├─ capacity is not refused while it exists (ADR-0004) ............ QS-3
│    ├─ a refused move leaves the original confirmed (ADR-0003) ....... QS-4
│    ├─ a move never transiently releases its slot .................... QS-5
│    ├─ a move onto its own interval succeeds ......................... QS-6
│    ├─ cancelling frees the slot (the partial predicate) ............. QS-7
│    ├─ availability and the constraint agree under quiescence ........ QS-8
│    └─ opening hours hold across a DST transition (ADR-0001) ......... QS-9
│
├─ 2 · Verifiability ...................................... QS-10, QS-11
│    ├─ the layering is the ruleset, and the ruleset runs ............ QS-10
│    └─ every failure has one status and one problem type ............ QS-11
│
├─ 3 · Modifiability ................................................ QS-12
│    └─ each §1.4 ambiguity is contained by one module
│
├─ 4 · Observability ................................................ QS-13
│    └─ the check-then-act window is visible; conflicts are counted
│
└─ 5 · Performance .................................................. QS-14
     └─ a stated budget, ranked last but not left unmeasured
```

## 10.2 Quality scenarios

Each scenario is executable and names the test enforcing it — a link nothing checks (§11 R-8).

What *"under any interleaving"* means, for the three scenarios using the phrase: the concurrency
tests open **several pooled connections** against the Testcontainers PostgreSQL instance (§7.2),
release the racing statements from a barrier, and assert a property over the resulting **table**,
never over the responses alone — which would test the client's view. ADR-0009's ordering seed is fixed
per test and printed on failure, so a failing interleaving is re-runnable rather than a flake.
In-flight requests are bounded by the pool, more racers than clients queueing them apart and un-racing
what is measured (`R-07-4`); slice 09 makes that bound `DB_POOL_MAX`, dictated by the test rather than
copied from `pg`'s default.

| id | Goal | Scenario | Enforced by |
|---|---|---|---|
| **QS-1** | 1 | **No bay overlap.** Given one free bay over `[09:00, 10:00)`, when *N* = 20 booking requests for that interval are released simultaneously, **exactly one** `appointment` row exists with `status <> 'cancelled'` for that bay over any overlapping range, the other 19 receive `409 /problems/no-capacity`, and the constraint PostgreSQL reports is `no_bay_overlap`. *That name is read off the `booking.conflict` log line, being in neither the response body nor the table (§8.5); ADR-0018's locks make it deterministic (§6.1)* | `tests/concurrency/no-bay-overlap.test.ts` |
| **QS-2** | 1 | **No technician overlap.** As QS-1 with bays plentiful and one qualified technician free; the constraint reported is `no_technician_overlap`. Run separately, the two constraints being two objects and one passing no evidence for the other; same observer | `tests/concurrency/no-technician-overlap.test.ts` |
| **QS-3** | 1 | **No spurious refusal under retry (ADR-0004).** Given *M* free bays and *M* free qualified technicians over one interval, when *N* concurrent bookings are released for it, **exactly `min(N, M)` are confirmed** and the rest receive `409`. Asserted for (N,M) ∈ {(2,1), (5,3), (20,8), (8,20)}. Fails immediately if the retry loop is wrapped in a transaction (§6, §11 R-7e) | `tests/concurrency/no-spurious-refusal.test.ts` |
| **QS-4** | 1 | **A refused move leaves the original confirmed (ADR-0003).** Given A confirmed at `[09:00, 10:00)` and the dealership otherwise full at `[11:00, 12:00)`, when A is rescheduled to 11:00 the request is refused **and** A is still `confirmed` at `[09:00, 10:00)` with the same id, bay, technician, **`xmin` and `ctid`** — *not written*, not merely *unchanged*. Asserted by reading the row, not the response. *Also two racing movers: 1000 mutually-vacating attempts get a database verdict, `23P01` never `40P01` (ADR-0030)* | `tests/concurrency/refused-move-leaves-original.test.ts` |
| **QS-5** | 1 | **A move never transiently releases its slot.** Given A at `[09:00, 10:00)` in the only bay, when a reschedule of A to a full interval races *N* fresh bookings for `[09:00, 10:00)`, then **no fresh booking is ever confirmed** — under every interleaving, at every moment, A's slot is occupied, and no move answers `500` | `tests/concurrency/move-never-releases-slot.test.ts` |
| **QS-6** | 1 | **A self-overlapping move succeeds, and the id survives.** Given A at `[09:00, 10:00)`, when A is rescheduled to `[09:15, 10:15)` and then `[09:45, 10:45)`, both succeed, the id is unchanged and no `23P01` is raised — the row does not conflict with the version it replaces. Pinned rather than assumed (§6.3, ADR-0003) | `tests/integration/reschedule-self-overlap.test.ts` |
| **QS-7** | 1 | **Cancelling frees the slot.** Given A at `[09:00, 10:00)` in the only bay and a second booking for it refused `409`, cancelling A lets that booking succeed — and A remains readable with `status: cancelled`. *Its stated reason was wrong twice and is corrected: slice 00 already pins `WHERE (status <> 'cancelled')` definitionally and, bay-side, behaviourally. QS-7 is the only assertion that the **technician** constraint releases, and the only one attributing a `201` to the predicate — the candidate list carries no availability filter, so it is identical either side of the cancel (§6.4)* | `tests/integration/cancellation-releases-slot.test.ts` |
| **QS-8** | 1 | **Availability agrees with the constraint under quiescence.** For a generated schedule over one dealership and an arbitrary query interval, no concurrent writer: over the **candidate set** — `candidateResources(dealership, serviceType)`'s bays × technicians, and only there — every pair the query reports free is accepted by an `INSERT` of exactly `[from, to)`, every pair it omits rejected `23P01`. *Corrected at slice 08 (F-08-2): **every** pair was false as written — an unqualified technician is refused `23503`, a degenerate window `23514`, neither `23P01`. Quiescence is **witnessed**: re-running the query after the probes must answer byte-identically, a run failing that being invalid rather than red. Each run writes a **cancelled** row on an unused pair **by construction**, killing the `status`-predicate mutant **20 / 20 consecutive** where the generator weight it replaced left 8 of 35 surviving (T-08-7) — a gate, not a probability* | `tests/property/availability-agrees-with-constraint.db.test.ts` |
| **QS-9** | 1 | **Opening hours across a DST transition (ADR-0001).** For a dealership in `Europe/London` open 09:00–17:00 local, generated instants around both 2026 transitions are accepted iff their **local** rendering lies in the window — `2026-03-28T08:30:00Z` renders 08:30 GMT and is **rejected**; `2026-03-29T08:30:00Z`, the same UTC wall time past spring-forward, renders 09:30 BST and is **accepted**. Also that a 60-minute job starting 00:30 local on a spring-forward night ends 02:30 local (§8.3). *As built, "generated instants" is a stratified `fc.oneof` — ±90 minutes around each 2026 transition, ±7 days around each at any second, the whole year at minute granularity — crossed with 1–480-minute durations and a weekly schedule where any day may be closed. §11 carries what one zone and one year leaves untested* | `tests/property/opening-hours-dst.test.ts` |
| **QS-10** | 2 | **The layering is the ruleset, and the ruleset runs.** `depcruise` over `src/` and `tests/` with `.dependency-cruiser.js` exits 0. Additionally, a known violation of each of `domain-is-pure`, `sql-only-in-persistence`, `http-must-not-reach-persistence`, `outside-in-tests-do-not-import-src` and `otel-sdk-only-in-platform`, planted in a temporary fixture tree, produces an error naming that rule — so the suite proves the rules **fire**, not merely that they parse. A ruleset that has never rejected anything is not evidence (§1.2 goal 2). *`domain-is-pure` carries **two** plants — out of the domain, and the **intra-domain** form — one being unable to distinguish the two readings (§5.2); the otel plant has a negative control on `@opentelemetry/api`. §5.3 carries the two guards that make a green cruise mean anything* | `tests/architecture/layering.test.ts` |
| **QS-11** | 2 | **The error taxonomy is total and stable.** Every row of §8.6's status table is reachable and produces that status and that `type`, as `application/problem+json`. Specifically: out-of-hours is `400` and **not** `409`; an unknown vehicle `422` and not `404`; a vehicle not owned by the named customer `422` and not `403`; a contended booking `409` with `resource` set; moving a cancelled appointment `409` with a *different* `type` from a contended one. Also that the emitted OpenAPI document matches the committed one. *As built at slice 06, all nine rows are reached end-to-end, the `500` included, through seeded reference data rather than a stub. The ∀rows ∃input sweep cannot fail on a response outside the table, so ADR-0024's ∀responses ∃row hostile corpus runs beside it — one response being outside the table deliberately (§8.6). Slice 09 emits, commits and drift-guards the document; **its media types are wrong and asserted by nothing**, every response saying `application/json`. Slice 10 owns that half (§8.6, §11)* | `tests/contract/error-taxonomy.test.ts` |
| **QS-12** | 3 | **Ambiguity containment.** The three changes §1.2 goal 3 names are each confined to one module: duration arithmetic to `src/domain/duration.ts` (A-1); the occupancy interval to `src/domain/interval.ts` (A-4); wall-clock reasoning — **deriving a wall clock or calendar field from an instant, by any route** — to `src/domain/openingHours.ts` (A-8, ADR-0001). `Intl.DateTimeFormat`, `toLocaleString` and `getHours` illustrate that concept rather than define it; `getUTC*` is outside it, zone-free by construction. **Carrying an opaque zone string is not reasoning about a zone**: a `time_zone` column, or its value moved uninterpreted, is transport, held to its own named file list. Response measure: **one source file plus one migration**, asserted by scanning the tree, so an hour of arithmetic inlined in a route handler fails it. *As built the scan carries seven markers: the three above, `zone-transport` (a named file list, by set equality), `appointment-table-access` (`appointmentRepository.ts`, what makes AC-5 structural), `contended-resource-cast` (`pgError.ts`, ADR-0016's one escape hatch) and, from slice 09, `conflict-counter-increment` (`attemptLoop.ts`, at most one `.add` per file, anchored on the binding imported from `platform/telemetry` rather than a label spelling). Two qualifications: **the response measure is assumed, not measured**, and §11 records what the scan misses* | `tests/architecture/ambiguity-containment.test.ts` |
| **QS-13** | 4 | **The window is visible and conflicts are counted.** Given an in-memory OTel exporter, when a booking retries once then succeeds, the trace contains an `availability.candidates` span **ending before** the first `appointment.insert` span begins (§8.4's window), exactly two `appointment.insert` spans, the failed one carrying `db.sqlstate=23P01` and `db.constraint`, and the meter records `booking_conflicts_total{resource="bay",outcome="absorbed"} == 1` with **no** `refused` increment. Refused, that inverts. *As built the request span is hand-written, and every `pino` line carries its `trace_id` (§8.4)* | `tests/integration/telemetry-booking.test.ts` |
| **QS-14** | 5 | **A stated budget.** Against a seeded schedule of 5 bays, 20 technicians and 500 appointments in one dealership over a week, on the CI container: a one-day availability query returns in **< 200 ms at p95** over 100 runs, and an uncontended booking completes in **< 100 ms at p95** issuing **exactly one** `INSERT`. Deliberately loose — performance is ranked last (§1.2) — but stated, a goal with no number being a goal nobody can fail. *What is measured is pinned before it is measured: the **HTTP request end to end**, so pool acquisition is in the figure; **serially**; **warm**, a stated warm-up discarded; **p95 nearest-rank over 100 samples**; in the **`perf` project's own container**, since* uncontended *describes the runner too; fixture seeded, machine class printed. The availability half is a standing guard rather than something slice 09 earned, the endpoint having shipped at 08 and met the budget on arrival — so §11 records the headroom as the regression baseline, the ceiling being the alarm* | `tests/performance/availability-budget.test.ts` |

**What is deliberately not here.** No scenario asserts availability is *fresh* (§6.5). None covers
authentication, shift modelling or appointment history: §3.3 excludes them, §11 carries them as debt.
QS-14 is the only performance scenario.
