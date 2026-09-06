---
id: "0018"
title: Lock the bay and the technician before each insert, and treat a deadlock as an internal fault
status: proposed
date: 2026-09-06
supersedes: null
superseded_by: null
arc42: ["§5.2", "§6.1", "§8.2", "§8.6", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: architect
ai-input: >
  RULED BY THE ARCHITECT at slice 02 step 3, under the human's amendment of 2026-09-06 moving
  mid-slice scope, acceptance-criteria and quality-goal authority to the architect. PROVISIONAL
  until slice 02's gate, where the human rules it. First exercise of that rule; it would have
  been an escalation the day before.

  Raised as DCR T-02-9. The test-engineer's measurement was reproduced rather than taken on trust
  and came out worse — 285 of 400 losers, not one race in three. Every option below was RUN
  against `postgres:16-alpine` on this repository's own migrations, which inverted the
  architect's own first draft: that draft was the obvious remedy, retry with better constants,
  and the measurement shows it livelocks.
---

## Context and problem statement

Under *N* simultaneous inserts against one exclusion range, PostgreSQL refuses the losers with
`40P01` (`deadlock_detected`), not `23P01`: `check_exclusion_constraint` inserts the index tuple and
*then* scans, so simultaneous inserters wait on each other's in-progress tuples and cycle. Measured at
*N* = 20 against one bay, 20 trials from a hard barrier: **285 of 400 inserts returned `40P01`, 95
returned `23P01`, and exactly one row survived every trial.**

`CLAUDE.md` §2.1 is untouched. AC-3, AC-4, QS-1 and QS-2 are not: they require the losers to receive
`409 /problems/no-capacity`, and this slice's design classified `40P01` as `other` ⇒ `500`.

**A deadlock is not a capacity verdict.** The lock manager aborted before the constraint adjudicated,
and the error carries no `constraint`, so ADR-0016's `ContendedResource` cannot be minted from it.
*"Is `409` honest here?"* was answered by the type system: no.

## Considered options

| | Option | Verdict |
|---|---|---|
| **A** | `40P01` ⇒ `other` ⇒ `500` — the design as written | Rejected: 285/400; AC-3, AC-4, QS-1, QS-2 fail |
| **B** | `40P01` ⇒ `409 /problems/no-capacity` | Rejected: true of the outcome, false of the cause, and unconstructible under ADR-0016 without a cast |
| **C** | Retry the same candidate, with backoff and/or a lower `deadlock_timeout` | Rejected: **livelocks**, measured five ways |
| **D** | A `503 /problems/contention-timeout` row for a request that never gets a verdict | Rejected: needed only if C is the mechanism |
| **E** | `lock_timeout` below `deadlock_timeout`, so a waiter aborts before the detector runs | Rejected: C's livelock, without the detector's guarantee of progress |
| **F** | `INSERT … ON CONFLICT DO NOTHING` | Rejected: **silently loses the booking**, measured |
| **G** | One advisory lock per dealership (ADR-0004 Option D) | Rejected there on throughput; H is finer |
| **H** | **Two class-scoped advisory locks per attempt** | **Chosen** |

**C is the obvious remedy and it does not work.** Every aborted racer re-inserts its index tuple, so
the in-flight population never falls to one and nobody commits. *N* = 20:

| Retry configuration | Deadlocks | Racers left with no verdict | Race |
|---|---|---|---|
| immediate, `deadlock_timeout` 1 s, 30 s budget | 292 | 114 / 120 | 48 s |
| exponential 50 ms → 1 s, 1 s | 241 | 95 / 120 | 48 s |
| immediate, 25 ms, 5 s budget | 2100 | 171 / 200 | 5.5 s |
| exponential 5 → 200 ms, 25 ms | 1305 | 114 / 200 | 5.5 s |
| jitter 0–25 ms, 25 ms | 1352 | 114 / 200 | 5.5 s |

Lowering `deadlock_timeout` does not rescue it, and it is a **superuser** GUC — the application role
is refused, measured — so it is a deployment coupling, not configuration.

**F does not deadlock, which is why it is recorded.** `ON CONFLICT DO NOTHING` treats a conflicting
in-progress tuple as a conflict rather than waiting, so all twenty racers bail: 193 of 200 statements
returned zero rows, and **in 3 of 10 trials no appointment was created at all**. It turns a deadlock
into a silent total loss of capacity, and returns no `err.constraint` for AC-3 and AC-4.

## Decision

Chosen option: **H.** Each attempt is its own transaction and takes two advisory locks before the
`INSERT`:

```sql
SELECT pg_advisory_xact_lock(c, k)
FROM unnest(ARRAY[1,2], ARRAY[hashtext($bay), hashtext($technician)]) AS t(c, k);
```

Class `1` is bays and class `2` technicians, so the key spaces are **disjoint by construction** and
*bay-then-technician* is a total order no attempt can take in reverse: there is no sort to keep
sorted. The locks are transaction-scoped, so an attempt releases them as it ends and never holds one
across candidates.

`40P01` gets its own `PgOutcome` variant, `no-verdict`, minting no `ContendedResource`. A deadlock
can then only mean some write path did not take these locks, so it is **not retried** and is not
client-visible contention: `500 /problems/internal`, logged at `error`. **§8.6 gains no row.**

### The lock decides nothing, and two controls say so

| | Rows after 20 racers | Deadlocks |
|---|---|---|
| locks on, exclusion constraints **dropped** | **20** | 0 |
| locks **off**, constraints present | 1 | 108 |
| locks on, constraints present | 1 | 0 |

Drop the constraints and the lock lets twenty overlapping rows through: it prevents nothing. Drop the
lock and there is still one row: it decides nothing. **The constraint makes overlap unrepresentable;
the lock only stops the losers deadlocking before it can say so** — liveness against correctness,
measured rather than asserted.

Across 56 locked races at *N* = 20 and *N* = 40 — bay contention, technician contention, both — **0
deadlocks, 0 retries, every racer a verdict, the expected constraint name**, 20 racers resolved in
76 ms median. An uncontended booking costs 3.60 ms against 3.22 ms unlocked.

## Consequences

**Good.** AC-3, AC-4, QS-1 and QS-2 become determinate: every loser conflicts with a **committed**
row, so the constraint name it reports is deterministic rather than a property of who won. No
superuser GUC and no operator step — `hashtext` and `pg_advisory_xact_lock` are callable by an
ordinary role, measured. A hash collision costs serialisation and never correctness, because the lock
decides nothing.

**Bad, or deferred.** **Under a per-resource lock a reintroduced check-then-act would be *correct*,
not merely harmless** — ADR-0016's argument gets weaker here, not stronger; what survives is the
brand, the table scan and the two controls above (arc42 §11). **Every write path to `appointment` must
take these two locks in this order**, inherited by slices 06 and 07; one that skips it reintroduces
the deadlock. `hashtext` is undocumented and internal, and any deterministic `int4` serves. Three
round trips per attempt instead of one, and per-bay throughput is now serialised.
