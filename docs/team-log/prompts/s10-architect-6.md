# Prompt · slice 10 · architect · invocation 6

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Refresh §6.1 diagram, add §6.2
- Sent: 2026-09-09T02:56:27.667Z

---

Task: correct the stale runtime-view diagram and add one new diagram to arc42 §6. This is as-built reconciliation of a diagram to a decision already made, NOT a new decision — do not write an ADR.

## Context you must read first
- `docs/arc42/06-runtime-view.md` — the section you are changing
- `docs/adr/0018-lock-the-bay-and-the-technician-before-each-insert.md` — the decision the current diagram predates
- `docs/adr/0009-candidate-ordering-and-attempt-cap.md` and `docs/adr/0004-retry-across-remaining-candidates.md` — the retry loop being drawn
- `docs/diagrams/concurrent-booking.html` — the file to correct, and the house style reference
- `src/application/attemptLoop.ts` and `src/domain/candidates.ts` — the as-built behaviour. The diagram must match these, not the prose.

Load the `diagram-design` skill before authoring — it is what produced the existing files.

## Work item 1 — correct `docs/diagrams/concurrent-booking.html`

§6.1's caption currently admits the defect verbatim: *"It predates ADR-0018 and does not draw the locks"*. The diagram shows R2's INSERT conflicting, but not **why that conflict is deterministic**, which is the entire content of ADR-0018.

It must draw:
- `pg_advisory_xact_lock(1,B1), (2,T1)` taken by R1 inside its transaction, before the INSERT
- R2 **waiting** on that lock — a visibly blocked span on R2's lifeline
- R1 committing and releasing, R2 then being granted
- R2's INSERT therefore conflicting with a **committed** row, which is what makes the reported constraint name deterministic

The point the drawing must carry: the lock decides nothing (it reads no table) — it buys *liveness*, converting a deadlock (`40P01`, which carries no constraint and so yields no verdict to render) into a determinate `23P01`. §6.1's prose already argues this; the diagram must stop contradicting it.

Then delete the stale caveat from the caption in `06-runtime-view.md`.

## Work item 2 — new diagram for §6.2, the retry that succeeds

Deliberately NOT a sequence diagram, and deliberately not merged into §6.1. §6.2 has one participant; its subject is the **candidate lists shrinking**. Draw the elimination:

- two lists (bays, technicians), seeded-shuffled independently by `orderCandidates`
- the pair is the two heads — `nextCandidate` returns `bays[0] × technicians[0]`
- a `23P01` names one resource, and `prune` removes **that whole resource** from its list, leaving the other untouched. This is the crux: pruning only the failed pair would meet the same bay again behind a different technician, and the bound would be `|B| × |T|` instead of `|B| + |T| − 1`.
- both refusal exits (`exhausted` when a list empties, `capped` at ADR-0009's 16) live **inside the 23P01 arm** — no refusal is reachable without a database verdict
- one transaction per attempt, none around the loop

Share visual vocabulary with §6.1 — same `23P01` badge, same prune notation — because R2 in §6.1 is this same loop in its degenerate case, terminating at once because the list empties. Make that kinship visible.

## Hard constraints
1. **Word budget.** `06-runtime-view.md` is at **1196 words against a ratcheted baseline of 1196 — zero headroom**. Fenced code is stripped from the count (`tools/docs/budget.mjs:184`), so ASCII blocks are free but caption prose is not. `npm run docs:budget:check` must pass. Pay for the new caption by trimming prose, or by replacing §6.1's ASCII block, which becomes redundant once its SVG is correct. Do not raise the baseline.
2. **ASCII in §6.2 stays.** Its inline annotations (the exact bound, branch reachability, span names) are load-bearing and the surrounding prose refers to them. The new diagram goes above it, not instead of it. §6.1's ASCII is the one you may drop.
3. Regenerate SVGs with `npm run diagram:export docs/diagrams/<file>.html`. arc42 references the `.svg`, so an un-exported diagram is invisible to its reader.
4. Touch nothing outside `docs/arc42/06-runtime-view.md` and `docs/diagrams/`. No `src/`, no `tests/`, no ADR.
5. Before returning, run and report the output of: `npm run docs:budget:check`, `npm run docs:refs`, `npm run docs:check`.

Return a structured report: files changed, the word count before and after with how you paid for it, the check results, and any judgement call you made that a reviewer should see. Do not write to `docs/team-log/` and do not move the board.
