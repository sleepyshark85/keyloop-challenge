# Prompt · slice 08 · implementer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 08 step 2 implementer
- Sent: 2026-09-07T04:23:20.789Z

---

Slice 08 step 2 — AGREE. Branch `slice/08-availability-query`, PR **#17**. Read `docs/slices/08-design.md` (step 1, `15949a2`), the slice file (**seven ACs** — AC-1, AC-5, AC-6 amended, AC-7 new), **ADR-0032** (`accepted`) and **ADR-0033** (`proposed` — **do not build it**).

**Slice 07 closed well and your part of it held up.** Mutation on changed files was **96.25**, `appointmentRepository.ts` at **100.00 with zero survivors**, and every survivor across all four changed files traced to a prior classification or a prior prediction. Your **I-07-2** call — that A-05-6's two `pgError.ts` guards are equivalent mutants — was confirmed twice over: analytically by you at step 4, and by the reviewer differential-testing 254 adversarial inputs with zero distinguishing inputs.

**This slice is different in kind: availability is advisory, so nothing refuses a wrong answer.** No constraint adjudicates this endpoint. A wrong answer is not rejected — it is simply wrong, and nothing downstream notices.

**Four things for you.**

1. **ADR-0032 — availability is two reads composed in the use case.** Not one query. Understand why before you agree: it is the correction to **F-08-1**, where arc42 §6.5 has specified `candidateRepository.freeResources` since phase 2 — which by set equality **is** the `appointment-table-access` marker, and `tests/architecture/ambiguity-containment.test.ts:742` plants that exact form as a control **expecting a violation**. The architecture control this repo already runs is built to reject the implementation arc42 specified. **AC-7 pins the marker unchanged.** Say whether the two-read composition actually composes in the use case layer without a new persistence seam, and what `busyResources` has to return.

2. **AC-6 is now `to <= from`, not `to < from`.** `from == to` is an empty `tstzrange`, which overlaps nothing, so the query would report **everything** free — vacuously true. The database guards `ends_at > starts_at`; the route must guard the same way round. Confirm the route-level guard is expressible where the design puts it.

3. **AC-5 carries two facts, not one** — not a reservation, **and** true only of the interval queried. Both in the response and in the OpenAPI description.

4. **ADR-0033 is `proposed` and deferred to slice 09.** The advisory read **orders** candidates and never removes them. Its argument is worth checking because it constrains what you build later: a *removing* filter can empty the candidate list, `orderCandidates` returns `null` for empty, and §6.2 routes `null` to `500`/`422` — never `409`. So a removing filter must either answer `500` for a merely full dealership or mint a `409` from a read, which ADR-0016 forbids. **Do not build it. Say whether the argument holds.**

**§6 asks for verdicts, not sign-off.** You objected once at slice 06 and were right, with a measurement; you corrected your own estimate twice at slice 07. Same standard.

**Standing constraints.** §5: `src/` and `tests/unit/` only; raise a DCR **to me** rather than dispatching anyone (O-44). §7: every commit green and small. §2.1 NON-NEGOTIABLE. **Do not write code yet** — step 4 follows the red. **Do not run Stryker**; I take mutation measurements.

**Post your reasoning to PR #17** per §6 — and **keep it short: ~100–150 words.** Leading bold `**implementer** · …` per §9. The two or three things that mattered plus artifact citations; cut narration and any sentence explaining a fact's significance rather than stating it.

**Report** the standard JSON, AGREE/DISAGREE per item with reasoning, your honest size estimate, and anything you found that this did not ask about.
