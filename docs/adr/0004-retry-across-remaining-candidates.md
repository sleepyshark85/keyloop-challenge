---
id: "0004"
title: On exclusion violation, try the next candidate and refuse only when the list is exhausted
status: accepted
date: 2026-09-03
supersedes: null
superseded_by: null
arc42: ["§1.4", "§3.2", "§5", "§6", "§8", "§10", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  ACCEPTED as recommended. The architect recommended OQ-4 be answered "retry across
  remaining candidates, then refuse", noting the cost — a more complex booking path
  and a quality scenario that must assert both no-overlap and no-spurious-refusal.
  The human accepted it and added two explicit conditions to the record: that the
  ADR state that the candidate read remains advisory, so this is not check-then-act;
  and that it state a bound on the retry so a pathological case cannot loop.
---

## Context and problem statement

§1.4 OQ-4 is an acceptance-criteria question. §2.1 forbids check-then-act, so the booking path forms
candidate *(bay, technician)* pairs, picks one and **attempts the write**; the database decides.

Bays 1 and 2 are free, two requests arrive together, both pick bay 1, and the loser gets a `409`
**while bay 2 sat empty** — a refusal the physical world did not require, which §1.3's service
manager objects to.

## Considered options

- **Option A — Refuse immediately.** The first `23P01` becomes a `409`.
  - Good, because the booking path stays a single attempt
  - Good, because no bound, no savepoint discipline and no cap are needed
  - Bad, because it refuses bookings the dealership could have honoured
  - Bad, because it makes `409` ambiguous between "no capacity" and "unlucky selection"
- **Option B — Retry across the remaining candidates from the single advisory read, then refuse.**
  *(The architect's recommendation.)* **Chosen.**
  - Good, because it removes the spurious refusal
  - Good, because it terminates by construction
  - Good, because the resulting `409` is honest
  - Bad, because it is more code on the most safety-critical path
  - Bad, because it needs a second quality scenario
- **Option C — Retry with a fresh candidate read after each failure.** On `23P01`, re-query
  availability.
  - Good, because each attempt uses the freshest information
  - Bad, because it has no natural bound: under sustained contention the read can keep returning
    candidates already taken.
  - Bad, because it is the variant that most *resembles* check-then-act
  - Bad, because it multiplies database round trips
- **Option D — Serialise bookings per dealership.** Take a per-dealership advisory lock (or run
  at `SERIALIZABLE`).
  - Good, because it eliminates spurious refusals
  - Good, and honestly so: under a per-dealership lock (or true `SERIALIZABLE`) a check-then-act
    implementation would be *correct*.
  - Bad, because it moves correctness back into application code and lock discipline
  - Bad, because it caps a dealership's booking throughput
  - Bad, because it would be a standing invariant overturned by a policy decision

## Decision

Chosen option: **Option B — on `23P01`, attempt the next candidate; refuse only when the candidate
list is exhausted.**

> **The candidate read is advisory and stays advisory.** A booking exists if and only if PostgreSQL
> accepted the write. The list decides **which write is attempted next**, never **whether a write is
> allowed** — a stale list costs attempts, never a double booking.

### The bound

The list is **read once per request**, never refreshed on failure. **Each candidate is attempted at
most once**, so the loop ends within
`|candidates|` attempts (§1.1). A **hard cap** stops it even if candidates remain; its *value*
is a Gate B parameter, its *existence* fixed here. Exhaustion or cap produces **`409`**, naming
the contended resource class (§1.3).

### Supporting rules

- **Only `23P01` retries.** Any other SQLSTATE surfaces as itself — a foreign-key violation means
  bad references (A-6).
- **Each attempt is independently recoverable.** A constraint violation aborts the enclosing
  transaction, so each needs its own transaction or a savepoint.
- **Validation is not repeated.** Opening hours (ADR-0001) and reference integrity are properties
  of the request.
- **Rescheduling uses the same policy**, with the `UPDATE` of ADR-0003 as the attempted write.
- **Every conflict is observable.** `booking_conflicts_total{resource}` counts each `23P01`, and an
  absorbed conflict must be distinguishable from a refusal.
- **Candidate ordering is an architecture decision** for Gate B, not a Gate A ruling. It is called
  out because identical ordering makes requests collide.

### What §10 must assert at Gate B

- **No overlap.** Under any interleaving of concurrent requests, no two non-cancelled appointments
  share a bay, or a technician, with overlapping intervals.
- **No spurious refusal.** Given *N* concurrent requests for one interval at a dealership with *M*
  free candidates, exactly `min(N, M)` are confirmed.

## Consequences

**Good**

- A `409` comes to mean *the dealership had nothing free*, which is what the caller will read it
  as.
- Capacity is actually used under burst load — the 08:00-on-Saturday case
- `booking_conflicts_total` becomes a real signal
- The invariant stays exactly where `CLAUDE.md` §2.1 put it.

**Bad, or deferred**

- The booking path is materially more complex than a single insert: a loop, per-attempt transaction
  scoping, a cap.
- Latency under contention is worse
- Retry work grows with the square of concurrency in the worst case if candidate ordering is
  uniform.
- The cap introduces a rare outcome — refused while candidates remained — that is a spurious
  refusal, accepted as a liveness guard.
