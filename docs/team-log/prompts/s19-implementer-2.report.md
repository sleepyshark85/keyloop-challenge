# Report · slice 19 · implementer · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Implement free-first ordering
- Returned: 2026-09-10T10:40:31.014Z
- Duration: 1344s

---

## Summary

**Branch pushed:** `slice/19-attempt-cap-sized-against-occupancy`, commits `56269be` and `2aeeacb` on top of the red commit `076a1ab`.

### Commits

1. **`56269be` — `feat(19): orderCandidates orders free-first from an occupancy snapshot`** (292 lines: `src/domain/candidates.ts`, `tests/unit/domain/candidates.test.ts`, `src/application/attemptLoop.ts`, `tests/unit/application/attemptLoop.test.ts`, `src/application/rescheduleAppointment.ts`, plus the minimal call-site fix in `src/application/bookAppointment.ts`/its test). Lands `OccupancySnapshot`, `EMPTY_OCCUPANCY`, `freeFirst`, and the new 4-arg `orderCandidates` signature exactly as settled (`busy` third, `seed` last; emptiness test over `freeFirst`'s concatenated return, never per-group — P2). `prune`, `nextCandidate`, `mulberry32`, `shuffle` untouched. `attemptLoop.ts`'s `'incumbent'` arm gains `busy`; `rescheduleAppointment.ts` supplies `EMPTY_OCCUPANCY` at its own call site (ruling 5). `bookAppointment.ts` passes `EMPTY_OCCUPANCY` here — a deliberate no-op step (P4), so this commit changes no runtime behaviour. This one is over the ~150-line guideline because the three call sites share one exported signature and an intermediate split would fail `tsc`; noted in the commit message.
2. **`2aeeacb` — `feat(19): bookAppointment reads occupancy once and orders free-first`** (139 lines). Wires `busyResources` into `bookAppointment.ts` via one `Promise.all` alongside `candidateResources`, over `derivation.occupancyStartsAt`/`occupancyEndsAt` (A-19-1), and passes the real `busy` into `orderCandidates`. This is the behaviour change.

`src/persistence/appointmentRepository.ts` and `src/persistence/candidateRepository.ts` untouched, as instructed.

### Red criteria, now green — measured, not simulated

- **AC-1**: **200/200 confirmed** at k=11 (red was 165/200).
- **AC-2**: attempts p95 = **1** (max 1) at every k ∈ {0,3,6,9,11} — bar was ≤2.
- **QS-16** (all 4 tuples): exactly `min(N,M)` newly confirmed — (20,1,11)→1, (20,4,8)→4, (8,8,4)→8, (20,8,4)→8. `capped`/`exhausted` counts recorded per ruling 4, not thresholded. **0 of 2 loopbacks spent.**
- **P6, P8, P9, P10** (property): all pass.
- Full `tests/unit` (567), `tests/property/candidate-ordering.test.ts` (10), `npm run typecheck`, `npm run lint:arch`: all clean.

### T-19-4 verdict (P8/P9 do assert the right thing)

Confirmed by reasoning against my own implementation, not just by their green: P8's sorted-array equality against the `EMPTY_OCCUPANCY` control would fail immediately if `orderCandidates` ever *removed* a busy candidate (Filter-1) rather than reordering it — array lengths would diverge. P9's `null` iff `bays.length===0 || technicians.length===0` (regardless of `busy`) would fail against exactly the bug the architect warned about (a per-group `freeHead === undefined` check, P2's violation) the moment `busy` names every remaining candidate. P10 pins that "superset" case concretely. So their green is real evidence the properties hold, not merely that the interface now exists.

### AC-6 — measured p95s

- Uncontended booking (now carrying the extra `busyResources` call): **p95 = 18.37ms** over 100 samples, budget <100ms.
- Availability query: **p95 = 14.16ms**, budget <200ms.

The architect's "a few ms against a 100ms budget" prediction holds — the whole uncontended request is 18ms.

### OQ-19-1 decision: no dedicated span

`busyResources` gets **no new span**, and rides unspanned — same as its existing, pre-slice-19 behaviour on the `GET /availability` path (`queryAvailability.ts` calls it with no span wrapper either; only `candidateResources` opens `availability.candidates`). This is forced, not merely chosen: `src/persistence/appointmentRepository.ts` is explicitly not-edited in the design, and a span can only be added inside that function. AC-6's measurement backs it up — the added read costs single-digit ms against a 100ms budget, so there's no operational case for instrumenting it even if I could.

### Finding raised (not a DCR — a test-fixture collateral, out of my scope)

`tests/integration/telemetry-booking.test.ts` (test-engineer's slice-09 file) now fails 3 of its assertions: its `SHARED_SEED=7` fixture manufactures a "retry once then succeed" scenario by pre-occupying `bay-0` and relying on ADR-0009's blind shuffle to draw it first anyway. Free-first ordering now *correctly* avoids that occupied bay, so the booking confirms on attempt 1 instead of 2 — `booking.confirmed attempt:1` in the log confirms this exactly. This is the designed behaviour (AC-1's whole point), not a defect in my implementation; every other db-project file (198/201 tests) passes, including QS-16 and the reschedule/cancel/candidate-retry acceptance suites. I have **not** edited that file — it's a stale fixture assumption in another role's file, outside slice 19's stated scope, and needs a deliberate fixture redesign (e.g., a third bay, or two busy candidates) rather than a drive-by patch. Flagging this for the architect/test-engineer to route before `npm test` is clean end-to-end.

Relevant paths: `/home/agentadmin/sources/keyloop-challenge/src/domain/candidates.ts`, `/home/agentadmin/sources/keyloop-challenge/src/application/attemptLoop.ts`, `/home/agentadmin/sources/keyloop-challenge/src/application/bookAppointment.ts`, `/home/agentadmin/sources/keyloop-challenge/src/application/rescheduleAppointment.ts`, `/home/agentadmin/sources/keyloop-challenge/tests/unit/domain/candidates.test.ts`, `/home/agentadmin/sources/keyloop-challenge/tests/unit/application/attemptLoop.test.ts`, `/home/agentadmin/sources/keyloop-challenge/tests/unit/application/bookAppointment.test.ts`, `/home/agentadmin/sources/keyloop-challenge/tests/integration/telemetry-booking.test.ts` (unedited, flagged).

```json
{
  "role": "implementer",
  "outcome": "green",
  "commits": ["56269be", "2aeeacb"],
  "files_changed": 7,
  "unit_tests_added": 14,
  "acceptance_passing": true,
  "depcruise": "pass",
  "objections": [],
  "dcr": null,
  "message": "All five red criteria (AC-1 200/200, AC-2 p95=1, QS-16 all four tuples exact min(N,M), P6/P8/P9) are green with measured figures; AC-6 measured at 18.37ms/14.16ms p95, well inside budget. One collateral, out-of-scope failure found and not touched: tests/integration/telemetry-booking.test.ts's SHARED_SEED fixture assumed ADR-0009's blind shuffle and is invalidated by free-first ordering working as designed — flagged for test-engineer, not fixed by me."
}
```
