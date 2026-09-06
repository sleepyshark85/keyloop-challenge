---
id: "0023"
title: A write that leaves the exclusion constraints' scope takes no advisory lock — narrow F-02-9 to an iff
status: accepted
date: 2026-09-06
supersedes: null
superseded_by: null
arc42: ["§5.2", "§6.4", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: architect
ai-input: >
  RULED BY THE ARCHITECT at slice 05 step 1 under the human's standing delegation. PROVISIONAL
  until slice 05's gate.

  It does NOT supersede ADR-0018, whose Decision — two advisory locks before each INSERT — stands
  unweakened. It narrows one sentence of that ADR's Consequences, "every write path to
  `appointment` must take these two locks in this order", which arc42 §11 carries as F-02-9.
  Slice 05 is the first write path that sentence is wrong about.

  M1–M3 were measured against `postgres:16-alpine` on this repository's own constraint definitions
  BEFORE the option was chosen, in ADR-0018's house style. The architect's first draft took the
  locks for uniformity; M2 and M3 are why it does not.
---

## Context and problem statement

Slice 05 adds the second write path to `appointment`: `UPDATE … SET status = 'cancelled' WHERE id
= $1`. ADR-0018 locks before every `INSERT` because `check_exclusion_constraint` inserts its index
tuple and *then* scans, so simultaneous inserters wait on each other and cycle. Its Consequences
generalised that to *every* write path.

Taken literally, cancellation must lock. It cannot cheaply: **the request carries only an id**, and
the locks are keyed on bay and technician, so acquiring them needs a pre-read — turning one
statement into read-then-lock-then-write and reintroducing the read-before-write shape booking spent
slice 02 removing.

## Considered options

| | Option | Verdict |
|---|---|---|
| **A** | Obey F-02-9 literally: pre-read, lock, update | Rejected — costs a pre-read and a transaction, buys nothing (M2, M3) |
| **B** | Derive the lock keys from `RETURNING` | Impossible: a lock taken after the write is not a lock |
| **C** | A third lock class on `appointment.id`, serialising cancels | Rejected — cancels of one row already serialise on that row's own lock, and commute |
| **D** | **Narrow F-02-9 to an iff on the constraints' scope** | **Chosen** |

## Decision

Chosen option: **D.**

> A statement takes ADR-0018's two advisory locks **iff the row version it writes falls inside an
> exclusion constraint's scope** — iff a constraint can adjudicate it.

Not a list of exempt endpoints; a property of the statement. Booking and rescheduling write
`confirmed` rows, so both lock — **slice 06 inherits ADR-0018 exactly as written**. A cancel writes
`status = 'cancelled'`, which satisfies no constraint's `WHERE (status <> 'cancelled')`.

**The reason.** The locks exist to stop *adjudications* colliding. The cancel writes a tuple the
constraints do not index and cannot conflict with, so there is no adjudication to serialise. The
exemption is readable off two adjacent lines: what the statement sets, what the predicate excludes.

### Measured

| | Measurement | Result |
|---|---|---|
| **M1** | A conflicting `INSERT` issued while a cancel of the occupying row is **uncommitted** | It **waits** on the canceller, then returns **`201`**. The slot frees atomically at commit and the inserter re-checks |
| **M2** | The cancel `UPDATE` issued while a conflicting `INSERT` is in flight | **2 ms**, no wait, no error — never a *waiter* on an exclusion check |
| **M3** | 20 cancels of one row racing 20 `INSERT`s for its slot, from a barrier, cancels taking **no** lock | 20 cancels, 1 row each; **1 `201`, 19 `23P01`, zero `40P01`**; exactly one `confirmed` row |

M1 and M2 give the shape: the wait is **one-directional**, inserter onto canceller, and a
one-directional wait cannot cycle. M3 is the liveness reading, clean without the lock.

## Consequences

**Good**

- Cancellation stays **one statement** — no transaction block, no pre-read, no lock keys the request
  does not carry, no shape to check against `CLAUDE.md` §2.1.
- F-02-9 becomes a rule with a *test* rather than an instruction to remember.

**Bad, or deferred**

- **`appointmentRepository.ts` now holds two write functions, one locking and one not, and
  "correctly exempt" reads identically to "forgot the lock."** Nothing structural separates them —
  F-02-9's own complaint, with a second case to confuse it. Mitigated only by the exempt function
  quoting the predicate beside its statement. arc42 §11 carries it as **F-05-1**.
- The rule is enforced by review: `depcruise` cannot see a SQL predicate. And M1–M3 are three
  readings of one PostgreSQL version (A-05-2).

## Pros and cons of the options

### Option A — pre-read, lock, update

- Good, because F-02-9 stays one unqualified sentence and no reader has to reason
- Bad, because the locks *require* a read the design does not otherwise need — three statements and
  a transaction where one statement suffices
- Bad, because it buys nothing: M2 shows the cancel never waits on an exclusion check, M3 that the
  race is already deadlock-free
- Bad, because serialising a cancel against bookings for that bay makes freeing capacity wait on
  the contention it is freeing

### Option C — a lock class on `appointment.id`

- Good, because every write path would still "take a lock", preserving the sentence's shape
- Bad, because concurrent cancels of one row already serialise on its tuple lock — M3's twenty each
  report one row, and nothing is left to prevent
- Bad, because cancellation is **commutative and idempotent**: `confirmed → cancelled` is terminal,
  so every interleaving ends in the same state
- Bad, because a third class is a third position in an order ADR-0018 chose disjoint key spaces to
  keep unsortable
