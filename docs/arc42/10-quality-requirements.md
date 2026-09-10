# 10. Quality requirements

> Owner: architect · Written: phase 2

## 10.1 Quality tree

The §1.2 ranking, refined into the scenarios below it.

```
Keyloop service scheduler
├─ 1 · Booking integrity under concurrency ......... QS-1 … QS-9, QS-15, QS-16
├─ 2 · Verifiability ...................................... QS-10, QS-11
├─ 3 · Modifiability ................................................ QS-12
├─ 4 · Observability ................................................ QS-13
└─ 5 · Performance .................................................. QS-14
```

## 10.2 Quality scenarios

Each is executable and names the test that enforces it, so
`§10 scenario → slice acceptance criterion → test → CI result` is walkable both ways.

*"Under any interleaving"* means: the concurrency tests open **several pooled connections** against the
Testcontainers instance, release the racing statements from a barrier, and assert over the resulting
**table** rather than the responses. The ordering seed is fixed per test and printed on failure, and
racers are bounded by `DB_POOL_MAX`, since more racers than clients queue them apart.

| id | Goal | Scenario | Enforced by |
|---|---|---|---|
| **QS-1** | 1 | **No bay overlap.** One free bay over `[09:00, 10:00)`, *N* = 20 simultaneous requests: **exactly one** row survives with `status <> 'cancelled'`, 19 receive `409 /problems/no-capacity`, and the constraint reported is `no_bay_overlap` | `tests/concurrency/no-bay-overlap.test.ts` |
| **QS-2** | 1 | **No technician overlap.** As QS-1 with bays plentiful and one qualified technician; the constraint reported is `no_technician_overlap`. Run separately — one constraint passing is no evidence for the other | `tests/concurrency/no-technician-overlap.test.ts` |
| **QS-3** | 1 | **No spurious refusal under retry.** With *M* free bays and *M* qualified technicians over one interval and *N* concurrent bookings, **exactly `min(N, M)` are confirmed**, for (N,M) ∈ {(2,1), (5,3), (20,8), (8,20)}. Fails if the retry loop is wrapped in a transaction | `tests/concurrency/no-spurious-refusal.test.ts` |
| **QS-4** | 1 | **A refused move leaves the original confirmed** — same id, bay, technician, **`xmin` and `ctid`**: *not written*, not merely unchanged, read from the table. Also 1000 mutually-vacating racing moves, every one getting a database verdict, `23P01` never `40P01` | `tests/concurrency/refused-move-leaves-original.test.ts` |
| **QS-5** | 1 | **A move never transiently releases its slot.** A reschedule of A out of the only bay racing *N* fresh bookings for A's interval confirms **none** of them, and no move answers `500` | `tests/concurrency/move-never-releases-slot.test.ts` |
| **QS-6** | 1 | **A self-overlapping move succeeds and the id survives.** `[09:00, 10:00)` → `[09:15, 10:15)` → `[09:45, 10:45)`: both succeed, id unchanged, no `23P01` | `tests/integration/reschedule-self-overlap.test.ts` |
| **QS-7** | 1 | **Cancelling frees the slot.** With A in the only bay and a second booking refused `409`, cancelling A lets that booking succeed and A stays readable as `cancelled` — the only assertion that the **technician** constraint releases | `tests/integration/cancellation-releases-slot.test.ts` |
| **QS-8** | 1 | **Availability agrees with the constraint under quiescence.** Over the candidate set and only there, every pair reported free is accepted by an `INSERT` of **exactly the interval the response names** — read from it, never recomputed by the test — and every pair omitted is rejected `23P01`. Quiescence is **witnessed**: re-running the query after the probes must answer byte-identically. It cannot catch a *wrong* window, being internally consistent by construction; that the two endpoints derive the same one is asserted by slice 16's AC-2, not here | `tests/property/availability-agrees-with-constraint.db.test.ts` |
| **QS-9** | 1 | **Opening hours across a DST transition.** An instant is accepted iff its **local** rendering lies in the window: `2026-03-28T08:30:00Z` renders 08:30 GMT and is rejected, `2026-03-29T08:30:00Z` renders 09:30 BST and is accepted; a 60-minute job from 00:30 local on a spring-forward night ends 02:30 local | `tests/property/opening-hours-dst.test.ts` |
| **QS-10** | 2 | **The layering is the ruleset, and the ruleset runs.** `depcruise` over `src/` and `tests/` exits 0, and a planted violation of each of `domain-is-pure`, `sql-only-in-persistence`, `http-must-not-reach-persistence`, `outside-in-tests-do-not-import-src`, `otel-sdk-only-in-platform` and `otel-logs-api-only-in-platform` errors naming that rule. **A ruleset that has never rejected anything is not evidence** | `tests/architecture/layering.test.ts` |
| **QS-11** | 2 | **The error taxonomy is total and stable.** Every row of §8.6 is reachable with that status and `type` as `application/problem+json` — out-of-hours `400` not `409`, an unknown vehicle `422` not `404`, one not owned `422` not `403` — with ADR-0024's ∀responses ∃row hostile corpus beside the ∀rows ∃input sweep, and the emitted OpenAPI document equal to the committed one | `tests/contract/error-taxonomy.test.ts` |
| **QS-12** | 3 | **Ambiguity containment.** Duration arithmetic stays in `duration.ts`, the occupancy interval in `interval.ts`, and wall-clock reasoning — deriving a wall clock or calendar field from an instant, **by any route** — in `openingHours.ts`; seven markers in all. Response measure: **one source file plus one migration**, asserted by scanning the tree | `tests/architecture/ambiguity-containment.test.ts` |
| **QS-13** | 4 | **The window is visible, conflicts are counted, and the line joins the trace.** With an in-memory exporter, a booking that retries once then succeeds gives an `availability.candidates` span **ending before** the first `appointment.insert` begins, exactly two `appointment.insert` spans, the failed one carrying `db.sqlstate=23P01` and `db.constraint`, and `booking_conflicts_total{resource="bay",outcome="absorbed"} == 1` with no `refused` increment. **And the signals are attributable and joined**: against a collector, every trace, metric and log export carries `service.name = keyloop-service-scheduler` — never `unknown_service:node` — and a booking's exported **log record** carries its **own** `traceId`/`spanId` equal to a span that request produced, with a severity matching `pino`'s level | `tests/integration/telemetry-booking.test.ts`, `tests/integration/telemetry-logs.test.ts` |
| **QS-14** | 5 | **A stated budget.** Against 5 bays, 20 technicians and 500 appointments over a week, on the CI container: a **derived-window** availability query **< 200 ms at p95** over 100 runs — the one-day query is unrepresentable once the caller states only a start (ADR-0039), an uncontended booking **< 100 ms at p95** issuing **exactly one** `INSERT`. Deliberately loose — performance ranks last — but stated, a goal with no number being one nobody can fail | `tests/performance/availability-budget.test.ts` |
| **QS-15** | 1 | **No spurious refusal under occupancy, with no concurrency at all.** 12 bays and 12 technicians all qualified for one 60-minute service type — so `|bays| + |technicians| − 1 = 23`, above the cap of 16 — and *k* bay/technician pairs already `confirmed` over the interval: a **single** booking for that interval is **confirmed** for each of **200 distinct seeds** at `k = 11`, and the attempts it makes are **p95 ≤ 2** for every `k ∈ {0, 3, 6, 9, 11}`. QS-3 fixes occupancy at zero and varies only concurrency, so nothing in §10 reached this: measured **165 of 200** on ADR-0009's ordering, the residual §11 R-4 named since slice 04, executed rather than argued | `tests/property/occupancy-does-not-refuse.db.test.ts` |
| **QS-16** | 1 | **No spurious refusal under occupancy *and* contention.** At 12 bays and 12 technicians with *k* pairs pre-booked and *M* of each remaining free, *N* concurrent bookings released from a barrier confirm **exactly `min(N, M)`**, for (N,M,k) ∈ {(20,1,11), (20,4,8), (8,8,4)}. This is the scenario that can **falsify** free-first ordering ([ADR-0040](../adr/0040-order-candidates-free-first-from-one-advisory-read.md)): every racer reads the same never-refreshed snapshot (ADR-0004), so each loser front-loads what the winners just took — ADR-0009's own objection to Order-D, at binary granularity | `tests/concurrency/no-spurious-refusal-under-occupancy.test.ts` |

**What is deliberately not here.** No scenario asserts availability is *fresh* (§6.5) — the property the
design gives up on purpose. None covers authentication, shift modelling or appointment history: §3.3
excludes them and §11 carries them. QS-14 is the only performance scenario.
