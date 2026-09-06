---
id: "0021"
title: The booking seed is overridable by environment, unset by default, and announces itself
status: accepted
date: 2026-09-06
supersedes: null
superseded_by: null
arc42: ["§5.2", "§6.2", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: test-engineer
decided-by: architect
ai-input: >
  RAISED as objection T-04-1 at slice 04 step 2 and RULED BY THE ARCHITECT under the delegated
  mid-slice authority. PROVISIONAL until slice 04's gate. Under the rule as it stood before
  2026-09-06 this would have gone to the human: it adds a production configuration surface for
  testability and makes a risk ADR-0009 named reachable by misconfiguration.

  The finding is the test-engineer's and it is structural rather than a preference, which is why
  it carried: ADR-0009 left the seed "injected", the design injected it, and nothing could inject
  it from outside the process. The architect's step-1 ruling that AC-5 is satisfied by a property
  over the pure ordering plus a recorded seed was accepted on its own terms and is unchanged; this
  ADR covers the half that ruling left undelivered.

  RATIFIED `accepted` on 2026-09-06 by the architect under the human's standing delegation, the
  human being absent — AND NARROWED FIRST. The test-engineer's step-3 measurement showed the
  record claimed four things and delivers two. An accepted ADR is immutable, so the claim was
  corrected before the status was, rather than superseded a slice later.
---

## Context and problem statement

ADR-0009 chose Order-C, a seeded shuffle, and made the seed **a parameter, never a global**: a test
fixes the order, production varies it. The slice-04 design injected it through `BookDeps` and logged
it on `booking.refused`. **A recorded seed is a label, not a handle:** a test that reads
`seed: 3141592653` from a failed run has learned which order was taken and cannot take it again.

This is the measurement that decided it.
`appointment` carries exclusion constraints on **both** `bay_id` and `technician_id`, plus the
dealership foreign keys — so **blocking K technicians over an interval requires K bays at the same
dealership**, and resources cannot be borrowed from another dealership. So whenever a free
bay and a free technician both exist, that pair is a reachable first draw: **no static fixture can
force a technician-side first conflict.** Without seed control, AC-2's forced retry, AC-3's technician half and D-04-1's spurious-refusal leg
are all coin flips — measured between 0.35 % and 46.7 % depending on the fixture.

## Considered options

| | Option | Verdict |
|---|---|---|
| **A** | No seam. Accept probabilistic coverage | Rejected. AC-3 requires *both* constraint names; a P ≈ 0.25 assertion is a flake, and the alternative is not asserting half of an acceptance criterion |
| **B** | **`BOOKING_SEED` in `platform/config.ts`, unset by default, plus one startup `warn`** | **Chosen** |
| **C** | B, but honoured only when `NODE_ENV=test` | Rejected, and it is the tempting one. ADR-0013 has outside-in tests exercise the **built artifact**; a `NODE_ENV` gate makes the tested artifact differ from the shipped one — the property ADR-0013 exists to preserve |
| **D** | Carry the seed on the request — a header or a body field | Rejected. API surface, slice 10's contract, and it exposes allocation ordering to callers permanently to buy a test a handle |
| **E** | Derive the seed from `deps.newId()`, already injected | Rejected. `main.ts` binds it to `crypto.randomUUID`, no more controllable from outside than the seed; it moves the problem |

## Decision

Chosen option: **B.** `loadConfig` reads `BOOKING_SEED` into `bookingSeed?: number`. Unset — the
default, and the only production setting — every request draws its own seed. Set, every request uses
it, and `loadConfig` emits **one `warn` at startup**.

**The cost is taken in ADR-0009's own terms.** That ADR listed *"the seed must actually vary — a
misconfigured deployment that seeds every request identically degrades to Order-A silently"* under
its bad consequences. This makes that reachable by one environment variable, and buys back the word
**silently**: the startup line and OQ-04-1's two-seed assertion are what stop it.

**It must not be set in QS-3's concurrency cases.** A constant seed gives every racer the same
permutation, which *is* Order-A — setting it there would make the scenario that exists to prove
the shuffle spreads contention test the opposite. It is for AC-5 end to end, and for OQ-04-1.

## Narrowed before ratification

Two limits, measured by the test-engineer at step 3 and reported rather than enjoyed.

**The structural measurement stands; the inference drawn from it did not.** No static fixture can
force a technician-side *first* conflict — but determinism need not come from the first draw. Block
every technician and leave one bay free: the free bay cannot conflict, so the technician list must
empty under *every* permutation. AC-3 and AC-4 are built that way, and D-04-1 is shown
by AC-4's capped exit; none of the three sets a seed. **And a fixed seed forces *a* fixed ordering,
never a *chosen* one** — reproducibility, not steerability.

So two of this record's four claims fall for that one reason, and the justification is AC-5 and
OQ-04-1 alone. Neither has another mechanism, so the decision is unchanged and only the claim is.

## Consequences

**Good.** Two things become assertable that were not: AC-5's re-runnability through the running
service, and OQ-04-1's degeneracy check — two requests draw two seeds unset, and one seed when set. No API surface, no test-only branch in `src/`, and the shipped artifact is the
tested one.

**Bad, or deferred.** A production deployment that sets it degrades to Order-A — ADR-0009's own named
risk, one variable away; the mitigation is a log line and review. The knob exists **because a test
needs it**, and a configuration surface justified by a test is worth being uncomfortable about — C is
what an instinct to hide it would produce. §11 carries both.
