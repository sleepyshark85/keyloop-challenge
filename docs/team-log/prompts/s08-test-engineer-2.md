# Prompt · slice 08 · test-engineer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 08 step 3 red commit
- Sent: 2026-09-07T05:18:02.653Z

---

Slice 08 **step 3 — RED.** Branch `slice/08-availability-query`, PR **#17**. Write the failing tests and commit them red.

**Both your step-2 findings were upheld, and one retired the architect's own criterion.**

- **T-08-1 — ruled (a), your remedy accepted as proposed, no loopback.** The architect's words: *"table-wide is not merely fragile here, it is **wrong** — it observes rows that provably cannot matter."* Every row that can move the query's answer or a probe's verdict carries the fixture's `dealership_id`, because the composite FKs make a bay and a technician belong to exactly one dealership. **Per-dealership weakens nothing; it is the scope the witness always meant.** One mechanical note it added: take `count(*)` and `max(updated_at)` **in one row** and compare NULL-safely, since `max` over an empty set is NULL before the first fixture write.
- **T-08-2 — upheld, and AC-7 is withdrawn.** Its reasoning, unprompted: *"a Definition-of-Done criterion satisfied before the slice opens cannot fail the slice, and a criterion that cannot fail is not evidence — which is §2.4's own argument, and I minted one against it a week after ruling on exactly that shape."* The obligation is now **discharged by citation** in the slice file's Inherited scope, naming `ambiguity-containment.test.ts:507-524` and the fact that ADR-0032's Option D is the only option leaving the marker's file list unchanged. **Six ACs, as the file shipped. Do not write a test for AC-7.**
- **T-08-3 — your `fc.pre()` backstop is now a requirement in AC-1 rather than an observation in a report.**

**AC-1's final wording is in the slice file** and is the architect's exact text — read it there, not from me. It carries: the candidate universe, the `[from, to)` probe interval, `SAVEPOINT` probes, `23503`/`23514`/`40P01` failing **distinctly**, both directions counted apart with the shrunk counterexample naming which failed, the boundary-biased generator, the per-dealership quiescence witness, and the `fc.pre()` discard path that must not be swallowed by a `try/catch`.

**What must go red, and why it will.** `GET /availability` does not exist — no route, no `queryAvailability`, no `busyResources`. AC-1 through AC-6 all fail. Make them fail for that reason and not because something does not compile.

**The one thing I want you to watch.** QS-8 is a property over generated schedules, and this slice's whole subject is that **nothing refuses a wrong answer** — there is no constraint to adjudicate availability. So the property is the only thing standing between a wrong answer and a green build. Say in your report what would make it pass while wrong, beyond the five mechanics already specified, and whether you closed it.

**Non-negotiables.** §2.2 Testcontainers. §2.4 and §7: **exactly one red commit**, `test(acceptance): … (red)`, observed red in CI — push it and let `red-proof` classify. §5: you own `tests/acceptance|contract|property|concurrency|integration(db-invariant)`; never `tests/unit/`, never `src/`.

**Post to PR #17 when the red lands.** Your agent definition now carries the rule as a generated block — short **and** self-contained, one italic framing line, gloss each reference as you use it.

**Report** the standard JSON with `red_commit`, `ci_failure_confirmed` and the run URL, which criteria failed and why, your answer on what could make QS-8 pass while wrong, and anything step 2 did not anticipate.
