# Prompt · slice 19 · architect · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Rule DCR H-19-1 on cap sizing
- Sent: 2026-09-10T09:04:53.323Z

---

You are the architect on the keyloop-challenge repo (/home/agentadmin/sources/keyloop-challenge). Branch `slice/19-attempt-cap-sized-against-occupancy` is checked out. Read `CLAUDE.md` first — especially §4 (ADR immutability), §6 (the slice loop, DCR outcomes, and **"Adjudication is reasoned before it is applied"**), and §11.

**THIS DISPATCH IS STEP 1 OF §6's ADJUDICATION RULE: REPLY, DO NOT EDIT.**
Write NO files. Change NO files. `git status --porcelain` must show only `docs/slices/19-attempt-cap-sized-against-occupancy.md` (already committed by the orchestrator as untracked work-in-progress) when you finish. You are producing a **reasoned reply**. The design and any ADR come in a second dispatch, after your ruling is recorded.

---

## The finding — `H-19-1`, raised by the human, derived by the orchestrator

The human asked why the booking path does not read which bays/technicians are already busy before choosing candidates, given the round-trip cost at a busy dealership. That question surfaced this:

**ADR-0009 sizes the attempt cap against "contention depth, the only driver Bound-2 leaves". Occupancy is a second driver, independent of concurrency and additive with it.**

Bound-2 spends one attempt per *busy candidate resource discovered*. A resource is busy whether a racer took it microseconds ago (contention) or it was booked last week (occupancy). Nothing in the loop distinguishes them. So on a dealership where `|bays| + |technicians| - 1 > 16`, a heavily-booked interval can exhaust the cap before it exhausts the candidates.

**The claim this contradicts, by name** — `docs/arc42/04-solution-strategy.md`:
> A `409` therefore means the dealership was full rather than that the allocator guessed badly.

**Why no existing scenario catches it:** every QS-3 tuple in `docs/arc42/10-quality-requirements.md` fixes *M free* bays and technicians and varies only *N concurrent*. **No §10 scenario varies occupancy at all.** ADR-0009's accepted residual — "refused while capacity remained … now at depth 17 rather than count 17" — is written as a *contention*-depth statement.

### Evidence — SIMULATED, cross-check only

A pure simulation mirroring `attemptLoop.ts` semantics (head-of-each-list candidate; prune the whole resource that fired; bay checked before technician), 12 bays and 12 technicians, cap 16, **zero concurrency**, 2000 seeds per level. `k` bays and `k` technicians pre-booked over the target interval, paired.

| p | k busy | median attempts | p95 | max | capped (refused with capacity free) |
|---|---|---|---|---|---|
| 0.00 | 0 | 1 | 1 | 1 | 0 / 2000 |
| 0.25 | 3 | 1 | 3 | 6 | 0 / 2000 |
| 0.50 | 6 | 2 | 6 | 10 | 0 / 2000 |
| 0.75 | 9 | 5 | 11 | 16 | 0 / 2000 |
| 0.90 | 11 | 12 | 16 | 16 | **372 / 2000 (18.6%)** |

At p=0.90 exactly one bay and one technician are free, and 18.6% of seeds are refused anyway.

Script: `/tmp/claude-1000/-home-agentadmin-sources-keyloop-challenge/fee65a03-4453-4557-971c-b9301c1f9de4/scratchpad/sim.mjs` — read it and check whether it faithfully models the loop. **Say so if it does not.**

**An EXECUTED measurement against real PostgreSQL, driving the real `bookAppointment`, is in flight and not yet available.** Treat the table above as a model. Part of your reply must be: *what executed number would change your verdict, and what would confirm it.* If you think the simulation misrepresents the loop — for example if the real constraint-check order makes both-busy pairs behave differently — say that, because it is the cheapest thing to be wrong about.

## The proposed remedy — judge it SEPARATELY from the finding (§6.2)

Order by an occupancy snapshot rather than filter by it:
- `busyResources(db, dealershipId, from, to)` already exists in `src/persistence/appointmentRepository.ts:564` and already returns `{bays, technicians}` — the same shape `orderCandidates` consumes. `queryAvailability` already calls it.
- `bookAppointment` reads it once (as ADR-0004 requires: "read once per request, never refreshed on failure") and passes it into ordering.
- `orderCandidates(bays, technicians, busy, seed)` partitions each list into free-looking then busy-looking, shuffles **each group independently** from the same seeded stream, and concatenates free-first.
- The list stays **complete**. Nothing is removed. Loop, prune, cap, locks and constraints all unchanged.

Simulated free-first ordering: **1 attempt at every occupancy level, 0 capped.**

## The counter-case you must weigh — do not skip it

1. **It puts an occupancy read on the write path**, which is the shape `CLAUDE.md` §2.1 exists to watch. ADR-0018's own consequences record that under the per-resource advisory lock "a reintroduced check-then-act would be **correct** rather than merely harmless" — so behaviour cannot catch a regression here. Is "the read produces a permutation, not a decision" a real structural guard, or a story? What would enforce it — an architecture test, the domain-purity rule, something else, or nothing?
2. **ADR-0036 and §8.6 make availability reads advisory.** Does feeding one into ordering weaken that contract, or is ordering exactly the advisory use ADR-0004 already sanctions ("the list decides which write is attempted next, never whether a write is allowed")?
3. **Cost.** One extra `SELECT` on every booking, including uncontended ones. QS-14 budgets an uncontended booking at `< 100 ms p95` and the availability query — of which `busyResources` is one component — at `< 200 ms p95`. **Unmeasured.** Should the slice be blocked on measuring it first?
4. **The cheap non-fix: raise the cap.** ADR-0009 made the cap configuration, not a constant. Weigh it honestly. It is cheaper and it is not obviously wrong.
5. **Do nothing.** ADR-0009 already accepts a residual spurious refusal. Is occupancy-driven depth *materially* different from what was accepted, or is this finding re-describing an accepted consequence in alarming language?
6. **ADR-0009 rejected Order-D** partly because "concurrent requests computing utilisation from the same snapshot agree — under a burst, Order-A". Does shuffling *within* each group actually escape that, or does free-first ordering re-synchronise a burst in a way the simulation (single-threaded) cannot see? **This is the objection I consider strongest and I want your independent view.**
7. **Slices 17 and 18 are `ready` and this jumps ahead of both.** WIP is 1 and nothing is in flight, so it is legal, but ordering the backlog is normally a gate call. The human is AFK and has delegated the remainder to you and the orchestrator. Say whether the ordering is right.

## What to return — the §6 shape

**One verdict per numbered objection above and one on the finding itself: AGREE or DISAGREE, with reasoning.** Where you agree, state the exact change you would make. **Do not make it.**

Then rule:

- **The DCR outcome letter** — (a) clarification, (b) deferred improvement, (c) design defect, (d) defer to the gate. To rule (c) you **must name the acceptance criterion, §10 quality scenario, or §2 standing invariant that would fail**. If you cannot name one, §6 says the outcome is (b). Note there is no slice in flight, so this is a finding against merged work rather than a mid-slice DCR — say if that changes the letter.
- **New ADR, or supersede ADR-0009?** §4: a decision is immutable, prose is not. If ordering changes, does ADR-0009's *chosen option* change? Bound-2 and the cap's *value* may be unaffected — say what carries forward and what is superseded. The orchestrator was asked to decide this and is deferring it to you because §4 makes `docs/adr/` yours.
- **Does the cap's value move** from 16?
- **Does §10 need a scenario that varies occupancy**, and if so, state it in QS form so the test-engineer can build it. Note `tests/performance/` and the concurrency/property directories are the **test-engineer's** — you specify, you do not write.
- **Scope**: is this one slice? The orchestrator has drafted `docs/slices/19-attempt-cap-sized-against-occupancy.md` with five provisional ACs — read it and say which ACs you would change, add or delete, and why. **Do not edit the file.**
- **Whether you want the executed measurement before you will design**, or whether you will design on the model and treat the measurement as a step-3 confirmation.

Be willing to disagree. §6.3: "An adjudication round that has never produced a disagreement is not consensus, it is deference, and the retro reads it the same way it reads a reviewer with no findings." The orchestrator has an obvious preference here and you are not obliged to share it.
