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
enforced by §8.2's exclusion constraint. An appointment naming an unqualified technician is as
unstorable as one that double-books a bay. The same trick carries A-9 and A-6: composite foreign keys
make *"a bay and a technician belong to the appointment's dealership"* and *"the vehicle belongs to the
named customer"* structural rather than procedural, so booking stays the **single `INSERT`** A-6's
rationale depends on, with no validating pre-reads to go stale.

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

The schema above is what runs, statement for statement, across `0001_extensions.sql`,
`0002_reference_data.sql` and `0003_appointment.sql` (ADR-0007). Five things a reader will wonder
about, settled rather than left to inference:

- **Three columns carry no foreign key of their own, and that is complete rather than missing.**
  `dealership_id`, `service_type_id` and `customer_id` are covered *transitively* by the three
  composite keys. Adding the singletons would be redundant **and harmful**: with two constraints
  violable at once, which one PostgreSQL reports is trigger order, and §8.6 maps
  `422 /problems/unknown-reference` *by constraint name*. The absence is asserted — the set of
  non-primary-key constraints on `appointment` is exactly seven.
- **Three of the four composite keys are unreachable from the API.** Under A-10 the *system* allocates
  the bay and the technician, so those three can only be violated by a bug in the allocator — defence
  in depth, and correctly absent from §8.6's taxonomy, where such a violation is a `500`. Only
  `appointment_vehicle_owned_by_customer` is client-reachable.
- **`appointment.id` has no default**, so no `pgcrypto` and no `uuid-ossp`: `btree_gist` stays the only
  extension the deployment requires (§7.1). The writer supplies the id, consistent with A-10.
- **`updated_at` has `DEFAULT now()` and no trigger.** Nothing maintains it, deliberately — the
  database holds the *invariant*, the application holds the convenience — so ADR-0003's `UPDATE` must
  set it explicitly. Carried as debt in §11.2 R-10.
- **Nothing cascades.** No `ON DELETE` clause anywhere, because nothing in this system deletes:
  cancellation is a status transition (ADR-0003). The down migrations drop child-first for the same
  reason — a `CASCADE` would drop whatever a wrong order got wrong instead of failing on it.

Four reference-table constraints are specified above and asserted by nothing; §11.2 R-11a carries
them, and which two slice 01's code assumes.

## 8.2 Persistence and the exclusion constraint

Requirement 2's second half, and the reason this system exists. Reproduced from `CLAUDE.md` §2.1
**verbatim**, because paraphrasing the one thing that must be exactly right is how it stops being so:

```sql
ALTER TABLE appointment ADD CONSTRAINT no_bay_overlap
  EXCLUDE USING gist (bay_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelled');

ALTER TABLE appointment ADD CONSTRAINT no_technician_overlap
  EXCLUDE USING gist (technician_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelled');
```

Six consequences, each of which something elsewhere in this document depends on:

1. **`tstzrange` is half-open, `[starts_at, ends_at)`**, so 09:00–10:00 and 10:00–11:00 do not overlap
   and back-to-back appointments in one bay are legal. That *is* A-4 — no buffer — expressed in a
   bound rather than in prose.
2. **The predicate makes the index partial.** Cancelling removes a row from the constraint's scope
   without deleting it, so the slot frees itself through the same mechanism that guards every write
   (§6.4), and no compensating release exists to be forgotten.
3. **The constraint's names are behaviour, not documentation.** `err.constraint` is what ADR-0009
   prunes on and what labels `booking_conflicts_total{resource}`; QS-1 and QS-2 pin the names, and
   §11.2 R-3 carries the coupling.
4. **An `UPDATE` is checked against other rows, not against the version it replaces — and it is the
   *index* that never sees the superseded version, not a rule anyone wrote.** That is what makes
   ADR-0003's atomic move work, and what lets an appointment be extended or nudged onto an interval
   overlapping its own. Asserted by AC-10, at the SQL level.

   **The mechanism is the load-bearing half, because the outcome alone is satisfiable two ways with
   completely different concurrency behaviour.** `EXCLUDE USING gist` gets it **structurally**: an
   `UPDATE` writes a new tuple, marks the old one dead, and the index compares the new tuple only
   against *live* entries. A `BEFORE UPDATE` trigger computing overlap gets it **by memory**: it reads
   other rows, so it *does* see the prior version, and is correct only if whoever wrote it remembered
   `WHERE o.id <> NEW.id` — check-then-act with the check moved inside the database, two concurrent
   triggers under `READ COMMITTED` both reading *"free"*. Measured: the naive trigger fails AC-10's
   self-overlap step and **the patched one passes all three steps**. So what ADR-0003 rests on is not
   *"a row does not conflict with its own prior version"* but *"the mechanism cannot be made to
   conflict with it, because it never sees it"*.

   > **AC-10 fixed the single-threaded `UPDATE` semantics and nothing more.** Slice 06's AC-1 raises it
   > to the statement the application generates, with one control per constraint that must raise
   > `23P01` — a bay-side control alone passes a build whose technician side can self-conflict.
   > **Two racing reschedules are still asserted by nothing**: re-deferred to slice 07 beside QS-4 and
   > QS-5, because a deferral recorded only at its origin is what R-05-2 measured going missing.
5. **`btree_gist` is required** (TC-3), because `bay_id WITH =` is an equality operator on a `uuid`
   and plain GiST cannot index it. This is the extension dependency that constrains deployment.
6. **The GiST indexes serve the availability query too.** Its `tstzrange(...) && ...` predicate over
   non-cancelled rows is exactly what these partial indexes cover, so the mechanism that costs write
   throughput (§11.2) pays for the read path.

**The one thing this does not give for free** is agreement between the constraint's range expression
and the availability query's: two expressions in two files, held together by QS-8 rather than by a
shared `IMMUTABLE` SQL function, which §4.2 records as a trap.

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
`Intl.DateTimeFormat(…, { timeZone }).formatToParts()` in `src/domain/openingHours.ts`. That direction
is *total and unambiguous*, and the other is neither: at a spring-forward, local 01:30 does not exist;
at a fall-back it happens twice. Every instant has exactly one rendering in a zone, so this rule never
encounters a question with no answer.

Two consequences that look like bugs and are not:

- **Duration is added in absolute time.** A 60-minute job starting at 00:30 local on a spring-forward
  night ends at 02:30 local, not 01:30. The car is on the ramp for sixty real minutes; wall clocks are
  not what occupies a bay.
- **The bookable window shifts by an hour, in absolute terms, twice a year.** A dealership open
  09:00–17:00 local is a different pair of instants in summer and winter. That is the reason QS-9
  exists — this check is the only wall-clock reasoning in the system.

Both `starts_at` and `ends_at` must fall within one day's opening hours (ADR-0001), so an interval
whose local start and end fall on different days is rejected too: no weekly schedule can contain it.
Holidays, one-off closures and mid-day breaks are not modelled (§3.3) and land in this module when they
are.

### The decision procedure

**The order of the checks is part of the design.** `withinOpeningHours` runs six steps in a fixed
order, and the order is asserted, because a mutant that reorders them is otherwise unkillable:

| # | Step | Verdict if it fails |
|---|---|---|
| 1 | both endpoints are integers and `end > start` | `malformed-interval` |
| 2 | the zone constructs a formatter (an invalid IANA zone throws `RangeError`) | `unknown-zone` |
| 3 | render both endpoints in that zone | — |
| 4 | both renderings fall on the same local date | `spans-local-days` |
| 5 | that local weekday has an `opening_hours` row | `closed-day` |
| 6 | the row's `time` values parse, and `opens ≤ start` and `end ≤ closes` | `malformed-hours` / `outside-window` |

Step 1 exists **only** because the literal AC-6 ruling took the `Interval` type — which made an
unordered or non-finite pair unrepresentable — out of this module's reach (§5.2, §11 D-01-3). Every
step fails closed: a booking gate that cannot read its own configuration refuses rather than guesses.

**Two rendering options are pinned as correctness choices rather than style**: the locale is `'en-US'`,
never `undefined`, because a pure function must not vary with the host's default locale; and the hour is
`hourCycle: 'h23'` rather than `hour12: false`, which has historically rendered midnight as `24`. The
weekday comes from the formatter's `weekday: 'short'` part through an explicit seven-entry lookup, never
hand-rolled calendar arithmetic — a second calendar implementation inside this module is exactly the
risk the design avoids.

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
last is the fall-back ambiguous hour — **two distinct instants render identically and the rule gives
them the same verdict, which is the correct answer**, because the doors are in the same state both
times round. The ambiguity that makes fall back hard belongs to *local → instant*, which this rule
never performs. QS-9 asserts that equality explicitly. A related consequence that reads like a bug and
is not: on 25 October a dealership open 00:00–06:00 local is open for **seven** absolute hours and on
29 March for **five**, which the rule produces without knowing it, because it never counts hours.

**An interval ending exactly at local midnight** would render its end on the next local date and be
rejected as `spans-local-days` — refusing a job that finishes at closing time at a dealership open
until 00:00, and leaving the time parser's `'24:00:00'` arm, which exists to describe exactly that
window, unreachable.
That **shipped in slice 02** (AC-17–19);
[slice 13's tombstone](../slices/13-interval-ending-at-local-midnight.md) argues it: an end rendering `00:00:00` on the local date immediately after
the start's normalises to `secondsOfDay = 86400` before step 4's comparison, while a genuine crossing
(23:00 to 01:00) stays rejected.

## 8.4 Observability

TC-8 fixes OpenTelemetry with `pino`. §1.2 goal 4 says what for: *the check-then-act window is visible
in a waterfall even though the code never relies on it*, and the invariant is measurable in production
rather than only in tests.

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
| `booking_conflicts_total` | counter | `resource` ∈ {bay, technician}, `outcome` ∈ {absorbed, refused, capped} | **The invariant, made observable.** `absorbed` = retried successfully; `refused` = candidates exhausted; `capped` = ADR-0009's attempt cap hit. ADR-0004 requires the first two to be distinguishable — conflating them makes the metric unreadable at the moment it matters. **A non-zero `capped` is expected today rather than a signal the cap is wrong** — D-04-1, §11.2 R-4 |
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

`CLAUDE.md` §5 fixes ownership by path; this is what each level is *for*, which the path rule does not
say.

| Level | Owner | Runs against | What it is for |
|---|---|---|---|
| `tests/unit/` | implementer | `src/`, with the database's **driver** stubbed where a container is not needed | A design tool, freely rewritable during refactor. **This is where the Stryker mutation budget is spent**, scoped to `src/**` less `main.ts` |
| `tests/property/` | test-engineer | the **built artifact** under `dist/`, and real PostgreSQL only where the property needs it | `fast-check` over interval arithmetic, candidate ordering, opening hours across DST — and QS-8, the only thing holding the availability query and the exclusion constraint in agreement. **Split by database need**, not by subject |
| `tests/integration/` | shared; DB-invariant tests are the test-engineer's | Testcontainers PostgreSQL | Single-threaded persistence behaviour: self-overlapping reschedule, cancellation releasing a slot |
| `tests/concurrency/` | test-engineer | Testcontainers PostgreSQL, several pooled connections | The invariant. Genuinely simultaneous statements; nothing here is simulatable |
| `tests/contract/` | test-engineer | the running service | The emitted OpenAPI document, and the error taxonomy of §8.6 |
| `tests/acceptance/` | test-engineer | the running service | *Done*, expressed as the slice's acceptance criteria over HTTP |

Two structural supports rather than conventions: **`outside-in-tests-do-not-import-src`** (§5.3) makes
OC-5 structural — tests that define *done* reach the system the way a client does, and the path hook
cannot catch a violation because the file is one the test-engineer legitimately owns; and **isolation
is by data, not by truncation** (§7.2), each test seeding its own dealership, so the suite parallelises
and every test implicitly asserts A-9's scoping.

### How an outside-in test reaches a module with no boundary

**`src/domain` has no boundary to reach it through**: QS-9 is a property over three pure functions with
no HTTP route and no SQL. Three clauses resolve it, all in force
([slice 01's design](../slices/01-design.md) has the alternatives):

1. **An outside-in test reaches a pure module through the built artifact.** It loads `dist/domain/*.js`
   — the output of `npm run build`, which `pretest` guarantees is current — never `src/`. The
   dependency rule stands unwidened, and the test exercises what ships rather than what compiles. It
   costs a dynamic `import()` and an `await` per file.
2. **`tests/property/` splits by whether the property needs a database.** A property test that talks to
   PostgreSQL is named `*.db.test.ts` and runs in the `db` project behind
   `globalSetup: tests/setup/postgres.ts`; everything else runs in `nodb` with no container, so a
   Docker failure cannot turn QS-9's red evidence into a `globalSetup` crash instead of an assertion
   failure.
3. **`npm test` runs the two projects as separate invocations, and a project that did not run is a loud
   failure.** It is `tools/ci/run-tests.mjs`, not `vitest run`; a missing or empty project report exits
   `EXIT_DID_NOT_RUN = 2` rather than merging as zero failures. §7.2 carries the failure mode.

The residue those mechanisms leave — computed paths to `src/`, which no text scan can separate from
imports — is review, and §11 records it.

### What a unit test may substitute, and where the line falls

**A unit test may replace the driver beneath Kysely. It may not replace what the database decides.**
The stub keeps the production dialect — compiler, adapter, introspector — and swaps only the transport,
so the SQL a test observes is the SQL PostgreSQL would receive, and a `catch` block a reachable
database would never enter becomes reachable. The boundary is the assertion, not the seam:

| The assertion is about | Legitimate substitute | Why |
|---|---|---|
| the code *around* the database — an outcome mapping, a `catch`, a released handle, the SQL emitted | driver stub, `tests/unit/` | The database's answer is not the evidence; the code's response to a given answer is |
| what the database **decides** — a constraint firing, a SQLSTATE, an ordering, an interleaving | **none.** Real PostgreSQL, `tests/integration/` or `tests/concurrency/` | This is `CLAUDE.md` §2.2 verbatim, and §4.1's reason: the invariant lives in the database, so a test that substitutes it tests the substitute's imitation — and the imitation would necessarily be check-then-act |

So the unit-testable surface is not `src/domain` alone: `checkHealth` is a use case in
`src/application`, takes a `Db`, and is unit-tested with no container. Removing the repository port
(§5.2) forecloses substituting the *repository*; it does not foreclose substituting the *transport*.

### Mutation testing runs through Stryker's command runner, not its Vitest runner

`CLAUDE.md` §10 makes a mutation score part of Definition of Done and `tools/slice/check.mjs` gates on
**0.75**. It is run by the **reviewer** at step 5 and deliberately not in CI: survivors are findings for
a role that wrote neither the tests nor the code, and a number in a pipeline answers that by ignoring
it. Scope is `src/**` less `main.ts`.

**The `command` runner, over a separate `vitest.mutation.config.ts`, is a workaround for a measured
defect rather than a preference.** `@stryker-mutator/vitest-runner@10.0.0` **does not activate mutants**
under `vitest@5.0.0` — 118 of 130 survivors on the blocking run had `testsCompleted: 0`, and every
mutant of a file with six dedicated tests survived, including the one emptying its body — while its
peer range `vitest: ">=2.0.0"` means npm warns about nothing. The command runner has no framework
integration to break: Stryker sets `__STRYKER_ACTIVE_MUTANT__`, runs the command, reads the exit code.
Its one consequence is `coverageAnalysis: 'off'` — with no per-test attribution every mutant runs the
whole suite, the conservative direction.

**What would make removing the workaround safe.** The broken runner's tell is unrun tests, not a low
score, so a plausible score after an upgrade proves nothing. Set `testRunner: 'vitest'`, drop
`commandRunner`, run `npx stryker run`, then **count mutants with `testsCompleted: 0` in
`reports/mutation/mutation.json` — over files that have unit tests this must be zero**, whatever the
score says; and confirm with a positive control, activating by hand one mutant a test should kill. Only
with both clean is `coverageAnalysis` worth revisiting. §11.2 R-12 carries the standing risk.

### The response-schema seam is a serialiser, not an assertion

**A TypeBox `response` schema does not validate what a handler produced. It reshapes it on the way
out**, through `fast-json-stringify`. Six behaviours, measured on this repository's pinned Fastify:

| The handler sends | On the wire | Behaviour |
|---|---|---|
| an undeclared property | dropped | **stripped** |
| a required property missing | `500 Internal Server Error` | **enforced**, loudly |
| a wrongly-typed value (`"42"` for a number) | `42` | **coerced**, silently |
| a wrong value for a `Type.Literal` | **the schema's constant** | **substituted**, silently |
| a wrong value for a `Type.Union` of literals | `500` | **enforced**, and never substituted |
| a wrong value for `Type.String({ enum })` | the wrong value | **passed through**, unvalidated |

Substitution is the dangerous one, and it is a property of every route this system will have: a
handler emitting `{status:'', checks:{database:''}}` produces a byte-identical
`200 {"status":"ok","checks":{"database":"up"}}`, which is why four mutants of the health route
survived a suite that looked thorough. **Nothing proves substitution, and nothing can, from the wire.**
Three consequences bind every later slice:

1. **Pin a computed enum-valued field as a `Type.Union` of literals.** It is the only one of the three
   pinning forms that both enforces and does not substitute. Under `Type.Literal` a handler's computed
   value is silently rewritten to the constant and a contract test asserting on the body reads that
   constant back and passes — **QS-11's own test unable to fail for the reason it names**; under
   `Type.String({ enum })` the wrong value reaches the client instead. §8.6's `type` URIs and the
   appointment's `status` are both unions for that reason.
2. **The backstop can become the defect, so it is not the only guard.** A body that fails a response
   schema renders `FST_ERR_FAILED_ERROR_SERIALIZATION` as `application/json` — wrong status, no
   `type`, not `problem+json`. So the taxonomy is also closed at compile time by a single constructor,
   and the `500` carries no response schema at all (§8.6).
3. **A test through this seam proves the schema, not the handler.** To hold a handler to a computed
   value, assert on what it passed to `send`. Everything an assertion on the wire body can tell you
   about a pinned field, it would tell you about an empty handler too.

**On the request side the same seam strips rather than rejects.** Fastify's default ajv options set
`removeAdditional: true`, so a body carrying an undeclared property is accepted with the property
removed, not refused. `additionalProperties: false` on a request schema is therefore load-bearing for
**ADR-0005's emitted OpenAPI document** — where it is the published statement of what the operation
takes — and not a runtime rejection. Where a request must be *refused* for what it carries, something
other than the schema has to refuse it. AC-6 holds regardless, and by a second, independent route:
there is no parameter anywhere on the booking path that could receive a client-supplied end.

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

`PATCH` for a move because ADR-0003's mechanism *is* "modify this resource in place" — the verb and the
`UPDATE` say the same thing. Cancellation is a sub-resource rather than `DELETE` because the appointment
remains readable at its URL afterwards with `status: cancelled`, which `DELETE` would misdescribe. The
availability response carries an explicit advisory flag, and it answers **only about the interval
queried** (§6.5).

### Status codes

Errors are RFC 9457 `application/problem+json`, with a stable `type` per failure so a client
distinguishes cases without parsing prose (§3.2 left the media type to Gate B).

| Status | `type` | When | Decided by |
|---|---|---|---|
| `400` | `/problems/malformed-request` | Schema violation, unparseable timestamp; and, from slice 05, an empty or unparseable JSON body | TypeBox before any handler (ADR-0005), or `setErrorHandler` on two named Fastify parser codes |
| `400` | `/problems/outside-opening-hours` | The derived interval leaves the dealership's hours | `domain/openingHours.ts` — **reads no booking** (GC-1) |
| `404` | `/problems/appointment-not-found` | The id in the path does not exist | The read a move needs anyway (ADR-0025) |
| `404` | `/problems/route-not-found` | The path matches no route — distinct from a missing appointment, which shares the status | `setNotFoundHandler` (ADR-0024) |
| `409` | `/problems/no-capacity` | Every candidate refused, or the cap reached (ADR-0004, ADR-0009). Carries `resource` | **PostgreSQL, `23P01`, repeatedly** |
| `409` | `/problems/appointment-not-confirmed` | Moving a cancelled appointment (ADR-0003) | The guarded `UPDATE`'s zero rows (ADR-0025) |
| `422` | `/problems/unknown-reference` | Unknown dealership, service type, customer or vehicle. Carries `reference` | Reference read, then `23503` |
| `422` | `/problems/vehicle-not-owned` | The vehicle is not the named customer's | Composite FK, `23503` (A-6, GC-2) |
| `500` | `/problems/internal` | Reference data the client cannot see or correct — a described class, not a catch-all (ADR-0024) | The use case, or the fallback handler |

Four deliberate choices in that table:

- **Ownership failure is a `422`, not a `403`** — validation, not authorisation (ADR-0002).
- **Two distinct `409`s, and only one touches the conflict metric.** `no-capacity` is contention;
  `appointment-not-confirmed` is a state conflict, and `booking_conflicts_total` counts `23P01` so it
  cannot see the second (§8.4).
- **Out-of-hours is a `400` although `422` would sit more naturally beside the reference failures.**
  ADR-0001 fixed the code as a Gate A ruling. The inconsistency is real and recorded rather than
  quietly harmonised; changing it means superseding the ADR.
- **The `500` row is reachable, and it is not only a fallback.** Four reference-data faults route to
  it — a dealership whose `time_zone` does not resolve, one whose `opens_at` does not parse, one with
  no service bays, and a candidate refused by a composite foreign key — as does a `40P01` (ADR-0030: a
  path locked less than it wrote). A `4xx` would tell a service advisor to correct something they did not send and
  cannot see, so the body says nothing actionable and the detail goes to the log. **The residual is
  an invariant rather than this row: every response with status ≥ 400 is `problem+json` carrying a
  `type` from the closed set** — asserted ∀responses ∃row over a hostile corpus, the direction that
  can fail (ADR-0024). `GET /nope` answers `404 /problems/route-not-found`; `content-type: application/xml` still renders
  `500 /problems/internal`, 415 having no row, which is the invariant holding rather than a gap.

Two members of `BookOutcome` render as that row, apart for §5.2's reason. Symmetrically, a dealership with **no technician qualified for the requested
service type** is `422 /problems/unknown-reference` with `reference=service-type`: the request names a
(dealership, service type) pair and that pair does not resolve, which is the only sense in which this
API knows service types at all. It is not contention and there is nothing to retry.

**The taxonomy is a closed set with one constructor.** The `type` URIs are a single `as const` array,
`ProblemSchema` is built from it, and the constructor takes that union — so a URI outside the table is
a compile error at the call site, and §8.5's response-schema union is the runtime backstop behind it.
The `500` alone carries no response schema, for the reason §8.5 gives. The media type is set per
response rather than globally, because a `200` that arrived as `problem+json` is a worse failure than a
`400` that arrived as `application/json`.

### Outcomes, not exceptions

Use cases return the discriminated unions of §5.2, so the mapping above is one exhaustive `switch`
that the compiler checks. Adding a domain outcome breaks the build in `src/http` rather than falling
through to a `500` — which is the cheapest available guarantee that a known failure never renders as
an unknown one.
