# Report · slice 19 · test-engineer · invocation 3

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Build AC-8, re-source QS-13
- Returned: 2026-09-10T11:19:29.820Z
- Duration: 1143s

---

## Summary

Resumed step 3 for the one file named — `tests/integration/telemetry-booking.test.ts` (slice 09's, mine) — per `I-19-2` ruled (a) at `docs/slices/19-design.md` ruling 13. Built AC-8's three re-sourced legs against the rewritten `QS-13` in `docs/arc42/10-quality-requirements.md`, without reading `src/`.

**The three legs, built vs. asserted before/after:**

1. **The window** — stayed on `seedRetryOnceFixture` (unchanged). Before: asserted "≥1 `appointment.insert` span" with an availability-window ordering claim, as part of a shared fixture that also asserted a 2-attempt waterfall and an absorbed-conflict metric. After: asserts exactly **1** insert span (the fixture now confirms on attempt 1 under free-first), that the candidates span still ends before it begins, and — new — that the succeeding span does **not** carry ERROR. Dropped `BOOKING_SEED`/`SHARED_SEED` entirely since the outcome no longer depends on it.
2. **The waterfall** — moved onto the fully-blocked fixture AC-4 already seeds (2 bays/2 technicians, both pairs blocked). Added a new assertion: exactly 2 `appointment.insert` spans, each with a distinct `booking.attempt`, `bay.id`, `technician.id`, `db.sqlstate=23P01`, a `db.constraint` in the exclusion pair, and OTel ERROR — the claims the old fixture used to carry.
3. **The absorbed conflict** — new fixture (`seedRescheduleAbsorbedFixture`), a **reschedule** whose incumbent pair (tried first, before ADR-0040's shuffle opens, per arc42 §6.3) conflicts on `no_bay_overlap` via a de-qualified blocker technician (`I-09-2`'s established remedy), then succeeds. Asserts `booking_conflicts_total{resource=bay,outcome=absorbed}` = 1, no `outcome=refused`, and a trace-correlated `booking.conflict` line — permutation-safe, no `BOOKING_SEED` needed.

**What QS-13 could assert before and cannot now:** nothing was weakened — every claim moved to a fixture that still exercises it. The one thing genuinely gone is the *single booking request* that simultaneously demonstrated the window, the waterfall, and the absorbed-conflict metric in one trace; that demonstration is now spread across three requests/fixtures, which is the direct, named consequence of free-first making a single-threaded conflict-while-capacity-remains unconstructible on the booking path.

**Leg 3 was buildable** inside this step — no DCR needed. The one trap worked around: `I-09-2`'s technician coin-flip, avoided by de-qualifying the blocker technician from the real service type (mirroring `seedRetryOnceFixture`'s own established remedy) so the technician candidate list stays a permutation-safe singleton.

**Full-suite result:** `npm test` green — `nodb` (34 files), `db` (29 files), `perf` (1 file), exit 0, run both before and after the commit. The file's own 16 tests pass stably across 3 repeated runs.

**Commit:** `e1d925a` — `test(19): re-source QS-13 onto three fixtures after free-first (I-19-2, AC-8)`, pushed to `slice/19-attempt-cap-sized-against-occupancy`. PR comment posted: https://github.com/sleepyshark85/keyloop-challenge/pull/27#issuecomment-5617837025

Relevant file: `/home/agentadmin/sources/keyloop-challenge/tests/integration/telemetry-booking.test.ts`
