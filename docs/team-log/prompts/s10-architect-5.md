# Prompt · slice 10 · architect · invocation 5

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Condense arc42 and slices hard
- Sent: 2026-09-08T18:00:35.837Z

---

# Condense the documentation — hard. Structure stays; volume goes.

Working directory `/home/agentadmin/sources/keyloop-challenge`, **branch `docs/condense`** (already checked out off `main` at `8b6a61a`). **Do not merge and do not push to `main`** — the human will review this branch.

## The ask

*"Consider the size of the application — in general, only a booking app. I want to greatly reduce the size of the documentation, both arc42 and slices. Emphasise the points in `Requirements.md`, especially `The Challenge Structure`. Keep the documentation structure as-is."*

**Structure as-is**: the same thirteen arc42 files, the same slice files and designs, the same headings where they carry meaning. What changes is how much is in them.

## The measurements

```
arc42    27,839 words   slices  27,938   ADRs  18,897     ~74,700 total
```

Largest: §8 crosscutting 5,227 · §11 risks 3,453 · §5 building blocks 2,707 · §6 runtime 2,432 · §1 goals 2,383 · §10 quality 1,951 · §7 deployment 1,993.

**This is a booking service with five endpoints and one hard invariant.** 74,700 words is roughly five hours of reading. A reviewer has perhaps one.

## What the brief actually grades — this is your priority order

`Requirements.md` §"The Challenge Structure", Part 1, asks for a System Design Document containing **exactly six things**:

1. **An architecture diagram**
2. **A brief description of each component's role** — *brief* is the brief's own word
3. **An explanation of the data flow**
4. **A list of chosen technologies with justifications**
5. **A strategy for observability** — logging, metrics, tracing
6. **A dedicated section on how GenAI assisted the design**

Part 2 adds: *"consider scalability, performance, reliability, maintainability, observability."*

**Everything that serves those six earns its words. Everything else is arguing with a reader who has already moved on.** Where the docs currently spend most of their length is on process archaeology — how a decision was reached, which finding moved it, what was measured on the way — and that lives in `events.jsonl`, the PR threads and the ADRs, all of which survive untouched.

## What to protect while cutting

- **The one invariant.** Double-booking prevented by PostgreSQL exclusion constraints, not application code, with the measured evidence that the constraint decides and the advisory lock only keeps losers from deadlocking. That is the system's whole claim and it should be *easier* to find after this, not harder.
- **The six above**, each visibly answered.
- **`docs:refs` green.** arc42 and the ADRs cite identifiers *defined* in slice designs; a definition may not be deleted while something cites it. If a cut would orphan a citation, cut the citation too — in the same commit.
- **`slice:check --ready` on all eleven live slices.** It counts `**AC-n**` bullets and requires each *Inherited scope* bullet to name a ref the log knows or carry `(no ref — reason)`.
- **The two generated blocks** in §9 and §11 — regenerate, never hand-edit.
- **Facts over pointers**, the rule you derived last pass: a SQLSTATE, a constraint name, a symbol is *shorter and more precise* than a paraphrase; a section number or finding id is a pointer and should become the fact.

## What I am not asking for

Not a rewrite of what the system *is*. Not new claims. **If a cut would require you to decide what a sentence meant, keep it and say so.** And do not delete a *decision* — decisions are immutable; their retelling is not.

## Target

Aim for **arc42 and slices at roughly a third of current** — order of 9,000 and 9,000. Treat that as a direction, not a quota: if a section genuinely cannot go below some size without losing one of the six, stop at that size and say why in your report. **A number met by gutting §8's exclusion-constraint explanation would be a failure, not a success.**

## Verify and land

All four doc checks, `npm run test:tools`, and `slice:check --ready` on a few slices. Commit in **logical groups** — `docs(condense):` — with explicit pathspecs. **Push the branch. Do not open a PR and do not touch `main`.**

## Return

Before/after words per file, what you cut and where it still lives, anything you refused to cut and why, and **which of the brief's six points each arc42 section now answers** — if any of the six has no clear home after this, that is the most important thing you can tell me.
