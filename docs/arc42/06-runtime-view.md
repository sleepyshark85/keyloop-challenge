# 6. Runtime view

> Owner: architect · Written: phase 2

Five scenarios. The first is the one the whole design exists to make safe, so it is documented before
the happy path.

Two conventions hold throughout, and both are load-bearing:

- **Each attempt is exactly one transaction wide** — ADR-0018's two advisory locks, then the one
  `INSERT` (A-6) or `UPDATE` (ADR-0003). That satisfies ADR-0004's requirement that every attempt be
  independently recoverable without savepoint discipline, and the corresponding prohibition is
  absolute: **no transaction may enclose the loop**, or the second attempt fails with `25P02`
  (current transaction is aborted) instead of being retried. Nothing in `.dependency-cruiser.js` can
  catch that; QS-3 does, immediately.
- **Reads before the loop are validation; reads inside it are advisory.** Opening hours and reference
  data are properties of the request, decided once (ADR-0001, ADR-0004). The candidate read is a
  suggestion about *which write to attempt next*, never about whether a write is allowed.

## 6.1 Concurrent booking — the database decides

**Mandatory scenario.** Two service advisors book the same service, at the same dealership, for the
same start, at the same instant. There is exactly one free bay.

![Two racing bookings and where PostgreSQL rejects the second](../diagrams/concurrent-booking.svg)

*Source: [`diagrams/concurrent-booking.html`](../diagrams/concurrent-booking.html) · regenerate the SVG with `npm run diagram:export`. It predates ADR-0018 and does not draw the locks; presentation diagrams are refreshed once, in phase 6*

```
R1                                  R2                        PostgreSQL
──                                  ──                        ──────────
POST /appointments                  POST /appointments
  ├ schema validation (TypeBox)       ├ schema validation
  ├ read dealership + service type    ├ read dealership + service type
  ├ withinOpeningHours()  ✓ pure      ├ withinOpeningHours()  ✓ pure
  │                                   │
  ├ span: availability.candidates     ├ span: availability.candidates
  │   SELECT free bays, free techs ───┼──────────────────────▶ {B1}, {T1}
  │   ◀── {B1}, {T1}                  │   ◀── {B1}, {T1}          ← BOTH see B1 free.
  │                                   │                            Advisory. Nothing is
  │                                   │                            concluded from it.
  ├ BEGIN                             ├ BEGIN
  ├ pg_advisory_xact_lock(1,B1),      ├ pg_advisory_xact_lock(1,B1)
  │    (2,T1) ── granted ─────────────┼──────────────────────▶ ADR-0018: the locks read
  │                                   │   ── WAITS on R1 ───▶  no table and decide
  ├ span: appointment.insert          │                        nothing
  │   INSERT … B1, T1, [09:00,10:00) ─┼──────────────────────▶ exclusion check
  │                                   │                        ┌ no_bay_overlap: no
  │                                   │                        │ conflicting row
  ├ COMMIT ── locks released ─────────┼──────────────────────▶ └ COMMIT ✓
  │   ◀── appointment a-1             │
  │                                   ├ lock granted
  │                                   ├ span: appointment.insert
  │                                   │   INSERT … B1, T1 ──▶  exclusion check
  │                                   │                        ┌ conflicts with a-1,
  │                                   │                        │ which is COMMITTED
  │                                   │                        └ ERROR 23P01,
  │                                   │                          constraint =
  │                                   │                          "no_bay_overlap"
  │                                   │   ◀── 23P01
  │                                   ├ pgError.classify()
  │                                   │   → {conflict, resource:'bay'}
  │                                   ├ booking_conflicts_total{resource="bay",
  │                                   │                         outcome="absorbed"}++
  │                                   ├ prune bay B1 — that bay, not all bays
  │                                   ├ candidate set now empty
  │                                   ├ booking_conflicts_total{…,outcome="refused"}++
  ▼                                   ▼
201 Created                         409 Conflict
{ appointment a-1 }                 problem+json, type=/problems/no-capacity,
                                    resource="bay"
```

**Where the race is actually decided.** Not in `withinOpeningHours`, which reads no booking. Not in
the candidate query, whose answer both requests believe and which is *wrong for one of them* the
moment it is returned. Not in the advisory lock, which reads no table. It is decided inside
PostgreSQL's exclusion-constraint check, at the `INSERT`. There is no window, because there is no
check to have a window after.

**Why the lock is there, and why it is not part of that.** Without it, simultaneous inserters do not
queue: `check_exclusion_constraint` inserts the index tuple and *then* scans, so each waits on the
others' in-progress tuples and they cycle. Measured, 20 racers on one bay over 20 trials —
**285 of 400 losers returned `40P01` (deadlock), 95 returned `23P01`, and exactly one row survived
every trial.** The invariant was never in question; the *status* was, because a deadlock carries no
constraint and therefore no verdict to render as `409`. Retry does not rescue it — an aborted racer
re-inserts its index tuple, so the in-flight population never falls to one and every measured
configuration livelocked. ADR-0018 puts one `pg_advisory_xact_lock` per bay and per technician in
front of each attempt instead, so at most one inserter is ever in flight against a given resource and
every loser conflicts with a **committed** row.

**The lock decides nothing, and that is measured both ways** — drop the constraints and keep the lock
and 20 overlapping rows are written; drop the lock and keep the constraints and there is still
exactly one row, with 108 deadlocks. *Correctness is entirely the constraint's; liveness is entirely
the lock's.* Both controls run in `tests/integration/exclusion-constraint-adjudicates.test.ts`.

**The serialisation point moved but did not multiply.** It is now the advisory lock, immediately in
front of the constraint's own, and it is still the only one in the system and still where §11.2's
write-throughput ceiling comes from — at three round trips per attempt rather than one. It also makes
the reported constraint deterministic: a loser now conflicts with a committed row rather than with
whichever in-progress tuple it happened to meet.

**Where `23P01` is caught and mapped**, in one place per stage:

| Stage | Module | Result |
|---|---|---|
| raised | PostgreSQL | SQLSTATE `23P01`, `constraint = no_bay_overlap` \| `no_technician_overlap` |
| classified | `src/persistence/pgError.ts` — the **only** site (`sql-only-in-persistence`, §5.3) | `{ kind:'conflict', resource:'bay'\|'technician' }` |
| acted on | `src/application/bookAppointment.ts` | prune, count, retry or refuse (ADR-0004, ADR-0009) |
| rendered | `src/http` | `409` + `application/problem+json`, naming the contended resource (§1.3, §8.6) |

A `40P01` is classified `no-verdict` and is **not retried**: under ADR-0018's locks a deadlock can
only mean some write path skipped them, so it is an internal fault and renders `500`. Retrying it
would turn the fault into a latency blip nobody investigates. §11.2 carries that obligation, which
slices 06 and 07 inherit.

## 6.2 A booking that retries, and succeeds

The same path when the dealership still has capacity — the case ADR-0004 exists for, and the reason a
`409` means *the dealership was full* rather than *the allocator guessed badly*.

```
POST /appointments {customer, vehicle, serviceType, dealership, startsAt}
 │
 ├─ 1. schema validation ......................... fail → 400 (ADR-0005)
 ├─ 2. read dealership (zone, weekly hours) + service type
 │       not found ............................... → 422 (A-6)
 ├─ 3. duration  = serviceDuration(serviceType)              domain/duration.ts      (A-1)
 │     interval  = appointmentInterval(startsAt, duration)   domain/interval.ts
 │     occupancy = occupancyInterval(interval)               domain/interval.ts      (A-4)
 ├─ 4. withinOpeningHours(interval, zone, hours)             domain/openingHours.ts  (ADR-0001)
 │       outside ................................. → 400  ← decided with NO knowledge of
 │                                                           any booking, so no window
 ├─ 5. span availability.candidates
 │     candidateResources(dealership, serviceType) → bays[], technicians[]        ADVISORY
 │       reference data only; the availability filter arrives after slice 08 (D-04-1)
 ├─ 6. orderCandidates(bays, technicians, deps.seed())       domain/candidates.ts    (ADR-0009)
 │        seeded, pure, injected — never a global RNG; BOOKING_SEED overrides (ADR-0021)
 │        null → THE ONLY empty-candidate branch, and it is REACHABLE:
 │             no bay .................................. → 500  ┐ two different failures,
 │             no qualified technician .................. → 422  ┘ and NEVER a fabricated
 │                                                                 409 — there is no verdict
 │                                                                 to build one from (§8.6,
 │                                                                 ADR-0016)
 │
 └─ 7. for attempts = 1 .. |bays| + |technicians|   ← Bound-2's STRUCTURAL bound, not the cap
        ONE transaction per attempt, NONE around the loop (ADR-0018):
        ┌─────────────────────────────────────────────────────────────────┐
        │ (bay, tech) = nextCandidate(set)                                │
        │ span appointment.insert                                         │
        │   INSERT … VALUES (…, bay, tech, starts_at, ends_at,'confirmed')│
        │     ok      → 201 Created, appointment id, allocated bay+tech   │
        │     23P01   → classify → resource      ← MINTED here, ADR-0016  │
        │               booking_conflicts_total{resource,                 │
        │                                       outcome="absorbed"}++     │
        │               set = prune(set, resource, id)   ← the WHOLE bay  │
        │                                                  or technician  │
        │               list emptied  → 409 exit="exhausted"   ┐ BOTH      │
        │               attempts ≥ cap → 409 exit="capped"     ┘ EXITS ARE │
        │               else            continue                 IN HERE   │
        │     23503   → 422 unknown reference (never retried)             │
        │     other   → rethrow → 500                                     │
        └─────────────────────────────────────────────────────────────────┘
        tail: UNREACHABLE, AND TIGHTLY SO. Each conflict prunes exactly one id while both
        lists are non-empty, so attempt k requires |B|+|T|-(k-1) >= 2: the deepest
        REACHABLE attempt is exactly |B|+|T|-1, a bound an adversary attains. `<=` and `<`
        therefore admit the identical execution set, and `<=` is kept deliberately — under
        `<` a future PgOutcome variant retrying WITHOUT pruning would leave the loop
        quietly at the bound instead of meeting the throw. It THROWS rather than refusing:
        nothing is minted there (ADR-0020 F, §8.6). Proof and exhaustive search over every
        adversarial path, (B,T) in 1..9^2 and 8 seeds — step 5.

        Both refusals are 409 /problems/no-capacity and both carry the resource this
        arm's own classification minted — ADR-0020: the cap is tested INSIDE the 23P01
        arm, never as the loop's bound, so no refusal exit can be reached without a
        verdict. `exhausted` wins a tie. The bound being exact, "capped" is reachable
        only where |bays| + |technicians| >= 18 — and at §1.1 scale it is, which is
        D-04-1: a non-zero "capped" is expected today, not ADR-0009's intended signal.
```

Three details that a reviewer should check any implementation against:

- **Steps 2–4 run once**, and step 6 once: the loop varies only the candidate. Opening hours and
  reference integrity are properties of the request (ADR-0004). The empty-candidate answers live in
  step 6's `null` branch rather than in front of it, so every branch on this path is reachable.
- **`23503` is never retried.** A foreign-key violation means a bad reference (A-6), which is a client
  error and not contention. Swallowing it in the loop would turn a `422` into a `409` after sixteen
  pointless attempts.
- **The pruning uses `err.constraint`.** That is why ADR-0006 disqualified any query layer that wraps
  the driver error, and why the constraint *names* in the migration are behaviour rather than
  documentation (QS-1, QS-2 pin them).

## 6.3 Rescheduling — one atomic `UPDATE`

`PATCH /appointments/{id}` with a new `startsAt`. Steps 1–6 are §6.2's, with the appointment's own
dealership and service type read from the existing row; step 7 replaces the `INSERT` with:

```sql
UPDATE appointment
   SET bay_id = $2, technician_id = $3, starts_at = $4, ends_at = $5, updated_at = now()
 WHERE id = $1 AND status = 'confirmed'
RETURNING *;
```

**No `AND id <> $1` predicate anywhere, no pre-read of the target slot, no application-side
"is it free?" step** (ADR-0003). Four properties follow, and each is pinned by a scenario in §10
because none of them is obvious:

| Property | Why it holds | Pinned by |
|---|---|---|
| A refused move leaves the original **confirmed, at its original time** | The statement aborts. Nothing was released, so nothing must be restored — the atomicity is the statement's, not the application's | QS-4 |
| A move never transiently frees its slot | There is no committed intermediate state in which the row does not occupy the bay. A concurrent booking for the original slot is refused throughout | QS-5 |
| A move onto an interval overlapping its **own** current interval succeeds | PostgreSQL checks the new row version against *other* rows, not against the version it replaces. Extending a job by thirty minutes is an ordinary request | QS-6 |
| The appointment id survives | It is an `UPDATE`. A caller holding the id still holds it | QS-6 |

A move racing another move, or racing a fresh booking, is the §6.1 story with `UPDATE` in place of
`INSERT`. There is one mechanism, and rescheduling does not add a second. `0 rows` returned means the
appointment does not exist (`404`) or is not `confirmed` (`409`), distinguished by a follow-up read.

## 6.4 Cancellation

`POST /appointments/{id}/cancellation`:

```sql
UPDATE appointment SET status = 'cancelled', updated_at = now()
 WHERE id = $1 RETURNING *;
```

The row leaves the exclusion constraints' scope through their `WHERE (status <> 'cancelled')`
predicate, so the slot becomes bookable again **by the same mechanism that guards every other write**
— no bookkeeping, no compensating release, nothing to get wrong. Cancelling an already-cancelled
appointment is idempotent and returns `200` (ADR-0003). QS-7 exercises the predicate, which would
otherwise be a clause no test ever reaches.

## 6.5 Availability query — advisory by contract

`GET /availability?dealershipId&serviceTypeId&from&to` runs `candidateRepository.freeResources` over
a window and returns free bays and qualified free technicians. It takes no lock, reserves nothing,
and its answer may be stale before the response is serialised. **The response body says so**, and the
OpenAPI description says so, because that staleness is a property of the domain interface and not an
implementation detail (§3.1, §4.1).

The overlap predicate is the same expression the exclusion constraint uses:

```sql
tstzrange(a.starts_at, a.ends_at) && tstzrange($from, $to)   AND a.status <> 'cancelled'
```

Those two expressions live in two files and nothing forces them to agree — §4.2 explains why a shared
`IMMUTABLE` SQL function is a trap rather than a fix. QS-8 is what holds them together: under
quiescence, anything availability reports free must be insertable, and anything it reports busy must
be refused.

The partial GiST indexes created by the exclusion constraints serve this query's range predicate, so
the mechanism that costs write throughput (§11.2) pays for the read path.

## 6.6 Where each failure is decided

One row per failure, and the column that matters is the third: how much of the world had to be
consulted.

| Failure | Decided by | Reads | Status |
|---|---|---|---|
| Malformed body, bad timestamp | TypeBox schema, `src/http` | nothing | `400` |
| Outside opening hours | `domain/openingHours.ts` | reference data only — **never a booking** (GC-1) | `400` |
| Unknown dealership, service type, customer or vehicle | reference read, then the FK (`23503`) | reference data | `422` |
| Vehicle not owned by the named customer | composite FK (`23503`) | reference data | `422` |
| Unknown appointment id | the `UPDATE`'s `0 rows` | one row | `404` |
| Appointment not `confirmed` | the `UPDATE`'s `0 rows` | one row | `409` |
| Every candidate refused | **PostgreSQL, `23P01`, repeatedly** | the whole live schedule, as a side effect of writing | `409` |

The last row is the only one whose answer depends on what else is happening at that instant, and it
is the only one the application does not decide.
