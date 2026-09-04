# Report · slice 00a · test-engineer · invocation 4

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Fix the unsatisfiable assertion
- Returned: 2026-09-04T04:10:27.054Z
- Duration: 400s

---

**SHA `626b586`** on `slice/00a-walking-skeleton`. Three files: `tools/test/collect-ci.test.mjs`, `tools/test/lint-arch.test.mjs`, `package.json`. Nothing pushed, no team-log write, no PR comment.

## Fix 1 — I changed the proposed shape

Your diagnosis is right and I confirmed it: with exactly one red record in the pair, `failing` is uniquely determined by the regex whatever the array order, and `passingAfter` is then decided by `Date.parse` alone. `[green, red]` and `[red, green]` are the same input to that predicate.

I did **not** add a third derived fixture. The fixture the property needs already exists and is *captured*: `tools/test/fixtures/gh-run-verify-green.captured.json` has `updatedAt: 2026-09-04T02:18:39Z`, which precedes `gh-run-red.derived.json`'s `2026-09-05T09:10:00Z`. The test already builds a record from it (`preSlice`). A real green run that genuinely preceded the red is stronger evidence than one hand-edited until the assertion comes out right, and it removes ~200 lines of near-duplicate JSON that would drift. So no new fixture, no new provenance header needed.

The assertion is not weakened — it is now four, replacing three:

- **`fixture precondition — the captured green run precedes the derived red run`.** This is design §5's own rule turned on my file: assert that the thing being judged is what you think it is, before asserting the verdict. Without it, recapturing that fixture from a later run would make the inverse case start passing *vacuously* — the same defect one level up.
- **`slice:check does NOT classify green-then-red as test-first`** — `[preSlice, red]`. The property you asked to keep.
- **`…and that verdict is decided by ts, not by array position`** — `[red, preSlice]`. This is what the old comment actually claimed, now pinned rather than assumed.
- **`an earlier green does not spoil a genuine red→green`** — `[preSlice, red, green]` is still test-first. C1 must not be defeated by unrelated history in the log.

`collect-ci.test.mjs`: 30 → **33**, all passing.

## Fix 2 — I kept the shape and widened it

Confirmed: `judgeCruiseResult` reads `cruiseResult?.modules ?? []`, so every bare-`summary` case ran the per-root loop over an empty modules list with `roots = []` — vacuous. Five cases added, and I checked each against the mutant it targets rather than assuming it bites:

| Case | Mutant it kills |
|---|---|
| modules only under `tests/`, roots `['src','tests']` → not ok **and reason names `src`** | F2's original overall-count guard |
| third root `tools` uncovered while src+tests are → not ok, naming it | a rule hardcoded to `['src','tests']` (§5 constraint 1) — verified it returns `ok: true` under that mutant |
| `srcery/x.ts` does not cover `src` | `startsWith(root)` without the path boundary — verified it returns `true` under that mutant |
| env issue + empty modules + roots → reason names `typescript`, not the root | coverage judged before environment, which would send a maintainer to `src/` for a toolchain fault |
| covered cruise + error violation → not ok, naming `domain-is-pure` | the new rule masking the old one |

I also corrected two stale header claims in that file (the signature, and "deliberately NOT wired" — it has been wired since commit 9).

`lint-arch.test.mjs`: 10 → **17**.

## Verification

`test:tools` = 0, `typecheck` = 0, `npm test` 60 passing / 8 files, `test:nodb` 54 passing / 6 files, `lint:arch` reports *"39 module(s) cruised, every root covered: src, tests"*.

**`test:tools` is now 164 assertions across seven files** (guard-paths 37, docs-build 23, capture-prompt 14, report-capture 13, red-proof 27, lint-arch 17, collect-ci 33). It was 124 across six by the same count — the 161 figure must have been measured differently, so treat 124 → 164 as the like-for-like delta.

## The question — what this implies for slices 01+

The honest reading is that I wrote an assertion I never executed, and the reason it survived four commits is that the file was excluded from the only chain that would have run it. Two distinct failures, and only one of them is about the assertion.

The first is that **an unrunnable test and a passing test are the same observation**. That is precisely the §5 table's shape — an exit code standing in for work never done — and my file is now its fourth instance, sitting in the same repository as the table. I read that table as being about `depcruise`. It is not; it is about *any* green that is not evidence of work. I have written the instance into the file's header so the next reader gets it as a worked example rather than as a principle.

The second is worse for slices 01+, because there the mechanism is different and the §11.4 exception that produced this one will not exist. From slice 01 my tests are Vitest files under `tests/acceptance/`, `tests/property/`, `tests/concurrency/` — picked up by a glob, so "unwired" is not the failure mode. The failure mode becomes the one this bug's *content* illustrates: **an assertion that cannot fail for the reason it names**. My assertion could not have caught a real green→red misclassification, because no collector could make it green either. Had the file been wired, the failure would have been loud and immediate. Unwired, it was silent. But there is a nastier variant that is silent *even when wired*: an assertion that passes for a reason other than the one in its name. A `.skip` nobody removed. A property test whose generator produces one shape. An `expect` inside an `if` whose condition is never true. A `toBe(undefined)` that passes because the endpoint 404s.

So the discipline I am taking into 01 is the one design §5 already states, applied to my own files rather than only to the tool under test — and it has a concrete form now, not just a slogan:

1. **Every test must be observed failing for its stated reason before it is trusted**, not merely observed failing. §2.4 requires the red; it does not by itself require the red to be *the named one*. I already owe this at step 3; what I did not do is extend it to assertions added *after* the red commit — like these two. Post-red assertions get no free pass: I checked each of the five new lint-arch cases against the specific mutant it exists to kill, and that is now how I add an assertion to an already-green file.
2. **Count assertions, and make the count visible.** A suite that silently ran 29 of 30 is the same class of problem as a cruise that examined zero modules. `npm test` reporting "60 passed" is only meaningful against an expectation of what should have run.
3. **Assert the precondition before the verdict** where a fixture's property (an ordering, a shape, a version) is load-bearing. The `fixture precondition` line above exists for that reason, and it is cheap.
4. Mechanically, Stryker is the systematic form of (1) and covers the implementer's code. It does not cover *my* assertions against fixtures. For those, the mutant-check is manual and I should do it at the point of writing, which is what I did here.

```json
{
  "role": "test-engineer",
  "outcome": "revised",
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": 0},
  "quality_scenarios_covered": ["QS-10"],
  "red_commit": "a483d09",
  "ci_failure_confirmed": true,
  "objections": [],
  "dcr": null,
  "message": "626b586 fixes an unsatisfiable assertion in collect-ci.test.mjs using the captured pre-00a green run rather than a third derived fixture, adds five per-root coverage cases to lint-arch.test.mjs that the bare-summary shape could never reach, and wires collect-ci.test.mjs into test:tools. 164 assertions across seven files, all green."
}
```
