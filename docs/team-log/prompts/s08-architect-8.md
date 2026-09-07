# Prompt · slice 08 · architect · invocation 8

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Retire 17 ADRs, resumed
- Sent: 2026-09-07T10:18:49.282Z

---

# ADR retirement — resuming work that was interrupted, not restarting it

Working directory `/home/agentadmin/sources/keyloop-challenge`, **branch `chore/adr-retirement`** (already checked out, off `main` at `172a846`). Slice 08 is merged and done; this is process work, not a slice.

**A previous architect run began this and was stopped by accident.** Its uncommitted work is still in the tree and is yours to continue, not to redo from scratch:

- `docs/slices/00-design.md` — modified
- `docs/slices/00a-design.md` — modified, and **currently 1235 words against a 1200 ceiling**, so `npm run docs:budget:check` is red right now. Settle that first.

Read both diffs before you do anything else (`git diff`), and keep what is good. If you disagree with an earlier choice, change it and say why in your report.

## The ruling you are implementing

The human read ADR-0032, then the whole set, and ruled (logged as `gate.decided`, span `s-08-gate-process-adr`): most ADRs are hard to follow, it is not clear what is being decided or how it affects the application, they cross-reference other parts like defects which makes it harder still — and decisively, many are below the bar where a decision warrants an ADR at all. Their words: *"I'm not saying this ADR is trivial, but it doesn't seem to be in the level of decision that require an ADR (where I think only important decisions should be addressed)."* Then: *"I think we can just remove them (and make sure they are recorded in the slice designs)."*

**Retire these 17:** `0011 0012 0013 0014 0015 0017 0020 0021 0022 0023 0026 0027 0028 0029 0031 0032 0033`. The other 16 survive **untouched** — their form is a separate discussion the human has deferred.

A later human ruling makes the destination principled rather than merely convenient: *"I don't want to go into implementation detail in the ADR."* Code-shape belongs to the slice design. That is why these fold into designs. Both sample rewrites were updated accordingly at `b60cc54`.

## What "retire" must mean here

`CLAUDE.md` §4 makes ADRs immutable because the history of how thinking changed is the point. The human has overridden that for these 17. **The override is of the file, not of the history** — every existing citation must still land somewhere true. Three populations, three different problems:

1. **~160 references in `docs/`** (arc42, slice files, other ADRs, METHODOLOGY). Editable. Rewrite each to point where the decision now lives.
2. **118 citations in `docs/team-log/events.jsonl`** — **append-only, must not be rewritten** (O-36 settled that precedent). Served only by a **new appended mapping record per retired ADR**. Return those to me as JSON; **I append them, not you** (§9: the orchestrator alone writes the log).
3. **The surviving 16 may cite retired ones.** They are immutable, so a dangling pointer there cannot be edited away — the mapping record is the only repair. Name every such case explicitly in your report.

## Where each decision goes

Slice frontmatter `adr:` lists give these homes:

```
0014, 0015 → 02      0023 → 05, 07     0026, 0027 → 06, 07     0028 → 06
0029 → 07, 09        0031 → 07         0032, 0033 → 08
```

Seven have **no slice claiming them** — establish each home rather than guess: `0011 0012 0013 0017 0020 0021 0022`. Log-citation counts *hint* `0011→02, 0013→01, 0017→02, 0020→04, 0021→04, 0022→04`, and **`0012` appears nowhere in the log at all**. Treat these as leads to verify, not answers. If a decision has no honest slice home, say so — §11 or `docs/arc42/` may be the truthful destination.

**ADR-0031 must not vanish.** It is the correction that made ADR-0030 *true*: a move must lock the pair it **leaves**, not only the pair it takes. ADR-0030 survives and is immutable, so 0031 cannot be folded into it. Its content goes into slice 07's design as part of 0030's story, and its mapping record must say plainly that ADR-0030 as written is incomplete without it.

## Form

- **No "What changes in the application" section anywhere.** The human ruled it out.
- `docs/adr/_sample-0032-rewrite.md` and `_sample-0018-rewrite.md` show the prose standard the human approved: state the thing in plain terms before any id, and **replace a cross-reference with the fact it points at** rather than making the reader chase it. Apply that to what you write into designs. The samples themselves stay put.
- What lands in a design is **what was decided, why, and what it constrains** — compressed, not the ADR pasted in.

## Budgets, which will bind

`docs:budget:check` runs `--ratchet`; a merged slice's design ceiling is **1200 words** and several sit at it. **Never raise a budget to fit.** Compress, or place the content where it truly belongs. A ceiling that genuinely cannot hold what must live there is a legitimate finding — report it; do not inflate the number.

## Verify before finishing

```
npm run docs:refs        # dangling citations — the main risk
npm run docs:adr-check   # invariants over the ADR set
npm run docs:check
npm run docs:budget:check
npm run test:tools       # 21 suites
```

Commit in **logical commits, not one** — `docs(adr):`. **Explicit pathspecs, never `git add -A`**: I swept a previous architect ruling into a tooling commit that way (O-65) and would rather not see it happen in reverse. Push the branch; **do not open the PR** — I will.

## Return

- **Mapping records as JSON**, one per retired ADR: `{ adr, title, decided_what, now_lives_in, notes }`.
- Which of the seven unclaimed ADRs you placed where, and on what evidence.
- **Any decision you judge should NOT be retired.** The human ruled on the set; if one of the 17 is genuinely architectural, say so rather than execute silently. Disagreement is expected and is not failure (§6).
- Any budget you could not meet, and what you did instead.
- What you inherited from the interrupted run and what you changed about it.
