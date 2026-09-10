# Prompt · slice 16 · architect · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 16 design amendment
- Sent: 2026-09-10T01:18:59.773Z

---

Slice **16**. Your rulings are recorded. This is §6 point 5 — **the amendment pass, in one go, with the rulings attached.** Now you edit.

Apply exactly what you said you would, and nothing you did not:

**From ruling 1 (`I-16-1`, outcome (a) clarification, split against the implementer's inclination):**
- `docs/slices/16-availability-derives-its-own-window.md` — the *In scope* list gains `src/http/routes/appointments.ts`, described as one keyword: `outsideOpeningHours` exported, no behaviour, docblock or diff beyond it.
- `docs/slices/16-design.md` §2 building-blocks table — the same row.
- Record the split itself in the design, because the reasoning is the graded artifact: `outsideOpeningHours` is exported and shared *because it is a function over a domain union with a branch* — ADR-0039's own category; `INTERNAL` is rebuilt locally *because this repository already ruled that `/problems/internal` is duplicated by construction site and held in agreement by the contract test*, with `src/http/server.ts:305` and `src/http/routes/appointments.ts:484` as the two existing sites and no response schema to share.
- The `PROBLEM_RESPONSES` shape you specified for `availability.ts`, including **no `500` entry** and why two members matters (I-10-1).
- `docs/arc42/11-risks-technical-debt.md` §11.1 — `D-16-3`: `appointments.ts` is now a de facto shared HTTP module exporting three symbols other route files consume; extraction to `src/http/shared.ts` deferred, not rejected.

**From ruling 2 (`F-16-1a`, outcome (d), provisional to the gate):**
- Record the scope ruling in the slice file so `slice:check` shows the gate what moved: the `appointmentRepository.ts` citations stay with the booked sweep, and your correction of the ownership count — of the seven `tests/` citations the test-engineer claimed, **four** are its; `tests/unit/application/queryAvailability.test.ts:14,105` and `tests/unit/persistence/appointmentRepository.test.ts:533` are the implementer's under §5, which is NON-NEGOTIABLE. Say plainly that acting on the original count would have been a §5 breach.
- Update `F-16-1`'s own statement of its residue: three, all in the `busyResources` cluster.
- Keep your line that ADR-0032 has no file in `docs/adr/` at all — these cite an ADR that does not exist.

**From ruling 3 (`T-16-1`):**
- Record in the design that the remedy is **no test and no Stryker directive**, with your reason: while A-4 holds the buffer at zero a test could only assert `x === x`, would pass against the mutant it was written for, and would never have failed — §2.4 says that is not evidence; and Stryker does not synthesise a swap between two identically-valued expressions, so there is no mutant to suppress and a directive would strip real mutants from the denominator.
- Note the two homes and which step each lands at: arc42 §6.5 is yours at step 7; the citing comment in `src/application/queryAvailability.ts` is the implementer's at step 4. One home per fact — the code comment cites §6.5 and A-4 rather than restating them. Make sure the slice file carries the step-4 obligation somewhere the implementer will see it.

**From `OQ-16-1` and `A-16-2`:**
- `OQ-16-1` confirmed — no duration field — with the sharper reason you added (a minutes field would be the only member of the `200` no acceptance criterion can fail), *and* your own caveat that ADR-0039's rule is about requests and does not decide it either way, so the refusal rests on redundancy and agreement cost alone. If the gate wants the field it is cheap and should come with an AC-2 clause.
- `A-16-2` becomes *resolved at step 2* in design §9, citing `tests/contract/error-taxonomy.test.ts:402-467` and the `timeZone: 'Not/AZone'` fixture.

Constraints:
- **ADR-0039's decision is immutable** (CLAUDE.md §4) — chosen option, option set, verdict, consequences. None of this touches it; if you believe any amendment above would, stop and tell me instead of editing it.
- Keep `status: proposed` on ADR-0039. It moves to `accepted` at step 7.
- Run whatever the repository's own checks are for docs (`docs:check`, `docs:adr-check`, `docs:budget:check`, `docs:refs`, `slice:check 16`) and report their results.
- **Commit nothing.** I commit.

Report what you changed, file by file, and anything you decided not to change after all.
