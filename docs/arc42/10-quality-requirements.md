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

Each scenario is written so it can be executed, and names the test that enforces it. CI fails if a
scenario names a test that does not exist.

A note on what "under any interleaving" means operationally, since three scenarios use the phrase:
the concurrency tests open **several pooled connections** against the Testcontainers PostgreSQL
instance (§7.2) and release the racing statements from a barrier, then assert a property over the
resulting table — never over the responses alone. Asserting on responses would test the client's view;
asserting on the table tests the invariant. ADR-0009's ordering seed is fixed per test and recorded in
the failure message, so a failing interleaving is re-runnable rather than a flake.

| id | Goal | Scenario | Enforced by |
|---|---|---|---|
| **QS-1** | 1 | **No bay overlap.** Given a dealership with one free bay over `[09:00, 10:00)`, when *N* = 20 booking requests for that interval are released simultaneously, then **exactly one** `appointment` row exists with `status <> 'cancelled'` for that bay over any overlapping range, the other 19 receive `409` with `type=/problems/no-capacity`, and the violated constraint reported by PostgreSQL is named `no_bay_overlap` | `tests/concurrency/no-bay-overlap.test.ts` |
| **QS-2** | 1 | **No technician overlap.** As QS-1 with bays plentiful and exactly one qualified technician free; the constraint reported is `no_technician_overlap`. Run separately from QS-1 because the two constraints are two objects and one passing is no evidence for the other | `tests/concurrency/no-technician-overlap.test.ts` |
| **QS-3** | 1 | **No spurious refusal under retry (ADR-0004).** Given a dealership with *M* free bays and *M* free qualified technicians over one interval, when *N* concurrent booking requests are released for that interval, then **exactly `min(N, M)` are confirmed** and the rest receive `409`. Asserted for (N,M) ∈ {(2,1), (5,3), (20,8), (8,20)}. A refusal while capacity remained fails this scenario. It also fails immediately if the retry loop is wrapped in a transaction, because the second attempt then raises `25P02` rather than retrying (§6) | `tests/concurrency/no-spurious-refusal.test.ts` |
| **QS-4** | 1 | **A refused move leaves the original confirmed (ADR-0003).** Given appointment A confirmed at `[09:00, 10:00)` and the dealership otherwise fully booked at `[11:00, 12:00)`, when A is rescheduled to 11:00, then the request is refused **and** A is still `confirmed` at `[09:00, 10:00)` with the same id, bay and technician. Asserted by reading the row, not the response | `tests/concurrency/refused-move-leaves-original.test.ts` |
| **QS-5** | 1 | **A move never transiently releases its slot.** Given appointment A at `[09:00, 10:00)` in the only bay, when a reschedule of A to a fully-booked interval races *N* fresh bookings for `[09:00, 10:00)`, then **no fresh booking is ever confirmed** — under every interleaving, at every moment, A's slot is occupied. This is the scenario that would catch a cancel-then-insert move, which passes every single-threaded test | `tests/concurrency/move-never-releases-slot.test.ts` |
| **QS-6** | 1 | **A self-overlapping move succeeds, and the id survives.** Given A confirmed at `[09:00, 10:00)`, when A is rescheduled to `[09:15, 10:15)` and then extended to `[09:15, 11:15)`, then both succeed, the id is unchanged, and no `23P01` is raised — the row does not conflict with the version it replaces. Pinned rather than assumed: it is the one place the constraint's semantics are relied on without being obvious (ADR-0003) | `tests/integration/reschedule-self-overlap.test.ts` |
| **QS-7** | 1 | **Cancelling frees the slot.** Given A confirmed at `[09:00, 10:00)` in the only bay and a second booking for that interval refused with `409`, when A is cancelled, then the same booking succeeds — and A remains readable with `status: cancelled`. This is the only test that exercises the constraints' `WHERE (status <> 'cancelled')` predicate; without it that clause is an unverified claim | `tests/integration/cancellation-releases-slot.test.ts` |
| **QS-8** | 1 | **Availability agrees with the constraint under quiescence.** For an arbitrary generated schedule (random appointments over one dealership) and an arbitrary query interval, with no concurrent writer: **every** (bay, technician) pair the availability query reports free is accepted by an `INSERT`, and **every** pair it omits is rejected with `23P01`. Holds the constraint's range expression and the query's in agreement — §4.2 explains why a shared SQL function cannot do this job | `tests/property/availability-agrees-with-constraint.test.ts` |
| **QS-9** | 1 | **Opening hours across a DST transition (ADR-0001).** For a dealership in `Europe/London` open 09:00–17:00 local, generated instants on the days surrounding both the March and October transitions are accepted if and only if their **local** rendering lies within the window — in particular `2026-03-28T08:30:00Z` renders 08:30 local (GMT) and is **rejected**, while its counterpart `2026-03-29T08:30:00Z` — the same UTC wall time on the far side of the spring-forward transition — renders 09:30 local (BST) and is **accepted**. *(Corrected 2026-09-04 under the human's O-13 ruling, which is propagated here rather than re-decided: as first written this clause read "the instant that is 08:30 local but 09:30 UTC", which describes `Europe/London` at UTC−1, an offset the zone never has. UTC and local were transposed. The substance of the scenario is unchanged; the pair above is measured, not reasoned about.)* Also asserts that a 60-minute job starting 00:30 local on a spring-forward night ends 02:30 local (§8.3) | `tests/property/opening-hours-dst.test.ts` |
| **QS-10** | 2 | **The layering is the ruleset, and the ruleset runs.** `depcruise` over `src/` and `tests/` with `.dependency-cruiser.js` exits 0. Additionally, injecting a known violation of each of `domain-is-pure`, `sql-only-in-persistence`, `http-must-not-reach-persistence` and `outside-in-tests-do-not-import-src` into a temporary fixture tree produces an error naming that rule — so the suite proves the rules **fire**, not merely that they parse. A ruleset that has never rejected anything is not evidence (§1.2 goal 2) | `tests/architecture/layering.test.ts` |
| **QS-11** | 2 | **The error taxonomy is total and stable.** Every row of §8.6's status table is reachable and produces that status and that `type`, as `application/problem+json`. Specifically: an out-of-hours request is `400` and **not** `409`; an unknown vehicle is `422` and not `404`; a vehicle not owned by the named customer is `422` and not `403`; a contended booking is `409` with `resource` set; moving a cancelled appointment is `409` with a *different* `type` from a contended one. Also asserts the emitted OpenAPI document matches the committed one | `tests/contract/error-taxonomy.test.ts` |
| **QS-12** | 3 | **Ambiguity containment.** The three changes §1.2 goal 3 names are each confined to one module: duration arithmetic appears only in `src/domain/duration.ts` (A-1); the occupancy interval only in `src/domain/interval.ts` (A-4); wall-clock and IANA-zone reasoning — any use of `Intl.DateTimeFormat` with a `timeZone`, or of a dealership's `time_zone` — only in `src/domain/openingHours.ts` (ADR-0001). Response measure: **one source file plus one migration**. Asserted by scanning the tree, so it fails the day someone inlines an hour of arithmetic in a route handler | `tests/architecture/ambiguity-containment.test.ts` |
| **QS-13** | 4 | **The window is visible and conflicts are counted.** Given an in-memory OTel exporter, when a booking retries once and then succeeds, then the trace contains an `availability.candidates` span that **ends before** the first `appointment.insert` span begins (the check-then-act window, drawn but not depended on), exactly two `appointment.insert` spans, the failed one carrying `db.sqlstate=23P01` and `db.constraint`, and the meter records `booking_conflicts_total{resource="bay",outcome="absorbed"} == 1` with **no** `outcome="refused"` increment. When the booking is instead refused, `outcome="refused"` increments and `absorbed` does not | `tests/integration/telemetry-booking.test.ts` |
| **QS-14** | 5 | **A stated budget.** Against a seeded schedule of 5 bays, 20 technicians and 500 appointments in one dealership over one week, on the CI container: an availability query over a one-day window returns in **< 200 ms at p95** over 100 runs, and an uncontended booking completes in **< 100 ms at p95** while issuing **exactly one** `INSERT`. Deliberately loose — performance is ranked last (§1.2) — but stated, because a goal with no number is a goal nobody can fail | `tests/performance/availability-budget.test.ts` |

**What is deliberately not here.** There is no scenario for availability being *fresh*: it is
advisory by contract (§4.1, §6.5), and a scenario asserting freshness would be asserting the property
the whole design gives up on purpose. There is no scenario for authentication, shift modelling or
appointment history — §3.3 excludes them and §11 carries them as debt. And QS-14 is the only
performance scenario, which is what "ranked last" is supposed to look like.

**Two directories in this table need an ownership ruling** — `tests/architecture/` (QS-10, QS-12) and
`tests/performance/` (QS-14) are not in `CLAUDE.md` §5's table. §8.5 states the architect's proposal
and flags it for Gate B rather than assuming it.
