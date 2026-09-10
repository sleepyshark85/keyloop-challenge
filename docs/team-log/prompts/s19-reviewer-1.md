# Prompt · slice 19 · reviewer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Step 5 review of slice 19
- Sent: 2026-09-10T11:20:34.678Z

---

keyloop-challenge (/home/agentadmin/sources/keyloop-challenge), branch `slice/19-attempt-cap-sized-against-occupancy`, PR #27. **This is §6 step 5 — REVIEW.** `git pull` first.

You may **block a merge** and **raise a DCR**, but you may **not change the design** — a design problem is a DCR, not a fix. Read `CLAUDE.md` (§2 invariants, §5 test ownership, §7 commits, §10 DoD).

## The slice

`H-19-1`: ADR-0009 sized the attempt cap against *"contention depth, the only driver Bound-2 leaves"*. Occupancy is a second, independent, additive driver. Executed on real PostgreSQL, **zero concurrency**: 35/200 bookings refused `409` with a bay and a technician free. Remedy: order candidates free-looking first from an advisory occupancy snapshot — **never filter**, so a wrong snapshot costs attempts and cannot refuse.

Read, in this order: `docs/slices/19-attempt-cap-sized-against-occupancy.md` (**eight** ACs), `docs/slices/19-design.md` (§4's five properties, §6's rulings), `docs/adr/0040-*.md` (proposed, supersedes 0009), arc42 §10 QS-13/QS-15/QS-16.

## Commits to review

| sha | what |
|---|---|
| `d177ee0` | design, ADR-0040, QS-15/QS-16 |
| `369b598`, `bb19373` | step-2 adjudication, AC amendments |
| `076a1ab` | **the red** — `test(19): … (red)` |
| `56269be` | `orderCandidates` free-first, `EMPTY_OCCUPANCY`, unit tests |
| `2aeeacb` | `bookAppointment` reads occupancy once, orders free-first |
| `6f173bf`, `343aef9` | `I-19-2` ruled (a), AC-8 |
| `e1d925a` | AC-8 built — QS-13 re-sourced onto three fixtures |

## Evidence claimed — verify, do not accept

- **Red observed in CI**: run 34464606313, 922 tests, exactly **5 failed**, 917 passed, `red-proof: success`. The 5 are exactly the new criteria.
- **Green**: AC-1 **200/200** at `k=11` (red 163/200); AC-2 attempts **p95 = 1** at every `k ∈ {0,3,6,9,11}` (bar ≤ 2); **QS-16 exact `min(N,M)` at all four tuples** `{(20,1,11),(20,4,8),(8,8,4),(20,8,4)}`; AC-6 **18.37 ms** / **14.16 ms** p95 against 100 / 200 ms budgets.
- Full `npm test` green after `e1d925a`.

## Where I want your attention, because these are where I think it could be wrong

1. **`T-19-4` — P8/P9's red was a `TypeError` in `mulberry32`, not a wrong value.** The test-engineer disclosed it: *"weaker evidence the assertion is right, stronger evidence the interface doesn't exist yet."* The implementer discharged it by reasoning, not by mutation. **Mutate them yourself.** If P8 or P9 would pass against an `orderCandidates` that *filters* rather than permutes, or against a per-group `freeHead === undefined` emptiness test (the design's P2 violation), then AC-3b does not hold and the slice's central §2.1 guard is decorative.
2. **AC-3b is the only thing standing between this design and check-then-act.** ADR-0018 records that under a per-resource advisory lock a reintroduced check-then-act would be **correct** rather than merely harmless — so *no behavioural test can catch it* and `dependency-cruiser` cannot see it. Does the property actually pin membership invariance, or only sample it?
3. **QS-16 is probabilistic.** It fired in 3 of 8 local runs pre-fix, and passes post-fix. Ask whether a scenario that can pass by luck is evidence, and whether its four tuples would actually catch the burst re-synchronisation ADR-0040 §8 names — ADR-0004's never-refreshed snapshot front-loading, for every loser, what the winners just took.
4. **`T-19-5`** — QS-16's `capped`/`exhausted` breakdown log sits **after** the strict assertion, so it fires only on passing runs. Ruled MINOR; confirm no evidence is actually lost.
5. **AC-8 re-sourced QS-13 across three fixtures.** The test-engineer named what is gone: *the single request that once demonstrated window + waterfall + absorbed metric in one trace.* **Check nothing else was quietly lost** — compare `e1d925a`'s diff of `tests/integration/telemetry-booking.test.ts` against what the file asserted before, assertion by assertion.
6. **Test ownership by path (§5), audited from git history**, not from claims. `T-19-3` is a self-disclosed `src/` read by the test-engineer via `grep`, already deferred to the gate — look for any *second* instance, and for either role writing in the other's directories.
7. **§7 commit discipline.** `56269be` is 292 lines, over the ~150 guideline; the implementer justified it as one exported signature across three call sites where an intermediate split would fail `tsc`. Rule on that.
8. **Mutation.** Run `npm run mutation` on the changed files and report survivors — `src/domain/candidates.ts` especially. Threshold 0.75.

## Also required

- `npm run lint:arch` (dependency-cruiser; `domain-is-pure` is `to: {}` — **no imports at all** in `src/domain`).
- `npm run slice:check 19`.
- Verify **ADR-0009 was touched in frontmatter only** (`superseded_by`) — §4 makes an accepted ADR's decision immutable.
- Confirm the red commit is **exactly one** and authored by the test-engineer (§7).

## Report

Findings as `R-19-n` with severity `BLOCKING` / `MAJOR` / `MINOR`, each with the file, the claim, and the concrete failure scenario. **A reviewer with no findings reads to the retro exactly like an adjudication round with no disagreements** — but do not manufacture findings either. If you would block the merge, say so and say on what.

Post your findings to PR #27 as a comment beginning `**reviewer` on its own line (the attribution check is case-sensitive and wants the lowercase role at line start). Do not `git add` `docs/STATUS.md`, `docs/team-log/` or `docs/DEFECTS.md`.
