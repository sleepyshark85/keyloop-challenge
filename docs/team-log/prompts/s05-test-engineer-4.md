# Prompt · slice 05 · test-engineer · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Build R-02-2 — the lock cannot replace the constraint
- Sent: 2026-09-06T10:57:19.993Z

---

Build **R-02-2**, ruled into slice 05 rather than deferred a fourth time. Branch `slice/05-cancellation`, PR #14, CI green. The implementer is building R-02-3 as one unit case in parallel — stay out of `tests/unit/`.

**Why this is landing now.** ADR-0019 — accepted — named slice 05 as R-02-2's destination on the stated ground that slice 05 *"reopens that same file anyway."* It did not: the branch never touched `tests/integration/exclusion-constraints.test.ts`. The architect ruled that at that point ADR-0019's criterion applies to itself — **a deferral that cannot name a cheaper or stronger slice is an omission, to be built now.** This is the third recurrence of the same mechanism, so it is not being deferred again.

**What R-02-2 asserts, and it is the cell that is still prose.** ADR-0018's own control table has four cells. Three are measured. The fourth — **the lock cannot replace the constraint** — is argued and never run. **No file under `tests/` combines a `pg_advisory` lock with a dropped exclusion constraint.** That is the gap.

**The shape the architect specified**, in `docs/slices/05-cancellation.md` In scope — read it, and treat it as the ruling rather than as my paraphrase:

- **phase 4 of `tests/integration/exclusion-constraints.test.ts`**, using that file's existing `race()` helper and phase 2's already-dropped constraint;
- **each insert wrapped in ADR-0018's two advisory locks, hand-written** — the locks are taken and the constraint is absent;
- expected: **twenty overlapping rows**. Serialisation without a constraint produces overlap in perfect order.

**What I will hold you to, because this test's whole value is that it fails for one reason.**

1. **The locks must genuinely be taken, with ADR-0018's key derivation.** You verified that derivation yourself at step 3 for the cancellation concurrency file — class 1, `hashtext(bayId)`, bay-then-technician. If the keys are wrong the test passes for the wrong reason: no serialisation, so overlap, so green. **A positive control is not optional here** — something must show the locks are actually serialising. The reviewer required exactly that of your cancellation file and you built it; the same standard applies.
2. **Twenty overlapping rows is the assertion, not "more than one".** A count that could be satisfied by a partial failure is not evidence of the claim.
3. **Say what this proves that phase 2 does not.** Phase 2 already drops the constraint. If phase 4's only difference is that some locks were taken and the result is the same, say so plainly — that would itself be the finding, and it would mean ADR-0018's fourth cell is unprovable in this shape.

**Context you should use.** Your R-05-5 remedy is merged into the branch and CI is green on `52f0a50`. The reviewer withdrew its "R-02-3 is unkillable" claim after reproducing the architect's measurement, and its outcome is now `approved` — so step 5 is closed and this is the last work before step 7.

**Constraints.** `tests/integration/` asserting a database invariant is yours. No `src/`, no `tests/unit/`, no docs. One commit, `test(05): …`, ~150 lines. Push so CI runs on the head that would merge.

**Report** the standard JSON plus: your positive control and what it showed, the row count you measured, what phase 4 proves that phase 2 does not, and anything you found while in that file. You have flagged something unprompted in that section every slice; the file you are opening is one nobody has read in three slices.
