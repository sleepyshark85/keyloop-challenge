# Prompt · slice 00a · test-engineer · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Fix the unsatisfiable assertion
- Sent: 2026-09-04T04:03:44.117Z

---

You are the test-engineer. Two fixes in your own files on slice 00a, branch `slice/00a-walking-skeleton` at `1cb4cad`.

## Context

Commits 7–9 landed. CI is green on the branch tip with the full phase-4 block live: `typecheck`, `layering (QS-10)`, the `test` job you added, and `red-proof` — which correctly reported *"not applicable"* on a non-red commit rather than passing vacuously. `red-proof` was also replayed offline against the red commit's own artifact and exited 0, which discharges the design's evidence item 3.

`test:tools` now runs **161 assertions across six files**. Yours is the one file still unwired.

## Fix 1 — `tools/test/collect-ci.test.mjs` has one unsatisfiable assertion (BLOCKER)

29 of your 30 assertions pass. This one cannot pass against any correct collector:

```
FAIL    slice:check does NOT classify a green→red pair as test-first
```

The implementer diagnosed it and **I verified the diagnosis against `tools/slice/check.mjs:99–101`**:

```js
const failing = runs.find((e) => /FAIL|\b0\//.test(JSON.stringify(e.checks ?? {})));
const passingAfter = failing && runs.find((e) =>
  Date.parse(e.ts) > Date.parse(failing.ts) && !/FAIL|\b0\//.test(...));
```

Your test feeds the same two fixture records in the reversed array order. But `failing` is found by **regex**, so with exactly one red record in the pair it is uniquely determined whatever the order; `passingAfter` is then decided by **timestamp comparison alone**. Array order cannot change the verdict — which is what your own assertion comment (*"order matters, and it is decided by ts"*) actually says.

To exercise the property you intended, you need a **third fixture: a green run whose `updatedAt` precedes the red run's**. Then `passingAfter` finds nothing after `failing` and the predicate correctly reports not-test-first.

Judge that shape yourself rather than taking it — the implementer proposed it, and you own the file. If a different fixture or a different assertion expresses the property better, take that instead. What must not happen is the assertion being weakened to match the current behaviour: the property *"a green run followed by a red one is not test-first"* is real and worth pinning, and it is C1's inverse.

Derived fixtures must carry the `provenance: "DERIVED"` header your existing two do, saying what was edited.

## Fix 2 — `tools/test/lint-arch.test.mjs` cannot exercise the F2 remedy it exists to cover (finding J-1)

You wrote that test before the architect's step-3 ruling. It passes bare `summary` objects with **one** argument. But F2's per-root coverage rule needs `modules[]`, which is a **sibling of `summary`** in the cruise result — a summary alone carries only `totalCruised` and no file list.

So the committed test can never exercise the remedy. That is the same defect F2 itself named: a constraint imposed in one place and enforced in another that is never run.

The implementer made `judgeCruiseResult` accept either shape so both the wrapper and your existing cases work, and verified the per-root rule fires by driving it directly — `roots: ['src','tests']` over a modules list holding only `tests/…` returns not-ok, naming `"src"`. **Add the case that pins it**: at minimum, a cruise result whose modules cover only one of two roots must be rejected and must name the missing root.

Read `docs/slices/00a-design.md` §5 for the amended spec before you write it — the rule is per-root non-emptiness with roots derived from argv, and a single cruise.

## Verify

- `node tools/test/collect-ci.test.mjs` — all assertions pass
- `node tools/test/lint-arch.test.mjs` — passes, including your new case
- `npm run typecheck`, `npm test` (expect 60 passing), `npm run test:nodb`

Then **wire `collect-ci.test.mjs` into the `test:tools` chain in `package.json`** — it is the last unwired one. That is a one-line edit and it is yours to make since it is your test.

## Rules

Do not read or edit `src/`. Do not edit `tools/team-log/collect-ci.mjs` or `tools/ci/*` — those are the implementer's; if one is wrong, raise it. Do not write to `docs/team-log/`, do not push, do not comment on the PR.

One commit, `fix(00a): …` or `test(00a): …` — **not** a `(red)` commit; the slice's single red is `a483d09`. End with:

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WsmVKqwdSeBsLAv6qMduLw

## Report back

The SHA, what each fix was, and whether you kept or changed the proposed shapes. `test:tools`' new total. And the question worth more than the fixes: **your `collect-ci.test.mjs` asserted a property that no implementation could satisfy, and you did not notice because the file was unwired and therefore never ran.** Say what that implies for the outside-in tests you write in slices 01+, where an unrunnable assertion would be invisible for exactly the same reason.
