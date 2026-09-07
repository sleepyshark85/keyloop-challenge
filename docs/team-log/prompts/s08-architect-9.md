# Prompt · slice 08 · architect · invocation 9

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Rewrite 16 ADRs for readability
- Sent: 2026-09-07T11:39:34.315Z

---

# Rewrite the 16 surviving ADRs to the form the human approved

Working directory `/home/agentadmin/sources/keyloop-challenge`, **branch `chore/adr-readability`** (already checked out, off `chore/adr-retirement` at `987c025`, so the retirement is included). PR #18 carries the retirement; this is separate work.

## The ruling

The human read ADR-0032, then the whole set: *"I don't see very clearly what being decided, how the ADR affect the application. The ADRs also make a lot of reference to other parts like defects, which I think make it even harder to follow."* Seventeen were retired for being below the bar. **These sixteen survive and are now to be rewritten to read well.** Then, on the samples: *"the sample for 0018 looks good"* and *"what you have changed in the first section is what I want."*

## This overrides §4, deliberately and narrowly

`CLAUDE.md` §4 says ADRs are immutable and are superseded rather than edited. The human has overridden that for a **prose rewrite that changes no decision.** The rule exists so the history of how thinking changed survives; the originals remain in git history, and supersession is not the mechanism here because sixteen supersession records would double a set the human just cut in half.

**So the override has a hard boundary, and it is the thing you must not cross:**

- **No decision changes.** Not the chosen option, not the option set, not a verdict, not a consequence.
- **No measurement changes.** Every table, every number, every count stays **entire and exact**. In ADR-0018 those tables are the evidence and are why the record is worth having.
- **No provenance changes.** The frontmatter `ai-input` / `proposed-by` / `decided-by` blocks are evidence for the assessment's verification criterion. Leave them alone.
- If rewriting a passage would require you to decide what it meant, **stop and report it** rather than guessing. An ambiguity you resolve silently is a decision changed.

## The form — read the sample first

`docs/adr/_sample-0018-rewrite.md` **is** the approved rewrite of ADR-0018. Read it and its header before anything else; `_sample-0032-rewrite.md` shows the same form on a shorter record.

Three changes, and that is all:

1. **State the problem as a situation, before any id.** 0018 now opens: twenty people try to book the same bay at the same second, one should get it and nineteen should be told it is full — and most of them got a `500`. The original opened on `40P01` and `check_exclusion_constraint`. **The mechanism is not deleted; it moves to the second paragraph**, after the reader knows what went wrong.

2. **Replace every cross-reference with the fact it points at.** This is the heaviest lift and the biggest win — 0018 went from 29 uses of 14 distinct ids to none. *"AC-3, AC-4, QS-1 and QS-2 are not [untouched]"* became *"the criteria for this endpoint require every loser to receive `409 /problems/no-capacity`"*. *"ADR-0016's `ContendedResource` cannot be minted"* became *"the system's branded 'contended resource' type can only be built from that field"*. **Zero is not a target** — it is what remains when every pointer with a one-clause substitute has been replaced. Keep a reference where the fact genuinely cannot be stated in a clause.

3. **No implementation detail.** The human: *"I don't want to go into implementation detail in the ADR."* A first draft of the 0018 sample had a "What changes in the application" section with call shapes; it was cut and must not come back. The argument is in the sample's header and is worth applying as a test: ADR-0030 later revised the very code that section described, and an ADR that carries implementation detail acquires a way to become false. **Where a decision constrains the system stays; the code it produced does not.**

Result on 0018: **1012 words against 1228**, shorter with the evidence untouched. Expect most to shrink.

## The sixteen

```
0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0016 0018 0019 0024 0025 0030
```

**ADR-0018 is already done** — apply the sample's body as the ADR itself. Then **delete both `_sample-*.md` files**: once 0018 carries the form, a sample proposing it is redundant, and `_sample-0032-rewrite.md` describes an ADR that no longer exists.

Two worth extra care:

- **ADR-0010** — 1990 words, **42 cross-reference uses**, the densest in the set. Likely the largest gain.
- **ADR-0030** — cites ADR-0023, 0027 and 0029, all now retired. Those citations dangle. **Replace each with the fact it pointed at**, which is exactly what this rewrite is for; that is the honest repair for a dangling pointer to a retired record. ADR-0030's own story is also incomplete without what was ADR-0031 — the correction that a move must lock the pair it leaves — so state that fact rather than pointing at a file that is gone.

## Order and durability

**Commit in groups, not one commit** — `docs(adr):`, a few ADRs per commit. A previous run of this kind was interrupted and the per-group commits are what made it recoverable. **Explicit pathspecs, never `git add -A`** (O-65).

## Verify

```
npm run docs:refs
npm run docs:adr-check
npm run docs:check
npm run docs:budget:check
npm run test:tools
```

`docs:adr-check` asserts every considered option and chosen option survives — it is the machine check on the boundary above, so if it goes red you have changed a decision. Push the branch; **do not open the PR** — I will.

## Return

- Per ADR: words before/after, cross-reference uses before/after.
- **Any passage you could not rewrite without deciding what it meant**, and what you did.
- **Any ADR you think should not have survived**, or that the rewrite revealed as thin. You told me ADR-0013 was wrongly retired while executing its retirement; the same candour applies in reverse.
- Whether `CLAUDE.md` §4 should now be amended to say prose may be improved while decisions may not change. **Propose the wording; do not edit `CLAUDE.md`** — it is the constitution and the human's.
