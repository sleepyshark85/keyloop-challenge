# Prompt · slice 19 · test-engineer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Write and commit the red tests
- Sent: 2026-09-10T09:49:58.570Z

---

keyloop-challenge (/home/agentadmin/sources/keyloop-challenge), branch `slice/19-attempt-cap-sized-against-occupancy`, PR #27. **This is §6 step 3 — RED.** Your step-2 objections were adjudicated; write the tests now.

`git pull` first — the design and slice file moved. Read `docs/slices/19-attempt-cap-sized-against-occupancy.md` (**eight** criteria now), `docs/slices/19-design.md` (`369b598`), `docs/adr/0040-*.md`, and arc42 §10 QS-15/QS-16.

## How your objections were ruled

**`T-19-2` AGREED, additively.** QS-16 gains `(20, 8, 4)` beside `(8, 8, 4)`. Already applied to arc42 §10. Your criticism landed against the architect's own §8 argument.

**`T-19-1` — finding AGREED, the `deps.busy` seam REFUSED, and the finding taken further than you raised it.** The architect ruled **AC-3a as worded was false**, not merely unsourceable: *"never a refusal"* is true of the mechanism, not of the system, because the loop is capped at 16 — an adversarial snapshot can spend all sixteen while capacity exists. That is §11 R-4's residual, which the cap ruling reduces probabilistically and does not remove. A seam would buy a fixture whose green depends on its own size: `2M − 1 < 16` passes, larger fails, on a guarantee never given. Second ground: **injecting `busy` replaces the read**, so the one test overriding the snapshot is the one that never exercises `A-19-1`'s wiring — the advantage you claimed for it. What guards `A-19-1` instead: a read over the wrong window returns nothing busy, ordering degrades to ADR-0009's, and **AC-1 falls back toward 165/200 while AC-2's p95 blows out at `k = 11`**. **AC-3a is reworded — read it; it is satisfied jointly by AC-3b and QS-16 with no seam.**

**`T-19-3` (d), provisional, no taint.** Nothing re-authored, AC-2's red stands, step 3 is not re-run. The architect verified independently that `tests/support/service.ts` already carries `BOOKING_SEED`'s name, ADR-0021 citation, unset-vs-set semantics and `spawn` env wiring — the whole composition-root env surface, legitimately, in your own directory. It noted the unprompted disclosure is what made `T-19-1`'s provenance question answerable rather than invisible. The tooling question goes to the gate. **Do not read `src/` again — including via `grep`, `cat`, `sed` or any shell command.** The hook guards the `Read` tool only; the boundary is yours to hold.

## What to build

Your directories only (`CLAUDE.md` §5). Never `tests/unit/`.

- **QS-15 → `tests/property/occupancy-does-not-refuse.db.test.ts`** — AC-1 (12+12, `k=11`, 200 distinct seeds, zero concurrency, all confirmed) and AC-2 (attempts p95 ≤ 2 at `k ∈ {0,3,6,9,11}`). This is where AC-2's measured red becomes **re-executable from the repository rather than quoted from a transcript** — the slice's Definition of Done requires exactly that.
- **QS-16 → `tests/concurrency/no-spurious-refusal-under-occupancy.test.ts`** — AC-4's four tuples `{(20,1,11), (20,4,8), (8,8,4), (20,8,4)}`, barrier-released, exactly `min(N,M)` confirmed. Plus the secondary recorded-not-thresholded measure: `capped` refusals under free-first must not exceed the shipped ordering's at the same tuple and seeds.
- **AC-3b + AC-7 property** — equal multiset against `orderCandidates(bays, technicians, EMPTY_OCCUPANCY, seed)` over arbitrary `busy` (including ids absent from the lists, `busy` ⊇ the whole list, and empty lists), `null` **iff** an input list is empty, and the `EMPTY_OCCUPANCY` element-for-element identity you proposed. Use the existing ADR-0013 `dist/domain/candidates.js` dynamic-import seam.
- **AC-5's half that is yours** — correct the *"refusal is spurious BY DESIGN"* comment at `tests/acceptance/candidate-retry.test.ts:331-335`. Its fixture blocks all 17 bays **and** all 17 technicians, so that refusal is honest in outcome and only its `exit` label is wrong. Doc-only; the assertions are already right.
- **AC-6** — no new test. `tests/performance/availability-budget.test.ts` is the instrument and re-runs as-is.

## The red commit

**Exactly one**, yours, subject matching `test(...): … (red)` — `tools/ci/red-proof.mjs` reads the head commit's subject and the `verify` job's result, so the subject is load-bearing. Attribution footer:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tt2bAYr18YJJMNjQwaAmRA
```

**One thing to think about before you commit, and tell me your reasoning either way:** the new tests call `orderCandidates` with a fourth argument that does not exist yet, so they may fail at *typecheck* rather than at *assertion*. A red that is a compile error still proves the test cannot pass without the implementation, but it proves less about the assertion being right — and `red-proof.mjs` may classify the two differently. If you can make the red an **assertion failure** rather than a type error (for instance by having the domain-level property import through the `dist/` seam, which is untyped at the call site, and by having QS-15/QS-16 drive the real HTTP path, which compiles today and simply refuses too often), that is a stronger red. Say which you achieved for each file.

Push, then report: files, the observed failure output per AC, whether each red is an assertion failure or a compile error, and the commit sha. Do not implement anything. Do not touch `src/`.
