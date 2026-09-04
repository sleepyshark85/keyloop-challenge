# Prompt · slice 00a · test-engineer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 00a step 3 red commit
- Sent: 2026-09-04T02:22:38.314Z

---

You are the test-engineer at **step 3 (Red)** of the slice loop for **slice 00a — the walking skeleton**. Branch `slice/00a-walking-skeleton` is checked out at `ae26cf5`. PR #4 is the venue.

This is the commit the whole methodology rests on. `CLAUDE.md` §2.4: *a test that has never failed is not evidence*.

## The design has changed substantially since you reviewed it

**Read `docs/slices/00a-design.md` in full before anything else.** Your three objections were ruled on, and then the architect self-raised a sixth finding that reversed two of its own earlier decisions. §0 carries the audit trail. The changes that affect you most:

- **O1 upheld (c).** Your measurement stood. The fixture must **symlink** `<fixture>/node_modules/typescript` to the repo's real one while stubbing `pg` and `kysely` — the architect's point being that "resolves the real compiler" is not a mechanism. The guard is stronger than you proposed: `environment.issues` empty **and every planted file present in `modules[]`**, asserted before any violation is read.
- **O2 upheld (a), remedy rejected.** No TypeScript loader. The project compiles with `tsc`, and `pretest` runs the build, so `npm ci && npm test` satisfies AC-1 literally. You own `tsconfig.json`, `tests/support/`, and the `test` and `test:nodb` scripts.
- **O3 upheld (a).** You author `tools/test/collect-ci.test.mjs` and `tools/test/red-proof.test.mjs`. They must **not** be wired into `test:tools` — that is load-bearing twice now, and the design says why.
- **O-1 escalated; the human ruled BROAD.** `red-proof`'s red zone is the test-engineer-owned suites including `tests/integration/`.
- **NEW — you now also own the `test` job in `.github/workflows/verify.yml`**, landing complete in this commit. §2.4 requires the red *observed in CI*, and the design previously worked around that. Your commit is what satisfies it.
- **NEW — two Vitest projects**, `db` and `nodb`, split by whether a test needs the database.

## Environment

**Docker is now available locally.** Version 29.8.0, `postgres:16` already pulled and cached, and I verified `btree_gist` 1.7 is present in that image. So you can and must run the suite locally before committing. This was not true when you reviewed the design, and it is why the two-project split exists.

## What to do

One commit, `test(00a): … (red)`, matching `^test\(.+\): .*\(red\)$` — that regex is what `red-proof` keys on. Contents per the design's §11.3 red-commit list.

Before you commit, **verify the mechanical unknown the design names**: per-project `globalSetup` in the pinned Vitest version. If it is not honoured, **raise it — do not improvise**. The fallback (a second config file) changes `red-proof.mjs`'s single `--results` input, which is a design question and not yours to settle.

**Run the suite locally and confirm the red is red for the right reason.** The design requires the acceptance test to fail **inside its test body**, not at collection time — a bound wait that then fails with a message naming what it tried, so the Vitest JSON shows a failed assertion in a collected file rather than a load error. That distinction is exactly what C1 means by *"a real assertion failure rather than a missing import"*.

**Predicted CI outcome on your commit**, from the design's §7 — check your work against it:

| Job | Expected | Why |
|---|---|---|
| `verify` | **PASS** | your two new `tools/test/*.test.mjs` are unwired, so `test:tools` stays green |
| `test` | **FAIL** | `tests/acceptance/health.test.ts` and `tests/architecture/layering.test.ts`'s AC-3 case |

If your local run disagrees with that table, say so — a wrong prediction is a finding, not something to quietly reconcile.

## Rules

- **Do not read `src/`.** It does not exist; independence is a read restriction as much as a write one.
- Do not write `src/`, `tools/ci/`, `tools/team-log/collect-ci.mjs`, or any implementation. Those are the implementer's at step 4.
- You may not edit the acceptance criteria. If one is wrong, raise a DCR.
- Do not write to `docs/team-log/events.jsonl`, do not move the board, do not push, do not comment on the PR. I do that.
- End the commit message with:

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WsmVKqwdSeBsLAv6qMduLw

## Report back

The commit SHA. The **verbatim local failure output** — assertion text and failing file paths, not a summary; I record it as step-3 evidence. Which ACs each test file covers. Whether per-project `globalSetup` worked. Whether your local run matched the predicted table. And anything you found while writing the tests that the design gets wrong — you found three such things at step 2, and step 3 is the last cheap moment for a fourth.
