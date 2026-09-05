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

TC-7 makes the decomposition machine-checkable or not real: whatever §5 describes must be
expressible as `dependency-cruiser` rules. The question is not "what folders" but **which edges
must be forbidden, and what does forbidding them buy**. Three forces, in §1.2's order:

1. **Goal 1 — the invariant lives in PostgreSQL.** A decomposition presenting persistence as an
   interchangeable detail describes a different system; offering an in-memory repository works
   against §2.2.
2. **Goal 3 — modifiability.** A change to one of the §1.4 ambiguities must be absorbed by **one
   building block** plus a migration — the criterion this ADR is chosen against.
3. **Goal 2 — verifiability.** OC-5 requires the system to be testable from outside by a role that
   has never read `src/`, so the boundary must be exercisable over HTTP and over SQL.

## Considered options

- **Option A — technical layering**: `routes/`, `services/`, `repositories/`, `models/`.
  - Bad, because it fails the goal-3 criterion outright
    — A-1's duration rule fragments across `models`, `services` and `repositories`.
  - Bad, because "services" is where policy and orchestration merge, so the pure, cheaply
    testable core never separates out.
- **Option B — hexagonal / ports and adapters**: a persistence-ignorant domain owning a
  `BookingRepository` port, implemented by a SQL adapter.
  - **Bad, decisively, because the port would be substitutable and the invariant is not.**
    An in-memory `BookingRepository` cannot enforce a `tstzrange` exclusion; it can only
    check-then-act. Providing the interface is providing the loophole.
  - Bad, because the port's method signatures would have to leak PostgreSQL semantics anyway
  - Bad, because the unit-testability it buys is testability of the layer where nothing
    interesting happens
- **Option C — vertical feature slices**: `features/booking/`, `features/reschedule/`,
  `features/availability/`, each with its own route, service and SQL.
  - Bad, because the §1.4 ambiguities cut across features, not along them
    — interval derivation and opening-hours validation serve all three use cases.
  - Bad, because the shared kernel that inevitably forms to fix that is Option D arrived at by
    accident.
- **Option D — layered modules around a dependency-free policy core**, with the layer boundaries
  chosen so that each §1.4 ambiguity lands inside exactly one module. **Chosen.**
  - Good, because the goal-3 criterion is met for four of five predicted changes, and
    `domain-is-pure` turns GC-1's prohibition into a CI failure.
  - Bad, because it departs from the shape a reviewer expects
  - Bad, because a five-layer graph for four endpoints is more structure
    than the endpoint count alone would justify; the justification is the ambiguity table.
- **Option E — no decomposition**: one `src/` of cohesive files, layering by convention.
  - Bad, because TC-7 requires the layering to be enforced in CI
    and there would be nothing to enforce, so `dependency-cruiser` degrades to a cycle checker.
  - Bad, because the ambiguity-containment property would be a claim about discipline

## Decision

Chosen option: **Option D.** Five modules, one permitted dependency direction, and a core that is
pure by enforcement rather than by intention.

```
src/http/          Fastify edge: routes, TypeBox schemas, problem+json, OpenAPI emission
       ↓
src/application/   use cases: book, reschedule, cancel, read, availability.
                   Owns the ADR-0004 retry loop and the spans of §8.4
       ↓                            ↘
src/domain/        pure policy                src/persistence/  Kysely, SQL, migrations,
                   (no imports at all)                          SQLSTATE translation
                                                    ↓
                                              src/domain/  (types only)

src/platform/      config, logger, telemetry, base error shapes — a leaf, importable by
                   http · application · persistence, importing nothing from src/
src/main.ts        composition root; the only module permitted to import from every layer
```

**The five rules that are enforced** (`.dependency-cruiser.js`, and §5.3):

| Rule | Forbids | Buys |
|---|---|---|
| `domain-is-pure` | `src/domain` → anything: any `src/` module, any npm package, any `node:` builtin | The core cannot do I/O, so GC-1 is a build failure |
| `http-must-not-reach-persistence` | `src/http` → `src/persistence` | Every access passes a use case owning span and retry |
| `sql-only-in-persistence` | `pg`, `kysely` outside `src/persistence` | `23P01` translated once; a second site fails CI |
| `http-only-in-the-edge` | `fastify`, `@fastify/*` outside `src/http` | A use case is callable without a server |
| `outside-in-tests-do-not-import-src` | `tests/{acceptance,contract,property,concurrency}` → `src/` | OC-5 and P4, made structural |

`domain-is-pure` is deliberately absolute — no allowlist, not even `node:assert`; ADR-0001's
IANA-zone conversion uses the `Intl` global. Grant one exception and the rule becomes a list.

**Why `application` depends on `persistence` concretely, with no port.** This is the deliberate
departure, and the reason is not pragmatism:

> The invariant is a PostgreSQL exclusion constraint. A `BookingRepository` port is an interface
> that *can* be implemented in memory — and any in-memory implementation is a check-then-act
> booking, because there is no other way to write one. It would be an abstraction whose purpose is
> to make the correctness mechanism substitutable, in a system whose first rule is that it must not
> be. §2.2 bans the substitute; this bans the socket it plugs into.

The cost — the application layer is not unit-testable without a database — is the correct outcome.
The unit-testable surface is `src/domain`, where `fast-check` and the Stryker budget are spent.

**Ambiguity containment** — the goal-3 criterion, made concrete

| §1.4 item | Lands in |
|---|---|
| **A-1** duration varies by vehicle | `src/domain/duration.ts` + a migration |
| **A-4** an occupancy buffer appears | `src/domain/interval.ts` + a migration on the range |
| **ADR-0001** opening hours grow (breaks, holidays, closures) | `src/domain/openingHours.ts` + reference data |
| **A-10 / ADR-0009** candidate ordering or the cap changes | `src/domain/candidates.ts` |
| **A-3** technicians float between dealerships | `src/persistence/candidateRepository.ts` |
| **A-5** search-style "any slot on Tuesday" | `src/application/` |
| **GC-2** authentication arrives | **not contained** — crosses `http` and `application`; §11 carries it |

The last row is the honest one, and it was already known not to be contained.

## Consequences

**Good**

- Goal 3's claim is checkable rather than asserted: §10 carries a scenario that fails if
  duration, occupancy or wall-clock arithmetic appears outside its module.
- The core has no dependencies, so the domain test suite runs in milliseconds
- The architecture's central honesty — persistence is not swappable here — is visible in the
  module graph.
- Five modules is small enough that the generated dependency graph (§5.3) fits on a page

**Bad, or deferred**

- No repository port means no seam for a second persistence technology.
  Deliberate, and a real cost if TC-2 were revisited.
- The application layer's tests all need Docker, so a Docker-less environment can run only
  the domain suite. TC-9 says this; the decomposition makes the split sharp.
- `src/platform` is the module most likely to become a junk drawer, because "importable by
  everyone, imports nothing" is the shape a dumping ground has. No rule prevents it; a reviewer
  must.
- `http` may import `domain` types. That edge is allowed for response shapes and is not enforced
  "types only", so policy could sit in a route handler and nothing would notice. Review is the
  only mitigation, and it is a real gap.
