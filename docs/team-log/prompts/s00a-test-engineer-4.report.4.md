# Report · slice 00a · test-engineer · invocation 4

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Fix the unsatisfiable assertion
- Returned: 2026-09-04T04:48:50.746Z
- Duration: 2703s

---

**SHA `46d7bd6`**. One file: `/home/agentadmin/sources/keyloop-challenge/tools/test/lint-arch.test.mjs`. Not pushed, no PR comment.

`test:tools` = 0 · `typecheck` = 0 · `npm test` 60/8 · `test:nodb` 54/6 · `lint:arch` = 0.

**`test:tools` is 204 assertions across seven files** (was 198); lint-arch 22 → 28.

## Against `902abb8`, the assertion printed

```
FAIL    the diagnosis NAMES the installed typescript rather than claiming there is none
          got "  (no `typescript` is resolvable from this installation at all.)"
```

Red against `902abb8`, green against `57f70b2`. Both confirmed directly, not taken.

## I judged the suggested shape insufficient — but the stated reason does not hold

The implementer's worry was that reading the expected version via `require` would let a case pass over a reader reverted to the broken shape. I checked it: `require('typescript/package.json')` returns `6.0.3`, the same string `readFileSync` gives. It changes nothing about discrimination. And the shipped shape *is* caught by the typescript half alone — because when the `dependency-cruiser` read throws under a shared `try`, the typescript version is discarded with it. That collapse **is** the bug.

The real gap is elsewhere: a read that fails **only** for dependency-cruiser. The line then degrades to a shorter *true* one and nothing notices. Four mutants, each loaded from inside the repo:

| | 1. names typescript | 2. names dc version | 3. names range |
|---|---|---|---|
| `902abb8` — before the fix | FAIL | FAIL | FAIL |
| three reads under one `try` (the bug) | FAIL | FAIL | FAIL |
| partial — only dc facts lost | ok | **FAIL** | **FAIL** |
| partial — only the range lost | ok | ok | **FAIL** |
| `57f70b2` — now | ok | ok | ok |

The two partial mutants print, respectively:

```
"  (typescript 6.0.3 is installed. An out-of-range compiler and an absent one are reported identically…)"
"  (typescript 6.0.3 is installed; dependency-cruiser@18.2.0. An out-of-range compiler…)"
```

Honest, and useless. So I added assertions on the dependency-cruiser version and on the **supported range**. The range earns its own line rather than being folded in: dependency-cruiser reports an absent compiler and an out-of-range one *identically*, so the range is the only fact that says which one a maintainer is looking at — which the line's own text claims. Lose it and the diagnosis stays true while ceasing to answer the question it exists for. Plus one end-to-end assertion that the line actually reaches stdout on the spawned violation.

I kept `readFileSync`, for a different reason than offered: **independence**. The tool locates packages with `import.meta.resolve` plus a manifest walk; `require` is the other resolver and shares the exports-map behaviour that caused the bug. A filesystem path is neither, so a resolution failure cannot move the expectation in the same direction as the answer. The range is read through an *absolute* path, which bypasses the exports map the tool has to walk around.

## One process note, because it nearly produced a vacuous case

My first mutant run wrote every copy into `/tmp`. `import.meta.resolve` from there finds no `node_modules` at all, so **all four mutants printed "no typescript resolvable" for a reason that had nothing to do with the mutation** — including the shipped-shape one, which I had already started writing up as "caught" when it had not been measured at all. I only noticed because a mutant I expected to pass the typescript half failed it.

Mutants now live under the repo's own `node_modules/.cache`, with the unmutated source loaded from that same location as a control (`(b2)` in the probe, identical output to the real path). The lesson is exact and it is this slice's own, one level up: **a mutant check run in the wrong environment is the same defect as an assertion that cannot fail** — a red that proves nothing, arrived at without measuring. Six instances now, and the last one was mine, in the very technique I have been using to catch the other five.

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
  "message": "46d7bd6 pins the compiler diagnosis on all three facts. Verified both ways: 0/3 against 902abb8, 3/3 against 57f70b2. The suggested typescript-only shape does catch the shipped one-try bug, but not a read that fails only for dependency-cruiser, which degrades to a shorter true line — so the dc version and the supported range are asserted too. 204 assertions across seven files, all green; ready for the reviewer."
}
```
