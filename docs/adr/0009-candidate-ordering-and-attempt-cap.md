---
id: "0009"
title: Order candidates by a seeded shuffle, prune by the constraint that fired, and cap attempts at 16
status: proposed
date: 2026-09-04
supersedes: null
superseded_by: null
arc42: ["§4.1", "§5.2", "§6.2", "§8.4", "§10", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  Proposed by the architect at Gate B; awaiting the human's decision. ADR-0004
  explicitly deferred candidate ordering, the retry mechanism and the cap's value to
  the architect at Gate B, so this ADR closes parameters the human already delegated
  rather than reopening a Gate A ruling. The pruning rule is the architect's own
  addition and is the part most worth arguing: it changes the loop's bound from
  multiplicative to additive and it is only available because ADR-0006 chose a query
  layer that preserves `err.constraint`.
---

## Context and problem statement

ADR-0004 decided the *semantics*: on SQLSTATE `23P01`, attempt the next candidate; return `409` only
when the candidate list is exhausted or a hard cap is reached. It deferred three things to Gate B and
named the risk in each:

> "Candidate ordering is an architecture decision for Gate B… if every concurrent request orders
> candidates identically, they all collide on the first candidate, then all collide on the second,
> and the retry work grows with the square of the contention."

and

> "The cap's *value* is a Gate B parameter; its *existence* is fixed here… the cap must be set well
> above any plausible candidate count so it is unreachable in practice."

Those two pull against each other, because a **candidate is a *pair*** — one bay and one qualified
technician, both free for the whole interval. At the §1.1 scale (single-digit bays, tens of
technicians) a dealership can present hundreds of pairs, so "well above any plausible candidate
count" would mean a cap in the hundreds, which is not a liveness guard at all. Something has to give,
and this ADR is where.

## Considered options

**Ordering**

- **Order-A — deterministic by id.** Stable, reproducible, identical across concurrent requests.
- **Order-B — uniform random shuffle**, freshly randomised per request.
- **Order-C — seeded shuffle**: a deterministic permutation from a per-request seed, with the seed
  injected rather than read from a global clock or RNG.
- **Order-D — load-balancing**: order by fewest appointments that day, so work spreads across
  technicians and bays.

**Traversal and bound**

- **Bound-1 — attempt pairs one at a time, prune only the pair that failed.** Worst case
  |bays| × |technicians| attempts.
- **Bound-2 — prune by the constraint that fired**: a `no_bay_overlap` violation eliminates that bay
  from every remaining pair; a `no_technician_overlap` violation eliminates that technician. Worst
  case |bays| + |technicians| − 1 attempts.

## Decision

**Order-C (seeded shuffle), Bound-2 (prune by the constraint that fired), and a hard cap of 16
attempts.**

### Ordering

Candidate bays and candidate technicians are each permuted by a deterministic shuffle seeded from a
per-request value (the request id). The seed is a **parameter** of the pure ordering function in
`src/domain/candidates.ts`, never read from a global — so a test fixes the seed and gets a fixed
order, and production gets a different order per request. This is the whole point: concurrent
requests must disagree about which candidate to try first, or they queue behind one another; but a
concurrency test must be able to reproduce a failure it just saw.

### Traversal, and the pruning rule

Bays and technicians are held as two ordered lists rather than a materialised cross product. Each
attempt takes the head of each. On `23P01`, `err.constraint` says which resource was taken
(ADR-0006 keeps that field intact), and **the whole resource is dropped**, not merely the pair:

- `no_bay_overlap` → drop that bay from the bay list.
- `no_technician_overlap` → drop that technician from the technician list.

The remaining candidate space therefore loses an entire row or column per failure, and the loop
terminates in at most |bays| + |technicians| − 1 attempts instead of |bays| × |technicians|. For a
large dealership that is roughly 40 rather than roughly 300.

This is sound because a `23P01` on `bay_id` means some non-cancelled appointment already occupies
that bay over the requested interval, which is a fact about the bay and not about the pair — every
other pair containing it would fail identically. The one way it can be wrong is if that blocking
appointment is cancelled *during* this request's loop, in which case the bay is pruned although it
became free. That is a rarer and strictly milder failure than the alternative (a refusal where
capacity existed for a few hundred microseconds), it cannot produce a double booking, and it does not
affect ADR-0004's no-spurious-refusal scenario, in which nothing is cancelled mid-flight.

### The cap

**16 attempts**, after which the request is refused exactly as if the list were exhausted.

Sixteen is chosen against **contention depth** — how many requests can plausibly be racing for one
interval at one dealership at one instant — and not against candidate count, because Bound-2 makes
candidate count no longer the thing that drives attempts. Reaching 16 requires sixteen distinct
resources at one dealership to be taken out from under one request while it is looping, which at the
§1.1 load profile (tens of bookings per dealership per day) does not happen. The number is a
`platform/config.ts` value so a deployment can raise it without a code change.

A cap-exceeded refusal is counted separately from an exhaustion refusal in the conflict metric
(§8.4), because they mean different things: exhaustion means the dealership was full, the cap means
the system gave up. If the cap-exceeded counter is ever non-zero in production, the cap is wrong.

## Consequences

**Good**

- Concurrent requests spread across candidates instead of queueing on one, so the retry work under a
  burst is linear in contention rather than quadratic — the risk ADR-0004 flagged.
- The attempt bound is additive, which makes a small cap meaningful. Under Bound-1 the cap would have
  had to be large enough to be decorative.
- Ordering is a pure function of (candidates, seed) in `src/domain/candidates.ts`, so it is
  property-testable with `fast-check` and lands in the module ADR-0008's containment table assigns to
  it.
- Concurrency tests are reproducible: a seeded order plus a recorded seed makes a failing interleaving
  re-runnable, which is the difference between a flaky test and evidence.

**Bad, or deferred**

- Pruning consumes information from `err.constraint`, so the constraint **names** in the migration are
  now load-bearing behaviour, not documentation. Renaming `no_bay_overlap` silently degrades the loop
  to Bound-1 and mislabels `booking_conflicts_total{resource}`. §10 pins the names with a test.
- The cap can still produce a refusal while capacity remained — the residual spurious refusal
  ADR-0004 accepted deliberately. It is now reachable at contention depth 17 rather than at candidate
  count 17, which is a much higher bar, but it is not zero.
- Work is *not* balanced across resources: a seeded shuffle spreads contention but does not spread
  load, so one technician may end a week with more jobs than another. That is Order-D's benefit,
  knowingly given up.
- The seed must actually vary. A misconfigured deployment that seeds every request identically
  degrades to Order-A silently, with no test failing — the failure is a latency and throughput
  regression under burst, not an incorrect result.

## Pros and cons of the options

### Order-A — deterministic by id

- Good, because it is completely reproducible with no seed plumbing, and the simplest thing that
  could work.
- Good, because it makes resource allocation predictable, which a service manager might actually
  prefer.
- Bad, because it is precisely the failure ADR-0004 named: every concurrent request tries the same
  bay first, so *n* racing requests produce O(*n*²) failed attempts before *n* − 1 of them settle.
- Bad, because it concentrates all contention on the lowest-sorting resource, which is also the one
  most likely to be busy — the ordering actively selects for conflict.

### Order-B — uniform random shuffle

- Good, because it spreads contention as well as anything can, with no seed to manage.
- Bad, because a concurrency test that fails cannot be re-run on the interleaving that failed it. In a
  system whose most important tests are concurrency tests, an irreproducible ordering turns a real
  defect into a flake somebody re-runs until it passes — which is the exact mechanism by which a
  concurrency bug reaches production.
- Bad, because a global RNG inside `src/domain` would break `domain-is-pure` (ADR-0008), so the seed
  has to be injected anyway; at that point this *is* Order-C without the discipline.

### Order-C — seeded shuffle

- Good, because it spreads contention like Order-B and reproduces like Order-A.
- Good, because it keeps ordering a pure function, which is what lets it live in `src/domain` and be
  property-tested.
- Bad, because it is more machinery than either neighbour: a seed must be threaded from the request
  through the use case into the domain function.
- Bad, because the seed's variability is an untested assumption (see above).

### Order-D — load-balancing by current utilisation

- Good, because it produces the outcome the service manager stakeholder (§1.3) actually wants: bays
  and technicians used evenly rather than idle.
- Good, because it also spreads contention, since the least-loaded resource differs between requests
  as the day fills.
- Bad, because it needs an aggregate over the day's appointments on the booking path, which adds a
  query to the most latency-sensitive path to serve a goal §1.2 does not rank at all.
- Bad, because concurrent requests computing utilisation from the same snapshot agree with each other,
  so under a burst it degenerates towards Order-A's collision behaviour — it spreads load well and
  contention badly, which is the wrong way round for this decision.
- Bad, because "fairest allocation" is scheduling *policy*, and §3.3 excludes scheduling policy as
  the thing that cannot be done convincingly inside an assessment. Worth revisiting the day the
  system has a real dealership's data; §11 carries it.

### Bound-1 — prune only the failed pair

- Good, because it needs nothing from the error beyond its SQLSTATE, so it survives a query layer
  that discards `constraint`.
- Bad, because the bound is multiplicative, so the cap must be large or the bound must be trusted;
  neither is a liveness guard.
- Bad, because it re-attempts pairs already known to be impossible — a bay observed to be taken is
  tried again with every other technician.

### Bound-2 — prune by the constraint that fired

- Good, because it turns a multiplicative bound into an additive one for the price of reading one
  field off the error.
- Good, because it forces the design to use information the database already gives it, which is the
  same instinct as the rest of the system.
- Bad, because it couples the loop to constraint naming, so a migration can change behaviour without
  touching application code.
- Bad, because it is theoretically over-eager if a conflicting appointment is cancelled mid-loop —
  analysed above and accepted.
