# Prompt · slice 10 · architect · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Rewrite the slice docs for readability
- Sent: 2026-09-08T14:58:07.899Z

---

# Rewrite the slice documentation — the ADR treatment, applied to `docs/slices/`

Working directory `/home/agentadmin/sources/keyloop-challenge`, **branch `main`**. Pull first. The project is complete; this is a readability pass the human has asked for directly.

## The ask, in their words

*"I want you to rewrite the whole slices documentation. They look hard to read for me. I want them short, concise and easy to follow."*

## What is actually wrong — measured, not guessed

The prose is not the problem; the **reference load** is. Identifiers per 100 words:

```
09-observability.md   111 refs / 1644 words   6.7
02-design.md           93 / 1338              6.9
09-design.md           83 / 1254              6.6
00-design.md           88 / 1368              6.4
05-design.md           79 / 1298              6.0
… twenty-two files, most between 4 and 7
```

One identifier every fifteen words. A reader who was not here cannot follow a sentence without resolving `R-05-9`, `§8.6`, `ADR-0027`, `T-06-6`, `QS-13` — and resolving each one costs a document lookup. **The document has become an index into the log rather than an account of the work.**

## You have done this before and the human approved it

PR #19 rewrote all sixteen surviving ADRs on exactly this principle, and it worked: **29 uses of 14 distinct ids became zero**, ADR-0018 came out a sixth shorter with all three measurement tables intact, and the human's verdict was *"the sample for 0018 looks good"*. The rule that produced it:

**Replace a cross-reference with the fact it points at.** Not *"per `R-05-9`, the disables are ruled"* but *"the exhaustiveness arms are excluded, because a `never` arm is unreachable by construction"*. Not *"`ADR-0016`'s `ContendedResource` cannot be minted"* but *"the branded type can only be built from a constraint name the error does not carry"*.

Apply the same three moves:

1. **State the thing plainly before any id.** A slice file should open with what the slice does, in a sentence a service advisor — sorry, *a reader* — could follow.
2. **Every reference becomes the fact it carries**, unless the fact genuinely cannot be stated in a clause. Zero is not a target; it is what remains when substitution is done honestly.
3. **Cut the amendment archaeology.** Sentences like *"Amended at step 1 by ADR-0025; the original required the 404 to come from the UPDATE's zero rows, which is unimplementable…"* are the history of how the criterion moved. **That history is in `events.jsonl` and on the PR, verbatim, and it is not lost by leaving the criterion stating what it now requires.** Keep the *current* claim; drop the narration of how it got there.

## Scope

Everything under `docs/slices/` — the ten live slice files, their designs, the folded tombstones, and `_template.md` so the next project starts from the better shape. Twenty-two substantive files.

## Constraints that bind

- **Budgets.** `docs:budget:check` runs with `--ratchet`: a file may shrink or hold, never grow. Most are at their ceiling already, so **every clarification must be paid for by a cut.** That is the discipline that makes this a rewrite rather than an expansion.
- **`docs:refs` must stay green.** arc42 and the ADRs cite identifiers *defined* in slice designs — `D-08-1`, `OQ-09-1` and the rest. **A definition may not be deleted while something cites it.** Check with `npm run docs:refs` before and after; if a definition must survive, keep the label and cut the prose around it.
- **`slice:check` reads these files.** Acceptance criteria are counted by `**AC-n**` at the start of a bullet; the *Inherited scope* section's bullets must each name a ref the log knows, or carry the explicit `(no ref — reason)` escape. Do not break either — run `npm run slice:check 09` and `10` after.
- **Do not change what any slice decided or claimed.** This is the ADR rule one level over: the decision is immutable, the prose is not. If a rewrite would require you to decide what a sentence meant, **stop and report it** rather than guessing.

## Verify

`npm run docs:refs`, `docs:check`, `docs:budget:check`, `docs:adr-check`, `npm run test:tools`, and `slice:check` on a couple of slices. Commit in **logical groups** — `docs(slices):` — with explicit pathspecs, and push to `main`. A group per few files, so a bad call is revertable without losing the rest.

## Return

- Words and reference-uses before and after, per file.
- Anything you could not neutralise, and why.
- Anything the rewrite revealed — a claim that only held because a reference was doing the work is exactly what this surfaces, and it is worth more than the rewrite.
