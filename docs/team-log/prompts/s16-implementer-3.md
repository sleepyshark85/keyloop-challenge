# Prompt · slice 16 · implementer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 16 review remediation
- Sent: 2026-09-10T02:39:57.476Z

---

Step 5 remediation, slice **16**, branch `slice/16-availability-derives-its-own-window`, PR #24. The reviewer blocked the merge. One MAJOR finding is yours to fix.

## MAJOR — your `T-16-1` unit test contradicts ruling 8, and would fail against correct code

`tests/unit/application/queryAvailability.test.ts:225-239` is a test for the occupancy-versus-appointment interval distinction. **Design ruling 8 says: "No test and no Stryker directive."** The architect ruled that explicitly, and gave the reason: while A-4 holds the buffer at zero the two intervals are the same value, so such a test could only assert `x === x`, would pass against the mutant it was written to catch, and would never have failed at any point in its life — CLAUDE.md §2.4 says a test that has never failed is not evidence.

Worse than redundant, the reviewer found it is actively harmful. It hard-codes `STARTS_AT_MILLIS + 3_600_000` — the **appointment** interval. Swap `occupancyStartsAt`/`occupancyEndsAt` for `startsAt`/`endsAt` in the source and it stays green, so it does not even guard what its name claims. And when A-4 is lifted and the occupancy interval gains a buffer, **this test fails against correct code**; because its name says it guards the distinction, the cheapest fix at that moment reads as "pass the appointment interval to the busy read" — which silently drops the buffer from availability while booking keeps it, reinstating the exact defect this slice exists to close.

**Remedy: delete it.** The record of this distinction lives in arc42 §6.5 (architect, step 7) and in your comment in `src/application/queryAvailability.ts` citing §6.5 and A-4 — which the reviewer confirmed is correct and stays. If you believe the deletion is wrong, raise a DCR rather than arguing it in a commit message.

## Verify, do not assume

The reviewer measured mutation at **0.8478 on the changed files** (78 killed, 14 survived), above §10's 0.75 threshold, and confirmed Stryker synthesised no occupancy↔appointment swap — exactly as ruling 8 predicted. Re-run mutation after your deletion and confirm the score still clears 0.75. If deleting this test drops it below, say so rather than quietly restoring the test.

## Discipline

- `tests/unit/` and `src/` only. `tests/acceptance/`, `tests/contract/`, `tests/property/`, `tests/performance/` and `tests/support/booking.ts` are the test-engineer's — it is fixing two findings in those paths concurrently, so do not touch them.
- Do not touch `docs/slices/`, `docs/adr/`, `docs/arc42/`, `docs/team-log/`.
- **Your commit must be green on its own** — the reviewer found neither of your previous two commits was, which is a separate MAJOR I am remedying by restructuring history. Do not let this one add to it: run `npm run build`, `npm run typecheck` and `npm test` before committing.
- Message shaped `refactor(16): …` or `test(16): …` as fits. Do not push.

Report the deletion, the re-run mutation score, and the state of build/typecheck/test.
