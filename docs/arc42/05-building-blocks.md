# 5. Building block view

> Owner: architect · Written: phase 2, corrected at each merge

The decomposition and the reasons for it are [ADR-0008](../adr/0008-module-decomposition.md). This section is what the decomposition *is*;
the ADR is why it beat the alternatives.

## 5.1 Level 1 — containers

![Containers and the modules inside the scheduler](../diagrams/building-blocks.svg)

*Source: [`diagrams/building-blocks.html`](../diagrams/building-blocks.html) · regenerate the SVG with `npm run diagram:export`*

| Container | Responsibility | Notes |
|---|---|---|
| **Stubbed client** | Not built. An OpenAPI document and a cURL harness stand in for it (TC-5) | The contract is *emitted* from the route schemas (ADR-0005), so it cannot drift from the service |
| **Scheduler service** | The whole system: validate, allocate, persist, report | One Node process, five internal modules (§5.2) |
| **PostgreSQL** | The persistent store **and the enforcement point for the central invariant** | Not a generic persistence port. §2.1 forbids substituting it in any test that asserts a persistence invariant, and §4.1 says why calling it swappable would be a lie |
| **Telemetry collector** | Receives OTLP traces and metrics; `pino` writes JSON to stdout | A local `grafana/otel-lgtm` container (§7). Its absence must not break the service |

There are no other neighbours; §3.1.2 argues that omission rather than leaving it as one.

## 5.2 Level 2 — components

Whitebox of the scheduler service. Five modules, one permitted dependency direction, and a composition
root. The direction is enforced, not described: every forbidden edge below is a rule in
[`.dependency-cruiser.js`](../../.dependency-cruiser.js) and a CI failure (§5.3).

```
  src/http/         ──▶  src/application/  ──▶  src/domain/
                                │
                                └──────────▶  src/persistence/  ──▶  src/domain/  (types)

  src/platform/     a leaf: importable by http · application · persistence, imports nothing from src/
  src/main.ts       composition root: the only module permitted to see every layer
```

### `src/domain` — the policy core

Pure functions and types. **It imports nothing at all** — no other module, no npm package, no `node:`
builtin — and `dependency-cruiser`'s `domain-is-pure` rule enforces that absolutely, with no
allowlist. IANA-zone conversion uses the `Intl` global, which needs no import.

The purity is not aesthetic. GC-1 requires that the opening-hours rule *"must never acquire knowledge
of what is booked"*, because a validation rule that reads other bookings is an availability check and
reintroduces check-then-act. A module that cannot import a database client cannot consult one, so the
prohibition is a build failure rather than a promise.

| Module | Owns | The §1.4 ambiguity it absorbs |
|---|---|---|
| `interval.ts` *(built)* | The `Instant` and `Interval` types, `instant(epochMillis)`, `appointmentInterval(startsAt, durationMillis)`, and **`occupancyInterval(interval)` — "the interval the constraint sees"** | **A-4.** `occupancyInterval` is the identity today, which is the statement that there is no buffer. A buffer changes this function and the constraint's range expression, nothing else |
| `duration.ts` *(built)* | The `DurationMinutes` type, `serviceDuration(serviceType)`, `durationMillis(duration)` — the only place minutes become milliseconds | **A-1.** If duration varies by vehicle this function gains a parameter; the interval arithmetic above it takes a number and does not change |
| `openingHours.ts` *(built)* | `withinOpeningHours(startsAtMillis, endsAtMillis, ianaZone, weekly)`, returning the `OpeningHoursVerdict` union rather than a boolean | **ADR-0001 / GC-1.** The only place that reasons in wall-clock time (A-8). Breaks, holidays and one-off closures land here |
| `candidates.ts` *(slice 04)* | `orderCandidates(set, seed)`, `nextCandidate(set)`, `prune(set, resource, id)` | **A-10 / ADR-0009.** Ordering, pruning and the attempt cap's arithmetic. Pure and seeded, so a failing interleaving is reproducible |
| `appointment.ts` *(slice 05)* | The status model: `confirmed`/`cancelled`, and which transitions are legal | **ADR-0003.** Cancellation is terminal and idempotent; only a confirmed appointment may be moved |

The three built signatures take **primitives, not domain types**, which is the consequence of the
literal AC-6 ruling recorded below rather than a simplification.

`occupancyInterval` deserves its name. A-4 is §1.4's *"assumption most likely to be wrong in a real
dealership"*, and what it moves is not the customer-facing appointment but the span the exclusion
constraint compares. Keeping those two ideas distinct while they happen to be equal is the difference
between a one-function change and an archaeology exercise.

### `src/application` — the use cases

`bookAppointment`, `rescheduleAppointment`, `cancelAppointment`, `readAppointment`,
`queryAvailability`. This layer owns the ADR-0004 retry loop, the span boundaries of §8.4, and
nothing else. It has no business rules of its own: every decision it makes is either delegated to
`domain` or adjudicated by the database.

Use cases return **discriminated unions, not exceptions**:

```ts
export type BookOutcome =
  | { kind: 'confirmed'; appointment: Appointment }
  | { kind: 'outside-opening-hours'; opens: string; closes: string }
  | { kind: 'unknown-reference'; reference: 'dealership' | 'vehicle' | 'customer' | 'service-type' }
  | { kind: 'vehicle-not-owned-by-customer' }
  | { kind: 'no-capacity'; resource: 'bay' | 'technician'; attempts: number };
```

so §8.6's status mapping is an exhaustive `switch` the compiler checks: a new outcome cannot be added
without the HTTP layer failing to compile, which is the cheapest way to stop a domain failure silently
rendering as a `500`.

**This layer depends on `src/persistence` concretely. There is no repository port**, and that is a
decision rather than an omission ([ADR-0008](../adr/0008-module-decomposition.md)): a port that can be
implemented in memory is a port whose implementation cannot hold this system's invariant, and offering
the socket invites the substitution `CLAUDE.md` §2.2 bans. The cost is that **a use case cannot be
unit-tested against a substitute repository**. It can still be unit-tested against a replaced
*transport* — `checkHealth` is, with no container — because removing the port forecloses substituting
the repository, not the driver beneath it. §8.5 draws the line that keeps §2.2 intact.

### `src/persistence` — SQL, and the only place SQLSTATE is read

Kysely over `pg` (ADR-0006), plain `.sql` migrations (ADR-0007). `pg` and `kysely` are importable
here and nowhere else, so there is exactly one translation from a PostgreSQL error to a domain
outcome:

```ts
// src/persistence/pgError.ts — the single site
export type PgOutcome =
  | { kind: 'conflict'; resource: 'bay' | 'technician' }   // 23P01, from err.constraint
  | { kind: 'bad-reference'; constraint: string }          // 23503
  | { kind: 'other'; cause: unknown };
```

A second translation site is the classic way a `409` comes to mean two different things and the way
`err.constraint` gets dropped on one path — breaking both the `booking_conflicts_total{resource}` label
and ADR-0009's pruning. `sql-only-in-persistence` makes adding one a CI failure.

| Module | Owns |
|---|---|
| `db.ts` | The Kysely instance and the `pg` pool |
| `schema.ts` | The `Database` interface, derived from the migrations |
| `pgError.ts` | SQLSTATE → `PgOutcome`, and the constraint-name → resource mapping |
| `appointmentRepository.ts` | The guarded `INSERT` (booking), the guarded atomic `UPDATE` (move, ADR-0003), the status `UPDATE` (cancel) |
| `candidateRepository.ts` | The **advisory** free-bay and free-qualified-technician read (A-3, A-9) |
| `referenceRepository.ts` | Dealership, its IANA zone and weekly opening hours; service type and its duration |
| `migrations/*.sql` | The schema, including the two exclusion constraints verbatim (§8.2) |

### `src/http` — the edge

Fastify, TypeBox schemas, RFC 9457 `application/problem+json`, and the OpenAPI emitter (ADR-0005).
It maps a use-case outcome to a status code and nothing more. It **may not import
`src/persistence`**: a route that queries directly would bypass the span boundaries and the retry
policy that make the booking path what it is.

### `src/platform` — the leaf

Config (including ADR-0009's attempt cap), the `pino` logger, the OpenTelemetry bootstrap and the
metric registry. Importable by everyone, imports nothing from `src/`. That shape is also exactly the
shape of a junk drawer; the leaf rule keeps it from acquiring behaviour, but only a reviewer keeps it
from acquiring *contents*.

### `src/main.ts` — the composition root

Reads config, starts telemetry, builds the pool, builds the server, listens. The only module allowed
to see every layer, and the only place a dependency is chosen rather than received.

### As built

| Module | Contents |
|---|---|
| `src/domain` | `interval.ts`, `duration.ts`, `openingHours.ts` — three files, **zero import statements between them** |
| `src/application` | `checkHealth.ts`, declaring `HealthOutcome` *here* and not in `src/http`, so the route's `switch` is exhaustiveness-checked and the use case stays callable without a server |
| `src/persistence` | `db.ts` (the `Db` alias and the pool), `health.ts` (`pingDatabase`, returning a boolean rather than rethrowing a driver error, so the outcome union stays the only vocabulary above it), `schema.ts`, `migrations/` |
| `src/http` | `server.ts`, `routes/health.ts`. `buildServer` takes already-bound use cases, never a handle |
| `src/platform` | `config.ts`, `logger.ts`. Telemetry is slice 09's; an empty OTel bootstrap now would be the junk drawer above |
| `src/main.ts` | Composition root, signals, listen |

`GET /health` was the skeleton's route precisely because it crosses every module: one that
short-circuits the layering proves nothing about it.

**The ruleset forecloses every shape that *names* the database handle, and partial application is the
shape taken rather than the shape left.** `sql-only-in-persistence` forbids naming `Kysely` outside
persistence and `http-must-not-reach-persistence` forbids naming `Db`, and `tsPreCompilationDeps: true`
catches `import type` too — but a generic parameter evades both by declining to name the handle at all:
`interface GenericDeps<TDb> { db: TDb }` compiles and cruises clean. Partial application costs nothing
to prefer, because the generic alternative buys the edge a value it cannot type, cannot use and must
not touch. Stating this precisely matters: *"no other shape compiles"* would be a claim the tooling
does not support, and the next person to find the escape hatch would conclude the rule was decorative.

### What literal AC-6 changed in the domain's signatures

*Nothing at all* includes each other, so the built signatures take **primitives, not domain types**:
`appointmentInterval` takes a bare `durationMillis` and the caller converts first; `withinOpeningHours`
takes four bare parameters; ordering and finiteness, once guaranteed by the `Interval` type, are
asserted at runtime as verdict `malformed-interval`; and the composition
`serviceDuration → durationMillis → appointmentInterval → withinOpeningHours`, once enforced by the
brands, is written out by a use case in `src/application`. §11 carries the cost as D-01-1 to D-01-4.

`Instant` and `DurationMinutes` are still branded and still catch a bare number **inside** a module.
**The `Interval` type has not become private** — `src/application` and `src/persistence` may import it,
because the rule is one-directional. What the ruling forecloses is `openingHours.ts` naming it.

**`domain-is-pure` enforces the ruling in its own text**, as `to: {}` rather than
`to: { pathNot: '^src/domain/' }` — the latter permits intra-domain imports *by construction*, a
standing exemption for exactly the class of import AC-6 forbids. Measured on the merged tree: plant
`src/domain/interval.ts → src/domain/duration.ts` and the cruise reports `domain-is-pure` by name;
restore `pathNot` with the same import in place and the cruise is **clean**. That mutant is a planted
control in `tests/architecture/layering.test.ts`.

## 5.3 Module dependency graph

**Generated, never hand-drawn** — a hand-drawn dependency graph is a claim, a generated one is a
fact:

```
npm run graph:modules      # Mermaid, from the real import graph
npm run lint:arch          # the same configuration, as a CI gate
```

**The render is not a collapsed five-box picture.** `--output-type mermaid` **ignores
`reporterOptions.archi.collapsePattern`**, so it emits one node per *file* inside directory subgraphs,
plus a subgraph for every `node_modules` package it reaches. The record is therefore split:

- **the fact** is `npm run lint:arch` — **every root covered, zero violations**, printed and CI-gated.
  That is what QS-10 rests on, a verdict rather than a number: it stays true as the tree grows and
  fails the build the day it stops being true;
- **the picture** is the presentation diagram, refreshed **once** in phase 6 rather than redrawn per
  slice. `npm run graph:modules` is the check against it — if it disagrees with §5.2's direction block,
  §5.2 is wrong;
- **§5.2's block above is a claim**, checked by the ruleset rather than by the render.

**No module count is stated here, deliberately**: nothing generates one, so a number written by hand
goes stale silently. The command prints the count, the roots and the coverage together:

```
npm run lint:arch          # e.g. "no layering violations. 54 module(s) cruised, every root covered: src, tests"
```

All five modules appear, `src/domain`'s three files as sibling nodes with **no edges between them** —
the literal AC-6 ruling made visible.

`.dependency-cruiser.js` carries thirteen rules. Six describe the layering above; the rest do the real
work:

| Rule | Forbids | Why it is not merely hygiene |
|---|---|---|
| `domain-is-pure` | `src/domain` → anything: any `src/` module, any npm package, any `node:` builtin | Makes GC-1 structural: a core that cannot import a database client cannot consult one |
| `sql-only-in-persistence` | `pg`, `kysely` outside `src/persistence` | Keeps SQLSTATE translation to one site |
| `http-must-not-reach-persistence` | `src/http` → `src/persistence` | No route issues SQL; every database access carries a span and the retry policy |
| `http-framework-only-in-the-edge` | `fastify`, `@fastify/*`, `@sinclair/typebox` outside `src/http` (and `main.ts`) | A use case stays callable without a server |
| `outside-in-tests-do-not-import-src` | `tests/{acceptance,contract,property,concurrency,architecture,performance,setup,support}` → `src/` | OC-5 made structural. The path hook cannot catch this, because the file being written is one the test-engineer legitimately owns. `setup` and `support` are in the list to close the indirect route — a `globalSetup` or spawn helper importing `src/` and handing it to a test that may not. `tests/unit/` and `tests/integration/` stay out, both legitimately importing `src/` |
| `no-circular`, `platform-is-a-leaf`, `persistence-must-not-look-upward`, `application-must-not-reach-http`, `not-to-unresolvable`, `no-dev-dep-in-src` | the remaining edges and the usual hygiene | A cycle means two modules are one module with a false boundary, which makes every rule above unenforceable in principle |

**The ruleset is verified to *fire*, not merely to parse** (QS-10). Two guards precede every assertion
about violations, both because the pair was measured passing over nothing:

- `summary.environment.issues` must be empty. Without a resolvable `typescript`, `dependency-cruiser`
  detects a TypeScript project, silently skips every source, and exits 0 with planted violations
  unreported;
- **every planted file must appear in `modules[]`** — per file in the fixture, per *root* in
  `lint:arch`. A count over the whole cruise is satisfied by `tests/` alone while `src/` goes
  unexamined behind a green gate, the same hole one level down.

`npm run lint:arch` is therefore `node tools/ci/lint-arch.mjs src tests`, not the bare CLI: the guard
has to live inside whatever produces the `pass`. **A cruise that exits 0 says nothing about what it
examined**, and that is not specific to `dependency-cruiser`.
