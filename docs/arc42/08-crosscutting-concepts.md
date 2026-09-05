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

### As built at slice 01 — the decision procedure, and the numbers behind it

**The order of the checks is part of the design, not an implementation detail.** `withinOpeningHours`
runs six steps in a fixed order, and the order is asserted, because a mutant that reorders them is
otherwise unkillable:

| # | Step | Verdict if it fails |
|---|---|---|
| 1 | both endpoints are integers and `end > start` | `malformed-interval` |
| 2 | the zone constructs a formatter (an invalid IANA zone throws `RangeError`) | `unknown-zone` |
| 3 | render both endpoints in that zone | — |
| 4 | both renderings fall on the same local date | `spans-local-days` |
| 5 | that local weekday has an `opening_hours` row | `closed-day` |
| 6 | the row's `time` values parse, and `opens ≤ start` and `end ≤ closes` | `malformed-hours` / `outside-window` |

Step 1 exists **only** because the literal AC-6 ruling took the `Interval` type out of this module's
reach; the type used to make an unordered or non-finite pair unrepresentable (§5.2, and §11 D-01-3).
Every step fails closed: a booking gate that cannot read its own configuration refuses rather than
guesses.

**Two rendering options are pinned, and both are correctness choices rather than style.** The locale
is `'en-US'`, never `undefined` — a pure function must not vary with the host's default locale — and
the hour is `hourCycle: 'h23'` rather than `hour12: false`, which has historically rendered midnight
as `24`. The weekday comes from the formatter's `weekday: 'short'` part through an explicit
seven-entry lookup, never hand-rolled calendar arithmetic: a second calendar implementation inside the
one module that must not be subtly wrong is the risk this design exists to avoid.

**The transitions, measured on this runtime rather than reasoned about** (Node 24, full ICU,
`Europe/London` open 09:00–17:00 local). Spring forward is `2026-03-29T01:00:00Z`; fall back is
`2026-10-25T01:00:00Z`.

| Instant | Renders local | Verdict |
|---|---|---|
| `2026-03-28T08:30:00Z` | `Sat 28/03 08:30` (GMT) | **rejected** |
| `2026-03-29T08:30:00Z` | `Sun 29/03 09:30` (BST) | **accepted** |
| `2026-03-29T00:30:00Z` + 60 min | `00:30` → `02:30` local | AC-3: sixty *real* minutes, two wall-clock hours |
| `2026-10-25T00:30:00Z` | `Sun 25/10 01:30` (BST) | same verdict as the row below |
| `2026-10-25T01:30:00Z` | `Sun 25/10 01:30` (GMT) | same verdict as the row above |

The first pair is AC-2's worked pair: the same UTC wall time, the same window, opposite verdicts. The
last pair is the fall-back ambiguous hour — **two distinct instants render identically and the rule
gives them the same verdict, and that is the correct answer**, not something to engineer around. The
doors are either open at 01:30 local or they are not, and they are in the same state both times round.
The ambiguity that makes fall back hard belongs to *local → instant*, and this rule never performs
that conversion. The property test asserts the equality explicitly (QS-9, P5), because a silent green
over the case a reviewer will look for proves nothing.

**A consequence that reads like a bug and is not:** on 25 October a dealership open 00:00–06:00 local
is open for **seven** absolute hours, and on 29 March for **five**. The rule produces that without
knowing it, because it never counts hours.

**One case the as-built rule gets wrong, recorded here rather than in a commit message.** An interval
ending exactly at local midnight is rejected as `spans-local-days` — its end renders on the next local
date. A job finishing at closing time on a dealership open until 00:00 is therefore refused. The time
parser accepts `'24:00:00'` and normalises it to 86 400 seconds-of-day precisely to describe such a
window, so the two halves disagree and the `'24:00:00'` arm is currently unreachable. **[ADR-0015](../adr/0015-an-interval-ending-at-local-midnight-does-not-span-two-days.md) settles it
and was accepted on 2026-09-05**: an interval ending at local midnight ends on the day it started, so
an end rendering as `00:00:00` on the local date immediately following the start's is normalised to
`secondsOfDay = 86400` before step 4's comparison — and a genuine crossing, 23:00 to 01:00, stays
rejected. The decision is agreed; the code is not yet written. Slice 13 is the agreed remedy, and §11
carries it under *Agreed and unbuilt* because the generated register cannot.

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
| `tests/property/` | test-engineer | the **built artifact** under `dist/`, and real PostgreSQL only where the property needs it | `fast-check` over interval arithmetic, candidate ordering, opening hours across DST — and QS-8, which is the only thing holding the availability query and the exclusion constraint in agreement. **Split by database need**, not by subject: see *How an outside-in test reaches a module with no boundary* below |
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

### How an outside-in test reaches a module with no boundary

Every level in the table above except `tests/unit/` reaches the system the way a client does, and
`outside-in-tests-do-not-import-src` enforces it. **`src/domain` has no boundary to reach it through.**
QS-9 is a property over three pure functions with no HTTP route and no SQL; the rule forbids the
property test from importing them; and widening the rule does not even work, because a literal dynamic
`import()` of a module that does not exist yet fails `tsc`, which fails the `verify` job, which makes
`red-proof` reject the red commit. Two phase-2 artifacts of this design contradicted each other, and
the contradiction was structural rather than a matter of degree.

**Three clauses resolve it, and all three are built and in force at `f661988`.**
[ADR-0013](../adr/0013-outside-in-tests-exercise-the-built-artifact.md) was raised by the architect at
slice 01 step 1, revised twice before ratification, and **accepted on 2026-09-05, after Gate E** — as
a separate act from the merge, because a merge is not a ratification and slice 01 merged with this
decision still open. It is immutable from here and can only be superseded.

1. **An outside-in test reaches a pure module through the built artifact.** It loads
   `dist/domain/*.js` — the output of `npm run build`, which `pretest` guarantees is current — never
   `src/`. The dependency rule stands unwidened, and the test exercises the thing that ships rather
   than the thing that compiles. It costs a dynamic `import()` and an `await` in each test file.
2. **`tests/property/` splits by whether the property needs a database.** A property test that talks
   to PostgreSQL is named `*.db.test.ts` and runs in the `db` project behind
   `globalSetup: tests/setup/postgres.ts`; everything else runs in `nodb` with no container. QS-9's
   `opening-hours-dst.test.ts` needs no database and runs in `nodb` — which also means a Docker
   failure can no longer turn its red evidence into a `globalSetup` crash instead of an assertion
   failure.
3. **`npm test` runs the two projects as separate invocations, and a project that did not run is a
   loud failure.** It is `tools/ci/run-tests.mjs`, not `vitest run`; a missing or empty project report
   exits `EXIT_DID_NOT_RUN = 2` rather than merging as zero failures. This clause was **not** part of
   the ADR as first written — it was added after objection T-01-2 was **ruled (c), a design defect,
   naming `CLAUDE.md` §2.4**. §7.2 carries the measurement and the failure mode.

**What the mechanisms do not catch, measured rather than assumed.** The source scan beside the rule
catches **relative** `../src/` references — the form a test reaches for first — and catches neither
root-anchored path construction (`join(ROOT, 'src', 'domain', …)`) nor any other computed form;
`dependency-cruiser` catches no computed form at all. The hole is **narrowed, not closed**, and the
residue is review. A text scan cannot separate *constructing a path to `src/`* from *importing from
`src/`*, because at the level it reads the source those are the same characters — widening the pattern
would false-positive on the scan's own host file, which constructs exactly such a path. §11 carries the
residue, and this document does not promise a cleverer regex that will not arrive.

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

### Mutation testing does not run through Stryker's Vitest runner, and the reason is a false negative

`CLAUDE.md` §10 makes a mutation score part of Definition of Done and `tools/slice/check.mjs` gates
on **0.75**,
so a slice cannot reach `done` without this running. It is run by the **reviewer** at step 5 and
deliberately not in CI: survivors are findings for a role that wrote neither the tests nor the code,
and a number in a pipeline answers that question by ignoring it. Scope is `src/**` less `main.ts`.

**It runs through Stryker's `command` runner, over a separate `vitest.mutation.config.ts`, and that is
a workaround for a measured defect rather than a preference.**
`@stryker-mutator/vitest-runner@10.0.0` **does not activate mutants** under `vitest@5.0.0`. Its peer
range is `vitest: ">=2.0.0"`, so npm warns about nothing — the same shape as `dependency-cruiser`'s
TypeScript range in §5.3, and the same shape as everything else this project keeps finding: a tool
reporting a number over work it never did.

The evidence, from the run whose 6.34 score the human ruled blocking:

| Measured | |
|---|---|
| survivors that ran no test at all | **118 of 130** had `testsCompleted: 0` in `mutation.json` — Stryker ran nothing against them and recorded them as *survived* |
| `src/application/checkHealth.ts` | **every** mutant survived, including the one that empties the whole function body, against a file with six dedicated tests |
| the same mutant, activated by hand | in Stryker's own unmodified sandbox, `__STRYKER_ACTIVE_MUTANT__=0 npx vitest run -c vitest.mutation.config.ts` makes **five of those tests fail**. The mutant is killed. The runner simply never ran them |
| same tree, same mutants, command runner | **76.06** rather than 6.34; `config.ts` 90.28 rather than 1.39 |

A second defect in the same runner: `--logLevel debug` crashes it with *"Converting circular structure
to JSON"* at `vitest-test-runner.js:95`, which `JSON.stringify`s the resolved Vitest config — so the
integration cannot be debugged through its own logging.

The command runner has no framework integration to break: Stryker sets `__STRYKER_ACTIVE_MUTANT__`,
runs the command, reads the exit code. It is what a person does by hand, which is why it is
trustworthy, and at this size it costs nothing — 142 mutants in about 33 seconds. Its one consequence
is `coverageAnalysis: 'off'`: with no per-test attribution to collect, every mutant runs the whole
suite. That is the conservative direction — a mutant is never skipped as *not covered* — and it is
what makes *"Ran 1.00 tests per mutant"* in the output mean one full suite run.

**What would make removing the workaround safe.** A future reader upgrading Stryker or Vitest must not
infer from a plausible score that the integration is fixed; the broken runner's tell is not a low
score, it is unrun tests. Re-measure, in this order:

1. Set `testRunner: 'vitest'`, remove `commandRunner`, run `npx stryker run` on an unchanged tree.
2. **Open `reports/mutation/mutation.json` and count mutants with `testsCompleted: 0`.** Over files
   that have unit tests this must be **zero**. Any non-zero count means mutants are not being
   activated, whatever the score says. This is the check that matters and it is the one a score
   comparison alone will not give you.
3. Compare the score against the command runner's on the same tree. A large drop is the same signal
   arriving the slower way.
4. **Positive control**: pick one mutant a test should kill, activate it by hand with
   `__STRYKER_ACTIVE_MUTANT__=<id> npx vitest run -c vitest.mutation.config.ts`, and confirm the
   tests fail. If they fail by hand while Stryker reports *survived*, the integration is still broken
   no matter what changed upstream.
5. Only with 2 and 4 both clean is `coverageAnalysis` worth revisiting — it is `off` because of the
   workaround, not on its own merits.

§11 carries this as a risk, because a Definition-of-Done gate that can report a clean number over
mutants it never activated is a gate that can be passed without being satisfied.

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
