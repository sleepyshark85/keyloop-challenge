# Prompt · slice 16 · architect · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: DCR: AC-6 ordering
- Sent: 2026-09-10T02:11:58.986Z

---

**DCR, raised by the orchestrator at step 4/5 boundary, slice 16**, branch `slice/16-availability-derives-its-own-window`, PR #24. The slice is `blocked` pending your ruling. Rule per CLAUDE.md §6, and **reply before you edit** — if your ruling requires an arc42 edit, say so and I will send you back for it in a second pass.

## Step 4 is otherwise complete and green

Three implementer commits on top of the red: `2601410`, `7d572d8`, `b6c1eac`. `nodb` exit 0 (714 passed), `db` exit 0 (194 passed, including the acceptance and property suites). `typecheck`, `build`, `lint:arch`, `docs:openapi --check` all clean. Your `I-16-1` split was implemented exactly as ruled — `outsideOpeningHours` exported as a single-keyword diff, a local `INTERNAL` with a docblock naming the two sibling sites, `PROBLEM_RESPONSES` with a two-member `400` and no `500`. `T-16-1`'s comment cites §6.5 and A-4 without restating them, no test and no Stryker directive. `OQ-16-1` honoured.

## The defect: AC-6 cannot be green at merge

`perf` is exit 1, on exactly one assertion. **The timing passes** — measured p95 **10.50 ms** against the 200 ms budget, on `cpus=16, 13th Gen Intel Core i5-13400F, totalMemMB=15801`. What fails is AC-6's *other* half:

```
AC-6 — arc42 §11 (docs/arc42/11-risks-technical-debt.md) does not yet state a measured
p95 figure for the derived-window availability query. Measured here: 10.50ms.
```

AC-6 as you wrote it says *"The measured p95 is recorded in arc42 §11 **at step 7**"*. But §6's loop is `5 REVIEW → 6 GATE (human exploratory testing, then approval and merge) → 7 AS-BUILT`. **Step 7 is after the merge.** So as specified:

- the slice cannot satisfy §10's Definition of Done (*all tests green*) before the gate, and
- §7's *"`main` only ever receives green merges"* would be violated by merging it, and
- the criterion is unfalsifiable in the window where it matters — it can only go green after the thing it gates has already happened.

This is a criterion-versus-process-order conflict, not an implementation problem. Nobody can fix it from inside their own paths: the figure is arc42, which is yours alone, and step 7 is defined as post-merge.

**To rule (c) design defect you must name the acceptance criterion, §10 quality scenario or §2 standing invariant that would fail** — I believe AC-6 itself plus §7's green-merge rule are both nameable here, but the ruling is yours and I would rather you disagreed with me than deferred. Outcome (a) clarification looks equally available: the arc42 edit simply happens before the gate rather than at step 7, and AC-6's wording is what is wrong.

Whichever way you rule, I need to know **when the figure gets written and by whom**, such that the suite is green at the moment of merge without anyone having faked the ordering.

Note for your consideration: recording a measured figure *before* the gate makes it a number the gate can see and challenge, which seems better than one that appears after approval. But it also means the figure is measured on a pre-merge commit, and I do not know whether you consider that a meaningful difference.

## Second item, not a DCR — a scope routing question

The implementer flagged, and declined to act on, something I want your ruling on. Your slice file lists `docs/WALKTHROUGH.md` Scenario 3's `curl` as **in scope** — it still sends `from`/`to`, so it currently documents a retired request shape. The implementer left it alone because that file is the scribe's by convention (its whole commit history is `docs(N):` from the scribe role) and it was not in the discipline section of its brief. It was right not to drive-by edit it.

Confirm: the scribe updates Scenario 3 before the gate, and it stays in this slice rather than becoming a follow-up. If you disagree, say what should happen instead.

Reply with your rulings and reasoning. Edit nothing in this pass.
