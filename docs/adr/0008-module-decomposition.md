---
id: "0008"
title: Decompose into five layered modules around a dependency-free policy core
status: accepted
date: 2026-09-04
supersedes: null
superseded_by: null
arc42: ["§4.3", "§5.2", "§5.3", "§8.5", "§10"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  ACCEPTED as recommended at Gate B on 2026-09-04, unmodified.
  Proposed by the architect at Gate B. The architect
  reached for ports-and-adapters first, as the default for a system with an
  interesting domain, and rejected it on a specific ground rather than a stylistic
  one: a repository port that can be implemented in memory is a port whose
  implementation cannot hold this system's invariant, and offering one invites
  exactly the substitution `CLAUDE.md` §2.2 forbids. That argument is the reason
  this ADR exists as a decision rather than as a folder listing.
---

## Context and problem statement

Six months from now someone is told a service takes ninety minutes on a van and sixty on a car.
Where do they change it? If the answer is "three files, across routes, services and repositories",
the decomposition has failed whatever it is called.

The layering is expressible as `dependency-cruiser` rules and enforced on every commit, or it is not
real. The question is not "what folders" but **which edges must be forbidden, and what forbidding
them buys**. Three forces, in the quality goals' order:

1. **The invariant lives in PostgreSQL.** A decomposition presenting persistence as an
   interchangeable detail describes a different system, and an in-memory repository fights the rule
   that tests run on real PostgreSQL.
2. **Modifiability.** Each predicted change must be absorbed by **one building block** plus a
   migration — the criterion this ADR is chosen against.
3. **Verifiability.** The system must be testable from outside by a role that has never read
   `src/`, so the boundary must be exercisable over HTTP and SQL.

## Considered options

- **Option A — technical layering**: `routes/`, `services/`, `repositories/`, `models/`.
  - Bad, because it fails the modifiability criterion — the duration rule fragments across
    `models`, `services` and `repositories`.
  - Bad, because "services" is where policy and orchestration merge, so the pure, cheaply
    testable core never separates.
- **Option B — hexagonal / ports and adapters**: a persistence-ignorant domain owning a
  `BookingRepository` port, implemented by a SQL adapter.
  - **Bad, decisively, because the port would be substitutable and the invariant is not.**
    An in-memory `BookingRepository` cannot enforce a `tstzrange` exclusion; it can only
    check-then-act. Providing the interface is providing the loophole.
  - Bad, because the port's method signatures would have to leak PostgreSQL semantics anyway
  - Bad, because the unit-testability it buys is of the layer where nothing interesting happens
- **Option C — vertical feature slices**: `features/booking/`, `features/reschedule/`,
  `features/availability/`, each with its own route, service and SQL.
  - Bad, because the predicted changes cut across features, not along them — interval derivation
    and opening-hours validation serve all three use cases.
  - Bad, because the shared kernel that forms to fix that is Option D arrived at by accident.
- **Option D — layered modules around a dependency-free policy core**, with the layer boundaries
  chosen so that each predicted change lands in exactly one module. **Chosen.**
  - Good, because the criterion is met for four of five predicted changes, and the purity rule
    makes "no I/O in the domain" a build failure.
  - Bad, because it departs from the shape a reviewer expects
  - Bad, because five layers for four endpoints is more structure than the endpoint count
    justifies; the change table is the justification.
- **Option E — no decomposition**: one `src/` of cohesive files, layering by convention.
  - Bad, because the layering must be enforced in CI and there would be nothing to enforce:
    `dependency-cruiser` degrades to a cycle checker.
  - Bad, because the containment property would be a claim about discipline

## Decision

Chosen option: **Option D.** Five modules, one permitted dependency direction, and a core that is
pure by enforcement rather than by intention.

```
src/http/          Fastify edge: routes, TypeBox schemas, problem+json, OpenAPI emission
       ↓
src/application/   use cases: book, reschedule, cancel, read, availability.
                   Owns the retry loop and the request spans
       ↓                            ↘
src/domain/        pure policy                src/persistence/  Kysely, SQL, migrations,
                   (no imports at all)                          SQLSTATE translation
                                                    ↓
                                              src/domain/  (types only)

src/platform/      config, logger, telemetry, base error shapes — a leaf, importable by
                   http · application · persistence, importing nothing from src/
src/main.ts        composition root; the only module permitted to import from every layer
```

**The five rules that are enforced**, in `.dependency-cruiser.js`:

| Rule | Forbids | Buys |
|---|---|---|
| `domain-is-pure` | `src/domain` → anything: any `src/` module, any npm package, any `node:` builtin | The core cannot do I/O; reaching for it fails the build |
| `http-must-not-reach-persistence` | `src/http` → `src/persistence` | Every access passes a use case owning span and retry |
| `sql-only-in-persistence` | `pg`, `kysely` outside `src/persistence` | `23P01` translated once; a second site fails CI |
| `http-only-in-the-edge` | `fastify`, `@fastify/*` outside `src/http` | A use case is callable without a server |
| `outside-in-tests-do-not-import-src` | `tests/{acceptance,contract,property,concurrency}` → `src/` | Outside-in tests stay black-box, structurally |

`domain-is-pure` is deliberately absolute — no allowlist, not even `node:assert`; the opening-hours
rule's zone conversion uses the `Intl` global. Grant one exception and the rule becomes a list.

**Why `application` depends on `persistence` concretely, with no port** — the deliberate departure,
and the reason is not pragmatism:

> The invariant is a PostgreSQL exclusion constraint. A `BookingRepository` port *can* be
> implemented in memory — and any in-memory implementation is check-then-act, because there is no
> other way to write one. It would be an abstraction whose purpose is
> to make the correctness mechanism substitutable, in a system whose first rule is that it must not
> be. The constitution bans the substitute; this bans the socket it plugs into.

The cost — the application layer is not unit-testable without a database — is the correct outcome.
The unit-testable surface is `src/domain`, where property tests and the mutation budget go.

**Where each predicted change lands**

| Predicted change | Lands in |
|---|---|
| duration varies by vehicle | `src/domain/duration.ts` + a migration |
| an occupancy buffer appears | `src/domain/interval.ts` + a migration on the range |
| opening hours grow breaks, holidays, closures | `src/domain/openingHours.ts` + reference data |
| candidate ordering or the attempt cap changes | `src/domain/candidates.ts` |
| technicians float between dealerships | `src/persistence/candidateRepository.ts` |
| search-style "any slot on Tuesday" | `src/application/` |
| **authentication arrives** | **not contained** — crosses `http` and `application`; carried as debt |

The last row is the honest one, and was already known not to be contained.

## Consequences

**Good**

- The modifiability claim is checkable: a quality scenario fails if duration, occupancy or
  wall-clock arithmetic appears outside its module.
- The core has no dependencies, so the domain suite runs in milliseconds
- The architecture's central honesty — persistence is not swappable here — shows in the module
  graph.
- Five modules is few enough that the generated dependency graph fits on a page

**Bad, or deferred**

- No repository port means no seam for a second persistence technology — deliberate, and a real
  cost if PostgreSQL were revisited.
- The application layer's tests all need Docker, so a Docker-less environment can run only the
  domain suite. The decomposition makes that split sharp.
- `src/platform` is the module most likely to become a junk drawer: "importable by everyone,
  imports nothing" is the shape a dumping ground has. No rule prevents it; a reviewer must.
- `http` may import `domain` types. That edge is allowed for response shapes and is not enforced
  "types only", so policy could sit in a route handler and nothing would notice. Review is the
  only mitigation, and a real gap.
