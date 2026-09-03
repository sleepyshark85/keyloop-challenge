---
id: "0001"
title: Validate dealership opening hours, do not model technician shifts
status: accepted
date: 2026-09-03
supersedes: null
superseded_by: null
arc42: ["§1.4", "§2.4", "§3.1", "§3.2", "§3.3", "§8", "§10", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  OVERRIDDEN (middle path taken). The architect recommended OQ-1 be answered "no —
  time is unbounded", on the grounds that any working-window rule is a second class of
  validity that the exclusion constraint does not cover. The human rejected the
  recommendation's conclusion while accepting its reasoning, and took a third option
  the architect had not separated out: validate the request against static dealership
  opening hours, model no technician shifts. The distinguishing argument is the
  human's — opening hours are decidable from the request alone, so they cannot
  reintroduce check-then-act, whereas shifts are a per-resource availability rule and
  would.
---

## Context and problem statement

§1.4 OQ-1 asked whether working time is modelled at all. It was raised as the largest scope lever in
the system, because the answer decides what the word *available* means.

If "available" means only *not already booked*, availability is entirely a property of the set of
existing appointments, and `CLAUDE.md` §2.1 has already settled how that property is enforced: the
exclusion constraint makes overlap unrepresentable, and no application code needs to be trusted. The
system will then cheerfully confirm an appointment at 03:00 on a Sunday, which violates no constraint
and is visibly naive to anyone who has ever booked a car in.

If "available" also means *within a working window*, a second class of correctness rule appears —
one the exclusion constraint does not cover. That was the architect's objection: a second rule needs
its own enforcement mechanism, and the obvious naive mechanism (read the window, decide, then write)
is the exact check-then-act shape the whole design exists to eliminate.

The objection turns out to apply unevenly across the two kinds of working-time rule, and that
asymmetry is the decision:

- **Dealership opening hours** are a static property of the *request*. Given the dealership id, the
  desired start, and the service type's duration, the answer is a pure function of reference data.
  It is decidable **without reading a single other booking**, and its answer cannot be invalidated by
  a concurrent request, because nothing a competing booker does changes when the dealership opens.
- **Technician shifts, holidays and absence** are properties of a *resource over time*. They are
  per-technician and they interact with allocation — the eligible-candidate set becomes time-dependent
  in the same way as the already-booked set. That genuinely is a second availability rule, sitting
  next to the one the database enforces, and needing its own mechanism and its own quality scenario.

A time-of-day rule also has a timezone consequence that a purely instant-based system does not: A-8
takes the boundary and the storage to be absolute instants, which is what makes the overlap invariant
immune to DST bugs. Opening hours are stated in a dealership's *local* wall-clock time. Answering
this question yes for opening hours makes A-8 load-bearing and puts an IANA zone on the dealership.

## Considered options

- **Option A — Unbounded time.** No working-window rule of any kind. Validity is non-overlap and
  nothing else. *(The architect's recommendation.)*
- **Option B — Opening-hours validation only.** Each dealership carries opening hours as reference
  data. A booking whose derived interval falls outside them is rejected as an invalid request.
  Technician shifts, holidays and absence are not modelled.
- **Option C — Full working-calendar modelling.** Dealership opening hours *plus* technician shift
  patterns, holidays and absence. "Available" means not booked **and** on shift **and** the dealership
  is open.

## Decision

Chosen option: **Option B — opening-hours validation only**, because it removes the visibly absurd
behaviour of Option A at a cost that provably cannot touch the concurrency invariant, while Option C's
cost is a whole second class of availability rule that the exclusion constraint does not cover.

The load-bearing part of this decision is *why validating opening hours is not a retreat from
`CLAUDE.md` §2.1*, and it must survive into the implementation unmangled:

> Opening hours are a **static property of the request**. The check reads reference data about the
> dealership and nothing about any other booking. Its result cannot be invalidated by a concurrent
> request, so there is no window between check and act for anything to change in. It is validation,
> in the same category as "the end must follow the start" — not an availability check.
>
> **Availability and contention remain entirely the database's business.** Nothing in this ADR
> permits application code to decide whether a bay or a technician is free.

Consequently the failure is a **`400 Bad Request`**, not a `409 Conflict`. A `409` means *the world
was contended*; a request outside opening hours would have been invalid on an empty database and at
any hour of any day. Conflating the two would corrupt `booking_conflicts_total` (§1.2 goal 4) as a
signal, which is the second reason to keep the two codes apart.

Scope of the rule, so the implementation is not left guessing:

- The **whole derived interval** must fall within opening hours — both the start and the end derived
  from the service type's duration (A-1). A job that starts twenty minutes before closing and runs an
  hour past it is rejected.
- Opening hours are per dealership and per day of week, held as seeded reference data (A-6, A-7).
  They are not managed through the API.
- The dealership carries an IANA time zone. Comparison is: convert the request's instant into the
  dealership's local time, then compare wall-clock. The boundary and the storage stay instants (A-8).
- Closures, public holidays and one-off exceptions are **not** modelled. A dealership is open on the
  same hours every week of the year.

Rescheduling (ADR-0003) validates the new interval by the same rule; the retry loop (ADR-0004) does
not re-check it, because the rule is a property of the request and not of the candidate.

## Consequences

**Good**

- The system no longer books at 03:00, and the rule that stops it is a pure function that a unit test
  can exercise without a database at all.
- Quality goal 1 is untouched. There is exactly one class of availability rule and the database owns
  it, so §10's concurrency scenarios need no companion.
- The rejection is cheap and early: it needs no candidate query, so an out-of-hours request costs one
  reference-data read.
- A-8's instants-at-the-boundary reading is vindicated rather than complicated — the zone lives on the
  dealership, not in the API contract.

**Bad, or deferred**

- A technician can still be booked outside their personal working hours; a dealership open 08:00–18:00
  will book 08:00 whether or not anyone is rostered. This is a real limitation and §11 must carry it.
- Holidays and one-off closures are absent, so a dealership shut on 25 December will accept bookings.
- Reference data gains two fields (opening hours, IANA zone) that A-6's seed and A-7's "no reference
  CRUD" must now cover.
- Wall-clock comparison against a zone is the one place in the system where a DST transition can bite
  — a dealership opening at 09:00 local is a different instant twice a year. §10 should carry a
  scenario across a DST boundary at Gate B.

## Pros and cons of the options

### Option A — Unbounded time

- Good, because it is the smallest possible answer and leaves exactly one notion of validity, wholly
  owned by the database.
- Good, because it removes the timezone question entirely — no wall-clock comparison exists anywhere.
- Bad, because a scheduler that confirms 03:00 on a Sunday is not credible as a replacement for a
  paper diary, and the assessment's readers will notice within one cURL call.
- Bad, because the argument for it ("a second rule is dangerous") over-generalises: it treats a
  request-local validation and a resource-availability rule as the same risk when they are not.

### Option B — Opening-hours validation only

- Good, because it is decidable from the request alone, so it cannot reintroduce check-then-act — the
  property that made the objection to Option C valid simply does not hold here.
- Good, because it buys the visible half of the credibility for a fraction of the model: two fields on
  one reference entity, no new tables, no new relationships.
- Good, because the failure mode is a plain `400` on a path that never touches contention, keeping the
  `409` signal clean.
- Bad, because it is a *partial* answer, and a partial answer invites the reasonable objection "you
  modelled the dealership's calendar but not the technician's" — which is answered honestly in §11
  rather than hidden.
- Bad, because it introduces the only wall-clock/zone reasoning in the system, and zone bugs are
  notoriously easy to write and hard to see.

### Option C — Full working-calendar modelling

- Good, because "available" would mean what a service manager means by it, and the system could be
  used to run an actual day.
- Bad, because shift and absence data is per-resource and time-varying, so it lands in the candidate
  query and makes eligibility a second, application-enforced availability rule sitting beside the
  database-enforced one. That rule needs its own mechanism, its own quality scenario and its own
  concurrency story, or it is precisely the loophole `CLAUDE.md` §2.1 exists to close.
- Bad, because shift patterns, rotations, holiday entitlement and absence are a scheduling domain in
  their own right — plausibly larger than the booking domain being assessed — and would consume the
  human review attention that `CLAUDE.md` §8 names as the scarce resource.
- Bad, because it would be the first place in the design where the exclusion constraint stops being
  the whole correctness story, and that dilution is expensive to explain and easy to get wrong.
