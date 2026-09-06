# Report · slice 04 · test-engineer · invocation 3

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: I-04-10 remedy — remove the flaky claim
- Returned: 2026-09-06T07:37:25.228Z
- Duration: 718s

---

Done. Commit `39c2588`, four files, no `src/`, no `tests/unit/`, no ADR or arc42 touched.

```json
{
  "role": "test-engineer",
  "outcome": "revised",
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": -1},
  "quality_scenarios_covered": ["QS-2"],
  "red_commit": "39c2588",
  "ci_failure_confirmed": true,
  "objections": [],
  "dcr": null,
  "message": "The two-attempt assertion is removed, not substituted, and the header prose with it. Measured 6 failures in 20 runs before, 40/40 green after. Points 1-4 all verified sound; one addition to point 2, and no QS-2 gap."
}
```

**Run counts.** Before: **20 runs, 6 failures** (30%; predicted ~44%), every failure the same assertion with `attempts seen: [1 ×19]` — nineteen losers each refusing correctly at attempt 1. After: **40 runs of `/home/agentadmin/sources/keyloop-challenge/tests/concurrency/no-technician-overlap.test.ts`, 40 green**; then **5 full runs of the db project** (45 tests) and one nodb run (483 tests), all green. At the measured 30% rate, 40 consecutive greens by luck is ~7×10⁻⁷.

**Points 1–4.** Nothing wrong, one thing missing.

1. Correct, and I agree with the narrower remedy. The three terminal claims are permutation-independent for the reason you gave — `technicianConflicts >= 19` holds because the technician list is length 1, so emptying it costs exactly one `no_technician_overlap` regardless of what a loser drew first. A fourth would have been padding.
2. Correct, **and it goes one paragraph further than you named.** The header's banner claim — *"THIS CASE IS THE ONE E-02-1 WAS RULED FOR, AND IT CANNOT PASS WITHOUT THE RETRY LOOP"* — is stale by the same mechanism. Under Order-C a loop-less build draws one candidate; if it is not the winner's bay it conflicts on the technician, reports `resource: 'technician'`, and **passes**. So the file's discrimination is the same ~56%, not a certainty. That is prose, not an assertion, so it never made anything flaky — but it overstates what the fixture proves, and I-02-9's rule applies to it identically. Rewritten to say so, with `candidate-retry.test.ts` AC-3 named as where E-02-1's guarantee is now anchored.
3. **Verified, and it is stronger than you stated.** `candidate-retry.test.ts` AC-3 asserts `toEqual(['1:no_bay_overlap','2:no_bay_overlap'])` on a fixture where both bays are blocked — every draw is blocked, so it is exact, not a lower bound. `no-spurious-refusal.test.ts` AC-2 asserts `>= 2`, but a correct build owes `>= 8` there: 12 of 20 racers must be refused and E3 independently requires `attempts >= m = 8`. Neither is weaker than you said. No relocation needed.
4. Correct on all three of mine. `error-taxonomy.test.ts` had the same staleness in **both** AC-11 comments — the technician case claimed the first attempt violates both constraints (now 1-in-3, since three bays are the abundant list), and the bay case named a specific pair `(bay 0, technician 0)` that the shuffle no longer picks. Assertions in both are terminal and untouched.

**The structural rule** went into `/home/agentadmin/sources/keyloop-challenge/tests/support/booking.ts`, in the `seedScenario` docstring — the function every contention fixture calls to choose `{bays, technicians}`, so it is read at the moment the choice is made rather than after. Both concurrency headers point at it. I also corrected `bayIds`' field comment there: `ORDER BY name` is the shuffle's stable *input*, and `bayIds[0]` is the first row, never the first attempt.

**Does removing it leave QS-2 with a gap? No.** Everything QS-2 asserts — one row over the table, the 1/19 split, `technicianConflicts >= 19`, `resource === 'technician'` — is intact and now permutation-independent. The removed claim was never a QS-2 claim; it was a *loop-behaviour* claim living in a QS-2 file, and it is deterministic in AC-3 and AC-2 as verified above.

The one thing I would put on the record without asking for a backlog item: the E-02-1 *discrimination* has quietly migrated. Slice 02 designed this file to be the fixture that catches a loop-less build, and Order-C reduced it to a ~56% detector; `error-taxonomy.test.ts`'s AC-11 mirror is now ~33%. Both are still correct, and `candidate-retry.test.ts` AC-3 catches it every time, so the suite has no hole — the guarantee just no longer lives where two file headers say it does. I have written that into all three headers rather than proposing a `(b)`, because the coverage is real and only the narration had drifted. If you would rather it were a backlog item that re-homes QS-2's discriminator explicitly, that is your call, not mine.
