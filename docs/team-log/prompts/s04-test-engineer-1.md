# Prompt · slice 04 · test-engineer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 04 step 2 AGREE
- Sent: 2026-09-06T05:30:45.073Z

---

Slice 04, **step 2 — AGREE**. You are the test-engineer, on `slice/04-candidate-allocation-and-retry` at `04b7879`. The implementer is reviewing the same design in parallel; you are not coordinating with it.

Read `docs/slices/04-design.md` (1,443 words), `docs/slices/04-candidate-allocation-and-retry.md` (5 AC, claiming QS-3), and **ADR-0020**, which is new.

§6 step 2 exists because the same ambiguity found at step 5 costs a full cycle plus a loopback. §6 also reads a round that produced no disagreement as deference, not consensus — and at slice 02 your objections were twice the thing that was right.

## What the design settles, and the one part you should test hardest

**The attempt cap.** Slice 02's architect flagged that a cap creates a *second* refusal exit, reached with both candidate lists non-empty and therefore with no emptied list to name — where the `ContendedResource` would have to be **chosen**, which ADR-0016 forbids. Slice 04 dissolves it rather than conceding: the cap is tested **inside the `conflict` arm**, so the exit is reachable only from a classification and a minted brand is in scope by construction. Four trees measured under `tsc --strict`; the cast variant compiles and would land in `src/application`, outside the one file `contended-resource-cast` permits.

`no-capacity` gains `exit: 'exhausted' | 'capped'`, exhaustion winning a tie, carried on one `booking.refused` log line — the same stdout observer you used for AC-3/AC-4 at slice 02.

## Two rulings already made that bear directly on your red

**AC-5 was narrowed by the architect, under the human's delegation.** Its reasoning: *"the same interleaving of candidate choices results"* is unachievable for a concurrent scenario — the interleaving belongs to the OS and PostgreSQL, and this repository has measured identical configurations producing 292, 241 and 2,100 deadlocks. **Asserting it produces the flake AC-5 exists to prevent.** So ordering becomes a deterministic pure function of *(bays, technicians, seed)*, asserted as a property, and the seed is recorded so a reported failure names the order it took.

**Judge that ruling.** You own how *done* is asserted. If the narrowed AC-5 is still not assertable without flake, or if it now asserts something weaker than QS-3 needs, say so — an AC changed mid-slice under delegation is exactly what the gate is shown, and your objection is what makes that visible rather than final.

**D-04-1, raised by the architect against ADR-0009 itself:** the cap of 16 was sized *"against contention depth"*, which holds only for a candidate list already filtered to free resources. Until slice 08's availability filter exists, a dealership with more than ~16 bays-plus-technicians reaches the cap **with no concurrency at all** — and **QS-3's fixtures will not see it, because they seed exactly *M***. That is a statement about *your* fixtures. Decide whether AC-1's (N,M) set should include a case that does.

## The rest of the step-2 job

Whether you can write the red for all five AC. Specifically:

- **AC-1** asserts `min(N, M)` confirmed over four (N,M) pairs including (8,20) — more capacity than demand. Say whether that set discriminates, and what a wrong implementation would have to do to pass it.
- **AC-2** asserts the *absence* of `25P02`. An absence assertion passes vacuously if the path never runs; say how you make it non-vacuous.
- **AC-3** asserts pruning is additive, not multiplicative. The bound is |bays|+|techs|−1.
- **AC-4** needs the cap reached with candidates remaining — the design notes `ATTEMPT_CAP` is configurable to make that fixture cheap, and that if you take it, **one assertion that the default is 16** belongs beside it or nothing pins ADR-0009's number.

## Constraints

Yours: `tests/{acceptance,contract,property,concurrency,architecture,performance}/` and database-invariant integration tests. You do **not** read `src/`. **This is step 2: reply, do not commit test code** — measure freely, but the red commit is step 3.

Your role definition now carries `## Writing anything down`; the concision rule applies to anything you write.

Return per-objection verdicts — **AGREE** or **OBJECT** — with severity, the claim, and the measured scenario behind it. Where you agree, state the exact change you would want; do not make it. Nothing escalates to the human mid-slice now; the architect rules and the gate is shown what it ruled.
