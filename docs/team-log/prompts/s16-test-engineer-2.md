# Prompt · slice 16 · test-engineer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 16 red commit
- Sent: 2026-09-10T01:25:44.179Z

---

Step 3 (RED) for slice **16**, branch `slice/16-availability-derives-its-own-window`, design committed at `7d63180`. You reviewed and agreed this design at step 2 — now write the tests and **commit them red**. You author the red commit; CLAUDE.md §7 requires **exactly one** per slice.

## Read first

- `docs/slices/16-availability-derives-its-own-window.md` — **re-read it, it was amended after your review.** New: `src/http/routes/appointments.ts` in scope, a *Scope ruled at step 2* section, and a restated `F-16-1`.
- `docs/slices/16-design.md` — rulings 6, 7 and 8 are new since you read it.
- `docs/adr/0039-availability-takes-a-start-not-a-window.md`.

## Rulings from step 2 that change what you were going to write

**`F-16-1a` — the architect contested your citation count, and you must not act on your original one.** You reported all seven `tests/` citations of the retired ADR-0032 as yours. **You own four**: `tests/property/availability-agrees-with-constraint.db.test.ts:20,69` and `tests/acceptance/availability.test.ts:22,52`. The other three are the implementer's — `tests/unit/application/queryAvailability.test.ts:14,105` and `tests/unit/persistence/appointmentRepository.test.ts:533`. `tests/unit/` is implementer-only and §5 says NON-NEGOTIABLE. Fix your four; do not touch `tests/unit/` at any point in this slice. (For context: ADR-0032 has no file in `docs/adr/` at all — these cite a decision that does not exist.)

**`T-16-1` — your own finding, ruled: no test, and no Stryker directive.** The architect agreed with your conclusion and gave a better reason for it: while A-4 holds the buffer at zero, such a test could only assert `x === x`, would pass against the mutant it was written to catch, and would never have failed — §2.4 says a test that has never failed is not evidence. Do not write one. The record goes in arc42 §6.5 (architect, step 7) and a citing comment in `src/application/queryAvailability.ts` (implementer, step 4). Neither is yours.

**`I-16-1` — ruled as a split**, which affects what AC-4 will find at step 4: `outsideOpeningHours` is exported from `appointments.ts` and shared; `INTERNAL` is rebuilt locally in `availability.ts`. AC-4 asserts equal status and `type` across the two endpoints either way — that is what your test asserts, not which symbol the implementer used.

**`A-16-2` resolved, `OQ-16-1` confirmed** — no `durationMinutes` field on the `200`. Assert `startsAt`/`endsAt` only.

## What to write

AC-1 through AC-7 as they now read in the slice file. You already confirmed at step 2 that all six of the red set fail for the right reason and that one commit spanning `tests/acceptance/`, `tests/contract/`, `tests/property/` and `tests/performance/` matches slice 09's precedent. Carry out the plan you described:

- The QS-8 generator gives up `to` and gains an arbitrary `startsAt`, using `seedScenario`'s existing `durationMinutes` only to **aim** boundary items and the cancelled witness; the probe interval is **read from the response** and never recomputed. All six of slice 08's mechanics survive.
- `tests/support/booking.ts`'s `AvailabilityQuery`/`getAvailability` reshape from `from`/`to` to `startsAt` — you checked no implementer-owned unit test imports `getAvailability`, so this is uncontested.
- AC-4's `500` row uses the `timeZone: 'Not/AZone'` fixture you found at `tests/contract/error-taxonomy.test.ts:402-467`. No mocks — §2.2.
- AC-6 follows the existing arc42-figure assertion precedent in `tests/performance/availability-budget.test.ts:312-331`.

## The commit

- One commit, message shaped `test(16): … (red)`, per §7 and the convention in `git log --oneline`.
- **Every AC in the red set must fail, and fail for the right reason** — a missing feature or a missing documented figure, never a type error, an import error or an uncaught exception. Run the suite yourself before committing and confirm that. Report the actual failure output per AC.
- Do not touch `src/` at all. Do not touch `tests/unit/`. Do not edit `docs/slices/` or `docs/adr/`.
- Do not push; I push and open the PR.

Report: the files you wrote, the per-AC failure evidence, the commit sha, and anything you found while writing that the design got wrong — if the design is wrong, raise a DCR rather than working around it.
