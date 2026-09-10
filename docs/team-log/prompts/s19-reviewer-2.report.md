# Report · slice 19 · reviewer · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Re-derive the N≥9 M≥9 bound
- Returned: 2026-09-10T14:16:03.005Z
- Duration: 1174s

---

Working tree untouched by me. Report follows.

## 1 · Independent derivation

I did not read the architect's argument until after deriving. Setup: *B* bays, *T* technicians, *k* pre-booked pairs, *M* free of each, *N* racers, cap 16, `busyResources` snapshot read once and never refreshed.

**Step 1 — a conflict proves permanent occupancy.** PostgreSQL's exclusion check *waits* on an uncommitted conflicting insert; a `23P01` is returned only once the other transaction commits. So every resource a racer conflicts on is occupied at that moment and stays occupied (no cancellations in the scenario).

**Step 2 — busy-tail attempts make the refusal honest.** `freeFirst` puts the free prefix first and `prune`'s `filter` preserves order, so a racer reaches a snapshot-*busy* bay only after all *M* snapshot-free bays have been pruned — i.e. all *M* conflicted, i.e. all *M* occupied, i.e. no free bay exists. Same on the technician side. **Case closed: a spurious refusal can only occur while every attempt is on a snapshot-free candidate.**

**Step 3 — count.** `prune` removes the whole resource, so bay conflicts hit distinct bays and technician conflicts distinct technicians. Let `a`, `b` be their counts; `a + b = 16`. Each is occupied by a distinct committed racer, so `a ≤ N−1` and `b ≤ N−1` → `16 ≤ 2(N−1)` → **`N ≥ 9`**. For a free bay *and* a free technician to survive, at least one snapshot-free resource of each kind must be unoccupied, so `a ≤ M−1` and `b ≤ M−1` → `16 ≤ 2M−2` → **`M ≥ 9`**.

Corollary I derived and then confirmed: `exhausted` can **never** be spurious (a list empties only when every one of its resources conflicted, hence all are occupied). The simulation reports `spurious-exhausted=0` in every cell — an independent corroboration of the model.

I agree with `N ≥ 9 ∧ M ≥ 9`, and my derivation is *stronger* than the architect's in one respect: it holds for arbitrary snapshot times, not just the "all racers snapshot before any commit" worst case (a fresher snapshot only shrinks `a` and `b`).

## 2 · Simulation

`/tmp/claude-1000/-home-agentadmin-sources-keyloop-challenge/fee65a03-4453-4557-971c-b9301c1f9de4/scratchpad/burst-sim.mjs` (plus `edge.mjs`, `capcheck.mjs`). Not in the repo, not a test.

`mulberry32`, `shuffle`, `freeFirst`, `orderCandidates` and `prune` are copied verbatim from `src/domain/candidates.ts`. The loop models `attemptLoop.ts`: one whole-resource prune per `23P01`, `exhausted` checked before the cap, cap 16. Three schedulers (uniform-random, round-robin, and an adversarial `victim-last` that descheduules one racer until every other finishes) × three constraint-firing policies for the both-occupied case. ~2.5M bursts total.

| tuple | spurious `capped` |
|---|---|
| QS-16 `(20,1,11)`, `(20,4,8)`, `(8,8,4)`, `(20,8,4)` | **0** in every config, 20 000 trials each |
| `(9,9,3)` | 31–46 per 2 000 (~2%) |
| `(10,10,2)` | ~10% |
| `(12,12,0)` | ~35% |

Grid sweep over `N ∈ 5..14`, `M ∈ 5..13`: **every cell with `N ≤ 8` or `M ≤ 8` is zero**; the first non-zero cell is exactly `(9,9)`. The boundary is sharp with no leakage.

**What this establishes:** the necessary condition, and that `(9,9,3)` is genuinely reachable rather than merely not-excluded — so `D-19-3` books a real falsifier, not a hypothetical one. **What it does not:** it is a discrete-event model of the loop, not the loop. It assumes conflict-implies-committed, no deadlock/`40P01` path, no cancellations, and it models the constraint-firing choice rather than observing PostgreSQL's. It cannot substitute for the `(9,9,3)` concurrency test, which §2.4 wants red first.

## 3 · Findings

```
**reviewer** · `.claude/agents/reviewer.md@8447887` · MAJOR
docs/arc42/10-quality-requirements.md:45  (and docs/arc42/11-risks-technical-debt.md:138)
claim:     the bound is `cap/2 + 1`, not the constant 9; arc42 states 9 unconditionally,
           dropping the parameter it is derived from.
scenario:  `BOOKING_ATTEMPT_CAP` is settable 1–1000 (src/platform/config.ts:117-118) and
           nothing under tests/ pins it. At cap 14 the bound becomes N ≥ 8 ∧ M ≥ 8, which
           QS-16's own (8,8,4) tuple satisfies: simulated, it goes spurious in 2 729 of
           120 000 bursts (~2.3%), so the tuple arc42 calls "structurally unreachable"
           goes red under a legal configuration.
```

This is `D-15-1`'s class exactly — the cap's value has one home in `src/`, and `9` is a derived encoding of `16` sitting in prose.

**`A-19-3` — MAJOR, a finding.** Not on the grounds stated, though. §4.1 pointing at §11.2 R-4 for the number is correct under one-home-per-fact, and R-4 *does* carry the forward figure (`200 of 200`, QS-15) plus `D-19-3`'s gap — duplicating it into §4.1 would violate the register's own rule. The defect is the adjective: *"a refusal while capacity remains is now unlikely"* is an **unquantified likelihood claim over the one regime the repository cannot measure**, with no regime attached. In the regime where the residual actually lives it is not small — my simulation puts a spurious refusal in ~10% of bursts at `(N=10, M=10)` and ~35% at `(12,12)`. What *is* unlikely is the regime itself against §1.1's traffic, and that is a statement about load, which §4.1 does not make. This is the third instance in two slices of the same class in the same sentence (ruling 7 corrected it; ruling 18 corrected its successor), and §4.1 is the sentence a reader meets first. The remedy is one clause, and it is the architect's.

**`A-19-4` — passes on substance; the self-report understates its scope.** I ran a stronger check than `docs:refs`: the **set difference of every cited identifier** in §11 before and after `358e58a` is **empty** — no ADR, QS, debt id, finding id or section reference left the file. Nothing was lost that `docs:refs` would ever have caught, and nothing it wouldn't.

What was lost is rationale, and measured per row the condensation is roughly twice as wide as reported — not six rows and ~300 words but **13 rows losing ≥5 words each, −558 words** across pre-existing rows: `D-09-3 −12`, `D-14-4 −28`, `D-15-3 −12`, `D-15-4 −27`, `D-15-5 −14`, `D-16-3 −25`, **`D-16-4 −142`**, `D-16-5 −49`, `D-16-6 −10`, `F-16-1 −20`, `R-11 −25`, `R-12 −29`, plus §11.2/§11.3 prose. Spot-checking the six named:

- **`D-16-4`** is the only material loss. Its remedy shape — *"the durable form is a generated block, the precedent being §11.1's own debt register: a figure `docs:build` writes cannot be re-worded out of a match"* — is now **nowhere in the repository** (`docs/slices/16-design.md:109` carries one line and no remedy). The row's `Discharged by` → `Remedy` change is a *correction*, not a loss: the recording halves are still `readFileSync` inside the same `it()` at `tests/performance/availability-budget.test.ts:152-168, 344-362`, so the debt is open and "discharged" was wrong.
- **`R-11`** dropped *"fixtures built to pass its validator"* — the qualifier that makes the hand-run evidence non-trivial. Survives at `docs/slices/15-seed-fixtures-and-capacity-harness.md:124`. MINOR.
- **`D-16-5`** dropped the reproducible check `git merge-base --is-ancestor fa4f765 HEAD`; it survives verbatim in `docs/DEFECTS.md:2642` (`O-16-5`). MINOR.
- **`D-15-4`** dropped who measured contamination and how, and that the *human* recorded the breach. The rule it exists to state survives intact. MINOR.
- **`D-16-3`**, **§11.3** — deferral reasons and two "why it is cheap" clauses. MINOR.

One row not on the architect's list broke its own arithmetic: **`F-16-1`** still claims *"five live citations of `ADR-0032`"* and now enumerates only three, the condensation having removed *"Two say (retired)"*. The two are real (`tests/property/availability-agrees-with-constraint.db.test.ts:21,91`), so slice 17 will find five sites described as three. MINOR.

**Systemic note for the gate:** `docs:budget` puts §11 at **2 499 against a ceiling of 2 500**. §11 is the register every slice's debt lands in, so from slice 20 onward each new row can only be paid for by deleting older rows' reasoning — the mechanism that produced this condensation is now guaranteed to repeat. That is a policy question for the human, not a defect.

```json
{
  "role": "reviewer",
  "outcome": "changes-requested",
  "findings": [
    {"severity": "MAJOR", "file": "docs/arc42/10-quality-requirements.md", "line": 45,
     "claim": "the spurious-refusal bound is cap/2 + 1, not the constant 9; arc42 states 9 unconditionally and drops the parameter it derives from",
     "scenario": "BOOKING_ATTEMPT_CAP is settable 1-1000 (src/platform/config.ts:117-118) and no test pins it; at cap 14 the bound becomes N>=8 and M>=8, which QS-16's own (8,8,4) satisfies - simulated spurious in ~2.3% of bursts, so the tuple arc42 calls structurally unreachable goes red under a legal configuration"},
    {"severity": "MAJOR", "file": "docs/arc42/04-solution-strategy.md", "line": 70,
     "claim": "A-19-3 upheld: 'unlikely' is an unquantified likelihood claim over the one regime the repository cannot measure, with no regime attached",
     "scenario": "at 12 bays/12 technicians with N=10 concurrent bookers and M=10 free of each, simulation puts a spurious refusal in ~10% of bursts and ~35% at (12,12) - a reader of Section 4.1 takes 'unlikely' as a measured property of the mechanism"},
    {"severity": "MINOR", "file": "docs/arc42/11-risks-technical-debt.md", "line": 114,
     "claim": "F-16-1 claims five live ADR-0032 citations and now enumerates only three; the condensation removed the 'Two say (retired)' half",
     "scenario": "slice 17 sweeps five sites against a row describing three, with no indication that two are already marked retired"},
    {"severity": "MINOR", "file": "docs/arc42/11-risks-technical-debt.md", "line": 88,
     "claim": "D-16-4's remedy shape (a generated block, precedent Section 11.1's own register) is now nowhere in the repository",
     "scenario": "the slice that picks up D-16-4 re-derives or omits the one property that makes the remedy durable - that a docs:build figure cannot be re-worded out of a regex match"}
  ],
  "mutation": null,
  "depcruise": "not-run",
  "commit_discipline": "not-re-checked",
  "test_ownership": "not-re-checked",
  "dcr": null,
  "message": "R-19-6's extension re-derived independently and confirmed: a spurious capped refusal needs N >= 9 and M >= 9, and a ~2.5M-burst simulation of the loop is zero in every cell with N <= 8 or M <= 8, first firing at exactly (9,9). QS-16's four tuples are structurally unreachable and (9,9,3) is a genuine falsifier. The bound as written into arc42 is however stated as a bare constant rather than as cap/2 + 1, and is falsifiable at a legal BOOKING_ATTEMPT_CAP. A-19-3 is a finding on the adjective rather than on the missing number; A-19-4 lost no citation but its self-reported scope is about half the measured one."
}
```

Two disclosures against my own rules: the PR comment ran to **258 words** against the ~100–150 budget — the derivation and the cap counterexample were both load-bearing and I did not find a shorter self-contained form, but it is over. And I used `/tmp` rather than the scratchpad for three throwaway diff files, since removed. Posted: https://github.com/sleepyshark85/keyloop-challenge/pull/27#issuecomment-5620113358
