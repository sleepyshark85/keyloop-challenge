---
id: "0021"
title: The booking seed is overridable by environment, unset by default, and announces itself
status: proposed
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
---

## Context and problem statement

ADR-0009 chose Order-C, a seeded shuffle, and made the seed **a parameter, never a global** — a test
fixes the order, production varies it. The slice-04 design injected it through `BookDeps` and
recorded it on `booking.refused`. **A recorded seed is a label, not a handle:** a test that reads
`seed: 3141592653` from a failed run has learned which order was taken and cannot take it again.

The cost is larger than AC-5's re-runnability, and this is the measurement that decided it.
`appointment` carries exclusion constraints on **both** `bay_id` and `technician_id`, plus the
dealership foreign keys — so **blocking K technicians over an interval requires K bays at the same
dealership**, and resources cannot be borrowed from another dealership. Therefore, whenever a free
bay and a free technician both exist, that pair is a reachable first draw: **no static fixture can
force a technician-side first conflict.** Only the bay side is deterministic (block every bay).
Without seed control, AC-2's forced retry, AC-3's technician half and D-04-1's spurious-refusal leg
are all coin flips — measured between 0.35 % and 46.7 % depending on the fixture.

## Considered options

| | Option | Verdict |
|---|---|---|
| **A** | No seam. Accept probabilistic coverage | Rejected. AC-3 requires *both* constraint names; a P ≈ 0.25 assertion is a flake, and the alternative is not asserting half of an acceptance criterion |
| **B** | **`BOOKING_SEED` in `platform/config.ts`, unset by default, plus one startup `warn`** | **Chosen** |
| **C** | B, but honoured only when `NODE_ENV=test` | Rejected, and it is the tempting one. ADR-0013 has outside-in tests exercise the **built artifact**; a gate on `NODE_ENV` makes the tested artifact behave differently from the shipped one, which is the property ADR-0013 exists to preserve |
| **D** | Carry the seed on the request — a header or a body field | Rejected. That is API surface, it is slice 10's contract, and it exposes allocation ordering to callers permanently to buy a test a handle |
| **E** | Derive the seed from `deps.newId()`, already injected | Rejected. `main.ts` binds it to `crypto.randomUUID`, which is no more controllable from outside the process than the seed is; it moves the problem without solving it |

## Decision

Chosen option: **B.** `loadConfig` reads `BOOKING_SEED` into `bookingSeed?: number`. Unset — the
default, and the only production setting — every request draws its own seed. Set, every request uses
it, and `loadConfig` emits **one `warn` at startup** naming the consequence.

**The cost is taken in ADR-0009's own terms.** That ADR listed *"the seed must actually vary — a
misconfigured deployment that seeds every request identically degrades to Order-A silently"* under
its bad consequences. This makes that reachable by one environment variable, and buys back the word
**silently**: the startup line, and OQ-04-1's two-seed assertion, are what stop it being silent.

**It must not be set in QS-3's concurrency cases.** A constant seed gives every racer the same
permutation, which *is* Order-A — so setting it there would make the scenario that exists to prove
the shuffle spreads contention test the opposite. It is for the single-request fixtures: AC-2, AC-3's
technician half, AC-5 end-to-end, and D-04-1.

## Consequences

**Good.** Four things become assertable that were not: a forced retry, a forced technician-side prune,
AC-5's re-runnability through the running service, and D-04-1's spurious refusal — the last being the
only way to demonstrate a recorded risk before its remedy exists. No API surface, no test-only branch
in `src/`, and the shipped artifact is the tested artifact.

**Bad, or deferred.** A production deployment that sets it degrades to Order-A, which is ADR-0009's
own named risk now one variable away; the mitigation is a log line and review, with the usual gap.
The knob exists **because a test needs it**, and a configuration surface justified by a test is a
shape worth being uncomfortable about — C is what an instinct to hide that would produce, and it is
rejected for a reason that outranks the discomfort. §11 carries both.
