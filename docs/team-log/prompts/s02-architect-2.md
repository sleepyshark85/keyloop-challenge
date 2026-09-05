# Prompt · slice 02 · architect · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Condense the four slice designs
- Sent: 2026-09-05T10:17:22.252Z

---

A human ruling, not a slice step. You are the architect, on branch `slice/02-book-and-read-an-appointment` at `ea976ec`.

**The human ruled the documentation too chatty, on measured figures**: arc42 31.8k words, ADRs 35.4k, slices 69k — ~136k total, with an average ADR of 2,080 against a normal MADR's 400–800. The ruling is **one home per fact**:

- **ADR** — the decision, its options table, its consequences
- **arc42** — what the system **is**, present tense, no history
- **slice design** — this slice's delta, and nothing else
- **event log and PR** — the narrative, the measurements, the arguments

The duplication being removed is **across** artifacts, not inside them. R-01-4's dead-branch-versus-live-defect argument currently appears in ADR-0015, arc42 §11, slice 13's tombstone, the event log *and* a PR comment. Each was defensible alone; five tellings is the problem.

## Your task: the four slice designs. They hold 54,605 of the 69k words.

```
docs/slices/00a-design.md   17,459 → 1,200
docs/slices/00-design.md    15,294 → 1,200
docs/slices/01-design.md    11,573 → 1,200
docs/slices/02-design.md    10,279 → 3,000
```

`npm run docs:budget` reports every file against its budget. The counter does **not** charge for frontmatter, generated blocks, fenced code or table markup — so a measurement you keep as a fenced transcript costs you nothing, and replacing prose with a table is rewarded rather than punished.

**Why merged designs get 1,200 and the in-flight one gets 3,000.** 00a, 00 and 01 are merged and you have already reconciled each into arc42 at step 7 — that *is* step 7. Keeping the working prose afterwards is the cross-artifact duplication this ruling is about, in its purest form. 02 is in flight and two roles are working from it, so it keeps room; it drops to 1,200 when slice 02 reaches `done`.

**What a condensed merged design is:** what was decided · what was measured that something else still cites · what was ruled and by whom · what debt was booked. Not the deliberation that produced any of it — that is in the event log and on the PR, which is where the ruling puts it.

## Two mechanical guards you must not trip, and one you should use

- **`npm run docs:refs`** — arc42 and the ADRs cite design-local identifiers (`D-01-1`…`D-01-4`, `OQ-01-1`). Every one must still be **defined** in a design, in a definition position (bold/heading/leading table cell), not merely mentioned. Cut the argument around a definition; do not cut the definition out from under a citation. If you believe a citation should go instead, say so — I own arc42 §11's and the ADRs' side of that and will route it.
- **`npm run docs:adr-check`** — you are not touching ADRs in this task, but it runs in `test:tools`.
- **`npm run docs:budget`** — your progress meter.

## What I want you to push back on

I expect you to disagree somewhere, and §6 says a round that produces no disagreement is deference. Specifically: **if cutting a design to 1,200 would lose something that is genuinely nowhere else, say so and keep it** — then tell me what it was and where you think it belongs. The budget is a ruling about duplication, not an instruction to destroy evidence. A design that lands at 1,400 with a stated reason is a better outcome than one at 1,200 that quietly dropped a measurement arc42 depends on.

I would rather have four honest disagreements than four files that hit their numbers.

## Constraints

`docs/slices/*-design.md` only. **Not yours in this task:** `docs/arc42/`, `docs/adr/` (a separate dispatch), the slice files themselves (mine), `docs/team-log/`, `tests/`, `src/`. One commit, `docs(slices): condense the four slice designs under the human's concision ruling`. Verify with `npm test`, `npm run lint:arch`, `npm run test:tools`, `npm run docs:budget`. Trailers:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```

Report the before/after word counts, what you cut, what you refused to cut and why, and anything you had to move rather than delete.
