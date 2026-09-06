# Prompt · slice 04 · scribe · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: README and the AI collaboration narrative
- Sent: 2026-09-06T06:08:04.960Z

---

You are the scribe, on `slice/04-candidate-allocation-and-retry` at `0e3e5d0`. **You have not run before in this project.** The architect is adjudicating slice 04's step 2 in parallel; it touches `docs/slices/04-design.md`, `docs/adr/` and arc42 — none of your files.

## The task

**`README.md` does not exist.** `CLAUDE.md` §4 makes it yours: *build/run/test plus the AI narrative*. The assessment grades the **AI Collaboration Narrative** explicitly, and `docs/arc42/13-ai-collaboration.md` is 144 words, which is a placeholder rather than a section.

Write both. **Budget: README 1,500 words, arc42 §13 1,500** — `npm run docs:budget` reports, `npm run docs:budget:check` is a ratchet in CI, and a **new** file must meet its budget outright. I set README's budget before the file existed on purpose: `02-design.md` reached 13,566 words and had to be cut back by 12,366 because nothing measured it while it was being written.

## Your standing rule, which is the whole job

**Every claim cites an artifact.** You record what happened, not what was intended. The evidence base is large and unusually good:

- `docs/team-log/events.jsonl` — 406 records: findings raised, rulings, gates, agent runs with token and duration figures, CI runs.
- `docs/DEFECTS.md` — the generated register, with defect-escape distance.
- `docs/team-log/prompts/` — every prompt as sent and every report as returned, derived rather than retyped.
- Git history and PRs #10, #11, #12.
- `docs/team-log/phase-4-retro.md`.

`npm run log` queries the log; `tools/team-log/query.mjs` is its source.

## What the narrative should be about, and what it should not

Do **not** write that AI agents were used and it went well. The material worth reporting is specific and it is mostly about **failure detected by mechanism**:

- **The recurring defect shape**, which this project named and then kept finding: *a mechanism that reports success over work it never did.* `depcruise` exiting 0 having cruised nothing; `vitest` writing 0 tests after an aborted `globalSetup`; Stryker reporting survivors it never activated; a scope marker that was present and wrong; an ADR guard that reported "every option survives" over a file it never opened; a word-budget meter kept out of CI that measured 18,607 words of drift and stopped nothing. Count them and cite each.
- **The operational rule that came out of it**: *for a discrimination claim, name the mutant; for a mechanism claim, name the call site.* Find where that was first written and where it was later applied.
- **Roles disagreeing productively.** §6 says a round with no disagreement is deference. Cite cases: the test-engineer objecting to the architect's reading and being upheld by the human; the implementer correcting the architect's own mutation claim; the architect ruling **(b)** against its own preference by §6's naming test; a reviewer re-running Stryker and reproducing a byte-identical survivor set.
- **Where the human's judgement changed the outcome** — the literal AC-6 ruling that reshaped a slice's module signatures; the delegation of mid-slice authority; the concision ruling.
- **What the process cost.** Slice 00 30.7h / 30.53 Mtok · 00a 26.1h / 23.90 Mtok · slice 01 9.5h / 8.30 Mtok. Gate D's C6 criterion failed and was ruled on. Do not present the cost as a triumph; it is data.

**Say what did not work.** A narrative with no failures in it is not evidence, and this project has an unusually honest record to draw on — including defects in the orchestrator's own tooling, and a gate the orchestrator took in the human's absence and recorded as such rather than as theirs.

## Constraints

Yours: `README.md`, `docs/arc42/12-glossary.md`, `docs/arc42/13-ai-collaboration.md`. **Not yours:** everything else — `docs/arc42/§1–§11`, `docs/adr/`, `docs/slices/`, `src/`, `tests/`, `tools/`, `docs/team-log/`.

The README must also carry what a reader needs to **run this**: prerequisites, `npm install`, the test commands and what each covers, and how to see the board and the status. Check those commands exist in `package.json` rather than assuming them; several changed this week.

Verify with `npm run docs:budget`, `npm run docs:refs`, `npm run test:tools`. One commit, `docs: the README and the AI collaboration narrative`. Trailers:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```

Report what you wrote, the strongest evidence you found, and **anything you expected to be able to cite and could not** — that last one is the most useful thing you can tell me.
