# Prompt · slice 07 · test-engineer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 07 step 3 red commit
- Sent: 2026-09-06T17:46:12.505Z

---

Slice 07 **step 3 — RED.** Branch `slice/07-reschedule-under-contention`, pushed. Write the failing tests and commit them red.

**Your step-2 review is accepted in full and nothing was contested**, so there is no adjudication round to wait for. Everything you verified stands: `xmin`/`ctid` reachable via the bare-`Client` pattern `cancellation-releases-slot.test.ts` already uses; the barrier is already released client-side before any request reaches the server, so barrier-before-locks needs no new work; two files, both new, no collision.

**Your empirical check is on the record as T-07-1** — 15/15 deadlock on a take-then-leave ordering, so AC-4 does cover ADR-0018's ordering, with your precision that it cannot and need not distinguish two equally-valid canonical orders.

**Your own T-07-2 is the thing to build most carefully.** *"Zero of 1000 `40P01`"* is vacuously true of a fixture where both movers' attempt 1 simply succeeds and the union-lock path is never reached. On `no-spurious-refusal.test.ts`'s own T-04-4 principle, **witness both racers reaching attempt ≥ 2 targeting the other's pair** — via the `booking.conflict` `attempt` field you already read there — before the absence of `40P01` is trusted as evidence about ADR-0030 rather than about an inert race.

**What must go red, and why it will.** ADR-0030 is not built: `lockResources` still locks the target pair only, exactly as slice 06 merged it. The architect measured that shape at **117 `40P01` per 1000 contended attempts**. AC-4's fixture — *P* = 20 independent mutually-vacating pairs over ≥ 25 trials — is ~500 attempts, so a red is expected with wide margin rather than marginally. **Say in your report what you actually observed**, because that number is this slice's baseline and step 4 has to move it to zero.

**The four criteria.**

- **AC-1** — refused single move leaves the row `confirmed` at its original interval with the same id, bay, technician **and the same `xmin` and `ctid`**. That clause is what makes *unchanged* mean **not written**: a compensating cancel-then-restore passes column equality and fails this.
- **AC-2 / AC-3** — the transient-release barrier against *N* fresh bookings, from a recorded seed, stable across runs, and a failure names the seed.
- **AC-4** — racing moves on **different** incumbent pairs, each contended at its own pair so each move's remaining candidate is the pair the other occupies. Every attempt gets a database verdict — `23P01`, **never `40P01`** — no `500`, no two confirmed rows overlapping on a bay or technician, and every refused move's row unchanged including `xmin`.

**Files** — `tests/concurrency/refused-move-leaves-original.test.ts` (AC-1, AC-4) and `tests/concurrency/move-never-releases-slot.test.ts` (AC-2, AC-3), matching the slice file's In scope list.

**Non-negotiables.** §2.4 and §7: **exactly one red commit**, `test(acceptance): … (red)`, and the red **observed in CI** — push it and let `red-proof` classify it. §2.2: Testcontainers. §5: never `tests/unit/`, never `src/`. Make it fail for the reason it is supposed to, not because something does not compile.

**One thing I want you to watch for and report either way.** The architect's measurement was `117/1000` — **11.7%, not 100%.** A test that asserts *never `40P01`* over a sample can pass by luck on a run where the race does not bite. Say what your sample size makes the false-pass probability, and if it is not negligible, say so plainly rather than shipping an assertion that is green three runs in four.

**Report** the standard JSON with `red_commit`, `ci_failure_confirmed` and the CI run URL, the observed `40P01` count and rate in your red run, your false-pass analysis, and — separately — anything you hit that step 2 did not anticipate.
