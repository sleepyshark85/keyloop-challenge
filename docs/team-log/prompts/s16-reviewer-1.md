# Prompt · slice 16 · reviewer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 16 review
- Sent: 2026-09-10T02:22:23.561Z

---

Step 5 (REVIEW) for slice **16**, branch `slice/16-availability-derives-its-own-window`, PR #24. Review the diff against the design and the acceptance criteria. You may **block a merge and raise a DCR, but you may not change the design** — a design problem is raised, not fixed.

## The slice

`GET /availability` used to make the caller supply `from`/`to` while already receiving `serviceTypeId`, so the caller re-implemented a derivation `POST /appointments` deliberately keeps server-side. The human found the consequence at a terminal: with an appointment occupying 09:30–10:30 and a 60-minute service type, `from=09:00&to=09:30` reported the bay FREE and `POST startsAt=09:00` answered `409`. The endpoint now takes `startsAt`, derives its window by calling `deriveInterval` unedited, and names the derived interval in its own `200`.

Read `docs/slices/16-availability-derives-its-own-window.md` (AC-1..AC-7), `docs/slices/16-design.md` (eight rulings), `docs/adr/0039-availability-takes-a-start-not-a-window.md`.

## The commits

```
8610d7c docs(16): AC-6 records its measured p95, and the DCR that reworded it
92d1bd8 docs(16): Scenario 3 sends startsAt, not from/to        (scribe)
b6c1eac docs(16): regenerate docs/api/openapi.json               (mechanical)
7d572d8 feat(16): GET /availability takes startsAt, names the interval   (implementer)
2601410 feat(16): queryAvailability derives its own window       (implementer)
762f824 test(16): availability derives its own window (red)      (test-engineer)
7d63180 docs(16): the design, and the adjudication that shaped it
853d61d docs(16): the defect register catches up with the log
```

Base is `3819edb` (`main`). Current state: `npm test` exit 0 across all three projects.

## What I specifically want audited

1. **The central claim, verified rather than accepted.** ADR-0039's chosen option is *derive by calling `deriveInterval` — the booking path's function — unedited*. Confirm `src/application/deriveInterval.ts` is genuinely unmodified in this diff, and that `queryAvailability` calls it rather than reimplementing any part of it. If duration arithmetic exists anywhere outside that function, the ADR's decision is not what shipped.
2. **AC-2 is the load-bearing assertion** — the `200` and the `201` must name string-equal `startsAt`/`endsAt`. Check the test actually compares two responses rather than recomputing an expected value from `durationMinutes`. A test that asserts its own arithmetic would satisfy the letter and prove nothing.
3. **Mutation.** Run Stryker on the changed files and audit survivors. `docs/slices/16-design.md` ruling 8 records **one deliberate equivalent-mutant condition** (`T-16-1`): the occupancy interval and the appointment interval are numerically identical while a buffer is unimplemented, so a swap between them survives AC-2 and AC-5. That one is expected and was ruled to take no test and no Stryker directive. **Any other survivor is yours to report.**
4. **Test ownership, §5, NON-NEGOTIABLE.** Verify the red commit `762f824` touches no `src/` and no `tests/unit/`, and that the implementer's commits touch no test-engineer-owned directory (`tests/acceptance/`, `tests/contract/`, `tests/property/`, `tests/performance/`) and not `tests/support/booking.ts`. This slice had a near-miss the architect caught at step 2 — a role about to edit files it did not own — so check it rather than assume it.
5. **Commit discipline, §7.** Exactly one red commit, authored by the test-engineer, subject `test(...): ... (red)`. Every implementer commit green on its own. Check the implementer commits individually, not just the tip.
6. **`I-16-1` as ruled.** `outsideOpeningHours` exported from `appointments.ts` as a **single-keyword diff** — verify nothing else in that file changed. A local `INTERNAL` in `availability.ts` with a docblock naming its sibling sites. `PROBLEM_RESPONSES` with a two-member `400` and **no `500` entry**.
7. **`lint:arch` / dependency-cruiser**, and the `zone-transport` marker in `tests/architecture/ambiguity-containment.test.ts` — its four-file list must be **unchanged**. `queryAvailability.ts` must pass the dealership as one value and never name `ianaZone`.
8. **The contract.** `docs/api/openapi.json` must be regenerated, never hand-edited — `npm run docs:openapi -- --check` passes. Exactly three query parameters, no `from`/`to`.
9. **Documentation honesty.** `docs/WALKTHROUGH.md` Scenario 3 claims responses it observed. The scribe reports it rebuilt and restarted the service first because the running one was a pre-slice-16 build. Sanity-check that the recorded response shapes match what the code now returns.

## Known and already ruled — do not re-litigate, but do verify each was honoured

- `T-16-1` — no test, no Stryker directive; a comment in `queryAvailability.ts` citing arc42 §6.5 and A-4 rather than restating them.
- `F-16-1a` — the retired ADR-0032 citations: fixed in files roles were already rewriting; `src/persistence/appointmentRepository.ts:516,526` and `tests/unit/persistence/appointmentRepository.test.ts:533` deliberately left for a booked sweep.
- `F-16-2` (the DCR) — AC-6's "at step 7" wording, ruled (a), no loopback.
- `OQ-16-1` — no `durationMinutes` field on the `200`.
- `A-16-3` — the slice file is at 796/800 words with steps 5–7 still to record. Structural, already raised.

## Report

Findings with **a concrete failure scenario each** — CLAUDE.md's process criteria count a finding without one as failure, and count a no-findings review as valid only if it reports a mutation score. Say plainly whether you block or clear the merge, and raise a DCR if the design rather than the code is at fault. Do not edit source, tests or design documents. Do not push.
