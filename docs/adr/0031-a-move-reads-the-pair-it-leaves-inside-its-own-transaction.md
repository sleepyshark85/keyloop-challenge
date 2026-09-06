---
id: "0031"
title: A move reads the pair it leaves inside its own transaction
status: accepted
date: 2026-09-07
supersedes: null
superseded_by: null
arc42: ["§5.2", "§6.3"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: architect
ai-input: >
  RULED BY THE ARCHITECT at slice 07 step 5, under the human's standing delegation, and
  PROVISIONAL until this slice's gate.

  It corrects the architect's own design rather than the implementation. `07-design.md` §3
  specified the stale value in the words the implementer built, so the departure the reviewer
  reported as R-07-1 is a departure from ADR-0030, not from the design — the design and
  ADR-0030 disagreed. The reviewer's diagnosis of the false premise is accepted in full; its
  sketched deadlock chain is NOT the one that closes, and the construction that does is below.
---

## Context and problem statement

[ADR-0030](0030-a-move-locks-the-pair-it-leaves-as-well-as-the-pair-it-takes.md) requires a write
to lock **every resource it is in flight against**. `rescheduleAppointment` computes the pair it
leaves once, before the attempt loop, off the `findAppointmentById` read
[ADR-0025](0025-existence-is-the-reads-legality-is-the-statements.md) already needs, justified as
*"constant across every attempt, because every prior attempt aborted"*.

True of one request's attempts; silent about another request's commit. Any committed move of the
same row between that read and this attempt's `UPDATE` leaves the value naming a pair the row has
already left. The `UPDATE` guards only `id` and `status`, so it succeeds — and vacates the row's
**actual** pair holding no lock on it. ADR-0030's rule is then false at the one path it governs.

**The cycle that reopens** is ADR-0030's mechanism with a stale lock set in place of a missing one.
`T` moves `A` (at `bay2/tech1`, read as `bay9/tech9`) to `bay0/tech0`; `T'` moves `A'` (at
`bay0/tech3`, read as `bay8/tech8`) to `bay2/tech2`. Their advisory sets are disjoint, so both
reach their writes. `T` waits on `A'`'s entry at `bay0`, whose `xmax` is `T'`; `T'` waits on `A`'s
entry at `bay2`, whose `xmax` is `T`. `40P01`.

One stale mover plus a booking does not close, and the reason is worth keeping: a transaction can
only tuple-wait inside its **take** pair's scope, and every path that locks what it is in flight
against is already queued behind that pair's advisory lock. **Two** stale movers, one per edge.

## Considered options

| | Option | Good | Bad — decisive |
|---|---|---|---|
| **A** | **Re-read the pair inside the transaction, under the row's own lock** | The row lock makes the value stable for the rest of the transaction — nothing changes the pair without it. No new outcome | One statement per attempt; a cancel of the same row now waits behind a mover's advisory queue |
| **B** | Carry the expected pair in the `UPDATE`'s `WHERE` | One clause, no round trip; a stale mover writes nothing at all | Zero rows would mean *not confirmed* **or** *moved under us* — ADR-0025 decision 2's "exactly one thing" gone, and the follow-up read decision 3 forbids |
| **C** | Book it; four concurrent moves on two rows is rare | Keeps the slice to ADR-0030 | It is the shape this slice exists to correct. Slice 06 shipped a move path whose deadlock freedom was an argument, and 11.7 % was rare until it was measured |

**Chosen: A.**

## Decision

The pair a move leaves is **read inside the attempt's transaction, under the row's own lock**, and
handed to `lockResources` from there. That read is total — ids are minted and never client-supplied
and rows are never deleted (ADR-0003) — so it yields a pair or throws, and adds no outcome.

Lock order on the move path is now **row lock, then advisory locks, then the write**. That order is
what keeps the addition free of a new cycle: a transaction holding an advisory lock never afterwards
waits for a row lock, so the two lock kinds cannot wait on each other in both directions.

Attempt 1's **take** stays `existing`'s pair
([ADR-0027](0027-a-move-attempts-the-pair-it-already-holds-before-it-shuffles.md), unchanged):
correctness needs `leave` current, not `take`. Where the row did move underneath, attempt 1 locks
four keys instead of two — bounded, rare, correct.

## Consequences

**Good**

- ADR-0030's rule holds under every interleaving, not only where the pre-loop read still does.
- The lock set is derived from state the transaction itself observed, which is a property rather
  than a convention a caller maintains.

**Bad, or deferred**

- Three statements per attempt where a move had two. Bookings are untouched; QS-14 is a booking
  budget.
- A cancel of the same appointment waits behind a mover's advisory queue, not merely its `UPDATE`.
  Latency, not correctness; ADR-0023's one-directional wait is unchanged.

## Pros and cons of the options

### Option A

- Good, because it is the lock the `UPDATE` takes anyway, one statement earlier.
- Bad, because it holds the row across the advisory wait.

### Option B

- Good, because it is atomic and costs no round trip.
- Bad, because it makes a zero-row `UPDATE` ambiguous — the one thing ADR-0025 exists to prevent.

### Option C

- Good, because the construction needs four concurrent moves on two rows.
- Bad, because this slice's subject is that a contended move always gets a verdict.
