# Prompt · slice 19 · test-engineer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Step 2 review of slice 19 design
- Sent: 2026-09-10T09:27:49.433Z

---

keyloop-challenge (/home/agentadmin/sources/keyloop-challenge), branch `slice/19-attempt-cap-sized-against-occupancy`. **This is §6 step 2 — AGREE. Review only. Write nothing, commit nothing.** Step 3 (the red commit) is a separate dispatch.

Read `CLAUDE.md` §5 (test ownership — `tests/unit/` is the implementer's and you never touch it; you never read `src/`), then:

- `docs/slices/19-attempt-cap-sized-against-occupancy.md` — the slice, seven ACs
- `docs/slices/19-design.md` — the design, commit `d177ee0`
- `docs/adr/0040-order-candidates-free-first-from-one-advisory-read.md` — proposed, supersedes ADR-0009
- `docs/arc42/10-quality-requirements.md` — **QS-15 and QS-16 are new**

## Context

The finding `H-19-1`: the attempt loop spends one attempt per *busy resource discovered*, and occupancy drives that as much as concurrency does. Executed against real PostgreSQL — 12 bays, 12 technicians, 11 pairs pre-booked, **zero concurrency**, 200 seeds — **35/200 bookings were refused `409` with one bay and one technician still free.** The architect ruled the DCR **(b)**, superseded ADR-0009 with ADR-0040, and specified QS-15 and QS-16.

## The architect's message to you, verbatim

> QS-15 and QS-16 are in `docs/arc42/10-quality-requirements.md` now, with their test paths, so cite them rather than the slice file. QS-15 is `tests/property/occupancy-does-not-refuse.db.test.ts` (property project, `.db.` suffix, or it runs twice with no container); QS-16 is `tests/concurrency/no-spurious-refusal-under-occupancy.test.ts`. Three things I want from you specifically: **(1) AC-3b is the criterion I care most about** — it asserts an *equal multiset* against `orderCandidates(bays, technicians, EMPTY_OCCUPANCY, seed)` and `null` **iff** an input list is empty. It exists because §2.1 cannot catch a reintroduced filter here: ADR-0018's per-resource lock would make check-then-act *correct*, so nothing else in the repository would fail. **(2) AC-2's red is not yet measured** — get its failing figure alongside AC-1's 165/200 before the red commit; a criterion whose red was predicted rather than observed is what §2.4 forbids. **(3) QS-16 may legitimately fail**, and `(8, 8, 4)` is the tuple most likely to break it. If it does, that is a design defect and a loopback, not a test to weaken — raise it and I take the loopback (0 of 2 spent). The `"refusal is spurious BY DESIGN"` comment at `tests/acceptance/candidate-retry.test.ts` AC-4 is yours to correct under AC-5: that fixture blocks all 17 bays **and** all 17 technicians (lines 304-305), so its refusal is honest in outcome and only its `exit` label is wrong.

## What I want back

**Agree or object, per AC and per QS.** §6: "Objections here are cheap; the same ambiguity found at step 5 costs a full cycle plus a loopback." An agreement round with no objections reads to the retro exactly like a reviewer with no findings — so do not manufacture objections, and do not swallow real ones.

Specifically:

1. **Is every AC assertable as written?** AC-1 (200 seeds, k=11, confirmed), AC-2 (attempts p95 ≤ 2 across k), AC-3a (stale/wrong snapshot costs attempts not refusals), AC-3b (equal multiset, `null` iff empty input), AC-4 (QS-3 unchanged **plus** QS-16's tuples), AC-5 (arc42 §4.1, §11 R-4 and the `candidate-retry.test.ts` comment corrected), AC-6 (QS-14 re-measured), AC-7 (reschedule unchanged). Name any you cannot turn into a failing test **before** implementation exists.
2. **AC-3a specifically** — how do you intend to construct a *stale or wrong* snapshot from outside `src/`? If you cannot without the implementer exposing a seam, say so **now**: that is a design change and it is cheap today.
3. **AC-7** — the architect claims reschedule is unchanged **by construction**, because `shuffle` is the selection form and consumes one draw per element, so an empty group consumes none and the permutation is element-for-element today's. Do you accept that as *proof*, or do you want it *asserted*? A property that holds by construction and has no test is exactly what §2.4 is suspicious of.
4. **AC-2's red.** You need a measured failing figure. Say how you will get it without reading `src/` — the executed probe that produced AC-1's 165/200 is in the scratchpad at `/tmp/claude-1000/-home-agentadmin-sources-keyloop-challenge/fee65a03-4453-4557-971c-b9301c1f9de4/scratchpad/` (`probe.test.ts`, `probe-results.json`), and you may read and rerun it; it drives the public entry point, not internals.
5. **QS-16.** Is `(8, 8, 4)` really the tuple most likely to break, or is there a worse one? You own the scenario — if you think the tuple set is wrong, say so before you build it.
6. **Ownership.** Anything in the seven ACs that would need you to touch `tests/unit/`, or the implementer to touch your directories. Flag it now.

Report as: one line per AC/QS with **AGREE** or **OBJECT**, the reasoning, and for each objection the exact change you want. Do not make any change. Do not write tests yet.
