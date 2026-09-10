# Prompt · slice 19 · test-engineer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Build AC-8, re-source QS-13
- Sent: 2026-09-10T11:00:25.349Z

---

keyloop-challenge (/home/agentadmin/sources/keyloop-challenge), branch `slice/19-attempt-cap-sized-against-occupancy`, PR #27. **Step 3 resumes for ONE file** — `tests/integration/telemetry-booking.test.ts`, yours from slice 09. `git pull` first.

## What happened while you were away

Step 4 is green and better than forecast: **AC-1 200/200** (red was 163/200), **AC-2 attempts p95 = 1** at every `k`, **QS-16 exact `min(N,M)` at all four tuples including `(20,8,4)`** — your added tuple did not break it. AC-6 measured 18.37 ms / 14.16 ms p95 against 100 / 200 ms budgets. `T-19-4` discharged: the implementer verified P8/P9 assert the right thing by reasoning against its own code, not just by their green.

**But `npm test` is not green, and it is your file.** Commits `56269be`, `2aeeacb` (implementation), `6f173bf` (design), `343aef9` (AC-8).

## `I-19-2`, ruled (a) — read `docs/slices/19-design.md` ruling 15 and AC-8 in the slice file

Your slice-09 fixture builds a retry-then-succeed booking with 2 bays, pre-occupying bay-0 and trusting ADR-0009's blind shuffle to draw the occupied bay first at `BOOKING_SEED = 7`. **Free-first now correctly draws the free bay**, so the booking confirms on attempt 1 and 3 of 14 assertions go red: "exactly one failed attempt span", "two distinct `booking.attempt`", "at least one `booking.conflict` line". Reproduced: 3 failed, 11 passed.

**Your own docblock predicted it** — *"it would stop transferring only if candidate ordering itself changed, which is exactly the kind of regression a fixed seed is supposed to catch."* It caught the intended change.

**The permanent consequence:** `busyResources` shares the exclusion constraint's range predicate, dealership scope and `status <> 'cancelled'` filter, and `A-4` makes the two intervals identical — so **no single-threaded interleaving yields a conflict while capacity remains.** A retry waterfall now needs a **refusal** or **real concurrency**. This is not a fixture to nudge; the construction is gone.

The architect ruled this **(a) clarification**, declined **(c)** though QS-13's *Given* is literally red, and **named the omission as its own**. The remedy is yours because the implementer has now written the free-first code, and a role rewriting the criterion its own diff must meet is the boundary §5 exists for. It raised rather than edited — §5 followed exactly.

## Build AC-8 — three fixtures, no claim weakened

arc42 §10's **QS-13 is rewritten**; cite it, not the slice file.

1. **The window** — `availability.candidates` ends before the first `appointment.insert`, and that span is not ERROR. Stays on the **two-bay fixture**, which now confirms on attempt 1.
2. **The waterfall** — every attempt an `appointment.insert` span with a **distinct `booking.attempt`**, `db.sqlstate=23P01`, a `db.constraint` in the exclusion pair, and **ERROR** status. Moves to the **fully-blocked fixture AC-4 already seeds** — permutation-safe, needs **no seed**. Every attribute `R-09-5` named for the screenshot is kept.
3. **`booking_conflicts_total{outcome=absorbed}`** — moves to the **reschedule** path. Ruling 5 leaves reschedule ordering from `EMPTY_OCCUPANCY`, so ADR-0009's blind seeded shuffle survives *there*, and `attemptLoop.ts` is shared (`F-06-1`): same increment site, same `booking.conflict` line, only the span name becomes `appointment.update`.

**Leg 3 is ruled IN, not traded away.** Without it the `absorbed` claim drops silently from end-to-end to `tests/unit/application/attemptLoop.test.ts:396` — evidence of the counting rule, not of the export path.

**Two traps the architect named so you do not rediscover them:**
- `I-09-2`'s technician coin-flip — slice 09 solved it by de-qualifying the blocker.
- Reschedule's **lazy** seed draw: the fixture must make the **incumbent pair itself** conflict before any shuffle happens.

**If leg 3 proves unbuildable inside this step, that is a DCR back to the architect — never a silent drop.** Say so plainly rather than quietly landing two legs.

## Boundaries

- **Do not read `src/`** — including via `grep`, `cat`, `sed` or any shell command. The hook guards the `Read` tool only; the boundary is yours. `T-19-3` is already deferred to the gate; a second instance in the same slice would be a different conversation.
- **Never touch `tests/unit/`**, and do not edit `src/`.
- **Do not `git add`** `docs/STATUS.md`, `docs/team-log/` or `docs/DEFECTS.md`.

## Commit

This is a **green** commit, not a red — the implementation already exists and AC-8 re-sources evidence onto it. `test(19): …`. Footer:

```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tt2bAYr18YJJMNjQwaAmRA
```

Run the **full** `npm test` before you finish — the bar is the whole suite green, not this file. Push.

## Report

- Each of the three legs: built, and what it asserts now versus what it asserted before.
- **Anything QS-13 could assert before and cannot now** — I want this named, not discovered at step 5.
- Whether leg 3 was buildable, and if it took a trap you had to work around, which.
- Full-suite result and the commit sha.
