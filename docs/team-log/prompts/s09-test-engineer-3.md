# Prompt · slice 09 · test-engineer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Apply architect's ruling to two integration/contract tests
- Sent: 2026-09-07T20:15:22.154Z

---

Slice 09, step 4 (GREEN), still in progress. The architect has ruled on two DCRs I (the implementer) raised. Both remedies are concrete and already decided — please apply them exactly, don't re-adjudicate. See `docs/slices/09-design.md`, the new "## Step 4 adjudication" section (findings `I-09-2` and `I-09-3`), for the architect's own words. Summary:

## Fix 1 — `tests/integration/telemetry-booking.test.ts`, `seedRetryOnceFixture` (ruling `I-09-2`, outcome (a))

The architect's exact words: "**The seed transfers; the fixture never did.** Bays are read `ORDER BY name`, technicians `ORDER BY id`, so which technician the blocker sorts to is a per-namespace coin-flip. Seed 7 is right where it was measured, wrong in `ac1-telemetry-retry-once`, where the blocker is drawn at the head and pruning the bay leaves it there. **Delete `technicianIds[1]`'s qualification.** The blocker stops being a candidate, the technician list is `I-04-10`'s permutation-safe singleton, only the bay draw decides, and `SHARED_SEED = 7` holds: `bay -> 201` across five namespaces."

Concretely: in `seedRetryOnceFixture` (near the top of the file), after seeding the scenario and occupying the blocker (`bayIds[0]` occupied by `technicianIds[1]` for `at(0)`..`at(60)`), remove `technicianIds[1]`'s qualification for the scenario's service type — so it is no longer a candidate at all, and the technician list going into `orderCandidates` is the single remaining qualified technician. Look at `tests/support/booking.ts` for how `seedScenario` seeds `technician_qualification` rows and for any existing helper to remove one (or write the `DELETE FROM technician_qualification WHERE technician_id = $1 AND service_type_id = $2` directly against the `client` passed to `seedRetryOnceFixture`, matching this file's existing style for `occupy`/direct queries). Do NOT touch `SHARED_SEED = 7` — the architect's ruling is explicit that the seed is right and the fixture was wrong.

After the fix, verify (I already have Docker running, a compiled `dist/`, and this measured independently, so this should reproduce): `npx vitest run --project db tests/integration/telemetry-booking.test.ts` — specifically AC-2 (exactly two `appointment.insert` spans) and AC-3 (`booking_conflicts_total{resource=bay,outcome=absorbed}` == 1, no `refused`) should now pass. The other 8 cases in that file already pass and must keep passing.

## Fix 2 — `tests/contract/error-taxonomy.test.ts` (ruling `I-09-3`, outcome (a))

The architect's exact words: "AGREE. `AC-6b` superseded this pin **by name**: *'rather than the 400 slice 05's AC-5 pins today'* — `error-taxonomy.test.ts:590`... An empty body is no longer malformed: it leaves `MALFORMED_BODIES`, pinned at `404 /problems/appointment-not-found` on a never-booked id. Unparseable stays `400`."

Concretely: in the test case `'AC-5 — and on the cancellation route, the same two bodies are 400 /problems/malformed-request'` (around line 588 in the current file — search for `MALFORMED_BODIES` used against the cancellation route), split the loop: the **empty-body** case (`undefined`) against the never-booked id (`uuidFor('ac5-cancel-malformed', 'never-booked')`) now expects **404 `/problems/appointment-not-found`**, not 400 — it has left `MALFORMED_BODIES` for this route (the content-type parser no longer rejects it; the route runs and correctly reports the id was never booked). The **unparseable-body** case (`'{oops'`) is unchanged — still 400 `/problems/malformed-request`, and its own assertion/comment (already correct) stays. Update the test's own comments/docblock to reflect this (the current comment says "A 404 would mean the parser stopped running first, which no version of this fix should cause" — that reasoning no longer holds for the empty-body sub-case specifically, since AC-6b's actual remedy maps an empty body to `undefined` rather than rejecting it, so the route legitimately runs and answers on the merits).

Verify: `npx vitest run --project db tests/contract/error-taxonomy.test.ts` — all 10 cases should pass (currently 1 fails: exactly this one).

## Constraints

- These are your files (`tests/integration/`, `tests/contract/`) — you own them, I (implementer) do not and did not touch them.
- Do not touch anything under `src/`, `tests/unit/`, or any other test directory.
- Do not re-litigate the architect's ruling — both are already decided (a), apply the stated remedy.
- Small, focused diffs. If you find the exact remedy described doesn't quite fit the current file shape, adapt it minimally to the same intent (delete-the-qualification for fix 1; split-the-loop-by-status for fix 2) and note what you changed and why in your report.

Report back: which files you changed, the diff summary, and the two test files' pass/fail counts after your fix (`npx vitest run --project db tests/integration/telemetry-booking.test.ts tests/contract/error-taxonomy.test.ts`).
