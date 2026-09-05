---
id: "0014"
title: An Instant is renderable by construction — bound the epoch-millisecond range in instant() and again at withinOpeningHours' boundary
status: accepted
date: 2026-09-05
supersedes: null
superseded_by: null
arc42: ["§5.2", "§8.1", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  ACCEPTED as recommended on 2026-09-05, after Gate E, unmodified. The remedy is therefore the
  AGREED remedy and backlog slice 12 is the agreed work, not a proposal. Immutable from here under
  CLAUDE.md §4.

  Raised by the REVIEWER as finding R-01-1 at slice 01 step 5: `instant()` admits
  `8_640_000_000_000_001`, which `Number.isFinite` accepts and `new Date` cannot represent, so a
  value that satisfies the constructor makes `formatToParts` throw out of a function this design
  specifies as pure. The architect AGREED and ruled **(b) deferred improvement** under CLAUDE.md §6,
  by that section's own naming test rather than by preference: no acceptance criterion covers extreme
  instants, QS-9's generation is confined to 2026, and no §2 standing invariant applies — and §6 says
  outright that where none can be named the outcome is (b). The reviewer declined to say WHERE the
  bound belongs; the architect named both places, which is the substance of this ADR and the part
  that is a decision rather than a bug report. The defect is the architect's own: §4.2 step 1 of
  docs/slices/01-design.md specifies "finite integers and end > start" and the implementer matched
  that specification exactly. Recommended as written below and put to the human's ruling;
  it is scheduled as a backlog slice, and carried a technical-debt entry in arc42 §11 until it was
  ratified.
---

## Context and problem statement

`src/domain/interval.ts` mints the domain's only instant:

```ts
export function instant(epochMillis: number): Instant | null {
  return Number.isInteger(epochMillis) ? (epochMillis as Instant) : null;
}
```

`Number.isInteger` admits `8_640_000_000_000_001`; `Date` does not — its range is
`±8_640_000_000_000_000` ms, and `formatToParts` on the resulting Invalid Date **throws a
RangeError**. `withinOpeningHours` is the one place converting an instant to a wall clock, it does
so through `formatToParts`, and slice 01 specifies it as a **pure total function returning a
verdict**. A verdict function that throws is a different contract. Three further facts shape the
decision:

- **The type is branded, and a brand is a promise.**
  Today possession of it is evidence only of integrality.
- **`withinOpeningHours` cannot be handed an `Instant`.**
  Under the literal AC-6 ruling no domain module imports another, so it takes bare `number`s and
  cannot trust them even if `instant()` were fixed.
- **Nothing is broken today.**
  No acceptance criterion, quality scenario or §2 invariant is violated — hence a backlog item,
  not a loopback.

## Considered options

- **Option A — bound it in `instant()` only.** Good, because the invariant sits where the type is
  minted.
  - **Bad, decisively:** `withinOpeningHours` cannot receive an `Instant` under the literal AC-6
    ruling — the one function that can throw is the one this option leaves unprotected.
- **Option B — bound it in `withinOpeningHours` step 1 only.** Good, because it protects the only
  function that can throw.
  - Bad, because `instant()` keeps minting values that violate their own type's implied contract
    — which is how a brand degenerates into a comment.
  - Bad, because it treats the symptom's location as the defect's location
- **Option C — bound it in `instant()` AND in `withinOpeningHours` step 1.** **Chosen.**
  - Good, because each site is justified independently, and it is robust to the AC-6 ruling
    being revisited in either direction
  - Bad, because of the duplicated literal, which is real and is booked as debt rather than denied
  - Bad, because two checks for one property invites a future reader to delete
    "the redundant one".
- **Option D — bound it in the HTTP request parser only.**
  - Good, because it produces the best HTTP behaviour: a `400` at the edge
  - **Bad, decisively:** it puts a domain invariant in the edge. Any caller that is not an HTTP
    request bypasses it — a correct *addition*, an unacceptable *substitute*.
- **Option E — catch the `RangeError` inside `withinOpeningHours` and return `malformed-interval`.**
  - Bad, because a `try`/`catch` around a `formatToParts` call cannot distinguish
    an out-of-range instant from an unsupported zone or a conversion bug.
  - Bad, because it leaves `instant()` untouched, so it inherits every objection to Option B.
  - Bad, because control flow by exception in a function whose design property is purity reads
    as an admission that the property was unreachable.
- **Option F — do nothing; document the range as a precondition.**
  - Good, because nothing is broken today and no criterion is violated
  - Bad, because a precondition nobody can check is a comment
  - Bad, because the first caller to hit it gets a 500 from the module whose entire design claim
    is that it cannot fail that way.

## Decision

Chosen option: **C — the bound is applied in both places, `instant()` primarily and
`withinOpeningHours` step 1 as a boundary defence**, as
`Math.abs(epochMillis) <= 8_640_000_000_000_000`.

- **`instant()` is the primary home, and the reason is what the type is for.**
  The type then carries its guarantee in one sentence: **an `Instant` is renderable by
  construction**.
- **`withinOpeningHours` step 1 gets it too**, and this is a consequence of the AC-6 ruling rather
  than belt-and-braces: it may not import `Interval`, so "my caller used `instant()`" is
  uncheckable. It returns the existing `malformed-interval`.
- **The duplication is deliberate and is booked as debt, not hidden.** The literal
  appears in two domain files and under literal AC-6 nothing can share it — D-01-2 of
  `docs/slices/01-design.md`, cashing in; arc42 §11 carries it.
- **Not part of this decision, but stated so the next slice does not re-derive it.** The HTTP
  parser should *also* reject one — an addition, never a substitute.

## Consequences

**Good**

- The brand becomes evidence of the property consumers actually need
- `withinOpeningHours` stays total.
  Its verdict list becomes the complete description of its behaviour, which is what makes it
  property-testable.
- The failure moves from a `RangeError` deep inside `Intl` to a `null` at the constructor or a
  `malformed-interval` at the boundary — both actionable.
- It is directly testable at both sites, and the boundary values (`±8_640_000_000_000_000` and
  `±8_640_000_000_000_001`) suit `fast-check`.

**Bad, or deferred**

- **The literal is duplicated across two domain files with no way to share it.**
  A widening applied to one and not the other is caught by nothing.
- Two more branches to cover, in a slice whose mutation threshold is already the strictest in
  the project.
- The bound is a JavaScript `Date` limit leaking into domain policy.
  Honest — `timestamptz` is *wider*, so `Date`'s binds — but a platform fact in the pure core.
- It needs its own red commit under §2.4, which is why it is a backlog slice rather than a patch
  to slice 01.
