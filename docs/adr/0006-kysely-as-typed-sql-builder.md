---
id: "0006"
title: Use Kysely as a typed SQL builder over node-postgres, and adopt no ORM
status: accepted
date: 2026-09-04
supersedes: null
superseded_by: null
arc42: ["§4.2", "§5.2", "§6", "§8.2", "§8.6"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  ACCEPTED as recommended at Gate B on 2026-09-04, unmodified.
  Proposed by the architect at Gate B. This is the
  decision with the least freedom in it: `CLAUDE.md` §2.1 and ADR-0003 between them
  disqualify most of the field before preference enters, and the ADR is written to
  show that the elimination is forced rather than chosen. The architect's own
  first instinct was plain `pg` (Option A); it was talked out of it by the schema
  churn that A-1 and A-4 make near-certain, not by a preference for tooling.
---

## Context and problem statement

A booking is refused. To answer the caller honestly the code must learn two things only PostgreSQL
knows — that the failure was `23P01` (overlap) and not `23503` (a bad reference), and *which*
constraint fired, the bay's or the technician's. Most libraries throw both away.

> **A layer that wraps the driver error is disqualified**, because `err.code` and `err.constraint`
> must arrive unaltered.

That is how a query layer can silently destroy this system's central property. Three decisions
sharpen it: a reschedule is **one atomic `UPDATE`** on the existing row with *no* `AND id <> :id`
predicate; on `23P01` the next candidate is attempted, each independently recoverable, so the loop
cannot sit inside a transaction; and the refusal must name *which* resource was contended, the
conflict metric labelled from `err.constraint`.

Against that, modifiability is a graded goal and the schema *will* move.

## Considered options

- **Option A — `pg` (node-postgres) alone**
  - Good, because it is maximally transparent
  - Good, because it is one dependency
  - Good, because it most obviously cannot hide the invariant
  - Bad, because row and parameter types are hand-maintained assertions
  - Bad, because the availability query — multi-table, dealership-scoped, qualification-joined,
    range-predicated — risks a silent bug
  - **The architect's first choice, and the closest runner-up.** It loses only on modifiability
- **Option B — Kysely** over the `pg` driver: a typed query builder that compiles to SQL, with an
  `sql` tag. **Chosen.**
  - Good, because it satisfies the disqualifying test outright
  - Good, because it is a builder rather than a mapper
  - Good, because it types the schema without owning it
  - Good, because `sql` fragments make the PostgreSQL parts explicit
  - Bad, because the `Database` interface can drift from the migrations
  - Bad, because it is one more dependency than Option A
- **Option C — Prisma.**
  - Good, because it has the best developer experience
  - **Bad, and disqualifying: exclusion constraints and `tstzrange` do not exist in the Prisma
    schema language** — so the object that matters most lives in a raw-SQL hatch.
  - **Bad, and independently disqualifying: it wraps errors.** A constraint violation from
    `$executeRaw` surfaces as `P2010`, SQLSTATE buried.
  - Bad, because the retry loop's per-attempt statement scoping fights Prisma's interactive-transaction
- **Option D — Drizzle ORM.**
  - Good, because like Kysely it keeps the driver error intact
  - Good, because `drizzle-kit` would fold the migration decision in
  - Bad, because that folding is the problem: `drizzle-kit generate` derives migrations from the
    TypeScript schema, where exclusion constraints are inexpressible
  - Bad, because range types require a custom type definition
- **Option E — TypeORM or Sequelize**
  - Good, because both are mature and familiar
  - Bad, because entity mapping and change tracking put an object graph between the code and the
    two statements carrying the invariant
  - Bad, because both wrap driver errors (`QueryFailedError`, `DatabaseError`)
  - Bad, because an ORM's natural idiom for a reschedule is *load, mutate, save*

## Decision

Chosen option: **Option B — Kysely as a typed SQL builder over `pg`, with no ORM anywhere in the
system.**

1. **Kysely is a builder, not a mapper.** The schema is a `Database` interface derived from the
   migrations.
2. **The driver error reaches the repository unaltered**: Kysely rethrows what `pg` throws.
   SQLSTATE translation happens in **exactly one module**, `src/persistence/pgError.ts`;
   `.dependency-cruiser.js` forbids `pg`/`kysely` outside `src/persistence`.
3. **PostgreSQL-specific SQL is written as SQL**, through Kysely's `sql` tag.
4. **The booking loop runs outside any transaction.** A booking is one `INSERT` and a move one
   `UPDATE`, so each attempt is its own transaction and independently recoverable by construction.
   **The retry loop must not be wrapped in `db.transaction()`**, or attempt two fails with `25P02`
   — caught by a quality scenario, not a tool.

## Consequences

**Good**

- The two statements carrying the invariant, the guarded `INSERT` and the guarded `UPDATE`, are
  readable as SQL.
- `err.constraint` survives, so the `409` names the contended resource and the retry loop prunes
  by it.
- A column renamed by a migration fails the build
- `23503` (foreign key) stays distinguishable from `23P01` (exclusion)

**Bad, or deferred**

- The `Database` interface is a second statement of the schema beside the migrations, and nothing
  forces them to agree. Debt.
- Kysely is less widely known than Prisma or TypeORM
- No migration story of its own — Kysely's own migrator is deliberately *not* used
- Nothing prevents an implementer from wrapping the retry loop in a transaction. It is prohibited
