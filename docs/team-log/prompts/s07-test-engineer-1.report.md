# Report · slice 07 · test-engineer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 07 step 2 test-engineer
- Returned: 2026-09-06T17:45:07.596Z
- Duration: 472s

---

## Report

I read `docs/slices/07-design.md`, the amended `docs/slices/07-reschedule-under-contention.md` (four ACs), ADR-0030, and its context ADR-0018, ADR-0023, ADR-0026, ADR-0027, ADR-0029, and ADR-0003. I did not read `src/`. I inspected the existing harness (`tests/support/booking.ts`, `tests/support/service.ts`) and precedent tests (`tests/concurrency/no-spurious-refusal.test.ts`, `tests/integration/cancellation-releases-slot.test.ts`, `tests/integration/reschedule-self-overlap.test.ts`) to ground reachability claims in what already exists rather than in assumption. I also ran a throwaway empirical check against a disposable `postgres:16-alpine` container (no repo schema involved, no files left behind) to test the lock-ordering claim directly rather than reason about it.

**Item 1 — AC-1's `xmin`/`ctid`. AGREE, reachable.** `tests/integration/cancellation-releases-slot.test.ts` already does exactly this: a bare `Client` (connection string only, no `src/` import) runs `select to_jsonb(appointment) as row, xmin::text as xmin from appointment where id = $1`. The same query with `ctid::text` added reads both. I'll snapshot before the barrier/request and compare after. It fails for the right reason: a compensating cancel-then-restore necessarily commits at least one extra write to reach `confirmed` again, so `xmin` (and almost certainly `ctid`, since `UPDATE` writes a new heap tuple) differs from the pre-attempt snapshot even though every visible column matches — while a genuinely aborted `UPDATE` (the `WHERE status='confirmed'` guard finding 0 rows, or a `23P01`) leaves both untouched. That's the discriminating case QS-4 needs.

**Item 2 — does AC-4 also catch a lock-ordering mistake? AGREE, with a precision the design doesn't state.** I built a two-session test against a disposable container: transaction A takes key 100 then waits for key 200; transaction B takes key 200 then waits for key 100 — i.e., each side locks *its own* pair before the *other's*, which is exactly what a "call `lockResources` once for the target, once for the incumbent" implementation mistake produces instead of ADR-0030's single statement ordered over the union. Result: **15/15 trials deadlocked (`40P01`)**. Since AC-4's mutual-vacate fixture is precisely this shape (A's take = B's leave and vice versa), a "take-then-leave" ordering bug reproduces the identical failure AC-4 already asserts against (`never 40P01`, `no response is 500`). So the design's claim holds for the ordering mistakes ADR-0018/ADR-0030 actually warn about. The precision: AC-4 would *not* discriminate a substitution of one valid canonical order for another (e.g. `(hashtext(key), class)` instead of `(class, hashtext(key))`) — but that isn't a bug, since any single consistent total order over the union prevents cycling regardless of which field sorts first. So AC-4 covers ADR-0018's ordering requirement exactly to the extent that requirement is load-bearing, not more.

**Item 3 — barrier before locks. AGREE, already satisfied, no new work needed.** `releaseFromBarrier` in `tests/support/booking.ts` parks N promises and only fires the underlying `fetch()` calls once all N are parked — the release point is client-side, before any request has even reached the server, let alone before `lockResources`. Every existing concurrency test built on it (`no-bay-overlap`, `no-spurious-refusal`, etc.) races whole HTTP requests this way. The new racing-moves fixture, built on the same helper plus `postReschedule`, inherits this for free; there's no departure to design around.

**Item 4 — two files, not three. AGREE.** Confirmed neither `tests/concurrency/refused-move-leaves-original.test.ts` nor `tests/concurrency/move-never-releases-slot.test.ts` exists yet — both are new. AC-1 (single-mover refusal, `xmin`/`ctid`) and AC-4 (racing-mover refusal, same witnesses) both belong in the former; AC-2/AC-3 (the transient-release barrier against fresh bookings) in the latter, matching the slice file's `In scope` list exactly.

**A-06-3's re-measurement:** I'm not inheriting "cheaper" — confirmed false and already recorded. "Stronger" I confirm as stated: `xmin` on the racing-moves loser is new evidence AC-2's file never had reason to produce.

**Findings not asked for:**

1. **AC-4 needs a positive witness before its absence-assertions mean anything**, on the same principle `no-spurious-refusal.test.ts` names explicitly (T-04-4): "0/1000 `40P01`" is vacuously true of a fixture where both movers' attempt 1 (their own pair) simply succeeds without ever reaching the union-lock code path. I'll build the fixture to witness both racers reaching attempt ≥ 2 targeting the other's pair (e.g. via the existing `booking.conflict` attempt field, the same observable `no-spurious-refusal.test.ts` already reads) before trusting the absence of `40P01` as evidence about ADR-0030 rather than about an inert race. This is inside my own step-3 latitude — flagging now because it shapes the fixture, not the wording.
2. Everything in the design is constructible from where I sit; I found nothing I can't write a failing test for.

```json
{
  "role": "test-engineer",
  "outcome": "agreed",
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": 0},
  "quality_scenarios_covered": [],
  "red_commit": null,
  "ci_failure_confirmed": false,
  "objections": [],
  "dcr": null,
  "message": "AGREE on all four items. xmin/ctid confirmed reachable via the same direct-SQL pattern slice 05's cancellation test already uses. Empirically verified (throwaway container, no schema touched) that a take-before-leave lock-ordering mistake reproduces 40P01 in the exact mutual-vacate shape AC-4 exercises (15/15), so AC-4 does cover ADR-0018's ordering, with the stated precision that it can't and needn't distinguish between two equally-valid canonical orders. Barrier-before-locks is already structural in releaseFromBarrier. Two files confirmed as new, no naming collision. One addition I'll build at step 3: a positive attempt>=2 witness for both racers before AC-4's absence-of-40P01 is trusted, on the no-spurious-refusal.test.ts precedent. No tests written; step 3 not started."
}
```

Files read (all outside `src/`): `/home/agentadmin/sources/keyloop-challenge/docs/slices/07-design.md`, `/home/agentadmin/sources/keyloop-challenge/docs/slices/07-reschedule-under-contention.md`, `/home/agentadmin/sources/keyloop-challenge/docs/adr/0030-a-move-locks-the-pair-it-leaves-as-well-as-the-pair-it-takes.md`, `/home/agentadmin/sources/keyloop-challenge/docs/adr/0018-lock-the-bay-and-the-technician-before-each-insert.md`, `/home/agentadmin/sources/keyloop-challenge/docs/adr/0023-a-write-that-leaves-the-constraints-scope-takes-no-lock.md`, `/home/agentadmin/sources/keyloop-challenge/docs/adr/0026-the-lock-is-a-value-the-write-takes-and-it-carries-its-keys.md`, `/home/agentadmin/sources/keyloop-challenge/docs/adr/0027-a-move-attempts-the-pair-it-already-holds-before-it-shuffles.md`, `/home/agentadmin/sources/keyloop-challenge/docs/adr/0029-a-deadlock-names-the-write-path-a-conflict-does-not.md`, `/home/agentadmin/sources/keyloop-challenge/docs/adr/0003-cancellation-and-rescheduling-in-scope.md`, `/home/agentadmin/sources/keyloop-challenge/docs/arc42/06-runtime-view.md`, `/home/agentadmin/sources/keyloop-challenge/docs/arc42/08-crosscutting-concepts.md`, `/home/agentadmin/sources/keyloop-challenge/docs/arc42/10-quality-requirements.md`, `/home/agentadmin/sources/keyloop-challenge/docs/arc42/11-risks-technical-debt.md`, `/home/agentadmin/sources/keyloop-challenge/tests/support/booking.ts`, `/home/agentadmin/sources/keyloop-challenge/tests/support/service.ts`, `/home/agentadmin/sources/keyloop-challenge/tests/concurrency/no-spurious-refusal.test.ts`, `/home/agentadmin/sources/keyloop-challenge/tests/integration/cancellation-releases-slot.test.ts`, `/home/agentadmin/sources/keyloop-challenge/tests/integration/reschedule-self-overlap.test.ts`, `/home/agentadmin/sources/keyloop-challenge/tests/acceptance/reschedule-appointment.test.ts`.
