# Prompt · slice 09 · implementer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 09 step 2 implementer review
- Sent: 2026-09-07T17:24:53.794Z

---

# Slice 09 · step 2 — AGREE or OBJECT to the design

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/09-observability` (checked out, clean, pushed). Pull first.

Read `docs/slices/09-design.md` and `docs/slices/09-observability.md` in full. This is the **close-out slice**: it absorbs slices 10 and 11, carries **seventeen** acceptance criteria and **six** inherited obligations, and it is the **last slice in the project** — nothing after it absorbs what you let through.

## Your job

§6 step 2: review the design and either **agree or object**. Objections here are cheap; the same ambiguity found at step 5 costs a full cycle plus a loopback. §6 is explicit that a round which has never produced a disagreement is not consensus, it is deference.

You own `src/` and `tests/unit/`. You may not touch the outside-in test directories — if you think an acceptance criterion is wrong, you raise a DCR rather than editing the test.

## Five things I want your judgement on specifically

1. **A-09-2 pushes work into `tests/unit/`, which is yours.** The architect found that AC-7 as previously imagined does *not* kill the seven `description` mutants slice 08 merged on the promise that it would — `vitest.mutation.config.ts` includes `tests/unit/**` only, so a contract-layer assertion leaves them killable and unkilled. Its remedy: **the OpenAPI document is emitted by a function the unit layer can also call**, predicting **30/42 → 37/42 = 88.1%**. You measured slice 08's survivors by hand and were the one who found the previous remedy reached 6 of 12 rather than 12. **Does 37/42 hold?** Check it the way you checked that one, not by reading.

2. **The OTel SDK is confined to `src/platform`** — and the architect deliberately did *not* mint an ADR for it, calling it a rule rather than a decision under the human's new bar, to arrive as a `dependency-cruiser` rule with its QS-10 plant "or it does not arrive". You implement that. Is the rule expressible in dependency-cruiser as stated, and does the plant actually fail without it?

3. **`booking_conflicts_total{resource}`** and the one-increment-site rule. The design says `F-06-1`'s extraction is what makes that rule *countable* rather than a two-file list. Is the increment site genuinely single after that extraction, in the code as it stands today?

4. **Spans.** The candidate read and the insert become separate spans so the window the design deliberately does not depend on is visible in a waterfall. Does that require threading a context through layers the dependency rules forbid — and if so, say it now rather than at step 4.

5. **`D-07-1` is split** (a scope ruling, provisional until the gate): **in** — the pool ceiling as one named value, which is all `R-07-12` needs; **out** — what a saturated pool answers, because a `503` is a new row in a closed taxonomy and QS-11 requires every row reached end to end. Do you agree the in-half is implementable without the out-half?

## Boundaries

- **Do not write code yet.** Step 3 is the test-engineer's red; step 4 is yours. This is review only.
- Do not edit the design — the architect owns it. You object; it rules.
- If you agree with something, say so briefly; spend the words on disagreement.

## Return

The structured report with `objections` populated — each naming the criterion, quality scenario or §2 invariant at risk, and the change you would make. If you agree throughout, say what you checked to get there. Agreement that names what it verified is worth something; agreement that names nothing is not.
