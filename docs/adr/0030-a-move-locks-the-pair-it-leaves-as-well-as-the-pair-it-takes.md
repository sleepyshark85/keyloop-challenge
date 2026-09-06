---
id: "0030"
title: A move locks the pair it leaves as well as the pair it takes
status: accepted
date: 2026-09-07
supersedes: null
superseded_by: null
arc42: ["§5.2", "§6.1", "§6.3", "§8.6", "§10", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: architect
ai-input: >
  RULED BY THE ARCHITECT at slice 07 step 1, under the human's standing delegation, and
  PROVISIONAL until this slice's gate.

  It is a NEGATIVE RESULT against the architect's own argument. `F-02-9`'s slice-07 half asked
  for ADR-0018's locks to be RACED rather than argued, and the slice-06 discharge ruling had
  already written the extension out: "on attempts >= 2 a move vacates its incumbent pair while
  holding only the target pair's locks... no cycle is possible, because vacating writes no index
  entry another transaction waits on". That reasoning is WRONG, and the error is one line of
  PostgreSQL: the vacated version's OLD index entry stays live until commit, and ADR-0023's own
  M1 measured that a conflicting writer WAITS on it. A move is both a waiter and a wait-upon, so
  it can close a cycle. Measured before it was designed around.
---

## Context and problem statement

[ADR-0018](0018-lock-the-bay-and-the-technician-before-each-insert.md) is titled *before each
insert*, and an insert is in flight against one pair. Under
[ADR-0027](0027-a-move-attempts-the-pair-it-already-holds-before-it-shuffles.md) a move's attempts
from 2 onward target a **different** pair while the row still occupies its incumbent, so a move is
in flight against two. Its exclusion check can wait on another writer; another writer's check can
wait on **its** vacated entry. Two such moves cycle.

Measured on `postgres:16-alpine` against this repository's constraints — 20 mutually-vacating move
pairs from one barrier, 25 trials, every advisory lock taken:

| Locks a move takes | Verdicts (`23P01`) | `40P01` | Deadlock rate |
|---|---|---|---|
| the **target** pair — as built at slice 06 | 883 / 1000 | **117** | **11.7 %** |
| the **union** of the incumbent and target pairs | **1000 / 1000** | 0 | 0 % |

The report is a mutual `ShareLock on transaction`, not an advisory key: no path skipped anything.
Uncontended cost is unchanged — 600 moves, p50 2.25 ms against 1.90 ms, one statement either way.

## Considered options

| | Option | Good | Bad — decisive |
|---|---|---|---|
| **A** | Leave it; book the `500` as debt | Keeps slice 07 proof-only, as its gate allowed | 11.7 % is not a corner: an advisor rescheduling into a busy day gets an internal-fault page that §8.6 renders as the system's fault, which it now is; §11 would carry a defect this slice measured and could close |
| **B** | Retry `40P01` on the move path | No lock change, no new rule | ADR-0018 measured retry-on-deadlock **livelocking** five ways, and nothing makes a move's retry better behaved than an insert's; it also makes `no-verdict` retryable, the one variant ADR-0016 exists to keep unusable as a verdict |
| **C** | **Lock the union of the incumbent and target pairs**, ordered by `(class, key)` | Adds no mechanism — same statement, same classes, more keys | Widens the serialisation point on the move path |
| **D** | Lock the whole dealership for a move | Trivially cycle-free | ADR-0004's rejected Option D returning for one use case, serialising every move in the dealership to fix a two-pair problem |

**Chosen: C.**

## Decision

Chosen option: **C.** A write acquires a `pg_advisory_xact_lock` for **every resource it is in
flight against**: the pair it takes, and — where it also performs an exclusion check — the pair it
leaves. `lockResources` takes the vacated pair as a **required** parameter, `null` for a booking,
so no future path omits it by forgetting; the keys are deduplicated and acquired in one statement
ordered by `(class, hashtext(key))`, a total order over a shared key space, so the enlarged lock
set cannot itself cycle.

Three write paths, one rule rather than three cases:

| Write | Leaves | Takes | Checks? | Locks |
|---|---|---|---|---|
| booking | — | one pair | yes | that pair (ADR-0018, unchanged) |
| cancel | one pair | — | **no** — the new version fails the partial predicate | none (ADR-0023, unchanged) |
| move | one pair | one pair | yes | both |

**A cancel is safe because it never waits, not because it writes no entry.** ADR-0023's M1
measured an insert waiting on an uncommitted cancel; M2, that a cancel is never itself a waiter —
which is what made that wait one-directional. A move is the first write that is both.

**Two accepted records state a premise this falsifies**, and neither is edited. ADR-0018's
consequence — *"a deadlock can then only mean some write path did not take these locks"* — was
true of the path it was measured on, false of the move.
[ADR-0029](0029-a-deadlock-names-the-write-path-a-conflict-does-not.md) restates it as the ground
for a per-path deadlock event name; **its decision is unaffected and is re-grounded here**: a
`40P01` names the path in flight against more resources than it locked.

## Consequences

**Good**

- The verdict is restored: a racing move's loser gets `23P01` and so `409`, not a `500` at 11.7 %.
  ADR-0003's *"one commits, the other gets `23P01`"* becomes true of racing **moves** — the claim
  that had never been asserted.
- `F-02-9` is discharged by measurement, and the rule it states is corrected: *take both locks* was
  necessary and not sufficient.

**Bad, or deferred**

- A move past attempt 1 serialises against two bays and two technicians, so its share of the
  write-throughput ceiling is up to twice as narrow. Bookings, the volume, are untouched.
- `lockResources` grows a parameter that is `null` at one of two call sites — preferred to an
  optional one, because omission must not compile.
- Found only because the race was run. Every other deadlock-freedom claim here is an
  argument.
