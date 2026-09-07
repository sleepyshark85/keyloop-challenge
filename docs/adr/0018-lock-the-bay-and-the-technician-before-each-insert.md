---
id: "0018"
title: Lock the bay and the technician before each insert, and treat a deadlock as an internal fault
status: accepted
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

  RATIFIED `accepted` on 2026-09-06 by the architect under the human's standing delegation, the
  human being absent. Slice 02 merged without its gate ruling it — arc42 §11's rule is that a
  merge does not move an ADR out of `proposed` — so it stood unaccepted while slice 04 was built
  on it and slices 06 and 07 inherited its lock obligation. Nothing found since narrows it: the
  implementer's A-04-1 checked the deadlock-freedom argument against the code and found it holds
  for three independent reasons where this record gives one.
---

## Context and problem statement

Twenty people try to book the same bay at the same second. Exactly one should get it and nineteen
should be told the bay is full.

Most of them got a `500`. PostgreSQL refuses simultaneous inserters with `40P01`
(`deadlock_detected`) rather than `23P01` (`exclusion_violation`): the constraint check inserts its
index tuple *first* and scans *second*, so the racers wait on each other's in-progress tuples until
the lock manager breaks the cycle. Twenty racers, one bay, twenty trials from a hard barrier:
**285 of 400 inserts returned `40P01`, 95 returned `23P01`, and exactly one row survived every
trial.**

The database was right throughout, so the rule that overlap is prevented by the database and never by
application code is untouched. What broke is the *answer*: this endpoint's criteria require every
loser to receive `409 /problems/no-capacity`, and a deadlock was classified as an unknown error, so
it became a `500`.

**A deadlock is not a capacity verdict.** The lock manager aborted before the constraint
adjudicated anything, and the error carries no `constraint` field. The system's branded
"contended resource" type can only be built *from* that field, so *"is `409` honest here?"* was
answered by the type system rather than by preference: no.

## Considered options

| | Option | Verdict |
|---|---|---|
| **A** | `40P01` ⇒ unknown error ⇒ `500` — the design as written | Rejected: 285/400 losers get the wrong answer |
| **B** | `40P01` ⇒ `409 /problems/no-capacity` | Rejected: true of the outcome, false of the cause, unbuildable without a cast |
| **C** | Retry the same candidate, with backoff and/or a lower `deadlock_timeout` | Rejected: **livelocks**, measured five ways |
| **D** | A `503 /problems/contention-timeout` for a request that never gets a verdict | Rejected: needed only if C is the mechanism |
| **E** | `lock_timeout` below `deadlock_timeout`, so a waiter aborts before the detector runs | Rejected: C's livelock without the detector's progress guarantee |
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
role is refused — measured — so it is deployment coupling, not configuration.

**F does not deadlock, which is why it is recorded.** `ON CONFLICT DO NOTHING` treats a conflicting
in-progress tuple as a conflict instead of waiting, so all twenty racers bail: 193 of 200 statements
returned zero rows, and **in 3 of 10 trials no appointment was created at all.** It turns a deadlock
into a silent total loss of capacity, and returns no constraint name to map.

## Decision

Chosen option: **H.**

A deadlock can then only mean some write path did not take these locks, so it is **not retried**
and is not client-visible contention: `500 /problems/internal`, logged at `error`, and the public
error taxonomy gains no row.

### The lock decides nothing, and two controls say so

| | Rows after 20 racers | Deadlocks |
|---|---|---|
| locks on, exclusion constraints **dropped** | **20** | 0 |
| locks **off**, constraints present | 1 | 108 |
| locks on, constraints present | 1 | 0 |

Drop the constraints and the lock lets twenty overlapping rows through: it prevents nothing. Drop the
lock and one row still survives: it decides nothing. **The constraint makes overlap unrepresentable;
the lock only stops the losers deadlocking before it can say so** — liveness against correctness,
measured rather than asserted.

Across 56 locked races at twenty and forty racers — bay, technician, both — **0 deadlocks, 0 retries,
every racer a verdict, the expected constraint name**; twenty racers resolve in 76 ms median, and an
uncontended booking costs 3.60 ms against 3.22 ms unlocked.

## Consequences

**Good**

- Every loser now conflicts with a **committed** row, so the constraint name it reports is
  deterministic rather than a property of who won — which is what makes the `409` assertable.
- No superuser setting and no operator step: `hashtext` and `pg_advisory_xact_lock` are callable by
  an ordinary role, measured.
- A hash collision costs serialisation and never correctness, because the lock decides nothing.

**Bad, or deferred**

- **Under a per-resource lock, a reintroduced check-then-act would be *correct* rather than merely
  harmless.** The argument for making capacity refusals a database verdict gets *weaker* here, not
  stronger; what still carries it is the branded type, the architecture test on table access, and the
  two controls above. Recorded as debt.
- **Every write path to `appointment` must take these two locks in this order** — the slices adding
  rescheduling and contended moves inherit it, and one that skips it reintroduces the deadlock.
- `hashtext` is undocumented and internal; any deterministic `int4` would serve.
- Three round trips per attempt instead of one, and per-bay throughput is serialised.
