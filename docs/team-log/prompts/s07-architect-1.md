# Prompt · slice 07 · architect · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 07 step 1 design
- Sent: 2026-09-06T17:09:59.275Z

---

Slice 07 step 1 — DESIGN. Branch `slice/07-reschedule-under-contention`, checked out, off a `main` that now carries slice 06 (merge `09bb414`). `slice:check 07` reports Definition of Ready **fully green**.

Read `docs/slices/07-reschedule-under-contention.md` first: three ACs, `arc42: ["§6.3"]`, `quality_scenarios: [QS-4, QS-5]`, `inherits: ["F-02-9", "A-05-6", "A-06-3", "O-41"]`, `loopbacks: 0`.

**This slice is where slice 06's largest debt comes due, and you named it yourself at its gate.** Your words on the record: *"slice 06 ships the move with zero concurrency evidence for the move. QS-4 and QS-5 are argued from statement atomicity and asserted by nothing... If slice 07 slips, this is the debt that matters, not any of the four §11 items I booked."* Design accordingly. The gate record for slice 06 carries that sentence, so this slice is the thing that makes it true or leaves it owed.

**Four inherited obligations, and one of them is the slice.**

- **A-06-3 — the racing-moves test.** You re-deferred it here at slice 06 step 1 on a stated ground: ADR-0003 claims two racing reschedules behave like two racing bookings — one commits, the other takes `23P01` — and nothing asserts it. You argued slice 07 is *cheaper* (AC-2 already builds the barrier harness for a move racing *N* bookings) and *stronger* (it can assert alongside AC-1 that the loser's original row is untouched). **Both premises were to be re-measured on arrival — that is D-05-3's remedy and the slice file says to say so in the PR if either is false.** Measure them.
- **F-02-9's second half — the locks *raced* rather than argued.** Slice 06 discharged its half with a mechanism stronger than the obligation asked for. Your discharge ruling then surfaced a fact from the merged loop that §3's deadlock argument never stated: **on attempts ≥ 2 a move vacates its incumbent pair while holding only the target pair's locks**, so ADR-0023's M3 argument extends by one path. That extension is an *argument* today. Here it meets two `UPDATE`s at once.
- **A-05-6** — two unkilled `ConditionalExpression` guards in `pgError.ts`, at the one site ADR-0016 permits a `ContendedResource` to be minted. Slice 07 is the destination because a reschedule racing a booking is the first execution reaching that arm from a second call site.
- **O-41** — already built and live before this slice reached Ready, exactly as you ruled. The guard is bidirectional and slice 07 passes it. Nothing to build; rule it discharged when you are satisfied it is.

**What slice 06 left you, beyond the debt.**

- **ADR-0029** is new and accepted: `reschedule.deadlock` is a distinct event because a `40P01`'s entire diagnostic content is *which write path skipped the locks*. You wrote that a deadlock under ADR-0018's locks *can only* mean a path skipped them. **This slice is the first that can actually produce one.** If it does, that ADR's premise is wrong and you should want to know.
- **ADR-0028** is `proposed`, not built — the lock carrying its transaction. Its destination is slice 09. Do not build it here; say if racing moves changes the argument for it.
- **§11 carries D-06-1..D-06-4, F-06-1, F-06-2** from slice 06's step 7, and R-12 gained slice 06 as its second instance.

**Three things to decide.**

1. **What a refused move must leave behind, precisely.** QS-4 and QS-5 are this slice's, and the slice file's title is *"a refused move changes nothing, and never opens a window"*. Decide what "never opens a window" is asserted *by* — an observer, a trigger, a barrier — and make it something that can fail. A refused move that transiently released the slot and then restored it would satisfy a naive before/after assertion.
2. **Whether A-06-3 and the F-02-9 race are one test or two**, and whether either needs production code. Slice 07 was accepted at Gate C as *potentially proof-only*, with the reviewer required to state explicitly if no production code changed. If that is the outcome, say so at step 1 rather than discovering it at step 5.
3. **What the barrier harness actually is.** You claimed slice 07's AC-2 already builds one for a move racing *N* bookings and that racing moves is that harness with `UPDATE` on both sides. Check that claim against what slice 06 actually merged — the loop now attempts the incumbent pair first (ADR-0027), which changes what "racing" means for two moves that start from *different* incumbents.

**One process fact you should carry.** O-44 is ruled and binds you: a ruling made in a dispatch that did not route through me **is not in force until it is logged**, and where it is (c) your report must name it as a loopback the governor is owed. Ruling and recording are one act or they are neither. Raise a DCR to me; do not dispatch another role yourself.

**Constraints.** In-flight design ceiling 3,000 words — slice 06's hit exactly 3,000 and its own A-06-5 records what that cost. arc42 §5, §6, §8, §10 and §11 have between 0 and 15 words of headroom, so every step-7 addition must be paid for by a deletion; design with that in view rather than discovering it at step 7. `docs:budget -- --check --ratchet`, `docs:refs`, `docs:adr-check`, `docs:check`, `log:check` and `test:tools` all stay green. ADR if a decision is needed; accepted ADRs are immutable. No `src/`, no `tests/`, no `tools/`. **Do not hand-edit slice front matter** — tell me what belongs there. Commit `docs(07):`.

**Report** the standard architect JSON, your three decisions, your re-measurement of A-06-3's two premises with the verdict stated plainly if either is false, what belongs in front matter, and — separately — anything you found that this did not ask about. That section has been the most valuable part of every report for five slices.
