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
| **PostgreSQL** | The persistent store **and the enforcement point for the central invariant** | Not a generic persistence port; §4.1 says why calling it swappable would be a lie, and `CLAUDE.md` §2.2 why no test may substitute it |
| **Telemetry collector** | Receives OTLP traces and metrics; `pino` writes JSON to stdout | A local `grafana/otel-lgtm` container (§7). Its absence must not break the service |

No other neighbours; §3.1.2 argues that omission.

## 5.2 Level 2 — components

Whitebox of the scheduler service: five modules, one permitted dependency direction, a composition
root. The direction is enforced, not described — every forbidden edge below is a rule in
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

| Module | Owns | The §1.4 ambiguity it absorbs |
|---|---|---|
| `interval.ts` *(built)* | The `Instant` and `Interval` types, `instant(epochMillis)`, `appointmentInterval(startsAt, durationMillis)`, and **`occupancyInterval(interval)` — "the interval the constraint sees"**. `instant()` refuses anything outside ±8 640 000 000 000 000 ms, so an `Instant` is renderable by construction (ADR-0014) | **A-4.** `occupancyInterval` is the identity today, which is the statement that there is no buffer. A buffer changes this function and the constraint's range expression, nothing else |
| `duration.ts` *(built)* | The `DurationMinutes` type, `serviceDuration(serviceType)`, `durationMillis(duration)` — the only place minutes become milliseconds | **A-1.** If duration varies by vehicle this function gains a parameter; the interval arithmetic above it takes a number and does not change |
| `openingHours.ts` *(built)* | `withinOpeningHours(startsAtMillis, endsAtMillis, ianaZone, weekly)`, returning the `OpeningHoursVerdict` union rather than a boolean. It carries the same epoch bound (ADR-0014) and normalises an end rendering as local `00:00:00` on the next date to 86 400 seconds-of-day (ADR-0015) | **ADR-0001 / GC-1.** The only place that reasons in wall-clock time (A-8). Breaks, holidays and one-off closures land here |
| `candidates.ts` *(built)* | `orderCandidates(bays, technicians, seed)` and `prune(order, resource, id)` return `CandidateOrder \| null`, `null` *being* a list emptied; `nextCandidate(order)` is total, a `CandidateOrder` being **non-empty by construction** — both lists are `readonly [string, ...string[]]`, since a brand on the object leaves `noUncheckedIndexedAccess` in place and would merely *relocate* the assertion (I-04-3) | **A-10 / ADR-0009.** Seeded Fisher–Yates, pure and importing nothing. `prune` takes the **unbranded** union, to which a `ContendedResource` is assignable: no cast in, none out |

### `src/application` — the use cases

`bookAppointment`, `readAppointment`, `rescheduleAppointment`, `cancelAppointment`,
`queryAvailability`. It owns the ADR-0004 retry loop and the span boundaries of §8.4, and has no
business rules of its own: every decision is delegated to `domain` or adjudicated by the database. `deriveInterval.ts` is §6.2 steps 3–4's composition order as
a pure function — no handle, no clock — so what the literal AC-6 ruling took from the type system
(D-01-1) is held by a module Stryker can mutate without a container.

Use cases return **discriminated unions, not exceptions**:

```ts
export type BookOutcome =
  | { kind: 'confirmed'; appointment: AppointmentView }
  | { kind: 'malformed-instant' }
  | { kind: 'outside-opening-hours'; verdict: OpeningHoursVerdict }
  | { kind: 'unknown-reference'; reference: 'dealership' | 'service-type' | 'customer' | 'vehicle' }
  | { kind: 'vehicle-not-owned' }
  | { kind: 'no-capacity'; resource: ContendedResource; attempts: number;
      exit: 'exhausted' | 'capped' }                          // ADR-0020
  | { kind: 'no-verdict' }                                    // 40P01 — ADR-0018
  | { kind: 'reference-data-invalid'; detail: string };
```

`resource` is `ContendedResource`, a brand mintable only by `pgError.classify`, so neither refusal can
be constructed without a value PostgreSQL produced (ADR-0016; ADR-0020 keeps the cap's exit inside the
`23P01` arm). The last two are the system's fault rather than the client's and render as one §8.6 row,
staying apart so the `switch` and the log line can name them apart.

**One attempt is one transaction: ADR-0018's two advisory-lock acquisitions, then one `INSERT`**, so
`db.transaction()` sits inside the loop body and nowhere outside it (§6.1). Pruning is **per resource
value**, bounding the loop at `|bays| + |technicians| − 1` rather than their product; the loop header
carries it, so the cap is stated once, in the arm (ADR-0020).

**No repository port; the dependency on `src/persistence` is concrete** — a decision, not an omission:
[ADR-0008](../adr/0008-module-decomposition.md) argues it, §8.5 costs it.

### `src/persistence` — SQL, and the only place SQLSTATE is read

Kysely over `pg` (ADR-0006), plain `.sql` migrations (ADR-0007). `pg` and `kysely` are importable
here and nowhere else, so there is exactly one translation from a PostgreSQL error to a domain
outcome:

```ts
// src/persistence/pgError.ts — the single site
export type PgOutcome =
  | { kind: 'conflict'; resource: ContendedResource; constraint: string }  // 23P01
  | { kind: 'bad-reference'; constraint: string }                          // 23503
  | { kind: 'no-verdict' }                                                 // 40P01, ADR-0018
  | { kind: 'other'; cause: unknown };
```

`classify` is **total over `unknown`, and duck-typed** rather than narrowed by `instanceof`: it is
handed whatever a `catch` caught, and narrowing on a driver class would make classification depend on
which copy of `pg` constructed the error. Its constraint-name map has no default arm, so an
unrecognised `23P01` name is `other` and becomes a `500` (§11.2 R-3).

`sql-only-in-persistence` makes a second translation site a CI failure; §11 R-3 carries what one would
break.

| Module | Owns |
|---|---|
| `db.ts` | The Kysely instance and the `pg` pool |
| `schema.ts` | The `Database` interface, derived from the migrations |
| `pgError.ts` | SQLSTATE → `PgOutcome`, and the constraint-name → resource mapping |
| `appointmentRepository.ts` | The **only** module permitted to name the table: `lockResources` (`pg_advisory_xact_lock` over **every resource the write is in flight against** — for a move, two pairs; one statement, deduplicated, ordered by `(class, hashtext(key))`: ADR-0018, ADR-0030), `lockAppointmentRow` (that vacated pair, re-read inside the attempt's own transaction under the row's lock — ADR-0031), the unguarded `INSERT` and read-by-id (booking), the guarded `UPDATE` (move, ADR-0003), and `cancelAppointmentById` — one unconditional status `UPDATE` that takes **no lock**, ADR-0023, because a cancelled row satisfies no constraint's `WHERE`. **F-05-1 is closed by ADR-0026**: `lockResources` returns a branded `ResourceLock`, both locking writes require one and the exempt write does not ask. §11 carries the residue. Nothing here catches — the error goes up to the one classifier |
| `candidateRepository.ts` | The **advisory** free-bay and free-qualified-technician read (A-3, A-9) |
| `referenceRepository.ts` | Dealership, its IANA zone and weekly opening hours; service type and its duration |
| `migrations/*.sql` | The schema, including the two exclusion constraints verbatim (§8.2) |

### `src/http` — the edge

Fastify, TypeBox schemas, RFC 9457 `application/problem+json`, and the OpenAPI emitter (ADR-0005).
It maps a use-case outcome to a status code and nothing more, and **may not import
`src/persistence`** — §5.3's table says what that rule buys. `problem.ts` holds the whole taxonomy as
one closed `as const` set, so a `type` outside §8.6 is a compile error at the call site.

### `src/platform` — the leaf

Config (`BOOKING_ATTEMPT_CAP` 16, `BOOKING_SEED` unset — ADR-0009, ADR-0021, ADR-0022), the `pino` logger, the OpenTelemetry bootstrap and the
metric registry. Importable by everyone, imports nothing from `src/`. Its junk-drawer risk is §11 R-7c's.

**ADR-0021 asks `loadConfig` for a startup `warn`, and it cannot emit one**: the logger is built *from*
its return value, so emitting here would be the leaf acquiring the behaviour the rule above keeps out.
It ships as `configWarnings(config)`, a pure function whose strings `main.ts` emits through `pino` —
directly assertable. ADR-0021 stands unsuperseded; only its emitting site was misstated (I-04-11).

### `src/main.ts` — the composition root

Reads config, emits `configWarnings` through the logger it has just built, starts telemetry, builds the
pool, builds the server, listens. The only module allowed to see every layer, and the only place a
dependency is chosen rather than received.

### As built

| Module | Contents |
|---|---|
| `src/domain` | `interval.ts`, `duration.ts`, `openingHours.ts`, `candidates.ts` — four files, **zero import statements between them**. **`appointment.ts` is retired, not deferred** (ADR-0025 decision 6): transition legality is a database verdict on ADR-0016's ground, so a module holding one allowlist whose only consumer is a SQL predicate relocates a literal. §11 carries the residue. **`candidates.ts` ships with two brand casts where the design predicted three, and no index assertion at all** (I-04-13): destructuring head from tail *is* the emptiness test and *builds* the tuple, so guard and cast collapse into one reachable branch. Fisher–Yates is in **selection** form rather than the in-place swap, because the swap needs the two `noUncheckedIndexedAccess` assertions the tuple carrier was chosen to remove. Uniform to ±1.7 % over 8 bays and 100 000 seeds |
| `src/application` | `bookAppointment.ts` (the loop, `BookOutcome`, and `AppointmentView` — the one body shape the `201` and the `200` share), `deriveInterval.ts`, `readAppointment.ts`, `cancelAppointment.ts`, `rescheduleAppointment.ts`, `checkHealth.ts`. The move runs a **second** copy of the attempt loop, starting on the pair the row already holds (ADR-0027); F-06-1 defers extraction to slice 09, which reopens both. `CancelOutcome` is its own union though structurally identical to `ReadOutcome` today: sharing them would let a member added for one route change the other's exhaustiveness check. Each outcome union is declared *here* and not in `src/http`, so every route `switch` is exhaustiveness-checked and every use case stays callable without a server |
| `src/persistence` | `db.ts` (the `Db` alias and the pool), `appointmentRepository.ts`, `candidateRepository.ts` and `referenceRepository.ts` (both reference-data reads only — neither can see `appointment`), `pgError.ts`, `health.ts` (`pingDatabase`, returning a boolean rather than rethrowing a driver error), `schema.ts`, `migrations/` |
| `src/http` | `server.ts`, `problem.ts`, `routes/appointments.ts`, `routes/health.ts`. `buildServer` takes already-bound use cases, never a handle |
| `src/platform` | `config.ts`, `logger.ts`. Telemetry is slice 09's; an empty OTel bootstrap now would be the junk drawer above |
| `src/main.ts` | Composition root, signals, listen |

**The booking path names no table outside `appointmentRepository.ts`**, asserted by set equality
rather than described (§10.2 QS-12). Check-then-act is absent because there is nowhere else that
could read: `candidateRepository.ts` answers *which bays and technicians this dealership has for this
service type* from reference data, and cannot consult a booking.

**The ruleset forecloses every shape that *names* the database handle, and partial application is the
shape taken rather than the shape left.** `sql-only-in-persistence`,
`http-must-not-reach-persistence` and `tsPreCompilationDeps: true` all forbid *naming* it — and a
generic parameter evades all three by declining to:
`interface GenericDeps<TDb> { db: TDb }` compiles and cruises clean. Partial application costs nothing
to prefer, because the generic alternative buys the edge a value it cannot type, cannot use and must
not touch. *"No other shape compiles"* would be a claim the tooling does not support, and the next
person to find the escape hatch would conclude the rule was decorative.

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
`to: { pathNot: '^src/domain/' }`: the latter would permit intra-domain imports *by construction*.
Measured — plant `interval.ts → duration.ts` and the cruise names `domain-is-pure`; restore `pathNot`
and the same import cruises **clean**. `tests/architecture/layering.test.ts` plants that mutant as a
control.

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

- **the fact** is `npm run lint:arch` — **every root covered, zero violations**, printed and CI-gated,
  and a verdict rather than a number is what QS-10 rests on;
- **the picture** is the presentation diagram, refreshed **once** in phase 6 rather than redrawn per
  slice. `npm run graph:modules` is the check against it — if it disagrees with §5.2's direction block,
  §5.2 is wrong;
- **§5.2's block above is a claim**, checked by the ruleset rather than by the render.

**No module count is stated here**: nothing generates one, so a hand-written number goes stale
silently. The command prints count, roots and coverage together:

```
npm run lint:arch          # "no layering violations. N module(s) cruised, every root covered: src, tests"
```

All five modules appear, `src/domain`'s four files as sibling nodes with **no edges between them** —
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
