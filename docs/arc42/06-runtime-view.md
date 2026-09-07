# 6. Runtime view

> Owner: architect · Written: phase 2

Five scenarios. The first is the one the whole design exists to make safe, so it is documented before
the happy path.

Two conventions hold throughout, and both are load-bearing:

- **Each attempt is exactly one transaction wide** — ADR-0018's two advisory locks, then the one
  `INSERT` (A-6) or `UPDATE` (ADR-0003) — so every attempt is independently recoverable without
  savepoint discipline (ADR-0004). **No transaction may enclose the loop**: §11 R-7e carries what
  happens if one does, and QS-3 catches it immediately.
- **Reads before the loop are validation; reads inside it are advisory.** Opening hours and reference
  data are properties of the request, decided once (ADR-0001, ADR-0004); the candidate read only
  suggests *which write to attempt next*, never whether a write is allowed.

## 6.1 Concurrent booking — the database decides

**Mandatory scenario.** Two service advisors book the same service, dealership and start at the same
instant. There is exactly one free bay.

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
others' in-progress tuples and they cycle. The invariant was never in question; the *status* was —
a deadlock carries no constraint, so no verdict to render as `409`. ADR-0018 holds the measurement
and the rejected alternatives.
One `pg_advisory_xact_lock` per bay and per technician now precedes each attempt, so at most one
inserter is in flight against a given resource, every loser conflicts with a **committed** row, and
the reported constraint is therefore deterministic. **The serialisation point moved but did not
multiply**: still §11.2's write-throughput ceiling, at three round trips per attempt — §6.3 has what
a move adds.

**The lock decides nothing, and from slice 05 that is measured both ways.** Drop the lock, keep the
constraints: still exactly one row, with 108 deadlocks. Drop the constraints and **hold** the locks:
twenty overlapping rows land one at a time, zero refusals, at most **1** racer inside the `INSERT`
against the unlocked phase's **20**. §11 D-02-1 carries why the fourth cell matters. *The lock buys
liveness; only the constraint makes overlap unrepresentable.* All four cells run in
`tests/integration/exclusion-constraint-adjudicates.test.ts`.

**Where `23P01` is caught and mapped**, one place per stage:

| Stage | Module | Result |
|---|---|---|
| raised | PostgreSQL | SQLSTATE `23P01`, `constraint = no_bay_overlap` \| `no_technician_overlap` |
| classified | `src/persistence/pgError.ts`, the only site (§5.2) | `{ kind:'conflict', resource:'bay'\|'technician' }` |
| acted on | `src/application/bookAppointment.ts` | prune, count, retry or refuse (ADR-0004, ADR-0009) |
| rendered | `src/http` | `409` + `problem+json`, naming the resource (§8.6) |

A `40P01` is `no-verdict` and **not retried**: under ADR-0030 a write locks **every resource it is in
flight against**, so a deadlock means a path locked less than it wrote — an internal fault rendering
`500` (§11.2 F-02-9). ADR-0018's *"both locks"* was necessary and not sufficient; §6.3 has the move.

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

Two details a reviewer should check any implementation against:

- **Steps 2–4 run once**, and step 6 once: the loop varies only the candidate, opening hours and
  reference integrity being properties of the request (ADR-0004). The empty-candidate answers live in
  step 6's `null` branch rather than in front of it, so every branch here is reachable.
- **`23503` is never retried.** A bad reference (A-6) is a client error, not contention; swallowing it
  in the loop turns a `422` into a `409` after sixteen pointless attempts.
- **The pruning uses `err.constraint`** — why ADR-0006 disqualified any query layer that wraps the
  driver error, and why the names are behaviour (§11 R-3).

## 6.3 Rescheduling — one atomic `UPDATE`

`PATCH /appointments/{id}` with a new `startsAt`. Steps 1–6 are §6.2's, with the appointment's own
dealership and service type read from the existing row — **and that read also decides `404`**, being
one the move cannot be built without (ADR-0025). Step 7 replaces the `INSERT`, and **attempt 1 is the
pair the row already holds** before ADR-0009's shuffle opens (ADR-0027):

```sql
UPDATE appointment
   SET bay_id = $2, technician_id = $3, starts_at = $4, ends_at = $5, updated_at = now()
 WHERE id = $1 AND status = 'confirmed'
RETURNING <the ten columns>;   -- as built: named, never `*`
```

**No `AND id <> $1` predicate anywhere, no pre-read of the target slot, no application-side
"is it free?" step** (ADR-0003). Four properties follow, and each is pinned by a scenario in §10
because none of them is obvious:

| Property | Why it holds | Pinned by |
|---|---|---|
| A refused move leaves the original **confirmed, at its original time** | The statement aborts. Nothing was released, so nothing must be restored — the atomicity is the statement's, not the application's | QS-4 |
| A move never transiently frees its slot | There is no committed intermediate state in which the row does not occupy the bay. A concurrent booking for the original slot is refused throughout | QS-5 |
| A move onto an interval overlapping its **own** current interval succeeds | PostgreSQL checks the new row version against *other* rows, not against the version it replaces | QS-6 |
| The appointment id survives | It is an `UPDATE`. A caller holding the id still holds it | QS-6 |

**A move is in flight against two pairs, not one.** Its vacated index entry stays live until commit,
so a move both waits and is waited on. It therefore locks the **union** of both (ADR-0030), the pair
it leaves re-read inside the attempt's own transaction under the row's lock (ADR-0031): row lock,
advisory locks, write. Two mechanisms keep that acyclic — `(class, hashtext(key))` total-orders the
advisory waits, and a complete lock set covers every tuple wait — and no waiter for an appointment
row lock holds anything while it waits; §11 F-02-9 carries the measurement.

**`0 rows` means one thing — not `confirmed`.** Existence was
settled by the read above, so there is no follow-up read and §6.6 shows two deciders where it once
showed one (ADR-0025).

## 6.4 Cancellation

`POST /appointments/{id}/cancellation` — one unconditional statement: no guard, no pre-read and
**no advisory lock**, a cancelled row satisfying no constraint's `WHERE` and leaving nothing to
serialise (ADR-0023).

```sql
UPDATE appointment
   SET status = 'cancelled',
       updated_at = CASE WHEN status = 'cancelled' THEN updated_at ELSE now() END
 WHERE id = $1
RETURNING …;
```

The row leaves the exclusion constraints' scope through their `WHERE (status <> 'cancelled')`
predicate, so the slot becomes bookable again **by the same mechanism that guards every other write**
— no bookkeeping, no compensating release. Zero rows then means one thing only, no such id, where a
guarded `AND status <> 'cancelled'` would return zero for a replay too. The `CASE` is what makes
ADR-0003's idempotent `200` change **no column** (asserted as `to_jsonb` equality) — but `xmin` advances, so
*changes nothing* is true where *writes nothing* is not.

What QS-7 uniquely pins, and why its stated reason was wrong twice, is in §10 — one home, not two.

## 6.5 Availability query — advisory by contract

`GET /availability?dealershipId&serviceTypeId&from&to` is **two reads composed in
`src/application/queryAvailability.ts`**: `candidateResources` (reference data) minus
`appointmentRepository.busyResources` (the window). *This section specified a
`candidateRepository.freeResources` that never existed, from phase 2 until slice 08, while
`ambiguity-containment.test.ts` planted exactly that call as a violation — the control was right and
arc42 wrong (F-08-1, ADR-0032). `candidateRepository.ts` still cannot see `appointment`.*

It takes no lock, reserves nothing, and may be stale before the response is serialised — staleness
is a property of the domain interface, not an implementation detail (§8.6). It is also about
**exactly the window queried**: QS-8's probe inserts `[from, to)` itself, so a client querying a day
to book an hour inside it is outside the guarantee.

The overlap predicate is the same expression the exclusion constraint uses:

```sql
tstzrange(starts_at, ends_at) && tstzrange($from, $to)   AND status <> 'cancelled'
  AND dealership_id = $1      -- redundant by the composite FKs; it scopes the index, not the answer
```

Two expressions in two files, nothing structural holding them equal (§11 R-5; §4.2 says why a
shared `IMMUTABLE` function is a trap). QS-8 is what holds them together, and the
partial GiST indexes serve this query's range predicate (§8.2 mechanism 6).

## 6.6 Where each failure is decided

One row per failure, and the column that matters is the third: how much of the world had to be
consulted.

| Failure | Decided by | Reads | Status |
|---|---|---|---|
| Malformed body, bad timestamp | TypeBox schema, `src/http` | nothing | `400` |
| Outside opening hours | `domain/openingHours.ts` | reference data only — **never a booking** (GC-1) | `400` |
| Unknown dealership, service type, customer or vehicle | reference read, then the FK (`23503`) | reference data | `422` |
| Vehicle not owned by the named customer | composite FK (`23503`) | reference data | `422` |
| Unknown appointment id | the read the move needs anyway (ADR-0025) | one row | `404` |
| Appointment not `confirmed` | the guarded `UPDATE`'s `0 rows` | one row | `409` |
| Unmatched route | `setNotFoundHandler` (ADR-0024) | nothing | `404` |
| Every candidate refused | **PostgreSQL, `23P01`, repeatedly** | the whole live schedule, as a side effect of writing | `409` |

The last row is the only one whose answer depends on what else is happening at that instant, and the
only one the application does not decide.
