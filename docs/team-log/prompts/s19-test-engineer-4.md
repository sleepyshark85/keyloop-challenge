# Prompt · slice 19 · test-engineer · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Remedy R-19-4 and R-19-7
- Sent: 2026-09-10T12:01:31.013Z

---

keyloop-challenge (/home/agentadmin/sources/keyloop-challenge), branch `slice/19-attempt-cap-sized-against-occupancy`, PR #27. **Step 5 review is in. Two findings in `tests/integration/telemetry-booking.test.ts` are yours.** `git pull` first.

The reviewer **did not block**, and it cleared two things about your work by measurement rather than by taking your word:

- **`T-19-4` discharged.** It hand-mutated compiled `dist/domain/candidates.js` into `Filter-1` (filter rather than permute) and into the per-group `freeHead === undefined` bug; **P8, P9 and P10 fail against both.** Your properties assert the right thing. It also noted P8 alone is a self-control — an *unconditional* filter would slip past it — but pre-existing P2 and your deterministic P10 close that.
- **`T-19-5` — no evidence is lost.** `describeLoopLines` (`tests/support/booking.ts:645-649`) renders `exit=… attempts=… seed=…` into `where`, which is appended to the strict assertion's own failure message. The `console.log` is a convenience. MINOR stands, no action.
- **`T-19-3` — no second `src/` read.** The `candidates.ts:64/111` references in your report are vitest stack-trace frames and you disclosed them as such. Commit paths clean in both directions.

## `R-19-4` · MAJOR — AC-8 weakened three claims, and nobody caught it including me

AC-8 says QS-13's claims are *"re-sourced, **not weakened**"*, and my own commit message said *"Every claim survives."* **Three do not survive on the export path.**

The old file asserted, **against the collector**, that:
1. exactly one of the two insert spans carried `db.sqlstate` — i.e. **a succeeding span carries none** (old L328-329);
2. `booking.attempt`, `bay.id` and `technician.id` were present on **both** spans (old L345-358).

In the new file: leg (i) checks its single succeeding span only for `statusCode !== 2`; leg (ii)'s loop runs over two **failed** spans; leg (iii)'s inserts are never inspected. **The substance now stands only at `tests/unit/application/attemptLoop.test.ts:183-187` and `:216`** — in-process, against an in-memory exporter.

That is exactly the descent ruling 15 named and **refused** for leg (iii) — *"a §10 claim drops silently to `attemptLoop.test.ts`, evidence of the counting rule and not of the export path"* — applied to leg (i)'s span attribution instead, unnoticed. Concretely: **a change that stamped `db.sqlstate` onto successful insert spans failed the old file and passes the new one.**

Remedy: three `expect`s on `insert` after line 425. Restore, on the *export* path, that a succeeding insert span carries no `db.sqlstate`, and that `booking.attempt`, `bay.id` and `technician.id` are present on it.

One thing the reviewer checked separately and ruled **correct**, so do not "restore" it: dropping the exact `db.constraint === 'no_bay_overlap'` assertion. The fully-blocked fixture blocks both resources, so either constraint may fire, and rewritten QS-13(ii) says so.

## `R-19-7` · MINOR · L428-435

Leg (i)'s new *"no `booking_conflicts_total` point of any outcome"* is a **pure absence claim with no positive control**, and its `beforeAll` deliberately skips `awaitMetricPoints` (L373-378). **A metric pipeline that exported nothing at all passes it vacuously.** Contained — legs (ii)/(iii) would go red — but your own file's house pattern for absence claims guards with a `spans().length > 0` check (L756-760). Apply that pattern, or argue why leg (i) is different.

## Where I got it wrong, for the record

I wrote "Every claim survives" into a commit message on your work's behalf without auditing the diff assertion-by-assertion. The reviewer did that audit and found three that didn't. That's mine, not yours — but it's why I'm asking you to be exact here rather than quick.

## Boundaries

Your directories only. **Do not touch `tests/unit/`** — `R-19-1` and `R-19-2` are the implementer's and are being dispatched in parallel; expect `tests/unit/domain/candidates.test.ts` and `tests/unit/application/attemptLoop.test.ts` to change under you. Do not read `src/` by any means. **Do not `git add`** `docs/STATUS.md`, `docs/team-log/` or `docs/DEFECTS.md`.

## Commit

`test(19):`. Footer:

```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tt2bAYr18YJJMNjQwaAmRA
```

Run the **full** `npm test` before finishing — the implementer is committing to the same branch, so pull before you push and re-run if you rebase. Push.

Report: per finding, the assertions you added and what each would now catch that it would not have; anything else you find that AC-8 lost and the reviewer did not name.
