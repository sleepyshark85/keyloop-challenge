# Report · slice 16 · test-engineer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 16 step 2 review
- Returned: 2026-09-10T01:14:09.298Z
- Duration: 269s

---

## Verdicts — slice 16, step 2

**1. AC-5/QS-8 separation — AGREE, implementable, and I named the mechanism.**
`seedScenario`'s `durationMinutes` option and `Scenario.durationMinutes` already exist (`tests/support/booking.ts:82,94`) — the generator swaps its arbitrary `windowDurationMinutes` for an arbitrary `durationMinutes` passed into `seedScenario`, uses it only to *aim* boundary items (mechanic 5) and the witness (mechanic 6), and reads the probe interval from `member(answer1,'startsAt'/'endsAt')` instead of computing `windowEnd`. All six mechanics survive in kind:
- Mechanics 1 (savepoint), 2 (23P01 exactly), 3 (quiescence witnessed), 4 (directions counted apart) are untouched — none of them look at how the interval was obtained.
- Mechanic 5 (boundary bias) moves from "generate items ending at `from`/starting at `to`" to "generate items ending at derived-start/starting at derived-end," computed from the same known `durationMinutes` the fixture was seeded with. That's exactly ruling 2's aiming/probing split.
- Mechanic 6 (cancelled witness) places itself inside `[derived-start, derived-end)` the same way, by the same allowed aiming.

Nothing stops working. The one real change in what's *randomized*: window duration was previously the client's free choice; now it's a fixture parameter, which is the correct reflection of the slice's thesis.

**2. AC-2 sufficiency — AGREE, it is exactly the right assertion, and I can name a mutant it doesn't catch (jointly with AC-5) — but it's an acknowledged equivalence, not a gap.**
AC-2 is falsifiable as a plain two-HTTP-call string comparison. Since both routes call the same `deriveInterval` with the same inputs, AC-2 can only fail on a *wiring* bug (one route serializing a different value than what derivation returned), which is precisely what it's for.
Mutant that survives both: the design itself names the seam — "the busy read uses the derivation's **occupancy** interval… the response names the **appointment** interval… A-4 makes them identical today." A mutant that swaps which of `interval`/`occupancy` feeds the response versus which feeds `busyResources` inside `queryAvailability.ts` is undetectable by AC-2 (both still equal `deriveInterval`'s single call) and by AC-5 (the probe still matches what's used for busy-checking, since the two values are numerically identical). This isn't a defect in the ACs — it's a live equivalent-mutant condition that the design already flags as the thing A-4 will change. Worth a code comment at step 4, not a test-engineer objection.

**3. AC-4's five shared failures — AGREE, all five are reachable, none requires mocking. A-16-2 is confirmed, not withdrawn.**
`tests/contract/error-taxonomy.test.ts:402-467` already reaches `500 /problems/internal` for booking through `seedScenario(client, name, { timeZone: 'Not/AZone' })` — a real row with an unparseable IANA zone, no mock. Since `queryAvailability` will call the same unedited `deriveInterval`, the identical fixture reaches `reference-data-invalid → 500` for availability once the route's new switch arm exists. The other four (unknown dealership, unknown service type, unrenderable instant, outside-opening-hours) are all trivially reachable by existing patterns already used for booking. Precedence (`{unknown dealership, unusable startsAt} → 422`) falls out of the design's own statement-order ruling (dealership check before `deriveInterval`), confirmed against `bookAppointment.ts:210-215` which already orders it that way. I'm dropping A-16-2's caveat rather than carrying it forward — the row does not need withdrawing.

**4. AC-6/QS-14 — AGREE, worth measuring, and "record the number" is a real, failing criterion.**
It's not just academic bookkeeping: rerunning the budget against the refactored code path is a regression guard against an accidental N+1 or an extra reference read from the new opening-hours gate. And "record the number" is exactly as testable as AC-15 already is in this same file (`tests/performance/availability-budget.test.ts:312-331`) — a regex assertion against `docs/arc42/11-risks-technical-debt.md` for a p95 figure plus machine class, following that existing precedent mechanically.

**5. The red set — AGREE, achievable in one commit, and I checked each AC fails for the right reason.**
AC-1 (acceptance, endpoint doesn't accept `startsAt` yet), AC-2 (200 lacks `startsAt`/`endsAt` fields, or 400 for the still-required `from`/`to`), AC-3 (contract, current document still has three wrong params), AC-4 (availability's status/type/order don't match booking's yet), AC-5 (property, `getAvailability` calls 400 before any probe runs), AC-6 (performance, endpoint shape mismatch or missing arc42 figure) — every one fails on a missing feature or missing documentation, never on a type error or an uncaught exception. One commit spanning `tests/acceptance/`, `tests/contract/`, `tests/property/`, `tests/performance/` matches existing precedent in this repo (slice 09's telemetry work already spans contract+performance together).

**6. Ambiguity — none I'd have to guess at.** Field names (`startsAt`/`endsAt`) are pinned this time, unlike slice 08's keyword-matched disclaimer, so no naming assumption is needed. The one underspecified combination — `from`/`to` sent *alongside* a valid `startsAt` — I'll leave untested since AC-3 only states the `from`+`to`+no-`startsAt` case, and the three-literal-split's `additionalProperties:false` (design table, row 1) already makes the wider case fall out for free; inventing an assertion for it would be me setting the contract, not the architect.

**F-16-1 — CONFIRM workable, no objection.** Of the seven `tests/` citations of retired ADR-0032, four are in `tests/unit/` (implementer's), and the remaining three are the two in `tests/property/availability-agrees-with-constraint.db.test.ts` (lines 20, 69) and... two in `tests/acceptance/availability.test.ts` (lines 22, 52) — both files I am already substantially rewriting for this slice, so all of my citations get fixed as ordinary step-3 work.

One non-blocking note: `tests/support/booking.ts`'s `AvailabilityQuery`/`getAvailability` (currently `from`/`to`) is shared infra I'll need to reshape to `startsAt`. I checked — the only implementer-owned unit test that imports `tests/support/booking.ts` (`tests/unit/http/appointments.test.ts`) does not use `getAvailability`, so this is a clean, uncontested edit.

```json
{
  "role": "test-engineer",
  "outcome": "agreed",
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": 0},
  "quality_scenarios_covered": [],
  "red_commit": null,
  "ci_failure_confirmed": false,
  "objections": [],
  "dcr": null,
  "message": "Design agreed on all six points; no objection raised. Confirmed AC-4's 500 row is reachable via the existing timeZone: 'Not/AZone' fixture (A-16-2 holds), confirmed AC-5's aiming/probing split is implementable via seedScenario's existing durationMinutes option, and named one acknowledged equivalent-mutant condition (appointment vs occupancy interval, tied to A-4) rather than a defect."
}
```
