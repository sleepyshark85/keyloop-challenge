# Report · slice 05 · test-engineer · invocation 4

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Build R-02-2 — the lock cannot replace the constraint
- Returned: 2026-09-06T11:09:55.610Z
- Duration: 752s

---

R-02-2 is built, committed as `3c0930d`, pushed on top of the implementer's R-02-3, CI green on that head.

```json
{
  "role": "test-engineer",
  "outcome": "red-committed",
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": 0, "integration": 1},
  "quality_scenarios_covered": ["QS-1"],
  "red_commit": "3c0930d",
  "ci_failure_confirmed": false,
  "objections": [],
  "dcr": null,
  "message": "Phase 4 lands: twenty inserts perfectly serialised by ADR-0018's own two locks, constraint dropped, twenty overlapping rows. Two positive controls, both demonstrated failing against mutants. It is a phase of an existing green case rather than a new red one, exactly as ADR-0019 scoped it."
}
```

File: `/home/agentadmin/sources/keyloop-challenge/tests/integration/exclusion-constraint-adjudicates.test.ts` (+230/−24; ~150 of that is code, 79 lines comment).

## Positive controls, and what they showed

I built two, because one is not enough — they catch different mutants.

**Control 1 — the keys are ADR-0018's.** A second session takes `pg_advisory_xact_lock(1, hashtext(bay))` and holds it in an open transaction; while held, no racer may commit. Probe window sized from phase 2's own measured elapsed time rather than a guessed constant, with an arrange guard that fails loudly if the margin is gone. Then a release witness. Mutant: racers moved to lock class 7 while the holder stayed on class 1 → **caught**, `expected 'finished' to be 'still racing'`.

**Control 2 — they serialise against each other.** `race()` now samples the maximum number of racers inside the INSERT simultaneously, identically in every phase. Mutant: locks taken and *released* before the write — check-then-act's own shape, which still blocks on the holder and so sails past control 1 → **caught by this one**, `up to 2 of them were inside the INSERT simultaneously; expected 2 to be 1`.

Caveat I will not hide: control 2's margin under that mutant is 2 against 1. It caught it, but only just.

## Numbers measured

| phase | locks | constraint | rows | refusals | max in flight |
|---|---|---|---|---|---|
| 1 | off | present | 1 | 19 | 20 |
| 2 | off | dropped | 20 | 0 | 20 |
| **4** | **on** | **dropped** | **20** | **0** | **1** |

Twenty rows, asserted as `toBe(RACERS)`, and the table re-counted independently at 20.

## What phase 4 proves that phase 2 does not

Phase 2's twenty rows are equally consistent with a reading nobody had closed: that the overlap follows from the writes being *unserialised*, so mutual exclusion over the bay would have prevented it and the constraint is belt-and-braces. That is precisely the belief that reintroduces check-then-act — and ADR-0018's own Consequences name it, saying a per-resource lock makes check-then-act "correct, not merely harmless". Phase 4 grants perfect mutual exclusion over exactly the bay (max in flight 1, against phase 2's 20) and the same twenty rows land, one at a time, with not one refusal. The lock buys liveness; only the constraint makes overlap unrepresentable. So it is not phase 2 repeated.

## Found while in the file

1. **Your dispatch named the wrong file.** `tests/integration/exclusion-constraints.test.ts` is slice 00's — no phases, no `race()`. `docs/slices/05-cancellation.md` names `exclusion-constraint-adjudicates.test.ts`, and you told me to treat the slice file as the ruling, so I did. Worth noting because this is the same mechanism a third time: ADR-0019 named a slice that never opened the file, and the instruction to fix that named a file that never had phases. A destination nobody verified, again.

2. **"Phase 4" and "phase 2's already-dropped constraint" are jointly unsatisfiable as an ordering.** Phase 3 restores the constraint, so a phase positioned fourth must drop it again — a different drop from phase 2's. I ran it between phases 2 and 3, on literally phase 2's dropped constraint, and named it phase 4 for the cell it fills, with the reason in the file. The evidential clause won over the positional one.

3. **`race()` had no simultaneity measurement, and the file's headline claim rests on the word.** The docblock has said "twenty SIMULTANEOUS inserts" since slice 02 and nothing measured that they were ever simultaneous — the barrier arranges it, no assertion observed it. That is now recorded in every phase (20 and 20) and asserted only in phase 4, where 1 is the claim. I deliberately did **not** assert it in phases 1–3: the value is nondeterministic there and an assertion would trade evidence for flake. If the architect wants phases 1–3's simultaneity asserted rather than merely reported, that is a design call, not mine.

4. **One thing I nearly reported as a defect and checked instead.** My first captured run showed phase 1 with 19 × `23P01` and zero `40P01`, against ADR-0018's measured 108 deadlocks at N=20 — which would have put the liveness half of ADR-0018's case in doubt. Three further runs: `{40P01: 19}`, `{23P01: 19}`, `{40P01: 19}`. It is all-or-nothing per race at roughly the frequency T-02-9 recorded. **ADR-0018 reproduces; there is no finding here.** I am reporting the check because the single observation would have been a wrong and expensive claim.
