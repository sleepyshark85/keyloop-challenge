# Prompt · slice 09 · implementer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 09 remediation — implementer
- Sent: 2026-09-07T21:41:27.456Z

---

# Slice 09 · (c) remediation — the non-contract half

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/09-observability`, PR #20. Pull first — the adjudication is at `92d78bb` and its table, with an owner named on every remedy, is in `docs/slices/09-design.md` § "Step 5 adjudication". **Read that table before anything else.**

The reviewer blocked with fifteen findings and the architect ruled **(c) — design defect**, the first of the project. Loopbacks are now **1 of 2**.

**Scope of this dispatch.** The contract half — AC-9's media type, A-06-2's assertion, the harness — is **on hold** pending a human scope ruling (`A-09-4`: the architect recommends reopening slice 10 for it). **Do not touch those.** Everything below is needed whichever way that goes.

## Your work

**1. `src/platform/telemetry.ts` — §8.4 and `src/` must agree (`R-09-9`).** §8.4 declares two spans (`booking.validate`, `appointment.cancel`) and two histograms (`bookingAttempts`, `availabilityQueryDurationSeconds`) that the merged code **never emits**. `lazyHistogram` can be deleted wholesale with nothing noticing. The architect's ruling is **two implemented and two deleted** — the table says which. An operator wiring a panel on `booking_attempts` currently gets an empty series with no error, and §8.4's own note calls that metric's tail the answer to the question §11 R-1 asks.

**2. Two `.add` sites in one file (`R-09-11`).** `attemptLoop.ts:185` and `:224` are **two** increment sites, which decision 2's own wording forbids and whose file-granular marker could never see. The architect found this while checking the reviewer's falsification — the control was blind to a violation already in the code it guards. Make it one. The test-engineer is anchoring the marker to the counter in parallel.

**3. The three sub-threshold files (`R-09-3`, `R-09-4`, `R-09-5`, `R-09-14`).** **No §10 override is being taken this time.** The architect read the survivor report rather than the summary and put the arithmetic in the design:
- **`server.ts` → 0.80** — read `doc.info` and `doc.openapi` in `tests/unit/http/availability.test.ts`, which **already calls `buildOpenApiDocument()`** and today reads only `paths['/availability']`. Seven survivors die from a test that already exists.
- **`telemetry.ts` → past 0.75** — an in-memory `MeterProvider` read before the first `.add()`.
- **`attemptLoop.ts` → 0.89** — an in-memory span exporter.
- `R-09-14`: `FST_ERR_CTP_EMPTY_JSON_BODY` is dead code AC-6b left behind. **Delete it; do not write a test for unreachable code to move a number.**

`R-09-4`'s `capped` label is reached by neither suite: unit tests drive the capped exit but the lazy counter is a no-op with no `MeterProvider`, and the telemetry tests can read the counter but `DEFAULT_ATTEMPT_CAP` is 16 against fixtures with one or two bays. An in-memory `MeterProvider` in a unit test is what closes that.

**4. `DB_POOL_MAX` (`R-09-10`).** The remedy was **inverted**: the test cannot *derive* the ceiling without breaching ADR-0013's outside-in rule, so it **dictates** it. Add the env var support in `src/persistence/db.ts` beside `CONNECTION_TIMEOUT_MS`; the test-engineer sets it.

## Discipline

- `src/` and `tests/unit/` only. **Do not touch** the outside-in directories — the test-engineer is working them in parallel. Raise a DCR if a test is wrong; you did that twice this slice and both were ruled (a).
- Every commit green, small, `(09)`, **explicit pathspecs**.
- **Measure, do not project.** When you are done run Stryker file-scoped on the three files and report the numbers. The architect's figures are projections; the last time it projected one you disproved it with a live harness.

## Return

The structured report with the **measured** per-file scores for `telemetry.ts`, `attemptLoop.ts` and `server.ts`, which §8.4 metrics you implemented versus deleted, and anything in the adjudication table you think is wrong.
