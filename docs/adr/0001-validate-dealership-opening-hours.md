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

A service advisor books a car in for 03:00 on a Sunday and the system confirms it: the dealership is
shut, nobody is there, and *available* has so far meant only *not already booked*.

Making it mean *within a working window* too is the largest scope lever in the brief. It adds a
second class of correctness rule the exclusion constraint does not cover, and the naive way to
enforce one — read the window, decide, then write — is the check-then-act shape this system exists
to eliminate. The objection applies unevenly, and the asymmetry is the decision:

- **Dealership opening hours** are a static property of the *request* — a pure function of reference
  data, decidable **without reading any other booking**.
- **Technician shifts, holidays and absence** are properties of a *resource over time*:
  per-technician, interacting with allocation — a genuine second availability rule.

## Considered options

- **Option A — Unbounded time.** No working-window rule of any kind.
  - Good, because it is the smallest possible answer
  - Good, because it removes the timezone question entirely
  - Bad, because a scheduler that confirms 03:00 on a Sunday is not credible
  - Bad, because the argument for it ("a second rule is dangerous") over-generalises
- **Option B — Opening-hours validation only.**
  **Chosen.**
  - Good, because it is decidable from the request alone, so it cannot reintroduce check-then-act
  - Good, because it buys the visible half of the credibility
  - Good, because the failure mode is a plain `400`
  - Bad, because it is a *partial* answer: the technician half stays unmodelled
  - Bad, because it introduces the only wall-clock/zone reasoning in the system
- **Option C — Full working-calendar modelling.**
  - Good, because "available" would mean what a service manager means
  - Bad, because shift and absence data is per-resource and time-varying
    — a second, application-enforced availability rule beside the database's.
  - Bad, because shift patterns, rotations, holiday entitlement and absence are a scheduling domain
  - Bad, because it would be the first place in the design
    where the exclusion constraint stops being the whole story.

## Decision

Chosen option: **Option B — opening-hours validation only**, because it removes the visibly absurd
behaviour of Option A at a cost that provably cannot touch the concurrency invariant, while Option C's
cost is a second class of availability rule the constraint does not cover.

Why this does not reintroduce check-then-act:

> Opening hours are a **static property of the request**: the check reads reference data and nothing
> about any other booking, so no concurrent request can invalidate it: no window between check
> and act. It is validation, like "the end must follow the start". **Availability and
> contention remain entirely the database's business.**

The failure is therefore **`400`**, not `409`: an out-of-hours request is invalid on an empty
database at any hour, and conflating it with contention corrupts the conflict metric.

- The **whole derived interval** must fall within opening hours, both the start and the end
  derived from the service type's duration.
- Opening hours are per dealership and per day of week, held as seeded reference data that no
  endpoint can create or edit.
- The dealership carries an IANA time zone; comparison converts the request's instant into the
  dealership's local time.
- Closures, public holidays and one-off exceptions are **not** modelled.
- **Technician shifts, holidays and absence are not modelled.**

Moving an appointment applies the same rule; the retry loop does not re-check it — a property of
the request, not the candidate.

## Consequences

**Good**

- The system no longer books at 03:00, and the rule that stops it is a pure function a unit test
  can exercise without a database.
- Nothing about contention changes: there is one class of availability rule, and the database
  owns it.
- The rejection is cheap and early: it needs no candidate query
- Treating an instant exactly on the boundary as inside the window is vindicated rather than
  complicated

**Bad, or deferred**

- A technician can still be booked outside their personal working hours
  — a real limitation, carried as debt.
- Holidays and one-off closures are absent, so a dealership shut on 25 December will accept
  bookings.
- Reference data gains opening hours and an IANA zone, which the seed must supply.
- Wall-clock comparison against a zone is the one place a DST transition can bite, so a
  DST-boundary quality scenario is owed.
