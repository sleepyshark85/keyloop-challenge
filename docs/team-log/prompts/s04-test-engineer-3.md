# Prompt · slice 04 · test-engineer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: I-04-10 remedy — remove the flaky claim
- Sent: 2026-09-06T07:25:24.746Z

---

A DCR on one of your files has been ruled **(a) clarification**, no loopback, resume from step 3. Branch `slice/04-candidate-allocation-and-retry`, already checked out. Read the ruling in `docs/slices/04-candidate-allocation-and-retry.md` (commit `9b82bd4`) before you touch anything.

**What was found.** The implementer, at step 4, raised — and did not touch — `tests/concurrency/no-technician-overlap.test.ts` (slice 02, QS-2). Its header states *"Candidate ordering is deterministic, so every racer attempts the same pair first"*, and it closes at line 208 asserting the refusal path shows **at least 2 attempts**, commented *"the first attempt fails on the bay, the second on the technician."*

ADR-0009's Order-C removes that premise. With 24 bays and 1 technician, a loser whose first draw is not the winner's bay conflicts on the **technician** at attempt 1, empties the length-1 technician list, and refuses correctly with no wasted attempt. Only a loser that happens to draw the winner's bay reaches a second attempt: `1 − (23/24)¹⁹ ≈ 0.56`. The architect reproduced this independently.

**Measured: 3 failures in 5 local runs. It passed in CI.** That is the problem, not a detail of it — the assertion is flaky *in the passing direction*, so it is green in exactly the run a slice would merge on.

**The obligation, stated without the assertion — it is yours to write and I will not write it for you (§5).**

1. **The two-attempt claim is unrepairable in this fixture and is REMOVED, not substituted.** No permutation-independent version of it exists there. The architect explicitly took a *narrower* remedy than the implementer proposed: do **not** add a terminal-state substitute, because the file already carries terminal claims that hold under every permutation — the 1/19 split, `technicianConflicts >= 19`, and `resource === 'technician'`, which is E-02-1's guard. Adding another would be padding a hole that does not exist.
2. **The header prose goes with the assertion.** A false comment outlives a false assertion, and I-02-9 already ruled the comment the more dangerous half.
3. **The loop-actually-looped obligation needs no relocation.** It is already deterministic in `tests/acceptance/candidate-retry.test.ts` AC-3 and gated in `tests/concurrency/no-spurious-refusal.test.ts` AC-2. Verify that for yourself rather than taking my word; if either is weaker than I have said, say so.
4. **Four files carry stale premise prose with sound assertions**, and two of them are yours: `tests/concurrency/no-bay-overlap.test.ts` and `tests/support/booking.ts`. Fix the prose. `error-taxonomy.test.ts` is also yours if the same staleness is there — check. Leave `tests/unit/persistence/candidateRepository.test.ts` alone; it is the implementer's.

**The structural rule the architect extracted, which is worth more than the fix.** `no-bay-overlap.test.ts` looks like the symmetric twin and is **safe**: with `bays: 1` every permutation shares the same head bay, so every `23P01` includes a bay violation. **A fixture is permutation-safe when the scarce resource is the singleton list, and permutation-dependent when it reasons about the abundant resource's draw order.** Both files have a singleton scarce resource; only the technician one narrated the abundant side. Write that rule into whichever of your files is the right home for it, so the next concurrency fixture is not authored blind.

**Verify by repetition, not by one green.** The defect is a coin flip; a single passing run is exactly what hid it. Run the affected file enough times to make a claim, and report the number of runs.

**Do not** touch `src/`, `tests/unit/`, any ADR or arc42. Commit as `test(04): …`, ~150 lines. Then report the standard JSON plus: the run count behind your verification, anything in points 1–4 you found to be wrong, and whether removing the assertion leaves QS-2 with a gap you would want covered elsewhere — a `(b)` backlog item is a legitimate answer, and so is "no gap".
