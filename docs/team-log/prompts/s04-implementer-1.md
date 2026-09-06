# Prompt · slice 04 · implementer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 04 step 2 AGREE
- Sent: 2026-09-06T05:31:08.997Z

---

Slice 04, **step 2 — AGREE**. You are the implementer, on `slice/04-candidate-allocation-and-retry` at `04b7879`. The test-engineer is reviewing the same design in parallel; you are not coordinating with it.

Read `docs/slices/04-design.md` (1,443 words), `docs/slices/04-candidate-allocation-and-retry.md` (5 AC, QS-3), and **ADR-0020**, which is new. You built slice 02's booking path, so this is your loop being extended.

§6 says a round that produced no disagreement is deference, not consensus. At slice 02 your objections included the blocking one (I-02-6, the constraint name having no observer) and the one that corrected the architect's own mutation claim.

## What this slice adds to code you wrote

Slice 02 shipped the minimal loop: attempt, classify, prune **that candidate value**, retry; the constraint reported at refusal is the list that emptied. Slice 04 adds **ADR-0009's seeded shuffle and the cap of 16**.

**The cap's placement is the design's central decision, and it is about your code.** A cap as the loop's *bound* creates a second refusal exit reached with both lists non-empty — no emptied list to name, so the `ContendedResource` would have to be **chosen**, which ADR-0016 forbids. Measured under `tsc --strict`, four trees:

- cap as the loop bound, refusing after the loop → **exit 2**, `TS2322`, `'bay'` not assignable to `ContendedResource`
- the same, carrying the last minted value in a `ContendedResource | null` local → **exit 2** on the `null`
- the same plus `as ContendedResource` → exit 0, and that cast lands in `src/application`, outside the one file `contended-resource-cast` permits
- **cap tested inside the `conflict` arm**, beside the exhaustion check → **exit 0, no cast**

**You are the one who has to live in that shape.** Judge whether testing the cap inside the conflict arm is what you would write, or whether it distorts the loop to satisfy a type — the same question you answered honestly about the brand at slice 02, where you concluded no cast was needed because the branded value was already in hand at the refusal.

`no-capacity` gains `exit: 'exhausted' | 'capped'`, exhaustion winning a tie, on one `booking.refused` line.

## Three things to weigh

1. **`ATTEMPT_CAP` configurable.** The design makes it so, to give AC-4 a cheap fixture, noting that one assertion the default is **16** must sit beside it or nothing pins ADR-0009's number. Say whether a configurable cap is right, or whether it is a test seam that weakens a decided constant.
2. **F-02-9 is yours to honour.** Every write path to `appointment` takes ADR-0018's two advisory locks in the same order. The design asserts the shuffle reorders *which* candidate is attempted and never the within-attempt lock order, because the classes are disjoint. Check that against the code you actually wrote.
3. **D-04-1** — the architect's own finding against ADR-0009: the cap of 16 was sized *"against contention depth"*, true only of a list already filtered to free resources. Until slice 08, a dealership with more than ~16 bays-plus-technicians reaches the cap **with no concurrency at all**. That is your loop terminating early on an unfiltered list. Say whether it changes what you would build now, or is genuinely slice 08's.

## Constraints

Yours: `src/` and `tests/unit/`. You must not create, edit or delete anything under `tests/{acceptance,contract,property,concurrency,architecture,performance}/` — read them freely; if one is wrong, raise a DCR. **This is step 2: reply, do not commit implementation.** Measure what you need — scratch trees, `tsc --noEmit` — but green code is step 4.

Your role definition now carries `## Writing anything down`; the concision rule applies to anything you write.

Return per-objection verdicts — **AGREE** or **OBJECT** — with severity, the claim, and the measured scenario. Where you agree, state the exact change; do not make it. Nothing escalates to the human mid-slice; the architect rules and the gate is shown what it ruled.
