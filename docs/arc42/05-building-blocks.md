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
| **Scheduler service** | The whole system: validate, allocate, persist, report | One Node process. Five internal modules, §5.2 |
| **PostgreSQL** | The persistent store **and the enforcement point for the central invariant** | Not a generic persistence port. §2.1 forbids substituting it in any test that asserts a persistence invariant, and §4.1 explains why calling it swappable would be a lie |
| **Telemetry collector** | Receives OTLP traces and metrics; `pino` writes JSON to stdout | A local `grafana/otel-lgtm` container (§7). Its absence must not break the service |

There are no other neighbours, and §3.1.2 argues that omission rather than leaving it as one.

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
reintroduces check-then-act. A module that cannot import a database client cannot consult one. The
prohibition stops being a promise and becomes a build failure.

| Module | Owns | The §1.4 ambiguity it absorbs |
|---|---|---|
| `interval.ts` *(built, 01)* | The `Instant` and `Interval` types, `instant(epochMillis)`, `appointmentInterval(startsAt, durationMillis)`, and **`occupancyInterval(interval)` — "the interval the constraint sees"** | **A-4.** Today `occupancyInterval` is the identity, which is the statement that there is no buffer. A buffer changes this function and the constraint's range expression, and nothing else |
| `duration.ts` *(built, 01)* | The `DurationMinutes` type, `serviceDuration(serviceType)`, and `durationMillis(duration)` — the only place in the system where minutes become milliseconds | **A-1.** If duration varies by vehicle this function gains a parameter; the interval arithmetic above it does not change, because it takes a number |
| `openingHours.ts` *(built, 01)* | `withinOpeningHours(startsAtMillis, endsAtMillis, ianaZone, weekly)`, returning the `OpeningHoursVerdict` union rather than a boolean | **ADR-0001 / GC-1.** The only place in the system that reasons in wall-clock time (A-8). Breaks, holidays and one-off closures land here |
| `candidates.ts` *(not built; slice 04)* | `orderCandidates(set, seed)`, `nextCandidate(set)`, `prune(set, resource, id)` | **A-10 / ADR-0009.** Ordering, the pruning rule and the attempt cap's arithmetic. Pure and seeded, so a failing interleaving is reproducible |
| `appointment.ts` *(not built; slice 05)* | The status model: `confirmed`/`cancelled`, and which transitions are legal | **ADR-0003.** Cancellation is terminal and idempotent; only a confirmed appointment may be moved |

The three built signatures are as-built at slice 01 and take **primitives, not domain types**. That is
not a simplification: it is the consequence of the human's ruling that AC-6 is literal, and *"As built
at slice 01"* below is where it is argued rather than merely recorded.

`occupancyInterval` deserves its name. A-4 is flagged in §1.4 as *"the assumption most likely to be
wrong in a real dealership"*, and the thing it moves is not the customer-facing appointment but the
span the exclusion constraint compares. Keeping those two ideas distinct while they happen to be
equal is the difference between a one-function change and an archaeology exercise.

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

so that §8.6's status mapping is an exhaustive `switch` the compiler checks. A new outcome cannot be
added without the HTTP layer failing to compile, which is the cheapest possible way to stop a domain
failure silently rendering as a `500`.

**This layer depends on `src/persistence` concretely. There is no repository port**, and that is a
decision rather than an omission — [ADR-0008](../adr/0008-module-decomposition.md) argues it at length. The short form: a port that can be
implemented in memory is a port whose implementation cannot hold this system's invariant, and offering
the socket invites the substitution `CLAUDE.md` §2.2 bans. The cost is that **a use case cannot be
unit-tested against a substitute repository**, because there is no socket to plug one into.

*As built at 00a, that cost is narrower than this section first claimed.* The phase-2 wording was
*"use cases are not unit-testable without Docker — the unit-testable surface is `src/domain`"*, and
`checkHealth` falsifies it: it is unit-tested with no container, against a Kysely instance whose
**driver** is replaced and whose dialect is the real one. Removing the port forecloses substituting
the *repository*; it does not foreclose substituting the *transport* underneath it. §8.5 draws the
line that keeps §2.2 intact, and it is not this one.

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

A second translation site is the classic way a `409` comes to mean two different things, and the way
`err.constraint` gets preserved on one path and dropped on another — which would break both the
`booking_conflicts_total{resource}` label and ADR-0009's pruning. The rule
`sql-only-in-persistence` makes adding one a CI failure.

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

### As built at slice 00a — the walking skeleton

Five module directories exist; four of them have contents. `GET /health` was chosen precisely because
it crosses every one of them, since a skeleton whose single route short-circuits the layering proves
nothing about the layering.

| Module | As built | Note |
|---|---|---|
| `src/domain` | **empty** (`.gitkeep`) | There is no domain logic in a health probe, and a placeholder would trip `no-orphans` — a permanent warning is a warning nobody reads. It fills at slice 01 |
| `src/application` | `checkHealth.ts` | `HealthOutcome` — the first discriminated union, declared *here* and not in `src/http`, so the route's `switch` is exhaustiveness-checked and the use case stays callable without a server |
| `src/persistence` | `db.ts` (the `Db` alias and the pool), `health.ts` (`pingDatabase`, which never rethrows a driver error), `schema.ts` (an empty `Database` interface), `migrations/` | `pingDatabase` returning a boolean rather than throwing is what lets the outcome union stay the only vocabulary above it |
| `src/http` | `server.ts`, `routes/health.ts` | `buildServer` takes already-bound use cases, never a handle |
| `src/platform` | `config.ts`, `logger.ts` | Telemetry is slice 09's; an empty OTel bootstrap now would be the junk drawer this section warns about |
| `src/main.ts` | composition root, signals, listen | The only module that sees every layer |

**One claim was narrowed while it was being built, and the narrowed form is the one that is true.**
The design first said partial application was *"the only shape left"* once the ruleset forbids the
edge. It is not. `sql-only-in-persistence` forbids naming `Kysely` outside persistence and
`http-must-not-reach-persistence` forbids naming `Db` — under `tsPreCompilationDeps: true` that
catches `import type` as well, which is the point of the flag. But a **generic parameter evades both
by declining to name the handle at all**: `interface GenericDeps<TDb> { db: TDb }` compiles and cruises
clean. So the honest claim is that **the ruleset forecloses every shape that *names* the handle**, and
partial application is the shape *taken* rather than the shape *left*. It costs nothing to prefer: the
generic alternative buys the edge a value it cannot type, cannot use and must not touch.

The distinction matters beyond wording. "No other shape compiles" would have been a claim about the
tooling that the tooling does not support, and the next person to need an escape hatch would have
found one and concluded the rule was decorative.

### As built at slice 01 — the domain fills, and nothing crosses inside it

`src/domain` stopped being empty. Three files, 279 lines, **zero import statements between them**.

**The ruling this section is the record of.** §5.2 above has said since phase 2 that the core
*"imports nothing at all … with no allowlist"*. Slice 01's step-1 design read that as prohibiting
imports *out of* the domain and proposed amending the line so `interval.ts` could import
`duration.ts`. **The human ruled AC-6 literal: nothing at all includes each other.** The line is
therefore ratified rather than corrected, and the proposal to amend it was withdrawn — the argument
for it rested on a claim ("the two readings are jointly unsatisfiable") that was false.

**What the ruling changed, in the code that merged.**

| | As designed at step 1 | As built |
|---|---|---|
| `appointmentInterval` | `(startsAt: Instant, minutes: DurationMinutes)` — the brand crosses the module boundary | `(startsAt: Instant, durationMillis: number)` — a bare millisecond count; the caller converts first |
| `withinOpeningHours` | `(interval: Interval, ianaZone, weekly)` | `(startsAtMillis: number, endsAtMillis: number, ianaZone: string, weekly: WeeklyOpeningHours)` — four bare parameters |
| Its result | a boolean | `OpeningHoursVerdict`, a seven-variant discriminated union |
| Ordered, non-`NaN` endpoints | guaranteed by the `Interval` type | asserted at runtime, first, as verdict `malformed-interval` |
| The composition `serviceDuration → durationMillis → appointmentInterval → withinOpeningHours` | enforced by the brands: you could not call the third without having called the first two | written out by a use case in `src/application`; still correct, correct because someone wrote it correctly |

`Instant` and `DurationMinutes` still exist and are still branded, and the brands still catch a bare
number **inside** a module. They no longer catch anything **between** modules, which is the boundary
they were introduced for — [§11](11-risks-technical-debt.md) carries that as D-01-2 and cites the case
where it has already cashed in.

**The `Interval` type has not become private.** It crosses out of the domain freely — `src/application`
and `src/persistence` may import it, and the rule is one-directional. What the ruling forecloses is
`openingHours.ts` naming it, which is why the endpoints arrive as numbers.

**The rule now enforces the ruling, which it did not when the ruling was made.** `domain-is-pure` was
written `from: '^src/domain/'`, `to: { pathNot: '^src/domain/' }` — a shape that permits intra-domain
imports *by construction*, and therefore a standing exemption for exactly the class of import AC-6 had
just forbidden. It is now `to: {}`: every dependency matches, so the rule reads "imports nothing" in
its own text rather than only in today's tree. Measured, on the merged tree — plant
`src/domain/interval.ts → src/domain/duration.ts` and the cruise reports `domain-is-pure` by name over
54 modules; restore `pathNot` with the same import in place and the cruise is **clean** at 91
dependencies. That mutant is planted as a control in `tests/architecture/layering.test.ts`, so §5.3's
claim below — a ruleset that has never rejected anything is not evidence — now has two instances
behind it rather than one, and the second is the one that would have been easiest to leave unguarded.

## 5.3 Module dependency graph

**Generated, never hand-drawn** — a hand-drawn dependency graph is a claim, a generated one is a
fact:

```
npm run graph:modules      # Mermaid, from the real import graph
npm run lint:arch          # the same configuration, as a CI gate
```

The graph is rendered here from the first implementation slice onward; until `src/` exists there is
nothing to draw, and drawing the intended graph by hand would be exactly the claim this subsection
exists to avoid making.

**The first render happened at slice 00a, and it does not look like what this subsection promised.**
Measured: `--output-type mermaid` **ignores `reporterOptions.archi.collapsePattern`**, so the render
is one node per *file* inside directory subgraphs, plus a subgraph for every `node_modules` package it
reaches — seventeen subgraphs, of which twelve are dependencies. The collapsed five-box picture this
section assumed the tool would produce is not an output it offers.

So the as-built record is deliberately split, and the split is the honest one:

- **the fact** is `npm run lint:arch` — **every root covered, zero violations**, which it prints and
  CI gates. *That* is what QS-10 rests on, and it is a verdict rather than a number: it stays true as
  the tree grows, and it fails the build the day it stops being true;
- **the picture** is the presentation diagram, refreshed **once** in phase 6 rather than redrawn per
  slice. `npm run graph:modules` remains the check against it — run it, eyeball it, and if it
  disagrees with §5.2's direction block, §5.2 is wrong;
- **§5.2's block above is a claim**, labelled as one. It is checked by the ruleset, not by the render.

**The module count is not in that verdict, and this paragraph is where a stale number was found.**
Until slice 01 this subsection asserted "40 modules cruised", written at 00a; at `f661988` the same
command reports 54. Nothing regenerated the prose and nothing gates it, so it drifted silently for two
slices and was caught by reading arc42 against the tree rather than by a check. The number is
therefore no longer stated as the fact. If one is wanted, **run the command** — it prints the count,
the roots and the coverage together:

```
npm run lint:arch          # e.g. "no layering violations. 54 module(s) cruised, every root covered: src, tests"
```

Said plainly, because the alternative is a mechanism claim nobody has run: `tools/docs/build.mjs`
generates only §9's ADR index and §11's debt register, so **there is no generator that could keep a
module count in this file current**, and adding one is tooling rather than architecture. What keeps
this subsection true now is that it no longer contains a number to go stale.

At 00a four of the five modules appeared, because `src/domain` shipped empty (§5.2) — the step-1
prediction of "four modules" held in substance and not literally. **From slice 01 all five appear**:
`src/domain` fills with `duration.ts`, `interval.ts` and `openingHours.ts`, and they appear as three
sibling nodes inside the `src/domain` subgraph with **no edges between them**, which is the literal
AC-6 ruling visible in the render.

`.dependency-cruiser.js` carries thirteen rules. Six describe the layering above; the rest are the
ones that do the real work:

| Rule | Forbids | Why it is not merely hygiene |
|---|---|---|
| `domain-is-pure` | `src/domain` → anything: any `src/` module, any npm package, any `node:` builtin | Makes GC-1 structural. The policy core cannot perform I/O, so it cannot consult the database |
| `sql-only-in-persistence` | `pg`, `kysely` outside `src/persistence` | One SQLSTATE translation site, so `409` cannot come to mean two things and `err.constraint` cannot be dropped on one path |
| `http-must-not-reach-persistence` | `src/http` → `src/persistence` | No route issues SQL; every database access carries a span and the retry policy |
| `http-framework-only-in-the-edge` | `fastify`, `@fastify/*`, `@sinclair/typebox` outside `src/http` (and `main.ts`) | A use case stays callable without a server |
| `outside-in-tests-do-not-import-src` | `tests/{acceptance,contract,property,concurrency,architecture,performance,setup,support}` → `src/` | OC-5 and METHODOLOGY P4 made structural. The path hook cannot catch this, because the file being written is one the test-engineer legitimately owns. **Widened at 00a** from four directories to eight: `architecture` and `performance` make the Gate B ownership ruling structural rather than documentary, and `setup`/`support` close the loophole where a `globalSetup` or a spawn helper imports `src/` and hands it to a test that may not. `tests/unit/` and `tests/integration/` stay out — both legitimately import `src/` |
| `no-circular`, `platform-is-a-leaf`, `persistence-must-not-look-upward`, `application-must-not-reach-http`, `not-to-unresolvable`, `no-dev-dep-in-src` | the remaining edges and the usual hygiene | A cycle means two modules are one module with a false boundary, which makes every rule above unenforceable in principle |

The ruleset was verified to *fire*, not merely to parse, before it was committed: a fixture tree
breaking every rule reports each one by name, and a conforming tree shaped like this section reports
zero. QS-10 keeps that true.

**At 00a that verification became a committed test, and twice it caught the ruleset reporting a green
it had not earned.** `tests/architecture/layering.test.ts` builds the fixture in a temp directory,
plants one violation per file so every assertion names one rule, and runs a conforming negative
control. Two guards precede every assertion about violations, and both exist because the pair was
measured passing over nothing:

- `summary.environment.issues` must be empty. Without a resolvable `typescript`, `dependency-cruiser`
  detects a TypeScript project, silently skips every source, and exits 0 with four planted violations
  unreported;
- **every planted file must appear in `modules[]`** — per file in the fixture, per *root* in
  `lint:arch`. A count over the whole cruise is satisfied by `tests/` alone while `src/` goes
  unexamined behind a green gate, which is the same hole one level down.

`npm run lint:arch` is therefore `node tools/ci/lint-arch.mjs src tests`, not the bare CLI: the guard
has to live inside whatever produces the `pass` that criterion C4 reads. **A cruise that exits 0 says
nothing about what it examined** — every assertion about violations must be preceded by one about
coverage. That rule cost this slice three findings to learn and it is not specific to
`dependency-cruiser`.
