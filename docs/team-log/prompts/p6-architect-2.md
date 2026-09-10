# Prompt · phase 6 · architect · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Restore section 11 binding scale
- Sent: 2026-09-09T08:46:11.529Z

---

Fix a failing acceptance test. `docs/condense` is red and has been since before this session; `main` is green. No ADR — this restores a claim that was deleted, it does not decide anything new.

## The failure

```
FAIL |perf| tests/performance/availability-budget.test.ts
  QS-14 > AC-15 — the measured write throughput for one contended resource,
         and arc42 §11 stating it
  AssertionError: AC-15 — arc42 §11 does not yet state the dealership scale
  at which that figure becomes binding.: expected false to be true
```

AC-15 makes two greps against `docs/arc42/11-risks-technical-debt.md`:

```js
mentionsThroughputFigure = /\bwrite[\s-]+throughput\b[\s\S]{0,400}?\d+(\.\d+)?\s*(attempts|writes|requests|bookings)?\s*\/\s*s(ec|econd)?\b/i
mentionsBindingScale     = /\bdealership\b[\s\S]{0,200}?\bbinding\b|\bbinding\b[\s\S]{0,200}?\bdealership\b/i
```

The first still passes — R-1 keeps the measured figure. **The second fails.**

## What broke it, established by bisect

| Commit | AC-15 binding-scale grep |
|---|---|
| `main` | PASS |
| `4dc252a~1` | PASS |
| `4dc252a` *docs(condense): arc42 at 43% of its length* | **FAIL** |
| every commit after, including HEAD | FAIL |

`4dc252a` condensed §11 and deleted a whole paragraph from **R-1 · The write-throughput ceiling bought with goal 1**. Here it is verbatim from `4dc252a~1`:

> **Binding scale.** Against §1.1's *tens of appointments a day*, the contended figure binds at roughly two hundred simultaneous bookers on one slot — which no dealership generates organically; it arrives as a campaign funnelling many at one advertised slot. The aggregate limit binds first, at sustained bookings in the low thousands per second. **The first move is partitioning by `dealership_id`**, which A-9 permits: an exclusion constraint cannot span partitions and need not.

Note what went with it: not only the binding scale, but **the remedy** — partitioning by `dealership_id`, and the reason A-9 permits it. That is architectural content, not padding, and §11's job is to record exactly that kind of thing.

## What to do

Restore the substance to R-1. You may restore it verbatim or re-condense it in keeping with `4dc252a`'s intent, at your judgement — but whatever you write must:

1. **State the scale at which the contended figure becomes binding**, and satisfy `mentionsBindingScale`: the words `binding` and `dealership` within 200 characters of each other, either order. Do not write to the regex — write the claim, then check the regex is satisfied as a consequence. If you find yourself inserting a word to please a pattern, you have written the wrong sentence.
2. **Keep the remedy** — partitioning by `dealership_id`, permitted by A-9 because an exclusion constraint cannot span partitions and need not.
3. **Keep the aggregate-versus-contended distinction**, since R-1's whole point is that the two limits are "routinely confused".

## Constraints

1. **Do not touch `tests/performance/`.** CLAUDE.md §5 makes it the test-engineer's, and says why: "QS-14's budget is an acceptance threshold rather than an optimisation target". If you believe AC-15 is wrong, raise a DCR — do not edit the assertion.
2. Budget: §11 is at **1,073 words against a ceiling of 2,500** — ample headroom. Do **not** run `--rebaseline`: the file will grow slightly, and recording that would ratchet the wrong way.
3. Touch only `docs/arc42/11-risks-technical-debt.md`. No `src/`, no `tests/`, no other arc42 section, no ADR, no team-log write.
4. **Do not commit.** Leave it in the working tree; I will verify and commit.
5. **Verify by running the test, not by inspection:** `npx vitest run --project perf`. It needs Docker, which is available on this machine. Report the actual output. The rest of the suite (`nodb` 33 files, `db` 25 files) passes, so AC-15 is the only assertion the condensation broke — but confirm perf is fully green, all 5 tests, before reporting.
6. Also run `npm run docs:budget:check`, `npm run docs:refs`, `npm run docs:check`.

## One thing to tell me in your report

`4dc252a` deleted a paragraph that an acceptance test asserts, and nothing caught it for several commits, because it is a *performance* test that reads a *documentation* file and a docs branch has no reason to run the database suite. Say briefly whether you think anything cheap would have caught it — and if the answer is "the condensation should have run `npm test`", say that plainly rather than proposing a new mechanism.
