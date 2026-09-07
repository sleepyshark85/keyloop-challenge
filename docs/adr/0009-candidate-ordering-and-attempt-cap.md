---
id: "0009"
title: Order candidates by a seeded shuffle, prune by the constraint that fired, and cap attempts at 16
status: accepted
date: 2026-09-04
supersedes: null
superseded_by: null
arc42: ["§4.1", "§5.2", "§6.2", "§8.4", "§10", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  ACCEPTED as recommended at Gate B on 2026-09-04, unmodified.
  Proposed by the architect at Gate B. ADR-0004
  explicitly deferred candidate ordering, the retry mechanism and the cap's value to
  the architect at Gate B, so this ADR closes parameters the human already delegated
  rather than reopening a Gate A ruling. The pruning rule is the architect's own
  addition and is the part most worth arguing: it changes the loop's bound from
  multiplicative to additive and it is only available because ADR-0006 chose a query
  layer that preserves `err.constraint`.
---

## Context and problem statement

Twenty requests for the 09:00 Saturday slot arrive at one dealership together. If every request
considers the same *(bay, technician)* pairs in the same order, they collide on the first, then the
second, then the third: retry work grows with the square of the concurrency.

The retry policy fixed the semantics and left ordering, traversal and the cap's value here, naming
that risk and one more — the cap must sit "well above any plausible candidate count". The two pull
against each other, because a **candidate is a *pair***: a dealership presents hundreds, so a cap
above that count guards nothing.

## Considered options

**Ordering**

- **Order-A — deterministic by id.**
  - Good, because it is completely reproducible
  - Good, because it makes resource allocation predictable
  - Bad, because it is precisely the collision above
  - Bad, because it concentrates all contention on the lowest-sorting resource
- **Order-B — uniform random shuffle**
  - Good, because it spreads contention
  - Bad, because a concurrency test that fails cannot be re-run
  - Bad, because a global RNG inside `src/domain` would break the domain-purity rule
    — the seed is injected anyway, so this *is* Order-C.
- **Order-C — seeded shuffle**: a deterministic permutation from a per-request seed
  — injected, never global. **Chosen.**
  - Good, because it spreads contention like Order-B and reproduces like Order-A.
  - Good, because it keeps ordering a pure function
  - Bad, because it is more machinery than either neighbour
  - Bad, because the seed's variability is an untested assumption
- **Order-D — load-balancing**: order by fewest appointments that day
  - Good, because it produces the outcome the service manager wants
  - Good, because it also spreads contention
  - Bad, because it needs an aggregate
  - Bad, because concurrent requests computing utilisation from the same snapshot agree
    — under a burst, Order-A.
  - Bad, because "fairest allocation" is scheduling policy — out of scope, and carried as debt.

**Traversal and bound**

- **Bound-1 — attempt pairs one at a time, prune only the pair that failed.** Worst case
  |bays| × |technicians| attempts.
  - Good, because it needs nothing from the error
  - Bad, because the bound is multiplicative
  - Bad, because it re-attempts pairs already known to be impossible
- **Bound-2 — prune by the constraint that fired**
  — **chosen.** Worst case |bays| + |technicians| − 1 attempts: roughly 40, not roughly 300.
  - Good, because it turns a multiplicative bound into an additive one
  - Good, because it forces the design to use information the database already gives
  - Bad, because it couples the loop to constraint naming
  - Bad, because it is theoretically over-eager

## Decision

Chosen option: **Order-C, Bound-2 and a hard cap of 16 attempts.**

- Bays and technicians are two ordered lists; the shuffle seed is a **parameter** of the pure
  ordering function, never a global: a test fixes the order, production varies it.
- `no_bay_overlap` → drop that bay from the bay list.
- `no_technician_overlap` → drop that technician from the technician list.
- **16 attempts**, after which the request is refused exactly as if the list were exhausted.

Dropping the whole resource is sound: a `23P01` on `bay_id` is a fact about the bay, not the pair.
It is over-eager only if the blocker is cancelled *during* the loop — milder than a refusal where
capacity existed, no double-booking, and outside the no-spurious-refusal scenario. Sixteen is set
against **contention depth**, the only driver Bound-2 leaves, and is configuration rather than a
constant. Cap-exceeded and exhaustion refusals are counted apart: a non-zero cap-exceeded counter
means the cap is wrong.

## Consequences

**Good**

- Concurrent requests spread across candidates instead of queueing on one, so retry work under a
  burst is linear, not quadratic.
- The attempt bound is additive, which makes a small cap meaningful.
- Ordering is a pure function of (candidates, seed) in `src/domain/candidates.ts`, so it is
  property-testable.
- Concurrency tests are reproducible: a seeded order plus a recorded seed makes a failing
  interleaving re-runnable.

**Bad, or deferred**

- Pruning consumes `err.constraint`, so the constraint names in the migration are load-bearing: a
  rename degrades the loop to Bound-1 and mislabels the conflict metric. A quality scenario pins
  them.
- The cap can still produce a refusal while capacity remained — the residual spurious refusal
  already accepted, now at depth 17 rather than count 17.
- Work is *not* balanced across resources: a seeded shuffle spreads contention, not load —
  Order-D's benefit, knowingly given up.
- The seed must actually vary: a deployment that seeds every request identically degrades to
  Order-A silently.
