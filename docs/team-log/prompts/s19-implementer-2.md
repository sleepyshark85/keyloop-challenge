# Prompt · slice 19 · implementer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Implement free-first ordering
- Sent: 2026-09-10T10:18:05.439Z

---

keyloop-challenge (/home/agentadmin/sources/keyloop-challenge), branch `slice/19-attempt-cap-sized-against-occupancy`, PR #27. **This is §6 step 4 — GREEN.** `git pull` first.

## The red is observed in CI and it is clean

Run [34464606313](https://github.com/sleepyshark85/keyloop-challenge/actions/runs/34464606313) on `076a1ab`: **922 tests, exactly 5 failed, 917 passed**, `red-proof: success`. The five are exactly the new criteria — no collateral breakage:

- `tests/property/candidate-ordering.test.ts` — P6, P8, P9 (AC-3b / AC-7)
- `tests/property/occupancy-does-not-refuse.db.test.ts` — AC-1 (163/200 confirmed at `k=11`), AC-2 (attempts p95 3/6/11/16 at `k=3/6/9/11`, bar ≤ 2)

QS-16 passed that run — it is **probabilistic** by design (ADR-0040 §8), fired in 3 of 8 local runs. Do not treat its green as evidence of anything until step 5.

## Read first

`docs/slices/19-design.md` **§4 — five properties**, then the slice file (eight criteria), then `docs/adr/0040-*.md`. Your step-2 objection `I-19-1` was ruled (a) and the design now names the calls rather than step numbers.

## The architect's instruction to you, verbatim

> Read §4 of `docs/slices/19-design.md` before you write anything; it states five properties and four have a criterion pointing at them. The one that will bite: **the emptiness test is over the concatenated list, never per group** (P2). A group may legitimately be empty — every bay busy is the ordinary state this slice exists for — so `if (freeHead === undefined) return null` refuses a fully-occupied dealership through the `500`/`422` exit, which is this slice's own defect inverted and worse. Also: **one `mulberry32(seed)` per call**, shared by all four shuffles in a fixed order (bays-free, bays-rest, technicians-free, technicians-rest) — not a generator per group, not `seed + 1`. **`prune` is not edited** and must not learn the snapshot; `filter` already preserves order, so the free prefix survives pruning. `busy` is a **parameter**, because `domain-is-pure` is `to: {}` with no allowlist — do not reach for an import to save four words of type. Reuse `busyResources` from `appointmentRepository.ts` verbatim; do not add a second read function, and do not let `candidateRepository.ts` see the `appointment` table. If you believe the design is wrong, raise a DCR — do not adjust the acceptance test.

Settled signature:

```ts
export interface OccupancySnapshot {
  readonly bays: readonly string[];
  readonly technicians: readonly string[];
}
export const EMPTY_OCCUPANCY: OccupancySnapshot = { bays: [], technicians: [] };
export function orderCandidates(
  bays: readonly string[], technicians: readonly string[],
  busy: OccupancySnapshot, seed: number,
): CandidateOrder | null;
```

Also settled: the read uses the **occupancy** interval (`A-19-1`), goes after `deriveInterval` and `candidateResources` and **before** `orderCandidates`, once per request, never inside `runAttemptLoop`. `rescheduleAppointment` passes `EMPTY_OCCUPANCY` at its own call site. Your `Promise.all` for `candidateResources` + `busyResources` is yours to make — you declared it and it was not objected to.

## One thing I want you to actively check, not assume — `T-19-4`

The test-engineer disclosed that **P8 and P9 went red by *crashing*, not by comparing wrong values**: fast-check's null-prototype records cannot coerce to a primitive where the shipped 3-argument build reads `busy` positionally as its `seed`, so the red is a `TypeError` inside `mulberry32`. Its own words: *"weaker evidence for the assertion is right, stronger evidence for the interface doesn't exist yet."*

So **their green is the only thing that establishes P8/P9 assert the right thing.** When they pass, do not just note "green". Confirm they are exercising the property they name — that `busy` genuinely permutes rather than removes (equal multiset), and that `null` is returned **iff** an input list is empty. If you find they would pass against a wrong implementation, say so: that is a test-quality finding for step 5, raised by you against the test-engineer's work, and it is exactly what §6 step 2/4 boundaries exist to surface. **You must not edit their file** — raise it.

## Also yours at this step

- **AC-6** — re-measure QS-14 against the **unchanged** perf fixture with the extra read on the booking path: uncontended booking `< 100 ms` p95, availability `< 200 ms` p95. Report the numbers. The architect predicted "a few ms against a 100 ms budget" and asked to be told if it is wrong.
- **`OQ-19-1`** — whether the ordering read gets its own span under arc42 §8.4 or rides `availability.candidates`. The design defers this to you at step 4, settled by AC-6's measurement. Decide and say why.
- **Unit tests** in `tests/unit/` are yours and only yours. Never touch `tests/acceptance|contract|property|concurrency|architecture|performance`.

## Commits

Small and green — **every implementer commit is green**, unit test and the code it drives together. Conventional Commits: `feat(19): …`, `refactor(19): …`. If a commit changes more than ~150 lines it should probably have been two. Footer:

```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tt2bAYr18YJJMNjQwaAmRA
```

(Your agent definition sets `model: sonnet`; that footer is accurate provenance for who authored the commit and is what the red commit used.)

**Do not `git add`** `docs/STATUS.md`, `docs/team-log/` or `docs/DEFECTS.md` — mine, and the path guard will refuse you.

Run before you finish: `npm run typecheck`, `npm run lint:arch` (dependency-cruiser — `domain-is-pure` is `to: {}`), and the full `npm test`. Push.

## Report

- Commits and what each one drove.
- **All five red criteria now green, with the observed figures** — especially AC-1's confirmed count and AC-2's p95 per `k`.
- Your P8/P9 verdict per the `T-19-4` check above.
- AC-6's measured p95s, and your `OQ-19-1` decision.
- Anything you found wrong in the design — as a DCR if it would be incorrect, unsafe or unshippable; as a finding otherwise.
