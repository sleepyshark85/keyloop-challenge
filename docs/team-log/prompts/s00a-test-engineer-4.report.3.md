# Report · slice 00a · test-engineer · invocation 4

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Fix the unsatisfiable assertion
- Returned: 2026-09-04T04:33:12.111Z
- Duration: 1765s

---

**SHA `902abb8`**. Three files, all mine: `tools/test/lint-arch.test.mjs`, `tools/test/collect-ci.test.mjs`, `tools/test/red-proof.test.mjs`. Nothing pushed, no PR comment, no `docs/team-log/` write.

`test:tools` = 0 · `typecheck` = 0 · `npm test` 60/8 · `test:nodb` 54/6 · `lint:arch` = 0.

**`test:tools` is 198 assertions across seven files** (was 175): lint-arch 17 → 22, collect-ci 36 → 52, red-proof 35 → 37.

## 1 — The wrapper's exit code

Mutant: `main()`'s final three lines replaced with `return cruise.status`. Run against a temp tree with a real `domain-is-pure` violation:

```
REAL   exit 1 | stdout: 1 layering violation(s):
MUTANT exit 0 | stdout: 1 layering violation(s):
```

**The mutant prints the violation and exits 0.** That is precisely how it would survive review — the log looks right, only the status lies. The new assertion prints:

```
FAIL    the wrapper EXITS NON-ZERO on a real violation, though the JSON reporter exited 0
          pass the CLI's status through — `return cruise.status` — and this is 0: lint:arch
          goes green on every layering violation … got 0
```

Four supporting assertions so the 1 can't come from somewhere else: a **premise** assertion that the raw `--output-type json` cruise over that same tree really does exit 0 (measured, not trusted — if dependency-cruiser ever changes that, the case stops discriminating and this line says so); the stdout naming `domain-is-pure`; a conforming tree exiting 0 (a wrapper hardwired to fail would satisfy the main case); and no-roots → exit 2, so a mistyped script can't read as a rejected architecture.

The fixture symlinks the real `.dependency-cruiser.js` (the wrapper hardcodes a bare cwd-relative filename, so a copy is the only alternative and would drift) and the repo's `node_modules`. Both verified load-bearing — I did not repeat the mistake of asserting a mechanism I hadn't run. Without the `node_modules` link the wrapper exits **2**, not 1: `lint-arch: …/node_modules/.bin/depcruise is missing. Run npm ci. Refusing to fall back to a depcruise on PATH`.

## 2 — The unfinished-run skip

Three mutants, three catches:

| Mutant | What it produced |
|---|---|
| `jobsOf(ghRun)` without `done` | `{"verify":"FAIL","test":"FAIL","red-proof":"FAIL"}` on a build still running |
| `??` instead of `\|\| undefined` | `conclusion: ""` — gh reports a running run that way, and `""` is not nullish |
| `main()` without the filter | exit 0, no `skipped` line, **a record emitted for the running build** |

Mutant D is worth spelling out: the record it emits has `jobs: {}` and no FAIL, because `toCheckRunRecord`'s own `done` guard is the second line of defence and holds. So it isn't a fabricated red — it's worse in a quieter way. `check.mjs` reads `runs.at(-1)` positionally, so **an in-flight run becomes the newest record and "tests green" reads `{}` → no FAIL → PASS**. The gate would pass on a build that hadn't finished. That's why I asserted the finished run in the same payload is still collected, rather than only that the unfinished one is skipped.

## 3 — `resolveSlice` / `SLICE_ID`

Driven through the CLI from a scratch cwd (both `resolveSlice` and `loadLog` resolve from the working directory) with `--dry-run`, so nothing is appended anywhere.

- Raw-read mutant → **exit 2**, caught by the `SLICE_ID` backstop: `collect-ci: "{\"slice\":\"00a\"}" is not a slice id …`
- Raw read **and** the guard removed — the bug exactly as it shipped → **exit 0**, and the record comes back `slice: "{\"slice\":\"00a\"}"`. Caught, because the JSON-escaped form contains no literal `"slice":"00a"`.

Two rules, two independent cases, plus the no-`--slice`-no-`.scope` branch at exit 2.

## 4 — The job-key collision, and the thing I'd flag hardest

```
REAL    failure first  ->  {"suite-linux":"FAIL"}
REAL    failure LAST   ->  {"suite-linux":"FAIL"}
MUTANT  failure first  ->  {"suite-linux":"PASS"}     <- caught
MUTANT  failure LAST   ->  {"suite-linux":"FAIL"}     <- passes anyway
```

**Only one order discriminates.** Last-write-wins happens to write the FAIL last in the other. Had I written a single case, a coin flip would have decided whether the test was real — and nothing on its face would say which side it landed. The commit `493d395` asked for both orders and was right to. The comment in the file now says not to simplify it.

## The two low-priority ones

**First line of `--subject-file` — earns a case, but not for the stated reason.** `judge()` already does `String(subject).trim()`, so a trailing newline is harmless and every existing case passes with the rule deleted. It bites on a **multi-line** subject: `RED_COMMIT_SUBJECT` has no `m` flag, so `$` is end-of-input and a subject with a body matches nothing. Real exits 1; the mutant exits **0** with `not applicable: the head commit subject "…\n\nSome body text." does not ma…`. The check doesn't go red, it goes **quiet** — AC-6 unasserted on the one commit it exists for, and one edit to that workflow step (`%B` for `%s`) is enough. Covered.

**`failedFilesFrom`'s `Set` — does not earn a test.** Vitest emits one `testResults[]` entry per file, so the duplicate it guards against cannot arrive; and `judge()` asks only whether *any* entry matches either regex, so a duplicate changes no verdict. Measured: with duplicates the only difference is the reason string reading `tests/acceptance/x.test.ts, tests/acceptance/x.test.ts`. Its deletion changes one human-readable string on an input the tool cannot receive. A case would be a case that cannot discriminate.

## One finding for the implementer — `tools/ci/lint-arch.mjs`, not mine to fix

`installedTypescript()` prints **`(no typescript is resolvable from this installation at all.)`** on every violation, and it is false. `typescript/package.json` resolves fine (6.0.3); the throw comes from the next line — `dependency-cruiser/package.json` and `dependency-cruiser/src/meta.cjs` both raise `ERR_PACKAGE_PATH_NOT_EXPORTED`, because dependency-cruiser's `exports` map doesn't expose them. The whole `try` falls into the catch.

So the diagnostic fires exactly when a developer has a **working** toolchain and a real layering violation, and tells them their compiler is missing — sending them to reinstall instead of to the rule they broke. It's cosmetic in the sense that the exit code is right, but it is the same category as everything else this round: a message that asserts something nobody checked.

I did not add an assertion pinning it, because the correct assertion would be red today and this is not a red commit. The case is one line once the wrapper reads the version through `createRequire.resolve` or a `readFileSync` of the package path instead.

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
  "message": "902abb8 pins all four rules the implementer named as surviving their own deletion, each watched failing against its mutant: the wrapper's derived exit code (mutant exits 0 while printing the violation), the unfinished-run skip (three mutants), .scope parsing plus its SLICE_ID backstop, and the job-key collision in both orders — of which only failure-first discriminates. The first-line subject read earned a case for a different reason than stated; failedFilesFrom's Set does not earn one. 198 assertions across seven files, all green. One finding raised for the implementer: installedTypescript() prints a false 'no typescript resolvable' on every violation."
}
```
