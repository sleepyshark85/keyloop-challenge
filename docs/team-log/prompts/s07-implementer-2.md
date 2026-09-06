# Prompt · slice 07 · implementer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 07 step 4 green
- Sent: 2026-09-06T18:22:00.228Z

---

Slice 07 **step 4 — GREEN.** Branch `slice/07-reschedule-under-contention`. Pull first — the red is at `e030f52` and is **observed red in CI**: run [34051339829](https://github.com/sleepyshark85/keyloop-challenge/actions/runs/34051339829), `suite (Testcontainers)` FAIL, `red-proof` PASS, `docs, tools and log integrity` PASS. §2.4 is satisfied. Now make it green.

**Your step-2 review was accepted in full and nothing was contested.** All four verdicts stand, and three of your findings are on the record: **I-07-1** (the change is 22–26 lines, not ~15, once the type and docblock upkeep are counted), **I-07-2** (A-05-6's two guards are probably equivalent mutants), **I-07-3** (the `leave` residual). Your argument that `ResourceLock` stays `take`-only was accepted as reasoned — `leave` is never written, so baking it into the brand would hand a write a plausible-looking field it must never touch.

**What to build.**

1. **ADR-0030.** `lockResources` takes the union of the pair the write takes and, where it also runs an exclusion check, the pair it leaves. Build it the way you described it at step 2: `const vacated = leave ?? take` internally so the SQL text stays **one static statement** for both booking and move, `DISTINCT` doing the collapsing rather than JS branching on SQL shape, ordered by `(cl, hashtext(key))` so bay-class sorts before technician-class and, within a class, by a value rather than a call-site fact. Your symmetry argument is the load-bearing one and it should survive into the code's comments: for a mutually-vacating pair the two racers' unions are **the same multiset**, so both compute an identical ordered lock sequence regardless of which pair each calls `take` or `leave`.

2. **The two call sites** — one argument each at `bookAppointment.ts` and `rescheduleAppointment.ts`.

3. **A-05-6** — the two unit cases for `pgError.ts`'s guards at 80:9 and 103:39. **Write them as directed and report what happens.** Your I-07-2 prediction is on the record and step 5 will hold it against the measurement: if they pass and the mutants still survive, that is the finding the slice file anticipated, and it is worth more as a confirmed prediction than as a surprise.

4. **A-07-2 — the three comment corrections.** `pgError.ts`'s `classify` docblock and `rescheduleAppointment.ts`'s `no-verdict` arm both repeat the premise A-07-1 falsified. And `rescheduleAppointment.ts:13` — the plain defect you identified independently — claims attempt 1 has no lock while line 201 locks unconditionally; your narrower true statement is that attempt 1 skips the **shuffle and seed draw**, not the lock.

5. **The `lockResources` docblock** says "classes rather than a sorted pair" and states the two-lock count. ADR-0030 falsifies both. Correct it with the change rather than after it.

**What the red asserts, so you know what green means.** AC-4 races moves on **different** incumbent pairs, each contended at its own pair, from a barrier at *P* = 20 pairs over ≥ 25 trials — roughly 500 attempts. Against the code as merged it should produce `40P01`s at about **11.7%**. Green means **zero**, with every attempt receiving a database verdict, no `500`, no two confirmed rows overlapping, and every refused move's row unchanged including its `xmin`. The test also witnesses both racers reaching **attempt ≥ 2**, so a fixture where attempt 1 simply succeeds cannot pass vacuously.

**Non-negotiables.** §5: `src/` and `tests/unit/` only — the two new files in `tests/concurrency/` are the test-engineer's and you **must not** edit them; if you believe one is wrong, **raise a DCR to me** and do not dispatch anyone yourself (O-44 is ruled: a ruling from a dispatch that did not route through me is not in force until logged). §7: every commit green, small, Conventional. §2.1 NON-NEGOTIABLE. Keep `lint:arch` and `typecheck` clean.

**Do not start, poll or wait on a Stryker run.** If a mutation measurement is needed I will take it. Four of your invocations at slice 06 ended in a polling loop without producing a report; do not repeat that here — finish, report, stop.

**Report** the standard JSON with commits, files changed, unit tests added, `acceptance_passing`, your actual final line count against your 22–26 estimate, what happened with the A-05-6 cases and whether your equivalent-mutant prediction held, and — separately — anything ADR-0030 did not compose as specified once written.
