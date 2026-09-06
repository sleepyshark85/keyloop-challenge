# Prompt · slice 04 · test-engineer · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: F2 — guard R-7a's mitigation outside-in
- Sent: 2026-09-06T07:52:15.732Z

---

Slice 04 step 5 raised a MAJOR finding on a file you own. Branch `slice/04-candidate-allocation-and-retry`, checked out and now merged up to `main`. PR **#13**.

**F2 — R-7a's mitigation is unguarded at both ends.** ADR-0021 introduced `BOOKING_SEED`, and arc42 §11's R-7a names the startup `warn` as the mitigation for the risk that ADR knowingly created. The reviewer established that neither end of it is actually held:

- **(a) The actionable sentence is unpinned.** `tests/unit/platform/config.test.ts` pins `src/platform/config.ts:210` (`toContain('BOOKING_SEED=99')`) and `:212` (`toMatch(/Order-A/)`). Delete `:213` — *"It is for reproducing a run, never for production"*, the only sentence that tells an operator what to do — and the whole suite still passes. That is Stryker's `config.ts:213` survivor, and it is the **one survivor of eight that is not equivalent**. The unit test's own comment says "the wording is asserted, not merely the count", which is true of two of four fragments and false of the two that survived.
- **(b) The emission is asserted by nothing at all.** `config.warning` appears exactly once in the repository, at `src/main.ts:46`. No outside-in test asserts it, and `stryker.config.mjs` excludes `!src/main.ts` on the stated ground that it is *"the composition root: wiring, asserted by AC-2 end to end"*. **Delete `main.ts:46` and `BOOKING_SEED` runs Order-A in production with no operator warning, while `npm test`, `npm run mutation` and `depcruise` all stay green.**

The reviewer tried to establish (b) by deleting that line in a throwaway worktree; `guard-paths` correctly refused it, so (b) rests on the grep and the Stryker exclusion. Both are checkable — check them yourself rather than taking the report.

**What is yours.** The reviewer named the cheap remedy and deliberately did not write it: `tests/acceptance/candidate-retry.test.ts` AC-5 already starts the service with `bookingSeed` set and already reads log records, so asserting one `config.warning` record at `warn` is a few lines in a file you own. Half (a) is an implementer-owned unit test and is **not yours** — do not touch `tests/unit/`. Your assertion, being outside-in, closes (b) and can also carry the operator-actionable content that (a) leaves loose, which is the better home for it anyway.

**What I want you to decide rather than assume.** Whether the right assertion is on the *warning's presence*, on its *content*, or both — and how much content, given that pinning wording is what made the unit test brittle in the two places it did pin and useless in the two it did not. State the reasoning. An assertion that pins a whole sentence is how the next rewording becomes a false failure; an assertion that pins nothing is what we already have.

Then answer one thing the review did not ask: **does an assertion here actually discriminate?** Name the mutant — the build in which `main.ts:46` is deleted — and say whether your test fails against it. If it does not, you have written the same class of test the review just faulted.

**Constraints.** No `src/`, no `tests/unit/`, no ADR, no arc42. `test(04): …`, ~150 lines. Then push, so CI runs on the head that would merge — F3 in the review is that no CI run exists for HEAD.

Report the standard JSON plus: your mutant result, what you decided to pin and what you deliberately left loose, and whether you think `stryker.config.mjs`'s `!src/main.ts` justification is still true after your change. That last one is not yours to edit — say what you found.
