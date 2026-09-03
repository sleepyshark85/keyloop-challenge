---
id: "0007"
title: Run migrations with node-pg-migrate, written as plain .sql files
status: proposed
date: 2026-09-04
supersedes: null
superseded_by: null
arc42: ["§4.2", "§5.2", "§7", "§8.2"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  Proposed by the architect at Gate B; awaiting the human's decision. The architect
  initially separated "SQL-first migrations" from "a maintained runner" as competing
  goals and was heading for a hand-rolled runner; the resolution — node-pg-migrate
  executes `.sql` files natively — removes the conflict, and the ADR is written
  around that rather than around a trade-off that turned out not to exist.
---

## Context and problem statement

The migration tool's job in this system is unusually specific. The most important artifact in the
repository is eight lines of DDL:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE appointment ADD CONSTRAINT no_bay_overlap
  EXCLUDE USING gist (bay_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelled');
```

An assessor reading this repository under time pressure (§1.3) should be able to find that text and
read it as written, without reconstructing it from a DSL. Four requirements follow:

1. **The SQL must be verbatim and first-class**, not a string argument inside a JavaScript builder
   call and not generated from a TypeScript model.
2. **The tool must be independent of the query layer.** ADR-0006 chose Kysely explicitly *without*
   its migrator, so that replacing one does not force replacing the other. `prisma migrate` and
   `drizzle-kit` are unavailable for the same reason their query layers were rejected.
3. **It must run in-process against a Testcontainers-provisioned database** (§2.2), from a Node test
   run, with no shelling out to a binary that may not be on the path.
4. **It must not be hand-rolled.** A migration runner is a small program with a large blast radius —
   ordering, advisory locking, partial application, and a state table that must never be wrong.
   Writing one would be infrastructure that a reviewer must read carefully and learns nothing from.

## Considered options

- **Option A — `node-pg-migrate`, with migrations authored as plain `.sql` files.**
- **Option B — `node-pg-migrate`, with migrations authored in its JavaScript DSL** (`pgm.createTable`,
  `pgm.sql`).
- **Option C — a hand-rolled runner**: numbered `.sql` files and a `schema_migrations` table, applied
  by a ~60-line script in `tools/`.
- **Option D — `dbmate`**: up/down in one `.sql` file, applied by a single Go binary.
- **Option E — `Umzug`** with a PostgreSQL storage adapter and raw-SQL migration bodies.
- **Option F — the query layer's own migrator** (`kysely` migrator, `drizzle-kit`, `prisma migrate`).

## Decision

Chosen option: **Option A — `node-pg-migrate` executing plain `.sql` migration files.**

`node-pg-migrate` runs `.sql` files natively, splitting them on its `-- Up Migration` /
`-- Down Migration` markers, which dissolves the apparent conflict between requirements 1 and 4: the
SQL is the artifact, and the runner is somebody else's maintained code.

- Migrations live in **`src/persistence/migrations/`** as `NNNN_description.sql`, applied in
  filename order, tracked in a `pgmigrations` table.
- **Every migration is plain SQL.** The DSL is not used, including for tables that could trivially be
  expressed in it — a mixed corpus where some schema is SQL and some is JavaScript is worse than
  either, because a reader must check both to know what the schema is.
- The runner is invoked **programmatically** (`node-pg-migrate`'s Node API) both by
  `npm run db:migrate` against the local compose stack and by the Testcontainers fixture, so the
  schema under test is byte-identical to the schema that runs (§2.2, §8.5).
- **Down migrations are written but are not part of any recovery story.** They exist so a migration is
  reviewable as a reversible change; the deployment model (§7) is a fresh local container, so rollback
  in anger is out of scope.
- Migrations are **never edited after merge**, on the same reasoning that makes ADRs immutable: a
  migration that has run somewhere is a fact, and correcting it means a new migration.

## Consequences

**Good**

- The exclusion-constraint DDL of `CLAUDE.md` §2.1 appears in this repository exactly as written
  there, in a file whose only content is SQL. Nothing paraphrases the invariant.
- The migration corpus is legible to anyone who reads SQL, with no knowledge of this project's
  toolchain — including the future reader who has to change the constraint for A-4.
- Independent of ADR-0006: swapping Kysely for something else touches no migration.
- Applying migrations from the test fixture is a function call, so there is no "did you remember to
  migrate" failure mode in the test suite.

**Bad, or deferred**

- `.sql` files carry no types, so nothing links a migration to the `Database` interface ADR-0006
  keeps. That gap is the same one ADR-0006 records, and the mitigation is the same: regenerate the
  interface from a migrated database in CI and fail on a diff.
- `node-pg-migrate` is chosen partly for a feature (`.sql` file support) that is not its headline
  use, so most documentation and examples show the DSL this decision forbids. A reader coming from
  the docs will find the repository does the unusual thing.
- No schema-diffing and no drift detection: nothing notices if someone changes a database by hand.
  Acceptable at a single local container; noted in §11.
- Down migrations are written and never exercised, so they are unverified by construction. Stated
  rather than pretended otherwise.

## Pros and cons of the options

### Option A — `node-pg-migrate` with `.sql` files

- Good, because the SQL is the artifact and the runner is maintained by someone else — requirements 1
  and 4 both met, which no other option manages without a compromise.
- Good, because it is a plain npm dependency with a Node API, so the Testcontainers fixture calls it
  directly (requirement 3).
- Good, because it has no opinion about the query layer (requirement 2).
- Bad, because it is the tool's less-travelled path, so examples and answers found online will show
  the DSL instead.

### Option B — `node-pg-migrate` with its JavaScript DSL

- Good, because the DSL is type-checked, composable, and generates the down migration for most
  operations automatically.
- Bad, because the objects that matter — the extension, two exclusion constraints with a partial
  predicate, composite foreign keys — have no DSL representation and would be `pgm.sql('...')`
  strings anyway. The result is the same SQL, one indirection further from the reader, with the rest
  of the schema in a different language.
- Bad, because it makes the schema's source of truth a JavaScript program, which is precisely the
  criticism levelled at `drizzle-kit` in ADR-0006. Rejecting it there and accepting it here would be
  inconsistent.

### Option C — a hand-rolled runner

- Good, because it is completely transparent and adds no dependency.
- Good, because `tools/` already contains bespoke scripts, so it would not be out of place.
- Bad, because the correctness properties a migration runner needs — a transactional state table, an
  advisory lock so two processes cannot race, deterministic ordering, refusing to run when a file's
  checksum changed — are easy to get subtly wrong and impossible to notice until they matter.
- Bad, because it is exactly the kind of infrastructure that consumes human review attention (OC-3)
  while demonstrating nothing the assessment grades.

### Option D — `dbmate`

- Good, because it is the most SQL-first option of all: one file, up and down, nothing else.
- Good, because it is genuinely excellent at this job.
- Bad, because it is a Go binary, so the test fixture must shell out to a tool that must be installed
  separately. TC-9 already makes Docker a prerequisite and names it as the likeliest reason a
  reader's first `npm test` fails; adding a second such prerequisite for an ergonomic gain is a poor
  trade.
- Bad, because it cannot be invoked programmatically from the Testcontainers fixture without process
  management, which is failure surface in the test harness rather than in the system.

### Option E — `Umzug` with raw SQL

- Good, because it is a well-tested, storage-agnostic migration framework with a clean Node API.
- Bad, because it is a framework rather than a tool: the PostgreSQL storage, the file resolver and
  the SQL execution are all assembled by hand, which is Option C with a library underneath and most
  of Option C's review cost.
- Bad, because its centre of gravity is Sequelize, so PostgreSQL-specific usage is off the beaten
  path here too, without Option A's compensating simplicity.

### Option F — the query layer's own migrator

- Good, because it is one fewer dependency and one fewer concept, and the schema types would follow
  the migrations automatically.
- Bad, because it couples two decisions that ADR-0006 deliberately separated, so a future change of
  query layer becomes a rewrite of the schema history.
- Bad, in the `drizzle-kit` and `prisma migrate` cases, for the reason ADR-0006 rejected them: the
  generated migration cannot express the exclusion constraint, so the generator would be confidently
  incomplete.
- Bad, in the Kysely case, because Kysely's migrations are TypeScript modules — Option B's objection,
  with the query layer's coupling added on top.
