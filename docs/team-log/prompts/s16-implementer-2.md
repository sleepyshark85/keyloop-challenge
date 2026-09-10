# Prompt · slice 16 · implementer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 16 green
- Sent: 2026-09-10T01:58:09.237Z

---

Step 4 (GREEN) for slice **16**, branch `slice/16-availability-derives-its-own-window`, PR #24. You reviewed and agreed this design at step 2. The red commit is in and **CI has certified it**: run 34427199266 on `762f824` — `verify` success, `suite (Testcontainers)` failure, `red-proof` **success**. Make it green.

## Read first

- `docs/slices/16-availability-derives-its-own-window.md` — **re-read it, it was amended after your review**: `src/http/routes/appointments.ts` is now in scope, there is a new *Scope ruled at step 2* section, and your `queryAvailability.ts` bullet gained a step-4 obligation.
- `docs/slices/16-design.md` — rulings 6, 7 and 8 are new since you read it.
- `docs/adr/0039-availability-takes-a-start-not-a-window.md`.
- The red tests, which define done and which you **must not edit**: `tests/acceptance/availability.test.ts`, `tests/contract/openapi-document.test.ts`, `tests/property/availability-agrees-with-constraint.db.test.ts`, `tests/performance/availability-budget.test.ts`, `tests/support/booking.ts`.

## The ruling on your own question, `I-16-1` — the architect ruled a SPLIT, against your inclination

You leaned toward rebuilding both problem bodies locally. The architect ruled the two symbols are not the same kind of thing:

- **`outsideOpeningHours` → export it from `appointments.ts` and import it into `availability.ts`.** It is not a body, it is a function over a domain union with a branch. Duplicating it duplicates a derivation over a domain value — ADR-0039's own category, which is what you correctly smelled; you drew the boundary in the wrong place. Its docblock already claims sharedness a copy would falsify, and its signature takes `OpeningHoursVerdict` directly precisely so it can admit a caller it did not yet have. **The edit is the single keyword `export` on `src/http/routes/appointments.ts:463`. Nothing else in that file — no behaviour, no docblock, no reformatting.**
- **`INTERNAL` → rebuild it locally in `availability.ts`.** This repository already ruled `/problems/internal` is duplicated by construction site and held in agreement by the contract test — `src/http/server.ts:305` and `src/http/routes/appointments.ts:484` are the two existing sites, and the `500` carries no response schema, so there is nothing to share. Give the local const a docblock naming the two sibling sites and the contract test that holds them equal.
- `PROBLEM_RESPONSES` in `availability.ts`: `400: problemResponse('/problems/malformed-request', '/problems/outside-opening-hours')`, and **no `500` entry**, matching `appointments.ts:149-150`. Two members also avoids the one-member `Type.Union` collapse (I-10-1).

## Your other step-4 obligations from the rulings

- **`T-16-1`** — a short comment in `src/application/queryAvailability.ts` at the point the occupancy interval and the appointment interval are both named, **citing arc42 §6.5 and A-4 rather than restating them**. One home per fact; the architect writes §6.5 itself at step 7. **No test for it, and no Stryker directive** — the architect ruled both out: while A-4 holds the buffer at zero such a test could only assert `x === x` and would never have failed (§2.4), and the mutation tool does not synthesise a swap between two identically-valued expressions, so a directive would strip real mutants from the denominator.
- **`F-16-1a`** — fix the retired-ADR-0032 citation in `src/application/queryAvailability.ts` (you are rewriting that docblock anyway) **and** the two in `tests/unit/application/queryAvailability.test.ts:14,105`, which you are rewriting for the reshaped outcome union. Your declared narrowing was upheld: **do not** touch `src/persistence/appointmentRepository.ts:516,526` or `tests/unit/persistence/appointmentRepository.test.ts:533` — those stay with the booked sweep. For context, ADR-0032 has no file in `docs/adr/` at all.
- **`OQ-16-1` confirmed** — no `durationMinutes` field on the `200`. `startsAt`/`endsAt` only.

## Discipline

- **§5 is NON-NEGOTIABLE**: `tests/acceptance/`, `tests/contract/`, `tests/property/`, `tests/performance/`, `tests/support/booking.ts` are the test-engineer's. If you believe one of those tests is wrong, **raise a DCR — do not edit it**.
- `tests/unit/` is yours; unit-TDD as usual.
- **§7: every implementer commit is green** — a unit test and the code it drives, together. Small commits; if one exceeds ~150 lines it should probably have been two. Message shape `feat(16): …` / `refactor(16): …`.
- `docs/api/openapi.json` is **regenerated, never hand-edited** — `npm run docs:openapi`.
- Do not touch `docs/slices/`, `docs/adr/`, `docs/arc42/` or `docs/team-log/`.
- Do not push. I push.

## Done means

`npm test` green (all three projects), `npm run typecheck`, `npm run build`, `npm run lint:arch` clean, and `npm run docs:openapi -- --check` passing.

Report: the commits you made, the final state of each check, and anything the design got wrong. If it is wrong, raise a DCR rather than working around it — that escalation is a signal, not a failure.
