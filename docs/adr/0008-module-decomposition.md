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

TC-7 makes the decomposition machine-checkable or not real: whatever §5 describes must be expressible
as `dependency-cruiser` rules, and a layering that cannot be written down as rules is not an
acceptable layering. So the question is not "what folders" but **which edges must be forbidden, and
what does forbidding them buy**.

Three forces, in the order §1.2 ranks them:

1. **Goal 1 — the invariant lives in PostgreSQL.** Any decomposition that presents persistence as an
   interchangeable detail is describing a different system from the one being built. §2.2 forbids an
   in-memory repository in any test asserting a persistence invariant; a decomposition that *offers*
   one is working against its own constitution.
2. **Goal 3 — modifiability, stated concretely.** §1.2 defines it as: a change to one of the §1.4
   ambiguities is absorbed by **one building block** plus a migration. That is a testable claim about
   a decomposition, and it is the criterion this ADR is chosen against. The three named candidates
   are A-1 (duration varies by vehicle), A-4 (an occupancy buffer) and ADR-0001's opening hours.
3. **Goal 2 — verifiability.** OC-5 requires the system to be testable from outside by a role that has
   never read `src/`. The decomposition must therefore have a boundary that is exercisable over HTTP
   and over SQL, and no essential behaviour reachable only through internals.

## Considered options

- **Option A — technical layering**: `routes/`, `services/`, `repositories/`, `models/`.
- **Option B — hexagonal / ports and adapters**: a persistence-ignorant domain owning a
  `BookingRepository` port, implemented by a SQL adapter.
- **Option C — vertical feature slices**: `features/booking/`, `features/reschedule/`,
  `features/availability/`, each with its own route, service and SQL.
- **Option D — layered modules around a dependency-free policy core**, with the layer boundaries
  chosen so that each §1.4 ambiguity lands inside exactly one module.
- **Option E — no decomposition**: one `src/` of cohesive files, layering by convention.

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
| `domain-is-pure` | `src/domain` → anything at all: any other `src/` module, any npm package, any `node:` builtin | The policy core cannot perform I/O, so it *cannot* consult the database. GC-1's requirement that the opening-hours rule "never acquire knowledge of what is booked" stops being a promise and becomes a build failure |
| `http-must-not-reach-persistence` | `src/http` → `src/persistence` | No route can issue SQL. Every database access passes through a use case that owns the span and the retry policy |
| `sql-only-in-persistence` | `pg`, `kysely` imported anywhere but `src/persistence` | SQLSTATE `23P01` is translated in exactly one module. A second translation site — the classic way a `409` starts meaning two different things — cannot be added without failing CI |
| `http-only-in-the-edge` | `fastify`, `@fastify/*` imported outside `src/http` | The transport cannot leak into policy, so a use case is callable from a test without a server |
| `outside-in-tests-do-not-import-src` | `tests/{acceptance,contract,property,concurrency}` → `src/` | OC-5 and P4 made structural: the tests that define *done* reach the system over HTTP and over SQL, exactly as a client does |

`domain-is-pure` is the load-bearing one, and it is deliberately absolute — no allowlist, not even for
`node:assert` or a date library. IANA-zone conversion for ADR-0001 is done with the `Intl` global,
which needs no import. The moment an exception is granted, the rule stops being a statement about the
core's nature and becomes a list.

**Why `application` depends on `persistence` concretely, with no port.** This is the deliberate
departure from the usual shape, and the reason is not pragmatism:

> The invariant is a PostgreSQL exclusion constraint. A `BookingRepository` port would be an
> interface that *can* be implemented in memory — and any in-memory implementation would be a
> check-then-act booking, because there is no other way to write one. The port would therefore be an
> abstraction whose whole purpose is to make the correctness mechanism substitutable, in a system
> whose first rule is that it must not be. `CLAUDE.md` §2.2 already bans the substitute in tests;
> this bans the socket it would plug into. PostgreSQL is not a detail here, and the architecture says
> so out loud rather than in a comment.

The cost is that the application layer is not unit-testable without a database — which is the correct
outcome, not a regression: the unit-testable surface is `src/domain`, deliberately and by
construction, and it is where `fast-check` property tests and the Stryker mutation budget are spent.
Everything above it is thin orchestration verified through `tests/integration` and `tests/acceptance`
against real PostgreSQL (§8.5).

**Ambiguity containment** — the goal-3 criterion, made concrete. Each row names the single module a
change lands in:

| §1.4 item | If the reading changes | Lands in |
|---|---|---|
| **A-1** duration varies by vehicle | `serviceDuration()` gains a vehicle parameter | `src/domain/duration.ts` + one migration |
| **A-4** an occupancy buffer appears | `occupancyInterval()` stops being the identity | `src/domain/interval.ts` + one migration on the constraint's range expression |
| **ADR-0001** opening hours grow (breaks, holidays, closures) | the weekly-hours rule gains exceptions | `src/domain/openingHours.ts` + reference data |
| **A-10 / ADR-0009** candidate ordering or the cap changes | ordering and pruning policy | `src/domain/candidates.ts` |
| **A-3** technicians float between dealerships | the eligibility query gains a join and a temporal predicate | `src/persistence/candidateRepository.ts` |
| **A-5** search-style "any slot on Tuesday" | a new use case over the same primitives | `src/application/` |
| **GC-2** authentication arrives | **not contained** — a new concern crossing `http` and `application`, and the ownership rule changes layer | ADR-0002 already states this is not additive; §11 carries it |

The last row is the honest one. Four of the five ambiguities §1.2 predicts are contained by this
decomposition; the one that is not was already known not to be, and saying so is worth more than a
table where every row is green.

## Consequences

**Good**

- Goal 3's claim is checkable rather than asserted: §10 carries a scenario that fails if
  duration arithmetic, occupancy arithmetic or wall-clock conversion appears outside its module.
- The core has no dependencies, so the domain test suite runs in milliseconds and is where mutation
  testing pays.
- The architecture's central honesty — persistence is not swappable here — is visible in the module
  graph rather than only in prose.
- Five modules is small enough that the generated dependency graph (§5.3) fits on a page and a
  reviewer can hold it in their head.

**Bad, or deferred**

- No repository port means no seam for a second persistence technology. Deliberate, and it would be a
  genuine cost if TC-2 were ever revisited.
- The application layer's tests all need Docker, so a Docker-less environment can run only the domain
  suite. TC-9 already says this; the decomposition makes the split sharp rather than blurred.
- `src/platform` is the module most likely to become a junk drawer, because "importable by everyone,
  imports nothing" is exactly the shape a dumping ground has. Nothing in the rule set prevents it; a
  reviewer must.
- `http` may import `domain` types. That edge is allowed for response shapes and is not enforced
  "types only", so an implementer could put policy in a route handler and the tooling would not
  notice. The mitigation is review, and it is a real gap.

## Pros and cons of the options

### Option A — technical layering (`routes`/`services`/`repositories`/`models`)

- Good, because it needs no explanation and every reader has seen it.
- Good, because the dependency rules are trivial to write and to enforce.
- Bad, because it fails the goal-3 criterion outright: A-1's duration rule would have a fragment in
  `models` (the field), `services` (the arithmetic) and `repositories` (the persisted end time), so
  the change is three files in three layers rather than one building block.
- Bad, because "services" is where policy and orchestration merge, so the pure, cheaply testable core
  never separates out and the mutation budget has nowhere good to be spent.

### Option B — hexagonal, with repository ports

- Good, because it is the standard answer for a system with real domain logic, and a reviewer would
  find it unsurprising.
- Good, because it would make the application layer unit-testable without Docker.
- **Bad, decisively, because the port would be substitutable and the invariant is not.** An in-memory
  `BookingRepository` cannot enforce a `tstzrange` exclusion; it can only check-then-act. Providing
  the interface is providing the loophole, and §2.2 exists because that loophole is the single most
  likely way this system's guarantee gets quietly deleted.
- Bad, because the port's method signatures would have to leak PostgreSQL semantics anyway — "this
  may raise a conflict that only the database can detect" is not an abstraction, it is a leak with
  extra indirection.
- Bad, because the unit-testability it buys is testability of the layer where nothing interesting
  happens, purchased by making the layer where everything interesting happens look optional.

### Option C — vertical feature slices

- Good, because it matches the slice loop, so one slice touches one folder and merges cleanly.
- Good, because feature-local changes are genuinely well contained.
- Bad, because the §1.4 ambiguities cut *across* features, not along them: interval derivation and
  opening-hours validation are needed by booking, by rescheduling and by availability, so A-1 and A-4
  would land in three slices instead of one. That is a direct failure of the goal-3 criterion, and
  goal 3 is exactly why this option is attractive in the first place.
- Bad, because the shared kernel that inevitably forms to fix that is Option D arrived at by
  accident, without the enforced purity that makes Option D worth having.

### Option D — layered modules around a pure core

- Good, because the goal-3 criterion is met for four of five predicted changes, and the fifth is
  documented as uncontained rather than hidden.
- Good, because `domain-is-pure` turns GC-1's most important prohibition — the opening-hours rule
  must never see a booking — into something CI enforces.
- Good, because the layer boundaries and the test-ownership boundaries (§5 of `CLAUDE.md`) line up:
  outside-in tests hit `http` and the database, unit tests hit `domain`.
- Bad, because it departs from the shape a reviewer expects, so it needs the paragraph above to
  justify the missing port.
- Bad, because a five-layer graph for four endpoints is more structure than the endpoint count alone
  would justify; the justification is the ambiguity table, not the endpoint count.

### Option E — no decomposition

- Good, because at four endpoints it would work, and it would be the least code.
- Bad, because TC-7 requires the layering to be enforced in CI and there would be nothing to enforce,
  so `dependency-cruiser` would degrade to a cycle checker and §2.3 would become decorative.
- Bad, because the ambiguity-containment property would be a claim about discipline, and §1.2 goal 2
  is specifically the goal that unverified claims do not count.
