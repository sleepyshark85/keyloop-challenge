# Report · slice 04 · test-engineer · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 04 step 3 RED
- Returned: 2026-09-06T06:40:19.752Z
- Duration: 1524s

---

Step 3 is done. Red committed, observed in CI, classified as a red proof.

**Red commit `1ea3223`** · CI run [34016955557](https://github.com/sleepyshark85/keyloop-challenge/actions/runs/34016955557) — `verify` **success**, `test` **failure**, `red-proof` **success**:

> `red observed: tests/property/candidate-ordering.test.ts, tests/acceptance/candidate-retry.test.ts, tests/concurrency/no-spurious-refusal.test.ts failed, no unit test failed, and verify concluded success`

## File-by-file

| File | AC | Cases | Red at CI |
|---|---|---|---|
| `/home/agentadmin/sources/keyloop-challenge/tests/concurrency/no-spurious-refusal.test.ts` | AC-1, AC-2 | 5 | 3 |
| `/home/agentadmin/sources/keyloop-challenge/tests/acceptance/candidate-retry.test.ts` | AC-3, AC-4, AC-5, OQ-04-1 | 6 | 6 |
| `/home/agentadmin/sources/keyloop-challenge/tests/property/candidate-ordering.test.ts` | AC-5 (pure) | 7 | 7 |
| `/home/agentadmin/sources/keyloop-challenge/tests/support/service.ts` | — | `bookingSeed?: number` → `BOOKING_SEED`, narrow, not a general env hatch | — |
| `/home/agentadmin/sources/keyloop-challenge/tests/support/booking.ts` | — | `refusalRecords`, `describeLoopLines`, `confirmedOverlapping`, `blockPairs` | — |

One extra commit precedes it, `6e5f7b5` — see the finding on `docs:check` below.

## C1, verified from the CI artifact

488 tests, 16 failed, 472 passed. **Every failure is an `AssertionError` inside a collected test body; 0 collection/load errors; 0 failing files under `tests/unit/`.** The property file's seven failures each read `dist/domain/candidates.js did not load, or does not export orderCandidates` — the computed-URL dynamic import inside the test body, per slice 01's precedent.

## Green at the red — named, including one nobody asked about

- **AC-1 (8,20) — green in full.** No refusals are owed, so no new-behaviour assertion applies to it. It is a regression guard (M3/M4/M5/M11 all kill it in the model), not evidence for this slice.
- **AC-2 (20,8) — green in full.** The witness, the status split and the `25P02` absence all already hold; the design's §1 table says AC-2 holds already. This is the useful half: **E2 (`max(attempt) >= 2`) was observed green at red**, so it is not a vacuous assertion — it is a live one that Option D fails.
- **The other three AC-1 cells: green up to the refusal line.** Split, media type, problem type, `resource`, table count, distinct bays/technicians, id-correspondence and E1 (constraint names) all passed; the failure is `A5` (`booking.refused` absent). E3 and E2 in those cells are therefore *unreached*, not green.
- **AC-3 both halves, AC-4/16: green up to the refusal line.** The conflict counts, constraint names and attempt numbering all held — including the technician half landing on exactly the `exhausted/technician/4` I predicted.
- **AC-5's `F2` (same seed → same pair) is green at red, vacuously**, because the current build orders deterministically. That is precisely the trap; `F3` (five seeds must not all agree) is what reddens it and is the Order-A killer.

## Mutants — named and run

A model of arc42 §6.2's loop, §8.2's constraints, §4's two log lines and §3's module, with my committed predicates transcribed onto it. Baseline **survives every assertion**; all 15 mutants die.

| Mutant | Killed by |
|---|---|
| M1 no retry | 28 assertions / 7 cases |
| **M2 Option D — per-dealership mutex** | **16 / 6 — via `A7` (attempts ∈ [M, 2M−1]), `A9`/`W1` (attempt ≥ 2) in (5,3) and (20,8), and AC-3/AC-4** |
| M3 prune the wrong list | 21 / 8 |
| M4 no prune | 28 / 8 |
| M5 prune the pair, not the resource | 17 / 6 |
| M6 cap off-by-one (`>`) | 2 / 1 — AC-4/17 only |
| M7 cap is 8 | 5 / 3 |
| M8 tie resolves to `capped` | 1 / 1 — AC-4/16 only |
| M9 no cap | 2 / 1 — AC-4/17 only |
| M10 Order-A, seed ignored | 3 / 2 — AC-5 `F3`, property `P6` |
| M11 one transaction around the loop | 30 / 7 — including `W2`, `W3` |
| M12 constant seed source | 2 / 2 — AC-5 `F3`, OQ-04-1 `G2` |
| M13 prune reshuffles survivors | 1 / 1 — `P5` |
| M14 order is not a permutation | 13 / 7 |
| M15 `booking.refused` never written | 10 / 8 — this is the observed red |

**M2 is not killed by (2,1)** — it passes there with `attempts = 1`, which is correct at M = 1. Your control/discriminator distinction is reproduced by the harness, not just quoted. Harness at `/tmp/claude-1000/-home-agentadmin-sources-keyloop-challenge/bf0a061e-03e3-4edb-be4f-6269c9fa32ca/scratchpad/mutants.mjs`.

## The thing you would not let be lost

Held. Each AC-1 cell with a refusal asserts, beyond the counts: **E1** every `booking.conflict` names `no_bay_overlap` or `no_technician_overlap` and there are at least `refused × M` of them; **E2** `max(attempt) >= 2` (M ≥ 2 only); **E3** every `booking.refused` reports `attempts ∈ [M, 2M−1]`. Option D dies on E2 and E3.

## Things I still cannot assert

1. **`BOOKING_SEED` cannot force a *chosen* ordering, only a *fixed* one.** Predicting which seed yields which permutation requires reading `src/`. So ADR-0021 buys reproducibility, not steerability — a narrower handle than the ADR describes. Consequence: AC-3's technician case pins the outcome and the technician-conflict count but **not** the attempt count (2–4, all three reachable).
2. **AC-3 and AC-4 turned out not to need the seed at all.** Every fixture is a terminal-state argument (block *all* technicians and the technician list is the one that must empty under every permutation), so ADR-0021's justification survives on AC-5 and OQ-04-1 alone. Reported rather than quietly enjoyed; §5's list of what it makes forceable is now wider than what it was needed for.
3. **D-04-1's spurious-refusal leg** (T-04-3) — the 17-bay `capped` fixture is the standing partial, and it does falsify ADR-0009's "a non-zero cap-exceeded counter means the cap is wrong".
4. **D-04-2** — an outside-in test cannot see whether the cap was tested inside the `23P01` arm. That is `tsc` and `contended-resource-cast`, not me.
5. **OQ-04-1 half-closure taken.** Two refusals, one process, two seeds, P(false failure) = 2⁻³². I added the mirror — `BOOKING_SEED=424242` must log *that* seed twice — which pins the knob to the log. **What it still does not close:** uniformity (two samples cannot); and on the *unset* path nothing proves the logged seed is the one the ordering consumed — only that it varies. AC-5 pins seed→ordering on the *set* path only.
6. AC-4's "visible in telemetry" is asserted through the log line only; `booking_conflicts_total{outcome="capped"}` is slice 09.

## Two findings for you

- **T-04-5 — arc42 contradicts itself on the cap's environment variable.** §5.2 says `ATTEMPT_CAP`, §7's env table says `BOOKING_ATTEMPT_CAP`. §4 says arc42 wins over a slice file, but here arc42 disagrees with arc42, so the architect must rule. My red does not depend on it (T-04-2 runs at the default); the implementer's `loadConfig` unit assertion does. §7 also does not list `BOOKING_SEED` at all.
- **`npm run docs:check` was failing at HEAD before I touched anything**, stale since `ee868c3` (the scribe edited `docs/arc42/13-ai-collaboration.md` without rebuilding the assembly). That would have failed `verify` and made `red-proof` classify this as *a broken run rather than a red proof* — destroying the §2.4 observation. I regenerated the generated-tier file mechanically in a **separate** commit `6e5f7b5` (one derived summary line; no section file, ADR or slice file touched) so the red commit stays tests-only. Worth a hook or a note to the scribe: nothing currently stops a docs commit from silently disarming the red-proof discriminator.

```json
{
  "role": "test-engineer",
  "outcome": "red-committed",
  "tests_added": {"acceptance": 6, "contract": 0, "property": 7, "concurrency": 5},
  "quality_scenarios_covered": ["QS-3"],
  "red_commit": "1ea3223",
  "ci_failure_confirmed": true,
  "objections": [],
  "dcr": null,
  "message": "16 assertion failures across three files in CI run 34016955557, verify green, red-proof success, zero load errors and zero unit failures. All five AC covered; AC-4 at the shipped cap of 16 with both exits and the tie; AC-1 carries the constraint-naming, attempt-depth and attempt-range evidence that kills ADR-0004's Option D, verified against a 15-mutant model in which the baseline survives everything. Green-at-red named: AC-1 (8,20) and AC-2 entirely, AC-5's same-seed half vacuously."
}
```
