# Prompt · slice 07 · implementer · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Fix three stale premise comments
- Sent: 2026-09-07T03:27:58.932Z

---

Slice 07 — **three comment corrections before the gate.** Branch `slice/07-reschedule-under-contention`. Pull first. Comment-only, no behaviour change, one small commit.

**Your work is done and approved.** The reviewer approved the slice. Mutation on changed files is **96.25**, and `appointmentRepository.ts` — the file you rewrote — is **100.00 with zero survivors**. Every survivor across all four changed files is accounted for by a prior classification or a prior prediction, and **none sits on a line this slice added**.

**Your I-07-2 prediction is fully vindicated.** The two `pgError.ts` survivors are exactly the equivalent mutants you called at step 2 before writing anything. The reviewer differential-tested 254 adversarial inputs — boxed `String` codes, `{toString:()=>'23P01'}`, symbols, `NaN`, prototype keys — and found **zero distinguishing inputs**. And the obligation's own escape clause fired as you predicted it might: R-07-7's `Object.prototype` reach was the production change A-05-6 said would be *"the finding"* if one were needed.

**The reviewer also confirmed ADR-0031 closes R-07-1 on all three write paths**, with an argument stronger than the ADR's own: every transaction that waits for an appointment row lock **holds nothing at that moment** — a mover blocks at `lockAppointmentRow` before any advisory acquisition, a cancel blocks inside its single statement before writing a dirty tuple — so a row-lock waiter can never be the other edge of a cycle.

## A-07-5 — the architect found three comments still asserting the falsified premise

A-07-2 named two sites and you fixed both. **Nobody looked at the booking path, and it repeats it twice.**

- `src/application/rescheduleAppointment.ts:104` — *"it names the write path that skipped ADR-0018's locks"*
- `src/application/bookAppointment.ts:146` — *"a write path skipped them"*
- `src/application/bookAppointment.ts:427` — *"a deadlock can only mean some write path did not take them"*

**The premise is false and this slice is what falsified it.** A `40P01` does **not** mean a path skipped its locks. It means a path **did not lock every resource it was in flight against** — which is ADR-0030's rule — and under ADR-0031 that lock set must be computed **inside the transaction**, because a set computed from a read taken before the transaction opened can be stale. Slice 07 measured both: 11.7% of contended moves deadlocking with every ADR-0018 lock correctly taken, and then a second live path where ADR-0030's own rule could be violated.

Correct all three to the ADR-0030/0031 reading. `pgError.ts`'s docblock already carries the right wording from your earlier pass — *"some write path did not lock every resource it was in flight against"* — so match it rather than inventing a fourth phrasing.

**This is comment-only.** No behaviour, no test, no mutant can see it. It matters because it is the **fourth instance of D-06-4's shape** — a stale claim in `src/` that the architect cannot reach — and because a future reader acting on it reasons wrongly about the one rule this slice exists to establish.

**Constraints.** §5: `src/` only here; do not touch any test. §7: one green commit, `fix(07):` or `docs(07):` as you judge — it is `src/` so `fix` reads better, but say which and why in your report. Keep `typecheck` and `lint:arch` clean. Do **not** run Stryker — the measurement is taken and comments generate no mutants.

**Report** the standard JSON, the commit, the exact wording you used, and whether you found any *fourth* site while looking — the architect found these three by reading, and a grep may turn up more.
