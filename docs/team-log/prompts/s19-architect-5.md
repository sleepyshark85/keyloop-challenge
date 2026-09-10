# Prompt · slice 19 · architect · invocation 5

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Step 7 as-built reconciliation
- Sent: 2026-09-10T13:26:44.470Z

---

keyloop-challenge (/home/agentadmin/sources/keyloop-challenge), branch `slice/19-attempt-cap-sized-against-occupancy`, PR #27. **This is §6 step 7 — AS-BUILT.** `git pull` first. Everything below is merged on the branch and green.

## What actually shipped

| sha | what |
|---|---|
| `d177ee0` | design, ADR-0040, QS-15/QS-16 |
| `369b598` `bb19373` | step-2 adjudication (5 findings) |
| `076a1ab` | **the red** — CI run 34464606313, 922 tests, exactly 5 failed, `red-proof: success` |
| `56269be` `2aeeacb` | free-first ordering; `bookAppointment` reads occupancy once |
| `6f173bf` `343aef9` | `I-19-2` ruled (a), AC-8 |
| `e1d925a` | AC-8 built — QS-13 re-sourced onto three fixtures |
| `44e732e` `a1a78ab` `4438cf9` `eb10625` | step-5 remedies |

**Measured, as built:** AC-1 **200/200** at `k=11` (red 163/200) · AC-2 attempts **p95 = 1** at every `k` · QS-16 exact `min(N,M)` at all four tuples · AC-6 **18.37 ms** uncontended booking, **14.16 ms** availability (budgets 100/200) · mutation **0.9091**, every changed file above 0.75, zero survivors in `freeFirst`/`orderCandidates` · dependency-cruiser clean · 0 of 2 loopbacks.

## Your obligations at step 7

**1 · AC-5's arc42 half — the only part of AC-5 still undone.** The `candidate-retry.test.ts` half landed in the red commit.
- `docs/arc42/04-solution-strategy.md:65` and `docs/arc42/06-runtime-view.md:50` still carry *"a `409` therefore means the dealership was full rather than that the allocator guessed badly"*. These are the **complete set** — you swept it and I verified: exactly two instances.
- `docs/arc42/11-risks-technical-debt.md:174-175` — **R-4 rewritten against the executed figure**, per your ruling 4 (`capped` becomes **unlikely, not impossible**).
- §5.2, §6.2, §8.4 per design §9.

**2 · AC-6's figures into §11**, beside their machine class, as `tests/performance/availability-budget.test.ts` demands.

**3 · `OQ-19-2` — an open MAJOR, and Done blocks on it.** Your own step-1 finding: *a recorded seed no longer reproduces a run on its own; the permutation depends on the snapshot too.* That narrows ADR-0009's consequence *"a seeded order plus a recorded seed makes a failing interleaving re-runnable"*, which ADR-0040 inherits. **Rule it**: either `booking.refused` carries the snapshot, or the weakened guarantee is accepted and booked in §11 with a destination named per ADR-0019 (a deferral that cannot say where it went is an omission wearing a routing's clothes). Do not let it lapse.

**4 · `R-19-5` · MINOR — arc42 cites a figure its own named file cannot reproduce.** The slice file, arc42 §10 and ADR-0040 all say **165/200** (my hand probe). The committed fixture measured **163/200**, and since `BOOKING_SEED` is deliberately unset it is a fresh random variable every run. That runs against this slice's own DoD clause — *reproducible from the repository, not quoted from a transcript*. Decide what the documents should say: the executed figure with its provenance, a range, or a qualitative claim. **The slice file is mine — tell me the wording and I apply it.**

**5 · `R-19-6` · MINOR — and it corrects two roles, including a claim of yours.** The reviewer's arithmetic:
- At the three tuples with `N > M`, **a spurious refusal is masked** — a surplus racer picks up the pair the refusing one abandoned and the count still reads `min(N,M)`.
- Only `(8,8,4)`, where `N == M`, makes one visible — exactly where it was measured firing **3 of 8** local runs. So **one invocation is ~38%-powered**, and nothing in arc42 §10 says so.
- **At `(20,8,4)`, `2M − 1 = 15` fits inside the cap of 16**, so Bound-2 can exhaust the whole free group without reaching the cap — a spurious refusal there is *structurally unreachable*. The test-engineer's stated reason for adding that tuple — "most likely to be **produced**" — reads as **the opposite of what the arithmetic gives**.

Your design §8 says *"unfalsified, not absent"*, which is honest; **arc42 does not carry it**. Rule whether QS-16's tuple set should change, and get the power caveat into §10 so a future reader cannot read a green QS-16 as "the burst risk is measured absent".

**6 · ADR-0040's status.** It is `proposed`. arc42 §11's rule is that a merge does not move an ADR out of `proposed`; ratification is yours under the human's standing delegation, and it is **provisional until the gate**. Decide, and say which.

## Boundaries

arc42, `docs/adr/`, `19-design.md` are yours. **Do not touch `src/` or `tests/`** — the slice is green and I am not reopening it for prose. **Do not `git add`** `docs/STATUS.md`, `docs/team-log/`, `docs/DEFECTS.md`. A full-project mutation run is executing concurrently and will briefly rewrite `src/` files in place — do not be alarmed by, or interact with, transient `src/` diffs.

Commit `docs(19): …` with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tt2bAYr18YJJMNjQwaAmRA
```

Run `docs:check`, `docs:adr-check`, `docs:budget:check`, `log:check`; report each.

## Report

- Per obligation: what you wrote, and for `OQ-19-2`/`R-19-5`/`R-19-6` the ruling with its reasoning.
- Any as-designed vs as-built **delta** — where what merged differs from what you specified at step 1. Name it; the scribe needs it and the gate should see it.
- **What you would not sign if you were not also the author.** You were asked this at slice 16's gate and named something real. Answer it again.
- A short self-contained PR comment I can post verbatim, beginning `**architect` at line start.
