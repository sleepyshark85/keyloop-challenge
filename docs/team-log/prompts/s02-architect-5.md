# Prompt · slice 02 · architect · invocation 5

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Condense METHODOLOGY.md
- Sent: 2026-09-05T14:35:32.719Z

---

A human ruling, not a slice step. You are the architect, on branch `slice/02-book-and-read-an-appointment` at `f1dc288`. No other agent is running.

The human ruled the documentation too chatty and is working through the corpus. Done so far: slice designs 54,605 → 6,595, ADRs 30,105 → 14,903, arc42 31,800 → 20,397. The ruling is **one home per fact** — ADR = the decision; arc42 = what the system *is*; slice design = that slice's delta; event log and PR = the narrative.

**Your task: `docs/METHODOLOGY.md`, 5,575 → 2,500.** The human's instruction for this one is specific: **cite, don't restate.**

## The relationship you are fixing

`CLAUDE.md` is the constitution — 1,568 words, loaded into every agent's context on every run, almost pure operative rule. METHODOLOGY restates large parts of it at length:

| METHODOLOGY | words | CLAUDE.md equivalent | words |
|---|---:|---|---:|
| Answering an objection | 588 | Adjudication is reasoned before it is applied | 290 |
| 9. Observability | 443 | §9 Logging obligations | 65 |
| 8. Commits | 381 | §7 Commits and branches | 64 |
| 7. Tests | 293 | §5 Test ownership | 126 |
| 6. The slice loop | 177 | §6 The slice loop | 109 |

Where METHODOLOGY restates a rule that CLAUDE.md states normatively, **cite the section and delete the restatement**. CLAUDE.md is the normative home; if the two ever disagree an agent has no way to know which wins, and that ambiguity is worse than either wording.

**What METHODOLOGY uniquely has, and must keep**: the role model, the phase model, the principles, the commands, and — most importantly — **the reasoning behind the process**, including the near-misses that shaped it. That reasoning is what a methodology grade actually rewards. Cut restatement, not insight.

## Three hard constraints

1. **§2's role table is a GENERATOR SOURCE.** `tools/agents/generate.mjs` parses it for each role's Decides / Must not / Model columns and writes them into `.claude/agents/*.md`. Its shape — `| Role | Decides | Must not | Model |` — must survive. Run `npm run agents:check` after editing; it fails if the table stops parsing or the generated blocks drift.
2. **The `<!-- agents:committing -->` block in §8 is also a generator source** and is copied verbatim into all five agent files. Do not reword it inside METHODOLOGY without intending to reword it in every agent definition — and if you do, run `npm run agents:build`.
3. **CLAUDE.md is 68 words over its own 1,500 budget.** You may trim it, but be conservative: it is the document that has demonstrably worked this session, and every word that is not a rule dilutes the rules. It contains exactly one paragraph of history — §6's dated note on why §2 joined the (c) naming list — and even that is operative, because it stops an architect re-deriving the wrong answer. **If you think the honest cut is elsewhere, or that CLAUDE.md should simply be 1,600, say so rather than shaving a rule.**

## What I expect you to push back on

If cutting something would lose a fact or an argument that exists nowhere else, **keep it and tell me**. The budget is a ruling about duplication, not an instruction to destroy evidence — an agent that lands at 2,700 with a stated reason beats one at 2,500 that dropped the reasoning a methodology is graded on. §6 says a round producing no disagreement is deference.

One specific judgement I want from you rather than a default: **METHODOLOGY §12 is "How this instructs agents".** With a real generator now in place, some of §12 may be describing what the tool does — in which case it should say so and point at it, which is shorter and truer.

## Constraints

`docs/METHODOLOGY.md` and, conservatively, `CLAUDE.md`. **Not yours:** `docs/arc42/`, `docs/adr/`, `docs/slices/`, `.claude/agents/` (generated — change the source and run the generator), `docs/team-log/`, `tests/`, `src/`.

Verify with `npm test`, `npm run lint:arch`, `npm run test:tools`, `npm run docs:budget`, `npm run agents:check`. One commit, `docs(methodology): cite CLAUDE.md rather than restate it`. Trailers:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```

Report before/after per section, what you replaced with a citation, what you refused to cut, and your judgement on §12 and on CLAUDE.md.
