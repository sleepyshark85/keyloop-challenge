# 8. Cross-cutting concepts

> Owner: architect · Written: phase 2, extended per slice

## 8.1 Domain model

Nine relations. Eight arrive by migration and fixture (A-6, A-7); `appointment` is the only one the API
writes. The `CREATE TABLE` text lives once, in `src/persistence/migrations/0002`–`0003`, which is the copy
that executes; arc42 carries the model and the reasoning.

![Nine relations, and what each edge asserts](../diagrams/domain-model.svg)

*Source: [`domain-model.html`](../diagrams/domain-model.html) · regenerate with `npm run diagram:export`*

| Relation | The line worth writing down |
|---|---|
| `dealership` | A site and its IANA `time_zone`. That zone validates opening hours and does nothing else (§8.3) |
| `opening_hours` | `(dealership_id, day_of_week)` with local `time` bounds. **A day with no row is a day the site is closed** — the absence is the datum. Read by the domain, never joined to a booking |
| `service_type` | The catalogue, carrying `duration_minutes` (A-1). **Not dealership-scoped**: one catalogue, every site |
| `service_bay` · `technician` | The two contended resources, each scoped by `dealership_id` (A-3, A-9). The `UNIQUE (id, dealership_id)` on each looks redundant beside the primary key and is not — it is the *target* a composite foreign key needs |
| `technician_qualification` | The join that turns *"a qualified technician"* into a key rather than a check |
| `customer` · `vehicle` | `vehicle` carries its owner and a `UNIQUE (id, customer_id)` for the same reason. **Neither is dealership-scoped**: a customer is not a site's property |
| `appointment` | The booking and its interval. Seven named constraints, and exactly seven |

**The brief's requirement 2 has two halves, and neither is left to application care.** *"A qualified
Technician"* is a composite foreign key from `appointment (technician_id, service_type_id)` to
`technician_qualification`; *"available… for the entire service duration"* is §8.2's exclusion constraint.
The same trick carries A-9 and A-6: composite foreign keys make *"a bay and a technician belong to the
appointment's dealership"* and *"the vehicle belongs to the named customer"* structural rather than
procedural, so booking stays the **single `INSERT`** A-6 depends on, with no validating pre-reads to go
stale.

Four things a reader will wonder about. **`dealership_id`, `service_type_id` and `customer_id` carry no
foreign key of their own, and that is complete rather than missing** — they are covered *transitively*,
and adding the singletons would be **harmful**: with two constraints violable at once, which one
PostgreSQL reports is trigger order, and §8.6 maps `422` *by constraint name*. **Three of the four
composite keys are unreachable from the API**, the system allocating bay and technician (A-10), so a
violation there is a `500` rather than a taxonomy row. **`appointment.id` has no default**, keeping
`btree_gist` the only extension the deployment requires; **`updated_at` has no trigger**, the database
holding the *invariant* and the application the convenience (§11.2 R-10). And **nothing cascades**,
because nothing deletes — cancellation is a status transition.

## 8.2 Persistence and the exclusion constraint

Requirement 2's second half, and the reason this system exists. Reproduced **verbatim**, because
paraphrasing the one thing that must be exactly right is how it stops being so:

```sql
ALTER TABLE appointment ADD CONSTRAINT no_bay_overlap
  EXCLUDE USING gist (bay_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelled');

ALTER TABLE appointment ADD CONSTRAINT no_technician_overlap
  EXCLUDE USING gist (technician_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelled');
```

Six consequences, each of which something elsewhere depends on:

1. **`tstzrange` is half-open, `[starts_at, ends_at)`**, so back-to-back appointments in one bay are
   legal. That *is* A-4 — no buffer — expressed as a bound.
2. **The predicate makes the index partial**, so cancelling frees the slot through the same mechanism
   that guards every write and no compensating release exists to be forgotten.
3. **The constraint names are behaviour, not documentation**: `err.constraint` is what the retry loop
   prunes on and what labels `booking_conflicts_total{resource}`. QS-1 and QS-2 pin them (§11.2 R-3).
4. **An `UPDATE` is checked against other rows, not against the version it replaces — and it is the
   *index* that never sees the superseded version, not a rule anyone wrote.** That is what makes the
   atomic move work, and **the mechanism is the load-bearing half, because the outcome alone is
   satisfiable two ways with completely different concurrency behaviour.** `EXCLUDE USING gist` gets it
   **structurally**: an `UPDATE` writes a new tuple, marks the old one dead, and the index compares the
   new tuple only against *live* entries. A `BEFORE UPDATE` trigger computing overlap gets it **by
   memory**: it reads other rows, so it *does* see the prior version, and is correct only if whoever
   wrote it remembered `WHERE o.id <> NEW.id` — check-then-act with the check moved inside the database,
   two concurrent triggers under `READ COMMITTED` both reading *"free"*. Measured: the naive trigger
   fails the self-overlap step, the patched one passes. So the move rests not on *"a row does not
   conflict with its own prior version"* but on *"the mechanism cannot be made to, because it never sees
   it"*.
5. **`btree_gist` is required** (TC-3): `bay_id WITH =` is an equality operator on a `uuid`, which plain
   GiST cannot index. This is the extension dependency that constrains deployment.
6. **The GiST indexes serve the availability query too**, so the mechanism that costs write throughput
   pays for the read path.

**The one thing this does not give for free** is agreement between the constraint's range expression and
the availability query's: two expressions in two files, held together by QS-8 rather than by a shared
`IMMUTABLE` function, which §4.2 records as a trap.

## 8.3 Time, zones and the calendar

A-8 makes the boundary and the storage **instants**; ADR-0001 then validates opening hours, stated in
wall-clock time. One rule reconciles them:

> **The dealership's zone is used for opening-hours validation and for nothing else. It never enters an
> overlap calculation.**

The wire carries RFC 3339 with an offset, storage is `timestamptz`, overlap is `tstzrange` on the
absolute timeline, opening hours are `time` + `day_of_week` in the local calendar beside an IANA zone,
and duration is **absolute minutes**. **The conversion runs one way only: instant → local wall clock** —
total and single-valued, where the reverse has no answer at a spring-forward and two at a fall-back. Two
consequences look like bugs and are not: a 60-minute job starting 00:30 local on a spring-forward night
ends at **02:30** local, the car being on the ramp for sixty real minutes; and the bookable window shifts
by an hour, in absolute terms, twice a year. Both endpoints must fall within one day's hours, so an
interval whose local start and end land on different days is rejected — no weekly schedule contains it.

`withinOpeningHours` runs six steps in a fixed order, and **the order is asserted**, a mutant that
reorders them being otherwise unkillable: endpoints integral, within ±8 640 000 000 000 000 ms and
`end > start` (`malformed-interval`) → the zone constructs a formatter (`unknown-zone`) → render both
endpoints → same local date (`spans-local-days`) → that weekday has a row (`closed-day`) → the times
parse and `opens ≤ start`, `end ≤ closes` (`malformed-hours` / `outside-window`). Every step fails
closed: a gate that cannot read its own configuration refuses rather than guesses.

**Measured** (`Europe/London`, 09:00–17:00 local): `2026-03-28T08:30:00Z` renders 08:30 GMT and is
**rejected**, while `2026-03-29T08:30:00Z` — the same UTC wall time past spring-forward — renders 09:30
BST and is **accepted**. And `2026-10-25T00:30:00Z` and `2026-10-25T01:30:00Z` both render `01:30` on the
fall-back night and get the **same** verdict, **which is correct**: the doors are in the same state both
times round, and the ambiguity belongs to *local → instant*, which this rule never performs (QS-9). **An
interval ending exactly at local midnight** would otherwise be rejected as spanning two days, refusing a
job that finishes at closing time, so an end rendering `00:00:00` on the day immediately after the
start's normalises to `secondsOfDay = 86400` while a genuine crossing (23:00 to 01:00) stays rejected.

## 8.4 Observability

TC-8 fixes OpenTelemetry with `pino`. §1.2 goal 4 says what for: *the check-then-act window is visible in a
waterfall even though the code never relies on it*, and the invariant is measurable in production rather
than only in tests.

**Spans.** `{METHOD} {path}` carries `http.method`, `http.target` and `http.status_code`, and is
**hand-written rather than auto-instrumented** — a `serverFactory` wrapping the raw handler, so the span
opens before Fastify builds its request (§11.1 D-09-3). `availability.candidates` carries
`candidates.bays` and `candidates.technicians` and is **deliberately separate from the insert**: the gap
between its end and the next span's start *is* the window check-then-act would have raced in, drawn so a
reader can see nothing depends on it. `appointment.insert` carries `booking.attempt`, `bay.id`,
`technician.id`, and on failure `db.sqlstate` and `db.constraint` — **one span per attempt**, so a
retried booking's waterfall shows the retries rather than one long bar. Rescheduling emits
`appointment.update`, same shape and the same attempt loop; cancellation emits `appointment.cancel`.

![One contended booking, span by span](../diagrams/booking-trace.svg)

*Source: [`booking-trace.html`](../diagrams/booking-trace.html) · regenerate with `npm run diagram:export`*

**Metrics.**

| Metric | Type | Labels | Notes |
|---|---|---|---|
| `booking_conflicts_total` | counter | `resource` ∈ {bay, technician}, `outcome` ∈ {absorbed, refused, capped} | **The invariant, made observable.** `absorbed` = retried successfully, `refused` = candidates exhausted, `capped` = the attempt cap hit. Conflating the first two would make the metric unreadable when it matters. A non-zero `capped` is expected today (§11.2 R-4) |
| `appointments_booked_total` | counter | `dealership` | |
| `appointments_rescheduled_total` | counter | `outcome` ∈ {moved, refused} | A move refused for *state* increments neither — §8.6's two `409`s |
| `appointments_cancelled_total` | counter | | |
| `booking_attempts` | histogram | | Attempts per request, at the loop's exit whatever the outcome. Its tail is ADR-0009's ordering working or not |

**`booking_conflicts_total` is incremented on SQLSTATE `23P01` and on nothing else** — never on an HTTP
status code, so a taxonomy change cannot move it — **and from exactly one module**,
`src/application/attemptLoop.ts`, at most once per loop. That second clause fixes *where*: `pg`
auto-instrumentation, a repository span and a use-case span would otherwise count one conflict three
times. A QS-12 marker holds the file set by equality.

**Logs.** `pino` JSON to stdout, one line per request plus one per attempt, **every** line carrying
`trace_id` and `span_id` from a `mixin` over the active context, so Loki and Tempo join without a
correlation id of their own. **Identifiers only, never names**: a line names `customer.id`, not the
customer, so nothing is logged that GDPR-grade handling would have to cover. Export failures are logged
and dropped; a collector outage must not fail a booking.

**What an operator does with this.** §1.2 asks for health, conflicts and latency without a debugger —
three questions, and the signal each is answered from. *Is it up?* `/health`, and the root span's
`http.status_code`. *Is contention rising, or is something broken?* `booking_conflicts_total` by
`outcome`: `absorbed` climbing alongside `appointments_booked_total` is a busy Saturday and needs nobody;
`refused` or `capped` climbing is **capacity**, answerable by adding a bay rather than by reading code;
and a `5xx` rate climbing against a **flat** conflict counter is a fault — the flatness is itself the
evidence, the counter seeing `23P01` and nothing else. *Why did this one fail?* The response's log line
carries `trace_id`; it opens the waterfall above, where each refused attempt names in `db.constraint`
which resource refused it. No reproduction, no debugger. **Latency** is the root span's duration, and
`booking_attempts` beside it separates a request that was slow from one that was merely contended.

## 8.5 Testability

Ownership is fixed by path; this is what each level is *for*.

| Level | Owner | Runs against | What it is for |
|---|---|---|---|
| `tests/unit/` | implementer | `src/`, with the database **driver** stubbed | A design tool, freely rewritable during refactor. **Where the mutation budget is spent** |
| `tests/property/` | test-engineer | the **built artifact** under `dist/`, and real PostgreSQL where the property needs it | `fast-check` over interval arithmetic, candidate ordering, DST — and QS-8 |
| `tests/integration/` | shared; DB-invariant tests are the test-engineer's | Testcontainers PostgreSQL | Single-threaded persistence behaviour |
| `tests/concurrency/` | test-engineer | Testcontainers, several pooled connections | The invariant. Nothing here is simulatable |
| `tests/contract/` | test-engineer | the running service | The emitted OpenAPI document and §8.6's taxonomy |
| `tests/acceptance/` | test-engineer | the running service | *Done*, as the slice's acceptance criteria over HTTP |
| `tests/performance/` | test-engineer | the running service, own container | QS-14's budget |

**A unit test may replace the driver beneath Kysely. It may not replace what the database decides.** The
stub keeps the production dialect and swaps only the transport, so the SQL a test observes is the SQL
PostgreSQL would receive. The boundary is the assertion, not the seam: an outcome mapping, a `catch`, a
released handle or the SQL emitted may be asserted against a stub; a constraint firing, a SQLSTATE, an
ordering or an interleaving may not — §2.1 verbatim. Because `src/domain` has no boundary to reach it
through, an outside-in test loads `dist/domain/*.js` and never `src/`.

Two measured hazards bind every route. **Mutation score is a floor, not a verdict**: Stryker runs through
its `command` runner because `@stryker-mutator/vitest-runner@10.0.0` does not activate mutants under
`vitest@5.0.0` — 118 of 130 survivors on the blocking run had `testsCompleted: 0` — so it is read by the
reviewer rather than gated in CI (§11.2 R-12). **And a TypeBox `response` schema is a serialiser, not an
assertion**: it reshapes what a handler produced on the way out, silently **substituting** the schema's
constant for a wrong `Type.Literal` value and **passing through** a wrong `Type.String({ enum })` value
unvalidated. So a computed enum-valued field is pinned as a `Type.Union` of literals, the only form that
both enforces and does not substitute — and because a union narrowed to one member collapses back to a
literal, §8.6's per-operation cells build a one-member `anyOf` by hand. On the request side the same seam
**strips** rather than rejects (`removeAdditional: true`), so `additionalProperties: false` is
load-bearing for the *published* document rather than a runtime refusal.

## 8.6 Error handling and API semantics

TC-4 fixes REST; A-7 keeps reference data out of the API. Five operations.

| Operation | Endpoint | Success |
|---|---|---|
| Book | `POST /appointments` | `201` + the appointment, naming the allocated bay and technician |
| Read | `GET /appointments/{id}` | `200` |
| Reschedule | `PATCH /appointments/{id}` `{ startsAt }` | `200` — same id |
| Cancel | `POST /appointments/{id}/cancellation` | `200`, idempotent |
| Availability | `GET /availability?dealershipId&serviceTypeId&from&to` | `200`, **advisory** |

`PATCH` for a move, because the mechanism *is* modify-in-place. Cancellation is a sub-resource rather than
`DELETE`: the appointment stays readable at its URL with `status: cancelled`, which `DELETE` would
misdescribe.

Errors are RFC 9457 `application/problem+json` with a stable `type` per failure, so a client distinguishes
cases without parsing prose. **The emitted document says so as built**: each error response is keyed on
that media type and declares only its own operation's `type` values, asserted by equality. `/health`'s
`503` is a health document, outside this surface and excluded by name.

| Status | `type` | Operations | When | Decided by |
|---|---|---|---|---|
| `400` | `/problems/malformed-request` | all five | Schema violation, unparseable timestamp, empty or unparseable JSON body | TypeBox before any handler, or `setErrorHandler` on two named parser codes |
| `400` | `/problems/outside-opening-hours` | book, reschedule | The derived interval leaves the dealership's hours | `domain/openingHours.ts` — **reads no booking** (GC-1) |
| `404` | `/problems/appointment-not-found` | read, reschedule, cancel | The id in the path does not exist | The read a move needs anyway |
| `404` | `/problems/route-not-found` | **none** | The path matches no route — distinct from a missing appointment, which shares the status | `setNotFoundHandler` |
| `409` | `/problems/no-capacity` | book, reschedule | Every candidate refused, or the cap reached. Carries `resource` | **PostgreSQL, `23P01`, repeatedly** |
| `409` | `/problems/appointment-not-confirmed` | reschedule | Moving a cancelled appointment | The guarded `UPDATE`'s zero rows |
| `422` | `/problems/unknown-reference` | book, availability | Unknown dealership, service type, customer or vehicle. Carries `reference` | Reference read, then `23503` |
| `422` | `/problems/vehicle-not-owned` | **book only** | The vehicle is not the named customer's | Composite FK, `23503` (A-6, GC-2) |
| `500` | `/problems/internal` | all five | Reference data the client cannot see or correct — a described class, not a catch-all | The use case, or the fallback handler |

Four deliberate choices in that table. **Ownership failure is a `422`, not a `403`** — validation, not
authorisation. **Two distinct `409`s, and only one touches the conflict metric**: `no-capacity` is
contention, `appointment-not-confirmed` is a state conflict, and the counter counts `23P01` so it cannot
see the second. **Out-of-hours is a `400`**, where `422` would sit more naturally beside the reference
failures; ADR-0001 fixed it as a Gate A ruling and the inconsistency is recorded rather than quietly
harmonised. And **the `500` row is reachable, not only a fallback** — four reference-data faults route to
it, as does a `40P01` — because a `4xx` would ask the caller to correct something they did not send and
cannot see. **The residual is an invariant rather than a row: every response with status ≥ 400 is
`problem+json` carrying a `type` from the closed set**, asserted ∀responses ∃row over a hostile corpus,
the direction that can fail
([ADR-0024](../adr/0024-the-error-taxonomys-residual-is-a-property-not-a-row.md)). A dealership with **no
technician qualified for the requested service type** is `422 /problems/unknown-reference` with
`reference=service-type` — the request names a pair that does not resolve, so nothing to retry.

**The taxonomy is a closed set with one constructor.** The `type` URIs are a single `as const` array, every
response schema is narrowed from it, and the constructor takes that union — so a URI outside the table is a
compile error at the call site, with §8.5's response-schema union as the runtime backstop. The media type
is set per response rather than globally: a `200` arriving as `problem+json` is a worse failure than a
`400` arriving as `application/json`. And use cases return the discriminated unions of §5.2, so the mapping
above is one exhaustive `switch` the compiler checks: adding a domain outcome breaks the build in
`src/http` rather than falling through to a `500`.
