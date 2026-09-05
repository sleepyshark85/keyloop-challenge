# Prompt · slice 01 · implementer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 02 step 2 AGREE
- Sent: 2026-09-05T07:31:43.502Z

---

Slice 02, **step 2 — AGREE**. You are the implementer. The test-engineer is reviewing the same design in parallel; you are not coordinating with it.

Branch `slice/02-book-and-read-an-appointment`, HEAD `4a39a89`. Read `docs/slices/02-design.md` and `docs/slices/02-book-and-read-an-appointment.md`. **19 acceptance criteria** — the booking path (AC-1–6), the error taxonomy absorbed from slice 03 (AC-7–12), and two *ratified* domain remedies folded in by a human cost ruling (AC-13–16 from ADR-0014, AC-17–19 from ADR-0015).

§6 step 2 exists because "the same ambiguity found at step 5 costs a full cycle plus a loopback". Objections here are cheap. §6 also says an adjudication round that never produced a disagreement is not consensus, it is deference — and at slice 01 your objection I-01-1 on AC-6 is what sent the reading to the human, which was the right outcome.

## What I want you to judge hardest

**The §2.1 mechanisms, because they are the point of this slice and they are structural rather than behavioural.** The architect's position is that check-then-act *cannot* be caught from behaviour here — the exclusion constraint makes it harmless, so QS-1 and QS-2 would pass straight over it — and it therefore added a `ContendedResource` brand minted only by SQLSTATE classification, reporting `tsc` exit 0 on the conforming tree and **exit 2, TS2322** on a planted check-then-act.

It also states plainly that **a cast compiles clean**, and narrows the claim to "forecloses every shape that does not cast". You are the role that has to live inside that type all slice. Tell me:

- whether the brand is genuinely load-bearing or whether ordinary implementation shapes will drive you to the cast, in which case the mechanism is a speed bump with a ceremony attached;
- whether ten files across four layers, with a seven-member `BookOutcome` union mapped by one exhaustive `switch`, is what you would build — and if not, what you would build instead and why;
- whether `src/application/deriveInterval.ts` being *pure* actually recovers what D-01-1 lost. The architect's argument is that composition order gets a unit test and a mutation score, which is the closest replacement for the compiler the literal AC-6 ruling took away. You own `tests/unit/`, so you own whether that is true.

## Two escalations that bear on your work

**E-02-1 — §6(d).** The architect measured that when both exclusion constraints are violated, PostgreSQL reports the one whose index was **created first**, and reversing creation order flips it. AC-3 wants `no_bay_overlap` and AC-4 wants `no_technician_overlap` from a doubly-violating insert, and one index ordering cannot give both. Its reading is that ADR-0004's retry loop — which this slice puts **out of scope** — is what makes both deterministic, and it designed to that reading. Say whether you can implement AC-3 and AC-4 without the retry loop, and what you would have to do if the human rules the loop stays out.

**E-02-3 — arc42 §8.5's serialiser guidance.** Measured: `Type.Literal` substitutes, a **union of literals enforces with a loud 500**, and `Type.String({enum})` validates nothing. The problem schema uses the union. Judge whether that is the right choice for the code you will write, or whether the loud 500 is a failure mode you will regret in the taxonomy's error path — which is, after all, the path that runs when something has already gone wrong.

## Then the ordinary step-2 job

Whether you can build all 19 criteria against this design, and whether §7's "every implementer commit is green" and "~150 lines" hold for a slice carrying three things at once. The slice file's own guidance is to **sequence** — booking path first, taxonomy on top, the domain fixes independent of both. If you think it genuinely needs more than one red commit, say so now: §7 allows exactly one, and step 2 is the cheapest moment to find that out.

Note the two domain remedies apply **ratified, immutable** ADRs (0014, 0015) that name their fixes exactly — implement them, do not re-derive them. If you think either is wrong, that is a DCR and a superseding ADR.

## Constraints

Yours are `src/` and `tests/unit/`. You **must not** create, edit or delete anything under `tests/{acceptance,contract,property,concurrency,architecture,performance}/` — if you believe an acceptance test is wrong you raise a DCR. **This is step 2: reply, do not commit implementation.** Measure what you need — scratch files, throwaway trees, `tsc --noEmit` — but green code is step 4 and comes after the red.

Return per-objection verdicts with reasoning: **AGREE** or **OBJECT**, severity, the claim, and the measured scenario behind it. Where you agree, state the exact change you would want; do not make it. The human is away, so flag anything needing their authority rather than resolving it — I will queue it.
