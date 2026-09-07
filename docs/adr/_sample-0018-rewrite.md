# SAMPLE — a rewrite of ADR-0018 for readability

> **Not an ADR.** A proposal for how ADRs could read; the underscore prefix keeps it out of
> `docs:adr-check`'s scan. `0018-lock-the-bay-and-the-technician-before-each-insert.md` is unchanged
> and still accepted. Nothing here changes a decision — only how it is told.
>
> **Why this one.** The first sample rewrote ADR-0032, which is on the retirement list, so it showed
> the form on a record about to disappear. ADR-0018 is the opposite case: it survives, it is the
> most-cited ADR in the log (44 references), and the whole concurrency claim rests on it.
>
> **What is different, and why:**
> 1. A new **What changes in the application** section with the actual call shape. The original
>    never said what code results from the decision — the SQL is there, but not where it goes.
> 2. The problem is stated in plain terms *before* any section number or criterion id.
> 3. **Cross-references: 29 uses of 14 distinct ids, down to none.** `AC-3`, `AC-4`, `QS-1`, `QS-2`,
>    `ADR-0016` (×3), `ADR-0004`, `T-02-9`, `A-04-1`, `§5.2`, `§6.1`, `§8.2`, `§8.6`, `§11` and
>    `CLAUDE.md §2.1` are gone — each replaced by the *fact* it pointed at, in a clause. Zero is not
>    a target and the first sample kept two; it is just what was left once every pointer that had a
>    one-clause substitute was replaced by it.
> 4. The measurement tables are kept **entire**. They are the evidence, and they are why this
>    record is worth having; length spent on them is not the length the reader was complaining about.
> 5. Same options, same chosen option, same consequences.
>
> **One thing the form has to handle, and does.** ADR-0030 later corrected this decision — a move
> must also lock the pair it *leaves*. A rewrite must not backfill that: ADRs are immutable and the
> history of how thinking changed is the point. So the correction is not mentioned here, exactly as
> it is not mentioned in the original; a reader meets it through the `superseded_by` field and the
> index. **The risk the new section adds is that "what changes in the application" ages** — it
> describes code that a later ADR revised. That is the cost, and it is worth naming: the section
> must be written as *what this decision changed when it was made*, not as a description of today's
> code.

---

## Context and problem statement

Twenty people try to book the same bay at the same second. Exactly one should get it and nineteen
should be told the bay is full.

What actually happened is that most of them got a `500`. PostgreSQL refuses simultaneous inserters
with `40P01` (`deadlock_detected`) rather than `23P01` (`exclusion_violation`), because the constraint
check inserts its index tuple *first* and scans *second* — so the racers end up waiting on each
other's in-progress tuples and the lock manager breaks the cycle. Measured at twenty racers against
one bay, twenty trials from a hard barrier: **285 of 400 inserts returned `40P01`, 95 returned
`23P01`, and exactly one row survived every trial.**

The database was right the whole time — one row, every trial. The rule that overlap is prevented by
the database and never by application code is untouched. What broke is the *answer*: the criteria for
this endpoint require every loser to receive `409 /problems/no-capacity`, and a deadlock was
classified as an unknown error, so it became a `500`.

**A deadlock is not a capacity verdict.** The lock manager aborted the transaction before the
constraint adjudicated anything, and the error carries no `constraint` field. The system's branded
"contended resource" type can only be built *from* that field, so the question "is `409` honest
here?" was answered by the type system rather than by preference: no.

## What changes in the application

Before — one statement per candidate, and under contention most of them fail the wrong way:

```
POST /appointments
  └─ for each candidate (bay, technician):
       INSERT INTO appointment …     ← 40P01 for most racers ⇒ 500
```

After — each attempt is its own transaction, and takes two locks first:

```
POST /appointments
  └─ for each candidate (bay, technician):
       BEGIN
         SELECT pg_advisory_xact_lock(c, k)              ← new, one statement, two locks
           FROM unnest(ARRAY[1,2],
                       ARRAY[hashtext($bay), hashtext($technician)]) AS t(c, k);
         INSERT INTO appointment …                       ← unchanged
       COMMIT
     23P01 ⇒ this candidate is taken, try the next one
     40P01 ⇒ 500: a write path skipped the locks
```

Class `1` is bays and class `2` is technicians, so the two key spaces are **disjoint by
construction** and *bay-then-technician* is a total order no attempt can take in reverse. There is no
sort to keep sorted. The locks are transaction-scoped, so an attempt drops them as it ends and never
holds one while trying the next candidate.

The insert itself does not change. Nothing is retried.

## Considered options

| | Option | Verdict |
|---|---|---|
| **A** | `40P01` ⇒ unknown error ⇒ `500` — the design as written | Rejected: 285/400 losers get the wrong answer |
| **B** | `40P01` ⇒ `409 /problems/no-capacity` | Rejected: true of the outcome, false of the cause, and unbuildable without a cast |
| **C** | Retry the same candidate, with backoff and/or a lower `deadlock_timeout` | Rejected: **livelocks**, measured five ways |
| **D** | A `503 /problems/contention-timeout` for a request that never gets a verdict | Rejected: needed only if C is the mechanism |
| **E** | `lock_timeout` below `deadlock_timeout`, so a waiter aborts before the detector runs | Rejected: C's livelock without the detector's guarantee of progress |
| **F** | `INSERT … ON CONFLICT DO NOTHING` | Rejected: **silently loses the booking**, measured |
| **G** | One advisory lock per dealership | Rejected earlier on throughput; H is finer |
| **H** | **Two class-scoped advisory locks per attempt** | **Chosen** |

**C is the obvious remedy and it does not work.** Every aborted racer re-inserts its index tuple, so
the in-flight population never falls to one and nobody commits. Twenty racers:

| Retry configuration | Deadlocks | Racers left with no verdict | Race |
|---|---|---|---|
| immediate, `deadlock_timeout` 1 s, 30 s budget | 292 | 114 / 120 | 48 s |
| exponential 50 ms → 1 s, 1 s | 241 | 95 / 120 | 48 s |
| immediate, 25 ms, 5 s budget | 2100 | 171 / 200 | 5.5 s |
| exponential 5 → 200 ms, 25 ms | 1305 | 114 / 200 | 5.5 s |
| jitter 0–25 ms, 25 ms | 1352 | 114 / 200 | 5.5 s |

Lowering `deadlock_timeout` does not rescue it, and it is a **superuser** setting the application
role is refused — measured — so it is a deployment coupling rather than configuration.

**F does not deadlock, which is why it is recorded.** `ON CONFLICT DO NOTHING` treats a conflicting
in-progress tuple as a conflict instead of waiting, so all twenty racers bail: 193 of 200 statements
returned zero rows, and **in 3 of 10 trials no appointment was created at all.** It converts a
deadlock into a silent total loss of capacity, and returns no constraint name for the error mapping
to use.

## Decision

Chosen option: **H**, as shown above.

A deadlock can now only mean that some write path did not take these locks. So it is **not retried**
and is not client-visible contention: `500 /problems/internal`, logged at `error`, and the public
error taxonomy gains no row.

### The lock decides nothing, and two controls say so

| | Rows after 20 racers | Deadlocks |
|---|---|---|
| locks on, exclusion constraints **dropped** | **20** | 0 |
| locks **off**, constraints present | 1 | 108 |
| locks on, constraints present | 1 | 0 |

Drop the constraints and the lock lets twenty overlapping rows through: it prevents nothing. Drop the
lock and there is still exactly one row: it decides nothing. **The constraint makes overlap
unrepresentable; the lock only stops the losers deadlocking before it can say so** — liveness against
correctness, measured rather than asserted.

Across 56 locked races at twenty and forty racers — bay contention, technician contention, both —
**0 deadlocks, 0 retries, every racer a verdict, the expected constraint name**, twenty racers
resolved in 76 ms median. An uncontended booking costs 3.60 ms against 3.22 ms unlocked.

## Consequences

**Good**

- Every loser now conflicts with a **committed** row, so the constraint name it reports is
  deterministic rather than a property of who happened to win. That is what makes the `409` answer
  assertable at all.
- No superuser setting and no operator step: `hashtext` and `pg_advisory_xact_lock` are callable by
  an ordinary role, measured.
- A hash collision costs serialisation and never correctness, because the lock decides nothing.

**Bad, or deferred**

- **Under a per-resource lock, a reintroduced check-then-act would be *correct* rather than merely
  harmless.** The argument for making capacity refusals a database verdict gets *weaker* here, not
  stronger. What still carries it is the branded type, the architecture test on table access, and the
  two controls above. Recorded as debt.
- **Every write path to `appointment` must take these two locks in this order.** One that skips it
  reintroduces the deadlock, and this obligation is inherited by the slices that add rescheduling and
  contended moves.
- `hashtext` is undocumented and internal; any deterministic `int4` would serve.
- Three round trips per attempt instead of one, and per-bay throughput is now serialised.
