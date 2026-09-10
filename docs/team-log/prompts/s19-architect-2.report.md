# Report · slice 19 · architect · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Design slice 19 and ADR-0040
- Returned: 2026-09-10T09:26:17.819Z
- Duration: 671s

---

Done. Report below.

## Did the orchestrator misapply any ruling?

**No.** I read `/home/agentadmin/sources/keyloop-challenge/docs/slices/19-attempt-cap-sized-against-occupancy.md` in full against my dispatch-1 ruling and every one of the seven AC rulings, the frontmatter corrections, the reschedule ruling and both corrections I made *against* the orchestrator are applied faithfully. Two things I'd flag, neither a misapplication:

- **AC-2 has no failing measurement beside it.** AC-1 carries *"measured red at 165/200"*; AC-2 (p95 ≤ 2 attempts across `k ∈ {0,3,6,9,11}`) carries no red figure. It will be red — at `k = 11` today's median is 12 — but §2.4 wants the red observed, not predicted. Not a defect in the file; a note for step 3.
- **`slice:check 19` fails "design findings reached the log"** naming `A-19-1, A-19-2, OQ-19-1, OQ-19-2` — the four I minted in the design just now. They need to be raised in `events.jsonl` by you; I cannot write there (`guard-paths.mjs` refused my `git add docs/team-log/*`, correctly). Same reason **`docs/DEFECTS.md`, `docs/team-log/events.jsonl` and `docs/team-log/prompts/` are NOT in my commit** — the guard blocked the path, so they are still unstaged and are yours. `docs/STATUS.md` I left alone as instructed.

## The `orderCandidates` signature, verbatim

```ts
export interface OccupancySnapshot {
  readonly bays: readonly string[];
  readonly technicians: readonly string[];
}

export const EMPTY_OCCUPANCY: OccupancySnapshot = { bays: [], technicians: [] };

export function orderCandidates(
  bays: readonly string[],
  technicians: readonly string[],
  busy: OccupancySnapshot,
  seed: number,
): CandidateOrder | null;
```

`src/domain` imports nothing (`domain-is-pure`, `to: {}`), so the domain declares `OccupancySnapshot` itself; `persistence.BusyResources` is structurally identical and structurally assignable, so `bookAppointment` passes the repository's return value straight in — no import, no adapter, no cast. `seed` stays last. The `'incumbent'` arm of `CandidateStrategy` gains `readonly busy: OccupancySnapshot`, and `rescheduleAppointment` supplies `EMPTY_OCCUPANCY` at its own call site rather than the loop defaulting it.

## What I changed my mind about between dispatch 1 and now

**One thing, and it strengthened the reschedule ruling rather than moving it.** In dispatch 1 I ruled the empty busy set for reschedule as *"one line, behaviour identical to today"* — asserted. Writing the algorithm I found it is **provable**, not asserted: `shuffle` is the selection form and consumes exactly one draw per element, so an empty group consumes none and `freeFirst(ids, [], next)` calls `shuffle` on the same list with the same stream. The permutation is **element-for-element** today's. That is property **P4** in the design, and it makes **AC-7 true by construction** rather than only by test. It also killed a competing implementation I briefly preferred (shuffle-whole-list then stable-partition) — both are correct and both give the identity, so I kept the algorithm as specified rather than churn it for no gain.

Nothing else moved. The (b) letter, the cap at 16, the probabilistic-not-structural `capped` restoration, and the provisional backlog ordering all stand as ruled.

## For the test-engineer at step 3 — verbatim

> QS-15 and QS-16 are in `docs/arc42/10-quality-requirements.md` now, with their test paths, so cite them rather than the slice file. QS-15 is `tests/property/occupancy-does-not-refuse.db.test.ts` (property project, `.db.` suffix, or it runs twice with no container); QS-16 is `tests/concurrency/no-spurious-refusal-under-occupancy.test.ts`. Three things I want from you specifically: **(1) AC-3b is the criterion I care most about** — it asserts an *equal multiset* against `orderCandidates(bays, technicians, EMPTY_OCCUPANCY, seed)` and `null` **iff** an input list is empty. It exists because §2.1 cannot catch a reintroduced filter here: ADR-0018's per-resource lock would make check-then-act *correct*, so nothing else in the repository would fail. **(2) AC-2's red is not yet measured** — get its failing figure alongside AC-1's 165/200 before the red commit; a criterion whose red was predicted rather than observed is what §2.4 forbids. **(3) QS-16 may legitimately fail**, and `(8, 8, 4)` is the tuple most likely to break it. If it does, that is a design defect and a loopback, not a test to weaken — raise it and I take the loopback (0 of 2 spent). The `"refusal is spurious BY DESIGN"` comment at `tests/acceptance/candidate-retry.test.ts` AC-4 is yours to correct under AC-5: that fixture blocks all 17 bays **and** all 17 technicians (lines 304-305), so its refusal is honest in outcome and only its `exit` label is wrong.

## For the implementer at step 4 — verbatim

> Read §4 of `docs/slices/19-design.md` before you write anything; it states five properties and four have a criterion pointing at them. The one that will bite: **the emptiness test is over the concatenated list, never per group** (P2). A group may legitimately be empty — every bay busy is the ordinary state this slice exists for — so `if (freeHead === undefined) return null` refuses a fully-occupied dealership through the `500`/`422` exit, which is this slice's own defect inverted and worse. Also: **one `mulberry32(seed)` per call**, shared by all four shuffles in a fixed order (bays-free, bays-rest, technicians-free, technicians-rest) — not a generator per group, not `seed + 1`. **`prune` is not edited** and must not learn the snapshot; `filter` already preserves order, so the free prefix survives pruning. `busy` is a **parameter**, because `domain-is-pure` is `to: {}` with no allowlist — do not reach for an import to save four words of type. Reuse `busyResources` from `appointmentRepository.ts` verbatim; do not add a second read function, and do not let `candidateRepository.ts` see the `appointment` table. If you believe the design is wrong, raise a DCR — do not adjust the acceptance test.

## Checks

- `npm run docs:check` — was stale (§9's generated ADR index), ran `docs:build`, now **current** (13 sections, 23 ADRs). The build also added the generated §11.1 debt rows for ADR-0040 and slice 19.
- `npm run docs:adr-check` — reported ADR-0040 unpinned. **I re-pinned with `--pin 0040-…`, not `--rebaseline`** (4 added lines in `tools/docs/adr-baseline.json`, no existing pin touched). Re-run: *23 ADR(s) checked: every considered option and chosen option survives.*
- `npm run log:check` — 1421 records, 0 invalid.
- `npm run docs:budget:check` — clean. ADR-0040 landed at **exactly 700/700** after folding the option set and its pros/cons into one table (the concision ruling's own remedy); `19-design.md` 2635/3000; §10 1047/1500.

## Commit

**`d177ee00c29cc979a3cb3d3d435b7cd76ed2eb8b`** — 9 files, +482/−3, pathspec-pinned. Contents: `docs/slices/19-design.md`, `docs/adr/0040-order-candidates-free-first-from-one-advisory-read.md`, `docs/adr/0009-candidate-ordering-and-attempt-cap.md` (frontmatter only), `docs/arc42/10-quality-requirements.md`, the three generated files (`arc42/09`, `arc42/11`, `system-design.md`), `tools/docs/adr-baseline.json`, and your `docs/slices/19-attempt-cap-sized-against-occupancy.md`.

There is no PR on `slice/19-attempt-cap-sized-against-occupancy` yet, so I have no PR to comment on. When you open it, here is my comment to post under §9 attribution — I owe one and `slice:check` will want it:

> *Step 1, written after the ruling rather than beside it.*
> **Architect.** `H-19-1` ruled **(b)**: the finding is agreed and executed (35/200 refused with capacity free), but the merged work is correct under ADR-0009 as accepted, and I could name no AC, `QS-*` or §2 invariant that would fail — QS-3's tuples all sit at zero occupancy, and `candidate-retry.test.ts:304-305` blocks all 17 bays *and* all 17 technicians, so that refusal is honest. I declined to reach for §2.1 to manufacture a name. **ADR-0040** (proposed, supersedes 0009) records raising `BOOKING_ATTEMPT_CAP` as a real option that *does* close the defect structurally, rejected on latency — 40 attempts at three round trips each — and names free-first as coarse load-aware allocation, reopening ADR-0009's Order-D rejection. The cap stays 16 and `capped` is restored **probabilistically, not structurally**. The live risk is in `19-design.md` §8: ADR-0004's snapshot is never refreshed, so under a burst every loser front-loads what the winners took. **QS-16 is the falsifier and it may fail; if it does I take the loopback.** Commit `d177ee0`.
