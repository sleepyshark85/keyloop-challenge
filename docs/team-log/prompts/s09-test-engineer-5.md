# Prompt · slice 09 · test-engineer · invocation 5

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Fix AC-15's brittle matcher
- Sent: 2026-09-08T03:02:42.218Z

---

# Slice 09 · AC-15 went red on a hyphen — one focused fix

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/09-observability`, PR #20. Pull first. Logged as **O-75**.

## What happened

CI failed on the **`perf` project alone** — `nodb` 31 files exit 0, `db` 25 files exit 0, `perf` 1 file **exit 1**. That is the third project doing exactly what your BLOCKING `T-09-3` was raised to make it do: the budget failed visibly in its own container instead of being lost in a shared run.

**AC-15 is the failure**, at `tests/performance/availability-budget.test.ts:312-324`. Its matcher is:

```js
/\bwrite throughput\b[\s\S]{0,400}?\d+(\.\d+)?\s*(attempts|writes|requests|bookings)?\s*\/\s*s(ec|econd)?\b/i
```

It requires the literal phrase **`write throughput`, with a space**. Before step 7, arc42 §11 read *"Measured write throughput there: 229.47 attempts/s"* and matched. Step 7 compressed that to *"Measured: 229.47 attempts/s"*, and the only surviving occurrence is **hyphenated** in the heading — *"The write-throughput ceiling bought with goal 1"*. A hyphen, and the criterion went red.

## The judgement I want from you, not just the edit

**The architect did nothing wrong in substance.** The figure is still recorded, the heading still names the concept, §11 came in at or under its ratchet ceiling, and the compression paid for six new debt entries. **Your test is the brittle half** — it pins a stylistic variant of a phrase rather than the fact AC-15 actually demands: that a measured figure for contended write throughput appears in §11.

So fix the matcher, not the prose. But decide how far to go, and say why:

- Accepting `write[-\s]throughput` is the minimum and closes this instance.
- Whether the matcher should key off something more stable than prose at all is the real question. AC-15's substance is *a measured figure is recorded in §11 with the scale it binds at*. If there is a way to assert that which does not break when an editor hyphenates a word, it is worth more than a looser regex — but do not over-build, and do not weaken the assertion into one that passes on any §11 whatsoever.

**Do not edit `docs/arc42/`** — it is the architect's, and changing prose to satisfy a regex is the wrong direction. If you conclude §11 genuinely must say something it currently does not, raise it rather than editing it.

## Context worth having

This is **`A-R-5`'s class inverted**. There, code comments quoted arc42 prose and nothing checked they still matched — §8.6's sentence propagated into eight files and silently stopped matching its source. Here an acceptance test greps arc42 prose and the prose moved underneath it. Same underlying gap, and only one direction has ever been checked. If your fix suggests a general mechanism, name it; do not build it here.

Also not a defect, but know it: the CI figure is **105.33/s against the recorded 229.47/s**, roughly half, on a different machine. `D-09-6` already records that the *headroom* rather than the ceiling is the baseline, and AC-15 asserts only that *a* figure is recorded, not that it matches.

## Land it

`tests/performance/` is yours. Verify the `perf` project passes locally, `npm run test:tools` stays green, commit `test(09):` with an explicit pathspec, push. No PR comment needed — I will fold this into the gate packet.

Return the structured report and your reasoning on how far the matcher should go.
