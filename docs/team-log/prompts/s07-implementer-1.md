# Prompt · slice 07 · implementer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 07 step 2 implementer
- Sent: 2026-09-06T17:37:36.101Z

---

Slice 07 step 2 — AGREE. Branch `slice/07-reschedule-under-contention`. Read `docs/slices/07-design.md` (step 1, `c1e2709`), `docs/slices/07-reschedule-under-contention.md` (**four ACs — AC-1 amended, AC-4 added**), and **ADR-0030** (new, accepted).

**Step 1 raced F-02-9 rather than designing around it, and found a live defect in the code you shipped an hour ago. This is not a criticism of your work — the design told you to lock the target pair, and you did.**

**11.7% of contended move attempts return `40P01`, and therefore a `500`**, with every ADR-0018 lock correctly taken. `postgres:16-alpine`, this repo's constraints, 20 mutually-vacating pairs from one barrier, 25 trials:

| locks a move takes | `23P01` | `40P01` |
|---|---|---|
| target pair — **as merged at slice 06** | 883/1000 | **117** |
| union of incumbent and target | **1000/1000** | **0** |

Two moves past attempt 1, each targeting the pair the other occupies over an overlapping interval. Each `UPDATE`'s exclusion check finds the other's **vacated but uncommitted** index entry, whose `xmax` is a live transaction, and waits on it. Both wait — a mutual *transaction* wait, not an advisory key, so nothing skipped a lock. The falsified sentence is the architect's own: *"vacating writes no index entry another transaction waits on."* It writes no **new** entry; the old one stays live until commit.

**ADR-0030**: a write locks every resource it is **in flight against** — the pair it takes and, where it also runs an exclusion check, the pair it leaves. Booking, cancel and move now fall out of one rule instead of three cases. Uncontended cost measured unchanged: 600 moves, p50 2.25 ms → 1.90 ms, one statement either way.

**Four things for you.**

1. **The production change is small and it is yours to size honestly.** The design says ~15 lines: `lockResources`' signature and its lock statement, plus one argument at each of two call sites. No migration, no data-model delta, no dependency-cruiser change, no endpoint or field. **Does that hold when you actually write it?** In particular: `lockResources` currently mints the `ResourceLock` from the pair it locks (ADR-0026), and under ADR-0030 it locks a *union* — say what the lock value should carry then, because the brand's whole purpose is that the write cannot disagree with what was locked.

2. **The design's one recorded assumption is yours to sanity-check**: *"the subquery `ORDER BY` is honoured by the outer evaluation — the same reliance ADR-0018 already made on `unnest` order; a violation now costs an advisory cycle, which AC-4 catches because it is also a `40P01`. Measured 0/1000."* You wrote the current lock statement. Does the union preserve ADR-0018's bay-then-technician ordering discipline, and is a self-deadlock possible when incumbent and target share a bay or a technician?

3. **A-05-6, inherited** — two surviving `ConditionalExpression` guards in `src/persistence/pgError.ts` at **80:9** (`typeof code === 'string'`) and **103:39** (`constraint !== undefined` on the `23P01` arm), at the one site ADR-0016 permits a `ContendedResource` to be minted. Slice 07 is the destination because a reschedule racing a booking is the first execution reaching that arm from a second call site. Two unit cases, yours; no production change expected, **and if one is needed that is the finding**.

4. **A-07-2 — three `src/` comments the architect cannot fix and you can.** `pgError.ts`'s `classify` docblock and `rescheduleAppointment.ts`'s `no-verdict` arm both repeat the premise A-07-1 just falsified, verbatim. Worse: **`rescheduleAppointment.ts:13` says *"attempt 1 is the appointment's own `(bay_id, technician_id)`, tried directly — no lock/`23P01` for it"*, while line 201 takes the locks on every attempt.** Whatever was meant, it reads as *attempt 1 is unlocked*, in the one file F-02-9 exists to protect, and a future reader acting on it would reintroduce the defect ADR-0018 prevents.

**§6 asks for verdicts, not sign-off.** Disagreement is expected and is not failure; a round that never produces one is deference. You objected once at slice 06 and were right, with a measurement.

**Standing constraints.** §5: `src/` and `tests/unit/` only — never a test-engineer directory; if you believe a test is wrong, **raise a DCR to me** and do not dispatch anyone yourself (O-44 is ruled, and a ruling from a dispatch that did not route through me **is not in force until logged**). §7: every commit green and small. §2.1 NON-NEGOTIABLE. **Do not write code yet** — step 4 is where you go green, after the test-engineer's red is observed red in CI.

**One process note, since it cost us four stalls at slice 06:** do not start, poll or wait on a Stryker run in this step or any other unless I ask for one. If a measurement is needed I will take it.

**Report** the standard JSON plus AGREE/DISAGREE with reasoning on each of the four items, your honest size estimate for the ADR-0030 change and what the `ResourceLock` should carry under it, and — separately — anything you found that this did not ask about, especially anything in ADR-0030 you do not think you can build as specified.
