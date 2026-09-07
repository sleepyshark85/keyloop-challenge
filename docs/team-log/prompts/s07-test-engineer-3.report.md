# Report · slice 07 · test-engineer · invocation 3

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Fix AC-4 vacuity gaps
- Returned: 2026-09-06T19:28:13.610Z
- Duration: 584s

---

```json
{
  "role": "test-engineer",
  "outcome": "revised",
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": 0},
  "quality_scenarios_covered": [],
  "red_commit": null,
  "ci_failure_confirmed": null,
  "objections": [],
  "dcr": null,
  "message": "Step-5 remediation on tests/concurrency/refused-move-leaves-original.test.ts, not a new red: R-07-3, R-07-5, R-07-6 and R-07-11 fixed in commit 6d1db61, plus a self-caught follow-up in 02a5d9b, both pushed. Both concurrency files re-run three times against the current green tree (real PostgreSQL via Testcontainers) and stayed green throughout; R-07-4 left untouched per instruction."
}
```

Commits: `6d1db61` and `02a5d9b` on `slice/07-reschedule-under-contention`, both `test(07):` (not `(red)` — the one red commit stays `e030f52`). File touched: `/home/agentadmin/sources/keyloop-challenge/tests/concurrency/refused-move-leaves-original.test.ts`.

**What each assertion now measures that it did not:**

- **R-07-3** — `expect(succeededCount).toBe(0)`: the header's "neither move can ever succeed" was argued, never measured. Now a fixture regression that lets any mover succeed at attempt 1 fails the run instead of passing green with a smaller effective sample. This also pins `refusedCount` at 1600 by arithmetic (`badAnswers` is already required empty, so 200/409 partition the total).
- **R-07-5** — `conflicts.filter(c => Number(c.attempt) >= 2).length >= RACE_COUNT * TRIAL_COUNT * 2`: the old pair (`max(attempt) >= 2` and total `conflicts.length >= 1600`) was satisfiable by one mover reaching attempt 2 and 1599 lines sitting at attempt 1. The new count directly asserts the claimed fact — all 1600 attempts individually reach attempt ≥ 2 — closing the heterogeneous-shortfall gap the max/floor pair couldn't see.
- **R-07-11** — `logRecords()` replaced with `awaitLogRecords`, adopting the drain convention `no-spurious-refusal.test.ts` already uses. First pass used a floor of `RACE_COUNT * TRIAL_COUNT * 2`, which I caught on my own re-check: that floor is fully satisfied by attempt-1 lines alone from earlier trials, so it could resolve — and the whole drain call return — before trial 39's attempt-2/deadlock lines had arrived at all, passing the call without draining the trial R-07-11 is actually about. Corrected the floor to `* 4` (the full attempt-1 + attempt-2 population a correct, non-deadlocking, non-succeeding build owes), so the wait genuinely covers the last trial. A defective build that can't reach `* 4` falls through to the 10s bound as a passive wait, same trade-off `no-spurious-refusal.test.ts` accepts for its own unsatisfiable-predicate branch.
- **R-07-6** — header no longer states a bare 0.034% point estimate. It now states the 95% binomial interval on 41/7800 (~0.27%–0.80%), shows the lower-bound false-pass rate at 1600 attempts (~1.3%, 38× the headline, worse than the 0.67% the 25→40 raise was meant to fix) alongside the same bound at 1000 attempts (~6.7%), and concludes the raise is still correct — cutting the worst-case risk roughly 5×, just not to the value the point estimate implied.

**Corrected false-pass interval:** 95% CI on 41/7800 ≈ **0.27%–0.80%** (vs. the retracted single point of 0.034%). At the lower bound, the false-pass probability at `TRIAL_COUNT = 40` (1600 attempts) is **≈1.3%**, versus **≈6.7%** at the AC's floor of 25 trials (1000 attempts) — so the raise from 25→40 remains justified, just not to the degree the original headline claimed.

**What the reviewer's findings turned up that it did not itself name:** while implementing the R-07-11 fix, my first attempt used the wrong drain floor (`* 2` instead of `* 4`) — technically "adopting the convention" as instructed, but not actually closing the gap the finding describes, since that floor is satisfiable by attempt-1 lines alone from earlier trials and could let `awaitLogRecords` return before the last trial's attempt-2/deadlock lines had arrived. Caught this on my own re-verification pass before finalizing and corrected it in a follow-up commit (`02a5d9b`) rather than leaving the weaker fix in place — the same self-check discipline T-07-5 and R-07-9 already established for this slice, applied to my own repair this time.
