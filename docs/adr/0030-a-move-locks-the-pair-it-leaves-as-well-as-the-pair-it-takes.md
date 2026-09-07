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

A user reschedules a car into a busy afternoon and gets a `500`: an internal fault, not *"that
slot is taken"*. That is 11.7 % of contended moves.

The advisory locks were designed for an **insert**, in flight against one pair. A move is not:
having tried the pair it holds it targets a **different** pair while still occupying its incumbent,
so it can wait on another writer while another waits on **its** vacated entry. Two such moves
cycle.

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
| **A** | Leave it; book the `500` as debt | Keeps slice 07 proof-only, as its gate allowed | 11.7 % is not a corner: rescheduling into a busy day gets an internal-fault page the taxonomy renders as the system's fault, which it now is; the debt register would carry a defect this slice could close |
| **B** | Retry `40P01` on the move path | No lock change, no new rule | Retry-on-deadlock was measured **livelocking** five ways, and nothing makes a move's retry better than an insert's; it also makes `no-verdict` retryable — the outcome that exists so a deadlock never passes as one |
| **C** | **Lock the union of the incumbent and target pairs**, ordered by `(class, key)` | No new mechanism — same statement, same classes, more keys | Widens the serialisation point on a move |
| **D** | Lock the whole dealership for a move | Trivially cycle-free | The per-dealership lock rejected earlier on throughput, back for one use case, serialising every move in the dealership to fix a two-pair problem |

**Chosen: C.**

## Decision

Chosen option: **C.** A write acquires a `pg_advisory_xact_lock` for **every resource it is in
flight against**: the pair it takes and, where it performs an exclusion check, the pair it
leaves. The vacated pair is a **required** input, so omission cannot compile; keys are deduplicated
and acquired in one statement ordered by `(class, hashtext(key))` — a total order over a shared key
space, so the enlarged set cannot itself cycle.

Three write paths, one rule rather than three cases:

| Write | Leaves | Takes | Checks? | Locks |
|---|---|---|---|---|
| booking | — | one pair | yes | that pair, unchanged |
| cancel | one pair | — | **no** — its new version fails the partial predicate | none, unchanged |
| move | one pair | one pair | yes | both |

**A cancel is safe because it never waits, not because it writes no entry.** Measurement showed an
insert waiting on an uncommitted cancel, and a cancel never waiting — which made that wait
one-directional. A move is the first write that is both.

**Two accepted decisions state a premise this falsifies**, and neither is edited. *"A deadlock can
then only mean some write path did not take these locks"* was true of the path it was measured on,
false of the move. The rule that a deadlock names the write path while a conflict does not rests on
it too; **its decision is unaffected and re-grounded here**: a `40P01` names the path
in flight against more resources than it locked.

## Consequences

**Good**

- The verdict is restored: a racing move's loser gets `23P01` and so `409`, not a `500` at 11.7 %.
  *"One commits, the other gets `23P01`"* becomes true of racing **moves**, a claim never before
  asserted.
- That obligation is discharged by measurement and corrected: *take both locks* was necessary and
  not sufficient.

**Bad, or deferred**

- **The pair a move leaves must be re-read inside the attempt's own transaction**: computed once
  before the loop it can be stale, and a stale lock set reopens this cycle. Corrected later in this
  slice; this record is incomplete without it.
- A move past attempt 1 serialises against two bays and two technicians, at worst halving its share
  of write throughput. Bookings, the volume, are untouched.
- Found only because the race was run. Every other deadlock-freedom claim is an argument.
