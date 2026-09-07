# Prompt · slice 07 · test-engineer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Fix AC-4 vacuity gaps
- Sent: 2026-09-06T19:18:26.279Z

---

Slice 07 — **step 5 remediation on your own files.** Branch `slice/07-reschedule-under-contention`. Pull first. The reviewer returned changes-requested; three of its findings are yours and are **the same vacuity standard you yourself raised as T-07-2**, applied to the file that raised it.

**Its verdict on your work first, because it is unusually strong**: *"The AC-4 test file is the strongest test-engineer artifact this project has produced, and the T-07-5 catch is the kind of thing that is only ever found by someone who checks their own instrument against a raw dump."* It also independently traced your I/J/blocker intervals and qualification wiring and confirmed the forced attempt-2 is **genuinely structural**, and that "neither move can ever succeed" is doubly guaranteed.

**Your T-07-5 sweep result came back negative on its hypothesis, and that is worth knowing**: no assertion in the suite was made vacuous by ADR-0029. There are exactly two raw-SQLSTATE substring assertions against service output. `no-spurious-refusal.test.ts:377` (`25P02`) is live. `cancellation-takes-no-lock.test.ts:368` (`40P01`) is half-blind — but **always was**, for an older and wider reason: the `no-verdict` arm swallows the SQLSTATE on *both* paths, so a booking-side victim never prints it. Your new file avoided the trap correctly by reading the structured event.

**Three fixes, all in `tests/concurrency/refused-move-leaves-original.test.ts`.**

1. **R-07-3 — MAJOR. `succeededCount` is computed and never asserted.** Your file header claims structurally that neither move can ever succeed; that claim is argued and not measured. A fixture regression — a blocker row that stops overlapping, a qualification wired to a second technician — lets 100 of 1600 movers succeed at attempt 1, and the run still passes: `badAnswers` accepts 200, `unchangedViolations` inspects only 409s, `conflicts.length >= 1600` still holds because the other 1500 emit ~3000, and `overlaps` is still empty. **Green, with 100 movers that never entered a contended cross-vacate.** One line — `expect(succeededCount).toBe(0)` — closes it and pins `refusedCount` at 1600 by arithmetic.

2. **R-07-5 — MINOR. The positive witness asserts a maximum and a floor, while you and the file claim all 1600 movers reach attempt 2.** `max(attempt) >= 2` plus `conflicts.length >= 1600` is satisfied by **one** mover at attempt 2 and 1600 attempt-1 lines. Your claimed fact implies ~3200 conflicts with 1600 at attempt ≥ 2. `conflicts.filter(c => Number(c.attempt) >= 2).length` is the measurement your own standard asks for — *"forced by construction here rather than merely likely"*. The uniform-regression case is caught by the max; the heterogeneous one is not.

3. **R-07-11 — MINOR. `service.logRecords()` is read with no drain wait**, unlike `no-spurious-refusal`'s `awaitLogRecords`. A `reschedule.deadlock` from trial 39 can still be in the child's stdout pipe, leaving `deadlocks.length` at 0. The `badAnswers` 500 check covers it independently so the claim survives on two observers — but say why you diverge from the drain convention, or adopt it.

**Also correct the header's arithmetic — R-07-6, MINOR.** Your 0.034% false-pass figure is a point estimate that propagates no uncertainty in *p*, and *p* is machine-dependent and unmeasured on the machine that runs the test. 41/7800 gives a 95% interval of roughly **0.27%–0.80%**; at the lower bound, `(1-0.0027)^1600 ≈ 1.3%` — **38× worse than reported, and worse than the 0.67% the raise from 25 to 40 trials was made to fix.** The raise is still right; the headline number is over-precise. State the interval rather than the point.

**Do not touch R-07-4 yet.** The reviewer found AC-4 releases 40 concurrent requests against a **10-client pool** with a 1 s acquire bound — a queued acquire past that rejects codelessly and surfaces as a `500` your `badAnswers` then blames on a deadlock, while `deadlocks.length` is 0. **A false failure, not a false pass.** Whether the remedy is fewer racers, a production pool `max`, or the assertion's message is with the architect now. I will bring you its ruling.

**Constraints.** §5: your directories only — no `src/`, no `tests/unit/`. §7: commit `test(07):`, **not** `(red)` — the one red commit is `e030f52` and this is a repair to an already-red-proven file. Re-run the two concurrency files against the current green tree and confirm they still pass; if any fix turns one red, stop and tell me rather than adjusting the fix to keep it green.

**Report** the standard JSON, what each assertion now measures that it did not, the corrected false-pass interval, and — separately — anything the reviewer's findings turned up that it did not itself name.
