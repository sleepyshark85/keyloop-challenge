# Report · slice 07 · test-engineer · invocation 5

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Fix AC-5 comparison in SQL
- Returned: 2026-09-07T00:53:18.818Z
- Duration: 683s

---

All three assertions pass, everything else in `tests/concurrency/` is unmoved (6 files / 15 tests green), typecheck is clean, and CI on the pushed branch (`docs, tools and log integrity`, `suite (Testcontainers)`, `red-proof`) is all green.

**What changed** — `/home/agentadmin/sources/keyloop-challenge/tests/concurrency/refused-move-leaves-original.test.ts`, AC-5 section only:

- Removed the JS-side `hash()` helper and the four `hashtext(...)` calls whose results (`p1BayHash`, `p1TechHash`, `p2BayHash`, `p2TechHash`) were compared against `pg_locks.objid` after both crossed into JavaScript — the defect: `hashtext` is a signed `int4`, `pg_locks.objid` is the unsigned `oid` Postgres stores it in, so `4083001586 (objid) === -211965710 (raw hashtext)` was false even while the lock was genuinely held.
- Replaced it with one SQL statement: a `VALUES` list of the four candidate resource ids joined against `pg_locks` on `l.objid = hashtext(c.resource_id::text)`, computed in that same statement. It returns the resource ids (UUIDs) that are actually held, never a raw hash or `objid`. JS now only ever compares UUID strings.
- `heldResources.has(p1Bay) / has(p1Tech)` is the positive witness (unchanged in intent); `heldResources.has(p2Bay) / has(p2Tech)` is the AC-5 claim itself, and it now passes.
- The two-lock choreography (park on `holder`'s `FOR UPDATE`, relocate A under that lock and commit, park a second time on `blocker`'s uncommitted row, read the lock set, release `blocker`, await completion) is untouched — only the comparison at step 4 moved.
- Retired A-07-4: the file header no longer restates the falsified "extra round trip" account of the low deadlock rate beside the number that superseded it; it now names the cause the R-07-4 re-measurement found (queue-serialisation causing under-racing at the unbounded shape) without repeating the old theory's content.
- Left the AC-5 slice-file parenthetical ("`classid`/`objid` against `hashtext`") alone, per the ruling — that's the architect's as-built correction at step 7.

Verification run locally: `npm run build`, `npm run typecheck` clean; `npx vitest run --project db tests/concurrency/refused-move-leaves-original.test.ts` → 3/3 pass; `npx vitest run --project db tests/concurrency` → 6 files / 15 tests pass. Pushed and CI confirmed green on `slice/07-reschedule-under-contention` (commit `2bca770`).

```json
{
  "role": "test-engineer",
  "outcome": "revised",
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": 0},
  "quality_scenarios_covered": ["QS-4", "QS-5"],
  "red_commit": null,
  "ci_failure_confirmed": null,
  "objections": [],
  "dcr": null,
  "message": "AC-5's assertion moved into SQL: pg_locks is joined against hashtext(resource_id) in one statement and returns held resource ids (UUIDs), so no signed/unsigned hashtext value ever crosses into JS. AC-5 now passes, the two-lock choreography and both park-probes are unchanged, the rest of tests/concurrency/ is unmoved (6 files/15 tests), and A-07-4's superseded extra-round-trip explanation is retired from the file header. Committed test(07) (not red) at 2bca770 and pushed; CI green."
}
```
