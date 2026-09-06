# Prompt · slice 07 · test-engineer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 07 step 2 test-engineer
- Sent: 2026-09-06T17:37:13.928Z

---

Slice 07 step 2 — AGREE. Branch `slice/07-reschedule-under-contention`. Read `docs/slices/07-design.md` (step 1, `c1e2709`), `docs/slices/07-reschedule-under-contention.md` (**four ACs now — AC-1 amended, AC-4 added**), and **ADR-0030** (new, accepted). You do not read `src/`.

**Step 1 did something no step 1 in this project has done: it raced the thing it was meant to design, and found a live defect in code merged an hour earlier.**

**11.7% of contended move attempts return `40P01` — and therefore a `500`** — with every ADR-0018 lock correctly taken. Measured on `postgres:16-alpine` against this repo's constraint definitions, 20 mutually-vacating pairs from one barrier, 25 trials:

| locks a move takes | `23P01` | `40P01` |
|---|---|---|
| target pair — **as merged at slice 06** | 883/1000 | **117** |
| union of incumbent and target | **1000/1000** | **0** |

Two moves past attempt 1, each targeting the pair the other occupies over an overlapping interval. Each `UPDATE`'s exclusion check finds the other's **vacated but uncommitted** index entry, whose `xmax` is a live transaction, and waits on it. Both wait. The architect's own slice-06 ruling said *"vacating writes no index entry another transaction waits on"* — it writes no **new** entry; the old one stays live until commit. **ADR-0030** fixes it: a write locks every resource it is *in flight against*.

**Four things land on you, and the first two are the ones I want you to attack.**

1. **AC-1 gained `xmin` and `ctid`, and this is the assertion that makes QS-4 mean anything.** *"Unchanged"* now means **not written**, not *no column differs*. A compensating cancel-then-restore passes column equality and **fails** this; `xmin` is not forgeable by application code; an aborted attempt correctly leaves it untouched. **Can you write it so it fails for the right reason?** If `xmin`/`ctid` is not reachable from where you assert, say so now rather than at step 3.

2. **AC-4 is new and its mutant control is already measured** — reverting `lockResources` to lock the target pair only yields ~117 `40P01` in 1000, so the criterion discriminates rather than passing vacuously. **The design says a `40P01` from a *lock-ordering* mistake is caught by the same assertion. Check that claim.** It matters: it is the difference between AC-4 covering ADR-0030 alone and AC-4 covering ADR-0018's ordering too.

3. **A constraint the design found by hanging a harness on it, which you must not lose: the barrier must be released *before* ADR-0018's locks are taken.** The locks are themselves a serialisation point, so a racer waiting on one never reaches a barrier placed after it. Existing concurrency tests race whole HTTP requests and are already on the right side; the new fixture must stay there.

4. **Two files, not three.** Racing moves go into `refused-move-leaves-original.test.ts` under QS-4 — both cases are that scenario's adversarial instance, and a third file would need a §10 row §10 has no headroom for.

**One premise of yours was re-measured and came back false**, so you are not inheriting it: A-06-3 claimed slice 07 was *cheaper* because AC-2 already builds the barrier harness and racing moves is that harness with `UPDATE` on both sides. **False** — a booking is in flight against one pair and cannot close a cycle (60 trials, one move vs 10 bookings: 660/660 `23P01`, **zero** `40P01`). The barrier *mechanism* is shared; the fixture and the failure mode are not. *Stronger* came back **true and more than claimed**.

**§6 asks for verdicts, not sign-off.** A round that never produces a disagreement is deference. Where you think a finding is real but its remedy wrong or too broad, say exactly that — the two are separate verdicts.

**Standing constraints.** §2.2 Testcontainers, no mocked database for a persistence invariant. §2.4 and §7: **exactly one red commit**, yours, `test(acceptance): … (red)`, red **observed in CI** — not an evidence chain. §5: you own `tests/acceptance|contract|property|concurrency|architecture|performance` and the db-invariant half of `tests/integration/`; never `tests/unit/`, never `src/`. **Do not write tests yet** — step 3 is where the red lands.

**Report** the standard JSON plus AGREE/DISAGREE with reasoning on each of the four items, whether `xmin`/`ctid` is reachable in your harness, your verdict on whether AC-4 really catches a lock-ordering mistake, and — separately — anything you found that this did not ask about, especially anything in the design you cannot write a failing test for.
