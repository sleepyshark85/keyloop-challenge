# Prompt · slice 09 · architect · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Rule T-09-4 AC-12 passes at red
- Sent: 2026-09-07T19:18:32.003Z

---

# Slice 09 · rule `T-09-4` — a criterion that passes at red

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/09-observability`, PR #20. Pull first. **One ruling; the implementer is working step 4 in parallel, so do not touch `src/` or `tests/`.**

## The finding

You ruled at step 2 that the "three test files" count becomes a **coverage property**: every one of the seventeen criteria and both architecture controls fails in the one observed red run — on the ground that one run failing everything proves nothing was already passing, the reasoning that withdrew AC-7 at slice 08.

**AC-12 breaks that property.** It asserts the availability query's p95 under 200 ms, and the test-engineer measured it at **≈ 9 ms** against its own fixture of 500 appointments, 5 bays and 20 technicians — roughly **twenty-two times under budget**. The endpoint shipped in slice 08, so the budget is met before the slice asserting it begins. Unlike AC-13, it has **no second clause to fail on**: AC-13 is still red overall through its INSERT-count half.

The test-engineer **refused the two available ways to manufacture a red** — lowering the threshold, or adding unrelated assertions — on the ground that either would misrepresent the criterion, and reported the hole instead. I think that was the right call and I want it on the record as such.

## What to rule

`CLAUDE.md` §2.4: *a test that has never failed is not evidence.* AC-12's test has never failed. So:

- **Is a budget already met evidence of anything?** QS-14's own framing in §10.2 is that a goal with no number is a goal nobody can fail. AC-12 has a number. What it may not have is a way to fail *in this slice*.
- **Does AC-12 need a different shape?** The test-engineer named two possibilities without choosing: a **regression floor** rather than a ceiling, or an **explicit statement** that it guards future work rather than being a criterion this slice earns. There may be others — a fixture large enough to make 200 ms discriminating would be a third, and you should say why it is or is not honest.
- **Does the coverage property survive with one criterion outside it?** If it does, say what it now claims, precisely, because it was stated as covering everything. If it does not, say what replaces it.

Note what remains true regardless: the other sixteen criteria and both controls **did** fail in the observed run, and `red-proof` confirmed six files red with **no unit test failing** — the discrimination that matters is intact.

## Constraints

- **Ruling (c) requires naming a failing AC, `QS-*` or §2 invariant.** §2.4 is nameable here, which makes (c) genuinely available for the first time this slice — so if you rule otherwise, say why §2.4 is not breached rather than passing over it. Loopbacks are **0 of 2** on the last slice.
- No new ADR unless it truly sits at the human's 2026-09-07 bar.
- Amend `docs/slices/09-*.md` only. Commit `docs(09):`, **explicit pathspecs**, push.
- Post one PR comment on #20, `**architect · T-09-4 — RULING**`, ~120 words, short and self-contained.

## Return

The verdict with its outcome letter, what AC-12 becomes, and whether the coverage property stands as stated or is replaced.
