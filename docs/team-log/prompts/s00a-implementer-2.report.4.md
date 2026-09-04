# Report · slice 00a · implementer · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 00a step 4 commits 1-6
- Returned: 2026-09-04T04:37:51.755Z
- Duration: 5245s

---

**SHA `57f70b2`** — one file, +89/−17, unpushed.

**Checks:** `typecheck` 0 · `lint:arch` 0 (39 modules, both roots covered) · `test:tools` **198 across seven** (37 · 23 · 14 · 13 · 37 · 22 · 52) · `test:nodb` 54 · `npm test` **8 files, 60 tests, 0 failures**.

## What the wrapper now prints on a real violation

Driven against a genuine `domain-is-pure` violation in a throwaway tree with the local `depcruise`, not inferred:

```
exit: 1
1 layering violation(s):
  domain-is-pure: src/domain/bad.ts → src/platform/config.ts
  (typescript 6.0.3 is installed; dependency-cruiser@18.2.0 supports >=2.0.0 <7.0.0. An
   out-of-range compiler and an absent one are reported identically, so this line is the
   only place the installed version appears.)
```

The second line previously read *"no `typescript` is resolvable from this installation at all."*

The root cause was two things, and the second is the one worth recording. `require('dependency-cruiser/package.json')` and `require('dependency-cruiser/src/meta.cjs')` are both `ERR_PACKAGE_PATH_NOT_EXPORTED` — that package's `exports` map publishes only `"."` (and under an `import` condition only, so even `require.resolve('dependency-cruiser')` fails). But **all three reads shared one `try`**, so a failure to read dependency-cruiser's version asserted that *typescript* was missing. Packages are now located by resolving their entry point via `import.meta.resolve` and walking up to the manifest — a path on disk is not subject to an `exports` map — and each fact has its own failure, so a partial read yields a shorter true line instead of a complete false one.

## Coverable from `tools/test/` — no change needed from my side beyond the export

I exported `describeCompilerEnvironment`, so the case is entirely writable in `tools/test/lint-arch.test.mjs`. The assertion that kills this mutant, with no fixture and no spawn:

```js
const installed = JSON.parse(
  readFileSync(resolve('node_modules/typescript/package.json'), 'utf8'),
).version;                                    // read directly, NOT through require
const line = describeCompilerEnvironment();
check('names the installed typescript rather than claiming there is none',
  line.includes(installed) && !/no `?typescript`? is resolvable/.test(line),
  line);
```

It is red against `902abb8` and green against `57f70b2`. Reading the version by `readFileSync` of the resolved path rather than by `require` matters: `require('typescript/package.json')` happens to work, so a test using it would still pass over a reader that had reverted to the broken shape for dependency-cruiser.

## What the reviewer should be told rather than left to find

**One rule in my three tools still survives its own deletion, and it is in the file just changed.** `describeCompilerEnvironment`'s per-fact failure isolation — the thing this commit is about — is only pinned by the assertion above once someone writes it. Until then, collapsing the three reads back under one `try` produces a false line again and nothing fails. That is the single outstanding gap I know of; everything else I named last round is now covered by `902abb8`.

**Two things that are correct but read as odd in a diff.** `judgeCruiseResult` accepts either a full cruise result or a bare summary — deliberate and now in the design: three of its four rules read only the summary, and forcing every summary-only test case to pass `roots` would make them fail on coverage before reaching the rule under test. And `lint-arch.mjs` deliberately discards `depcruise`'s exit code rather than passing it through, because `--output-type json` exits 0 with error-severity violations present (F3, measured). Both look like carelessness and are the opposite.

**One thing I did that is worth stating plainly.** `tools/test/collect-ci.test.mjs` was unwired for one commit (`cb59b1f`) because it carried an assertion no correct collector could satisfy. I raised it rather than editing the test-engineer's file; they fixed it in `626b586` and it has been wired ever since. The reviewer will see a commit that adds a tool without wiring its test, and the reason is in that commit's message.

```json
{
  "role": "implementer",
  "outcome": "green",
  "commits": ["57f70b2"],
  "files_changed": 1,
  "unit_tests_added": 0,
  "acceptance_passing": true,
  "depcruise": "pass",
  "objections": [],
  "dcr": null,
  "message": "The compiler diagnosis is truthful now — driven against a real domain-is-pure violation, it names the rule and reports typescript 6.0.3 rather than claiming no compiler is installed. Cause was dependency-cruiser's exports map hiding both package.json and src/meta.cjs, plus one try/catch spanning three reads so one failure spoke for the others. describeCompilerEnvironment is exported, so the case is fully coverable in tools/test/lint-arch.test.mjs, which is the test-engineer's; the exact assertion is in my report and is red against 902abb8."
}
```
