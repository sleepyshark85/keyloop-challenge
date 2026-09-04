# Prompt · slice 00a · implementer · invocation 1

**BACKFILLED.** The capture hook was live but matched only the tool name `Task`; this build spawns
agents with `Agent`, so nothing was written. Reproduced verbatim from the session transcript. The
matcher now accepts both and carries a regression case — see `README.md`.

- Task: Slice 00a step 2 agree

---

You are the implementer at **step 2 (Agree)** of the slice loop for **slice 00a — the walking skeleton**. Branch `slice/00a-walking-skeleton` is checked out. PR #4 is the venue.

This step is a **review of the design only**. Write no production code, no tests, no config. Your output is a judgement: **agree** or **object**, with reasons. You build this at step 4, but not yet — objecting now is cheap, whereas the same ambiguity surfacing at step 5 costs a full cycle plus a loopback.

## Read

- `docs/slices/00a-walking-skeleton.md` — the slice and its six acceptance criteria, approved by the human at Gate C. You may not change them.
- `docs/slices/00a-design.md` — the architect's design. This is what you are reviewing.
- `docs/adr/0011-health-is-an-operational-probe.md` — raised by this design, `status: proposed`.
- ADR-0005 (Fastify + TypeBox), ADR-0006 (Kysely over `pg`), ADR-0007 (`node-pg-migrate`), ADR-0008 (five layered modules, **no repository port**), ADR-0010 (GitHub Actions, `check.run` collected not committed).
- `docs/arc42/05-building-blocks.md` §5.2 and `07-deployment-view.md`.
- `.dependency-cruiser.js` — the ruleset your first submission must pass unprompted; `process-criteria.md` C4 measures exactly that.
- `.github/workflows/verify.yml`.

## The question you are answering

**Can you build exactly this, and would the result pass `depcruise` on the first submission without a review round?**

Judge specifically:

1. **The module tree.** Nine files across four modules. Is anything missing that you would need, or specified in a way that cannot compile?
2. **The missing port.** The architect claims the ruleset *forces* `buildServer({ logger, checkHealth: () => checkHealth(db) })` — that with `tsPreCompilationDeps: true`, a `Kysely` type import in application fires `sql-only-in-persistence` and a `Db` type import in `src/http` fires `http-must-not-reach-persistence`, leaving partially-applied use cases as the only shape that type-checks and passes CI. **Verify that claim against the actual ruleset.** If it is wrong, the design's central structural argument is wrong.
3. **`/health` and the `HealthOutcome` union.** Can you produce `503` without `src/http` importing `pg`? The design says the pool must not connect eagerly, or AC-2's unreachable case cannot start — is that achievable with the ADR-0006 stack as specified?
4. **`collect-ci.mjs`'s three interface constraints** — lowercase `"pass"` for `checks.depcruise`; `JSON.stringify(checks)` containing `FAIL` iff the run failed; no ratio strings because `\b0\/` would misclassify a green run. Check these against `tools/slice/check.mjs` yourself. Are they right, and are they sufficient?
5. **`tools/ci/red-proof.mjs`** — the design moves the red-proof decision logic out of YAML into a tested script, because the commit-subject read must use `github.event.pull_request.head.sha` (HEAD on a PR is the merge commit) and it must classify per-suite Vitest results rather than job conclusions. Sound?
6. **`src/domain` shipping empty** — a `.gitkeep`, no TypeScript. The architect predicts you may object. Do you?
7. **Anything in this design you would have to violate the layering to build.** This is the question C4 turns on.

## Rules

- You may not edit the slice's acceptance criteria, and you may not edit any test the test-engineer will own. If an AC is wrong, that is a DCR, not an edit.
- Do not write to `docs/team-log/events.jsonl`, do not move the board, do not push, do not comment on the PR, do not commit. The orchestrator posts your position on your behalf.

## Report back

Lead with your verdict: **AGREE** or **OBJECT**. Then, per numbered point above, your reasoning — for point 2 in particular, report what you actually found when you checked the ruleset rather than whether the argument sounds plausible. If you object, name the design statement you dispute and the change that would resolve it; an objection without a named target is a preference. If you agree, list the files you will create at step 4 in the order you will commit them.

Be specific and be willing to disagree. A step-2 review that has never produced an objection is rubber-stamping, and the pilot retro measures exactly that.
