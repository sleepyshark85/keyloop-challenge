# 8. Cross-cutting concepts

> Owner: architect · Written: phase 2, extended per slice

## 8.1 Domain model

Nine tables. Seven are seeded reference data (A-6, A-7); `appointment` is the only one the API
writes, and `opening_hours` is the only one that exists because of a Gate A ruling.

```
 customer 1─┬─* vehicle                    dealership 1─┬─* opening_hours   (ADR-0001)
            │                                           ├─* service_bay     (A-9)
            │                                           └─* technician      (A-3)
            │                                                  │
 service_type *─┴─────────────────── technician_qualification ─┘            (A-3)
      │
      └────────────────────────── appointment ─────────────────────────────
                                  customer · vehicle · service_type ·
                                  technician · bay · [starts_at, ends_at) · status
```

**The brief's requirement 2 has two halves, and neither is left to application care.** *"A qualified
Technician"* is enforced by a composite foreign key from `appointment (technician_id,
service_type_id)` to `technician_qualification`; *"available… for the entire service duration"* is
enforced by the exclusion constraint in §8.2. An appointment naming an unqualified technician is as
unstorable as one that double-books a bay.

The same trick carries A-9 and A-6. Composite foreign keys make *"a bay and a technician belong to
the appointment's dealership"* and *"the vehicle belongs to the named customer"* structural rather
than procedural — so booking stays the **single `INSERT`** A-6's rationale depends on, with no
validating pre-reads to go stale.

### The schema

```sql
-- 0001_extensions.sql
CREATE EXTENSION IF NOT EXISTS btree_gist;      -- TC-3: gist over (uuid =, tstzrange &&)

-- 0002_reference_data.sql
CREATE TABLE dealership (
  id         uuid PRIMARY KEY,
  name       text NOT NULL,
  time_zone  text NOT NULL              -- IANA, e.g. 'Europe/London'  (ADR-0001, A-8)
);

CREATE TABLE opening_hours (             -- a day with no row is a day the dealership is closed
  dealership_id uuid     NOT NULL REFERENCES dealership (id),
  day_of_week   smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),   -- 0 = Sunday
  opens_at      time     NOT NULL,
  closes_at     time     NOT NULL,
  PRIMARY KEY (dealership_id, day_of_week),
  CHECK (closes_at > opens_at)
);

CREATE TABLE service_type (
  id               uuid    PRIMARY KEY,
  name             text    NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0)         -- A-1
);

CREATE TABLE service_bay (
  id            uuid PRIMARY KEY,
  dealership_id uuid NOT NULL REFERENCES dealership (id),
  name          text NOT NULL,
  UNIQUE (id, dealership_id)             -- target for appointment's composite FK  (A-9)
);

CREATE TABLE technician (
  id            uuid PRIMARY KEY,
  dealership_id uuid NOT NULL REFERENCES dealership (id),                -- A-3
  name          text NOT NULL,
  UNIQUE (id, dealership_id)
);

CREATE TABLE technician_qualification (
  technician_id   uuid NOT NULL REFERENCES technician (id),
  service_type_id uuid NOT NULL REFERENCES service_type (id),
  PRIMARY KEY (technician_id, service_type_id)
);

CREATE TABLE customer (
  id uuid PRIMARY KEY, name text NOT NULL
);

CREATE TABLE vehicle (
  id          uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customer (id),                    -- A-6: one owner
  vin         text NOT NULL UNIQUE,
  description text NOT NULL,
  UNIQUE (id, customer_id)
);

-- 0003_appointment.sql
CREATE TYPE appointment_status AS ENUM ('confirmed', 'cancelled');

CREATE TABLE appointment (
  id              uuid PRIMARY KEY,
  dealership_id   uuid NOT NULL,
  customer_id     uuid NOT NULL,
  vehicle_id      uuid NOT NULL,
  service_type_id uuid NOT NULL,
  technician_id   uuid NOT NULL,
  bay_id          uuid NOT NULL,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  status          appointment_status NOT NULL DEFAULT 'confirmed',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT appointment_interval_ordered CHECK (ends_at > starts_at),

  -- Requirement 2, first half: the technician is QUALIFIED for this service type.
  CONSTRAINT appointment_technician_qualified
    FOREIGN KEY (technician_id, service_type_id)
    REFERENCES technician_qualification (technician_id, service_type_id),

  -- A-9: resources belong to the appointment's dealership. Never spans dealerships.
  CONSTRAINT appointment_bay_in_dealership
    FOREIGN KEY (bay_id, dealership_id)        REFERENCES service_bay (id, dealership_id),
  CONSTRAINT appointment_technician_in_dealership
    FOREIGN KEY (technician_id, dealership_id) REFERENCES technician  (id, dealership_id),

  -- A-6 / ADR-0002: the vehicle belongs to the named customer. Validation, not authorisation.
  CONSTRAINT appointment_vehicle_owned_by_customer
    FOREIGN KEY (vehicle_id, customer_id)      REFERENCES vehicle     (id, customer_id)
);
```

### As built at slice 00

The schema above **is** what merged, statement for statement, across `0001_extensions.sql`,
`0002_reference_data.sql` and `0003_appointment.sql` (ADR-0007). It had never been executed when it
was written at Gate B; it applies clean to an empty `postgres:16`, and `pgmigrations` recording those
three names is asserted by the suite. Ten acceptance criteria hold it — AC-10 was **added by the human
at the gate** on 2026-09-04 and is discussed under §8.2 consequence 4.

Five things a reader of the schema above will wonder about, settled rather than left to inference:

- **Three columns carry no foreign key of their own, and that is complete rather than missing.**
  `dealership_id`, `service_type_id` and `customer_id` are each covered *transitively*: an unknown
  dealership fails `appointment_bay_in_dealership`, an unknown service type fails
  `appointment_technician_qualified`, an unknown customer fails
  `appointment_vehicle_owned_by_customer`. Adding the singletons as well would be redundant **and
  harmful**: with two constraints violable at once, which one PostgreSQL reports is trigger order, and
  §8.6 maps `422 /problems/unknown-reference` *by constraint name*. That absence is now asserted — the
  set of non-primary-key constraints on `appointment` is exactly seven.
- **Three of the four composite keys are unreachable from the API.** Under A-10 the *system* allocates
  the bay and the technician, so `appointment_bay_in_dealership`,
  `appointment_technician_in_dealership` and `appointment_technician_qualified` can only be violated
  by a bug in the allocator — defence in depth, and correctly absent from §8.6's taxonomy, where such
  a violation is a `500`. Only `appointment_vehicle_owned_by_customer` is client-reachable. **This is
  therefore the only slice in which those three can be shown to fire at all**, which is why they were
  tested here and not deferred.
- **`appointment.id` has no default.** No `gen_random_uuid()`, so no `pgcrypto` and no `uuid-ossp`;
  `btree_gist` stays the only extension the deployment requires (§7.1). The writer supplies the id,
  consistent with A-10.
- **`updated_at` has `DEFAULT now()` and no trigger.** Nothing maintains it. ADR-0003's move is an
  `UPDATE`, so unless that statement sets it explicitly the column will be wrong from slice 06 onward.
  Deliberate — the database holds the *invariant*, the application holds the convenience — and carried
  as debt in §11.2 R-10.
- **Nothing cascades.** No `ON DELETE` clause anywhere, correctly, because nothing in this system
  deletes: cancellation is a status transition (ADR-0003). The down migrations drop child-first for
  the same reason — a `CASCADE` would drop whatever a wrong order got wrong instead of failing on it.

**Four reference-table constraints are specified here and asserted by nothing (R00-5).**
`opening_hours`'s `day_of_week BETWEEN 0 AND 6` and `closes_at > opens_at`, `service_type`'s
`duration_minutes > 0`, and `vehicle.vin`'s `UNIQUE`. All four were measured to exist and to fire, and
all four can be dropped with the entire suite green. Every *other* reference-table constraint is
structurally self-enforcing — the `UNIQUE (id, dealership_id)` pairs and the qualification primary key
are foreign-key targets, so dropping one fails `0003`. These four have no such backstop, and
**slice 01's opening-hours and duration code will assume two of them hold.** Carried in §11.2 R-11.

## 8.2 Persistence and the exclusion constraint

Requirement 2's second half, and the reason this system exists. Reproduced from `CLAUDE.md` §2.1
**verbatim**, because paraphrasing the one thing that must be exactly right is how it stops being
exactly right:

```sql
ALTER TABLE appointment ADD CONSTRAINT no_bay_overlap
  EXCLUDE USING gist (bay_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelled');

ALTER TABLE appointment ADD CONSTRAINT no_technician_overlap
  EXCLUDE USING gist (technician_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelled');
```

Six consequences, each of which something elsewhere in this document depends on:

1. **`tstzrange` is half-open, `[starts_at, ends_at)`.** 09:00–10:00 and 10:00–11:00 do **not**
   overlap, so back-to-back appointments in one bay are legal. That *is* A-4 — no setup or cleanup
   buffer — expressed in a bound rather than in prose.
2. **The predicate makes the index partial.** Cancelling removes a row from the constraint's scope
   without deleting it, so the slot frees itself through the same mechanism that guards every write
   (§6.4). No compensating release exists to be forgotten.
3. **The constraint's names are behaviour, not documentation.** `err.constraint` is what
   ADR-0009 prunes on and what labels `booking_conflicts_total{resource}`. Renaming
   `no_bay_overlap` silently degrades the retry loop and mislabels the metric; QS-1 and QS-2 pin the
   names.
4. **An `UPDATE` is checked against other rows, not against the version it replaces — and it is the
   *index* that never sees the superseded version, not a rule anyone wrote.** This is what makes
   ADR-0003's atomic move work at all, and what lets an appointment be extended or nudged onto an
   interval overlapping its own. **Asserted by AC-10** at slice 00, at the SQL level, before any
   application code existed.

   **The mechanism is the load-bearing part, and stating only the outcome was a defect in this
   section.** The sentence above used to end at *"the version it replaces"*, and the test-engineer
   showed at slice 00 step 5 that an outcome-worded consequence is satisfiable two ways with
   completely different concurrency behaviour:

   | | How it gets the property | What it costs |
   |---|---|---|
   | **`EXCLUDE USING gist`** (what §2.1 mandates) | **Structurally.** An `UPDATE` writes a new tuple and marks the old one dead; the index insertion compares the new tuple against *live* index entries, and the superseded version is not one. Nobody had to think of it, and nobody can forget it | Nothing. It is a property of MVCC and of index-enforced exclusion |
   | **A `BEFORE UPDATE` trigger** computing overlap | **By memory.** It reads other rows, so it *does* see the row's own prior version, and it is correct only if whoever wrote it remembered `WHERE o.id <> NEW.id` | Everything. A trigger is check-then-act with the check moved inside the database: two concurrent triggers under `READ COMMITTED` both read *"free"* |

   **This was measured, not argued.** The test-engineer mutant-checked AC-10 against exactly the
   check-then-act trigger `CLAUDE.md` §2.1 forbids: the naive form fails AC-10's self-overlap step,
   and **the patched form — one `o.id <> NEW.id` predicate — passes all three steps.** So a future
   slice could satisfy this consequence, pass AC-10, and have lost the concurrency guarantee
   entirely, which is the substitution §2.1 forbids on the `INSERT` path arriving by the `UPDATE`
   path instead.

   **So the consequence ADR-0003 rests on is not *"a row does not conflict with its own prior
   version"*. It is *"the mechanism cannot be made to conflict with it, because it never sees
   it."*** A single-threaded test can only ever establish the first. The second is what makes
   `CLAUDE.md` §2.1's ban on check-then-act cover rescheduling as well as booking, and it is why
   ADR-0003 could prohibit delete-then-insert without also having to prohibit a trigger — it did not
   anticipate that a trigger satisfying the outcome would be available.

   > **Inherited obligation for slice 06 (reschedule).** AC-10 fixes the **single-threaded** `UPDATE`
   > semantics, and deliberately nothing more. ADR-0003 claims that *"two racing reschedules onto the
   > same slot behave exactly like two racing bookings: one commits, the other gets `23P01`"* — and
   > **no scenario and no test asserts that.** QS-4 and QS-5 assert what a *refused* move leaves
   > behind; QS-6 asserts the self-overlap AC-10 now covers. The mirror of QS-1 on the `UPDATE` path —
   > *N* simultaneous moves onto one slot, exactly one committing — is named by nothing.
   >
   > The patched trigger is the proof that this gap is real rather than theoretical: it passes
   > everything slice 00 asserts and fails only under simultaneity, which is the one condition
   > nothing yet applies to an `UPDATE`. **Slice 06 owes a concurrency test for racing moves**, and it
   > is written here rather than left for slice 06 to notice because the last obligation left to be
   > noticed was AC-10 itself — named in §8.5 beside cancellation-frees-the-slot, deferred by this
   > section to a QS-6 with no slice, and carried by none of the three until the human added it at a
   > gate.
5. **`btree_gist` is required** (TC-3), because `bay_id WITH =` is an equality operator on a `uuid`
   and plain GiST cannot index it. This is the extension dependency that constrains deployment.
6. **The GiST indexes serve the availability query too.** Its `tstzrange(...) && ...` predicate over
   non-cancelled rows is exactly what these partial indexes cover, so the mechanism that costs write
   throughput (§11.2) pays for the read path.

**The one thing this does not give for free** is agreement between the constraint's range expression
and the availability query's. They are two expressions in two files. §4.2 records why a shared
`IMMUTABLE` SQL function is a trap — redefining one that a GiST index depends on does not rebuild the
index, it silently corrupts it — so the agreement is held by QS-8, a property test, instead.

## 8.3 Time, zones and the calendar

A-8 decided that the boundary and the storage are **instants**. ADR-0001 then made that load-bearing
by validating opening hours, which are stated in wall-clock time. The two coexist under one rule:

> **The dealership's zone is used for opening-hours validation and for nothing else. It never enters
> an overlap calculation.**

| Concern | Representation |
|---|---|
| API request and response | RFC 3339 with an offset — `2026-09-08T09:00:00+01:00` |
| Storage | `timestamptz` (an instant; PostgreSQL stores UTC) |
| Overlap | `tstzrange` over those instants — decided on the absolute timeline, immune to zone and DST bugs |
| Opening hours | `time` + `day_of_week` in the dealership's local calendar, plus an IANA zone on the dealership |
| Duration | **Absolute minutes**, added to the start instant |

**The conversion runs one way only: instant → local wall clock**, via
`Intl.DateTimeFormat(…, { timeZone }).formatToParts()` in `src/domain/openingHours.ts`. That
direction is chosen because it is *total and unambiguous*, and the other is neither: at a
spring-forward, local 01:30 does not exist; at a fall-back, local 01:30 happens twice. Every instant,
by contrast, has exactly one rendering in a zone. A rule that converts the other way has to answer
questions with no answer; this one never encounters them.

Two consequences worth stating because they look like bugs and are not:

- **Duration is added in absolute time.** A 60-minute job starting at 00:30 local on a spring-forward
  night ends at 02:30 local, not 01:30. The car is on the ramp for sixty real minutes; wall clocks
  are not what occupies a bay.
- **The bookable window shifts by an hour, in absolute terms, twice a year.** A dealership open
  09:00–17:00 local is a different pair of instants in summer and winter. That is the correct
  behaviour and it is the reason QS-9 exists — the check is the only wall-clock reasoning in the
  system, and zone bugs are notoriously easy to write and hard to see.

Both `starts_at` and `ends_at` must fall within one day's opening hours (ADR-0001: *"a job that
starts twenty minutes before closing and runs an hour past it is rejected"*). An interval whose local
start and end fall on different days is therefore rejected too — no weekly schedule can contain it.
Holidays, one-off closures and mid-day breaks are not modelled (§3.3), and land in this module when
they are.

## 8.4 Observability

`CLAUDE.md` §3 and TC-8 fix OpenTelemetry with `pino`. §1.2 goal 4 says what for: *the check-then-act
window is visible in a waterfall even though the code never relies on it*, and the invariant is
measurable in production rather than only in tests.

### Spans

| Span | Attributes | Why it is its own span |
|---|---|---|
| `POST /appointments` | route, status, `request.id` | Fastify server span (auto) |
| `booking.validate` | `dealership.id`, `service_type.id`, `opening_hours.ok` | Reference read plus the pure rule. Cheap, and an out-of-hours refusal should be visibly cheap (ADR-0001) |
| `availability.candidates` | `candidates.bays`, `candidates.technicians` | **Deliberately separate from the insert.** The gap between this span's end and the next one's start *is* the window check-then-act would have raced in. Nothing depends on it; it is drawn so a reader can see it is not depended on |
| `appointment.insert` | `booking.attempt`, `bay.id`, `technician.id`; on failure `db.sqlstate`, `db.constraint` | **One span per attempt**, so a retried booking's waterfall shows the retries rather than one long bar. This is what makes ADR-0004's loop legible in production |

Rescheduling emits `appointment.update` with the same shape; cancellation emits
`appointment.cancel`.

### Metrics

| Metric | Type | Labels | Notes |
|---|---|---|---|
| `booking_conflicts_total` | counter | `resource` ∈ {bay, technician}, `outcome` ∈ {absorbed, refused, capped} | **The invariant, made observable.** `absorbed` = retried successfully; `refused` = candidates exhausted; `capped` = ADR-0009's attempt cap hit. ADR-0004 requires the first two to be distinguishable — conflating them makes the metric unreadable at the moment it matters. A non-zero `capped` in production means the cap is wrong |
| `appointments_booked_total` | counter | `dealership` | |
| `appointments_rescheduled_total` | counter | `outcome` ∈ {moved, refused} | ADR-0003's second act |
| `appointments_cancelled_total` | counter | | |
| `booking_attempts` | histogram | | Attempts per request. Its tail is ADR-0009's ordering policy working or not |
| `availability_query_duration_seconds` | histogram | | Goal 5's budget (QS-14) |

**`booking_conflicts_total` is incremented on SQLSTATE `23P01` and on nothing else** — never on an
HTTP status code. That is the same discipline ADR-0001 applied when it made an out-of-hours request a
`400`: the metric measures contention, and a taxonomy change must not be able to move it.

### Logs

`pino` JSON to stdout, one line per request plus one per attempt, each carrying `trace_id` and
`span_id` from the active context so Loki and Tempo join without a correlation id of their own.
**Identifiers only, never names** — a log line names `customer.id`, not the customer (§3.3 excludes
GDPR-grade handling, so the cheapest mitigation is to log nothing that would need it).

Telemetry export failures are logged and dropped. A collector outage must not fail a booking (§7.1).

## 8.5 Testability

`CLAUDE.md` §5 fixes ownership by path. This is what each level is *for*, which is the part the path
rule does not say.

| Level | Owner | Runs against | What it is for |
|---|---|---|---|
| `tests/unit/` | implementer | `src/`, with the database's **driver** stubbed where a container is not needed | A design tool, freely rewritable during refactor. **This is where the Stryker mutation budget is spent** — scoped to `src/**` less `main.ts`, and see *What a unit test may substitute* below, which is narrower than "`src/domain` is the whole unit-testable surface" |
| `tests/property/` | test-engineer | `src/domain` and real PostgreSQL | `fast-check` over interval arithmetic, candidate ordering, opening hours across DST — and QS-8, which is the only thing holding the availability query and the exclusion constraint in agreement |
| `tests/integration/` | shared; DB-invariant tests are the test-engineer's | Testcontainers PostgreSQL | Single-threaded persistence behaviour: self-overlapping reschedule, cancellation releasing a slot |
| `tests/concurrency/` | test-engineer | Testcontainers PostgreSQL, several pooled connections | The invariant. Genuinely simultaneous statements; nothing here is simulatable |
| `tests/contract/` | test-engineer | the running service | The emitted OpenAPI document, and the error taxonomy of §8.6 |
| `tests/acceptance/` | test-engineer | the running service | *Done*, expressed as the slice's acceptance criteria over HTTP |

Two structural supports rather than conventions:

- **`outside-in-tests-do-not-import-src`** (§5.3) forbids every test directory the test-engineer owns
  — as built, `acceptance`, `contract`, `property`, `concurrency`, `architecture`, `performance`,
  `setup` and `support` — from importing `src/`. The path hook cannot catch this, because the file
  being written is one the test-engineer legitimately owns; `dependency-cruiser` can. It is OC-5 and
  METHODOLOGY P4 made structural: tests that define *done* reach the system the way a client does.
  `setup/` and `support/` were added at 00a to close the indirect route — a `globalSetup` or a spawn
  helper that imports `src/` and hands it to a test that may not.
- **Isolation is by data, not by truncation** (§7.2). Each test seeds its own dealership, so the
  suite parallelises and every test is implicitly asserting A-9's scoping.

### What a unit test may substitute, and where the line actually falls

§5.2 said at Gate B that removing the repository port left `src/domain` as the whole unit-testable
surface. Slice 00a falsified that: `checkHealth` is a use case in `src/application`, takes a `Db`, and
is unit-tested with no container at all. The line `CLAUDE.md` §2.2 draws is not the one this section
first assumed, so it is restated here in the form that is true.

**A unit test may replace the driver beneath Kysely. It may not replace what the database decides.**
The stub keeps the production dialect — compiler, adapter, introspector — and swaps only the
transport, so the SQL a test observes is the SQL PostgreSQL would receive, and a `catch` block that a
reachable database would never enter becomes reachable. That is how `pingDatabase` is proved not to
rethrow a driver error, and how a released connection is proved released.

The boundary is the assertion, not the seam:

| The assertion is about | Legitimate substitute | Why |
|---|---|---|
| the code *around* the database — an outcome mapping, a `catch`, a released handle, the SQL emitted | driver stub, `tests/unit/` | The database's answer is not the evidence; the code's response to a given answer is |
| what the database **decides** — a constraint firing, a SQLSTATE, an ordering, an interleaving | **none.** Real PostgreSQL, `tests/integration/` or `tests/concurrency/` | This is `CLAUDE.md` §2.2 verbatim, and §4.1's reason: the invariant lives in the database, so a test that substitutes it tests the substitute's imitation — and the imitation would necessarily be check-then-act |

Stated this way the rule keeps its teeth while being true. "Nothing outside `domain` is unit-testable"
was easy to state and false, and a rule that is visibly false is a rule the next person routes around
on their own judgement.

### The response-schema seam is a serialiser, not an assertion

**A TypeBox `response` schema does not validate what a handler produced. It reshapes it on the way
out**, through `fast-json-stringify`, and it has four distinct behaviours that the design, the route
docblock and the unit test all described as one. Measured on this repository's pinned Fastify, at
step 5 by the reviewer and re-run independently at step 7:

| The handler sends | On the wire | Behaviour |
|---|---|---|
| an undeclared property | dropped | **stripped** |
| a required property missing | `500 Internal Server Error` | **enforced** — the only case that fails loudly |
| a wrongly-typed value (`"42"` for a number) | `42` | **coerced**, silently |
| a wrong value for a `Type.Literal` | **the schema's constant** | **substituted**, silently |

The fourth is the dangerous one and it is a property of every route this system will have, which is
why it is here rather than in a commit message. **A handler emitting `{status:'', checks:{database:''}}`
produces a byte-identical `200 {"status":"ok","checks":{"database":"up"}}`** — which is why four
mutants of the health route survived a suite that looked thorough. The committed test proving *"the
schema is enforcement rather than decoration"* proves **stripping**, on a throwaway route with a plain
string schema. **Nothing proves substitution, and nothing can, from the wire.**

Two consequences bind every later slice:

1. **Where a value is computed, the schema must not pin it.** §8.6's taxonomy gives each status code a
   `type` URI; expressed as a `Type.Literal` per code, a handler's computed URI is silently rewritten
   to the constant. A contract test asserting on the response body then reads the constant back and
   passes — **QS-11's own test unable to fail for the reason it names.** Either the schema does not
   pin the value, or the test does not assert it from the body.
2. **A test through this seam proves the schema, not the handler.** To hold a handler to a computed
   value, assert on what the handler passed to `send`, not on what arrived. Everything an assertion on
   the wire body can tell you about a pinned field, it would tell you about an empty handler too.

The general form, and it is the same sentence this slice kept rediscovering elsewhere: **a green
signal is evidence only for the work it actually did.** Serialisation is not validation, and a
response body is a claim about the schema until something independent proves it is also a claim about
the code.

Two directories in §10 were **not** in `CLAUDE.md` §5's ownership table: `tests/architecture/`
(QS-10, QS-12) and `tests/performance/` (QS-14). Both assert properties of the design rather than of
a slice, and neither needs to read `src/` to be written — the assertions come from arc42 §5 and from
ADR-0008. The architect proposed both to the test-engineer, on the same reasoning as the other
outside-in directories, and **the human ruled that way at Gate B on 2026-09-04**. §5 now lists them,
and `.claude/hooks/guard-paths.mjs` guards them: the ruling is enforced by path like every other
ownership rule, with four cases in `tools/test/guard-paths.test.mjs` proving it fires in both
directions.

## 8.6 Error handling and API semantics

### The surface

TC-4 fixes REST; A-7 keeps reference data out of the API. Five operations.

| Operation | Endpoint | Success |
|---|---|---|
| Book | `POST /appointments` | `201` + the appointment, naming the allocated bay and technician |
| Read | `GET /appointments/{id}` | `200` |
| Reschedule | `PATCH /appointments/{id}` `{ startsAt }` | `200` — same id (ADR-0003) |
| Cancel | `POST /appointments/{id}/cancellation` | `200`, idempotent |
| Availability | `GET /availability?dealershipId&serviceTypeId&from&to` | `200`, **advisory** |

`PATCH` for a move because ADR-0003's mechanism *is* "modify this resource in place"; the verb and
the `UPDATE` say the same thing. Cancellation is a sub-resource rather than `DELETE` because the
appointment remains readable at its URL afterwards, with `status: cancelled` — which `DELETE` would
misdescribe. The availability response carries an explicit advisory flag and says so in its OpenAPI
description, because staleness is a property of the domain interface and not an implementation detail
(§3.1, §4.1).

### Status codes

Errors are RFC 9457 `application/problem+json`, with a stable `type` per failure so a client
distinguishes cases without parsing prose. §3.2 called the media type an obvious candidate and left
it to Gate B; it is decided here.

| Status | `type` | When | Decided by |
|---|---|---|---|
| `400` | `/problems/malformed-request` | Schema violation, unparseable timestamp | TypeBox, before any handler (ADR-0005) |
| `400` | `/problems/outside-opening-hours` | The derived interval leaves the dealership's hours | `domain/openingHours.ts` — **reads no booking** (GC-1) |
| `404` | `/problems/appointment-not-found` | The id in the path does not exist | The `UPDATE`'s zero rows |
| `409` | `/problems/no-capacity` | Every candidate refused, or the cap reached (ADR-0004, ADR-0009). Carries `resource` | **PostgreSQL, `23P01`, repeatedly** |
| `409` | `/problems/appointment-not-confirmed` | Moving a cancelled appointment (ADR-0003) | Appointment status |
| `422` | `/problems/unknown-reference` | Unknown dealership, service type, customer or vehicle. Carries `reference` | Reference read, then `23503` |
| `422` | `/problems/vehicle-not-owned` | The vehicle is not the named customer's | Composite FK, `23503` (A-6, GC-2) |
| `500` | `/problems/internal` | Anything else | — |

Three deliberate choices in that table:

- **Ownership failure is a `422`, not a `403`.** ADR-0002 is explicit: it is validation, not
  authorisation. No deliberate ambiguity about whether the vehicle exists, and no audit event.
- **Two distinct `409`s, and only one of them touches the conflict metric.** `no-capacity` is
  contention; `appointment-not-confirmed` is a state conflict. `booking_conflicts_total` counts
  `23P01`, so it cannot see the second (§8.4).
- **Out-of-hours is a `400` although `422` would sit more naturally beside the reference failures.**
  ADR-0001 fixed the code, ADR-0001 is a Gate A ruling, and OC-4 means the architect may not revisit
  it. The inconsistency is real and is recorded here rather than quietly harmonised; changing it means
  superseding the ADR.

### Outcomes, not exceptions

Use cases return the discriminated unions of §5.2, so the mapping above is one exhaustive `switch`
that the compiler checks. Adding a domain outcome breaks the build in `src/http` rather than falling
through to a `500` — which is the cheapest available guarantee that a known failure never renders as
an unknown one.
