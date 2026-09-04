# Report · slice 00a · test-engineer · invocation 4

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Fix the unsatisfiable assertion
- Returned: 2026-09-04T04:18:50.772Z
- Duration: 903s

---

**SHA `203e6cf`** on `slice/00a-walking-skeleton`. Four files: `tests/architecture/layering.test.ts`, `tools/test/red-proof.test.mjs`, `tools/test/collect-ci.test.mjs`, and a new captured fixture `tools/test/fixtures/vitest-red-run.captured.json`. Nothing pushed, no PR comment, no `docs/team-log/` write.

## Checks

`test:tools` = 0 · `typecheck` = 0 · `npm test` 60 passing / 8 files · `test:nodb` 54 passing / 6 files · `lint:arch` *"39 module(s) cruised, every root covered: src, tests"*.

**`test:tools` is 175 assertions across seven files** (was 164): red-proof 27 → 35, collect-ci 33 → 36.

## 1 — Symlink deleted, and `guardTheCruiseHappened` stayed green

Green, all 11 cases in `layering.test.ts` — including both `guardTheCruiseHappened` cases and the four rule-by-name cases. **The architect's reading is confirmed**, and I didn't leave it at "the test still passes", because that is only indirect evidence. I cruised a temp directory containing **no `node_modules` at all**:

```
cwd has node_modules: false
totalCruised 1
issues []
transpilersFound … {"name":"typescript","version":">=2.0.0 <7.0.0",
                    "available":true,"currentVersion":"typescript@6.0.3"}
```

`available: true` with nothing resolvable from the working directory — the compiler is found from the analyser's package location exactly as the architect read it. The symlink was never load-bearing, and its stated mechanism was false. The strongest indirect signal is that `sql-only-in-persistence` still fires: that case is a **type-only** import, so it needs `tsPreCompilationDeps` and a real compiler, and it would have been the first casualty.

The docblock now records what actually carries the guarantee — `DEPCRUISE` is an absolute path into this repository's `node_modules/.bin`, never PATH and never `npx` — plus the falsification condition, so if the reading is ever wrong the next reader gets `missing-typescript-transpiler` and the true reason to restore it. `pg`/`kysely` stubs untouched, with a comment recording *why* the two halves differ (enhanced-resolve reads them from cwd; the anchor `^node_modules/kysely` misses if they resolve upward).

## 2 — `failedFilesFrom`, on the real artifact

The diagnosis is right, and slightly worse than stated: the existing fixtures call `resolve(name)`, so the names *are* absolute — but absolute against the **local** cwd, which means `relative()` always answers and the second branch never runs. A fixture that looked like it exercised path handling exercised only the case that needs none.

`gh run download 33831214774 -n test-results` is now committed verbatim under `tools/test/fixtures/vitest-red-run.captured.json`, wrapped in the same `_fixture` provenance envelope the `gh` payloads use. Six new assertions:

- **fixture precondition** — the artifact carries three runner-absolute names. Without this, a recapture from a local run would send every assertion below back to the trivial branch, still green.
- normalisation gives exactly `tests/acceptance/health.test.ts` + `tests/architecture/layering.test.ts`, with `cwd` deliberately set to this machine's repo root, so the mismatch *is* the case.
- `tests/integration/postgres-harness.test.ts` **passed** in that run and is inside the red zone — a reader that ignored `status` would still look right, so that's pinned separately.
- **AC-6 end to end on that artifact.** §7's evidence item 3 was a transcript; it is now a regression test.
- the **last** `/tests/` segment, via `/home/runner/work/tests/tests/tests/acceptance/health.test.ts`.
- a path with no `/tests/` marker returned whole rather than mangled.

Mutant-checked rather than assumed: a `relative()`-only reader yields `../../../runner/work/…`, which matches neither `RED_ZONE` nor `MUST_PASS`, so `judge` returns `ok: false` — **red-proof would have reported "nothing failed" on the run that failed twice**, and the AC-6 assertion catches it. A first-match reader yields `tests/tests/tests/acceptance/health.test.ts`, caught by the last-segment case.

## 3 — `JOB_KEYS` conformance (done, one design change)

`JOB_KEYS` is **not exported** from `collect-ci.mjs` at this commit, so I asserted the property **behaviourally** through `toCheckRunRecord` instead of importing the map. That needs no export from the implementer, avoids a collision while they're editing that file, and is the better test anyway: the observable contract is the key that lands in the record, and a test reading the internal constant would still pass if the record stopped using it. The workflow is scanned by indentation within the `jobs:` block — no YAML parser, no new dependency.

One gap I'll name rather than paper over: this catches a **rename** in either file, but not a `JOB_KEYS` entry orphaned by a name that no longer exists anywhere in the workflow. Reaching that needs the export. The rename is the realistic drift and it is now caught — verified against the exact mutation:

```
keys recorded: ["docs-tools-and-log-integrity-and-the-toolchain","test","red-proof"]
expected     : ["verify","test","red-proof"]
jobs.verify  = undefined
```

Both directions fail loudly, and a second assertion pins `jobs.verify` and `jobs.test` by name since those are what the DoD and §7 read.

## One thing worth carrying forward

All three findings, plus both from last round, are the same defect: **an assertion that runs but cannot discriminate**. Unwired file, bare summary with no `modules[]`, fixture names that never leave the local cwd, a display-name mapping nothing compares. In each case the suite was green and the green meant nothing.

So every new block here asserts its own precondition before its verdict — *the fixture carries runner-absolute names*, *the workflow scan found the jobs* — and I mutant-checked each new assertion against the specific implementation it exists to reject rather than trusting that it bites. That is point 1 of last round's discipline, now applied as a matter of course rather than in retrospect. The cost is about three lines per block; the alternative is the fifth instance of the §5 table.

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
  "message": "203e6cf removes the AC-4 fixture's typescript symlink — the architect's reading confirmed by cruising a cwd with no node_modules and still getting typescript@6.0.3 available:true, guard green — captures the red run's artifact as a fixture so failedFilesFrom is tested on runner-absolute names for the first time, and pins verify.yml's job names against the keys the DoD reads. 175 assertions across seven files, all green."
}
```
