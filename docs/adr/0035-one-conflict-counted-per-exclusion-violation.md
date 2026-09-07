---
id: "0035"
title: Count one conflict per exclusion violation, not one per contended request
status: proposed
date: 2026-09-08
supersedes: null
superseded_by: null
arc42: ["§8.4", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: architect
ai-input: >
  RAISED BY THE IMPLEMENTER at slice 09 step 4, as the third of three findings in one DCR, and
  ruled (b) — DEFERRED IMPROVEMENT — by the architect under the standing mid-slice delegation.
  PROVISIONAL until slice 09's gate; `proposed` because nothing is being changed now.

  The implementer did not ask for this. It asked whether its own reading was the intended one,
  having had to choose between two readings §8.4 does not distinguish. The gap is the
  architect's: §8.4 fixes WHAT increments the counter and never HOW MANY TIMES. Under §6 that
  makes the merged reading correct under the agreed design, and a better idea is not a blocker.
---

## Context and problem statement

`booking_conflicts_total{resource, outcome}` (§8.4) is *"the invariant, made observable"*.
`resource` is a fact about one `23P01`; `outcome` — `absorbed`, `refused`, `capped` — is a fact
about the whole request, and is not known until the request ends. Slice 09's decision 2 gives the
counter exactly one increment site.

One request can meet **more than one distinct contended resource** before it succeeds: ADR-0009's
prune drops the whole resource, so a request can conflict on a bay, be pruned onto a free bay, and
then conflict on a technician still at the head of its list. §8.4 never says what the counter does
then, and the implementer had to pick.

## Considered options

- **Option A — one increment per request, labelled by the last conflict before the terminal state.**
  What merged at slice 09.
- **Option B — one increment per `23P01`,** each labelled with that violation's own `resource`, all
  of them emitted at the single site with the request's terminal `outcome`.
- **Option C — increment at the moment of each conflict**, deferring `outcome` to a second metric.

## Decision

Chosen option: **Option B**, because it is the only reading under which the counter's own name is
true and `capped` is legible: an attempt cap is hit after *N* conflicts, and a metric that records
one of them cannot show the cap biting. `booking_attempts` already counts requests-that-met-
contention on its own axis, so Option A makes the two near-duplicates and leaves the conflict count
unmeasured.

**Not applied at slice 09.** Option A is correct under §8.4 as agreed, and Option B's only
executable form is a value assertion in `tests/integration/telemetry-booking.test.ts` — a second red
commit, which `CLAUDE.md` §7 forbids. Deferred to a backlog slice where the test leads.

## Consequences

**Good**

- The counter measures conflicts, and `resource` stops being ambiguous on a multi-resource retry.
- The single increment site survives: the per-resource tallies are buffered and emitted there.

**Bad, or deferred**

- Until this is accepted, a multi-conflict request under-reports. arc42 §11 carries it.
- A dashboard built on the shipped shape reads differently afterwards. Nothing consumes it yet.

## Pros and cons of the options

### Option A

- Good, because it needs no per-request state and cannot double-count.
- Bad, because it under-counts by construction, and `{resource}` names the *last* conflict rather
  than each one — which no reader of the metric would guess.

### Option B

- Good, because every `23P01` is counted exactly once, with its own resource and the request's
  outcome; `absorbed`/`refused`/`capped` stay distinguishable, which ADR-0004 requires.
- Bad, because the site must carry a per-resource tally through the loop.

### Option C

- Good, because the increment happens where the conflict does.
- Bad, because it drops `outcome`, and `absorbed` versus `refused` is the distinction the metric
  exists for. A second metric to recover it is two numbers where §8.4 specified one.
