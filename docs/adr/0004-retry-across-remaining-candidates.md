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

§1.4 OQ-4 is the sharpest interaction between the brief and the standing invariant, and it is an
acceptance-criteria question rather than an architecture one.

Because `CLAUDE.md` §2.1 forbids check-then-act, the booking path cannot ask "is bay 3 free?" and then
act on the answer. What it does instead is: form a set of candidate *(bay, technician)* pairs that
look plausible, pick one, and **attempt the write**. The database is the only thing that decides
whether the slot was actually free, by accepting the write or raising SQLSTATE `23P01`.

That leaves a genuine behavioural choice with an observable consequence. Suppose a dealership has
bays 1 and 2 free, and two requests arrive at the same instant. Both read the same advisory candidate
list, both pick bay 1, and one of them loses on `23P01` — while bay 2 sat empty the whole time. The
loser can be told `409 Conflict`, which is a refusal *the physical world did not require*: there was
capacity, and the system declined the booking because of how it happened to pick. The service manager
in §1.3 has an explicit interest here — bays and technicians should not be left idle by a scheduler
that refuses bookings it could have accepted.

The alternative is to try the next candidate. That is more code on the hot path and it needs a bound,
but it makes the refusal mean what a caller will read it as meaning: *there was nothing free*.

## Considered options

- **Option A — Refuse immediately.** The first `23P01` becomes a `409`. One attempt per request.
- **Option B — Retry across the remaining candidates from the single advisory read, then refuse.**
  *(The architect's recommendation.)*
- **Option C — Retry with a fresh candidate read after each failure.** On `23P01`, re-query
  availability and try again with up-to-date information.
- **Option D — Serialise bookings per dealership.** Take a per-dealership advisory lock (or run at
  `SERIALIZABLE`) around read-then-write, so no two bookings for one dealership interleave and a
  spurious refusal cannot arise.

## Decision

Chosen option: **Option B — on `23P01`, attempt the next candidate; refuse only when the candidate
list is exhausted.**

### This is not check-then-act, and here is precisely why

The distinction is the whole reason this option is admissible under `CLAUDE.md` §2.1, so it is stated
rather than implied:

> **The candidate read is advisory and stays advisory.** Nothing in the booking path treats "this
> candidate appeared free" as permission to book. Correctness comes from the write, always: a booking
> exists if and only if PostgreSQL accepted an insert (or, for a move, an update — ADR-0003) that the
> exclusion constraint let through. The candidate list only decides **which write is attempted next**,
> never **whether a write is allowed**.

Check-then-act is a read whose result is *trusted*. This is a read whose result is a *suggestion*, and
whose every suggestion is submitted to the database for adjudication. A candidate list that is
entirely stale produces extra failed attempts and then a refusal; it can never produce a double
booking. That is the property that makes retrying safe, and it is the property a reviewer should check
any implementation of this path against.

### The bound

An unbounded retry against a contended resource is a livelock, so the retry is bounded three ways and
the implementation must satisfy all three:

1. **The candidate list is read once per request.** It is not refreshed on failure (that is Option C,
   and it is what makes a loop unbounded).
2. **Each candidate is attempted at most once.** The remaining set strictly decreases with every
   attempt, so the loop terminates after at most `|candidates|` attempts, which is finite by
   construction — bays × qualified technicians at one dealership, single digits by tens (§1.1).
3. **A hard cap on attempts, independent of the list size.** The loop stops after a configured maximum
   number of attempts even if candidates remain, so no reference-data shape can turn one request into
   a long-running one. Exceeding the cap is treated identically to exhaustion. The cap's *value* is a
   Gate B parameter; its *existence* is fixed here.

Exhaustion (or the cap) produces **`409 Conflict`**, naming which resource class was contended so the
advisor can offer an alternative without re-querying (§1.3).

### Supporting rules

- **Only `23P01` retries.** Any other SQLSTATE surfaces as itself — a foreign-key violation means bad
  references (A-6) and is a client error, not contention, and must never be swallowed by the loop.
- **Each attempt is independently recoverable.** A constraint violation aborts the enclosing
  transaction, so an attempt must run in its own transaction or behind a savepoint. A loop wrapped in
  a single transaction without savepoints fails on the second attempt for the wrong reason, and it is
  a mistake that looks like it works until the first conflict.
- **Validation is not repeated.** Opening hours (ADR-0001) and reference integrity are properties of
  the request, decided once before the loop; the loop varies only the candidate.
- **Rescheduling uses the same policy**, with the `UPDATE` of ADR-0003 as the attempted write.
- **Every conflict is observable.** `booking_conflicts_total{resource}` counts each `23P01`, and an
  absorbed conflict (retried successfully) must be distinguishable from a refusal after exhaustion —
  they are different signals, and conflating them would make the metric unreadable at exactly the
  moment it matters.
- **Candidate ordering is an architecture decision** for Gate B, not a Gate A ruling. It is called out
  because it interacts with this one: if every concurrent request orders candidates identically, they
  all collide on the first candidate, then all collide on the second, and the retry work grows with
  the square of the contention while still remaining correct and bounded.

### What §10 must assert at Gate B

Two scenarios, not one — this option is only worth its cost if both hold:

- **No overlap.** Under any interleaving of concurrent requests, no two non-cancelled appointments
  share a bay, or share a technician, with overlapping intervals.
- **No spurious refusal.** Given *N* concurrent requests for one interval at a dealership with *M*
  free candidates, exactly `min(N, M)` are confirmed. A refusal while capacity remained is a failure
  of this scenario.

## Consequences

**Good**

- A `409` comes to mean *the dealership had nothing free*, which is what the caller will read it as.
  Under Option A it would have meant *something was free, but we guessed badly*.
- Capacity is actually used under burst load — the 08:00-on-Saturday case in §1.1 that motivates the
  whole design.
- `booking_conflicts_total` becomes a real signal: a conflict now records genuine contention rather
  than an artefact of candidate selection.
- The invariant stays exactly where `CLAUDE.md` §2.1 put it. This decision adds a policy above the
  database and changes nothing about how correctness is enforced.

**Bad, or deferred**

- The booking path is materially more complex than a single insert: a loop, per-attempt transaction
  scoping, SQLSTATE discrimination, and a cap. That complexity is the reason for the two mandated
  quality scenarios rather than one.
- Latency under contention is worse: a losing request may perform several round trips before it either
  succeeds or is refused. Consistent with §1.2 ranking performance last, and bounded by the cap.
- Retry work grows with the square of concurrency in the worst case if candidate ordering is uniform
  across requests. Bounded, but §11 should carry it with the ordering decision.
- The cap introduces a rare outcome — refused while candidates remained — that is a spurious refusal
  by the definition above. It is accepted deliberately as a liveness guard, and the cap must be set
  well above any plausible candidate count so it is unreachable in practice rather than merely rare.

## Pros and cons of the options

### Option A — Refuse immediately

- Good, because the booking path stays a single attempt: read candidates, insert, map `23P01` to
  `409`. It is the smallest correct implementation and the easiest to review.
- Good, because no bound, no savepoint discipline and no cap are needed — three ways to get it wrong
  that simply do not exist.
- Bad, because it refuses bookings the dealership could have honoured, which the service manager
  stakeholder explicitly objects to, and does so precisely when demand is highest.
- Bad, because it makes `409` ambiguous between "no capacity" and "unlucky selection", degrading both
  the API's meaning and the conflict metric.

### Option B — Retry across the remaining candidates, then refuse

- Good, because it removes the spurious refusal while leaving the correctness mechanism untouched:
  every attempt is still adjudicated by the database.
- Good, because it terminates by construction — the candidate set is finite, read once, and strictly
  decreases — so the bound needs no reasoning about timing or backoff.
- Good, because the resulting `409` is honest, and the conflict metric measures contention rather than
  selection strategy.
- Bad, because it is more code on the most safety-critical path in the system, and the per-attempt
  transaction scoping is a subtle requirement an implementer can miss.
- Bad, because it needs a second quality scenario (no spurious refusal) that is harder to write than
  the first, since it asserts something the system *did* do rather than something it did not.

### Option C — Retry with a fresh candidate read each time

- Good, because each attempt uses the freshest information, so it would in principle waste fewer
  attempts than a stale list.
- Bad, because it has no natural bound: under sustained contention the read can keep returning
  candidates that are taken by the time the write lands, and the loop becomes a livelock that needs an
  artificial attempt limit or backoff to stop.
- Bad, because it is the variant that most *resembles* check-then-act — a read-write-read-write loop
  that appears to be reacting to observed availability — and would make the design harder to defend
  even though a strict reading keeps the read advisory.
- Bad, because it multiplies database round trips on the contended path for a benefit that is
  marginal at this scale, where the candidate set is small enough that a stale list is nearly as good
  as a fresh one.

### Option D — Serialise bookings per dealership

- Good, because it eliminates spurious refusals completely and deterministically, with no retry, no
  bound and no cap.
- Good, and honestly so: under a per-dealership lock (or true `SERIALIZABLE`) a check-then-act
  implementation would actually be *correct*, which is why this option cannot be dismissed as naive.
- Bad, because it moves correctness back into application code and lock discipline. The guarantee then
  rests on every write path remembering to take the lock; one missed call site and the invariant is
  silently gone. The exclusion constraint holds regardless of who writes, or how — which is the entire
  argument of `CLAUDE.md` §2.1, and this option contradicts it.
- Bad, because it caps a dealership's booking throughput at one at a time, converting the design's
  cheapest resource (§1.2 goal 5, deliberately ranked last but with headroom to spare) into a hard
  serialisation point.
- Bad, because it would be a standing invariant overturned by a policy decision, which is not a thing
  Gate A may do (`CLAUDE.md` §2, OC-4).
