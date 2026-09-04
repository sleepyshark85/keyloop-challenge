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

**Amended at step 2 on 2026-09-04**, after both reviewers objected. Five findings, five agreements —
three of them against sentences this document asserted and had not checked. Every ruling is applied in
the body: this is one current document, not a design plus a thread of corrections. The human widened
the slice's `arc42:` field to **§8.1 · §8.2 · §7.2 · §11** on the same date, so §10's edits are in
scope.

**Read §0 first.** It is the audit trail, and **T-4** in it is the most consequential entry: the
design as first written could not detect a wrongly-keyed exclusion constraint, which is the one defect
this whole slice exists to make impossible.

---

## 0. Step 2 rulings

Both the test-engineer and the implementer returned **OBJECT**. One round of discussion was convened
per `CLAUDE.md` §6; these are the rulings. Four of the five carried **measurement rather than
argument** — a role ran the thing this design specified and reported what happened — and the fifth was
a two-line comparison between an ADR and `package.json` that the architect could have made and did
not.

| # | Objection | Outcome | Reasoning, in one line |
|---|---|---|---|
| **T-4** | Case 0 never asserts the column the constraints are keyed on, so a `no_bay_overlap` keyed on `dealership_id` survives all of AC-3 | **(a)** finding accepted; remedy accepted with two additions and a stated limit | Only AC-2 catches the mutant, and only through the behaviour §11.2 **A-2** says is not guaranteed — so on the design's own terms, nothing catches it |
| **T-5** | The one-violable-constraint discipline is enforced non-uniformly by FK trigger order: a drifted AC-5 fixture passes silently where the equivalent AC-6 drift fails loudly | **(a)** accepted; remedy accepted **plus an ordering rule the remedy lacked** | Trigger order follows declaration order in `0003_appointment.sql`. A discipline whose enforcement depends on the order constraints happen to be listed in is not a discipline |
| **T-6** | §4.4 step 5 is redundant with step 4 **and its stated reason is false** | **(a)** accepted; step **kept**, demoted, and its reason replaced with the admission | The reason conflated the range expression's two bounds with the test's two rows. Both steps reject the closed-range mutant, and no mutant separates them |
| **I-8** | §8.2's mitigation 2 is false — the harness silences the logger the fallback depends on | **(a)** accepted; mitigation **replaced**, not merely corrected | `tests/setup/postgres.ts:68` passes `log: () => {}`. The architect read the mechanism in `db.js` and not the call site, having quoted that call site earlier in the same session |
| **I-9** | The `singleTransaction` divergence is **conformance drift from ADR-0007**, not two entry points with different defaults — so the stated reason for deferring it was wrong | **(a)** accepted; deferral **held on corrected grounds**; debt relocated | ADR-0007's Decision says the runner is invoked programmatically on both paths; `package.json:18` is the CLI binary. The remedy is entirely on the non-test-owned side, so the seam-promise argument never applied |

**Step 3 findings, ruled 2026-09-04** after the red commit was observed in CI.

| # | Objection | Outcome | Reasoning, in one line |
|---|---|---|---|
| **T-7** | `postgres-harness.test.ts:50` asserts `pgmigrations` is empty, so **the slice cannot reach all-green as specified**, and §8.3 assigns the fix to nobody | **(a)** accepted; ruled to the **structural** form, not the literal one | §4.1 cites that file four lines above the failing assertion. §8.3 enumerated files by ownership risk and never asked which existing *assertions* this slice falsifies |
| **T-8** | Case 0's stated limit leaves an added singleton foreign key undetected, falsifying §6.2 while all ten cases pass | **(a)** accepted; the architect's **own limit narrowed** rather than defended | Extra constraints on the table every case writes to are not like the column types and unrelated objects the limit had bundled them with. Same query, same mechanism, no added fragility |

T-7's remedy was ruled **(a) over (b)** — a second test-engineer commit rather than an implementer
obligation at step 4 — on a ground stronger than attribution: `tests/integration/` is not in
`guard-paths.mjs`'s `TEST_OWNED`, so (b) would have had the implementer editing a test-engineer-owned
assertion to green its own commit, with the hook allowing it. That is **O-9**, recorded in §8.3 where
the reader who needs it will find it.

**The test-engineer took the structural form and improved on the ruling.** It placed the
migration-names assertion ahead of the extension because *"it names the cause where the extension names
a symptom"*, and identified a property the ruling had implied without stating — **it is the only
assertion in the suite that says where the schema came from.** It also narrowed case 0's limit in the
file's own docblock rather than waiting for this document, and verified the commit's polarity by
running `red-proof`'s `judge()` offline rather than asserting it. Landed as `dc3b459`, unmarked;
`98ace77` remains the slice's single red commit.

**No loopback was consumed.** All five are **(a) Clarification** under `CLAUDE.md` §6 — the design's
substance held, its specification was incomplete or its stated reasons were false — so the slice stays
at `loopbacks: 0`. That is what §6's *"objections here are cheap; the same ambiguity found at step 5
costs a full cycle plus a loopback"* is for, and this round is the clearest demonstration of it the
project has produced: **T-4 alone would have shipped a wrongly-keyed constraint undetectable until
slice 07.**

### Four things settled alongside the rulings

- **§11.2 A-4 is closed.** Docker works in all three roles' shells, falsifying 00a §11.5's *"no
  container runtime on either role's machine"*. §8.2's mitigation 1 is promoted from advice to the
  stated step-4 loop, and what this does and does not falsify in 00a is recorded in arc42 §7.2.
- **`tsc` emits only `.ts`, so `dist/persistence/` holds no migrations** — the built artifact cannot
  migrate itself. Inert today; placed in arc42 §11 and **coupled to I-9**, because a conforming
  programmatic `db:migrate` must resolve a directory the build actually populates or the fix ships
  broken.
- **The test-engineer declined the pre-concession this design offered on derived ids**, for a reason
  the design had not stated and which is better than the one it had. §3.4 adopts it and withdraws the
  fallback. A round that produces only agreement is deference; this one produced a refusal that
  improved the decision.
- **Vitest parallelises files, not cases.** *"The suite parallelises"* was doing work it cannot do at
  case granularity. §3.2 and §3.4 now rest on **attributability**, which is what per-case namespaces
  actually buy and which is load-bearing for §4.4's count assertion regardless of concurrency.

## 0.1 The rules from 00a, and this design's compliance

00a ended with two rules in the design record. Both bind here, and this round added the
generalisation that sits behind the second (00a §5, *"the second rule this slice keeps
rediscovering"*, amended 2026-09-04).

> **Rule 1 — a green thing says nothing about what it examined.** Every assertion about a result must
> be preceded by an assertion about coverage.

Applied in §4: the test file's **first** case is a catalogue assertion — the nine relations, the
extension, and all seven named constraints on `appointment` compared **by equality** against their
normalised definitions — and the AC cases are only evidence *given* that it passed. Applied again
inside every negative case, where a rejection is worthless unless the fixture is first proved
bookable in every other respect (§4.6), and inside AC-3 and AC-4, where a success is worthless unless
the fixture is first proved capable of conflicting (§4.4, §4.5).

**T-4 is what happens when the rule is applied one level too shallow.** The first draft asserted
constraint *names* and *types* and called that coverage. It was coverage of the wrong thing: it
proved the objects existed, not that they were keyed on the columns that make them the invariant.

> **Rule 2 — a stated mechanism nobody ran is not a mechanism.** Four of the architect's own causal
> sentences in 00a were confident and wrong.

Applied by measuring. **Everything in §11.1 was executed by the architect on 2026-09-04** against
`postgres:16` in a throwaway container, using this repository's pinned `pg@8.23.0` and
`node-pg-migrate@9.0.0`. Nine of the claims this design would otherwise have asserted are measured
facts; the rest are labelled **assumed, not measured**, in §11.2. One of the measurements caught a bug
in the architect's own probe fixture before it became a sentence in this document, which is the
mechanism working as intended.

A caveat that rule 2 requires of the measurements themselves: they were made with `psql` and a
`pg.Client`, **not** through this repository's harness. They establish what PostgreSQL does. They do
not establish that the harness reaches it — that is what step 3 and step 4 are for.

**And rule 2 was not enough.** Step 2 found three more false causal sentences in *this* document
(T-6, I-8, and the parallelism claim), all written after rule 2 was quoted at the top of it. With
00a's F1 that is four instances of one shape, and the generalisation is now recorded in 00a §5 rather
than here:

> **For a discrimination claim, name the mutant. For a mechanism claim, name the call site.**
>
> Each of the four explained why something works by naming a mechanism's **capability** instead of its
> **configuration** or its **discriminating case**. `depcruise` *can* fail to open a directory —
> unchecked against the `mkdirSync` that creates it. `node-pg-migrate`'s `db.query` *does* print a
> caret — unchecked against the `log: () => {}` that swallows it. A range type *has* two bounds —
> unchecked against a mutant that separates them. Vitest *is* parallel — unchecked at what
> granularity.

What makes that uncomfortable rather than merely instructive is that **this design already contains
the technique, correctly applied**: §2's proof that `[)` and `(]` are indistinguishable names the
discriminating case and shows there is none. The method was present, used on the constraint, and not
turned on the document's own test steps. **An attention asymmetry, not a knowledge gap** — which is a
harder thing to fix with a rule and the reason it is written down rather than resolved.

**A second tier, named at step 3 because it has now happened twice.** §8.1's prediction of which
assertion fails first was wrong at step 2 (it named `to_regclass`; case 0 asserted the extension
first) and wrong again at step 3 (it named `btree_gist`; case 0 now asserts `pgmigrations` first).
Neither needed a measurement to catch, and neither was wrong on its own page — both were wrong because
they **restated a fact that §4.1 already stated**, four sections away, where two copies drift without
either looking incorrect locally.

> **Tier 2 — a document contradicting itself.** Cheaper than the capability/configuration tier: no
> mutant, no call site, no container. Catchable by reading the document against itself.
>
> The remedy is not a better prediction. It is **not restating the fact**: a claim about which
> assertion fails first belongs beside the assertion order, or it names the *rule* rather than the
> assertion. §8.1 now says *"case 0's first assertion, whichever §4.1 lists first"*, which is true
> under every reordering because there is one statement of the order rather than two.

The two tiers differ in what they cost to catch, and that is why they are separated: tier 1 needs
something run, tier 2 needs something read. **Tier 2 came first in this document both times and was
found last both times**, which is the opposite of the order effort should be spent in.

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
back all three. Both measured (§11.1 M-4, M-5). One file would make the two paths agree trivially;
three files make the difference observable.

**That difference is not a property of the split — it is ADR-0007 conformance drift, and the step-1
draft framed it wrongly (I-9).** ADR-0007 requires the runner to be invoked *programmatically on both
paths*; `package.json:18` is the CLI binary, which is where the differing default comes from. The
split is not the cause and changing it would not be the fix. See §10.2 for the correction and §11.3
for the deferral, which rests on there being no cheap fully-conforming remedy — **not** on the cost of
editing the harness.

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

This raises the value of the implementer running the suite locally before pushing — which §8.2 now
makes the stated step-4 loop rather than a hope, A-4 having closed.

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
| **`0004_seed.sql`, a fourth migration** | It puts test fixtures into the schema history that ADR-0007 makes immutable, and — decisively — it gives the whole suite **one** dealership. arc42 §7.2 isolates by data so that a row is attributable to the case that wrote it and so every test implicitly asserts A-9's scoping. A single shared fixture removes both, and §4.4's count assertions stop meaning anything |
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

**What per-case namespaces buy is attributability, not concurrency, and the difference matters.**
Vitest parallelises **files**, not cases: the nine cases in
`tests/integration/exclusion-constraints.test.ts` run sequentially in one worker unless they are
explicitly marked concurrent, and they are not. So across files a namespace buys disjointness; *within*
this file it buys something the design depends on more heavily — **every row in the table is
attributable to the case that wrote it.** §4.4 step 6 counts non-cancelled rows in `bayA` across a
window, and that count is only a claim about AC-3 because no other case in the file can have written
into that bay. Nothing here rests on the suite being parallel, and the step-1 draft said it did.

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
reproducible but collide across cases; `randomUUID()` isolates but makes a failure message
different on every run.

**Decision: ids are derived, not random and not literal.** `tests/support/ids.ts` exposes
`uuidFor(namespace, name)` — a SHA-1 of `` `${namespace}/${name}` ``, truncated to sixteen bytes with
the version and variant nibbles set, formatted as a UUID. Same for `vinFor`, since `vehicle.vin`
carries a **global** `UNIQUE` and two cases seeding a literal VIN would collide with `23505` (§11.2
A-3 — the collision is deduced from the schema, not observed).

That buys disjoint subtrees across cases, and ids that are a pure function of the case's own name.

**The reason this is not a taste question is the test-engineer's, not the architect's.** The step-1
draft called derived ids a legibility choice, pre-conceded `randomUUID()` as an acceptable fallback,
and invited an objection. **The objection came, and it refused the concession** on a ground the draft
had not stated:

> In a suite that isolates by data with **no cleanup**, the UUID is the only handle on which subtree a
> failing row belongs to.

That is an argument about diagnosing a failure, not about reading one. Rows from all nine cases sit
in one table for the life of the run; when a count assertion fails, the ids in the failure message are
the only thing that says which rows were the case's own — and with `randomUUID()` they say nothing,
are not recomputable offline, and differ on every run. **The pre-concession is withdrawn**:
`randomUUID()` is no longer an acceptable fallback, and the reason above replaces the one the draft
gave. Recorded at this length because the architect invited an objection and received a reasoned
refusal that improved the decision, which is `CLAUDE.md` §6 point 3 working rather than a formality.

**No `ON CONFLICT DO NOTHING` anywhere in the loader.** Two cases sharing a namespace must fail
loudly on `dealership_pkey` rather than silently sharing a fixture, because a silently shared fixture
is exactly how a vacuous pass is manufactured.

### 3.5 What AC-9 asserts

*"Every reference table is populated"* is a coverage claim, so it is asserted as one. After one
`seedDealership`, for **each of the eight** non-`appointment` tables the case asserts a non-zero row
count scoped as tightly as the table allows:

- `opening_hours`, `service_bay`, `technician` — scoped by `dealership_id`, exact counts (7, 2, 2);
- `technician_qualification` — scoped by the returned technician ids, exact count 3;
- `dealership`, `service_type`, `customer`, `vehicle` — scoped by the returned ids, exact counts.

**`service_type`, `customer` and `vehicle` are not dealership-scoped**, so §7.2's isolation-by-data
is genuinely partial: every case's rows land in those three tables side by side. That is safe — none
of them carries a constraint two seeds can collide on except `vehicle.vin`, handled above — but it
means an assertion over those three tables must scope by returned id and never by table-wide count,
and it is a real limit on the isolation rule rather than something to imply away.

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

**(a)** `pgmigrations` records exactly `0001_extensions`, `0002_reference_data`,
`0003_appointment`, in filename order;
**(b)** `pg_extension` contains `btree_gist`;
**(c)** `to_regclass` resolves all nine relations of §8.1;
**(d)** the set of non-primary-key constraint names on `appointment` is **exactly** the seven, and
then for **each** of them the full normalised `pg_get_constraintdef(oid)` is compared **by equality**
against an expected string: `no_bay_overlap`, `no_technician_overlap`,
`appointment_interval_ordered`, `appointment_technician_qualified`, `appointment_bay_in_dealership`,
`appointment_technician_in_dealership`, `appointment_vehicle_owned_by_customer`.

**(a) is first because it is the most upstream fact, and it carries a property nothing else in the
suite has.** As built, the test-engineer placed it ahead of the extension on the reasoning that *it
names the cause where the extension names a symptom* — and observed something this design's ruling
implied without stating: **it is the only assertion in the suite that says where the schema came
from.** A schema created by a stray `CREATE TABLE` in a fixture, or baked into a container image,
satisfies every other case in the file. ADR-0007's entire argument is that the schema is reproducible
from a corpus of ordered, immutable `.sql` files, and (a) is what holds it to that. It also sits here
rather than in `postgres-harness.test.ts` because it is a per-slice fact — see §8.3 and T-7.

**(d)'s set equality is what makes §6.2 enforceable rather than documentary — this is T-8.** §6.2
forbids the singleton foreign keys on `dealership_id`, `service_type_id` and `customer_id` because
they *"would make the reported constraint non-deterministic in exactly the cases §4.2 depends on being
deterministic"*, and until step 3 nothing asserted it. Adding `appointment_customer_id_fkey` for
tidiness breaks no case in the file: AC-6 seeds its customer, so the singleton is satisfied and only
the composite fires. The damage lands at slice 03, where §8.6 maps `422 /problems/unknown-reference`
**by constraint name** and a second `23503` reaching the same insert makes which name arrives a matter
of declaration order. Two boundaries hold the remedy narrow: a filter on constraint type, and **no**
extension to the other eight tables — no case discriminates on their constraints, and doing so is the
first step back toward the whole-`\d` snapshot rejected below.

> **The filter must be an allowlist, `contype IN ('c','f','u','x')` — not the denylist `contype <> 'p'`
> that merged. Measured, and the assumption behind the denylist was wrong (M-11, A-7).**
>
> The step-3 ruling accepted `contype <> 'p'` on the reasoning that a later major surfacing `NOT NULL`
> as `pg_constraint` rows would *"fail loudly in the same commit as the bump"*, and treated that as
> acceptable. It was measured afterwards: clean on 16 and 17, but **PostgreSQL 18 emits six
> `contype = 'n'` rows for `appointment` alone**, so the denylist would fail with six invented names
> that nobody added.
>
> That is not a loud failure, it is a **false positive**, and the difference matters: someone bumping
> the image would see case 0 (d) fail, conclude the assertion is too strict, and loosen the very thing
> §6.2 depends on. The failure direction is the whole argument. An allowlist ignores a constraint type
> the *platform* introduces while still catching every constraint a *developer* can add — check,
> foreign key, unique, exclusion are the four, and they are exactly the types a negative case
> discriminates on.
>
> **Not urgent and not step 4's:** the image is pinned to `postgres:16` and `postgres-harness.test.ts`
> asserts `^16\.`, so nothing can fail today. It is a one-token change in a test-engineer-owned file;
> the orchestrator should sequence it — with the reviewer's step-5 findings, or a test-engineer commit
> before the gate — rather than interrupting the implementer mid-step-4.

**Equality, not substrings, and not `conname` plus `contype` — this is T-4.** The step-1 draft
asserted names and constraint types and called that coverage. It is not: a `no_bay_overlap` keyed on
`dealership_id WITH =` instead of `bay_id WITH =` has the right name, the right `contype`, and a
definition containing `tstzrange(starts_at, ends_at)`, `&&` and the partial predicate. It passes every
substring the draft specified. It then **passes all of AC-3** — the overlapping control is rejected,
both adjacencies are accepted — because within one dealership a bay-keyed and a dealership-keyed
constraint are behaviourally identical for every row AC-3 writes. The only case that separates them is
AC-2, and it separates them only because PostgreSQL happened to report one of two simultaneously
violable constraints, which **§11.2 A-2 says is not guaranteed**. On this design's own terms, nothing
caught it.

The same gap covers the composite foreign keys: `contype = 'f'` cannot see whether
`appointment_bay_in_dealership` references `service_bay (id, dealership_id)` or some other table's
matching pair. Equality on the rendered definition closes both classes with one mechanism.

Three requirements on how it is written, each of which decides whether the remedy works:

1. **The expected strings are hand-written literals, transcribed from arc42 §8.1 and §8.2 — never
   captured from the database under test.** A snapshot taken from the running schema asserts that the
   schema equals itself, which is §6's own fixture rule turned against the architect's remedy.
2. **Assert against the *normalised* text.** PostgreSQL re-renders a definition:
   `WHERE (status <> 'cancelled')` comes back as
   `WHERE ((status <> 'cancelled'::appointment_status))`, with the cast added and the parentheses
   doubled; `CHECK (ends_at > starts_at)` comes back as `CHECK ((ends_at > starts_at))` (§11.1 M-3).
   Literals transcribed from the migration source without that normalisation fail on a correct schema.
3. **The failure message prints expected and actual in full.** A `pg_get_constraintdef` mismatch
   shown as a truncated diff is unreadable, and an unreadable failure on the one artifact the
   submission rests on is close to no failure at all.

**The trade, judged rather than inherited.** Equality on rendered catalogue text is fragile against a
PostgreSQL major-version bump, and the test-engineer accepted that fragility explicitly. The architect
accepts it too, for a reason narrower than deference: the fragility is **bounded by two things already
in the repository** — the image is pinned to `postgres:16`, and `tests/integration/postgres-harness.test.ts`
already asserts `server_version` matches `^16\.`. A rendering change on a bump therefore fails seven
assertions loudly, once, in the same commit as the bump, with the diff naming exactly what moved. That
is a good failure. The alternative considered and rejected was reading `pg_constraint.conkey`,
`confrelid` and `confkey` and resolving to column names: version-stable, but it needs three different
mechanisms for exclusion constraints, foreign keys and checks, and **still** falls back to `pg_get_expr`
for the range expression and the partial predicate. One mechanism covering all seven wins.

**What case 0 is, and the limit of it.** It proves the seven **named** constraints are exactly right,
and it proves nothing about whether they **fire** — arc42 §8.2's own consequence 3, and QS-10's *"a
ruleset that has never rejected anything is not evidence"* pointed at the database. Cases 1 to 8 prove
firing.

**The limit, narrowed at step 3 rather than defended (T-8).** The step-2 form read *"nothing about
what else is in the schema — an extra constraint, a missing `NOT NULL`, a wrong column type"*, and
that bundled three unlike things. An extra constraint **on `appointment`** is not like the other two:
`appointment` is the table every case writes to, and constraint identity is precisely what every
negative assertion discriminates on, so an extra constraint there is the one addition that can change
what a passing test means. Set equality on names is the same query and the same mechanism, and unlike
the definition comparison it carries no text fragility. It is closed.

What remains open, stated accurately rather than merely shorter: a missing `NOT NULL` on
`appointment`, a wrong column type, the constraints on the other eight tables, and unrelated schema
objects. Closing *those* would mean snapshotting the whole `\d` output, which is rejected — brittle
against every unrelated change, and edited into uselessness within three slices.

**The test-engineer narrowed the same limit in the file's own docblock rather than waiting for this
section**, on the reasoning that *"leaving prose standing that the code has outgrown is the thing I
have been objecting to twice."* That is the correct instinct and it is the same one §4.2's maintenance
obligation encodes: the prose and the assertion change together or the prose becomes decoration.

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
3. **A negative case's fixture must be proved valid in every other respect — by a positive control,
   not by inspection.** This was a prose promise in the step-1 draft and is now an assertion; §4.6
   specifies it, and T-5 below is why the promise was not enough.

**Case 0 is a precondition of this section, not a companion to it — and that is T-4's real
lesson.** Every rule above reasons about which constraints a *fixture* can trip, and every one of them
silently assumes the constraints are keyed on the columns §8.1 names. They are not self-supporting: a
wrongly-keyed constraint makes rule 1 unsatisfiable while looking satisfied, because the test has no
way to know which columns it is isolating against. Stated plainly, because it is the kind of mistake
that recurs:

> **The isolation discipline presupposed the correctness it was supposed to help establish.**

Case 0 by equality is what supplies that presupposition. Cases 1 to 8 are evidence only *given* case
0, and the file's ordering should make that legible: if case 0 fails, nothing after it means anything.

**A maintenance obligation follows, and it is a feature.** Case 0 is arc42 §8.1 and §8.2 restated in
the catalogue's own vocabulary, so **when either section changes, case 0 changes in the same commit.**
That is not an inconvenience to be engineered away; it is the coupling that makes the two documents
verifiably the same schema.

**T-5 — the isolation rule was enforced unevenly, and the unevenness was arbitrary.** Rules 1 and 3
were, until step 2, enforced by nothing but care. The test-engineer showed why that is worse than it
looks: when **two foreign keys** are violable at once, PostgreSQL reports one of them, and which one
follows **trigger firing order, which follows declaration order in `0003_appointment.sql`.** So a
drifted AC-5 fixture passes silently while the identical drift in AC-6 fails loudly, and the
difference is nothing but the order the constraints happen to be listed in. A discipline whose
enforcement depends on an arbitrary ordering is not a discipline; §4.6's positive controls replace it
with an assertion.

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
5. **The same claim, in the other insertion order.** Insert `[anchor-1h, anchor+0h)` in `bayA`. It
   succeeds. Read it back.
6. **Coverage for steps 4 and 5.** Assert three non-cancelled rows now exist in `bayA` across
   `[anchor-1h, anchor+2h)` — three inserts, three rows, no silent no-ops.

**Step 5 is redundant with step 4, and that was checked rather than assumed (T-6).** The step-1 draft
justified it as *"a range type is defined by two bounds and testing one of them is half the claim"*,
which conflates the range expression's two bounds with the test's two rows. Both rows are produced by
the **same** expression and `&&` is symmetric, so `upper(neighbour) = lower(new)` and
`upper(new) = lower(neighbour)` are one predicate with the operands swapped. Against the closed-range
mutant this section itself names, **both steps reject**; no mutant was found that step 5 catches and
step 4 does not, including the asymmetric buffer mutants A-4 will eventually produce.

It is kept, **demoted from a criterion to part of step 6's coverage**: three rows is a stronger count
assertion than two, and step 5 exercises the seed's anchor arithmetic in the negative direction. It is
not kept under a second invented reason. A measured negative result recorded in the design is worth
more than a step quietly deleted; a step retained under a fresh justification is worth less than
nothing.

Per §2, what steps 4 and 5 establish is that the range is **not closed**. They cannot distinguish `[)`
from `(]`, and the test's own message must not claim otherwise.

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

#### Every negative case carries a positive control, and the order is not optional

**This is T-5's remedy and it is the amendment most likely to be built wrong. Read the ordering rule
before writing the case.**

Each of AC-5, AC-6, AC-7 and AC-8 gains a **positive-control sibling**: the same row with the single
intended defect repaired, asserted to **succeed** and read back. That is what turns §4.2's rule 3 from
a promise about the fixture into an assertion about it — without it, a fixture that drifts into a
second violation still reports the expected name whenever trigger order happens to favour it, and the
case passes while proving something else.

This is symmetry rather than an addition. §4.3 already reads the first row back, §4.4 has its negative
control, §4.5 has its before-and-after pair. AC-5, AC-6 and AC-7 were the three that got prose
instead.

> ### The ordering rule
>
> **The negative case runs FIRST. The positive control runs after it, or in a disjoint interval.**
>
> The reason is §11.1 **M-2**: the exclusion constraints are evaluated **before** the foreign-key
> triggers. A positive control run first **succeeds and occupies the interval**, so the negative
> insert that follows it hits `23P01` on `no_bay_overlap` or `no_technician_overlap` instead of the
> `23503` the case exists to assert. The control would break the very case it was added to validate,
> and the failure would look like a schema defect rather than a test-ordering defect.
>
> A control in a disjoint interval is equally correct and sometimes clearer. What is never correct is
> a control that precedes its negative sibling in the same interval on the same resources.

### 4.7 AC-8 — the interval ordering

Two cases, both in an empty window: `ends_at = starts_at`, and `ends_at < starts_at`. Both must be
rejected with `code === '23514'` and `constraint === 'appointment_interval_ordered'`. Both carry a
positive control under §4.6's rule — the same row with a valid interval, asserted to succeed.

The inverted case had a plausible alternative outcome worth naming: `tstzrange(x, y)` with `y < x`
raises `22000` *"range lower bound must be less than or equal to range upper bound"*, and if the
exclusion index were evaluated before the CHECK, AC-8 would fail with the wrong SQLSTATE. **Measured
as `23514` / `appointment_interval_ordered` in all three variants tried, including one that also
violated a foreign key** (§11.1 M-1). The CHECK wins.

**And that measurement, read correctly, makes AC-8 the case that needs its positive control most —
which is the reverse of how the step-1 draft read it.** The draft recorded CHECK precedence as
reassuring. It is not. Because a `CHECK` fires before every foreign key and before both exclusion
constraints, **a drifted AC-8 fixture that also names an unqualified technician, a foreign bay and a
mismatched vehicle still reports `23514` / `appointment_interval_ordered`.** The reported name masks
every other defect the row carries, so AC-8's assertion is the **least** attributable of the nine. Its
positive control is the only thing that establishes the rest of that row was ever bookable.

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

**What the failure says.** Case 0 fails on **its first assertion, whichever §4.1 lists first** — as
built, `pgmigrations` empty. Every AC case fails on `42P01 relation "dealership" does not exist` from
its own `seedDealership` call, inside its own `it()` body. Observed on the red commit: ten failing
cases in one file, zero hook or collection errors, `typecheck` and `lint:arch` clean.

**This sentence has been wrong twice, and the correction is structural rather than another
restatement.** The step-1 draft predicted `to_regclass('appointment')` null; case 0 asserted the
extension first, so the red came from `btree_gist`. Step 3 then moved the migration-names assertion to
the front, and the red came from `pgmigrations`. Neither prediction was wrong on its own page — each
was wrong because it restated §4.1's ordering four sections away, where the two drift without either
looking incorrect locally. The test-engineer's form of it is the right one:

> **A prediction about which assertion fails first is a claim about assertion ordering, and it belongs
> beside the ordering.**

So this section no longer names the assertion. It names the rule — *case 0's first assertion, whatever
§4.1 lists first* — which is true under every future reordering and cannot drift, because there is now
one statement of the order rather than two. §0.1 records why this class is worth separating from the
others.

**`red-proof` classifies it as `tests/integration/`-only**, which is exactly the case O-1's ruling
added to the red zone on 2026-09-04 and which has never run live (§9).

### 8.2 At the green commit the hazard is real, and this is the mitigation

**Measured (§11.1 M-4):** with a malformed statement in `0003`, the programmatic runner throws,
`0001` and `0002` stay committed, `globalSetup` rejects, and the `db` project produces **no test
results at all**.

Three things follow, in the order they should be tried:

1. **The step-4 loop is `npx vitest run --project db`, run locally before every push.** Not advice —
   the stated loop. 00a §11.5 recorded that *"`docker` and `podman` are both absent"* for both roles,
   and the step-1 draft inherited it as an open assumption. **A-4 is now closed: Docker works in all
   three roles' shells, measured on 2026-09-04, and the `db` project completes in about 3.4 s.** So
   the implementer sees a malformed migration in seconds, with the runner's own error in front of it,
   and the CI round-trip stops being the inner loop. What this falsifies in 00a — and what it does
   **not** — is recorded in arc42 §7.2 (§10.1).
2. **If the loop is skipped and CI aborts in `globalSetup`, the fallback is `npm run db:migrate`
   against the compose stack — not the CI log.** The step-1 draft said the fallback was to read the
   runner's error, *"which names the failing file and prints the failing statement with a caret"*.
   **That is false, and it is I-8.** `tests/setup/postgres.ts:68` passes `log: () => {}`, which
   swallows the `logger.error` carrying both. What actually reaches the CI log is the raw
   `DatabaseError` — a SQLSTATE, a `position`, and `file: 'scan.l'`, which is PostgreSQL's *own*
   lexer source and not a migration — under a headline of `No test files found`. **No migration
   filename appears anywhere.** The architect read the caret-printing code in `db.js` and did not read
   the call site, having quoted that call site earlier in the same session.

   `npm run db:migrate` invokes the **CLI**, whose logger is not silenced, so it prints what
   `globalSetup` swallows. **Measured (M-10), and the precision matters more than the fact:** the
   failing migration is named by the **last `### MIGRATION <name> (UP) ###` header printed**,
   immediately above `Error executing:`. The error line itself — `error: syntax error at or near
   "THIS"` — names nothing, so a reader who greps for `error` finds the message and not the file.
   **Look at the header above the error, not at the error.** The programmatic path was tested the same
   way and carries no filename in any populated field of the thrown `DatabaseError`, which is what
   makes the CLI the fallback rather than a preference.
3. **`globalSetup` must not catch the migration error.** Wrapping the runner in a `try`/`catch` that
   provides an error message to the tests would convert a loud, correct failure into a run where
   every case fails for a laundered reason, and it would put a branch into a test-engineer-owned file
   whose purpose is to have none. 00a rejected substituting an evidence chain for an observation;
   this is the same move. **Rejected — and the implementer, who raised I-8, agrees with the
   rejection.** It asked only that this section say what the failure actually yields.

**Why `log: () => {}` is not changed here**, since I-9 has just demolished the seam-promise argument
for a different file. `tests/setup/postgres.ts` is genuinely test-engineer-owned, editing it genuinely
spends 00a's seam promise on the slice whose failure-attribution depends on nothing else moving, and
with A-4 closed the fallback is now rarely reached at all. That reasoning holds where I-9's did not.
It is recorded as a deferred improvement in §11.3.

### 8.3 What the slice touches, and what it must not

**Adds:** `0001_extensions.sql`, `0002_reference_data.sql`, `0003_appointment.sql` under
`src/persistence/migrations/`; `tests/integration/exclusion-constraints.test.ts`;
`tests/support/seed.ts`; `tests/support/ids.ts`.

**Modifies exactly one existing file:** `tests/integration/postgres-harness.test.ts`.

**Untouched, and this is the seam promise:** `tests/setup/postgres.ts`, `vitest.config.ts`,
`package.json`, `.github/workflows/verify.yml`. If this slice's CI run fails, the failure is
attributable to the migrations and the tests, because the harness, the runner and the pipeline did
not move.

**The step-1 and step-2 drafts of this section said the slice modifies *no* existing file, and that
was wrong — T-7.** `postgres-harness.test.ts:50` asserted `count === '0'` on `pgmigrations` under the
name *"zero migrations applied"*. At the green commit it holds three, so **the slice could not have
reached "all tests green" as specified.** §4.1 cites that file's `server_version` case four lines
above the failing assertion, as the evidence for the bounded-fragility argument, and the architect
read past it.

The miss has a shape worth stating, because no step of the loop currently asks the question:

> **This section enumerated files by *ownership risk*. It never asked which existing *assertions* this
> slice's work falsifies.**
>
> "Do not modify X" protects attribution. "What asserts the fact I am about to change" protects the
> suite from going stale. They are different questions and this section answered only the first.

The remedy is in §4.1: the harness test now asserts the seam **ran** — `pgmigrations` exists and is
reachable, a property true at every commit of every slice — and what the seam **carried** moved into
case 0 (a), where it is a per-slice fact with the right polarity, red before the migrations land and
green after. Landed as `dc3b459`, **unmarked**, so `98ace77` remains this slice's single red commit
under `CLAUDE.md` §7; `red-proof`'s `judge()` was run offline against that subject and returned *not
applicable*, so the polarity was verified rather than asserted.

**Why the alternative was dangerous rather than merely untidy — O-9.** The rejected option was to
leave the stale assertion for the implementer to fix at step 4. `tests/integration/` is **not** in
`guard-paths.mjs`'s `TEST_OWNED` list, and an implementer `Write` there is **ALLOWed** — verified by
the orchestrator. So the hook would not have stopped the implementer editing a test-engineer-owned
assertion in order to green its own commit, which is the precise shape `CLAUDE.md` §5 forbids. **That
is a gap in the hook, not permission.**

It is deferred rather than closed, and the reason is that the obvious fix is wrong: a blanket deny on
`tests/integration/` contradicts §5, which makes the directory *shared*. The enforceable form is 00a
step 7's structural rule — deny an implementer write to an **existing** `tests/integration/` file that
does not import `src/` — and that needs the hook to read file contents, which it does not do today.
Recorded here rather than only in the register because a reader of this section is the one who needs
to know that the boundary protecting it is documentary.

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
from a `depcruise` invocation whose predicted cause turned out to be wrong (F1). Slice 00's red has
**one cause**: the migrations do not exist. Every failing assertion is that absence restated — case 0
as an empty `pgmigrations`, the nine AC cases as `42P01` on their own `seedDealership` line. **There is
no second explanation available.**

**The step-1 and step-2 wording was *"the red comes from one file"*, and that conflated the incidental
with the evidential.** As it happens the count is **still one** — `dc3b459` took the structural form,
so `postgres-harness.test.ts` asserts only that the seam ran and is green at the red commit and after.
But it would have been **two** under the literal remedy the test-engineer first offered, and the
evidential claim would have been untouched, because two files naming one absence is *one explanation
stated twice*. That the file count survived is luck about which remedy was chosen, not evidence.

This is why T-7 cost less than it was priced at. The test-engineer offered to spend this claim and
called it the architect's to spend; it was not spent, because the claim that matters was never about
files. **A claim that stays true for a reason other than the one that made it true is worth exactly as
much attention as one that goes false** — and it is only visible here because a remedy nearly falsified
it.

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

**The human widened the slice's `arc42:` field to §8.1 · §8.2 · §7.2 · §11 on 2026-09-04**, on the
reasoning that arc42 currently contradicts an immutable ADR with nothing recording it (I-9), and that
leaving the source of truth knowingly wrong across a human gate is worse than a widened scope. R-11 is
an open finding against editing *outside* a declared scope; all four sections below are inside it.

| Section | Correction |
|---|---|
| **§8.1** | An as-built note recording that the schema applies verbatim on `postgres:16` (dated, with what was run); **§6.2's transitive-reference table**, so the three columns without a singleton FK read as complete rather than missing; **§6.3 — three of the four composite keys are unreachable from the API surface**, which is why they can only be tested here; `appointment.id` having no default and `btree_gist` therefore remaining the only extension; `updated_at` maintained by the writer with no trigger, and the obligation that puts on ADR-0003's `UPDATE` |
| **§8.2** | The **measured constraint-evaluation order** — CHECK, then index-based, then FK triggers — and its consequence for any test asserting a specific SQLSTATE; the normalised `pg_get_constraintdef` text a catalogue assertion must match; consequences 5 and 6 confirmed with the measured `btree_gist` version and the two partial GiST index definitions; **and a refinement of consequence 1**: adjacency discriminates `[)` from `[]` and provably cannot discriminate `[)` from `(]`, so the half-open claim is stated at the strength the evidence supports |

### 10.2 §7.2 and §11 — I-9, and a defect in the architect's own 00a reconciliation

The step-1 draft asked for *"one sentence recording the measured `singleTransaction` divergence"* and
framed it as two entry points with different natural defaults whose remedy would cost an edit to a
test-engineer-owned file. **Both halves of that were wrong, and the correction is larger than the
finding as raised.**

**ADR-0007's Decision says the runner is invoked programmatically *"both by `npm run db:migrate`
against the local compose stack and by the Testcontainers fixture"*. `package.json:18` is the CLI
binary.** That is not a divergence between two legitimate entry points; it is **conformance drift from
an accepted, immutable ADR**. The remedy therefore sits entirely on the non-test-owned side —
`package.json` and wherever a programmatic runner would live — so the seam-promise argument for
deferring it never applied.

**And the part the finding did not reach.** arc42 §7.2 *already records the drift*, at 00a step 7, and
frames it as arc42 having overstated its own phase-2 wording. But ADR-0007 makes the same claim, and
ADRs are immutable. So **the architect's own as-built pass narrowed, in arc42, a claim an accepted ADR
still asserts** — leaving the *"single source of truth for architecture"* (`CLAUDE.md` §4) quietly
contradicting an immutable decision, with nothing recording that it had. That is a defect in the
reconciliation, not a documentation nit, and it is the reason the human widened the scope rather than
letting it wait for slice 01.

| Section | Correction |
|---|---|
| **§7.2** | **Name ADR-0007.** The existing as-built paragraph states the fact and calls it arc42 overstating; it must say that the CLI entry point *contradicts ADR-0007's Decision*, that the ADR is immutable, and that arc42 narrowing it unilaterally was the wrong repair. Plus the measured partial-failure consequence (CLI all-or-nothing, programmatic per-migration). **And A-4's closure**: Docker works in all three shells, falsifying 00a §11.5's *"no container runtime on either role's machine"*. The two-project split stays correct on its own merits — a database-less subset is worth having regardless — but **its stated justification does not**, and the operative meaning of *"every implementer commit is green"* recovers its plain sense for this slice |
| **§11** | Two coupled debt items under one heading, since the coupling is the point: **(1)** the ADR-0007 conformance drift, named as such, with the recommendation below; **(2)** `tsc` emits only `.ts`, so `dist/persistence/` holds no migrations and the built artifact cannot migrate itself. Inert today — both migration paths read `src/persistence/migrations/` from disk and `dist/main.js` never migrates — and it becomes real the day a Dockerfile exists. **A conforming programmatic `db:migrate` must resolve a directory the build actually populates, or the fix for (1) ships broken in the built artifact.** Also `updated_at` having no trigger and therefore an obligation on every future `UPDATE` |

**The deferral is held, on the corrected ground, and the eventual close is stated so it is not
re-argued.** There is no cheap fully-conforming fix: passing `singleTransaction: true` in
`globalSetup` makes the *behaviour* agree while leaving the ADR's wording violated and edits a
test-owned file; making `db:migrate` programmatic means a runner module, a location decision and an
ownership question — real work in a slice whose job is the invariant. Meanwhile the drift is invisible
on every successful migration and loud on every failed one (M-4, M-5), so nothing is at risk while it
stands.

**Recommendation: conform `db:migrate`. Do not supersede ADR-0007.** Superseding an accepted decision
to legitimise a drift that was never argued for is the worse precedent, and the ADR's underlying
requirement 3 — in-process, no shelling out to a binary that may not be on the path — is the right
requirement.

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
| **M-10** | Where the failing migration's **name** appears, on both entry points (closes A-6) | **CLI:** prints `### MIGRATION 0003_appointment (UP) ###` immediately before `Error executing:`; the error line itself (`error: syntax error at or near "THIS"`) names nothing. **Programmatic with `log: () => {}`, i.e. `globalSetup`:** the thrown `DatabaseError` carries `code: 42601`, `position`, `file: 'scan.l'`, `line`, `routine` — and **no migration filename in any field**, confirmed by testing every populated key |
| **M-11** | `pg_constraint` contents for `appointment` across majors (closes A-7, **falsifying it**) | **16.15 and 17.11:** the named constraints plus `appointment_pkey`, nothing else — `contype <> 'p'` is a clean filter. **18.6: six additional `contype = 'n'` rows** — `appointment_id_not_null`, `appointment_dealership_id_not_null`, `appointment_bay_id_not_null`, `appointment_starts_at_not_null`, `appointment_ends_at_not_null`, `appointment_status_not_null`. `pg_get_constraintdef` text is byte-identical across 16 and 17 for all three constraint types tested |

M-4 is the one that nearly became a wrong sentence: the architect's first probe reported a
`CREATE TYPE … already exists` failure that looked like a `node-pg-migrate` defect and was in fact a
bug in the probe's own fixture-splitting `sed`. Recorded because it is the mechanism of rule 2 working
on the person who wrote the rule.

### 11.1a Observed at step 3, correcting this design

| # | This design said | What was observed |
|---|---|---|
| **O-a** | Case 0 fails first on `to_regclass('appointment')` null (step-1 draft) | It failed first on **`btree_gist` absent**, because §4.1 asserted the extension before the relations. Contradicted §4.1 on its own page |
| **O-b** | Case 0 fails first on `btree_gist` absent (step-2 draft) | It fails first on **`pgmigrations` empty**, because step 3 moved the migration-names assertion to the front. Same drift, one step later |
| **O-c** | *"The red comes from one file"* | Still one file, but for a different reason than when written — `dc3b459` chose the structural remedy; the literal one would have made it two without touching the evidential claim (§9) |
| **O-d** | *"Slice 00 modifies no existing file"* | It modifies `tests/integration/postgres-harness.test.ts`. T-7, and §8.3 carries the corrected list and the reason the enumeration was the wrong one |

O-a and O-b are one defect, not two, and §0.1 records it as tier 2 rather than as two rows here. The
observation that matters for the retro is that **both were catchable by reading this document against
itself**, and neither was caught that way.

### 11.2 Assumed, not measured

> **An id collision this document created, disambiguated rather than renamed.** `A-1`…`A-7` below are
> *this design's* open assumptions. arc42 §1.4 also has `A-1`…`A-10`, which are the **Gate A domain
> assumptions** (A-4 no buffer, A-6 nothing created implicitly, A-9 resources never span dealerships),
> and both sets appear in this document — §1.1 and §3 cite arc42's, §4 and §8 cite these. They are
> told apart by context and by the `§11.2` prefix, which every cross-reference to this table carries.
>
> They are **not** renamed, and the reason is the same one that makes ADRs immutable: `docs/team-log/`
> is append-only and already cites `§11.2 A-2` and `A-4` by number, as do two commit messages. A rename
> would make the record wrong to make this table tidier, which is the wrong trade. A future slice
> should pick a non-colliding prefix from the start.

| # | Assumption | Why it is not measured, and what depends on it |
|---|---|---|
| **A-1** | How Vitest's JSON reporter represents a `beforeAll` failure — whether it produces a `testResults[]` entry `red-proof` can classify | Not measured, and **the design does not depend on it**: §4 forbids schema work in `beforeAll` precisely so the question never arises. If it arises anyway, measure it before reasoning about it |
| **A-2** | Which exclusion constraint is reported when both are violable | Observed once as `no_bay_overlap` (M-2). That is index order and PostgreSQL does not document a guarantee, so §4.2 requires each case to make exactly one constraint violable rather than relying on the observation. **T-4 turned this from a caveat into a load-bearing fact**: it is why AC-2 could not be relied on to catch a wrongly-keyed constraint, and therefore why case 0 asserts by equality |
| **A-3** | That two seeds with a literal VIN would collide on `vehicle.vin`'s `UNIQUE` | Deduced from the schema, not observed. §3.4's derived VIN makes it moot |
| **A-4** | ~~Whether the implementer's and the test-engineer's shells can reach a Docker daemon~~ | **CLOSED at step 2, 2026-09-04.** Docker works in all three roles' shells; the `db` project runs in about 3.4 s. This falsifies 00a §11.5's *"no container runtime on either role's machine"*. §8.2's mitigation 1 is promoted to the stated step-4 loop and arc42 §7.2 records what it does and does not falsify in 00a. Struck rather than deleted: a closed assumption that vanishes leaves no evidence it was ever open |
| **A-5** | That the planner *chooses* the partial GiST indexes for the availability query (§8.2 consequence 6) | Index definitions are measured; plan selection is not, and belongs to QS-14, not here |
| **A-6** | ~~That `npm run db:migrate` names the failing **migration file**~~ | **CLOSED by measurement, 2026-09-04 — see M-10.** It does, but not where a reader would look: the filename is the **last `### MIGRATION <name> (UP) ###` header printed**, immediately above `Error executing:`. The error line itself names nothing. §8.2's mitigation 2 is validated and now says where to look |
| **A-7** | ~~That a later PostgreSQL major does not surface `NOT NULL` as `pg_constraint` rows~~ | **CLOSED by measurement, and the assumption was WRONG — see M-11.** Clean on 16 and 17; **PostgreSQL 18 surfaces six `contype = 'n'` rows on `appointment` alone**, so case 0 (d)'s `contype <> 'p'` filter would fail on a bump. §4.1 carries the remedy. Struck rather than deleted: this is the only assumption in this design that a measurement falsified rather than confirmed |

### 11.3 Deferred, with the reason

| Item | Why not now |
|---|---|
| **Conforming `npm run db:migrate` to ADR-0007** — the runner invoked programmatically on both paths | **This is the correct framing, and the step-1 draft's was wrong (I-9).** It is not a `singleTransaction` flag on a test-owned file; it is conformance drift from an immutable ADR whose remedy is entirely on the non-test-owned side. Deferred because there is no cheap fully-conforming fix and the drift is invisible on success and loud on failure — not because of the seam promise, which never applied. Recorded in arc42 §11 naming ADR-0007, with the recommendation to conform rather than supersede (§10.2) |
| **Replacing `log: () => {}` in `tests/setup/postgres.ts`**, so a malformed migration names its file | Here the seam-promise argument *does* hold: the file is genuinely test-engineer-owned and this is the slice whose failure-attribution depends on nothing else moving. With A-4 closed the fallback is rarely reached, and `npm run db:migrate` covers it (§8.2 mitigation 2). The implementer raised I-8 and did not ask for this fix |
| **`dist/persistence/` holds no migrations**, because `tsc` emits only `.ts` | Inert today — both migration paths read `src/persistence/migrations/` from disk and `dist/main.js` never migrates. Recorded in arc42 §11 **coupled to the ADR-0007 item**, because a conforming programmatic `db:migrate` must resolve a directory the build actually populates or it ships broken |
| **`guard-paths.mjs` does not enforce §5's shared-`tests/integration/` boundary** (O-9) | An implementer `Write` under `tests/integration/` is ALLOWed, verified. Not closed here because the obvious fix is wrong: a blanket deny contradicts §5, which makes the directory shared. The enforceable form is 00a step 7's structural rule — deny a write to an **existing** `tests/integration/` file that does not import `src/` — which needs the hook to read file contents. §8.3 carries it where a reader will meet it |

### A standing check this slice should have had

**A slice that changes a fact must find the tests that assert the old one.** T-7 existed because §8.3
enumerated files by ownership risk and stopped there. The two questions are different and only one of
them was asked:

| Question | Protects | Asked at step 1? |
|---|---|---|
| *Which files must this slice not modify?* | attribution of a failure | yes |
| *Which existing assertions does this slice's work falsify?* | the suite not going stale | **no** |

The second costs one `grep` for the fact being changed — here, for `pgmigrations` — and it would have
found `postgres-harness.test.ts:50` at step 1 rather than at step 3, before the red was pushed and
before a second commit was needed. It belongs in every future slice's design, and it is cheap enough
that there is no argument for leaving it out.
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
   latter is incompatible with the isolate-by-data suite arc42 §7.2 requires, and with the
   attributability §3.2 depends on.
3. **AC-9's "every reference table"** is read as all eight non-`appointment` relations, including
   `opening_hours`, which §8.1 describes as existing "because of a Gate A ruling" rather than as
   plain reference data. Seeding it costs nothing and ADR-0001 needs it from slice 01.
4. **AC-4 says "its status is set to `cancelled`"** without saying by what. Read as a direct `UPDATE`
   in the test: there is no application code in this slice, by the slice's own *Out of scope*.
