---
id: "0033"
title: The advisory read orders candidates; it never removes them
status: proposed
date: 2026-09-07
supersedes: null
superseded_by: null
arc42: ["§6.2", "§11.2"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: architect
ai-input: >
  RULED BY THE ARCHITECT at slice 08 step 1, disposing of I-04-5. Offered `proposed` for ADR-0019's
  own reason: it decides the SHAPE of work landing in another slice, and a shape invented while
  deferring is what a rationalisation looks like. Slice 09 accepts or supersedes it on measurement.
  The human's cap of 16 (ADR-0009, Gate B) is untouched — deliberately: D-04-1's other half was
  declined at slice 04 and this record shows it need not be reopened.
---

## Context and problem statement

I-04-5 put the advisory pre-filter *behind* QS-8. QS-8 is slice 08's, so its shape is now decidable —
and the word *filter* turns out to be wrong.

**D-04-1** (§11 R-4) is what it is for: the cap sits below the structural bound, so a refusal can hide
a free bay and `capped` signals nothing. Slice 09's **AC-13** — an uncontended booking issues **exactly
one** `INSERT` against 5 bays, 20 technicians and 500 appointments — cannot pass while a blind shuffle
picks first.

**The trap.** A pre-filter that *removes* busy candidates can empty the list, and `orderCandidates`
returns `null` for empty — which §6.2 routes to `500` (no bay) or `422` (no qualified technician),
**never** `409`, because [ADR-0016](0016-a-capacity-refusal-requires-a-database-verdict.md) requires a
capacity refusal to carry a resource PostgreSQL minted. Both exits are wrong: `500`/`422` for a
a merely full dealership, or a `409` minted from a read — `CLAUDE.md` §2.1's forbidden shape with the
`if` moved into a query planner.

Ordering has no such exit. It cannot empty a list.

## Considered options

- **A — filter, falling back to the unfiltered list when it empties.**
- **B — filter, refusing when it empties.**
- **C — order free-first; never remove.**
- **D — raise the cap above the bound instead.**

## Decision

Chosen option: **C**. `busyResources` (ADR-0032) is read once on the booking path and its answer
**biases ADR-0009's shuffle**: candidates reported free are shuffled among themselves and placed ahead
of the rest, shuffled among themselves. *Membership* is unchanged, so every §6.2 branch keeps today's
reachability and no refusal exit moves.

**AC-13 then follows deductively.** Uncontended means quiescent; under quiescence QS-8 says a pair
reported free is accepted by an `INSERT`; free-first makes that pair attempt 1. One `INSERT`. The chain
runs through QS-8 — which is why I-04-5 was right that this could not ship before it.

**It also restores the `capped` counter's meaning**, R-4's second half: capacity that exists is now at
attempt 1, so a `capped` refusal means sixteen attempts each lost a race — genuine contention, which is
what ADR-0009 wanted it to signal. The cap returns to being ADR-0004's liveness guard, at the human's
number.

**Placement:** `src/application`, after F-06-1 extracts the loop `bookAppointment` and
`rescheduleAppointment` each carry — one site, not two. Slice 08's design argues that against
ADR-0019's criterion; R-4 carries it meanwhile.

## Consequences

**Good**

- ADR-0016 is untouched: the read cannot reach a refusal exit, so every refusal still carries `23P01`.
- ADR-0009's cap and the human's 16 are untouched — D-04-1's declined half stops mattering.
- A stale ordering costs an attempt, never an answer; the worst case is today's behaviour.

**Bad, or deferred**

- Ordering is stale under contention, so a `capped` refusal can still be spurious when sixteen racers
  each take a free resource. Contention rather than a bad guess — the residual R-4 keeps.
- One extra read on every booking, including those that would have hit attempt 1 anyway. AC-13 measures
  the p95 paying for it.
- The deductive chain rests on QS-8 holding over the **same window the booking occupies**, so the read
  must be issued for that occupancy interval and never for a wider convenience window (§6.5). Stated
  here because it is the one way to build this correctly-shaped and still wrong.

## Pros and cons of the options

### A — filter with fallback

- Good, because the common path gets the shortest possible candidate list.
- Bad, because the fallback is reachable only when read and constraint disagree about *everything* —
  least exercised, most likely wrong. C gets the same first attempt with no branch.

### B — filter and refuse

- Good, because it is the fastest refusal available.
- Bad, because ADR-0016 and `CLAUDE.md` §2.1 forbid it. Listed to be refusable, not because it was
  close.

### C — order, never remove

- Good, for the reasons above; the mechanism exists already — ADR-0009's shuffle is the seam.
- Bad, because it never shortens the loop, so a genuinely full dealership still burns the cap — a
  latency cost on the path that is already refusing.

### D — raise the cap

- Good, because it is one number and closes R-4's first half outright.
- Bad, because the number is the human's (Gate B), and it fixes nothing for AC-13: a blind shuffle over
  25 resources with 500 appointments still issues more than one `INSERT`. The cap was never AC-13's
  obstacle; the blindness was.
