# 5. Building block view

> Owner: architect · Written: phase 2, corrected at each merge

Why this decomposition beat the alternatives is [ADR-0008](../adr/0008-module-decomposition.md); this is
what it *is*.

## 5.1 Level 1 — containers

![Containers and the modules inside the scheduler](../diagrams/building-blocks.svg)

*Source: [`diagrams/building-blocks.html`](../diagrams/building-blocks.html) · regenerate with `npm run diagram:export`*

| Container | Responsibility |
|---|---|
| **Stubbed client** | Not built: `docs/api/openapi.json` and `harness/` stand in for it (TC-5). The contract is *emitted* from the route schemas, so it cannot drift from the service |
| **Scheduler service** | The whole system: validate, allocate, persist, report. One Node process, five modules |
| **PostgreSQL** | The persistent store **and the enforcement point for the central invariant**. Not a generic persistence port — §4.1 says why calling it swappable would be a lie |
| **Telemetry collector** | Receives OTLP traces and metrics; `pino` writes JSON to stdout. A local `grafana/otel-lgtm` container, whose absence must not break the service |

No other neighbours (§3.1).

## 5.2 Level 2 — components

Five modules, one permitted dependency direction, a composition root. The direction is enforced, not
described — every forbidden edge is a rule in
[`.dependency-cruiser.js`](../../.dependency-cruiser.js) and a CI failure (§5.3).

```
  src/http/         ──▶  src/application/  ──▶  src/domain/
                                │
                                └──────────▶  src/persistence/  ──▶  src/domain/  (types)

  src/platform/     a leaf: importable by http · application · persistence, imports nothing from src/
  src/main.ts       composition root: the only module permitted to see every layer
```

| Module | Role |
|---|---|
| **`src/domain`** | The policy core: pure functions and types. **It imports nothing at all** — no other module, no npm package, no `node:` builtin — enforced absolutely by `domain-is-pure` with no allowlist. Its four files have zero imports between them, a ratified ruling whose price is §11.1 D-01-1 to D-01-4 |
| **`src/application`** | The five use cases plus `checkHealth`. Owns the retry loop and §8.4's span boundaries, and has no business rules of its own: every decision is delegated to `domain` or adjudicated by the database |
| **`src/persistence`** | Kysely over `pg`, plain `.sql` migrations. The only place SQL is written and the only place SQLSTATE is read |
| **`src/http`** | Fastify, TypeBox schemas, `application/problem+json`, the OpenAPI emitter. Maps a use-case outcome to a status code and nothing more; **may not import `src/persistence`**. `problem.ts` holds the taxonomy as one closed `as const` set, so a `type` outside §8.6 is a compile error |
| **`src/platform`** | Config, the `pino` logger, the OpenTelemetry bootstrap and §8.4's instruments. Importable by everyone, imports nothing from `src/` |
| **`src/main.ts`** | Reads config, starts telemetry, builds the pool and the server, listens, shuts the SDK down. The only place a dependency is *chosen* rather than received |

**One file per ambiguity, inside `src/domain`.** `interval.ts` owns `Instant`, `Interval` and
**`occupancyInterval` — "the interval the constraint sees"**, the identity today, which *is* the statement
that there is no buffer (A-4); `instant()` refuses anything outside ±8 640 000 000 000 000 ms, so an
`Instant` is renderable by construction. `duration.ts` owns `serviceDuration` and `durationMillis`, the
only place minutes become milliseconds (A-1). `openingHours.ts` owns `withinOpeningHours`, returning a
verdict union rather than a boolean, and is the only place that reasons in wall-clock time (GC-1, A-8).
`candidates.ts` owns `orderCandidates` — a seeded Fisher–Yates shuffle, uniform to ±1.7 % over 8 bays and
100 000 seeds — with `prune` and a total `nextCandidate`, a `CandidateOrder` being non-empty by
construction (A-10).

**Use cases return discriminated unions, not exceptions**, declared in `src/application` rather than
`src/http`, so every route `switch` is exhaustiveness-checked and every use case stays callable without a
server:

```ts
export type BookOutcome =
  | { kind: 'confirmed'; appointment: AppointmentView }
  | { kind: 'malformed-instant' }
  | { kind: 'outside-opening-hours'; verdict: OpeningHoursVerdict }
  | { kind: 'unknown-reference'; reference: 'dealership' | 'service-type' | 'customer' | 'vehicle' }
  | { kind: 'vehicle-not-owned' }
  | { kind: 'no-capacity'; resource: ContendedResource; attempts: number;
      exit: 'exhausted' | 'capped' }                          // minted in the 23P01 arm
  | { kind: 'no-verdict' }                                    // 40P01 — ADR-0018
  | { kind: 'reference-data-invalid'; detail: string };
```

`resource` is a `ContendedResource`, mintable only by `pgError.classify`, so a capacity refusal cannot be
constructed without a value PostgreSQL produced (ADR-0016). **One attempt is one transaction**: two
advisory-lock acquisitions, then one write, so `db.transaction()` sits inside the loop body and nowhere
outside it. Both write paths share one `attemptLoop.ts` — instrumented once, with one site able to
increment the conflict counter. **There is no repository port**; the dependency on `src/persistence` is
concrete, a decision rather than an omission.

**Inside `src/persistence`, one file may name the table.** `pgError.ts` is the single translation from a
PostgreSQL error to a domain outcome — `23P01` → conflict with the resource its constraint names, `23503`
→ bad reference, `40P01` → no verdict, anything else → a `500` — and it is **total over `unknown` and
duck-typed** rather than narrowed by `instanceof`, since narrowing on a driver class would make
classification depend on which copy of `pg` built the error. `appointmentRepository.ts` holds
`lockResources` (`pg_advisory_xact_lock` over every resource the write is in flight against, one
statement, deduplicated, ordered by `(class, hashtext(key))`), `lockAppointmentRow`, the unguarded
`INSERT`, read-by-id, the guarded `UPDATE`, `cancelAppointmentById` — one unconditional status `UPDATE`
taking **no lock**, a cancelled row satisfying no constraint's `WHERE` — and `busyResources`, the advisory
read. `lockResources` returns a branded `ResourceLock`: both locking writes require one and the exempt
write does not ask. Nothing here catches; the error goes up to the one classifier.
`candidateRepository.ts` reads reference data only and cannot consult `appointment`.

## 5.3 Module dependency graph

**Generated, never hand-drawn**: a hand-drawn dependency graph is a claim, a generated one a fact.

```
npm run graph:modules      # Mermaid, from the real import graph
npm run lint:arch          # the same configuration, as a CI gate
                           # "no layering violations. N module(s) cruised, every root covered: src, tests"
```

`.dependency-cruiser.js` carries fourteen rules. Six describe the layering; these do the real work:

| Rule | Forbids | Why it is not merely hygiene |
|---|---|---|
| `domain-is-pure` | `src/domain` → anything at all | A core that cannot import a database client cannot consult one |
| `sql-only-in-persistence` | `pg`, `kysely` outside `src/persistence` | SQLSTATE translation stays at one site |
| `http-must-not-reach-persistence` | `src/http` → `src/persistence` | No route issues SQL: every database access carries a span and the retry policy |
| `http-framework-only-in-the-edge` | `fastify`, `@fastify/*`, `@sinclair/typebox` outside `src/http` and `main.ts` | A use case stays callable without a server |
| `otel-sdk-only-in-platform` | `@opentelemetry/sdk-*` and its exporters outside `src/platform` and `main.ts` | The SDK is a composition-root concern. `@opentelemetry/api` stays importable anywhere, because §8.4's window *is* the gap between two span boundaries and a wrapper would place them at one remove |
| `outside-in-tests-do-not-import-src` | the seven outside-in test directories, plus `setup` and `support`, → `src/` | OC-5 made structural — the path hook cannot catch a file the test-engineer legitimately owns |
| `no-circular` and six others | the remaining edges | A cycle means two modules are one with a false boundary, making every rule above unenforceable in principle |

**The ruleset is verified to *fire*, not merely to parse** (QS-10), because a cruise that exits 0 says
nothing about what it examined: without a resolvable `typescript`, `dependency-cruiser` silently skips
every source and exits 0 with planted violations unreported, and a module count over the whole cruise is
satisfied by `tests/` alone while `src/` goes unexamined. So two guards precede every assertion about
violations — `summary.environment.issues` must be empty, and every planted file must appear in
`modules[]`, per *root* — and **a new forbidden rule arrives with its plant or it does not arrive**. That
is why `npm run lint:arch` is `node tools/ci/lint-arch.mjs src tests` rather than the bare CLI: the guard
must live inside whatever produces the `pass`.
