---
id: "0012"
title: Seed reference data from a test-engineer-owned loader, per case, and defer the demo dataset
status: proposed
date: 2026-09-04
supersedes: null
superseded_by: null
arc42: ["§7.2", "§8.1", "§8.5"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  Raised by the architect at step 1 of slice 00, on finding that §1.4's A-7 promises reference data
  "via migrations and fixtures" and that nothing in ADR-0001..0011 says what a fixture is or who owns
  one. Recommended as written below. AWAITING the human's ruling at slice 00's gate. The half that
  needs a human is the second one: deferring the demo dataset is a decision about what the submission
  demonstrates, which OC-4 puts outside the architect's authority. If the demo dataset is wanted now,
  the cost is one more artifact in this slice and the first half of the decision is unaffected.
---

## Context and problem statement

Slice 00 creates the schema. AC-9 requires seed fixtures that load into an empty database and that
the suite can book against deterministically. §1.4's **A-7** says reference data *"arrives via
migrations and fixtures"* and never defines the second word; **ADR-0007** governs migrations and is
silent on seeds. So the mechanism, the owner and the lifetime of a fixture are all undecided at the
moment the first one has to exist.

Four forces are in play, and no option satisfies all four:

1. **`CLAUDE.md` §2.2 and arc42 §7.2 isolate by data, never by truncation.** Each test seeds its own
   dealership and works only inside it, so the suite parallelises and every test is implicitly
   asserting A-9's scoping. Truncating between tests would serialise the suite and make the slice-07
   concurrency tests race the cleanup rather than each other.
2. **`CLAUDE.md` §5 makes independence a *read* restriction.** `.claude/hooks/guard-paths.mjs` denies
   the test-engineer every read under `src/`, and `outside-in-tests-do-not-import-src` denies
   `tests/support/` the import edge. The role that writes the assertions cannot see the
   implementation — including the migrations.
3. **There are two consumers, not one.** The suite needs many disjoint, throwaway subtrees. A cURL
   demo harness (TC-5) eventually needs one fixed dataset with stable ids a `curl` example can name
   in its URL.
4. **ADR-0007 makes migrations immutable after merge.** Anything put into the migration corpus is
   permanent by construction.

## Considered options

- **Option A — a fourth migration, `0004_seed.sql`.** Reference rows arrive with the schema, applied
  by the same runner in the same call.
- **Option B — a loader module under `src/persistence/seed/`**, exported and called by the test
  harness and by an `npm run db:seed` script.
- **Option C — a checked-in `.sql` fixture under `src/`, executed by path** from the test, the way
  `tests/architecture/layering.test.ts` passes `.dependency-cruiser.js` to a subprocess by path.
- **Option D — a loader in `tests/support/seed.ts`, owned by the test-engineer**, issuing raw SQL
  through `pg` over the injected connection string, creating one complete dealership subtree per
  call with derived ids, and returning them.
- **Option E — Option D for the suite, plus a separate `src/persistence/seed/` dataset and
  `npm run db:seed` for the demo, built now.**

## Decision

Chosen option: **Option D, with Option E's second half deferred** — the suite's fixtures are a
test-engineer-owned loader in `tests/support/`, and the demo dataset is a separate later artifact
that this slice does not build.

Specifically:

- **`tests/support/seed.ts` exposes `seedDealership(client, namespace)`**, which inserts one
  dealership, its seven opening-hours rows, two service types, two bays, two technicians, three
  qualifications, two customers and two vehicles, and **returns every id it created**. No test
  discovers a fixture by query; a fixture found by `select … limit 1` is a fixture shared by
  accident.
- **Ids are derived, not random and not literal.** `uuidFor(namespace, name)` hashes the pair, so
  ids are disjoint across cases *and* stable across runs — a failure message names the same UUID
  every time. `vehicle.vin` carries a global `UNIQUE`, so the VIN is derived the same way.
- **No `ON CONFLICT DO NOTHING`.** Two cases sharing a namespace must fail loudly on the primary key
  rather than silently sharing a subtree.
- **The demo dataset is not built.** When it lands it is the implementer's, under
  `src/persistence/seed/`, with its own npm script, and it is a *different* artifact with a different
  consumer — not the suite's fixtures pressed into service.

The reason Option D beats the others is force 2 crossed with force 1. Options A, B and C all put the
fixtures the suite books against on the far side of a boundary the test-engineer may not read across,
and A additionally gives the whole suite one shared dealership, which removes the isolation model
arc42 §7.2 depends on.

Option D also buys a property none of the others has, and it is free: **the loader is an independent
transcription of §8.1.** Written from arc42 by a role that cannot read the migrations, its `INSERT`s
name every column of every reference table, so a renamed or dropped column in
`0002_reference_data.sql` fails loudly with `42703`. Scoped honestly: it detects **column-level**
divergence on the eight tables it writes. It detects nothing about constraints, and nothing about an
*extra* column.

## Consequences

**Good**

- The suite parallelises, because every case owns a disjoint subtree; arc42 §7.2's isolate-by-data
  rule stops being stated-and-unexercised and starts being exercised.
- The fixtures that define *done* are authored by the role that defines *done*, from the
  specification rather than from the implementation — which is `CLAUDE.md` §5's whole argument,
  applied to data rather than to assertions.
- A second, independent statement of the reference schema exists, and it fails loudly on divergence.
- Every id in a failure message is reproducible, so a failing case is re-runnable rather than a
  screenshot.
- No extension is needed for id generation: ids come from the application side, so `btree_gist`
  remains the only extension the deployment requires.

**Bad, or deferred**

- **Isolation is genuinely partial.** `service_type`, `customer` and `vehicle` carry no
  `dealership_id`, so parallel cases share those three tables. Safe today — the only collidable
  constraint is `vehicle.vin`, handled by deriving it — but it is a limit on the rule, not an
  application of it.
- **Rows accumulate for the life of a run** and are never cleaned up. Acceptable at one container per
  run; it would not be at a shared database.
- **There is no demo dataset**, so nothing yet supports a cURL example with a stable id in its URL.
  That is a real gap in the demo story and it is deferred rather than solved. It belongs in arc42
  §11 until the artifact exists.
- **Two seed artifacts will eventually exist** with overlapping shape and different owners, and
  nothing will hold them in agreement. The mitigation, when the second one lands, is that only the
  first one is ever asserted against.
- The loader duplicates knowledge of the reference schema. That duplication is the independence
  property above, which means it must not be "fixed" by importing anything from `src/`.

## Pros and cons of the options

### Option A — a fourth migration, `0004_seed.sql`

- Good, because the suite needs no seeding code at all: the container arrives populated.
- Good, because it is trivially "loadable into an empty database", which is AC-9's literal wording.
- Bad, because it gives the whole suite **one** dealership. Isolation by data collapses, the suite
  serialises, and the concurrency tests of slice 07 contend on a shared fixture rather than on the
  interval under test.
- Bad, because it puts test fixtures into a corpus ADR-0007 makes immutable after merge, so a fixture
  that turns out to be wrong can only be corrected by a further migration.
- Bad, because it puts fixtures into the schema that runs in the local compose stack, which is a
  production-shaped environment carrying test rows.

### Option B — a loader module under `src/persistence/seed/`

- Good, because one artifact serves both the suite and the demo, and it is typed against the
  `Database` interface ADR-0006 keeps.
- Good, because it is where a reader would look for it.
- Bad, because `outside-in-tests-do-not-import-src` forbids `tests/support/` from importing it, and
  the rule exists specifically to stop a helper laundering `src/` into a test that may not see it.
- Bad, because the fixtures the acceptance suite books against would then be authored and owned by
  the implementer — the role whose work those fixtures exist to check.

### Option C — a `.sql` fixture under `src/`, executed by path

- Good, because it evades the import rule legitimately: `tests/architecture/layering.test.ts` already
  passes `.dependency-cruiser.js` to a subprocess by path, and a path argument is not an import edge.
- Good, because the fixture stays plain SQL, consistent with ADR-0007's argument for the migrations.
- Bad, because the test-engineer would be executing a file it is *forbidden to read*. Independence is
  a read restriction as much as a write one, and a role asserting against data it cannot inspect is
  worse than one asserting against data it wrote.
- Bad, because a single file still means a single dealership, so Option A's isolation objection
  applies unchanged.

### Option D — a loader in `tests/support/seed.ts`

- Good, because it satisfies both the isolation model and the read boundary, which no other option
  does at the same time.
- Good, because it is an independent transcription of §8.1 and therefore detects column-level
  divergence for free.
- Bad, because it duplicates knowledge of the reference schema in a second place — mitigated only by
  the fact that the duplication *is* the property being bought.
- Bad, because it leaves the demo with no dataset, which Option E fixes at a cost.

### Option E — Option D plus the demo dataset, both now

- Good, because the demo story is complete from the first slice, and a reader can `curl` against the
  compose stack the day the schema exists.
- Good, because it forces the demo's stable ids to be decided while the schema is fresh.
- Bad, because it is not in slice 00's *In scope*, and building it means fixing the demo narrative —
  which dealership, which service types, which customer names — six slices before the endpoints that
  would demonstrate it exist.
- Bad, because a demo dataset built before any endpoint is a guess about what the demo will need,
  and the cheapest time to write it is when the demo is written.
