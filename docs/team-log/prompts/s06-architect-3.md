# Prompt · slice 06 · architect · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 06 amendment run
- Sent: 2026-09-06T13:13:13.447Z

---

Slice 06 — **step 2 AMENDMENT.** Branch `slice/06-reschedule-atomic-move`. Your ten replies are recorded as `finding.ruled` events and committed; this is §6's step 5, *"only then is the design amended, in one pass, with the rulings attached."* Now you write.

Your own summary table is the work order. Apply it as ruled — I am not re-opening any of the ten verdicts.

**One thing changed since you replied, and it is yours to settle.**

**O-42 — you routed A-06-2 to slice 10, and slice 10 is a tombstone.** Gate D folded it into 09 on 2026-09-04 (`docs/slices/10-openapi-and-curl-harness.md` is `folded_into: "09"`, `folded_by: gate-D`), and `docs/slices/09-observability.md` declares `absorbs: ["10", "11"]` and carries the heading *"The OpenAPI document and the harness (carried from slice 10)"*.

**Your reasoning is not in dispute** — a check over the generated OpenAPI document asserts ∀operations rather than ∀files-someone-grepped, and that is stronger than the grep you rejected. Only the label is stale. But this is the **second** routing to that same dead slice: the first was OQ-05-2, two days after the fold, and it is the defect that produced R-05-2 — and this one happened inside the run that ruled a design-document finding must also be a logged finding.

I have **not** corrected it for you. A destination you did not name is not a destination, so A-06-2 currently has **no `deferred_to` recorded at all**. Name the live slice.

I also closed the hole that let it through, because it was mine: `refsDeferredTo` matched `deferred_to` by shape and never asked whether the slice was alive — the A-05-5 mechanism had the same blind spot as the mechanism it replaced, since `docs:adr-check` resolved folds for ADRs while the log write path did not. **Destination liveness now runs on the write path**, so a ruling naming a tombstone is refused at append rather than in CI. I verified it by attempting your ruling exactly as worded: refused, nothing written. A fold is followed, never failed; what is refused is naming the tombstone instead of the successor.

**So: every `deferred_to` you produce in this run must name a live slice or a member of the closed set (`backlog | retro | gate | human`), and `backlog` now requires a reason on the same record, per your own O-38 ruling.**

**What to write.**

1. **`06-design.md`** — fold in I-06-1, I-06-2, T-06-1, T-06-2, T-06-3 exactly as you specified them: §2.4's corrected mutation claim with the `TSAsExpression` root cause; §1 and §3 for the candidate order; §2.3's statement-level trigger discriminating on `affected = 0`, plus §2.1's corrected falsifier sentence; §2.2's two constraint-name controls; §2.3's discarded-candidate case.
2. **`ADR-0027`**, `status: accepted` — a move attempts the pair it already holds before it shuffles. Four options as you set them out, with the honest consequence about Order-A behaviour bounded at one attempt.
3. **`ADR-0028`**, `status: proposed` — the lock carries the transaction it was taken on, with the test-engineer's negative result recorded as the reason types are the only available control, and the destination you ruled.
4. **The out-of-slice items** land in their destination files, not only in your rationale — that is R-05-2 practice and it is now machine-checked in both directions.

**What I will land, so do not touch it:** AC-1's new clause in `docs/slices/06-reschedule-atomic-move.md` (*"and the bay and technician are unchanged"*), and any other slice-file front matter or acceptance-criteria text. You said it yourself on O-41 — you are specifying, not editing. Tell me any slice-file wording you want and I will land it.

**O-39 catches you, and you said so first.** `A-06-1`, `A-06-2` and `OQ-06-1` have no `finding.raised` records — `A-06-1` and `OQ-06-1` appear nowhere in `events.jsonl`. Put all three in your **structured report** with severity, file, claim and scenario so I can emit them, and A-06-2's with the destination you settle above. That is the reporting-contract gap you identified being closed on its first application.

**Constraints.** The in-flight design ceiling is 3,000 words and you flagged that step 7 has almost no ratchet headroom — §5 = 15, §6 = 1, §8 = 7, §10 = 0, §11 = 2. Nothing here touches arc42; keep the design inside budget so step 7 remains payable. `npm run docs:budget -- --check --ratchet`, `docs:refs`, `docs:adr-check`, `docs:check`, `npm run log:check` and `npm run test:tools` all stay green. No `src/`, no `tests/`, no `tools/`. Accepted ADRs are immutable — you ruled that none is wrong, so none is edited. Commit `docs(06):`.

**Report** the standard architect JSON, plus the three under-reported findings in loggable form, plus your settled destination for A-06-2, plus anything the amendment turned up that the replies did not anticipate.
