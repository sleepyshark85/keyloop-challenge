# Report · slice 07 · test-engineer · invocation 4

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 07 loopback red
- Returned: 2026-09-07T00:20:37.500Z
- Duration: 1806s

---

## Report

```json
{
  "role": "test-engineer",
  "outcome": "red-committed",
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": 1},
  "quality_scenarios_covered": ["QS-4"],
  "red_commit": "b555317",
  "ci_failure_confirmed": true,
  "objections": [],
  "dcr": null,
  "message": "AC-5 is red for the intended reason (pg_locks shows only the stale pair's advisory keys, never the current pair's), confirmed by red-proof and stable across every local run; AC-4's mutant control is re-aimed per R-07-4 and its own unfixed-build rate rose 2-4x under the bounded shape, as the architect predicted."
}
```

**CI**: run https://github.com/sleepyshark85/keyloop-challenge/actions/runs/34069381994 — `suite (Testcontainers)` failed (db project: 1 of 19 files failed), `red-proof` succeeded with `red observed: tests/concurrency/refused-move-leaves-original.test.ts failed, no unit test failed, and verify concluded success`. `npx tsc --noEmit` is clean, so this is a genuine assertion failure, not a compile error.

**What changed**: `/home/agentadmin/sources/keyloop-challenge/tests/concurrency/refused-move-leaves-original.test.ts` only. No `src/`, no `tests/unit/`.

**AC-4's re-measurement, as asked.** The architect's prediction is confirmed, not falsified. `RACE_COUNT` dropped from 20 to 5 so `movers.length` (10) never exceeds pg's unconfigured pool default (10, D-07-1); `TRIAL_COUNT` rose to 100 to hold 1000 total attempts. Re-measured the pre-ADR-0030 build (`783f323`, via a throwaway `git worktree`) at this bounded shape, three runs of 1000 attempts: **20, 23, 13 `40P01`** — 56/3000 ≈ **1.87%** (95% CI ≈1.38%–2.35%) — against the previously-measured unbounded shape's 41/7800 ≈ 0.5% (CI ≈0.27%–0.80%). The intervals don't overlap; the rate roughly doubled to quadrupled. A positive control (same bounded shape against the current ADR-0030-fixed build) measured 0/1000, confirming the harness discriminates rather than always firing. I did not find a case for the extra-round-trip explanation — queue-serialization is the better account. AC-4 itself stayed green throughout (ADR-0030 already ships), so this is a stronger control, not a new failure.

**AC-5's determinism, in practice and not just principle.** I ran it 3 consecutive times locally plus once more inside the full `tests/concurrency/` suite and once more inside the full `db` project (5 runs total) — identical failure every time, same message, same P1-held/P2-absent lock set. It is choreographed with two ordinary PostgreSQL locks (a `SELECT … FOR UPDATE` holder that relocates the row while holding it, and an uncommitted blocker occupying attempt-1's target), never a timing race, with explicit park-probes that fail the ARRANGE step loudly if the intended interleaving is ever missed. I also validated the mechanism itself with a throwaway script before writing the committed test (confirmed the two park points and the exact lock set independently). I'm confident this is deterministic, not merely "usually passes."

**The second-red question, as asked.** I think a second red is right here, and better than the alternative. §7's "exactly one red commit" is written for the ordinary path where step-1 design and step-3 tests are settled together; a loopback that reopens steps 1–4 over a *design* defect (not the implementer's build) is a different situation the rule doesn't contemplate, and the two candidates are (a) amend the first red commit's tests in place, losing the record that AC-4's original shape was itself measured and superseded for a reasoned cause, or (b) a second red commit that carries its own reasoning and its own CI-observed failure, at the cost of the rule's letter. I'd rather have the git history show *why* the criteria changed than have one commit silently rewritten to look like it was always right — that history is exactly what `docs/adr/0030-…md` and `0031-…md` already do for the design side, and step 3 evidence deserves the same standard. If the rule is meant literally, I'd amend it to "exactly one red commit per *design*" rather than per slice.

**Other findings**: none beyond what's already recorded in `07-design.md` §11. I did not touch `docs/slices/`, `docs/arc42/`, or `docs/adr/` — those are the architect's and the orchestrator already landed the two new/amended criteria in the slice file before dispatch.
