# Prompt · slice 02 · architect · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Condense all 17 ADRs
- Sent: 2026-09-05T11:34:47.775Z

---

A human ruling, not a slice step. You are the architect, on branch `slice/02-book-and-read-an-appointment` at `33872b0`. **A second architect is condensing `docs/arc42/` in parallel — do not touch it, and see the commit note at the end.**

**The human ruled the documentation too chatty**, on measured figures: ADRs total 35.4k words with an average of 2,080 against a normal MADR's 400–800, and `Considered options` + `Pros and cons of the options` spend 11.5k words doing one job. The ruling is **one home per fact**:

- **ADR** — the decision, its options table, its consequences
- **arc42** — what the system **is**, present tense, no history
- **slice design** — that slice's delta
- **event log and PR** — the narrative, the arguments, the measurements

**The human also overrode §4 for this purpose**: an accepted ADR **may be shortened**, and may **not** be changed in meaning. That override is sound on §4's own terms — its stated purpose is that *"the history of how thinking changed is the point"*, and that history is in git and the event log, not in the file being frozen. What immutability protects is that a reader citing ADR-0006 later gets the same **decision**, which a meaning-preserving condensation does not touch.

## The task: all 17 ADRs are over budget

Budget **700 words**, or **1,200** if the ADR declares `contested: true` in its frontmatter. `npm run docs:budget` is your meter; the worst are 0013 (3,111), 0010 (3,096), 0017 (1,984), 0015 (1,877), 0004 (1,799).

The counter does **not** charge for frontmatter, generated blocks, fenced code, or table markup. So a measured transcript kept as a fenced block is free, and **folding `Considered options` and `Pros and cons of the options` into one table is rewarded rather than punished** — that is the single biggest structural win available and it is where I would start.

**`contested: true` is a real escape hatch, not a formality.** Use it where a decision was genuinely argued — 0013, 0016 and 0017 are the shape it exists for. It is a declaration visible in a diff, so justify each use in the commit message. Do not use it to avoid editing.

## The guard, and it is not advisory

`npm run docs:adr-check` pins **every considered option** and **every chosen option** against a baseline captured before you started. Run it constantly.

A rejected option is the most deletable thing in an ADR and the most valuable: it is the evidence that a decision was a **choice** rather than a default, which is exactly what this assessment grades. Compress the *argument* for rejecting an option to a clause; never drop the option. The guard fails by name if you do — proven by removing Option E from ADR-0015.

Also run `npm run docs:refs`: ADR-0014 and ADR-0016 cite `D-01-2`, ADR-0015 cites `OQ-01-1`, and those definitions live in slice designs that were just condensed. If you drop a citation, that is fine; if you drop one and something else needs it, the guard says so.

## What I expect you to push back on

**If shortening an ADR to 700 would lose something that exists nowhere else, keep it and tell me.** The budget is a ruling about duplication, not an instruction to destroy evidence. An ADR that lands at 850 with a stated reason is a better outcome than one at 700 that quietly lost a constraint. §6 says a round producing no disagreement is deference, and I am asking for seventeen judgement calls, not seventeen haircuts.

Two specific things to weigh rather than assume:

- **Some ADRs record a measurement that is their whole justification** — ADR-0013's built-artifact reasoning, ADR-0016's "you cannot construct the refusal without the evidence". Keep the measurement, cut the essay around it.
- **`ai-input` frontmatter is provenance the assessment asks for.** It is not counted, so leave it alone.

## Constraints

`docs/adr/` only. **Not yours:** `docs/arc42/` (the parallel agent), `docs/slices/`, `docs/team-log/`, `tests/`, `src/`.

Verify with `npm test`, `npm run lint:arch`, `npm run test:tools`, `npm run docs:budget`, `npm run docs:adr-check`, `npm run docs:refs`.

**Commit by explicit pathspec (`git add docs/adr/` only) at the very end**, message `docs(adr): condense all seventeen ADRs under the human's concision ruling`. A parallel agent is committing to `docs/arc42/` in the same repository — if git reports `index.lock` exists, wait a few seconds and retry rather than deleting the lock. Trailers:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```

Report before/after word counts per ADR, which ones you marked `contested` and why, what you refused to cut, and anything you believe was lost that the guards could not see.
