# Prompt · slice 08 · test-engineer · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 08 QS-8 witness by construction
- Sent: 2026-09-07T08:03:13.874Z

---

# Slice 08 · test-engineer · T-08-7 remediation — the architect took the fault and changed the instrument

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/08-availability-query`, PR #17. Pull first — the ruling is committed at `6ae06ad`.

## Your measurement was accepted whole

You reported that the specified fix killed the reviewer's third mutant in only 27 of 35 trials, and that `fc.sample`'s 1033/5000 exonerates the 4:1 weight. The architect upheld it and ruled the fault is **its own specification**, `(a) clarification`, not your build:

> "I asked for a weight where **mechanic 5, on this same generator, already settles the rule**: a region uniform generation reaches with probability ≈ 0 is reached *by construction*. Three compounding narrowings is what a probability looks like when three conditions must coincide."

Read `docs/slices/08-design.md` §8 for the ruling in full, and the amended **AC-1 mechanic 6** in `docs/slices/08-availability-query.md` — the criterion is now worded there and it is what you build to.

## What to build

**Mechanic 6 becomes a cancelled witness, guaranteed per run** — not weighted. One `cancelled` item that lands **inside** `[from, to)`, on a bay and a technician that **no other in-window item uses**. That last clause is the one your own diagnosis showed matters: a confirmed item over the same pair makes the buggy and correct queries agree and masks the mutant.

Keep everything your first pass got right — `status` on `ScheduleItemSpec`, `probeInsertCommitted` writing the column as the 10th bound param, the probe remaining the oracle, no recomputed expectation. The 4:1 weight is now redundant with the witness; keep or drop it as the construction requires, and say which you did.

Mechanic 5 (boundary items pinned just outside the window) is your precedent for how a by-construction mechanic is written on this generator. Follow its shape.

## The bar, and it is a gate rather than a probability

**20 consecutive kills** of the reviewer's third mutant — deleting `.where('status', '<>', CANCELLED)` from `busyResources` — using the same `dist/`-in-a-throwaway-worktree recipe you used to find this. The architect was explicit about the failure mode:

> "if it is not 20/20 the construction is wrong, so come back rather than raising `NUM_RUNS` or the weight to close the gap."

That is a standing instruction, not a formality. If you get 19/20, stop and report as you did last time. You were right to stop last time and it changed the design.

Also confirm the property still passes on the **unmutated** tree — the witness must not make QS-8 fail on correct code.

## Then

Commit (`test(08): …`, not `(red)` — the one red commit stays `0c4ad4e`), push, and post **one** PR comment on #17, attributed `**test-engineer · step 5 — T-08-7 remediation**`.

**~150 words, short AND self-contained.** Open with one italic line of framing: what this slice does and the one fact the comment turns on. Gloss every reference inline — a human opening the PR does not know what "QS-8", "mechanic 6" or "direction B" mean. Give the 20/20 number and the before-number (8 of 35 survived) because the contrast is the point. Cut narration, cut restatement of the architect's reasoning, cite facts and stop. Keep shas and file:line.

Return the structured report, including the kill count you actually observed.
