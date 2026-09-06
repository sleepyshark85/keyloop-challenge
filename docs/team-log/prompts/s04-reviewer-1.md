# Prompt · slice 04 · reviewer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 04 step 5 REVIEW
- Sent: 2026-09-06T07:40:49.800Z

---

Slice 04 step 5 — REVIEW. Branch `slice/04-candidate-allocation-and-retry`, PR **#13** (draft), base `main`. Read the PR body first: it is the slice's own account of itself and part of what you are reviewing.

CI run **34019756105** on `96d0971` is in flight as you start. Collect it yourself; do not review against a stale run, and do not take my word for its result.

**Scope.** Diff `main..HEAD` against `docs/slices/04-*.md` (design + the (a) ruling), the five acceptance criteria, arc42 §5.2/§6.2/§7.3, and ADRs 0009, 0018, 0020, 0021, 0022. Plus `dependency-cruiser` and the Stryker survivors below.

**Mutation: 0.9756 on changed files** (threshold 0.75), repo-wide 0.9582 over 909 mutants. Report at `reports/mutation/mutation.json`. Eight survivors on changed files:

```
bookAppointment.ts:245  ConditionalExpression  "case 'derived':"
bookAppointment.ts:245  StringLiteral          ""
bookAppointment.ts:312  EqualityOperator       "attempts < structuralBound"
bookAppointment.ts:445  StringLiteral          "``"
candidates.ts:66        ArithmeticOperator     "state - 0x6d2b79f5"
candidates.ts:69        ArithmeticOperator     "t - Math.imul(t ^ t >>> 7, t | 61)"
config.ts:211,213       StringLiteral          "``"
```

Two of these the implementer **predicted before the run** — the `mulberry32` constants, unpinned because the property file deliberately asserts *a* permutation rather than *a particular* one. Judge whether that reasoning holds or is a comfortable story.

**`bookAppointment.ts:312` is the one I want tested rather than accepted.** The loop bound `attempts <= structuralBound` survives mutation to `<`. ADR-0020 makes the tail unreachable by construction, so one fewer iteration should change nothing — which makes it a *plausible* equivalent mutant. Plausible is not established. Establish it or refute it.

**Four things to check that a diff-vs-design pass will not surface on its own:**

1. **§5 test ownership, both directions.** The implementer's six commits must touch no outside-in test directory; the test-engineer's `39c2588` must touch no `src/` and no `tests/unit/`. I checked both and found them clean — verify independently, because a check I ran is not evidence for you.
2. **§7 commit discipline.** Exactly one red commit, authored by the test-engineer. Every implementer commit green *and* typechecking — the implementer reports it amended `1ed6a58` after finding that `tests/unit/domain/candidates.test.ts` passed under vitest while `tsc` rejected three lines. Confirm every commit on this branch passes `tsc --noEmit`, not just HEAD. Commits over ~150 lines should have been two.
3. **A-04-11, open and yours.** ADR-0021's startup `warn` is R-7a's stated mitigation, and it is asserted only in `tests/unit/platform/config.test.ts` — implementer-owned. A risk an ADR knowingly created is guarded solely by a test the party it constrains may freely change. Is that acceptable, or does it need an outside-in assertion? You may block on it; you may not write the test.
4. **The remedy commit `39c2588` removed an assertion.** Verify the three claims said to make it unnecessary are genuinely permutation-independent, and that `candidate-retry.test.ts` AC-3 really does catch a loop-less build *exactly* rather than as a lower bound. The test-engineer says it does and that no QS-2 gap remains. That is precisely the kind of claim a reviewer exists to disbelieve first.

**How to report.** You may block a merge and raise a DCR; you may not change the design and you may not edit tests or `src/`. Under the standing delegation the architect rules any DCR mid-slice — so raise it, do not route it to the human.

A review with no findings is read the same way §6.3 reads an adjudication round that never disagreed. That is not an instruction to manufacture findings; it is a warning that "looks good" is not a review. Equally, a finding you check and withdraw is worth recording — the architect withdrew one this slice and said so, and that is the standard.

Report the standard reviewer JSON plus: the CI run id you collected and its three job conclusions, your verdict on `:312`, and — separately — anything you found that none of the above asked about.
