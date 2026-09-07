# 10. Quality requirements

> Owner: architect · Written: phase 2

## 10.1 Quality tree

The §1.2 ranking, refined into the scenarios below it. The ranking is the human's, ratified at Gate A;
this section only says how each goal is made checkable.

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

What *"under any interleaving"* means, three scenarios using the phrase: the
concurrency tests open **several pooled connections** against the Testcontainers PostgreSQL instance
(§7.2), release the racing statements from a barrier, and assert a property over the resulting table —
never over the responses alone, because asserting on responses tests the client's view. ADR-0009's
ordering seed is fixed per test and recorded in the failure message, so a failing interleaving is
re-runnable rather than a flake. In-flight requests are bounded by the connection pool: more racers
than clients queues them apart and un-races what is being measured (`R-07-4`).

| id | Goal | Scenario | Enforced by |
|---|---|---|---|
| **QS-1** | 1 | **No bay overlap.** Given a dealership with one free bay over `[09:00, 10:00)`, when *N* = 20 booking requests for that interval are released simultaneously, then **exactly one** `appointment` row exists with `status <> 'cancelled'` for that bay over any overlapping range, the other 19 receive `409` with `type=/problems/no-capacity`, and the violated constraint reported by PostgreSQL is named `no_bay_overlap`. *The constraint name is read off the `booking.conflict` line on stdout, being in neither the response body nor the table (§8.5); ADR-0018's locks make it deterministic (§6.1)* | `tests/concurrency/no-bay-overlap.test.ts` |
| **QS-2** | 1 | **No technician overlap.** As QS-1 with bays plentiful and exactly one qualified technician free; the constraint reported is `no_technician_overlap`. Run separately from QS-1 because the two constraints are two objects and one passing is no evidence for the other; same observer | `tests/concurrency/no-technician-overlap.test.ts` |
| **QS-3** | 1 | **No spurious refusal under retry (ADR-0004).** Given a dealership with *M* free bays and *M* free qualified technicians over one interval, when *N* concurrent booking requests are released for that interval, then **exactly `min(N, M)` are confirmed** and the rest receive `409`. Asserted for (N,M) ∈ {(2,1), (5,3), (20,8), (8,20)}. It fails immediately if the retry loop is wrapped in a transaction (§6, §11 R-7e) | `tests/concurrency/no-spurious-refusal.test.ts` |
| **QS-4** | 1 | **A refused move leaves the original confirmed (ADR-0003).** Given appointment A confirmed at `[09:00, 10:00)` and the dealership otherwise fully booked at `[11:00, 12:00)`, when A is rescheduled to 11:00, then the request is refused **and** A is still `confirmed` at `[09:00, 10:00)` with the same id, bay and technician, **and the same `xmin` and `ctid`** — *not written*, not merely *unchanged*. Asserted by reading the row, not the response. *Also two racing movers: 1000 mutually-vacating attempts get a database verdict, `23P01` never `40P01` (ADR-0030, ADR-0031)* | `tests/concurrency/refused-move-leaves-original.test.ts` |
| **QS-5** | 1 | **A move never transiently releases its slot.** Given appointment A at `[09:00, 10:00)` in the only bay, when a reschedule of A to a fully-booked interval races *N* fresh bookings for `[09:00, 10:00)`, then **no fresh booking is ever confirmed** — under every interleaving, at every moment, A's slot is occupied, and no move ever answers `500` | `tests/concurrency/move-never-releases-slot.test.ts` |
| **QS-6** | 1 | **A self-overlapping move succeeds, and the id survives.** Given A confirmed at `[09:00, 10:00)`, when A is rescheduled to `[09:15, 10:15)` and then to `[09:45, 10:45)`, then both succeed, the id is unchanged, and no `23P01` is raised — the row does not conflict with the version it replaces. Pinned rather than assumed (§6.3, ADR-0003) | `tests/integration/reschedule-self-overlap.test.ts` |
| **QS-7** | 1 | **Cancelling frees the slot.** Given A confirmed at `[09:00, 10:00)` in the only bay and a second booking for that interval refused with `409`, when A is cancelled, then the same booking succeeds — and A remains readable with `status: cancelled`. *Its stated reason was wrong twice and is corrected: slice 00 already pins the `WHERE (status <> 'cancelled')` predicate definitionally and, on the bay side, behaviourally. QS-7 is the only assertion anywhere that the **technician** constraint releases, and the only one attributing a `201` to the predicate — the candidate list carries no availability filter, so it is identical either side of the cancel (§6.4)* | `tests/integration/cancellation-releases-slot.test.ts` |
| **QS-8** | 1 | **Availability agrees with the constraint under quiescence.** For an arbitrary generated schedule over one dealership and an arbitrary query interval, with no concurrent writer: over the **candidate set** — `candidateResources(dealership, serviceType)`'s bays × technicians, and only there — every pair the query reports free is accepted by an `INSERT` of exactly `[from, to)`, and every pair it omits is rejected `23P01`. *Corrected at slice 08 (F-08-2): **every** (bay, technician) pair was false as written — an unqualified technician is refused `23503`, a degenerate window `23514`, neither being `23P01`. Quiescence is **witnessed**: the query re-run after the probes must answer byte-identically, and a run failing that witness is invalid rather than red. Each run writes a **cancelled** row on an otherwise-unused pair **by construction**, and that witness kills the `status`-predicate mutant **20 / 20 consecutive** where the generator weight it replaced left 8 of 35 trials surviving (T-08-7) — a gate, not a probability* | `tests/property/availability-agrees-with-constraint.db.test.ts` |
| **QS-9** | 1 | **Opening hours across a DST transition (ADR-0001).** For a dealership in `Europe/London` open 09:00–17:00 local, generated instants around both the March and October transitions are accepted if and only if their **local** rendering lies within the window — in particular `2026-03-28T08:30:00Z` renders 08:30 local (GMT) and is **rejected**, while its counterpart `2026-03-29T08:30:00Z` — the same UTC wall time on the far side of the spring-forward transition — renders 09:30 local (BST) and is **accepted**. Also asserts that a 60-minute job starting 00:30 local on a spring-forward night ends 02:30 local (§8.3). *As built, "generated instants" is a stratified `fc.oneof` — ±90 minutes around each 2026 transition, ±7 days around each at any second, and the whole year at minute granularity — crossed with 1–480-minute durations and a generated weekly schedule in which any day may be closed. The AC-2 pair and AC-3 are asserted as fixed examples beside the properties, a measured pair beating a shrunk counterexample for the case the scenario names. §11 carries what one zone and one year leaves untested. ADR-0015's local-midnight normalisation and ADR-0014's epoch bound are properties of their own, in `tests/property/local-midnight.test.ts` and `tests/property/instant-bounds.test.ts`* | `tests/property/opening-hours-dst.test.ts` |
| **QS-10** | 2 | **The layering is the ruleset, and the ruleset runs.** `depcruise` over `src/` and `tests/` with `.dependency-cruiser.js` exits 0. Additionally, injecting a known violation of each of `domain-is-pure`, `sql-only-in-persistence`, `http-must-not-reach-persistence` and `outside-in-tests-do-not-import-src` into a temporary fixture tree produces an error naming that rule — so the suite proves the rules **fire**, not merely that they parse. A ruleset that has never rejected anything is not evidence (§1.2 goal 2). *`domain-is-pure` carries **two** plants — an import out of the domain and the **intra-domain** form — because a single plant cannot distinguish the two readings (§5.2). §5.3 carries the two guards that make a green cruise mean anything* | `tests/architecture/layering.test.ts` |
| **QS-11** | 2 | **The error taxonomy is total and stable.** Every row of §8.6's status table is reachable and produces that status and that `type`, as `application/problem+json`. Specifically: an out-of-hours request is `400` and **not** `409`; an unknown vehicle is `422` and not `404`; a vehicle not owned by the named customer is `422` and not `403`; a contended booking is `409` with `resource` set; moving a cancelled appointment is `409` with a *different* `type` from a contended one. Also asserts the emitted OpenAPI document matches the committed one. *As built at slice 06, all nine rows are in scope and every one is reached end-to-end, the `500` included, through seeded reference data rather than a stub; the OpenAPI half is slice 09's and unasserted. The ∀rows ∃input sweep cannot fail on a response outside the table, so ADR-0024's ∀responses ∃row hostile corpus runs beside it — and one response is still outside the table deliberately (§8.6)* | `tests/contract/error-taxonomy.test.ts` |
| **QS-12** | 3 | **Ambiguity containment.** The three changes §1.2 goal 3 names are each confined to one module: duration arithmetic appears only in `src/domain/duration.ts` (A-1); the occupancy interval only in `src/domain/interval.ts` (A-4); wall-clock reasoning — **deriving a wall clock or calendar field from an instant, by any route** — only in `src/domain/openingHours.ts` (A-8, ADR-0001). `Intl.DateTimeFormat`, `toLocaleString` and `getHours` illustrate that concept rather than define it; `getUTC*` sits outside it, zone-free by construction. **Carrying an opaque zone string is not reasoning about a zone**: naming a `time_zone` column, or moving its value uninterpreted, is transport, held to its own short named file list. Response measure: **one source file plus one migration**. Asserted by scanning the tree, so inlining an hour of arithmetic in a route handler fails it. *As built the scan carries six markers: the three above, `zone-transport` (a named file list, by set equality), `appointment-table-access` (exactly `src/persistence/appointmentRepository.ts`, which is what makes AC-5 structural) and `contended-resource-cast` (exactly `src/persistence/pgError.ts`, ADR-0016's one escape hatch). Two qualifications: **the response measure is assumed, not measured**, and §11 records what the scan misses* | `tests/architecture/ambiguity-containment.test.ts` |
| **QS-13** | 4 | **The window is visible and conflicts are counted.** Given an in-memory OTel exporter, when a booking retries once and then succeeds, then the trace contains an `availability.candidates` span that **ends before** the first `appointment.insert` span begins (§8.4's window), exactly two `appointment.insert` spans, the failed one carrying `db.sqlstate=23P01` and `db.constraint`, and the meter records `booking_conflicts_total{resource="bay",outcome="absorbed"} == 1` with **no** `refused` increment. When the booking is instead refused, that inverts | `tests/integration/telemetry-booking.test.ts` |
| **QS-14** | 5 | **A stated budget.** Against a seeded schedule of 5 bays, 20 technicians and 500 appointments in one dealership over one week, on the CI container: an availability query over a one-day window returns in **< 200 ms at p95** over 100 runs, and an uncontended booking completes in **< 100 ms at p95** while issuing **exactly one** `INSERT`. Deliberately loose — performance is ranked last (§1.2) — but stated, because a goal with no number is a goal nobody can fail | `tests/performance/availability-budget.test.ts` |

**What is deliberately not here.** No scenario asserts availability is *fresh* — §6.5 says why. None
covers authentication, shift modelling or appointment history: §3.3 excludes them and §11 carries them
as debt. And QS-14 is the only performance scenario.
