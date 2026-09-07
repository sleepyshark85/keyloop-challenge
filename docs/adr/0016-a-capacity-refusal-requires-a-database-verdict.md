---
id: "0016"
title: A capacity refusal requires a database verdict — make the contended resource constructible only by SQLSTATE classification
status: proposed
date: 2026-09-05
supersedes: null
superseded_by: null
arc42: ["§5.2", "§6.1", "§8.6", "§11"]

# Condensed 2026-09-06 under the merged-design ruling. `contested: true` because the decision
# turns on two measurements this record is the only home for — the planted mutant and the cast
# that defeats it — and the claim was narrowed to fit them.
contested: true

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  PROPOSED by the architect at slice 02 step 1, unprompted by any finding — it is a positive
  mechanism for CLAUDE.md §2.1 rather than a fix for a defect. Slice 02 is the slice where §2.1
  becomes running code, and the human's step-1 instruction was explicit: "the design must make
  check-then-act unrepresentable, not merely absent. Name what would fail if someone reintroduced it."

  The uncomfortable observation that motivates it is the architect's and is stated in the ADR rather
  than buried: the exclusion constraint makes check-then-act HARMLESS, so QS-1 and QS-2 would pass
  over a reintroduced check. No behavioural test in this system can catch it. The mechanism therefore
  has to be structural, and this is the strongest structural one available in TypeScript.

  Both the mechanism AND its escape hatch were MEASURED before this record was written — the planted
  mutant fails `tsc` with TS2322, and the same mutant with a cast compiles clean. The claim is
  narrowed to what the measurement supports, following the precedent set at slice 00a when
  "partial application is the only shape left" was narrowed to "the ruleset forecloses every shape
  that names the handle". A mechanism claim nobody has run is the failure mode this project has spent
  three slices removing.

  Recommended as written and put to the human's ruling at slice 02's gate. Carried in arc42 §11 as
  debt until ruled.
---

## Context and problem statement

In six months someone adds three lines to the booking path: read the availability, decide, then
write. Every test still passes. No booking is double-booked, because the exclusion constraint still
adjudicates every write — the path is merely slower, and refuses more often than it should. Nothing
in this system objects, and nothing can.

That is the uncomfortable shape of the rule this slice makes real. Check-then-act is forbidden, and
the question is not whether the booking path contains a check — it does not — but **what happens
when someone adds one.** The honest answer today is: nothing.

> The exclusion constraint makes check-then-act **harmless**. A booking path that reads availability
> and then decides still never double-books, because the constraint still adjudicates the write. It
> is slower, it refuses more often than it should, and it is exactly the forbidden shape — but it is
> not *incorrect*. **The concurrency scenarios would pass over it**, and so would every other test in
> the suite.

The safety net hides the thing it was supposed to make visible. The acceptance criterion for this
already concedes as much, by being phrased as a source-tree *inspection* rather than a runtime
assertion — but a scan is a text scan, and the debt register already records twice what text scans
cannot see. So: **is there a mechanism stronger than a scan?**

There is, and it comes from what a check-then-act refusal has to *produce*. That path ends in
`409 /problems/no-capacity` carrying `resource`. Correctly, that value comes from `err.constraint` on
a `23P01` — from PostgreSQL, after a write. Under check-then-act it comes from the application's own
conclusion, before one. **Those two are the same string, and nothing distinguishes them.**

## Considered options

| | Option | Why not, in a clause |
|---|---|---|
| **A** | Do nothing structural; rely on the source scan and reviewer attention | It is the weakest available mechanism for a NON-NEGOTIABLE rule. Not rejected as an *alternative*: C is what makes A a backstop rather than the whole defence, and this ADR keeps both |
| **B** | A `dependency-cruiser` rule | `dependency-cruiser` reasons about module *edges*, and the use case is already permitted to import the repository — the layering decision removed the port on purpose. There is no forbidden import to forbid, and the nearest expressible rule would forbid the correct design too |
| **C** | **Brand the contended resource**, minted only by the SQLSTATE classifier | **Chosen** |
| **D** | Carry the whole classifier verdict into the `no-capacity` outcome | Strictly more evidence, but it puts a persistence-shaped value into the HTTP layer's `switch` — the leakage the SQL-confinement rule exists to prevent — and fabricating a plausible error object is barely harder than writing a cast. **Partially adopted**: the constraint name is carried on the classifier's verdict, because the acceptance criteria assert on that name; it is not carried into the booking outcome |
| **E** | Assert at runtime that a `409` followed a `23P01`, through the observability slice's span or metric | The only option that catches the defect behaviourally, and it cannot exist until that slice — a guard arriving seven slices after the code it guards has already failed. It also asserts on telemetry, so deleting a span deletes the guard. **Deferred, not rejected**: once the conflict counter distinguishes absorbed from refused, a refusal with no counted conflict is exactly this check, and it belongs there as a second line of defence |

## Decision

Chosen option: **C — `ContendedResource` is a branded type minted only inside
`src/persistence/pgError.ts`, and `BookOutcome`'s `no-capacity` variant carries it.**

The brand is a `'bay' | 'technician'` union that no other module can construct, because the type
carries a marker only the SQLSTATE classifier can attach. The sentence to carry away: **you cannot
refuse a booking for capacity reasons without holding a value PostgreSQL produced.** The refusal is
not *justified* by a database verdict in a comment; it is *constructed from* one, and the compiler
checks it. It is the pattern the domain already uses — `Instant` and `DurationMinutes` are branded
with one constructor each, so possession of the type is evidence about the value.

### What was measured, and the claim narrowed to fit it

`typescript` 6.0.3, `--strict`, two trees:

| Tree | Result |
|---|---|
| `pgError.ts` + a use case refusing from a classifier verdict | **exit 0** |
| the same, plus a planted `if (!free) return { kind: 'no-capacity', resource: 'bay', attempts: 0 }` | **exit 2** — `TS2322: Type '"bay"' is not assignable to type 'ContendedResource'` |
| the same planted mutant written `resource: 'bay' as ContendedResource` | **exit 0** — the escape hatch |

> **The brand forecloses every shape that does not cast.** A cast is a single greppable token,
> confined to `pgError.ts` by a marker in `tests/architecture/`, and visible in any diff that adds one.

That narrowing follows the precedent set at the walking skeleton, where *"no other shape compiles"*
became *"the ruleset forecloses every shape that names the handle"*: a claim the tooling does not
support is worse than a smaller true one, because the next person to need an escape hatch finds it
and concludes the rule was decorative.

### The scope of the rule

It applies to `no-capacity` and nothing else — `unknown-reference`, `vehicle-not-owned` and
`outside-opening-hours` are decided by reads and by the pure core, correctly and by design, and
branding them would be cargo cult. A dealership with no bays or no qualified technicians produces an
empty candidate set and no `INSERT`, so there is no verdict to construct one from; that case maps to
`unknown-reference: service-type` rather than to a fabricated `no-capacity`. **The rule is what forced
that reading, and the reading is better than the one it replaced.**

## Consequences

**Good.** The system's most important invariant acquires a **compile-time** guard exactly where no
behavioural test can help. It is free at runtime, and it composes with the layering already enforced:
the SQL-confinement rule keeps the minting site inside `src/persistence`, and the purity rule means
the policy core cannot mint one at all. The failure mode is the best available kind — a compiler error
at the exact line, naming the exact type.

**Bad, or deferred.** A cast defeats it, measured; the residue is a scan plus review, with the usual
named gaps, carried as debt. A brand on a two-member string union may read as ceremony, which is the
second time this project has paid that cost. It adds a type-only `src/application` →
`src/persistence` edge — already permitted and deliberate, but one more thing to move if the
repository port ever returns. And **it cannot be tested by the test suite that matters**: its
evidence is a `tsc` exit code over a planted mutant, the same evidence class as
`.dependency-cruiser.js`'s planted controls, which is why the measurement is recorded rather than
asserted.
