# Prompt · slice 19 · architect · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Rule I-19-2 telemetry fixture
- Sent: 2026-09-10T10:42:48.935Z

---

keyloop-challenge (/home/agentadmin/sources/keyloop-challenge), branch `slice/19-attempt-cap-sized-against-occupancy`, PR #27. **Fourth dispatch on slice 19. Step 4 produced a finding that may be a DCR — rule it. Reply before you edit, per §6.**

`git pull`. Step 4 is otherwise **green and better than forecast**:

- **AC-1: 200/200 confirmed** at `k=11` (red was 163/200).
- **AC-2: attempts p95 = 1** (max 1) at every `k ∈ {0,3,6,9,11}`; bar was ≤ 2.
- **QS-16: all four tuples exact `min(N,M)`** — `(20,1,11)→1`, `(20,4,8)→4`, `(8,8,4)→8`, `(20,8,4)→8`. **Your burst re-synchronisation risk did not materialise.** No loopback on that ground.
- P6/P8/P9/P10 green. `typecheck` and `lint:arch` clean.
- **AC-6 measured**: uncontended booking **p95 18.37 ms** (budget 100 ms), availability **p95 14.16 ms** (budget 200 ms). Your "a few ms against a 100 ms budget" prediction holds.
- **`OQ-19-1` settled**: no dedicated span. The implementer's reasoning — `busyResources` rides unspanned today on the `GET /availability` path too, a span could only be added inside `appointmentRepository.ts` which the design marks not-edited, and AC-6 shows no operational case. Confirm or overrule.
- `T-19-4` discharged: the implementer verified P8/P9 assert the right thing by reasoning against its own implementation — P8's sorted-array equality against the `EMPTY_OCCUPANCY` control would diverge in length if `busy` ever removed a candidate; P9 would fail against exactly the per-group `freeHead === undefined` bug you warned about, the moment `busy` names every remaining candidate.

Commits `56269be`, `2aeeacb`.

---

## `I-19-2` · implementer · MAJOR · step 4 — the ruling I need

**`npm test` is not green.** `tests/integration/telemetry-booking.test.ts` (test-engineer's, slice 09) fails **3 of 14**: "exactly one failed attempt span", "two distinct `booking.attempt` values", "at least one `booking.conflict` line". I reproduced it: 3 failed, 11 passed; the rest of the db project passes.

**Why.** That fixture manufactures a retry-then-succeed waterfall with 2 bays, pre-occupying bay-0, relying on ADR-0009's blind shuffle to draw the occupied bay first anyway at `BOOKING_SEED = 7`. Free-first now correctly avoids it, so the booking confirms on attempt 1.

**The fixture anticipated this in its own docblock**: *"The shuffle is a pure function of (list lengths, seed) — ADR-0009 — so the seed transfers across namespaces; it would stop transferring only if candidate ordering itself changed, which is exactly the kind of regression a fixed seed is supposed to catch."* It detected the intended change, not a regression. The implementer did not edit it — correctly, it is not its file — and raised it.

**The consequence ADR-0040 has and `19-design.md` does not name:** with a correct snapshot there is **no single-threaded interleaving that yields a conflict while capacity remains**, because free-first guarantees the head of both lists is free whenever one of each exists. I checked every deterministic reconstruction I could think of and they are all closed — `busyResources` uses the same range predicate, dealership scope and `status <> 'cancelled'` filter as the exclusion constraint, and `A-4` makes the occupancy and appointment intervals identical. So slice 09's telemetry assertions have lost their deterministic fixture, permanently, as a *designed* consequence.

### What I want ruled

1. **Is this (a), (b), (c) or (d)?** To rule **(c)** you must name the acceptance criterion, §10 scenario or §2 invariant that fails — and note `CLAUDE.md` §10's Definition of Done requires **all tests green**, which is currently false, so a "merge as-is" reading of (b) is not available the way it was for `H-19-1`. **0 of 2 loopbacks spent.**
2. **Whose work is the remedy?** `tests/integration/` is shared under §5; that file asserts telemetry, not a database invariant. Say plainly whether it is the test-engineer's or the implementer's, because the wrong answer here is a boundary violation either way.
3. **What is the remedy?** Two routes I can see, and I may be missing better:
   - **Real concurrency** drives the conflict — the racer takes the resource between snapshot and insert. Deterministic no longer; slice 09's fixture chose a fixed seed *specifically* to avoid that.
   - **Assert the waterfall on a REFUSED booking** — a fully-occupied dealership still produces multiple `appointment.insert` spans with distinct `booking.attempt` and the ERROR status on failed attempts. Keeps everything slice 09 wanted to prove about the span waterfall; loses the trailing `201`.

   If you take the second, say explicitly what slice 09 assertion is *lost* and whether anything else still covers it — I do not want a telemetry criterion quietly weakened to make this slice green.
4. **Does ADR-0040 need to record this?** It is a real, permanent, designed consequence of the chosen option: *a conflict is no longer constructible single-threaded while capacity exists.* ADR-0040 is still `proposed`, so its Consequences are freely editable. My view is that it belongs there and its absence is the reason this surfaced at step 4 rather than step 1 — but that is your call, and it is your design that omitted it, so say so either way.
5. **Does `19-design.md` §11.1 need a debt row**, or arc42 §10, for telemetry evidence that now depends on concurrency?

## Then, in the same run

Reply per point first, then amend `19-design.md`, `docs/adr/0040-*.md` and — if a ruling moves them — arc42 §10. **Do not edit `src/` or `tests/`**; name whose the remedy is and I will dispatch that role. Do not touch `docs/STATUS.md`, `docs/team-log/`, `docs/DEFECTS.md`.

Commit `docs(19): …` with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tt2bAYr18YJJMNjQwaAmRA
```

Run `docs:check`, `docs:adr-check`, `docs:budget:check`, `log:check`; report results, the commit sha, and a **short self-contained** PR comment I can post verbatim.
