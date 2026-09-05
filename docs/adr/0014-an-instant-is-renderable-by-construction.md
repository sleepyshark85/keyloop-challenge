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

`Number.isInteger` — and `Number.isFinite` before it, which is how the design's §4.2 step 1 words the
same check — is satisfied by `8_640_000_000_000_001`. JavaScript's `Date` is not: its representable
range is `±8_640_000_000_000_000` ms (±100,000,000 days), and one millisecond outside it produces an
Invalid Date. `Intl.DateTimeFormat.prototype.formatToParts` on an Invalid Date **throws a
RangeError**.

That matters here and not in general, because `withinOpeningHours` is the one place in this system
that converts an instant to a wall clock, it does so through `formatToParts`, and slice 01 specifies
it as a **pure total function returning a verdict** — `ok`, `outside-hours`, `closed`,
`spans-local-days`, `malformed-interval`, `malformed-hours`. A function specified to return a verdict
that instead throws is not a smaller version of that contract; it is a different contract, and every
caller written against the verdict list is wrong about it.

So the check was written for the right reason and drawn at the wrong place. Its stated purpose in the
design is precisely that a non-renderable endpoint must not make a pure function throw. It just
tested for the wrong property: *is this a number* rather than *is this a number this system can use*.

Three further facts shape the decision rather than merely motivating it.

**The type is branded, and a brand is a promise.** `Instant` exists as `number & { __brand }` with
`instant()` as the only constructor. The entire value of that pattern is that possession of the type
is evidence about the value. Today possession of an `Instant` is evidence that the number was an
integer, which is not the property any consumer needs.

**`withinOpeningHours` cannot be handed an `Instant`.** Under the human's literal AC-6 ruling no
domain module imports another, so `openingHours.ts` cannot name the `Interval` type and takes two bare
`number` endpoints. It therefore cannot trust its inputs even if `instant()` were fixed — a caller in
`src/application` can pass any number at all.

**Nothing is broken today.** No AC, no quality scenario and no §2 invariant is violated by the current
code, which is why this is a backlog item and not a loopback. The exposure is that the first caller to
hand the domain a parsed timestamp from an untrusted source gets a 500 out of a module whose whole
design property is that it cannot fail that way.

## Considered options

- **Option A — bound it in `instant()` only.**
- **Option B — bound it in `withinOpeningHours` step 1 only.**
- **Option C — bound it in `instant()` AND in `withinOpeningHours` step 1.**
- **Option D — bound it in the HTTP request parser only.**
- **Option E — catch the `RangeError` inside `withinOpeningHours` and return `malformed-interval`.**
- **Option F — do nothing; document the range as a precondition.**

## Decision

Chosen option: **C — the bound is applied in both places, `instant()` primarily and
`withinOpeningHours` step 1 as a boundary defence.**

The constant is `8_640_000_000_000_000`, applied as `Math.abs(epochMillis) <= 8_640_000_000_000_000`.

**`instant()` is the primary home**, and the reason is what the type is for. `Instant`'s constructor
exists to state what a usable instant *is*, exactly as `serviceDuration` states what a usable duration
is — and a value `Date` cannot represent is not usable by any definition this system has: it cannot be
rendered, it cannot be compared against a wall clock, and it cannot be stored in a `timestamptz`. With
the bound there the type carries the guarantee, and it is expressible as one sentence a reader can
hold: **an `Instant` is renderable by construction.** That is the same class of statement as *a
`DurationMinutes` is a positive integer*, which is the pattern this domain has already committed to.

**`withinOpeningHours` step 1 gets it too, and this is a consequence of the AC-6 ruling rather than
belt-and-braces.** The function takes bare numbers precisely because it may not import `Interval`, so
"my caller used `instant()`" is not something it can check, assert or type. It defends its own inputs
and returns `malformed-interval` — the verdict variant that already exists for exactly this class,
which is why no new variant is introduced.

**The duplication is deliberate and is booked as debt, not hidden.** The literal
`8_640_000_000_000_000` appears in two domain files and, under literal AC-6, there is no mechanism to
share it: no domain module may export it to another and none may import it. That is D-01-2 of
`docs/slices/01-design.md` §11 cashing in, and this ADR is its first concrete instance. It is recorded
there and in arc42 §11 rather than argued away, because the alternative — reversing the AC-6 ruling to
avoid a duplicated constant — would be a scope change and is the human's, not the architect's.

**Not part of this decision, but stated so the next slice does not re-derive it.** The HTTP request
parser should *also* reject an out-of-range timestamp, so a client sends a bad instant and gets a
`400` rather than a `409`-shaped surprise or a `500`. That belongs to the slice that adds the booking
route (ADR-0005's edge, slice 02/03) and goes in its notes. It is an addition to this decision, never
a substitute for it.

## Consequences

**Good**

- The brand becomes evidence of the property consumers actually need. *An `Instant` is renderable by
  construction* is checkable in one line and true at every use site.
- `withinOpeningHours` stays total. Its documented verdict list becomes the complete description of
  its behaviour, which is what makes it property-testable at all.
- The failure moves from a `RangeError` deep inside `Intl` to a `null` at the constructor or a
  `malformed-interval` at the boundary — both of which a caller can act on.
- It is directly testable at both sites, and the boundary values (`±8_640_000_000_000_000` and
  `±8_640_000_000_000_001`) are exactly the shape `fast-check` and boundary unit tests are good at, so
  the mutants are killable rather than merely surviving.

**Bad, or deferred**

- **The literal is duplicated across two domain files with no way to share it.** See D-01-2 above;
  arc42 §11 carries it. A later widening applied to one file and not the other is caught by nothing
  automatic.
- Two more branches to cover, in a slice whose mutation threshold is already the strictest in the
  project.
- The bound is a JavaScript `Date` limit leaking into domain policy. It is honest — the system renders
  through `Intl` and stores in PostgreSQL, and PostgreSQL's `timestamptz` range is *wider*, so
  `Date`'s is genuinely the binding constraint — but it is a platform fact stated in the pure core,
  and a reader is entitled to notice that.
- It needs its own red commit under §2.4, which is why it is a backlog slice rather than a patch to
  slice 01.

## Pros and cons of the options

### Option A — bound in `instant()` only

- Good, because it puts the invariant where the type is minted, so it holds for every consumer that
  goes through the constructor, present and future.
- Good, because it is one branch in one file, and the smallest change that makes the brand mean
  something.
- **Bad, decisively:** `withinOpeningHours` cannot receive an `Instant` under the literal AC-6 ruling.
  It takes bare `number`s, so it would still throw on a caller that passed a raw parsed timestamp —
  which is the exact path an HTTP request takes. The one function that can actually throw is the one
  this option does not protect.

### Option B — bound in `withinOpeningHours` step 1 only

- Good, because it protects the only function that can currently throw, which is where the observable
  defect is.
- Good, because it needs no change to `interval.ts` and no thinking about brands.
- Bad, because `instant()` keeps minting values that violate their own type's implied contract, and
  every future consumer — comparison, serialisation, the availability query — has to re-check the same
  property. That is how a brand degenerates into a comment.
- Bad, because it treats the symptom's location as the defect's location. The defect is that the
  constructor's check tests the wrong property.

### Option C — both

- Good, because each site is justified independently: the constructor states what the type means, and
  the boundary function defends inputs it cannot type.
- Good, because it is robust to the AC-6 ruling being revisited in either direction. If domain modules
  are later permitted to share types, the boundary check becomes redundant and can be deleted; if they
  are not, it stays load-bearing.
- Bad, because of the duplicated literal, which is real and is booked as debt rather than denied.
- Bad, because two checks for one property invites a future reader to delete "the redundant one",
  which is why the reason for each is written at each site and not only here.

### Option D — bound in the HTTP request parser only

- Good, because it produces the best HTTP behaviour: a `400` with a useful message, at the edge, where
  input validation belongs.
- Good, because it keeps a platform limit out of the pure core.
- **Bad, decisively:** it puts a domain invariant in the edge. Any caller that is not an HTTP request —
  a test, a seeder, a future batch import, the property suite itself — bypasses it entirely, and the
  domain's guarantee would be true only of one transport. It is a correct *addition* and an
  unacceptable *substitute*, which is how it is recorded above.

### Option E — catch the `RangeError` and return `malformed-interval`

- Good, because it makes the function total with no arithmetic and no magic constant, and it cannot
  be wrong about the exact boundary — `Intl` decides.
- Good, because it would also catch any other `Intl` failure mode nobody has thought of.
- Bad, because a `try`/`catch` around a `formatToParts` call cannot distinguish "the instant is out of
  range" from "the IANA zone is unsupported" or from a genuine bug in the conversion, and it would
  convert all three into the same verdict. That is exactly the kind of catch-all that hides the next
  defect.
- Bad, because it leaves `instant()` untouched, so it inherits every objection to Option B.
- Bad, because control flow by exception in a function whose design property is purity reads as an
  admission that the property was not achievable.

### Option F — do nothing; document the range as a precondition

- Good, because nothing is broken today and no criterion is violated, which is precisely why the DCR
  ruling was (b) and not (c).
- Good, because it costs nothing now.
- Bad, because a precondition nobody can check is a comment, and this codebase has already ruled twice
  in one slice that a mechanism nobody runs is not evidence.
- Bad, because the first caller to hit it gets a 500 from the module whose entire design claim is that
  it cannot fail that way — and the debugging path from that 500 back to `Number.isInteger` is long.
