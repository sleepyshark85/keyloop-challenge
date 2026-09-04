# Slice 00 — design

> Step 1 of the slice loop. Author: architect. Reviewed at step 2 by the test-engineer and the
> implementer, who may object; built against at steps 3 and 4.
>
> Slice: [`00-schema-and-exclusion-constraints.md`](00-schema-and-exclusion-constraints.md) · arc42
> scope declared by the slice: **§8.1 · §8.2** · quality scenarios: **QS-1, QS-2, QS-11** · ADRs in
> force: 0001, 0002, 0003, 0007 (and 0006 for the SQLSTATE reasoning of §5).
>
> **This is the phase-4 pilot.** It runs against the criteria pre-registered in
> [`process-criteria.md`](../team-log/process-criteria.md), which this design does not edit and may
> not edit.

This design settles *shape*. It does not restate the nine acceptance criteria and it may not change
them (`CLAUDE.md` §6): AC-1 to AC-9 are the human's. Where one is ambiguous, §11 flags it rather than
resolving it silently (`CLAUDE.md` §11).

**Read §0 first.** Slice 00a produced two rules that this design is bound by, and §0 is this
document's compliance with the second of them: every causal claim below is either measured, or
labelled as unmeasured. There are more measurements here than in 00a's design because a database is
cheap to interrogate and expensive to be wrong about.

---

## 0. The two rules from 00a, and this design's compliance

00a ended with two rules in the design record. Both bind here.

> **Rule 1 — a green thing says nothing about what it examined.** Every assertion about a result must
> be preceded by an assertion about coverage.

Applied in §4: the test file's **first** case is a catalogue assertion — the nine relations, the
extension, and all seven named constraints on `appointment` with their types and their definitions —
and the AC cases are only evidence *given* that it passed. Applied again inside AC-3 and AC-4, where
a "success" case is worthless unless the fixture is first proved capable of conflicting (§4.3, §4.4).

> **Rule 2 — a stated mechanism nobody ran is not a mechanism.** Four of the architect's own causal
> sentences in 00a were confident and wrong.

Applied by measuring. **Everything in §11.1 was executed by the architect on 2026-09-04** against
`postgres:16` in a throwaway container, using this repository's pinned `pg@8.23.0` and
`node-pg-migrate@9.0.0`. Nine of the claims this design would otherwise have asserted are measured
facts; four remain labelled **assumed, not measured**, in §11.2. One of the measurements caught a bug
in the architect's own probe fixture before it became a sentence in this document, which is the
mechanism working as intended.

A caveat that rule 2 requires of the measurements themselves: they were made with `psql` and a
`pg.Client`, **not** through this repository's harness. They establish what PostgreSQL does. They do
not establish that the harness reaches it — that is what step 3 and step 4 are for.

---

## 1. The migrations, as files

### 1.1 The split, and whether it is right

Three files, exactly as §8.1's comments and the slice's *In scope* already name them:

| File | Contents | Why separate |
|---|---|---|
| `0001_extensions.sql` | `CREATE EXTENSION IF NOT EXISTS btree_gist;` | The only statement in the corpus that can fail for an **environment** reason — the `postgres-contrib` package absent, or the role lacking privilege — rather than a schema reason. Alone in a file, that failure names itself: `pgmigrations` is empty and the runner names `0001_extensions`. Folded into `0003`, the same failure reads as "the appointment migration broke" |
| `0002_reference_data.sql` | The eight tables of §8.1 that the API never writes | §8.1 already draws the line here, and A-7 makes it a durable line rather than a cosmetic one: this is the half that arrives by migration and fixture and never by request |
| `0003_appointment.sql` | `CREATE TYPE appointment_status`, `CREATE TABLE appointment` with its CHECK and its four composite foreign keys, then the two `ALTER TABLE … ADD CONSTRAINT … EXCLUDE` statements of §8.2 verbatim | The one table the API writes, and the one artifact the submission rests on. A reader who wants the invariant opens one file and finds nothing else in it |

**Ordering is by filename and `btree_gist` must precede the exclusion constraints.**
`node-pg-migrate` sorts the directory listing and applies in that order (`0001` → `0002` → `0003`),
so the dependency is satisfied by the numbering and by nothing else. **Measured:** the three files
apply cleanly in that order through the programmatic `runner()` call `tests/setup/postgres.ts`
already makes, ending with `pgmigrations` holding `0001_extensions`, `0002_reference_data`,
`0003_appointment` and both exclusion constraints present in `pg_constraint` (§11.1 M-6).

**The cost of three files, stated rather than glossed.** Under the **programmatic** runner — which is
the call `globalSetup` makes — each migration is wrapped in **its own** transaction, so a failure in
`0003` leaves `0001` and `0002` **committed and recorded**. Under the **CLI** — which is what
`npm run db:migrate` invokes — `--single-transaction` defaults to `true`, so the same failure rolls
back all three. Both measured (§11.1 M-4, M-5). One file would make the two entry points agree
trivially; three files make them disagree on partial failure. See §11.3 for the ruling on that
divergence, which is *not* to change the harness in this slice.

### 1.2 Four mechanical facts about `.sql` migrations, measured

1. **The markers.** `node-pg-migrate` splits a `.sql` file on `/^\s*--[\s-]*up\s+migration/im` and
   the corresponding `down`. **Everything before the `-- Up Migration` marker is sliced off and never
   sent to PostgreSQL.** A header comment placed above the marker is therefore invisible to the
   database — harmless for a comment, silent data loss for a statement. **The marker is the first
   line of every file; any header comment goes after it.**
2. **A file with no `-- Down Migration` marker gets `down: false`**, and a `down` run then throws
   *"User has disabled down migration on file"*. ADR-0007 requires down migrations to exist ("written
   but not part of any recovery story"), so **all three files carry both markers.**
3. **Down migrations work for this corpus.** Measured: `direction: 'down', count: 3` reverses
   `0003 → 0002 → 0001` and leaves the database with `pgmigrations` alone and `btree_gist` dropped
   (§11.1 M-7). ADR-0007 says down migrations are "unverified by construction"; that is now false for
   exactly this corpus, on exactly this date, and **no test is added to keep it true** — see §11.3.
4. **A re-run applies nothing.** Measured: a second `runner()` call against an already-migrated
   database resolves with `[]` and logs *"No migrations to run!"* (§11.1 M-6). The gate is the
   `pgmigrations` table, **not** `IF NOT EXISTS` clauses.

Consequence of (4), and it is a rule for the implementer: **no `IF NOT EXISTS` on tables, types,
constraints or indexes.** Idempotence is the runner's job. An `IF NOT EXISTS` on a `CREATE TABLE`
converts "this database is in a state the migration did not expect" from a loud failure into a silent
pass, which is the same defeat as every other item in 00a's first rule table. The single exception is
`CREATE EXTENSION IF NOT EXISTS btree_gist`, which is reproduced **verbatim from `CLAUDE.md` §2.1**
and must not be edited for consistency's sake — §2.1 is NON-NEGOTIABLE and ADR-0007's whole argument
is that the text appears in this repository exactly as written there.

### 1.3 One commit, not three

`CLAUDE.md` §7 requires every implementer commit to be green. Landing `0001` and `0002` without
`0003` leaves `tests/integration/exclusion-constraints.test.ts` failing on a missing `appointment`
table, so an intermediate commit would be **CI-red** under 00a's operative meaning of green
(*locally green on everything that does not need a database, CI-green on everything that does*,
arc42 §7.2). So the three migrations land in **one implementer commit**, roughly ninety lines of SQL
— inside `CLAUDE.md` §7's ~150-line guidance, and indivisible in any case: a schema with a foreign
key to a table that does not exist is not a smaller change, it is a broken one.

This raises the value of the implementer running the suite locally before pushing, which §8.3 makes
a step-2 action rather than a hope.

---

## 2. The two exclusion constraints, verbatim, and why every part of them

Reproduced from `CLAUDE.md` §2.1 and arc42 §8.2, unaltered:

```sql
ALTER TABLE appointment ADD CONSTRAINT no_bay_overlap
  EXCLUDE USING gist (bay_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelled');

ALTER TABLE appointment ADD CONSTRAINT no_technician_overlap
  EXCLUDE USING gist (technician_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelled');
```

Part by part.

**`EXCLUDE USING gist` rather than a `UNIQUE` index or a trigger.** A unique index can forbid two
rows from being *equal*; it cannot forbid two rows from *overlapping*, because overlap is not an
equivalence. A trigger could compute overlap, but a trigger is check-then-act with the check moved
inside the database: it reads other rows, and two concurrent triggers under `READ COMMITTED` both
read "free". An exclusion constraint is enforced by the index insertion itself, which serialises on
the index page, so the second writer blocks and then fails. That is why `CLAUDE.md` §2.1 names this
mechanism and not another, and it is why §4 of arc42 records check-then-act as considered and
rejected.

**`bay_id WITH =`, and why `btree_gist` is required.** GiST has no built-in opclass for `uuid`, so
`bay_id WITH =` has nothing to index with; `btree_gist` supplies `gist_uuid_ops`. This is arc42
§8.2's consequence 5 and TC-3, and it is the extension dependency that constrains deployment
(§7.1). **Measured:** `btree_gist` version `1.7` on `postgres:16`, and the resulting objects are
`CREATE INDEX no_bay_overlap ON public.appointment USING gist (bay_id, tstzrange(starts_at, ends_at))
WHERE (status <> 'cancelled'::appointment_status)` (§11.1 M-3).

**`tstzrange(starts_at, ends_at) WITH &&`.** The default bound flags of `tstzrange(a, b)` are `[)` —
lower closed, upper open. Two consequences:

- **Adjacency is not overlap.** `[09:00, 10:00)` and `[10:00, 11:00)` do not overlap, so back-to-back
  work in one bay is legal. That is A-4 — *no setup or cleanup buffer; the appointment interval is
  the occupancy interval* — expressed as a bound rather than as prose, and it is AC-3.
- **The expression, not a column, is indexed.** There is no range column on `appointment`; the
  constraint computes the range from two `timestamptz` columns. That is what makes §8.2's closing
  note true — the constraint's range expression and the availability query's are two expressions in
  two files, held in agreement by QS-8 rather than by a shared function (§4.2 explains why a shared
  `IMMUTABLE` SQL function is a trap).

**Half-openness is only *partly* falsifiable, and this design says which part.** The realistic
mistake is writing `tstzrange(starts_at, ends_at, '[]')`, and AC-3 catches it: under `[]` the two
adjacent intervals share the instant 10:00 and the second insert would be rejected. The mistake AC-3
**cannot** catch is `'(]'`, and that is a proof rather than a gap: for intervals with
`ends_at > starts_at` (which `appointment_interval_ordered` guarantees), `[a₁,a₂) ∩ [b₁,b₂) ≠ ∅` iff
`a₁ < b₂ ∧ b₁ < a₂`, and `(a₁,a₂] ∩ (b₁,b₂] ≠ ∅` iff exactly the same condition. **No reachable case
distinguishes them**, so no test can, and claiming AC-3 "proves the range is half-open" would be
precisely the overstatement rule 2 exists to stop. AC-3 proves the range is **not closed**.

**`WHERE (status <> 'cancelled')` — the partial predicate.** It puts a cancelled row outside the
constraint's scope without deleting it, so a slot frees itself through the same mechanism that guards
every write. No compensating release exists to be forgotten (ADR-0003; arc42 §8.2 consequence 2).
It is AC-4. Two properties worth stating because both are easy to miss:

- **The predicate makes the *index* partial too**, which is why arc42 §8.2's consequence 6 holds: the
  availability query filters on exactly `status <> 'cancelled'` over an overlapping range, so the
  index that costs write throughput pays for the read path. **Measured** in the index definitions
  above; that the planner *chooses* it is **assumed, not measured** and belongs to QS-14.
- **`<> 'cancelled'` is a denylist, and that is the safe direction.** Any status added later —
  `no_show`, `in_progress` — is automatically *inside* the constraint's scope and occupies its slot.
  A `= 'confirmed'` allowlist would have made a new status silently non-occupying, which is a
  double-booking that nobody wrote.

**The names are behaviour, not documentation.** `err.constraint` is what ADR-0009 prunes on and what
labels `booking_conflicts_total{resource}`; AC-1 and AC-2 assert the names directly, and QS-1 and
QS-2 pin them at the API level later. Renaming one is a behaviour change.

---

## 3. Seed fixtures

### 3.1 The mechanism, and who owns it

**Decision: a loader in `tests/support/seed.ts`, owned by the test-engineer, issuing raw SQL through
`pg` over the injected connection string.** Not a migration, not a module under `src/`, not a `.sql`
file executed by path.

Three alternatives were considered and each fails on something concrete:

| Option | Why not |
|---|---|
| **`0004_seed.sql`, a fourth migration** | It puts test fixtures into the schema history that ADR-0007 makes immutable, and — decisively — it gives the whole suite **one** dealership. arc42 §7.2 isolates by data precisely so the suite can run in parallel and so every test implicitly asserts A-9's scoping. A single shared fixture removes both and re-serialises the suite |
| **A loader module under `src/persistence/seed/`** | `outside-in-tests-do-not-import-src` forbids `tests/support/` from importing it, and `guard-paths.mjs` denies the test-engineer even *reading* `src/`. The fixtures the suite books against would be authored and owned by the role whose work they are meant to check |
| **A checked-in `.sql` fixture under `src/`, executed by path** | Evades the import rule the way §8.5's `dependency-cruiser` precedent allows, but leaves the test-engineer executing a file it is forbidden to read. Independence is a read restriction as much as a write one |

The chosen option has a property none of the others has, and it is worth naming because it is free:
**the loader is an independent transcription of §8.1.** Written by a role that cannot read the
migrations, from arc42 alone, its `INSERT`s name every column of every reference table. If the
implementer's `0002_reference_data.sql` renames or drops a column, the seed fails loudly with
`42703`. Precisely scoped: it detects **column-level** divergence on the eight tables it writes. It
detects **nothing** about constraints — that is §4.1's catalogue assertion's job — and nothing about
an *extra* column.

**The demo seed is deliberately not built here.** A-7 says reference data arrives "via migrations and
fixtures"; the cURL harness (TC-5) will eventually need a fixed dataset in the local compose stack
with stable ids a `curl` example can name. That is a different artifact with a different consumer,
it is not named in this slice's *In scope*, and building it now would mean inventing the demo
narrative six slices early. It is ADR-0012's second half (§10) and a backlog item.

### 3.2 What a "clean database" means here

The container is **one per run** (arc42 §7.2), truncation is forbidden, and slice 00 is the first
slice with any data at all — so this is where 00a's stated-but-unexercised rule gets exercised.

**A test does not get a clean database. It gets a fixture nobody else can reach.** Each case calls
`seedDealership(client, namespace)` with a namespace unique to that case and works only inside the
returned ids. AC-1 to AC-8 each get their own known starting state that way, and the "known" part is
that the loader **returns** every id rather than the test discovering one. No test may write
`select id from service_bay limit 1`; a fixture found by query is a fixture shared by accident.

**No transactions, no rollback, no cleanup.** Rows accumulate for the life of the run and die with
the container. A test that wrapped its case in a rolled-back transaction would be asserting the
constraint's behaviour under a visibility regime that no production write uses.

### 3.3 The fixture, concretely

`seedDealership(client, namespace)` inserts one complete dealership subtree and returns its ids:

| Table | Rows | Notes |
|---|---|---|
| `dealership` | 1 | `time_zone = 'Europe/London'` (ADR-0001, A-8) |
| `opening_hours` | 7 | All seven days, `08:00`–`18:00`. Seeding every day means the anchor instant is inside opening hours regardless of which weekday it falls on, so no claim about a date can go stale |
| `service_type` | 2 | `standard` 60 min, `quick` 30 min |
| `service_bay` | 2 | `bayA`, `bayB` |
| `technician` | 2 | `techA`, `techB` |
| `technician_qualification` | 3 | `techA` → both; **`techB` → `quick` only** |
| `customer` | 2 | `custA`, `custB` |
| `vehicle` | 2 | `vehA` → `custA`, `vehB` → `custB` |

Plus an **anchor instant** returned alongside the ids, so every interval in every case is expressed
as an offset from one named point rather than as a literal timestamp scattered through the file.

Three details are load-bearing rather than arbitrary:

- **`techB` is qualified for `quick` and not for `standard`.** That is AC-5's whole fixture: an
  appointment naming `(techB, standard)` violates `appointment_technician_qualified` while satisfying
  every other constraint. Without an asymmetric qualification there is no way to isolate AC-5 (§4.5).
- **Two bays and two technicians** are what let AC-1 free the technician and AC-2 free the bay, which
  §4.1's isolation rule requires.
- **Two customers and two vehicles** are AC-6's fixture: `vehA` with `custB`.

**AC-7 calls the loader twice**, with two namespaces, and builds an appointment naming dealership 2
with dealership 1's bay.

### 3.4 Determinism, which AC-9 asks for and does not define

AC-9 requires the fixtures to be loadable into an empty database and the suite to "book against them
deterministically". Two readings pull apart at the level of the id: fixed literal UUIDs are
reproducible but collide across parallel cases; `randomUUID()` isolates but makes a failure message
different on every run.

**Decision: ids are derived, not random and not literal.** `tests/support/ids.ts` exposes
`uuidFor(namespace, name)` — a SHA-1 of `` `${namespace}/${name}` ``, truncated to sixteen bytes with
the version and variant nibbles set, formatted as a UUID. Same for `vinFor`, since `vehicle.vin`
carries a **global** `UNIQUE` and two parallel cases seeding a literal VIN would collide with `23505`
(§11.2 A-3 — the collision is deduced from the schema, not observed).

That buys both properties: disjoint subtrees across cases, and ids that are a pure function of the
case's own name, so a failure message names the same UUID on every run and in every log.

**No `ON CONFLICT DO NOTHING` anywhere in the loader.** Two cases sharing a namespace must fail
loudly on `dealership_pkey` rather than silently sharing a fixture, because a silently shared fixture
is exactly how a vacuous pass is manufactured.

**Honest about strength:** this is a legibility and reproducibility choice, not a correctness one.
`randomUUID()` would be correct, because no test hard-codes an id — they all come from the return
value. It costs about twenty lines. If the test-engineer objects at step 2 with a reason, the
fallback is acceptable and the design does not defend it further.

### 3.5 What AC-9 asserts

*"Every reference table is populated"* is a coverage claim, so it is asserted as one. After one
`seedDealership`, for **each of the eight** non-`appointment` tables the case asserts a non-zero row
count scoped as tightly as the table allows:

- `opening_hours`, `service_bay`, `technician` — scoped by `dealership_id`, exact counts (7, 2, 2);
- `technician_qualification` — scoped by the returned technician ids, exact count 3;
- `dealership`, `service_type`, `customer`, `vehicle` — scoped by the returned ids, exact counts.

**`service_type`, `customer` and `vehicle` are not dealership-scoped**, so §7.2's isolation-by-data
is genuinely partial: parallel cases share those three tables. That is safe — none of them carries a
constraint two seeds can collide on except `vehicle.vin`, handled above — but it is a real limit on
the isolation rule and it should be recorded as such rather than implied away.

*"The suite can book against them deterministically"* is asserted by the same case performing one
successful `INSERT` into `appointment` using only returned ids, and reading it back.

---

## 4. `tests/integration/exclusion-constraints.test.ts` — what it must establish

The test-engineer writes this file. This section specifies **what it must prove**, not how.

**Whose it is.** `CLAUDE.md` §5 gives database-invariant integration tests to the test-engineer, and
00a's structural restatement of that boundary settles it without argument: *a `tests/integration/`
file that reaches the database only through a connection string is the test-engineer's; one that
imports a `src/` module is the implementer's.* This file imports no `src/` module — there is none to
import, which is the point of the slice.

**Two structural requirements on the file itself**, both from §8.3's red analysis:

- **`beforeAll` may only connect.** No DDL, no DML, no seeding. Every schema-dependent statement runs
  inside an `it()` body, so a failure is a failed assertion in a collected file rather than a hook
  error whose representation in Vitest's JSON reporter this design has **not measured** and therefore
  must not depend on (§11.2 A-1). C1 distinguishes "a real assertion failure" from a load error, and
  this is what makes the distinction hold.
- **Each case seeds its own namespace** in its own body (§3.2).

### 4.1 Case 0 — coverage, before any result

The first case asserts the schema under test **is** §8.1's schema, from the catalogue:

- `pg_extension` contains `btree_gist`;
- `to_regclass` resolves all nine relations of §8.1;
- `pg_constraint` on `appointment` contains, **by name and by `contype`**: `no_bay_overlap` (`x`),
  `no_technician_overlap` (`x`), `appointment_interval_ordered` (`c`),
  `appointment_technician_qualified` (`f`), `appointment_bay_in_dealership` (`f`),
  `appointment_technician_in_dealership` (`f`), `appointment_vehicle_owned_by_customer` (`f`);
- and `pg_get_constraintdef` for the two exclusion constraints contains `tstzrange(starts_at,
  ends_at)`, `&&`, and the partial predicate.

**Assert against the normalised text, not the source text.** PostgreSQL re-renders a constraint
definition: `WHERE (status <> 'cancelled')` comes back as
`WHERE ((status <> 'cancelled'::appointment_status))`, with the cast added and the parentheses
doubled (§11.1 M-3). A substring assertion written from the migration source would fail on a correct
schema.

**What case 0 is and is not.** It proves the objects **exist and are shaped right**. It proves
nothing about whether they **fire** — arc42 §8.2's own consequence 3, and QS-10's *"a ruleset that
has never rejected anything is not evidence"* pointed at the database. Cases 1 to 8 prove firing;
case 0 is what stops a green case 3 or case 9 meaning "there is no constraint here at all".

### 4.2 The isolation rule, which is where this file is most likely to go wrong

**Measured, and it governs every negative case (§11.1 M-1, M-2):**

> PostgreSQL evaluates table `CHECK` constraints **first**, then index-based constraints — the
> exclusion constraints — and **last** the `AFTER ROW` triggers that enforce foreign keys.

So an insert that violates a CHECK *and* an exclusion constraint *and* three foreign keys reports the
CHECK. An insert that overlaps *and* names an unqualified technician reports `23P01`, not `23503`
(measured directly: probe B). And when **both** exclusion constraints are violated at once, the one
reported was `no_bay_overlap` — which is index order, **not a guarantee** (§11.2 A-2).

Three rules follow, and they are not stylistic:

1. **Each negative case must make exactly one constraint violable.** Every other constraint must be
   satisfiable by the fixture. AC-2 in particular must use a **different bay** for the second
   appointment, or it will assert `no_technician_overlap` and receive `no_bay_overlap`. AC-3's and
   AC-4's overlapping control rows must use a **different technician** for the same reason.
2. **Assert the constraint name, never merely the SQLSTATE.** `23503` is produced by four different
   constraints on this table; the name is the only thing that says which requirement was enforced.
3. **A negative case's fixture must be valid in every other respect**, so that a green result cannot
   be explained by a second, unintended violation.

### 4.3 AC-1, AC-2 — the two exclusion constraints

For each, in order:

1. Seed; insert a first appointment; **read it back** and assert one row exists with the expected
   bay, technician, interval and `status = 'confirmed'`. A conflict test whose first row was never
   stored asserts nothing.
2. Insert a second appointment overlapping the first's interval on the resource under test, with
   **the other resource free** (AC-1: same bay, other technician; AC-2: same technician, other bay)
   and every foreign key satisfied.
3. Assert the rejection carries `code === '23P01'` and `constraint === 'no_bay_overlap'` /
   `'no_technician_overlap'` respectively (§5).
4. Assert the table still holds exactly one row for that resource over that range — the invariant is
   a property of the table, not of the error.

AC-2 is asserted separately from AC-1 by the AC's own instruction, and §4.2's measurement is the
reason it must be: with both constraints violable, only one is reported.

### 4.4 AC-3 — adjacency, and the case most likely to pass while proving nothing

AC-3 is a **success** assertion, so every way of making it succeed trivially has to be closed. Four
exist: the neighbour was never inserted; the neighbour was inserted `cancelled`; the two rows are in
different bays through a fixture slip; or `no_bay_overlap` does not exist at all (case 0 closes the
fourth). The required order:

1. Seed. Insert the neighbour at `[anchor+0h, anchor+1h)` in `bayA` with `techB` and service type
   `quick`.
2. **Coverage.** Read the row back: it exists, `status = 'confirmed'`, `bay_id = bayA`, and its
   `starts_at` / `ends_at` equal the intended instants — compared as instants, not as strings.
3. **Negative control, on this exact fixture.** Insert `[anchor+0.5h, anchor+1.5h)` in `bayA` with
   `techA` (technician free, everything else valid). It **must** be rejected `23P01` /
   `no_bay_overlap`. This is the step that makes AC-3 falsifiable: it proves the constraint is live
   for *this bay* and *this neighbour*, so the adjacency result that follows is about adjacency.
4. **The criterion.** Insert `[anchor+1h, anchor+2h)` in `bayA`. It succeeds. Read it back.
5. **The other boundary.** Insert `[anchor-1h, anchor+0h)` in `bayA`. It succeeds. Read it back.
6. Assert three non-cancelled rows now exist in `bayA` across `[anchor-1h, anchor+2h)`.

Step 5 is not redundant with step 4: a range type is defined by two bounds and testing one of them is
half the claim. Step 6 is the coverage assertion for steps 4 and 5 together — three inserts, three
rows, no silent no-ops.

Per §2, what this establishes is that the range is **not closed**. It cannot distinguish `[)` from
`(]`, and the test's own message should not claim otherwise.

### 4.5 AC-4 — the partial predicate

The AC's shape is before-and-after, and only the pair is evidence:

1. Seed; insert appointment A at `[anchor, anchor+1h)` in `bayA` with `techA`; read it back.
2. **Before.** An insert overlapping A in `bayA` (technician free) is rejected `23P01` /
   `no_bay_overlap`.
3. `UPDATE appointment SET status = 'cancelled' WHERE id = A`. Assert one row was affected.
4. **Coverage.** Read A back: it still exists, `status = 'cancelled'`, and its interval, bay and
   technician are **unchanged**. Without this, a test that deleted the row would pass.
5. **After.** The same overlapping insert now succeeds. Read it back.

Step 2 is what turns step 5 from "an insert worked" into "the predicate is live and not decorative",
which is the AC's own wording.

### 4.6 AC-5, AC-6, AC-7 — the composite foreign keys

All three in a window with **no** appointments, so no exclusion constraint can pre-empt the foreign
key (§4.2). All three assert `code === '23503'` plus the constraint name.

| | Fixture | Violable constraint | Everything else |
|---|---|---|---|
| **AC-5** | `(techB, standard)` | `appointment_technician_qualified` | `techB` is in the dealership; bay, vehicle and customer all valid |
| **AC-6** | `vehA` with `custB` | `appointment_vehicle_owned_by_customer` | Note there is **no** standalone FK from `appointment.customer_id` to `customer`, so a `custB` that exists and a `custB` that does not both reach the same constraint |
| **AC-7** | Two seeded dealerships; `bayA` of D1, `dealership_id` of D2, and a **technician of D2 qualified for a service type of D2** | `appointment_bay_in_dealership` | Getting the technician wrong makes `appointment_technician_in_dealership` violable too, and §11.2 A-2 says which one is reported is not guaranteed |

AC-7's AC says only "rejected"; the design fixes the assertion at `23503` on
`appointment_bay_in_dealership`, because "rejected" with no name would be satisfied by any of four
constraints and would not be evidence for A-9. **Measured:** all three fire as specified with these
fixtures (§11.1 M-2).

### 4.7 AC-8 — the interval ordering

Two cases, both in an empty window: `ends_at = starts_at`, and `ends_at < starts_at`. Both must be
rejected with `code === '23514'` and `constraint === 'appointment_interval_ordered'`.

The inverted case had a plausible alternative outcome worth naming: `tstzrange(x, y)` with `y < x`
raises `22000` *"range lower bound must be less than or equal to range upper bound"*, and if the
exclusion index were evaluated before the CHECK, AC-8 would fail with the wrong SQLSTATE. **Measured
as `23514` / `appointment_interval_ordered` in all three variants tried, including one that also
violated a foreign key** (§11.1 M-1). The CHECK wins.

---

## 5. Asserting a SQLSTATE without trusting message text

There is no `src/` in this slice, so the test uses `pg`'s `Client` directly and reads the fields of
`DatabaseError`. **Measured (§11.1 M-1, M-2): `code`, `constraint`, `table` and `schema` are all
populated** on `23P01`, `23503` and `23514` from an `INSERT` on `appointment`.

**Asserted:**

| Field | Value | Why it is trustworthy |
|---|---|---|
| `err.code` | `'23P01'`, `'23503'`, `'23514'` | The wire protocol's `C` field. Defined by the SQL standard and by PostgreSQL's `errcodes.txt`, never localised, never reworded |
| `err.constraint` | the constraint's name | The wire protocol's `n` field, carrying the catalogue name verbatim. It is what discriminates four `23503`s from each other, and it is what ADR-0009 prunes on and what labels `booking_conflicts_total{resource}` |
| `err.table` | `'appointment'` | Cheap, and it makes a mis-targeted fixture fail loudly |

**Not asserted:** `err.message`, `err.detail`, `err.hint`, `err.severity`. `message` and `detail`
are localised by `lc_messages` and are reworded between major versions; `severity` is localised.
Asserting on them would make the suite depend on the container image's locale — and, more to the
point, would make the *name* assertion redundant with a substring match on prose, which is the thing
this section exists to forbid.

**One rule about *how* the error is caught**, because it is the error-path form of 00a's first rule.
`await expect(...).rejects.toThrow()` is satisfied by a `TypeError` from a typo in the helper. So
every negative case **captures** the thrown value, asserts a truthy `code` **first**, and only then
asserts the specific code and name. Assert what you caught before asserting what it says.

**Where ADR-0006 comes in, and where it does not.** ADR-0006 chose Kysely partly because it preserves
`err.code` and `err.constraint` on the way out of the driver. That property is what
`src/persistence/pgError.ts` will rely on from slice 03. This slice does not exercise it: it reads
the fields from `pg` directly, one layer below. So slice 00 establishes that **PostgreSQL emits**
these fields; it establishes nothing about whether **Kysely preserves** them. That remains slice 03's
to prove, and it is a genuinely separate claim.

---

## 6. Data-model delta

This slice is nothing but data model. The delta is the whole of arc42 §8.1 and §8.2 — nine relations,
one enum type, one extension, seven named constraints on `appointment` — created from empty, with no
TypeScript at all. **Measured: §8.1's schema applies verbatim on `postgres:16`** (§11.1 M-0); it had
never been executed before today.

### 6.1 The constraints, and what each one is *for*

| Constraint | Type | Enforces | From |
|---|---|---|---|
| `no_bay_overlap` | exclusion | A bay holds at most one live appointment over any instant | `CLAUDE.md` §2.1, requirement 2 |
| `no_technician_overlap` | exclusion | A technician is committed to at most one job at a time | `CLAUDE.md` §2.1, A-2 |
| `appointment_technician_qualified` | composite FK | The technician is qualified **for this service type** | Requirement 2, first half; A-3 |
| `appointment_bay_in_dealership` | composite FK | The bay belongs to the appointment's dealership | A-9 |
| `appointment_technician_in_dealership` | composite FK | The technician belongs to the appointment's dealership | A-9, A-3 |
| `appointment_vehicle_owned_by_customer` | composite FK | The vehicle belongs to the named customer | A-6, ADR-0002 |
| `appointment_interval_ordered` | CHECK | `ends_at > starts_at` | A-1's derived interval must be non-empty |

### 6.2 Three columns have no foreign key of their own, and that is complete rather than missing

`appointment.dealership_id`, `service_type_id` and `customer_id` carry no standalone reference. Each
is covered **transitively** by a composite:

| Column | Covered by | An unknown value fails as |
|---|---|---|
| `dealership_id` | `appointment_bay_in_dealership`, `appointment_technician_in_dealership` | `23503` on the bay composite |
| `service_type_id` | `appointment_technician_qualified` | `23503` on the qualification composite |
| `customer_id` | `appointment_vehicle_owned_by_customer` | `23503` on the vehicle composite |

Adding the singleton foreign keys as well would be redundant and would make the *reported* constraint
non-deterministic in exactly the cases §4.2 depends on being deterministic. Recorded here because it
reads like an omission on first inspection and is not.

### 6.3 Three of the four composite keys are unreachable from the API

This is the observation that most justifies the shape of this slice, and it is not stated anywhere in
arc42 yet.

Under A-10 the **system** allocates the bay and the technician; a client names only a dealership, a
service type, a vehicle, a customer and a start. So:

- `appointment_bay_in_dealership`, `appointment_technician_in_dealership` and
  `appointment_technician_qualified` can only be violated by a **bug in the allocator**. No request
  can reach them. They are defence in depth, and §8.6's taxonomy correctly has no row for them —
  a violation is a `500`.
- `appointment_vehicle_owned_by_customer` is the only one a client can trip, and §8.6 gives it
  `422 /problems/vehicle-not-owned`.

**Therefore AC-5 and AC-7 cannot be tested through HTTP in any later slice.** This is the only slice
in which those two constraints can be shown to fire at all. That is a strong reason for the slice to
exist in this form, and a strong reason not to let AC-5 or AC-7 be weakened at step 2.

### 6.4 Four sharp edges, recorded now so they are not discovered later

- **`appointment.id` has no default.** No `gen_random_uuid()`, so no `pgcrypto` and no `uuid-ossp`;
  `btree_gist` remains the only extension, which is what §7.1's deployment note depends on. The
  writer supplies the id — consistent with A-10, and it means the seed loader and later the
  repository both generate ids application-side.
- **`updated_at` has a `DEFAULT now()` and nothing maintains it.** There is no trigger. ADR-0003's
  atomic move is an `UPDATE`, and unless that statement sets `updated_at = now()` explicitly the
  column will lie from slice 05 onward. **No trigger is added here**: a trigger is behaviour in the
  database beyond the invariant, and §2.1's discipline is that the database holds the *invariant*
  while the application holds the convenience. The obligation moves to the writer, and §11.3 carries
  it.
- **Nothing cascades.** No `ON DELETE` clause anywhere, which is correct because nothing in this
  system deletes: cancellation is a status transition (ADR-0003). A future need to remove a
  dealership will fail loudly on the references, which is the right failure.
- **`opening_hours` has no row for a closed day**, by §8.1's own comment. Nothing in this slice
  depends on it; it is ADR-0001's, and the seed sidesteps it by covering all seven days (§3.3).

---

## 7. Quality scenarios

The slice links **QS-1, QS-2 and QS-11**. None of the three is satisfied by this slice, and saying
precisely which clause of each *is* made true is the point of this section.

| | What slice 00 makes true | What it deliberately does not |
|---|---|---|
| **QS-1** | The clause *"the violated constraint reported by PostgreSQL is named `no_bay_overlap`"*, single-threaded, from an `INSERT` (AC-1). Plus the table-level property *"exactly one row exists with `status <> 'cancelled'` for that bay over any overlapping range"* — for two sequential writers | Everything about **concurrency**. N = 20 simultaneous requests, the barrier, the interleaving. And everything about **HTTP**: no `409`, no `/problems/no-capacity`. Enforced by `tests/concurrency/no-bay-overlap.test.ts`, which does not exist |
| **QS-2** | The same for `no_technician_overlap` (AC-2), asserted separately because two constraints are two objects | As QS-1 |
| **QS-11** | Nothing that QS-11 asserts. What this slice establishes is the **left-hand side** of §8.6's mapping: the `(SQLSTATE, constraint)` pairs that the taxonomy's `409 no-capacity` and `422 vehicle-not-owned` rows are mapped *from*, measured rather than assumed | Every status code and every `type` URI. QS-11 is enforced by `tests/contract/error-taxonomy.test.ts` at slice 03/10 |

**A single-threaded exclusion-constraint test is not a weak version of QS-1; it is a different
claim.** It establishes that the constraint exists, is named, and rejects an overlapping write.
QS-1 establishes that it does so under simultaneity. The first is a precondition of the second and
proves nothing about it — and the temptation to describe slice 00 as "QS-1, partly" is exactly how a
concurrency claim ends up resting on a sequential test.

**One warning for QS-11's eventual author**, carried forward from arc42 §8.5: a TypeBox
`Type.Literal` **substitutes** the schema's constant into the response body. If §8.6's `type` URIs
are pinned as literals, a contract test that reads `type` from the body reads the constant back and
passes regardless of what the handler computed. Slice 00 cannot fix that; it can stop it being
rediscovered.

**QS-10** is not linked and is not claimed. `lint:arch` will cruise the same nine TypeScript modules
before and after this slice, because the slice adds only `.sql` and `tests/`. §9 says what that means
for criterion C4.

---

## 8. The red, and why it is an assertion failure rather than a setup crash

This is the single most likely way slice 00 goes wrong, and 00a's §4 is the reason: `globalSetup`
calls the migration runner **before any test**, so a malformed `0001_*.sql` aborts the whole `db`
project and the "red" becomes a stack trace that proves nothing.

### 8.1 At the red commit the hazard cannot occur, and the reason is structural

At the red commit `src/persistence/migrations/` contains **only** the tracked `.gitkeep` that 00a
left there. The test-engineer is denied every write **and every read** under `src/` by
`.claude/hooks/guard-paths.mjs`, and the implementer's commits all come later. So:

- `runner()` finds zero migrations (`.gitkeep` is filtered by `node-pg-migrate`'s default
  `ignorePattern` of `^\..*`, established at 00a from the source), creates `pgmigrations`, and
  **succeeds**;
- every test in the `db` project is collected and run;
- `exclusion-constraints.test.ts` fails **inside its case bodies**, starting with case 0, on a
  schema that is not there.

The red is assertion-shaped **by ownership**, not by luck, and the property is checkable: if a
migration file existed at the red commit it would mean either a `guard-paths` denial that did not
fire or an implementer commit ordered before the test commit, and both are visible in git.

**What the failure will say.** Case 0 fails first with `to_regclass('appointment')` null. Every AC
case fails on `42P01 relation "dealership" does not exist` from its own `seedDealership` call. That
is a legible red: one message that names the missing schema, and eight that name the missing seed.

**`red-proof` classifies it as `tests/integration/`-only**, which is exactly the case O-1's ruling
added to the red zone on 2026-09-04 and which has never run live (§9).

### 8.2 At the green commit the hazard is real, and this is the mitigation

**Measured (§11.1 M-4):** with a malformed statement in `0003`, the programmatic runner throws,
`0001` and `0002` stay committed, `globalSetup` rejects, and the `db` project produces **no test
results at all**.

Three things follow, in the order they should be tried:

1. **The implementer should run the `db` project locally before pushing.** 00a §11.5 records that
   *"`docker` and `podman` are both absent"* for both roles. **That is now contradicted by
   measurement:** on 2026-09-04 the architect's own shell reached a working Docker daemon and started
   `postgres:16`. Whether the implementer's and the test-engineer's shells can do the same has **not**
   been measured (§11.2 A-4). **Action at step 2: both roles run `docker info` and report the
   result.** It is one command, and for a slice that is nothing but database it changes the whole
   inner loop — the difference between TDD and CI round-trips.
2. **If Docker is genuinely unavailable, the mitigation is commit discipline, not tooling.** §1.3
   already fixes the migrations at one commit; the fallback if that commit's CI run aborts in
   `globalSetup` is to read the runner's own error, which names the failing file and prints the
   failing statement with a caret (`node-pg-migrate`'s `db.query` does this — read from the source).
   The information is there; only the feedback latency is bad.
3. **`globalSetup` must not catch the migration error.** Wrapping the runner in a `try`/`catch` that
   provides an error message to the tests would convert a loud, correct failure into a run where
   every case fails for a laundered reason, and it would put a branch into a test-engineer-owned file
   whose purpose is to have none. 00a rejected substituting an evidence chain for an observation;
   this is the same move. **Rejected.**

### 8.3 What must not be changed

**Slice 00 adds `0001`, `0002`, `0003` under `src/persistence/migrations/`, plus
`tests/integration/exclusion-constraints.test.ts`, `tests/support/seed.ts` and `tests/support/ids.ts`
— and modifies no existing file.** In particular `tests/setup/postgres.ts`, `vitest.config.ts`,
`package.json` and `.github/workflows/verify.yml` are untouched. That is 00a's seam promise, and it
has evidential value beyond tidiness: if this slice's CI run fails, the failure is attributable to
the migrations and the new tests, because nothing else moved.

---

## 9. What the pilot now measures that 00a could not

Four things, and the first two are the ones 00a explicitly could not do.

**C1 is measured live rather than by backfill.** 00a's `check.run` records had to be reconstructed
after the fact, because `collect-ci.mjs` was built *by* the slice it was supposed to observe, and the
correction in 00a §7 turned an "unmeasurable by construction" claim into a backfill with three
preconditions attached. For slice 00 the collector already exists, on `main`, from 00a's green commit
7. The red run is collected as it happens, the green run after it, and C1 reads a failing
`check.run` whose `ts` precedes a passing one **without anybody reconstructing anything**. The
orchestrator's ordering obligation (append oldest-run-first) still applies, for the reason 00a §7
gives twice.

**`red-proof` runs as a live job on a red SHA for the first time.** 00a could only *replay* it
offline against its own downloaded artifact, because the job did not exist when the red commit was
authored — that is 00a's AC-6 bootstrap paradox, narrowed but not closed. Here the job exists on
`main` before the slice starts. And the case it will judge is the one O-1's escalation added:
**red-marked subject + a failure under `tests/integration/` only + `verify` green → exit 0.** That
branch has six unit cases behind it and has never executed against a real run. Slice 00 is its first.

**The failure is unambiguous in a way 00a's could not be.** 00a's red came from three directories and
from a `depcruise` invocation whose predicted cause turned out to be wrong (F1). Slice 00's red comes
from one file, asserting against a schema that provably does not exist, with a first case whose
message names the missing relation. There is no second explanation available.

**And one criterion will pass vacuously, which is said now rather than in the retro.** **C4** —
*"architecture held unprompted", measured from `depcruise` in `check.run`* — will report PASS,
because this slice adds **no TypeScript to `src/`**. `lint:arch` cruises the same nine modules before
and after. That is a true PASS by the criterion's own definition and it may not be redefined
(`process-criteria.md`: *"no redefining a criterion after seeing the result"*), but the retro must
record that it passed on a slice that could not have failed it. Recording it in advance is the only
way that observation is credible, and it is the mirror image of *"no counting UNVERIFIED as PASS"*.

---

## 10. Proposed arc42 edits, and one ADR

### 10.1 Edits at step 7, inside the slice's declared scope

The slice's `arc42:` field is **§8.1 · §8.2**, and R-11 is an open finding against exactly the
failure of editing outside a declared scope. So:

| Section | Correction |
|---|---|
| **§8.1** | An as-built note recording that the schema applies verbatim on `postgres:16` (dated, with what was run); **§6.2's transitive-reference table**, so the three columns without a singleton FK read as complete rather than missing; **§6.3 — three of the four composite keys are unreachable from the API surface**, which is why they can only be tested here; `appointment.id` having no default and `btree_gist` therefore remaining the only extension; `updated_at` maintained by the writer with no trigger, and the obligation that puts on ADR-0003's `UPDATE` |
| **§8.2** | The **measured constraint-evaluation order** — CHECK, then index-based, then FK triggers — and its consequence for any test asserting a specific SQLSTATE; the normalised `pg_get_constraintdef` text a catalogue assertion must match; consequences 5 and 6 confirmed with the measured `btree_gist` version and the two partial GiST index definitions; **and a refinement of consequence 1**: adjacency discriminates `[)` from `[]` and provably cannot discriminate `[)` from `(]`, so the half-open claim is stated at the strength the evidence supports |

### 10.2 Two edits this design wants and may not make

Both are outside `§8.1 · §8.2`. They are named here so the orchestrator can widen the slice's
`arc42:` field at step 2 if the human agrees, and the design proceeds unchanged if it does not:

- **§7.2** — one sentence recording the measured `singleTransaction` divergence between
  `npm run db:migrate` (CLI, all-or-nothing) and `globalSetup` (programmatic, per-migration). §7.2
  already narrows its claim to *"the same package, the same directory and the same `pgmigrations`
  table"* and warns that a CLI-only flag would diverge silently. This is that warning coming true,
  measured, one slice later — it belongs beside the warning.
- **§11** — two debt items: the divergence above, whose remedy is one option flag; and `updated_at`
  having no trigger and therefore an obligation on every future `UPDATE`.

### 10.3 ADR-0012 — seed fixtures, `status: proposed`

**Nothing in ADR-0001..0011 says where reference data comes from.** A-7 says *"via migrations and
fixtures"* and leaves "fixtures" undefined; ADR-0007 governs migrations and is silent on seeds. §3
makes a real choice between four options with different downstream consequences — the suite's
isolation model, the test-engineer's independence, and whether a demo dataset exists — so it is
recorded as an ADR rather than settled inline.

The recommendation is §3: test fixtures are a test-engineer-owned loader in `tests/support/`,
per-case, with derived ids; the demo seed is a separate later artifact under `src/persistence/seed/`
with its own npm script, and is deliberately not built now.

It is raised **`status: proposed`** because the second half — deferring the demo seed — touches what
the submission demonstrates, and that is the human's, not the architect's. A `proposed` ADR is a
technical-debt item by construction and appears in the generated register in §11.1 until it is ruled
at the gate.

**No other ADR is needed.** The migration split is ADR-0007 applied; the schema is §8.1 as authored
at Gate B; the exclusion constraints are `CLAUDE.md` §2.1 and not the architect's to decide; the
`tests/integration/` ownership question was settled at 00a step 7.

---

## 11. Measurements, assumptions, and what is deferred

### 11.1 Measured by the architect on 2026-09-04

All against `postgres:16` in a throwaway container, with this repository's pinned `pg@8.23.0` and
`node-pg-migrate@9.0.0`. The container was removed afterwards; nothing was committed from it.

| # | Claim | Result |
|---|---|---|
| **M-0** | §8.1's schema, pasted verbatim, applies to an empty `postgres:16` | Applies clean. It had never been executed before |
| **M-1** | Constraint evaluation order, and the AC-8 question | `CHECK` fires before everything: `ends_at = starts_at`, `ends_at < starts_at`, and `ends_at < starts_at` **with** an unqualified technician all report `23514` / `appointment_interval_ordered`. No `22000` from the range constructor |
| **M-2** | Which constraint is reported when several are violable | An insert that overlaps **and** names a bay from another dealership reports `23P01` / `no_bay_overlap` — the exclusion constraint pre-empts the FK triggers. With no overlap, AC-5's, AC-6's and AC-7's fixtures report `23503` on `appointment_technician_qualified`, `appointment_vehicle_owned_by_customer` and `appointment_bay_in_dealership` respectively. With **both** exclusion constraints violable, `no_bay_overlap` was reported |
| **M-3** | Catalogue text, and the extension | `btree_gist` `1.7`. `pg_get_constraintdef` renders the predicate as `WHERE ((status <> 'cancelled'::appointment_status))`. Both constraints back partial GiST indexes of the same name |
| **M-4** | A malformed `0003` under the **programmatic** runner | Throws; `0001` and `0002` remain committed and recorded in `pgmigrations` |
| **M-5** | The same under the **CLI** (`npm run db:migrate`'s entry point) | `--single-transaction` defaults `true`; everything rolls back, leaving only `pgmigrations` |
| **M-6** | The three-file split, forward from empty, then re-run | Applies `0001`, `0002`, `0003` in order; both exclusion constraints present. A second run applies `[]` |
| **M-7** | Down migrations | `direction: 'down', count: 3` reverses cleanly to `pgmigrations` alone, `btree_gist` dropped |
| **M-8** | `pg`'s `DatabaseError` fields | `code`, `constraint`, `table`, `schema` populated on `23P01`, `23503` and `23514` |
| **M-9** | Adjacency and the partial predicate | `[09,10)` then `[10,11)` and `[08,09)` in one bay all succeed; `[09:30,10:30)` is rejected `23P01`; after `status='cancelled'` the overlapping insert succeeds |

M-4 is the one that nearly became a wrong sentence: the architect's first probe reported a
`CREATE TYPE … already exists` failure that looked like a `node-pg-migrate` defect and was in fact a
bug in the probe's own fixture-splitting `sed`. Recorded because it is the mechanism of rule 2 working
on the person who wrote the rule.

### 11.2 Assumed, not measured

| # | Assumption | Why it is not measured, and what depends on it |
|---|---|---|
| **A-1** | How Vitest's JSON reporter represents a `beforeAll` failure — whether it produces a `testResults[]` entry `red-proof` can classify | Not measured, and **the design does not depend on it**: §4 forbids schema work in `beforeAll` precisely so the question never arises. If it arises anyway, measure it before reasoning about it |
| **A-2** | Which exclusion constraint is reported when both are violable | Observed once as `no_bay_overlap` (M-2). That is index order and PostgreSQL does not document a guarantee, so §4.2 requires each case to make exactly one constraint violable rather than relying on the observation |
| **A-3** | That two parallel seeds with a literal VIN would collide on `vehicle.vin`'s `UNIQUE` | Deduced from the schema, not observed. §3.4's derived VIN makes it moot |
| **A-4** | Whether the implementer's and the test-engineer's shells can reach a Docker daemon | The architect's can (§8.2). The other two are a different sandbox and were reported absent at 00a. **One `docker info` each at step 2 settles it** |
| **A-5** | That the planner *chooses* the partial GiST indexes for the availability query (§8.2 consequence 6) | Index definitions are measured; plan selection is not, and belongs to QS-14, not here |

### 11.3 Deferred, with the reason

| Item | Why not now |
|---|---|
| **Passing `singleTransaction: true` in `globalSetup`**, so both entry points agree on partial failure | It is one line and it is right, but it edits `tests/setup/postgres.ts` and breaks 00a's seam promise (§8.3) on the slice where that promise is load-bearing for attributing a failure. The divergence only bites on a broken migration, and both paths fail loudly. §10.2 proposes it as a §11 debt item |
| **A test that exercises the down migrations** | ADR-0007 puts down migrations outside any recovery story; the DoD says migrations run **forward** from empty; no AC mentions them. M-7 records that they work today. A test would pin behaviour nothing depends on |
| **The demo seed and `npm run db:seed`** | ADR-0012's second half, and not in this slice's *In scope*. It has a different consumer (the cURL harness, TC-5) and inventing it now would fix the demo narrative six slices early |
| **An `updated_at` trigger** | §6.4. The obligation moves to the writer; a trigger is behaviour in the database beyond the invariant |
| **Regenerating `src/persistence/schema.ts`'s `Database` interface from the migrated schema** | ADR-0006 and ADR-0007 both record the gap and both name the same mitigation — regenerate in CI and fail on a diff. It needs a `Database` interface with contents, which arrives with the first repository at slice 02. Not this slice, and noted so it is not mistaken for an oversight |

### 11.4 Ambiguity in the acceptance criteria, flagged rather than resolved

`CLAUDE.md` §11 requires these to be surfaced, not silently decided. None is a blocker; each has a
recommendation the design proceeds on unless step 2 says otherwise.

1. **AC-7 does not name a constraint**, where AC-5 and AC-6 do. §4.6 fixes it at `23503` on
   `appointment_bay_in_dealership`, because "rejected" alone is satisfiable by four constraints and
   is not evidence for A-9. If the human intended something broader, this is the cheap moment.
2. **AC-9's "deterministically" is undefined.** §3.4 reads it as *the fixture's shape and its
   name-to-id resolution are a pure function of the case*, not *the ids are fixed literals* — the
   latter is incompatible with the parallel, isolate-by-data suite arc42 §7.2 requires.
3. **AC-9's "every reference table"** is read as all eight non-`appointment` relations, including
   `opening_hours`, which §8.1 describes as existing "because of a Gate A ruling" rather than as
   plain reference data. Seeding it costs nothing and ADR-0001 needs it from slice 01.
4. **AC-4 says "its status is set to `cancelled`"** without saying by what. Read as a direct `UPDATE`
   in the test: there is no application code in this slice, by the slice's own *Out of scope*.
