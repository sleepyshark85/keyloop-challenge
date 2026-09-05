# Prompt · slice 02 · architect · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Condense arc42 sections
- Sent: 2026-09-05T11:35:14.934Z

---

A human ruling, not a slice step. You are the architect, on branch `slice/02-book-and-read-an-appointment` at `33872b0`. **A second architect is condensing `docs/adr/` in parallel — do not touch it, and see the commit note at the end.**

**The human ruled the documentation too chatty**, on measured figures: arc42 is 31.8k words. The ruling is **one home per fact**:

- **ADR** — the decision, its options table, its consequences
- **arc42** — **what the system IS, present tense, no history**
- **slice design** — that slice's delta
- **event log and PR** — the narrative, the arguments, the measurements

**arc42's clause is the one that bites hardest here.** §4 already makes it *"the single source of truth for architecture"* — a description of the system as it stands. A great deal of what is in it now is *how it came to stand that way*: which finding was raised, who ruled what, what the previous wording said and why it was wrong. That belongs in ADRs (decisions) and in the event log and PR (the argument), and both already have it.

## The task: seven sections over budget

```
arc42/11-risks-technical-debt.md    5,481 → 2,500
arc42/08-crosscutting-concepts.md   5,606 → 3,000
arc42/01-introduction-goals.md      2,968 → 1,500
arc42/05-building-blocks.md         2,951 → 1,500
arc42/07-deployment-view.md         2,759 → 1,500
arc42/10-quality-requirements.md    1,699 → 1,500
arc42/03-context-scope.md           1,538 → 1,500
```

`npm run docs:budget` is your meter. It does **not** charge for frontmatter, generated blocks, fenced code, or table markup — so §9's ADR index and §11's generated debt register are free, a measured transcript kept as a fenced block is free, and **replacing prose with a table is rewarded rather than punished**.

§8 and §11 keep the largest budgets deliberately: §8 carries the error taxonomy, the test strategy and the observability contract, and a single number would either strangle it or excuse everything else.

## Three specific things to weigh, not assume

- **§10's quality scenarios are a contract.** QS-1 and QS-2 are what the concurrency tests assert, and QS-9's wording was corrected by a human ruling. Cut the commentary *around* a scenario; do not compress the scenario itself into something vaguer. Ambiguous criteria have cost this project two mid-slice human rulings already. §10 is only 199 words over — take it from the prose, not the table.
- **§11's debt register is generated and free.** What is over budget is the hand-written material around it. Note that the *"Agreed and unbuilt"* table is now generated too, so any prose introducing it as something the generator cannot show is false and should go.
- **§11 and §5 define nothing but cite `D-01-1`…`D-01-4` and `OQ-01-1`**, whose definitions live in slice designs. `npm run docs:refs` enforces that those citations still resolve. You may drop a citation; you may not leave one dangling.

## What I expect you to push back on

**If cutting a section would lose something that exists nowhere else, keep it and tell me.** The budget is a ruling about duplication, not an instruction to destroy evidence. A section landing at 1,600 with a stated reason is better than one at 1,500 that dropped a constraint. §6 says a round producing no disagreement is deference.

Be especially careful with §7 and §8: they were corrected *today* for describing a test invocation that a **(c)** ruling had replaced, and for describing a property-test strategy ADR-0013 falsified. Those corrections are recent, correct, and load-bearing — and they are also exactly the kind of "here is what it used to say and why that was wrong" prose the ruling targets. Keep the **current** fact; the history of the correction is in the event log and on PR #10.

## Constraints

`docs/arc42/` only. **Not yours:** `docs/adr/` (the parallel agent), `docs/slices/`, `docs/team-log/`, `tests/`, `src/`.

Verify with `npm test`, `npm run lint:arch`, `npm run test:tools`, `npm run docs:budget`, `npm run docs:refs`, and `npm run docs:build` (§9 and §11 carry generated blocks — do not hand-edit inside the markers).

**Commit by explicit pathspec (`git add docs/arc42/ docs/system-design.md` only) at the very end**, message `docs(arc42): condense seven sections under the human's concision ruling`. A parallel agent is committing to `docs/adr/` in the same repository — if git reports `index.lock` exists, wait a few seconds and retry rather than deleting the lock. Trailers:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```

Report before/after word counts per section, what you cut and where that fact already lived, what you refused to cut and why, and anything you believe was lost that the guards could not see.
