# Prompt · slice 19 · implementer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Step 2 review of slice 19 design
- Sent: 2026-09-10T09:28:20.339Z

---

keyloop-challenge (/home/agentadmin/sources/keyloop-challenge), branch `slice/19-attempt-cap-sized-against-occupancy`. **This is §6 step 2 — AGREE. Review only. Write nothing, commit nothing.** Step 4 (green) is a separate dispatch and the red commit does not exist yet.

Read `CLAUDE.md` (especially §2.1, §2.3, §5 — you own `tests/unit/` and may never create, edit or delete `tests/acceptance|contract|property|concurrency|architecture|performance`), then:

- `docs/slices/19-attempt-cap-sized-against-occupancy.md` — the slice, seven ACs
- `docs/slices/19-design.md` — the design, commit `d177ee0`. **§4 states five properties; read it before anything else.**
- `docs/adr/0040-order-candidates-free-first-from-one-advisory-read.md` — proposed, supersedes ADR-0009
- `src/domain/candidates.ts`, `src/application/attemptLoop.ts`, `src/application/bookAppointment.ts`, `src/application/rescheduleAppointment.ts`, `src/persistence/appointmentRepository.ts` (`busyResources`), `.dependency-cruiser.js`

## Context

`H-19-1`: the attempt loop spends one attempt per *busy resource discovered*, so occupancy drives attempt depth as much as concurrency does. Executed on real PostgreSQL — 12 bays, 12 technicians, 11 pairs pre-booked, **zero concurrency**, 200 seeds — **35/200 bookings refused `409` with one bay and one technician still free.** Remedy: order candidates free-looking first from an advisory occupancy snapshot; never filter.

## The architect's message to you, verbatim

> Read §4 of `docs/slices/19-design.md` before you write anything; it states five properties and four have a criterion pointing at them. The one that will bite: **the emptiness test is over the concatenated list, never per group** (P2). A group may legitimately be empty — every bay busy is the ordinary state this slice exists for — so `if (freeHead === undefined) return null` refuses a fully-occupied dealership through the `500`/`422` exit, which is this slice's own defect inverted and worse. Also: **one `mulberry32(seed)` per call**, shared by all four shuffles in a fixed order (bays-free, bays-rest, technicians-free, technicians-rest) — not a generator per group, not `seed + 1`. **`prune` is not edited** and must not learn the snapshot; `filter` already preserves order, so the free prefix survives pruning. `busy` is a **parameter**, because `domain-is-pure` is `to: {}` with no allowlist — do not reach for an import to save four words of type. Reuse `busyResources` from `appointmentRepository.ts` verbatim; do not add a second read function, and do not let `candidateRepository.ts` see the `appointment` table. If you believe the design is wrong, raise a DCR — do not adjust the acceptance test.

The settled signature:

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

## What I want back

**Agree or object, per design decision.** §6: "Objections here are cheap; the same ambiguity found at step 5 costs a full cycle plus a loopback." An agreement round that produces no objections reads to the retro like a reviewer with no findings — so do not manufacture objections, and do not swallow real ones.

Specifically:

1. **Is the design buildable as specified, without an assertion or a cast?** `CandidateOrder` carries `readonly [string, ...string[]]` and `noUncheckedIndexedAccess` is on. The concatenated-list emptiness test (P2) must still produce a non-empty tuple for both lists. Walk it and say whether it type-checks without `as` beyond the existing brand cast — the file's own docblock records I-04-3/I-04-4, where exactly this went wrong before.
2. **`domain-is-pure` is `to: {}`** — no imports at all, not even intra-domain. Does declaring `OccupancySnapshot` inside `src/domain/candidates.ts` while `src/persistence` declares a structurally identical `BusyResources` create a problem you can see? The architect claims structural assignability means no import, no adapter, no cast at the `bookAppointment` call site. Check it.
3. **Where does the read go in `bookAppointment`?** ADR-0004 requires the snapshot be read **once per request, never refreshed on failure**. Name the exact statement position relative to `fetchCandidates`, `deriveInterval` and the existing reference-data reads, and say whether the ordering read must use the **occupancy** interval (`A-19-1`) or the appointment interval.
4. **`rescheduleAppointment` and the `'incumbent'` arm.** The architect ruled it passes `EMPTY_OCCUPANCY`, and claims this is identity **by construction** — `shuffle` is the selection form, one draw per element, so an empty group consumes no draws and the permutation is element-for-element today's. **Verify that claim against the actual code and say if it is wrong**; AC-7 depends on it.
5. **Anything in the seven ACs you cannot make green** without touching a test directory that is not yours, or without a seam the design does not give you. AC-3a needs a *stale or wrong* snapshot constructible from outside `src/` — say whether that needs a seam from you.
6. **QS-14 / AC-6.** One extra `SELECT` on every booking including uncontended ones, against a `< 100 ms` p95 budget. Any reason it would cost more than a few ms, or any cheaper placement?

Report as: one line per item with **AGREE** or **OBJECT**, the reasoning, and for each objection the exact change you want. Do not make any change. Do not write code or unit tests yet. If you believe something in the design is a defect rather than an ambiguity, say **DCR** and name what would be incorrect, unsafe or unshippable — not merely worse.
