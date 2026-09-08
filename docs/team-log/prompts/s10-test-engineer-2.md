# Prompt · slice 10 · test-engineer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 10 step 3 red commit
- Sent: 2026-09-08T04:16:35.898Z

---

# Slice 10 · step 3 — RED. The one red commit, and it must fail for the right reasons.

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/10-openapi-and-curl-harness`, **PR #21 open**. Pull first — step 2 is committed at `88a9105`, both roles agreed, and all three roles are attributed on the PR.

Read `docs/slices/10-design.md` and `10-openapi-and-curl-harness.md` as they stand.

**This slice exists because three green tests asserted the wrong thing.** Yours is the commit that decides whether that recurs.

## What step 2 established, which changes what you build

- **`OQ-10-1` is answered by your own probe**: `SwaggerParser.validate` accepts an unreferenced `components.responses` entry, so `route-not-found` has a legal home. **Your inherited document-wide type-presence check walks only `doc.paths` and must widen past it** — you found that yourself; do not let it false-red a correct implementation.
- **`I-10-1` / M2 came back positive**: a one-member `Type.Union` collapses to a Literal and **silently substitutes**, reproducing §8.5's defect, reachable in **seven cells** under AC-1's own narrowing. The implementer will use a hand-built `Type.Unsafe` with a one-member `anyOf`, verified to reject rather than substitute. **Your tests must assert the property, not the mechanism** — an assertion that pins `Type.Unsafe` would pass on a future refactor that reintroduces the substitution.
- **`I-10-2` / M1**: the content-keyed form fails at its own status with the content-type flipped, rather than escalating to 500 as the classic form does. That is the observable your AC-1 assertions get.

## The commitments you made on the PR, now to be built

Pair-equality via `content` media-type **keys** rather than string-scanning; a reschedule-collision negative control for AC-4; an import-anchored AC-3b marker; the `components`-widened document walk.

## What must fail in the one red run

Every criterion whose subject this slice introduces — and the architect has already told you which cannot fail as written, so do not pretend otherwise:

- **AC-1** — each operation's `(status, type)` set by equality, both directions, including 2xx.
- **AC-3** and **AC-3b** — no operation accepts a caller-supplied appointment id; the uuid-mint marker anchored on an imported binding, `{src/main.ts}` today. `A-06-2` has been declared discharged **twice** on assertions that did not make it. Yours is the third attempt.
- **AC-4 / AC-5** — with their negative controls. The exit code is the primary signal: **the script must fail, not the test**. The current version counts `201`/`409` occurrences in stdout, which is the test asserting the invariant on the script's behalf.
- **AC-6** — the acceptance test drives both scripts from `npm run harness:seed`'s output **alone**, never from `seedScenario`.
- **AC-7** — three assertions bound to `D-08-1`'s three surviving mutants; AC-7 must fail when **any one** literal is emptied. The boundary is *`to` strictly later than `from`* (`A-10-4`).
- **AC-8** — the validator.

**AC-2 and AC-6's README half are gate-verified, not mechanical.** Do not manufacture an assertion for them; say so in your report.

## Discipline

- **Exactly one red commit** (§7), `test(10): … (red)`, observed red in CI. Confirm it fails on **assertions**, not import errors, not a missing script, not `globalSetup`.
- Your directories only. **`harness/*.sh` and `harness/seed.mjs` are the implementer's — and `harness/` is now guarded** (`a1d1717`), so an attempt to write there will be denied rather than merely discouraged. If a script must change for a test to be assertable, that is a step-4 dependency; state it, do not build it.
- `npm run test:tools` stays green. **Explicit pathspecs, never `git add -A`.**

## Post to PR #21

One comment, `**test-engineer · step 3 — RED**`. **~150 words, short AND self-contained**: one italic framing line, a gloss at every reference, the criteria that failed and the ones that structurally cannot. Cite the sha and the CI run.

## Return

The structured report with `red_commit` and `ci_failure_confirmed`, which criteria could not be made to fail and why, and any script change AC-4/AC-5 need from the implementer before they can go green.
