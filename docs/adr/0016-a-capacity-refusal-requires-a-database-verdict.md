---
id: "0016"
title: A capacity refusal requires a database verdict — make the contended resource constructible only by SQLSTATE classification
status: proposed
date: 2026-09-05
supersedes: null
superseded_by: null
arc42: ["§5.2", "§6.1", "§8.6", "§11"]

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

`CLAUDE.md` §2.1 is NON-NEGOTIABLE and forbids check-then-act:

```ts
// FORBIDDEN — both concurrent requests see "free" and both insert
const free = await checkAvailability(...);
if (free) await createAppointment(...);
```

Slice 02 is where that rule stops being a document and becomes a program. So the question is not
whether this slice's booking path contains a check — it does not — but **what happens in six months
when someone adds one.**

**The honest answer today is: nothing.** And that is the fact this decision exists for.

> The exclusion constraint makes check-then-act **harmless**. A booking path that reads availability
> and then decides to insert still never double-books, because the constraint still adjudicates the
> write. It is slower, it refuses more often than it should, and it is exactly the shape §2.1 names —
> but it is not *incorrect*. **QS-1 and QS-2 would pass over it.** So would every acceptance test,
> every contract test and every property test in the suite.

That is a genuinely awkward property of a design whose safety comes from the database: the safety net
also hides the thing the net was supposed to make visible. AC-5 already recognises it by being phrased
as a source-tree inspection — *"Given the source tree, when it is **inspected**"* — rather than as a
runtime assertion. But a source scan is a text scan, and this project has already written down twice
what text scans cannot see: computed forms, interpolated identifiers, anything assembled at runtime
(arc42 §11, *"What slice 01's mechanisms do not catch"*).

So the question sharpens to: **is there a mechanism stronger than a scan?**

There is, and it comes from noticing what a check-then-act refusal actually has to *produce*. Every
path in §8.6's taxonomy ends in a status and a `type`. The one that check-then-act produces is
`409 /problems/no-capacity`, carrying `resource`. In the correct design that value comes from
`err.constraint` on a `23P01` — from PostgreSQL, after a write. In the check-then-act design it comes
from the application's own conclusion, before one.

**Those two are the same string today, and nothing distinguishes them.** `resource: 'bay'` is
`resource: 'bay'` whether a database produced it or a programmer typed it.

## Considered options

- **Option A** — do nothing structural; rely on AC-5's source scan and reviewer attention.
- **Option B** — a `dependency-cruiser` rule.
- **Option C** — **brand the contended resource**, minted only by the SQLSTATE classifier, and make
  the `no-capacity` outcome carry the branded type.
- **Option D** — carry the whole `PgOutcome` conflict object into the `no-capacity` outcome.
- **Option E** — assert at runtime that a `409` was preceded by a `23P01`, e.g. through the span or
  metric recorded in slice 09.

## Decision

Chosen option: **C — `ContendedResource` is a branded type minted only inside
`src/persistence/pgError.ts`, and `BookOutcome`'s `no-capacity` variant carries it.**

```ts
// src/persistence/pgError.ts — the ONLY minting site
export type ContendedResource = ('bay' | 'technician') & { readonly __brand: 'ContendedResource' };

export type PgOutcome =
  | { readonly kind: 'conflict'; readonly resource: ContendedResource; readonly constraint: string }
  | { readonly kind: 'bad-reference'; readonly constraint: string }
  | { readonly kind: 'other'; readonly cause: unknown };

// src/application/bookAppointment.ts
export type BookOutcome =
  | …
  | { readonly kind: 'no-capacity'; readonly resource: ContendedResource; readonly attempts: number };
```

The consequence, stated as the sentence a reader should carry away: **you cannot refuse a booking for
capacity reasons without holding a value PostgreSQL produced.** The refusal is not merely *justified*
by a database verdict in a comment; it is *constructed from* one, and the compiler checks it.

This is the same pattern the domain already committed to — `Instant` and `DurationMinutes` are branded
with a single constructor each, so possession of the type is evidence about the value. `serviceDuration`
says what a usable duration is; `classify` says what a real contention is.

### What was measured, and the claim narrowed to fit it

`typescript` 6.0.3 from this repository, `--strict`, two trees:

| Tree | Result |
|---|---|
| `pgError.ts` + a use case refusing from a `PgOutcome` | **exit 0** |
| the same, plus a planted `if (!free) return { kind: 'no-capacity', resource: 'bay', attempts: 0 }` | **exit 2** — `error TS2322: Type '"bay"' is not assignable to type 'ContendedResource'` |

**And the escape hatch was measured too, because a mechanism's limits are part of the mechanism.**
The same planted mutant written `resource: 'bay' as ContendedResource` compiles at **exit 0**.

So the claim this ADR makes is deliberately narrower than "check-then-act cannot compile":

> **The brand forecloses every shape that does not cast.** A cast is a single greppable token,
> confined to `src/persistence/pgError.ts` by a marker in `tests/architecture/`, and visible in any
> diff that adds one.

That narrowing is not hedging. It is the precedent arc42 §5.2 set at slice 00a, where *"no other shape
compiles"* was corrected to *"the ruleset forecloses every shape that names the handle"* — because a
claim about the tooling that the tooling does not support is worse than a smaller true claim: the next
person to need an escape hatch finds one and concludes the rule was decorative.

### The scope of the rule

- It applies to `no-capacity` and to nothing else. `unknown-reference`, `vehicle-not-owned` and
  `outside-opening-hours` are decided by reads and by the pure core, correctly and by design
  (ADR-0001, ADR-0002), and branding them would be cargo cult.
- A dealership with **no** bays or no qualified technicians produces an empty candidate set and no
  `INSERT`, so there is no verdict and no `ContendedResource` to construct. That case maps to
  `unknown-reference: service-type` — which is honest, since no technician there can perform the
  service — rather than to a fabricated `no-capacity`. The rule is what forced that reading, and the
  reading is better than the one it replaced.

## Consequences

**Good**

- The most important invariant in the system acquires a **compile-time** guard, in a place where no
  behavioural test can help, because the database's own safety net hides the defect.
- The guard is free at runtime: a branded type is erased entirely.
- It composes with the layering already enforced. `sql-only-in-persistence` means the minting site
  cannot move out of `src/persistence`; `domain-is-pure` means the policy core cannot mint one at all.
- It makes the empty-candidate-set case get a better answer than it would otherwise have got, by
  refusing to let the application invent contention it did not observe.
- The failure mode is the best available kind: a compiler error at the exact line, naming the exact
  type.

**Bad, or deferred**

- **A cast defeats it**, measured. The residue is a scan plus review, and the scan is a text scan with
  the usual named gaps. arc42 §11 carries this.
- A brand on a two-member string union is unusual enough that a reader may take it for ceremony. The
  reason is written at the minting site and here, and this is the second time this project has paid
  that cost for a brand (D-01-2 is the first).
- It adds a type-only dependency `src/application` → `src/persistence`. That edge is already permitted
  and deliberate (ADR-0008 removed the repository port on purpose), so nothing new is opened — but it
  is one more thing that would have to move if the port ever came back.
- **It cannot be tested by the test suite that matters.** Its evidence is a `tsc` exit code over a
  planted mutant, not a red test — the same evidence class as `.dependency-cruiser.js`'s planted
  controls. That is a real asymmetry and it is why the measurement is recorded rather than asserted.

## Pros and cons of the options

### Option A — the source scan and reviewer attention alone

- Good, because it is what AC-5 already asks for and it costs nothing to build.
- Good, because a scan catches the *shape* — a `NOT EXISTS` against `appointment` in the wrong file —
  which a type cannot.
- Bad, because a text scan cannot see a computed table name, an interpolated identifier or a helper
  that legitimately holds the token; arc42 §11 already records that residue twice for other scans.
- **Bad, decisively:** it is the only mechanism, and it is the weakest available kind, for the rule
  the project calls NON-NEGOTIABLE. Options A and C are not alternatives — C is what makes A a
  backstop rather than the whole defence, and this ADR keeps both.

### Option B — a `dependency-cruiser` rule

- Good, because layering rules are already the project's enforcement idiom and CI already runs them.
- **Bad, decisively:** `dependency-cruiser` reasons about module edges. Check-then-act is not an edge
  — the use case is *already permitted* to import the repository (ADR-0008 removed the port on
  purpose), and the defect is what it does with the result. There is no forbidden import to forbid.
- Bad, because the nearest expressible rule — forbid `src/application` → `candidateRepository` —
  would forbid the correct design along with the incorrect one.

### Option C — brand the contended resource

- Good, for the reasons in **Decision**, and because it puts the guarantee at the type level where the
  project already puts its other guarantees.
- Good, because it is checked by `npm run typecheck`, which runs on every commit, rather than by a
  gate someone can be persuaded to waive.
- Bad, because of the cast escape hatch, measured and recorded rather than denied.
- Bad, because it is one more brand in a codebase that already had to write an ADR about a brand's
  limits (ADR-0014, D-01-2).

### Option D — carry the whole conflict object into the outcome

- Good, because it is strictly more evidence: the outcome would hold `constraint` and the original
  error, so nothing could be fabricated without constructing a plausible `pg` error object.
- Good, because AC-3 and AC-4 assert on the constraint *name*, which this makes available without a
  second field.
- Bad, because it puts a persistence-shaped value into an application-layer outcome and then into the
  HTTP layer's `switch`, which is exactly the leakage `sql-only-in-persistence` exists to prevent —
  `src/http` would be one property access away from a `pg` error object it may not name.
- Bad, because "fabricate a plausible error object" is barely harder than "write a cast", so the extra
  cost buys very little extra guarantee.
- **Partially adopted:** `constraint` is carried on the `PgOutcome` conflict variant, because AC-3 and
  AC-4 need the name. It is not carried into `BookOutcome`.

### Option E — assert at runtime that a `409` followed a `23P01`

- Good, because it would catch the defect behaviourally, which is the only thing no other option does.
- Good, because slice 09 builds the span and the metric anyway (QS-13), so the observation point
  exists for free.
- Bad, because it is a test that can only exist from slice 09, and this slice is where the invariant
  is built. A guard that arrives seven slices after the code it guards has already failed at its job.
- Bad, because it asserts on telemetry, so deleting a span deletes the guard, and nothing would say so.
- **Not rejected, deferred:** QS-13 already requires `booking_conflicts_total` to distinguish absorbed
  from refused conflicts. Once it exists, a refusal with no counted conflict is exactly this check, and
  it should be added then as a *second* line of defence rather than as a substitute for this one.
