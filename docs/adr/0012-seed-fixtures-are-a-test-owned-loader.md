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

AC-9 requires seed fixtures that load into an empty database and that the suite can book against
deterministically. §1.4's **A-7** says reference data *"arrives via migrations and fixtures"* and
never defines the second word; **ADR-0007** governs migrations and is silent on seeds. Four forces
are in play, and no option satisfies all four:

1. **§2.2 and arc42 §7.2 isolate by data, never by truncation.** Truncating would serialise the
   suite and make slice 07's concurrency tests race the cleanup, not each other.
2. **§5 makes independence a *read* restriction.** `guard-paths.mjs` denies the test-engineer every
   read under `src/`; `outside-in-tests-do-not-import-src` denies `tests/support/` the import edge.
3. **There are two consumers.** The suite needs many disjoint throwaway subtrees; a cURL harness
   (TC-5) eventually needs one fixed dataset with stable ids.
4. **ADR-0007 makes migrations immutable after merge.**

## Considered options

- **Option A — a fourth migration, `0004_seed.sql`.**
  - Bad, because it gives the whole suite **one** dealership. Isolation by data collapses, the
    suite serialises.
  - Bad, because it puts test fixtures into a corpus ADR-0007 makes immutable
  - Bad, because it puts fixtures into the schema that runs in the local compose stack
- **Option B — a loader module under `src/persistence/seed/`**, exported and called by the test
  harness and by `npm run db:seed`.
  - Bad, because `outside-in-tests-do-not-import-src` forbids `tests/support/` from importing it
  - Bad, because the fixtures the acceptance suite books against would then be authored
    by the implementer — the role whose work they exist to check.
- **Option C — a checked-in `.sql` fixture under `src/`, executed by path**
  from the test. Good, because a path argument is not an import edge.
  - Bad, because the test-engineer would be executing a file it is *forbidden to read.*
  - Bad, because a single file still means a single dealership
- **Option D — a loader in `tests/support/seed.ts`, owned by the test-engineer**, issuing raw SQL
  through `pg`, one dealership subtree per call with derived ids. **Chosen.**
  - Good, because it satisfies both the isolation model and the read boundary
  - Good, because it is an independent transcription of §8.1 and therefore detects column-level
    divergence for free.
  - Bad, because it duplicates knowledge of the reference schema
  - Bad, because it leaves the demo with no dataset
- **Option E — Option D for the suite**, plus a separate `src/persistence/seed/` dataset and
  `npm run db:seed` for the demo, built now.
  - Bad, because it is not in slice 00's *In scope*
  - Bad, because a demo dataset built before any endpoint is a guess

## Decision

Chosen option: **Option D, with Option E's second half deferred** — the suite's fixtures are a
test-engineer-owned loader in `tests/support/`, and the demo dataset is a later artifact.

- **`tests/support/seed.ts` exposes `seedDealership(client, namespace)`**, which inserts one
  complete dealership subtree and **returns every id it created** — a fixture found by
  `select … limit 1` is one shared by accident.
- **Ids are derived, not random and not literal.**
  `uuidFor(namespace, name)` hashes the pair, so ids are disjoint across cases *and* a pure function
  of the case's name; `vehicle.vin` likewise, for its global `UNIQUE`.
  - **The reason is diagnostic, not cosmetic, and it is the test-engineer's**
    rather than the architect's, who proposed derived ids on legibility grounds and pre-conceded
    `randomUUID()`. The test-engineer declined that concession on a ground the proposal had not
    stated — *with no cleanup, the UUID is the only handle on which subtree a failing row belongs
    to.*
  - **The fallback is withdrawn.**
    Recorded because the refusal improved the decision, which is what §6 point 3 exists for.
- **No `ON CONFLICT DO NOTHING`.** Two cases sharing a namespace must fail loudly on the primary key
  rather than silently sharing a subtree.
- **The demo dataset is not built.**
  When it lands it is the implementer's, a different artifact with a different consumer.

A, B and C all put the fixtures the suite books against beyond a boundary the test-engineer may not
read across. D also buys, free, **an independent transcription of §8.1**: its `INSERT`s name every
column of every reference table, so a renamed or dropped column in `0002_reference_data.sql` fails
loudly with `42703`. Scoped honestly — **column-level** divergence on the eight tables it writes,
nothing about constraints, nothing about an
*extra* column.

## Consequences

**Good**

- Every case owns a disjoint subtree
  and every row is attributable to the case that wrote it. **Vitest parallelises files, not cases**:
  disjointness across files, attributability within one.
- The fixtures that define *done* are authored by the role that defines *done*
- A second, independent statement of the reference schema exists
- Every id in a failure message is a pure function of the case's name
  — with no cleanup, the only way to trace a failing row to its case.
- No extension is needed for id generation
  beyond `btree_gist`: ids come from the application side.

**Bad, or deferred**

- **Isolation is genuinely partial.** `service_type`, `customer` and `vehicle` carry no
  `dealership_id`, so those rows land side by side. The only collidable constraint is `vehicle.vin`,
  handled by deriving it — a limit on the rule, not an application of it.
- **Rows accumulate for the life of a run** and are never cleaned up. Acceptable at one container
  per run; not at a shared database.
- **There is no demo dataset**, so nothing yet supports a cURL example with a stable id in its URL.
  arc42 §11 carries it.
- **Two seed artifacts will eventually exist** with overlapping shape and different owners, and
  nothing will hold them in agreement.
- The loader duplicates knowledge of the reference schema.
  That duplication *is* the property above, so it must not be "fixed" by importing `src/`.
