---
id: "0006"
title: Use Kysely as a typed SQL builder over node-postgres, and adopt no ORM
status: proposed
date: 2026-09-04
supersedes: null
superseded_by: null
arc42: ["§4.2", "§5.2", "§6", "§8.2", "§8.6"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  Proposed by the architect at Gate B; awaiting the human's decision. This is the
  decision with the least freedom in it: `CLAUDE.md` §2.1 and ADR-0003 between them
  disqualify most of the field before preference enters, and the ADR is written to
  show that the elimination is forced rather than chosen. The architect's own
  first instinct was plain `pg` (Option A); it was talked out of it by the schema
  churn that A-1 and A-4 make near-certain, not by a preference for tooling.
---

## Context and problem statement

The query layer is the one technology choice that can silently destroy this system's central
property. `CLAUDE.md` §2.1 puts correctness in a PostgreSQL exclusion constraint and requires the
service to map SQLSTATE `23P01` to `409 Conflict`. Three later decisions sharpen that into a
specification the query layer must meet:

- **ADR-0003** — a reschedule is one atomic `UPDATE` on the existing row, with *no* `AND id <> :id`
  predicate and no pre-read. The layer must be able to emit that statement exactly.
- **ADR-0004** — on `23P01` the next candidate is attempted, and each attempt must be independently
  recoverable. The layer must not force the loop inside one transaction.
- **§1.3, §8.4** — the refusal must name *which* resource was contended, and
  `booking_conflicts_total{resource}` must be labelled by it. PostgreSQL supplies that in the error's
  `constraint` field (`no_bay_overlap` / `no_technician_overlap`). The layer must not discard it.

That last point is the disqualifying test, and it is worth stating as a rule rather than a
preference:

> **A layer that wraps the driver error is disqualified.** If `err.code === '23P01'` and
> `err.constraint` do not arrive at the repository unaltered, the system cannot distinguish
> contention from a bad reference (`23503`), cannot label its conflict metric, cannot prune
> candidates by the resource that actually failed, and must fall back to string-matching an error
> message. Every one of those is a correctness or observability regression on the most important path
> in the system.

Against that sit A-1 (duration may become a function of vehicle), A-4 (a buffer may move the
occupancy interval) and A-9 (multi-dealership scoping on every query). §1.2 goal 3 ranks
modifiability third and predicts that the schema *will* move, which argues for something that catches
a stale column reference at compile time rather than in a test that happens to cover that row.

## Considered options

- **Option A — `pg` (node-postgres) alone**, with hand-written SQL strings and hand-written row types.
- **Option B — Kysely** over the `pg` driver: a typed query builder that compiles to SQL, with an
  `sql` template tag for PostgreSQL-specific fragments. Not an ORM: no entity mapping, no identity
  map, no lazy loading.
- **Option C — Prisma.**
- **Option D — Drizzle ORM.**
- **Option E — TypeORM or Sequelize** (a classic data-mapper/active-record ORM).

## Decision

Chosen option: **Option B — Kysely as a typed SQL builder over `pg`, with no ORM anywhere in the
system.**

The rules that make this decision mean something, rather than being a package name:

1. **Kysely is a builder, not a mapper.** There are no entities, no decorators, no repository base
   class and no change tracking. A repository function takes parameters and returns rows. The
   database schema is described once as a `Database` interface under `src/persistence/schema.ts`,
   derived from the migrations (`kysely-codegen` may generate it; the migrations remain the source).
2. **The driver error reaches the repository unaltered.** Kysely's PostgreSQL dialect executes through
   `pg` and rethrows what `pg` throws, so `err.code` and `err.constraint` survive. Translation from
   SQLSTATE to a domain outcome happens in **exactly one module**, `src/persistence/pgError.ts`, and
   `.dependency-cruiser.js` forbids importing `pg` or `kysely` outside `src/persistence` so no second
   translation site can appear (ADR-0008).
3. **PostgreSQL-specific SQL is written as SQL.** `tstzrange(...) && tstzrange(...)`, the exclusion
   constraints and the `NOT EXISTS` availability predicate are expressed with Kysely's `sql` tag, not
   approximated through a portable abstraction. TC-2 already gave up portability; pretending
   otherwise in the query layer would be the pretence without the benefit.
4. **The booking loop runs outside any transaction.** Because A-6 keeps a booking a single `INSERT`
   and ADR-0003 keeps a move a single `UPDATE`, **each attempt is one statement**, which in
   autocommit is its own transaction. ADR-0004's "independently recoverable attempt" requirement is
   therefore satisfied *by construction* rather than by savepoint discipline — and the corresponding
   prohibition is explicit: **the retry loop must not be wrapped in `db.transaction()`**, because
   then the second attempt fails with `25P02` (in a failed transaction block) rather than being
   retried. `.dependency-cruiser.js` cannot catch that one; §10 does, via the no-spurious-refusal
   scenario, which fails immediately if the loop is transactional.

## Consequences

**Good**

- The two statements that carry the invariant — the guarded `INSERT` and the guarded `UPDATE` — are
  readable as SQL in the repository, which is what a reviewer needs to check them against §2.1 and
  ADR-0003.
- `err.constraint` survives, so the `409` names the contended resource (§1.3),
  `booking_conflicts_total{resource}` is labelled truthfully, and ADR-0004's loop can prune *every*
  candidate containing the failed resource rather than only the pair it just tried (ADR-0009).
- A column renamed by a migration for A-1 or A-4 fails the build rather than one test, which is what
  goal 3 asks for.
- `23503` (foreign key) stays distinguishable from `23P01` (exclusion), which ADR-0004 requires and
  which §8.6 turns into `422` versus `409`.

**Bad, or deferred**

- The `Database` interface is a second statement of the schema beside the migrations, and nothing
  forces them to agree. Mitigated by regenerating it from a migrated database in CI and failing on a
  diff — the same generated-tier treatment as the OpenAPI document (ADR-0005). Until that check
  exists it is a real gap, and §11 carries it.
- Kysely is less widely known than Prisma or TypeORM, so a reader may need a moment with the query
  builder syntax. Judged cheaper than the alternative, where a reader needs a moment with an ORM's
  error-wrapping behaviour to convince themselves the invariant still holds.
- No migration story of its own — Kysely's own migrator is deliberately *not* used, so that the
  migration tool stays independent of the query layer (ADR-0007).
- Nothing prevents an implementer from wrapping the retry loop in a transaction. It is prohibited in
  prose here and caught by a quality scenario, not by a tool.

## Pros and cons of the options

### Option A — `pg` alone, hand-written SQL

- Good, because it is maximally transparent: every statement is exactly what is sent, and the error
  object is the driver's own, so requirement 2 is satisfied trivially.
- Good, because it is one dependency, and one the other options all depend on anyway.
- Good, because it is the option that most obviously cannot hide the invariant.
- Bad, because row and parameter types are hand-maintained assertions. A migration that renames a
  column produces a runtime failure in whichever test happens to touch that column, which is exactly
  the "unverified claim" failure mode §1.2 goal 2 exists against.
- Bad, because the availability query (multi-table, dealership-scoped, qualification-joined,
  range-predicated) is the most likely place for a silent scoping bug — an omitted `dealership_id`
  predicate would violate A-9 and still return plausible results.
- **This was the architect's first choice and is the closest runner-up.** It loses only on goal 3: A-1
  and A-4 are flagged in §1.4 as the changes most likely to land, and both are schema changes.

### Option B — Kysely

- Good, because it satisfies the disqualifying test outright: it does not wrap driver errors.
- Good, because it is a builder rather than a mapper, so the SQL it emits is predictable from the
  code and reviewable without running it.
- Good, because it types the schema without owning it — migrations stay plain SQL (ADR-0007), and
  the type layer is derived from them rather than the reverse.
- Good, because `sql` fragments make the PostgreSQL-specific parts explicit rather than smuggled.
- Bad, because the `Database` interface can drift from the migrations until the regeneration check is
  in place.
- Bad, because it is one more dependency than Option A for a benefit that only pays off when the
  schema changes.

### Option C — Prisma

- Good, because it has the best developer experience in the field and generates its own types and
  migrations from one schema file.
- **Bad, and disqualifying: exclusion constraints and `tstzrange` do not exist in the Prisma schema
  language.** The single most important object in this database would live in an
  `Unsupported`/raw-SQL escape hatch that Prisma's own model does not know about, so the tool's
  central value proposition — the schema file is the schema — is false here precisely where it
  matters.
- **Bad, and independently disqualifying: it wraps errors.** A constraint violation from `$executeRaw`
  surfaces as `PrismaClientKnownRequestError` with code `P2010`, the PostgreSQL SQLSTATE buried in
  `meta`, and the `constraint` field not reliably exposed at all. Recovering `no_bay_overlap` versus
  `no_technician_overlap` would mean parsing an error message string — an unacceptable foundation for
  the conflict metric and for candidate pruning.
- Bad, because the retry loop's per-attempt statement scoping fights Prisma's interactive-transaction
  model rather than falling out of it.

### Option D — Drizzle ORM

- Good, because like Kysely it compiles to SQL, keeps the driver error intact, and is fully typed.
- Good, because `drizzle-kit` would fold ADR-0007 into this decision, which is fewer moving parts.
- Bad, because that folding is the problem: `drizzle-kit generate` derives migrations from the
  TypeScript schema, and the objects that matter most here — the `btree_gist` extension, two
  exclusion constraints, a partial index predicate, composite foreign keys — are not expressible in
  that schema. The generated migration would be *incomplete*, with the important half appended by
  hand, so the generator would be actively misleading about what the database contains.
- Bad, because range types require a custom type definition, so the `tstzrange` handling is
  hand-written anyway — Kysely's `sql` tag is the same work without the pretence of coverage.

### Option E — TypeORM or Sequelize

- Good, because both are mature, familiar, and come with migrations and a repository pattern already
  shaped like §5's persistence layer.
- Bad, because entity mapping and change tracking put an object graph between the code and the two
  statements that carry the invariant. `repository.save(appointment)` may emit an `INSERT` or an
  `UPDATE` depending on state the application cannot see, which is intolerable when ADR-0003 turns on
  the difference.
- Bad, because both wrap driver errors (`QueryFailedError`, `DatabaseError`) with inconsistent
  preservation of `constraint` across versions and dialects.
- Bad, because an ORM's natural idiom for a reschedule is *load, mutate, save*, which is a read
  followed by a write — the check-then-act shape §2.1 forbids, arrived at by following the tool's
  grain rather than by anyone deciding to.
