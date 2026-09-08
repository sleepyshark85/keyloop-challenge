# Report · slice 09 · test-engineer · invocation 3

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Apply architect's ruling to two integration/contract tests
- Returned: 2026-09-07T20:27:23.046Z
- Duration: 719s

---

## Summary

**Files changed** (both mine — `tests/integration/` and `tests/contract/`):
- `/home/agentadmin/sources/keyloop-challenge/tests/integration/telemetry-booking.test.ts`
- `/home/agentadmin/sources/keyloop-challenge/tests/contract/error-taxonomy.test.ts`

### Fix 1 — `seedRetryOnceFixture` (I-09-2)

Applied the architect's ruling — delete `technicianIds[1]`'s qualification for the scenario's own service type so it's never a candidate — but the literal sequence in the ruling (occupy first, then delete) hits a real schema constraint the ruling didn't name: `appointment_technician_qualified` is a composite FK (`appointment(technician_id, service_type_id) → technician_qualification`, arc42 §8) with no `ON DELETE CASCADE`. Deleting the qualification while the blocker's own appointment still references that exact pair is rejected by Postgres (measured, confirmed empirically before fixing).

Adapted, same intent: delete the qualification for `scenario.serviceTypeId` **before** any appointment exists to reference it, then re-qualify `technicianIds[1]` under a throwaway service type and book the blocker appointment (direct SQL insert, same columns `occupy()` used) against that throwaway type instead. `no_bay_overlap` / the technician equivalent key only on `bay_id`/`technician_id` + time range, never `service_type_id`, so the blocker still occupies bay 0 and busies `technicianIds[1]` for the same window. Net effect matches the ruling exactly: `technicianIds[0]` is the sole qualified technician for the scenario's real service type (I-04-10's permutation-safe singleton), `SHARED_SEED = 7` untouched. Removed the now-unused `occupy` import, added `uuidNamespaceOf`.

An independent agent proposed instead importing `src/domain/candidates.js` directly into this test to compute the shuffle deterministically. I declined and replied explaining why: it violates the test-engineer's "never read/import src/" independence rule and the black-box constraint (CLAUDE.md §5, my role file) — doing so would make the test assert the implementation agrees with itself rather than verify it.

### Fix 2 — `error-taxonomy.test.ts` (I-09-3)

Split the single "same two bodies are 400" cancellation-route test into two: unparseable body stays 400 `/problems/malformed-request` (unchanged); empty body is now its own test asserting 404 `/problems/appointment-not-found` on the never-booked id, since AC-6b routes an empty body to `undefined` rather than rejecting it. Updated the case's inline comment and the file's larger AC-5 historical docblock to record this supersession.

### Verification

```
npx vitest run --project db tests/integration/telemetry-booking.test.ts tests/contract/error-taxonomy.test.ts
Test Files  2 passed (2)
     Tests  21 passed (21)
```
`telemetry-booking.test.ts`: 10/10 passing (AC-1 through AC-6 all green). `error-taxonomy.test.ts`: 11/11 passing (10 original cases, with AC-5's cancellation case now split into 2, per the ruling). `tsc --noEmit` is clean. No changes made under `src/`, `tests/unit/`, or any directory outside my ownership.
