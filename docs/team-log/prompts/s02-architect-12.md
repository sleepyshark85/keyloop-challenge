# Prompt · slice 02 · architect · invocation 12

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Pay down the concision debt
- Sent: 2026-09-06T02:42:15.317Z

---

A human observation, measured and acted on. You are the architect, on `main` at `1de2d34`. Slice 02 is merged and `done`; nothing is in flight.

**The human noticed the new documents are as long as the ones we condensed**, and the measurement is worse than the impression: right after the concision pass the corpus was **2,698 words over across 7 documents**. One slice later it is **18,607 over across 14**, and total prose went 50,700 → 65,643.

The cause was mine and is fixed: `docs:budget --check` was deliberately kept out of CI, so the meter reported the drift the whole time and nothing acted on it. There is now a **ratchet** — `npm run docs:budget:check`, in CI and `test:tools`. Nothing may grow past `max(budget, what it already was)`, and a new file must meet its budget outright. **You cannot make anything bigger from here**, but you can shrink freely.

## Your task: pay down the four largest, all yours

```
docs/slices/02-design.md      13,566 → 1,200    (+12,366 — 66% of the total)
docs/adr/0017-…                1,984 →   700
docs/adr/0016-…                1,709 →   700
docs/adr/0018-…                  913 →   700
```

**`02-design.md` is the whole game.** Its budget fell from 3,000 to 1,200 when slice 02 went `done`, under the merged-design rule — and you recorded that compression as an explicit obligation in its own §13. **Step 7 has run**, so arc42 now carries the as-built truth: §5.2's signatures and outcome unions, §6.1's serialisation point and the deadlock, §8.5's corrected serialiser guidance, §8.6's taxonomy, §10.2's markers, §11's cost-of-the-locks table and F-02-9. That is what makes the compression safe rather than lossy — the design's job is done and its content has a home.

What a merged design keeps: what was decided · what was measured **that something else still cites** · what was ruled and by whom · what debt was booked. Not the deliberation — that is in the event log and on PR #12, which is where the ruling puts it.

**ADR-0016 and ADR-0017 were never condensed at all.** They are slice 02's, so they stayed on the slice branch while the cleanup PR was cherry-picked to `main` and the condensation pass never reached them. Both are `proposed`. ADR-0018 is 213 over and also `proposed`.

## The guards, which are not advisory

- **`npm run docs:adr-check`** pins every considered option and every chosen option, including ADR-0018's eight table rows and ADR-0019's four. Compress the *argument* for rejecting an option to a clause; never drop the option. Deleting one fails by name.
- **`npm run docs:refs`** — arc42 and the event log cite design-local identifiers. The **log is append-only**, so a citation there can never be repaired. Do not cut a definition out from under one.
- **`contested: true`** raises an ADR to 1,200 and is a real escape hatch, not a formality — ADR-0016 and ADR-0017 both turn on measurements. Use it where the decision was genuinely argued, and justify each use in the commit message.

## What I want you to push back on

If cutting something would lose a fact or an argument that exists nowhere else, **keep it and tell me**. The ratchet forbids growth, not honesty — a file landing at 1,500 with a stated reason is better than one at 1,200 that dropped a measurement arc42 depends on. You have twice measured your way out of a budget I set by estimate, and both times you were right; if a fifth of these numbers is wrong, say which and why.

One specific thing to check rather than assume: **§13 of `02-design.md` records the compression obligation itself.** If §13 is now the only thing keeping a fact alive, that fact needs a home before §13 goes.

## Constraints

`docs/slices/02-design.md` and `docs/adr/`. **Not yours:** `docs/arc42/` (step 7 is done; if you find it wrong, tell me), `docs/slices/*.md` other than the design, `tools/`, `tests/`, `src/`, `docs/team-log/`.

Verify with `npm test`, `npm run lint:arch`, `npm run test:tools`, `npm run docs:budget`, `npm run docs:refs`, `npm run docs:adr-check`. One commit, `docs: pay down the concision debt slice 02 accrued`. Trailers:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```

Report before/after per file, what you cut and where it already lives, what you refused to cut, and any `contested: true` you set with its justification.
