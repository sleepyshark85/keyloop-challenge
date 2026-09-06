# Prompt · slice 04 · architect · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: F1 — undeclared arc42 scope
- Sent: 2026-09-06T07:52:37.514Z

---

Slice 04 step 5 raised a MAJOR finding against your work. Branch `slice/04-candidate-allocation-and-retry`, checked out and now merged up to `main`. PR **#13**. The human is asleep; you rule and remedy under the standing delegation, provisional until the gate. The test-engineer is working in `tests/acceptance/` in parallel — stay out of `tests/`.

**F1 — arc42 §7.3 was rewritten but is not in the slice's declared `arc42:` scope.**

`9dfde0d` rewrites `docs/arc42/07-deployment-view.md` — the environment-variable contract table — and adds a normative sentence (*"This table is the contract; `BOOKING_` marks what this application invented"*). The slice frontmatter at `docs/slices/04-candidate-allocation-and-retry.md:6` declares `["§6.2", "§5.2", "§11"]`, and design §7's "arc42 edits" lists the same three. §10's Definition of Ready requires the arc42 scope declared.

The reviewer graded it MAJOR but **not** BLOCKING, on the stated ground that its card says block when arc42 moves *silently*, and `9dfde0d`'s subject line names §7.3 explicitly. The content is correct; the declaration is missing. It also noted **F-04-3**: the same field was already amended once this slice to add §11, so the mechanism existed and was not used the second time.

Remedy it, and then answer the question underneath it: **the declaration is a Definition-of-Ready field checked at step 1, and this edit was decided at step 4.** A scope field that can only be right if nothing is discovered mid-slice is a field that will be wrong whenever the slice was worth doing. Say whether the correct fix is to amend the declaration whenever scope moves (with the amendment recorded), or whether `slice:check` should derive the touched sections from the diff and compare — and if the latter, say so and I will schedule it; `tools/` is not yours.

**Second item, from the same review.** `stryker.config.mjs` excludes `!src/main.ts` with the justification *"the composition root: wiring, asserted by AC-2 end to end"*. The reviewer established that justification is **true of the booking path and false of `main.ts:46`**, the sole call site of `config.warning`: delete that line and `BOOKING_SEED` runs Order-A in production unannounced while `npm test`, `npm run mutation` and `depcruise` all stay green. The test-engineer is closing the assertion gap right now. Your question is narrower and is about the record: **a config comment that asserts coverage which does not exist is the same defect shape this project has now counted more than twenty times.** Decide whether the exclusion survives, whether its justification must be narrowed to what is actually true, or whether `src/main.ts` should be mutated after all. `stryker.config.mjs` is not `tools/` and not a test — say which role owns it if you conclude it is not you.

**Third, and this one is a gift from the reviewer, so use it.** It verified `bookAppointment.ts:312` is an equivalent mutant not on plausibility but by proof *and* by exhaustive search over every adversarial conflict path across `(B,T) ∈ 1..9²` and 8 seeds: the deepest reachable attempt is always exactly `|B|+|T|−1`, so `<=` and `<` admit the identical execution set. **That is a stronger statement than ADR-0020 or arc42 §6.2 currently make** — they say the tail is unreachable; this establishes the exact bound and that it is tight. Decide whether that belongs in arc42 §6.2 as a stated invariant with the evidence cited, and whether it changes anything about the cap's relationship to `structuralBound`. ADR-0020 is accepted and immutable; do not edit it.

**Constraints.** Word budgets enforced; `npm run docs:budget -- --check --ratchet` stays green and any addition is paid for. No `src/`, no `tests/`, no `tools/`. Commit `docs(04):` / `docs(arc42):`, ~150 lines.

**Report:** the remedy and commits, your answer on the declaration mechanism, your ruling on the Stryker exclusion with the owning role named, your decision on §6.2, and separately anything you found that none of this asked about — that section has been the most valuable part of the last three reports.
