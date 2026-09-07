# Prompt · slice 09 · test-engineer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 09 step 2 test-engineer review
- Sent: 2026-09-07T17:24:40.007Z

---

# Slice 09 · step 2 — AGREE or OBJECT to the design

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/09-observability` (checked out, clean, pushed). Pull first.

Read `docs/slices/09-design.md` and `docs/slices/09-observability.md` in full. This is the **close-out slice**: it absorbs slices 10 and 11, carries **seventeen** acceptance criteria and **six** inherited obligations, and it is the **last slice in the project** — there is no later slice to absorb anything you let through here.

## Your job

§6 step 2: review the design and either **agree or object**. Objections here are cheap; the same ambiguity found at step 5 costs a full cycle plus a loopback. §6 is explicit that a round which has never produced a disagreement is not consensus, it is deference — and the retro reads it that way.

You own `tests/acceptance/`, `tests/contract/`, `tests/property/`, `tests/concurrency/`, `tests/performance/`, and database-invariant tests in `tests/integration/`. **`tests/performance/` is yours and it matters here**: QS-14 is a budget, an *acceptance threshold* rather than an optimisation target.

## Five things I want your judgement on specifically

1. **One red commit, three test files.** The slice file used to say "three reds if they need three"; the architect corrected that to one red commit, three test files, one observed red run — on §7's *exactly one red commit per slice*, and on the ground that one run failing seventeen criteria proves none was already passing. **You author that commit.** Is one red run across telemetry, contract and budget actually observable, or does the budget suite's runtime make it impractical?

2. **A-09-2, and it is the sharpest thing in the design.** The architect says AC-7 as previously imagined does **not** kill the seven `description` mutants slice 08 merged on the promise that it would — because `vitest.mutation.config.ts` includes `tests/unit/**` only, so a byte-for-byte assertion in *your* `tests/contract/` leaves them killable and still not killed. Its remedy is that the document is emitted by a function the unit layer can also call, predicting **30/42 → 37/42 = 88.1%**. Does that hold? And does it push work into `tests/unit/` — the implementer's — that you would rather assert outside-in?

3. **QS-14's budget.** What must the design pin so the budget is assertable rather than aspirational — machine class, warmup, percentile, sample size, what counts as a request? The architect records the machine class with every budget run (A-09-1). Is that enough for a threshold that can fail honestly on CI?

4. **O-70.** The concurrency suite went red on a docs-only commit and green on a re-run of the identical sha — one test reporting *"some racers never got an answer at all"*, one a flat 60-second timeout. The architect **refused** to bound racer counts to the runner's CPU count, because QS-1 fixes N=20 and that bound would take N to 2 on a two-vCPU runner and un-assert *"the other 19 receive 409"*. Those are your tests. Do you agree the suite should stay as it is?

5. **AC-5b** was named when slice 08 split AC-5 and never written down until now. Check the other sixteen against the same standard — a criterion that exists only in a ruling is one nobody asserts.

## Boundaries

- **Do not write tests yet.** Step 3 is red. This is review only.
- Do not edit the design — the architect owns it. You object; it rules.
- If you agree with something, say so briefly and move on; spend the words on disagreement.

## Return

The structured report with `objections` populated — each objection naming the criterion, quality scenario or §2 invariant at risk, and the change you would make. If you genuinely agree throughout, say so plainly and say what you checked to get there; agreement that names what it verified is worth something, agreement that names nothing is not.
