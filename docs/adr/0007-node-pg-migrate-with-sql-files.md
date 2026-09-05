---
id: "0007"
title: Run migrations with node-pg-migrate, written as plain .sql files
status: accepted
date: 2026-09-04
supersedes: null
superseded_by: null
arc42: ["§4.2", "§5.2", "§7", "§8.2"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  ACCEPTED as recommended at Gate B on 2026-09-04, unmodified.
  Proposed by the architect at Gate B. The architect
  initially separated "SQL-first migrations" from "a maintained runner" as competing
  goals and was heading for a hand-rolled runner; the resolution — node-pg-migrate
  executes `.sql` files natively — removes the conflict, and the ADR is written
  around that rather than around a trade-off that turned out not to exist.
---

## Context and problem statement

The most important artifact here is eight lines of DDL:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE appointment ADD CONSTRAINT no_bay_overlap
  EXCLUDE USING gist (bay_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelled');
```

An assessor under time pressure (§1.3) must read that as written, not reconstruct it.
Four requirements follow:

1. **The SQL must be verbatim and first-class** — not a string in a builder call, not generated
   from a model.
2. **The tool must be independent of the query layer.** ADR-0006 chose Kysely *without* its
   migrator; `prisma migrate` and `drizzle-kit` fall with their query layers.
3. **It must run in-process against a Testcontainers database** (§2.2).
4. **It must not be hand-rolled.** A runner is a small program with a large blast radius: ordering,
   locking, partial application, a state table that must never be wrong.

## Considered options

- **Option A — `node-pg-migrate`, with migrations authored as plain `.sql` files.** **Chosen.**
  - Good, because the SQL is the artifact and the runner is maintained by someone else
    — requirements 1 and 4 both met.
  - Good, because it is a plain npm dependency
  - Good, because it has no opinion about the query layer
  - Bad, because it is the tool's less-travelled path
- **Option B — `node-pg-migrate`, with migrations authored in its JavaScript DSL**
  - Good, because the DSL is type-checked, composable
  - Bad, because the objects that matter — the extension, two exclusion constraints with a partial
    predicate — would be `pgm.sql('...')` strings anyway.
  - Bad, because it makes the schema's source of truth a JavaScript program
- **Option C — a hand-rolled runner**: numbered `.sql` files
  - Good, because it is completely transparent
  - Good, because `tools/` already contains bespoke scripts
  - Bad, because the correctness properties a migration runner needs — a transactional state table,
    an advisory lock, ordering, checksum refusal — are easy to get subtly wrong.
  - Bad, because it is exactly the kind of infrastructure that consumes human review
- **Option D — `dbmate`**: up/down in one `.sql` file
  - Good, because it is the most SQL-first option of all
  - Good, because it is genuinely excellent at this job
  - Bad, because it is a Go binary, so the test fixture must shell out
  - Bad, because it cannot be invoked programmatically
- **Option E — `Umzug`** with a PostgreSQL storage adapter
  - Good, because it is a well-tested, storage-agnostic migration framework
  - Bad, because it is a framework rather than a tool
    — Option C with a library underneath.
  - Bad, because its centre of gravity is Sequelize
- **Option F — the query layer's own migrator**
  - Good, because it is one fewer dependency and one fewer concept
  - Bad, because it couples two decisions that ADR-0006 deliberately separated
  - Bad, in the `drizzle-kit` and `prisma migrate` cases, for the reason ADR-0006 rejected them
    — it cannot express the exclusion constraint.
  - Bad, in the Kysely case, because Kysely's migrations are TypeScript modules

## Decision

Chosen option: **Option A — `node-pg-migrate` executing plain `.sql` migration files.**

It runs `.sql` files natively, splitting on `-- Up Migration` / `-- Down Migration` markers, which
dissolves the conflict between 1 and 4.

- Migrations live in **`src/persistence/migrations/`** as `NNNN_description.sql`, applied in
  filename order, tracked in a `pgmigrations` table.
- **Every migration is plain SQL. The DSL is not used**
  even where it would serve: a mixed corpus is worse than either.
- The runner is invoked **programmatically** (`node-pg-migrate`'s Node API) both by
  `npm run db:migrate` and by the Testcontainers fixture, so the tested schema is the shipped
  schema (§2.2, §8.5).
- **Down migrations are written but are not part of any recovery story.**
  They exist so a migration is reviewable as a reversible change.
- Migrations are **never edited after merge**, on the same reasoning that makes ADRs immutable:
  correcting one means a new migration.

## Consequences

**Good**

- The exclusion-constraint DDL of `CLAUDE.md` §2.1 appears in this repository exactly as written
  there.
- The migration corpus is legible to anyone who reads SQL
- Independent of ADR-0006: swapping Kysely for something else touches no migration.
- Applying migrations from the test fixture is a function call

**Bad, or deferred**

- `.sql` files carry no types, so nothing links a migration to the `Database` interface ADR-0006
  keeps — mitigated as ADR-0006 says: regenerate the interface in CI.
- `node-pg-migrate` is chosen partly for a feature (`.sql` file support) that is not its headline
  use, so most documentation shows the DSL this forbids.
- No schema-diffing and no drift detection: nothing notices if someone changes a database by hand.
  Noted in §11.
- Down migrations are written and never exercised, so they are unverified by construction.
