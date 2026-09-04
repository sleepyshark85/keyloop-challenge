# Prompt · slice 00a · test-engineer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Fix I-1 typecheck error
- Sent: 2026-09-04T03:30:16.990Z

---

You are the test-engineer. One focused fix on slice 00a, branch `slice/00a-walking-skeleton`.

## What happened

Your red commit landed and CI observed it exactly as predicted. The implementer has since built commits 1–6 and **AC-2 is green** — `npm test` reports 8 files, 60 tests, 0 failures against a real `postgres:16`. Your acceptance test now passes against a real implementation. That is the slice working.

While building, the implementer found a defect in a file it may not edit, and raised it rather than touching it — which is `CLAUDE.md` §5 working as intended. It is yours.

## The defect (implementer finding I-1)

`npm run typecheck` is **red at HEAD**, confirmed independently:

```
tests/support/service.ts(106,13): error TS2352: Conversion of type
'ChildProcessByStdio<null, Readable, Readable>' to type 'ChildProcessWithoutNullStreams'
may be a mistake because neither type sufficiently overlaps with the other.
If this was intentional, convert the expression to 'unknown' first.
```

`stdio: ['ignore','pipe','pipe']` selects the `ChildProcessByStdio<null, Readable, Readable>` overload, so the `as ChildProcessWithoutNullStreams` assertion is rejected. Vitest transpiles without typechecking, which is why your red run did not surface it.

**This blocks green commit 9**, which adds `npm run typecheck` to the `verify` job. A red typecheck there would fail CI on a slice that is otherwise complete.

The implementer's suggested fix — drop the cast and declare `let child: ChildProcessByStdio<null, Readable, Readable>` — is a suggestion, not a ruling. Judge it yourself; if a different shape is better, take it.

## Scope

- Fix `tests/support/service.ts` so `npm run typecheck` is clean.
- Do **not** change what the helper asserts or how it reports failure. The failure message it produces is step-3 evidence and is quoted in the PR record; its behaviour must be identical.
- Touch nothing else. Do not read or edit `src/` — it exists now, and your independence is a read restriction as much as a write one. You do not need to read it: this is a type error in your own file.

## Verify before committing

- `npm run typecheck` — clean, zero errors
- `npm test` — still 60 passing, 0 failures. If the count changes, something else changed and you should stop and report.
- `npm run test:nodb` and `npm run test:tools` — unaffected, but confirm.

## Commit

One commit, `fix(00a): …`, **not** a `(red)` commit — the slice's single red commit is `a483d09` and `CLAUDE.md` §7 allows exactly one. End the message with:

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WsmVKqwdSeBsLAv6qMduLw

Do not push, do not comment on the PR, do not write to `docs/team-log/`.

## Report back

The SHA, what the fix was and why you chose that shape over the suggested one if you did, and the verification results. Also: this error existed in your red commit and neither `npm test` nor CI caught it, because Vitest transpiles without typechecking. Say whether anything in the harness should have caught it, and whether the same blind spot could hide a defect in a test you write for a later slice — that is worth more than the fix.
