# Prompt · slice 10 · architect · invocation 7

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Fix slice loop diagram fidelity
- Sent: 2026-09-09T07:12:57.586Z

---

Task: `docs/diagrams/slice-loop.html` misrepresents CLAUDE.md §6 in two ways. Correct the diagram. This is a fidelity fix to an existing governing rule, NOT a new decision — no ADR.

Read `CLAUDE.md` §6 in full first, especially the subsection "Adjudication is reasoned before it is applied — NON-NEGOTIABLE" and the "Design Change Requests" table. The diagram must match that text; where they differ, the diagram is wrong.

## Defect 1 — step 2's adjudication exchange is not drawn at all

The figure has step 2 emit "agreed, or objections" and then flow straight to step 3. The whole NON-NEGOTIABLE adjudication rule is invisible. It must draw:

- the adjudicator **replies before it edits** — one verdict per objection, AGREE or DISAGREE, with reasoning stated, and where it agrees it states the change it *would* make without making it
- the finding and the remedy are **judged separately** — accepting that a problem is real while rejecting or narrowing the offered fix is a legitimate and common outcome
- the objector **may answer once**
- if the two still disagree, the architect **may call a vote** — a third role owning neither side of the dispute returns a reasoned verdict, advisory to the architect on architecture and to the human on scope, recorded either way
- **only then** is the design amended, in one pass, with the rulings attached

**Draw this as a bounded exchange, not a loop.** This is the crux and the reason the fix is subtle. CLAUDE.md: "One round of discussion, then a decision. No multi-turn agent debate — two agents arguing past each other is not rigor, it is spend." The objector answers *once*. A cycle arrow would assert the unbounded debate the rule exists to forbid, and would be as wrong as the current omission — wrong in the opposite direction, and harder to spot. A bounded ladder with a visible terminus is the honest shape.

## Defect 2 — the loopback is drawn too narrowly

The SVG's own `<desc>` says "a return path from review back to design taken only when the architect rules a design defect." Three simplifications in one sentence:

- **"Any role, at any step, may raise a DCR"** — steps 2, 3 and 4 included, not just step 5. The slice goes `blocked` and the architect convenes one round.
- Only outcome **(c) design defect** returns to step 1. **(b) deferred improvement** merges as-is and spawns a backlog slice plus a `proposed` ADR; **(d) defer to the gate** is ruled now and reviewed at step 6; **(a) clarification** resumes from the raising step.
- To rule **(c)** the architect **must name** the failing acceptance criterion, §10 quality scenario, or §2 standing invariant. If it cannot name one, the outcome is (b). Preference is not a blocker. That constraint is the teeth of the rule and is worth drawing if it fits.

Keep "max 2 loopbacks per slice, then auto-escalate" — that governor is correct as drawn.

## Constraints

1. **`docs/METHODOLOGY.md` is at 3900 words against a 3900 ceiling — zero headroom, budget and baseline both 3900.** The diagram may change freely; prose may not grow. If a caption or `<desc>` change forces a word into the section, pay for it by trimming there. Do not raise the baseline. Note the §6 prose at `METHODOLOGY.md:171-179` deliberately says the rules themselves live in CLAUDE.md — do not duplicate rule text into METHODOLOGY.
2. Correct the `<desc>` too, not just the picture. It currently states the narrow claim in words and is what a screen-reader user gets.
3. Keep the house style and the existing visual vocabulary — human-decision vs agent-step distinction, the legend, the loopback notation. Load the `diagram-design` skill.
4. Re-export: `npm run diagram:export docs/diagrams/slice-loop.html`.
5. Touch only `docs/diagrams/slice-loop.{html,svg}` and, if strictly necessary, `docs/METHODOLOGY.md`. No `src/`, no `tests/`, no arc42, no ADR, no team-log write.
6. Run and report: `npm run docs:budget:check`, `npm run docs:refs`, `npm run docs:check`.

## One ruling I need from you

`docs/METHODOLOGY.md` is **not in CLAUDE.md §4's source-of-truth ownership table**, yet it carries the process diagram and cites CLAUDE.md §6 as authority. Per §11, record rather than resolve silently: state in your report who should own METHODOLOGY.md and whether §4's table should gain a row for it. Do not edit CLAUDE.md or §4 yourself — this is a recorded assumption for the human at the gate.

Report: files changed, what each defect's fix looks like, the word arithmetic, check output, and the ownership ruling.
