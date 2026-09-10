---
id: "0040"
title: Order candidates free-first from one advisory read, and keep the cap at 16
status: proposed
date: 2026-09-10
supersedes: "0009"
superseded_by: null
arc42: ["§4.1", "§5.2", "§6.2", "§8.4", "§10", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  THE HUMAN RAISED THE QUESTION, NOT THE ANSWER: why is occupancy not read before candidates are
  chosen, given three round trips per attempt. The orchestrator derived the consequence the
  question implied — that the cap is sized against contention depth alone — and produced both
  measurements: a 2,000-seed simulation of `attemptLoop.ts`'s semantics, then an executed run
  against real PostgreSQL (35 of 200 single-threaded bookings refused with capacity free).
  The architect ruled the DCR (b), narrowed the finding, struck two false claims from the
  orchestrator's draft, and authored this record.

  RATIFIED UNDER STANDING MID-SLICE DELEGATION WITH THE HUMAN AFK, WHICH IS WHY THIS IS
  `proposed` AND NOT `accepted`. No human has yet seen the option set. It is a technical-debt
  item in §11.1 until the gate rules on it, and the gate may reject it in favour of the option
  this record rejects on latency — one config value away.

  NOT A NEW SHAPE. The same remedy was fixed in ADR-0033 at slice 08 step 1, retired in the
  2026-09-07 cull with its decision rehomed to `docs/slices/08-design.md`, and declined at slice
  09 step 5 with a stated reopening criterion: "reopen only on a measurement". This is that
  measurement arriving, not a preference returning.
---

## Context and problem statement

ADR-0009 sized the cap against **contention depth**, *"the only driver Bound-2 leaves"*. That is
false. Bound-2 spends one attempt per **busy candidate resource discovered** and cannot tell a
resource a racer took microseconds ago from one booked last week: occupancy is a second driver,
independent of concurrency and additive with it.

Executed at 12 bays and 12 technicians, 11 pairs confirmed, **zero concurrency**: **35 of 200 seeds
refused `409` with one bay and one technician free.** §11 R-4 has said so since slice 04 and the code
is faithful to it — the **magnitude** is new. One-in-a-thousand and one-in-six are different
decisions in the same words, and §4.1 promises the first.

## Considered options

| Option | Argued |
|---|---|
| **Nothing — keep the residual** | Good: documented (§11 R-4), the code faithful to it. Bad: §4.1 promises the opposite inside the single source of truth, and 17.5 % is not a residual chosen knowing it |
| **Refresh-1 — re-read occupancy between attempts** | Good: the only option answering the burst residual. Bad: a round trip on every retry, on the contended path where latency hurts most; Bound-2 already prunes what conflicted, so it buys only the remainder's *order* |
| **Cap-1 — raise `BOOKING_ATTEMPT_CAP` to `|bays| + |technicians|` or above** | Good: it **works, and structurally** — Bound-2 guarantees a list empties by then, so the refusal is unreachable rather than unlikely; one config value, no code. Bad: the cap is a **latency** guard while Bound-2 already bounds termination, so at 40 a worst-case refusal costs 40 attempts of three round trips — the answer a client waits longest for. **Rejected on that cost alone; it stays available to the gate** |
| **Order-E — one advisory read, ordering free-first, membership unchanged. Chosen** | Good: spends the cap on candidates that might succeed — the *cause* — and never changes membership, so no exit's reachability moves. Bad: racers agree at binary granularity (Order-D's objection); replay needs the snapshot |
| **Filter-1 — remove busy candidates** (ADR-0033's refused option, kept as evidence) | Good: the obvious implementation, cheapest to write. Bad: a removing read can empty the list, which §6.2 routes to `500`/`422` and never `409` — a `500` for a merely full dealership, or a `409` minted from a read, which ADR-0016 forbids. §2.1's shape, `if` in the query planner |


## Decision

Chosen option: **Order-E, with the cap unchanged at 16.**

`bookAppointment` reads occupancy once, over the interval the constraint will see, and passes it to
`orderCandidates`, which partitions each list free-then-busy and shuffles **within** each group on
one seeded stream. Membership is invariant, so the `null` exit keeps both meanings and the `INSERT`
stays the only adjudicator: a wrong snapshot costs **attempts** and cannot itself refuse — hence
`capped` unlikely rather than impossible, below.

**ADR-0009's rejection of Order-D is reopened rather than left standing**: free-first *is* Order-D at
binary granularity. What stays given up is continuous utilisation ordering, and Order-D's objection
comes with it, as the residual below.

## Consequences

**Good**

- A `409` means what §4.1 says it means, at the occupancy that refused 35/200.
- Ordering stays pure: `busy` arrives as a parameter, `domain-is-pure` letting nothing in.

**Bad, or deferred**

- **Two of ADR-0009's consequences become false.** *"the residual … now at depth 17"*: it was at
  **occupancy** 17 too, with no concurrency. And *"work is not balanced across resources … knowingly
  given up"*: now partly taken. A third weakens — a recorded seed no longer reproduces a run alone,
  the permutation depending on the snapshot.
- **`capped` becomes unlikely, not impossible.** Attempt 16 needs fifteen conflicts among candidates
  the snapshot called free: restored **probabilistically**, Cap-1 structurally.
- **The residual this record does not close.** Under a burst every racer reads the same snapshot, so
  each loser front-loads what the winners took. Refresh-1 answers it, refused on Cap-1's latency
  argument. **QS-16 was its falsifier** and did not fail — `min(N, M)` exactly, at all four tuples.
  Unfalsified, not absent.
- **A conflict is no longer constructible single-threaded while capacity exists.** `busyResources`
  shares the constraint's predicate, scope and `status <> 'cancelled'` filter, and `A-4` makes the
  intervals identical, so free-first heads both lists with a free resource whenever one exists. The
  alignment is the mechanism working; its cost falls on **evidence** — a retry waterfall now needs a
  refusal or real concurrency, and **QS-13 is re-sourced** accordingly.
- One extra `SELECT` on the booking path; QS-14 re-measured green.
