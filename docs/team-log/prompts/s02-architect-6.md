# Prompt · slice 02 · architect · invocation 6

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Fix circular arc42 citations
- Sent: 2026-09-05T15:03:09.060Z

---

Small, precise task. You are the architect, on branch `slice/02-book-and-read-an-appointment` at `9a97fbf`. No other agent is running.

**I created a circular citation and need you to break it.** The human ruled that `CLAUDE.md` carries ways-of-working only, so its §1 and §3 are now **pointers into arc42**:

- CLAUDE.md §1 → *"Requirements: `docs/arc42/01-introduction-goals.md` §1.1"*
- CLAUDE.md §3 → *"Constraints: `docs/arc42/02-constraints.md` §2, as TC-1 onward"*

But **nine arc42 rows cite `CLAUDE.md` §1 or §3 as their source**, so a reader following a citation now lands on a pointer back to where they started:

```
docs/arc42/02-constraints.md   6   (TC-1, TC-2, TC-6, TC-7, TC-8, and the reserved-decisions note)
docs/arc42/01-introduction-goals.md   1
docs/arc42/04-solution-strategy.md    1
docs/arc42/08-crosscutting-concepts.md 1
```

## What I want, and the judgement is yours

Each of those citations was answering *"who decided this, and where do I go to argue with it?"* — which is a real question and must still have an answer. `CLAUDE.md` §3 is no longer that answer for the stack; it never really was for §1, since arc42 §1.1 quotes the brief and CLAUDE.md paraphrased it.

**Point each at its actual origin.** For most of these that is the assessment brief itself, or a Gate decision, or an ADR. Where the true source genuinely is a CLAUDE.md section that still holds a rule — TC-7 cites `§2.3`, which is untouched and normative — leave it. **Do not mechanically rewrite all nine**; some may be correct as they stand.

Two you should look at specifically:

- **TC-2** cites *"`CLAUDE.md` §3, and required by the §2.1 invariant"*. The second half is the real reason and §2.1 is still normative; the first half is now a pointer loop.
- **The reserved-decisions note** says *"`CLAUDE.md` §3 explicitly leaves the HTTP framework… to the architect"*. §3 still says that, in one line, and defers the detail to you — so this may be fine, or may read better citing Gate B directly.

## Constraints

`docs/arc42/` only. **Not yours:** `CLAUDE.md` (mine — if you think a pointer there is wrong, say so and I will change it), `docs/METHODOLOGY.md`, `docs/adr/`, `docs/slices/`, `docs/team-log/`, `tools/`, `tests/`, `src/`.

This is a citation fix, not a condensation pass — but four of those files are already over their word budget, so **do not add words**. If breaking a loop costs you a clause, take it from the same row.

Verify with `npm run docs:budget`, `npm run docs:refs`, `npm run docs:build`, `npm run test:tools`. One commit, `docs(arc42): cite the origin, not the pointer`. Trailers:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```

Report which citations you changed, which you left and why, and anything you found where the *true* origin turned out not to be what the citation claimed — that is the interesting failure mode here and I would rather know than not.
