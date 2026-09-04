# Slice 00a — design

> Step 1 of the slice loop. Author: architect. Reviewed at step 2 by the test-engineer and the
> implementer, who may object; built against at steps 3 and 4.
>
> Slice: [`00a-walking-skeleton.md`](00a-walking-skeleton.md) · arc42 scope declared by the slice:
> **§5.2 · §5.3 · §7.1 · §7.2 · §7.4 · §8.5 · §11.2** · quality scenarios: **QS-10** · ADRs in
> force: 0005, 0006, 0007, 0008, 0010.
>
> **Amended at step 2 on 2026-09-04**, after both reviewers objected, and again before step 3 when a
> self-raised finding (**S-1**) showed the design had worked around a NON-NEGOTIABLE. Every ruling is
> applied in the body — this is one current document, not a design plus a thread of corrections.

This design settles *shape*. It does not restate the acceptance criteria and it may not change them
(`CLAUDE.md` §6): AC-1 to AC-6 are the human's.

Read §0 first: it is the audit trail, and S-1 in it is the most consequential entry. Then §11, which
is what still needs watching.

---

## 0. Step 2 rulings

Both the test-engineer and the implementer returned **OBJECT**. One round of discussion was convened
per `CLAUDE.md` §6; these are the rulings. **S-1 is the architect's own, raised after step 2** when a
fact discovered while preparing step 3 exposed a defect neither reviewer had found; the **step-3
findings** below were ruled after the red commit was observed in CI. Four of the five carried **measurement or file-level
evidence rather than argument** — a role built the thing this design specified, ran it, and reported
what happened. That is the standard the rest of this slice should be held to.

| # | Objection | Outcome | Reasoning, in one line |
|---|---|---|---|
| **O1** | test-engineer — the AC-4 fixture, built exactly to §5, cruises 0 modules and reports 0 violations at exit 0 | **(c) design defect** | Named failure: **AC-4** (*"each violation is reported by name"* — measured at zero) and **QS-10** items 3–4; the same mode would let `lint:arch` report a clean layering having checked nothing, and C4 reads that record |
| **O2** | test-engineer — no acceptance test can start the service: no entrypoint, no loader, `tests/support/` unowned, `scripts` unassigned | **(a) clarification** | The design was silent rather than wrong; nothing is retracted, a decision is added. AC-1 and AC-2 were unbuildable without it |
| **O3** | test-engineer — the step-1 draft's reason for implementer-authored tool tests is factually wrong: `test:tools` is a literal `&&` chain, not a glob | **(a) clarification** | Conceded outright. The stated reason was false, so the ownership conclusion it supported does not survive it; all three tool tests become test-engineer-authored |
| **O-1** | implementer — `red-proof`'s red zone makes slices 07 and 11 structurally unable to pass | **(d) escalated → ruled by the human** | Finding correct and the defect is this design's, not AC-6's. The reading of AC-6 was escalated because under the literal reading the fix requires changing an acceptance criterion. **The human ruled BROAD on 2026-09-04** |
| **O-2** | implementer — §6's three `collect-ci.mjs` constraints are right but not sufficient; two more are load-bearing | **(a) clarification** | Both verified. (c) is deliberately **not** available: AC-5 says nothing about ordering or timestamps and C1 is a process criterion, not a §10 scenario — the rule says (a) however severe the consequence |
| **S-1** | **architect, self-raised** after step 2 — this design worked around `CLAUDE.md` §2.4, a NON-NEGOTIABLE, and called the result a paradox | **(c) design defect** | 00a's red would never have been observed in CI. The suite is wired into the red commit's own CI job instead (§7); the evidence list collapses from five substitutes to four items with the observation first |

### Step 3 findings, ruled 2026-09-04

The red commit landed and **CI observed the red**: `docs, tools and log integrity` success,
`suite (Testcontainers)` failure, three `AssertionError`s inside collected test bodies, 14 passing —
read from the run's own `test-results` artifact rather than from narration. §7's prediction table
matched exactly, which is what a prediction is for. Per-project `globalSetup` is honoured, so the
fallback §4 told the test-engineer to raise rather than improvise is not needed.

The test-engineer returned nine findings. Four needed a ruling before the implementer started, and
all four are defects in this design, found before anything was built against them.

| # | Finding | Outcome | Reasoning, in one line |
|---|---|---|---|
| **F2** | The `lint:arch` guard counts modules **overall**, so `tests/` alone keeps the count non-zero while the source root goes unexamined | **AGREE**, remedy refined | **O1's failure mode reintroduced inside O1's own remedy.** Per-**root** non-emptiness — but roots taken from argv rather than hardcoded, and **one** cruise, because `outside-in-tests-do-not-import-src` only fires when both roots share a graph (§5) |
| **F1** | §7's predicted *mechanism* for AC-3's red was wrong: §4's `mkdirSync` creates the source root, so `depcruise` can open it | **AGREE** | Two mechanisms in this design cancelled each other. The test-engineer's fix — assert coverage, which QS-10 item 5 already demands — stands; §4 and §7 both carried a false explanation and are corrected |
| **F6** | §6 exported only a single-run mapper, but constraint 4 is a property of a **list** | **AGREE** | A constraint imposed in one place and enforced in another that no test reaches. `toCheckRunRecords` added, with the ordering/idempotence division written down (§6) |
| **F7** | `engines.node` is looser than the dependency tree supports | **AGREE**, and wrong twice | 22.11–22.21 passes the declared floor then fails `npm ci --engine-strict`; and **23.x** satisfies the declared range while `vitest` and `dependency-cruiser` both exclude it. arc42 §7.1 records the numbers as the architect's Gate B choice, so the correction is the architect's (§11.3) |

**F4, for information and acted on anyway.** `npm i -D typescript` now resolves to **7.0.2**, outside
`dependency-cruiser@18.2.0`'s supported compiler range — and that range lives in the package's own
`meta.cjs`, **not** in `peerDependencies`, so nothing warns at install time. The exact pin is the only
preventive control (§11.3, §11.5). This design deliberately does not claim *which* symptom an
out-of-range compiler produces, because only an *absent* one has been measured.

**F5, F8, F9.** `@types/node` was missing from §11.3's list and `test-results.json` needs a
`.gitignore` line — both amended. `guard-paths.mjs`'s Bash heuristic now denies commands whose text
merely mentions a guarded path; that is the orchestrator's, and §11.5 records the count.

**Nothing here touches the module tree.** The implementer's commits 1–6 were unaffected and proceeded
concurrently; only `collect-ci.mjs` (commit 7), `lint-arch.mjs` (commit 9) and three
`package.json`/`.gitignore` lines change.

### S-1 — the finding about the process, not only about the design

It belongs here rather than in an amendment note. `CLAUDE.md` §2.4 requires every slice's failing
acceptance test to be *"observed red in CI"*, and §2's preamble says a NON-NEGOTIABLE *"may not be
relaxed by any agent for any reason; if one appears to block progress, raise a DCR instead of working
around it."* The step-1 design offered four substitute evidence items and labelled the gap a
bootstrap paradox. **That is a workaround presented as an evidence chain, and it should have been
raised as a DCR at step 1.** Neither reviewer caught it either, which is worth recording: step 2
found five real defects and missed the one that breached a standing invariant.

What exposed it was a fact discovered while preparing step 3 — **no container runtime on either
role's machine** — which removed evidence item 5, the last item compensating for the missing
observation. The trigger was environmental; the defect was not.

Two things make it unarguable rather than a matter of degree. `METHODOLOGY.md:272`: *"the board
cannot leave `red` until CI has recorded the acceptance test failing."* And `:335`, which defines the
step-3 log entry as *"the red commit SHA **and the CI run that observed it failing, with the failing
assertion quoted**"*. Under the step-1 design that entry could not be written truthfully, so slice
00a would either stall at `red` forever or advance on narration — which is the failure C7 exists to
catch. It was not a weaker evidence chain; it was an unloggable state.

**No exemption is needed, because §7 now satisfies the invariant** rather than asking to relax it.
Two consequences beyond the fix are recorded in §7 and §4: `red-proof` gains a replay against the red
run's own artifact, and **C1 stops being unmeasurable for 00a** — the correction of a ruling this
design made in its own step-1 draft.

**A gap in `CLAUDE.md` §6 that this exposes, and that is the human's to close.** To rule **(c)** the
architect *"must name the acceptance criterion or §10 quality scenario that would fail"*. Here
nothing in AC-1…AC-6 or QS-10 fails — the end state is green either way — yet a §2 invariant was
breached, and §2 outranks both. S-1 is therefore ruled (c) on §2's authority rather than by §6's
test. The suggested wording — *"acceptance criterion, §10 quality scenario, **or `CLAUDE.md` §2
invariant**"* — is not the architect's to apply and is being put to the human separately.

**What the human ruled**, at the same sitting:

1. **AC-6 reads broad.** *"The acceptance suite failed"* means any test-engineer-owned suite, not
   literally `tests/acceptance/`. No acceptance criterion changes. §7's rule is now AC-6's clauses
   mapped one for one.
2. **The slice's `arc42:` scope gains §7.1, arc42 §11.2, §5.3 and §7.4** (§7.4 for O1's `lint:arch`
   wrapper). The step-1 draft's open questions 1 and 2 are closed by this.
3. **`docker-compose.yml` starts `postgres` and `otel-lgtm` only; the service runs on the host.**
   The delta and its reasoning are recorded in §7.1/§7.2 at step 7. Open question 3 is closed.

**Where the objectors were right about the finding and wrong about the fix** — recorded because
conceding a finding is not the same as conceding a remedy:

- **O2** asked me to *"name the entrypoint command and loader"*. There is no loader. `tsx` is named
  in no ADR and Node 22.11's `--experimental-strip-types` does not remap `./x.js` onto `x.ts`, which
  is how this codebase writes imports. The answer is to **compile** (§11.3): no new dependency, and
  the acceptance test spawns the artifact a deployment would run.
- **O-1** proposed *"no failing test file under `tests/unit/` **or `tests/integration/`**"* as the
  negative condition. That would break the **next** slice: `docs/slices/00-schema-and-exclusion-constraints.md`
  names exactly one test file, `tests/integration/exclusion-constraints.test.ts`, and `CLAUDE.md` §5
  assigns database-invariant integration tests to the test-engineer precisely so they can be red
  first. `tests/integration/` is in the red zone, not outside it.
- **O-2**'s deeper fix — teaching `tools/slice/check.mjs` to order by timestamp instead of position
  — is **not** done here. Changing the gate tool in the slice that first feeds it is how a gate ends
  up agreeing with its own bug (§11.5).
- **O1**'s *"the fixture resolves the real compiler"* stated an outcome and no mechanism, which is
  the defect it was complaining about. §5 then named a mechanism — and at step 4 the named mechanism
  turned out to be **false** (see the step-4 findings below). What survives is the assertion, which
  is stronger than `totalCruised > 0`. What did not survive is the causal story attached to it.

**Findings of the architect's own**, surfaced while ruling and applied below: the migration seam
would have crashed 00a's red run in `globalSetup` (§4); AC-4 is green on arrival and that is honest
rather than a test-first violation (§7); the `.dependency-cruiser.js` widening now includes
`tests/setup/`, which **neither reviewer reviewed** (§11.2); and **S-1**, below, which reverses two
of this design's own earlier decisions — the single Vitest project (§4) and C1 being unmeasurable by
construction (§7).

**Loopbacks.** `CLAUDE.md` §6 contrasts cheap step-2 objections with the same finding at step 5,
which *"costs a full cycle plus a loopback"*. At step 2 there is no prior work to revise and no
accepted ADR to supersede, so (c)'s effect — *loop back to step 1* — **is** this amendment. The
architect's reading is that `loopbacks:` stays at **0**; the counter is the orchestrator's field.
The step-3 and step-4 rounds do not move it either: every step-4 ruling is **(a)**, and (a) resumes
from the raising step rather than returning to step 1. In each of those cases the work already in the
tree is correct and it was this design's *explanation* that was wrong — the cheapest kind of defect
there is, and a reason to say so plainly rather than to round it up.

`docs/team-log/process-criteria.md` is untouched. It is pre-registered, and a criterion edited after
seeing a result is not a criterion.

### Step 4 findings, ruled 2026-09-04

Commits 7–9 landed green and CI on the branch tip is green with the full phase-4 block live.
**Evidence item 3 is discharged**: `red-proof.mjs` was replayed offline against the red commit's own
artifact (run 33831214774) and exited 0, reporting the two failing suites, no unit failure, and
`verify` success. The replay §7 designed works.

Four findings came back, three of them carrying a **measurement against a claim this design had made
without one**. All four are **(a)**.

| # | Finding | Outcome | Reasoning, in one line |
|---|---|---|---|
| **§5 symlink** | The stated mechanism for the fixture's compiler symlink is wrong: `dependency-cruiser` resolves `typescript` with `createRequire(import.meta.url)` from its own location, never from the cwd | **(a) clarification**, and the symlink is **removed** | The outcome was right and the explanation was false. Verified independently: every resolution site in 18.2.0 routes through `try-import.mjs` or `try-import-available.mjs`, both location-relative. What is load-bearing is that the spawned `depcruise` binary is the repository's own |
| **J-1** | `judgeCruiseResult(summary, roots)` cannot express F2's remedy — `modules[]` is a **sibling** of `summary` — and the committed test passes bare summaries with one argument, so every case judged the F2 rule vacuously | **(a) clarification**, remedy narrowed | **F2's own defect inside F2's own remedy.** The signature becomes `(cruiseResult, roots)`. `roots` stays **optional**: making it mandatory would force the summary-only cases to fail on coverage *before* reaching the rule under test, and a stricter signature that degrades its own test is not a win |
| **J-2** | *"made repo-relative"* breaks the replay it exists to enable — Vitest records the running machine's absolute path, so `relative(cwd, …)` yields `../../../home/runner/…` and a genuinely red run replays as "no suite failed" | **(a) clarification** | The design named a normalisation that could not work, on the one path that exists to check it. The last-`/tests/`-segment fallback is adopted as the design; two alternatives were considered and rejected (§7) |
| **J-3** | §6's record shows `jobs.verify`, but `gh run view --json jobs` returns **display names** only — the REST API does not expose the YAML key | **(a) clarification** | The design showed a record and never said how a key was to be obtained. Mapping, slugify-not-drop and a name-matched layering step are adopted; `"not-run"` is the right third value because `check.mjs` reads anything but `pass` as FAIL, so it **fails closed** |

**A-1, the architect's own, raised here rather than left to step 5.** `tools/ci/lint-arch.mjs` spawns
`existsSync(local) ? local : 'depcruise'` **two lines below its own comment** saying *"a guard against
the wrong analyser running must not be able to run the wrong analyser."* A `depcruise` found on
`PATH` is a separate installation with its own `node_modules` and — per the §5 correction — its own
`typescript` resolution. That is the different-analyser case the comment forbids, minus the network.
Ruled (a): the fallback becomes `return 2`, naming the missing local install (§5).

**Three of these four are one shape, and it is not the shape §5's table catches.** See *The second
rule this slice keeps rediscovering* in §5. It is the more consequential of the two tables, because
the sentences it catches are this design's own.

**Who applies what, and it is not the architect.** The symlink deletion and a runner-absolute fixture
case go to the **test-engineer** (`tests/architecture/`, `tools/test/`); A-1's `return 2`, the
missing-`modules[]` verdict and the `jobsOf` key-collision fix go to the **implementer** (`tools/`).
This document describes them as ruled; it does not make them.

---

## 1. The module tree

Every file `src/` contains at the end of this slice. Nothing else. If a file below has no line of
work to do in 00a it is not in the list — a scaffold of empty modules is a claim that the design was
followed, not evidence of it.

```
src/
  main.ts                       composition root — the only module that sees every layer
  http/
    server.ts                   buildServer(deps) → Fastify instance: plugins, routes, error handler
    routes/health.ts            GET /health: TypeBox response schema, outcome → status mapping
  application/
    checkHealth.ts              use case: probe the database, return a HealthOutcome union
  persistence/
    db.ts                       pg Pool + Kysely instance; exports the `Db` type alias
    schema.ts                   the `Database` interface — empty in 00a, the typing seam for slice 00
    health.ts                   pingDatabase(db): SELECT 1, driver errors caught and never rethrown
    migrations/.gitkeep         the seam slice 00 drops 0001_*.sql into; zero migrations today (§4)
  platform/
    config.ts                   loadConfig(env) → Config; validated once, at startup
    logger.ts                   the pino instance
  domain/
    (nothing — see below)
```

Nine files, one placeholder, one deliberately empty directory.

### What is in `src/domain`, given there is no domain logic yet

**Nothing. The directory exists — carrying a `.gitkeep` — and contains no TypeScript at all.**

The alternative is a placeholder module, and it is worse than it looks. `src/domain` is the one
module whose value is entirely negative: it is defined by what may not be in it (§5.2, `domain-is-pure`,
GC-1), and QS-12 will later assert *by scanning the tree* that duration arithmetic, occupancy
arithmetic and wall-clock reasoning appear nowhere else. A `health.ts` or an `index.ts` parked there
to make the tree look populated is the first non-policy file in the module whose whole claim is that
only policy lives there. §5.2 already names the five files slice 01 creates; that list is the
statement of intent, and it does not need a stub to stand in for it.

The consequence to be honest about: `domain-is-pure` is **vacuously satisfied** in 00a. It is
therefore proved by AC-4's fixture tree and nowhere else this slice — which is exactly QS-10's
argument, and the reason AC-4 exists rather than relying on a green `lint:arch` over an empty
directory.

`no-orphans` (severity `warn`) is a second reason not to add a placeholder: an unimported module
would be reported on every run, and a warning nobody can clear is a warning everybody learns to skip.

### Notes on the modules that do exist

| File | Holds | Constraint a reader should check |
|---|---|---|
| `platform/config.ts` | `loadConfig(env: NodeJS.ProcessEnv): Config` with `Config = { databaseUrl, port, logLevel }`. Throws on a missing or malformed value, at startup, per §7.3 | **Hand-rolled validation.** `@sinclair/typebox` is confined to `src/http` and `main.ts` by `http-framework-only-in-the-edge`, so the obvious move — a TypeBox schema for the environment — is a CI failure. ~20 lines |
| `platform/logger.ts` | The `pino` instance built from `config.logLevel` | `pino` is unrestricted by the ruleset; `fastify` is not, and must not appear here |
| `persistence/schema.ts` | `export interface Database {}` — empty | This is the slice's only concession to a future need, and it is load-bearing: `Kysely<Database>` needs the parameter. Slice 00 populates it from the migrations (ADR-0006) |
| `persistence/db.ts` | `createDb(config): Db`, `closeDb(db)`, **`export type Db = Kysely<Database>`**, and a registered `pool.on('error', …)` handler | The pool must **not** connect eagerly — see §3. **`pool.on('error')` is mandatory, not hygiene:** `pg.Pool` emits `'error'` on *idle* clients, and an unhandled `EventEmitter` error terminates the process. AC-2 deliberately runs this service against a dead database, so this is on the AC-2 path. The handler swallows the error and must not rethrow; if it reports, it does so through `src/platform/logger.ts` (a permitted `persistence → platform` edge) rather than by acquiring a new dependency. Connectivity is reported by `/health`, never by a crash |
| `persistence/health.ts` | `pingDatabase(db: Db): Promise<boolean>` — `sql\`select 1\`` in a `try/catch` | **Catches everything and returns a boolean.** A `pg` error object escaping upward would be a `pg` value inside a layer that may not import `pg`. `dependency-cruiser` cannot see that (it is a value, not an import); it is precisely the leak `sql-only-in-persistence` exists to prevent, so it is stated here and is a review item |
| `application/checkHealth.ts` | `checkHealth(db: Db): Promise<HealthOutcome>` and the `HealthOutcome` union | Establishes §5.2's *outcomes, not exceptions* convention from the first endpoint, so slice 02 extends a pattern rather than introducing one |
| `http/server.ts` | `buildServer(deps: ServerDeps): FastifyInstance` | Takes **bound use cases**, never a database handle — see §2 |
| `http/routes/health.ts` | The route, its TypeBox response schema, and the exhaustive `switch` over `HealthOutcome` | The switch is exhaustive today over two members; that is the point of doing it now |
| `main.ts` | Config → logger → db → server → listen, plus signal handling | The only file permitted to hold a `Db` value and a Fastify instance at the same time |

### Import edges this produces, and the rule each one is checked by

```
main.ts        → platform, persistence, application, http     composition root, exempt by design
http/          → application (types + the outcome union)      allowed
application/   → persistence (concretely: pingDatabase, Db)   ADR-0008: no port, and this is why
persistence/   → platform (config), kysely, pg                the only module that may name either
platform/      → pino                                          leaf; imports nothing from src/
domain/        → —                                             nothing exists to import anything
```

`depcruise src tests` must exit 0 over exactly this tree. No rule is bent, no exemption is added, and
the `main.ts` exemption already written into `http-framework-only-in-the-edge` is the only one used.

---

## 2. The composition root, and where a reader will look for the missing port

ADR-0008 removed the repository port on purpose, so the seam a reader expects at
`application → persistence` is not there. What is there instead, precisely:

```ts
// src/main.ts  (shape, not final code)
const config = loadConfig(process.env);
const logger = createLogger(config);
const db     = createDb(config);                       // the only Db value in the process
const app    = buildServer({ logger, checkHealth: () => checkHealth(db) });

await app.listen({ port: config.port, host: '0.0.0.0' });
```

Three rules fall out of that, and each one is forced by the ruleset rather than chosen for taste.

**(a) The application layer names persistence functions directly; only the handle is injected.**
`checkHealth` imports `pingDatabase` from `src/persistence/health.ts` by name and takes `db: Db` as a
parameter. There is no interface, no factory and no `Deps` object at this boundary. That *is*
ADR-0008's decision made concrete: the socket a port would offer is the socket an in-memory
check-then-act implementation would plug into, and there is not one.

**(b) No layer above persistence ever writes the word `Kysely`.** `db.ts` exports
`export type Db = Kysely<Database>`, and `application` imports `type { Db }` from
`src/persistence/db.js` — a `src/` edge, which is permitted. Had it written
`import type { Kysely } from 'kysely'` instead, `sql-only-in-persistence` would fire, because
`.dependency-cruiser.js` sets `tsPreCompilationDeps: true` and therefore sees type-only imports. The
alias is not sugar; it is the thing that keeps the rule enforceable at the one place it is most
likely to be evaded. AC-4's fixture proves that half of the rule with a *type-only* violation (§5).

**(c) The HTTP layer receives already-bound use cases, and never a `Db`.**

```ts
// src/http/server.ts
import type { FastifyBaseLogger } from 'fastify';

export interface ServerDeps {
  logger: FastifyBaseLogger;
  checkHealth: () => Promise<HealthOutcome>;
}
```

**`FastifyBaseLogger`, not pino's `Logger`** — corrected at step 2, where the implementer compiled it.
Fastify 5 specialises `FastifyInstance` on the logger type passed as `loggerInstance`, so a pino
`Logger` makes the declared `FastifyInstance` return type unassignable
(*"Property 'msgPrefix' is missing in type 'FastifyBaseLogger' but required in type 'BaseLogger'"*).
The type is imported from `fastify`, which `src/http` may name; `main.ts` still passes the pino
instance, which structurally satisfies it.

**What the ruleset actually forces, stated narrowly enough to be true.**
`http-must-not-reach-persistence` forbids `src/http → src/persistence`, and under
`tsPreCompilationDeps` that includes `import type { Db }`; `sql-only-in-persistence` forbids
`import type { Kysely }` anywhere outside persistence. So:

> **`src/http` cannot *name* the database handle's type.** Not `Kysely`, not `Db`.

The earlier draft of this section claimed partial application was *"the only shape left"*. **That was
overstated, and the implementer disproved it by running the ruleset** — this compiles and cruises
with zero violations:

```ts
// src/http/probeE.ts — never names Db, never imports src/persistence
export interface GenericDeps<TDb> { db: TDb; checkHealth: (db: TDb) => Promise<HealthOutcome>; }
```

A generic parameter carries the handle through the edge layer by *refusing to name it*, which buys
nothing: the edge still holds a value it cannot use, cannot type and must not touch. The honest
statement, and the one that goes into arc42 §5.2 at step 7, is therefore: **the ruleset forecloses
every shape that names the handle; a generic parameter evades that only by declining to name it; and
partial application is the shape we take.** The counterexample is recorded beside it deliberately —
a claim that has survived an attack is worth more in §5.2 than one that was never tested.

It generalises either way: from slice 02 onward `ServerDeps` is a record of bound use cases and
nothing else.

**Shutdown.** `main.ts` registers `SIGTERM`/`SIGINT` → `app.close()` then `closeDb(db)` then exit 0.
Not ceremony: the acceptance harness spawns and kills this process repeatedly (§4), and a process
that leaks a pool on signal turns an unrelated test failure into a hung suite.

---

## 3. `GET /health`

An operational probe, not a business operation. It is the one endpoint that must cross every layer,
which is what makes it the right endpoint for a walking skeleton — a skeleton whose single route
short-circuits the layering proves nothing about the layering.

**Response, identical in shape on both codes:**

```json
{ "status": "ok",       "checks": { "database": "up" } }     // 200
{ "status": "degraded", "checks": { "database": "down" } }   // 503
```

Both are declared as TypeBox `response` schemas on the route (ADR-0005), so the shape is validated on
the way out and is already in the form slice 10's OpenAPI emitter will read.

**How the `503` is produced without `src/http` importing `pg`:**

```
GET /health
  └─ http/routes/health.ts        deps.checkHealth()          — sees no db, no pg, no kysely
       └─ application/checkHealth  pingDatabase(db)           — names no driver type
            └─ persistence/health  sql`select 1`, try/catch   — the only frame that sees pg
                 ↩ boolean
       ↩ { kind: 'ok' } | { kind: 'degraded', reason: 'database-unreachable' }
  switch (outcome.kind) { case 'ok': 200; case 'degraded': 503 }   — exhaustive, compiler-checked
```

The status code is decided by a `switch` over a union whose members are declared in
`src/application`. Nothing about `pg`, SQLSTATE or a connection reaches the edge. §8.6's mapping
table has exactly this shape for the five business operations; `/health` uses the mechanism without
joining the table (see §10 — this is what ADR-0011 is for).

**Bounded failure.** `createDb` sets `connectionTimeoutMillis: 1000` as a **constant in
`persistence/db.ts`, not an environment variable** — §7.3's table gains no row, and if it ever needs
to be tunable that is a config change and a §7.3 edit, made deliberately. Without a bounded timeout,
AC-2's unreachable-database case hangs instead of returning `503`.

**The pool must not connect at boot.** `pg.Pool` is lazy by construction; nothing in `main.ts` may
add an eager `SELECT 1` "to fail fast". If startup verified connectivity, a service pointed at a dead
database could not start, and AC-2's `503` would be untestable — the test would be asserting on a
process that exited. Config validation still fails fast (§7.3); *connectivity* is only ever probed by
`/health`.

---

## 4. The Testcontainers harness

§7.2 is the design; this is the mechanism.

```
vitest.config.ts
  globalSetup: tests/setup/postgres.ts
        │
        ├─ new PostgreSqlContainer('postgres:16').start()        one container per RUN
        ├─ mkdir -p 'src/persistence/migrations'                 see "the seam", below
        ├─ node-pg-migrate runner(), programmatic, that same dir
        │       └─ 00a: applies ZERO migrations, creates `pgmigrations`.  This is the seam.
        ├─ provide('databaseUrl', container.getConnectionUri())
        └─ teardown: container.stop()
```

**Global setup, not per-file.** §7.2 says one container per run and gives the reason: the
concurrency tests need several real pooled connections against one instance, and per-file containers
would multiply startup cost by the file count for no isolation benefit — isolation is by data.

**No container reuse.** `withReuse()` is deliberately not used. It depends on
`testcontainers.reuse.enable` in the *developer's* `~/.testcontainers.properties`, leaves state
between runs, and makes a suite behave differently on its second invocation than its first. A run
whose result depends on whether a previous run happened is not evidence. The cost is ~3–5 s of
container start per `npm test`; accepted.

**How the connection string reaches the suite.** Vitest's typed `provide` / `inject`, not ambient
`process.env`:

- `globalSetup` calls `provide('databaseUrl', uri)`;
- a test or helper reads `inject('databaseUrl')`;
- the acceptance harness passes that value **explicitly** into the spawned service's environment as
  `DATABASE_URL`.

Explicit beats inheritance here for one concrete reason: AC-2's second case needs a service instance
pointed at a *deliberately unreachable* database, and that is a different `DATABASE_URL` in the same
run. Ambient environment inheritance makes that awkward and makes it invisible at the call site.

**A clean database.** Not by truncation — §7.2 forbids it, because truncating between tests
serialises the suite and makes the concurrency tests race the cleanup rather than each other.
Isolation is by data: each test seeds its own dealership and works only inside it. **In 00a there is
no data at all**, so the rule is stated and unexercised; the seeding helpers arrive with slice 00's
schema. This is the honest position, not an omission: there is nothing to isolate yet.

**The seam slice 00 must find waiting for it.** Three things, and all three must be present in 00a
even though they do nothing:

1. `src/persistence/migrations/` is a tracked directory (a `.gitkeep`), created by the implementer
   at step 4;
2. `globalSetup` **ensures that directory exists** (`mkdirSync(dir, { recursive: true })`) before
   calling the runner; and
3. `globalSetup` calls the migration runner **unconditionally**, against that directory, with the
   same package `npm run db:migrate` uses (ADR-0007). Zero files apply; `pgmigrations` is created;
   the call succeeds.

Slice 00 then adds `0001_*.sql` and changes **no other file**. If instead 00a skipped the call
"because there is nothing to migrate", slice 00 would have to add the call, the config and the schema
at once, and any failure among them would be ambiguous.

**The no-op is verified, not assumed.** This section previously carried a warning that
`node-pg-migrate` against a directory holding only `.gitkeep` was expected to be a no-op but was
unverified, and floated a `0000` no-op migration as the likely fix — which would have been a
data-model delta and a scope question for the human. The implementer closed it from the source at
step 2: `dist/migration.js:82` defaults `ignorePattern` to `^\..*`, so `.gitkeep` is filtered out and
the migration list is empty; `dist/runner.js:236–248` calls `ensureMigrationsTable` **before** the
empty-list check. The call succeeds, creates `pgmigrations`, applies zero migrations. **The warning
is struck, no `0000` migration exists, and no scope question arises.**

**Why step 2 above exists, since it looks like defensive coding.** It is the fix for a defect the
architect found while ruling on O2, and without it 00a's red run does not survive contact with its
own ownership rules. At the red commit `src/persistence/migrations/` cannot exist: `guard-paths.mjs`
denies the test-engineer every write under `src/`, and the implementer's commits all come later.
`node-pg-migrate` would throw `ENOENT`, `globalSetup` would abort, and **no test would run at all** —
turning the red commit's evidence from a set of assertion failures into a setup crash, which is "red
for the wrong reason" in the most literal sense. That now matters more than it did when the defect
was found: since the `test` job runs on the red commit (§7), a `globalSetup` crash would be the
*observation itself*, and `CLAUDE.md` §2.4 would be satisfied in form while proving nothing.

**Two side effects, found at step 3 rather than designed for (F1).** Neither changes the ruling, and
both are recorded because a reader would otherwise inherit a false explanation from §7:

1. **`src/` exists, empty, from the first test run onward.** `mkdirSync` is recursive and relative to
   the working directory, so it creates the `src/` root as well. That is why AC-3's red cannot come
   from *"`depcruise` cannot open `src`"*, as the step-2 draft predicted: the command succeeds and
   cruises an empty directory. §7's prediction table and §5's AC-3 subsection now say the real reason
   — **no module under `src/` is examined** — and the test asserts that rather than an exit code
   alone. Nothing is tracked by git, since git does not record empty directories.
2. **`npm run lint:arch` therefore behaves differently before and after a test run** — it fails on a
   clean checkout at the red commit and exits 0 once `globalSetup` has run. That is a mild instance of
   exactly the hazard this section rejects `withReuse()` for: *a run whose result depends on whether a
   previous run happened is not evidence.* It is stated rather than engineered away. It lasts one
   slice — from slice 00 `src/` is tracked and non-empty — and from green commit 9 the `lint:arch`
   wrapper's per-root guard (§5) makes it harmless anyway, because the guard does not care whether a
   root is absent or merely empty. Both are *not examined*.

Two alternatives were considered and rejected. Moving migrations to a root `migrations/` directory is
cleaner — it is `node-pg-migrate`'s own default and sidesteps the ownership collision entirely — but
**ADR-0007 is accepted and immutable** and names `src/persistence/migrations/` in its Decision, so it
would cost a superseding ADR for a directory rename. Accepting the setup crash for one slice costs
the legibility of the red at the human's gate. One `mkdirSync` is the cheaper of the three, and it
keeps the property that matters: **the runner is always called**. The seam is unconditional; only the
directory's existence is guaranteed rather than assumed. If someone later deletes the directory, the
harness recreates it empty, zero migrations apply, and every database-invariant test fails loudly on
the missing schema — a loud failure one commit later, not a silent pass.

**The `db:migrate` / `globalSetup` relationship, since the implementer asked for one line.**
`npm run db:migrate` wraps the `node-pg-migrate` **CLI** (implementer's script, §11.3) and
`globalSetup` calls `runner()` from the **same package** (test-engineer's file). They are not the
same call site, and §7.2's *"byte-identical"* property therefore rests on the shared **directory and
package**, not on a shared module. That is enough: the SQL applied is the same SQL, applied by the
same runner version, in the same filename order. No shared module is created, and `src/` gains no
tenth file.

**Directory ownership.** `tests/setup/`, `tests/support/` and `vitest.config.ts` are the
**test-engineer's**, written in the red commit at step 3 — because AC-1's evidence *is* that the
container starts and the suite connects, and a red run that could not start a container would be red
for the wrong reason. `tests/support/` had no stated owner before step 2 (O2); it holds the spawn
helper the acceptance test drives the service with, so it is part of the test. See §11.3 for the full
step-3/step-4 split.

**Vitest's `include` is scoped to `tests/**`.** Not housekeeping: `tools/test/*.test.mjs` are plain
`node` scripts run by `npm run test:tools`, and if Vitest collected them they would run inside
`npm test`, redden 00a's red commit for a third reason, and pollute the failure set `red-proof`
classifies (§7).

**Two Vitest projects, split by whether a test needs the database.** This reverses the step-1 draft,
which shipped one project and deferred the split to slice 01. The reason given there was that
`test:domain` would need a `tests/unit/` that does not exist yet and a `passWithNoTests` flag that
stays green forever. That reason never covered the real case, and a fact discovered before step 3
made the real case decisive: **there is no container runtime on either role's machine** (§11.5).
Under a single project, a failing container start aborts the entire run — so neither role can execute
*any* Vitest test locally. Not the AC-4 fixture, which is the test-engineer's most delicate
deliverable and the one O1 proved is easy to get silently wrong; and not any `tests/unit/` file,
which means the implementer cannot run the inner TDD loop `CLAUDE.md` §6 step 4 requires. Red-green
through CI round-trips is not slow TDD, it is not TDD.

| Project | Contains | `globalSetup` |
|---|---|---|
| `nodb` | `tests/unit/**`, `tests/architecture/**` | none |
| `db` | `tests/acceptance/**`, `tests/integration/**`, `tests/contract/**`, `tests/property/**`, `tests/concurrency/**`, `tests/performance/**` | `tests/setup/postgres.ts` |

`npm test` runs **both**, so AC-1 is unchanged and one invocation still produces **one**
`test-results.json` — which matters, because `red-proof.mjs` takes a single `--results` path (§7).
`npm run test:nodb` is the Docker-less subset. Neither project is ever empty: `tests/architecture/`
exists from the red commit and `tests/unit/` joins at green commit 1, so the `passWithNoTests`
objection that justified one project does not apply to this split. arc42 §7.2's `test:domain` becomes
`test:nodb` and lands in 00a rather than slice 01 — an as-built note at step 7, inside the declared
§7.2 scope.

> **The one mechanical unknown in this slice, and an instruction rather than a hope.** Per-project
> `globalSetup` must be **verified to work in the pinned Vitest version** at step 3, before the red
> commit. If it is not honoured, the guaranteed fallback is a second config file
> (`vitest.nodb.config.ts`, with `test:nodb` running `vitest run -c`) — but that makes `npm test`
> produce **two** result files, which `red-proof.mjs`'s single `--results` input cannot consume, and
> that is a design question. **Raise it rather than improvise.** Stating the mechanism instead of the
> outcome is the lesson of O1, applied to the architect's own amendment.

---

## 5. `tests/architecture/layering.test.ts` — what it must establish

The test-engineer writes this file; this section specifies what it must prove, not how.

**It must run the repository's own `.dependency-cruiser.js`.** Not a copy, not a derived config with
rewritten path anchors, not the API with an inline ruleset. The artifact under test is the file CI
runs; a test against a transformed copy proves something about the copy. The config is passed by
path (`--config <repo>/.dependency-cruiser.js`) with the working directory set to the fixture root,
and the CLI is invoked exactly as `lint:arch` invokes it, with `--output-type json` so the
assertions read `summary.violations[].rule.name` rather than scraping text.

**Hermeticity has a direction, and getting it backwards is O1.** The fixture isolates the rule
*targets* and resolves the *analyser*. Isolating both produces a tree that is not hermetic but inert:
`dependency-cruiser` detects a TypeScript environment, finds no compatible `typescript` resolvable
from the working directory, and **silently skips every TypeScript source**. Measured by the
test-engineer against a fixture built exactly to the previous draft of this section, and reproduced
independently by the orchestrator:

```
exit 0 · violations 0 · totalCruised 0 · modules 0 · stderr empty
summary.environment.issues[0].name = "missing-typescript-transpiler"
```

Four planted violations, none reported, exit 0. Under `--output-type json` there is no other signal.

**The fixture tree.** Built in a fresh temporary directory per run and removed in teardown. It must
contain, at the fixture root:

- `tsconfig.json`, mirroring the repository's `compilerOptions` — `.dependency-cruiser.js` resolves
  `tsConfig.fileName` relative to the working directory, and `tsPreCompilationDeps` needs a real
  TypeScript configuration to be meaningful;
- **nothing at all for the compiler — and that is a ruling, not an omission (step 4).**
  `dependency-cruiser` resolves `typescript` with `createRequire(import.meta.url)` **from its own
  location**, never from the working directory: in 18.2.0 every resolution site routes through
  `src/utl/try-import.mjs` or `src/extract/transpile/try-import-available.mjs`, both constructed that
  way, and `tryImport`'s dynamic `await import(pModuleName)` resolves against the importing module's
  URL too. Measured at step 4: a temp fixture with **no** `typescript` in its `node_modules` cruises
  normally.

  So the compiler a cruise gets is fixed by **which `depcruise` binary is spawned**, and the
  load-bearing line is `DEPCRUISE = resolve(REPO_ROOT, 'node_modules/.bin/depcruise')` — an absolute
  path to the repository's own binary, never a `PATH` lookup and never `npx`.

  The step-2 draft required a `node_modules/typescript` symlink and explained it by Node's upward
  resolution walking `/tmp/<fixture>/node_modules` and never reaching the repository. **That
  explanation was false**, and false in exactly the way O1 complained about — a confident mechanism
  nobody ran. The symlink is therefore **removed** rather than demoted to belt-and-braces: no
  scenario was found in which it helps, including the one specifically looked for (a `PATH`
  `depcruise`, where the binary's own installation is what resolves the compiler and the fixture
  symlink is still irrelevant), and §11.6's standing objection to inert machinery is that a future
  maintainer preserves it for a reason that is not true.

  **The deletion is safe to attempt because its failure mode is loud.** If this reading is wrong,
  `guardTheCruiseHappened` fires and names `missing-typescript-transpiler` — in the owning role's own
  test, on the next run. A deletion whose failure mode is a named test failure is a different kind of
  decision from one that fails silently, and that difference is why it can be ruled on a measurement
  instead of deferred out of caution. If it fires, the symlink comes back — with a true explanation;
- **stub packages** at `node_modules/kysely/` and `node_modules/pg/` — a `package.json`, an index and
  a `.d.ts` that actually **declares `Kysely`**, so the type-only case resolves. This is the detail
  most likely to be got wrong: the rule matches `^node_modules/(pg|…|kysely)`, and if the fixture
  instead resolves to the repository's real `node_modules` by directory walking, the reported path is
  `../node_modules/kysely`, the anchor does not match, and **`sql-only-in-persistence` silently does
  not fire**.

  The asymmetry between the bullets above is deliberate and is the whole of O1 — but step 4 forced it
  to be restated in the other direction: **stub what the rules point at, and do not try to isolate
  what does the analysis.** `pg` and `kysely` go through enhanced-resolve **from the cwd**, which is
  why the fixture can and must control them; the compiler does not, which is why the fixture
  **cannot** isolate it. The step-2 wording implied the compiler was isolable and that we chose not
  to isolate it. It is not isolable — and a fixture that appeared to isolate it was measuring
  something else;
- import specifiers written the way `src/` writes them (explicit `.js`), so resolution behaves
  identically and `not-to-unresolvable` does not fire in place of the rule under test.

**The guard, which runs before any assertion about violations.** In both the positive fixture and the
negative control, the test asserts first that the cruise actually happened:

1. `summary.environment.issues` is **empty** — a non-empty array is a hard failure naming the issues,
   never a warning;
2. **every planted source file appears in the result's `modules[]`.**

(2) is deliberately stronger than *"`totalCruised > 0`"*, which the objection proposed: the fixture's
file list is fixed and known, so naming the files costs nothing and closes a hole `> 0` leaves open
— a run that cruised one stub package and skipped every source would satisfy `> 0`. The guard matters
most for the **negative control**, where zero violations is the *expected* answer and a tree that was
never cruised is indistinguishable from a tree that conforms.

**Four positive cases, one violation per file**, so that every assertion names one rule
unambiguously:

| Fixture file | Violation | Rule that must be named |
|---|---|---|
| `src/domain/bad.ts` | imports `../platform/config.js` | `domain-is-pure` |
| `src/application/bad.ts` | **`import type { Kysely } from 'kysely'`** | `sql-only-in-persistence` |
| `src/http/bad.ts` | imports `../persistence/db.js` | `http-must-not-reach-persistence` |
| `tests/acceptance/bad.test.ts` | imports `../../src/domain/thing.js` | `outside-in-tests-do-not-import-src` |

The second case is **type-only on purpose**. It is the exact failure mode the config's own comment
calls out: without `tsPreCompilationDeps: true` the import is erased before `dependency-cruiser` sees
it and the rule stops catching the most likely way infrastructure enters a layer that forbids it. A
value import would pass this test while leaving that regression undetected.

Each assertion must check the **rule name and the severity (`error`)** on the **expected file** — not
merely that the violation count is non-zero. A test that asserts "four violations were reported"
passes when four *different* rules fire.

**One negative control, and it is not optional.** A second, conforming fixture tree — shaped like
§5.2, with only legal edges (`http → application → persistence → domain`, `platform` as a leaf) —
must produce **zero** error-severity violations. Without it, a ruleset that rejected everything would
pass the four positive cases. QS-10's wording covers the positive half; the negative control is what
makes the pair evidence rather than a demonstration.

**It must not import `src/`.** `tests/architecture/` belongs to the test-engineer (Gate B,
2026-09-04), and the test-engineer may not read `src/`. The file reads `.dependency-cruiser.js` as a
path argument to a subprocess and never imports it. **The fixture assertions** must not depend on the
repository's real `src/` contents in any way — they would then fail or pass for reasons belonging to
another slice. That prohibition is narrowed at step 2 to the fixture assertions alone, because of
what follows.

### AC-3 lives in this file too

The test-engineer proposed asserting AC-3 here — shell out to `npm run lint:arch` against the real
repository — rather than leaving its evidence to a CI step. **Confirmed**, and it needs no `src/`
read because it observes a subprocess exit code, which is the same argument this section already
makes for passing `.dependency-cruiser.js` by path. AC-3 is by definition a claim about the real
tree, which is why the prohibition above is scoped to the fixture cases.

**As built at step 3, the assertion is exit 0 *and* that the cruise examined `src/`** — and that is
stronger than the step-2 draft for a reason worth stating. Asserting exit 0 alone would **not** have
been red at the red commit: §4's `mkdirSync` creates `src/`, so `depcruise src tests` succeeds over an
empty directory and exits 0 (F1). Asserting coverage is not a requirement bolted onto AC-3 either —
AC-3 reads *"**Given the module tree of §5.2**, when `npm run lint:arch` runs, then it exits 0"*, so
checking that the cruise saw that tree is checking the criterion's own *given* clause. It makes the
red deterministic rather than dependent on a filesystem accident, and the red and the eventual green
then concern the same property.

From green commit 9 the wrapper enforces that property too (§5's `lint:arch` spec), so the assertion
is deliberately redundant with it: the wrapper **enforces**, this test **checks the tool**, and the
implementer owns the first while the test-engineer owns the second. A reviewer should read the
overlap as layering, not as duplication.

Two consequences, confirmed here rather than discovered at step 3:

- **00a's red commit reddens two directories**, `tests/acceptance/` and `tests/architecture/`. Under
  the human's broad reading of AC-6 both sit inside `red-proof`'s red zone (§7), so nothing trips.
  Under the literal reading this alone would have failed the job on the slice that introduces it —
  one of the two arguments that carried the escalation.
- **AC-4 is green on arrival** (§7).

### The rule this slice keeps rediscovering

> **A cruise that exits 0 says nothing about what it examined.** Every assertion about violations
> must be preceded by an assertion about **coverage** — which files were cruised, not how many.

Written here as a rule rather than as three patches, because it has now been found three times in one
slice and the shape is not specific to `dependency-cruiser`:

| Instance | The green thing that proved nothing |
|---|---|
| **O1** (step 2, measured) | A fixture with four planted violations, cruised with no resolvable compiler: exit 0, zero modules, zero violations |
| **F1** (step 3) | AC-3's red was predicted to come from `depcruise` failing to *open* `src` — but §4's `mkdirSync` creates it, so the command succeeds over an empty directory |
| **F2** (step 3) | The guard written to close O1 counted modules **overall**, so `tests/` alone kept the count non-zero while `src/` went unexamined |

It generalises past this file. `test:tools` is a literal `&&` chain, so a tool test nobody wires in
passes by never running (§11.4). A `verify` job that never executed the suite is green (§7, S-1). In
each case the signal is an exit code standing in for a claim about work that was never done. **The
fourth instance should be caught by reading this table, not by measuring.**

### The second rule this slice keeps rediscovering

The table above catches **green things that proved nothing**. Step 4 found its sibling, and the first
table had not caught a single instance of it:

> **A stated mechanism is a claim, and a claim with no test and no recorded measurement behind it is
> a guess written in the indicative.** Every causal sentence — *"because X, Y"* — in this design or
> in a docblock under `tools/` either cites something that ran, or is one measurement away from
> being false.

| Instance | The sentence, and what was actually true |
|---|---|
| **F1** (step 3) | *"AC-3's red comes from `depcruise` failing to open `src`"* — §4's `mkdirSync` creates it, so the command succeeds over an empty directory |
| **§5 symlink** (step 4) | *"the fixture root is a temp directory, so Node's upward resolution never reaches the repository"* — `dependency-cruiser` resolves the compiler from its own location and never consults the cwd |
| **J-2** (step 4) | *"failing files, made repo-relative"* — `relative(cwd, …)` on a replayed artifact yields `../../../home/runner/…`, which matches no rule, so a red run replays as green |
| **J-3** (step 4) | *"`checks.jobs` carries `jobs.verify`"* — `gh` returns display names and the REST API does not expose the YAML key, so that record could not be produced at all |

**Every one of these four sentences is this design's own**, written confidently, and every one was
found by a role that *ran* the thing rather than reading it. That is what makes this the more
consequential of the two tables: the first polices the tooling, this one polices the architect. The
first table's own warning — that the fourth instance should be caught by reading rather than by
measuring — applied here and did not fire, because it was watching for the wrong shape.

The discipline attached to it is cheap. A causal sentence in this document, or in a docblock under
`tools/`, must be traceable to one of three things: **a test that would fail if it were false**, **a
measurement recorded with its date and its subject**, or an explicit **"assumed, not measured"**. The
third is honest and costs nothing — §11.5's step-3 refusal to claim which symptom an out-of-range
compiler produces is exactly what it looks like, and step 4 then went and measured it (§11.5).

### The same failure mode in production: `lint:arch`

O1's third consequence is the one that reaches past this slice, and it is why the remedy is not
confined to the test. `npm run lint:arch` is `depcruise src tests --config .dependency-cruiser.js`.
If `typescript` is absent, or outside the range `dependency-cruiser` supports (§11.5 — and the range
is **not** a `peerDependency`, so nothing warns), that command **exits 0 having cruised nothing**,
`collect-ci.mjs` records `checks.depcruise: "pass"`, and criterion **C4** (*"architecture held
unprompted", measured from `depcruise` in `check.run`*) reports a clean architecture for twelve
slices in which the ruleset never ran. QS-10 would switch itself off in silence.

The guard therefore has to live inside whatever produces that `pass`, which is the `lint:arch` step
itself. **`lint:arch` becomes `node tools/ci/lint-arch.mjs`**, which:

- spawns the same CLI with the same arguments — `depcruise src tests --config .dependency-cruiser.js`
  — adding `--output-type json`, so the artifact under test is still the file CI runs. **The binary
  is the repository's own `node_modules/.bin/depcruise`, and there is no fallback (A-1).** If it is
  absent the wrapper exits **2**, naming the missing install: a `depcruise` found on `PATH` is a
  separate installation resolving its own `typescript` (see the fixture bullet above), which is
  precisely the different-analyser case this wrapper exists to prevent. The step-4 build had that
  fallback two lines below the comment forbidding it;
- exits non-zero, naming the cause, if `summary.environment.issues` is non-empty — **and prints the
  installed `typescript` version alongside it**, read with `createRequire` from the only place it can
  be read. The cruise output cannot name it: an absent compiler and an out-of-range one are reported
  identically, down to the description string (§11.5). Without this line a maintainer who bumped the
  compiler past the supported range is told a compatible one is *missing*, and is not told which one
  they just installed;
- **exits non-zero if any root passed on the command line contributed no modules, naming the root.**
  Per **root**, not overall (F2): `depcruise` is handed `src` and `tests`, so a count over the whole
  result is satisfied by `tests/` alone while `src/` — the thing QS-10 is about — goes unexamined
  behind a green gate;
- exits non-zero if any error-severity violation exists, re-rendering them readably (rule name,
  `from` → `to`) so the developer-facing output is no worse than today's;
- exits 0 otherwise;
- exports a pure **`judgeCruiseResult(cruiseResult, roots)` → `{ ok, reason }`**, so the rule is
  unit-testable without running a cruise. It takes the **whole** `--output-type json` payload,
  `{ modules, summary }`, and not the summary alone, because **coverage is a claim about a file list
  and a summary has none**: `modules[]` is a *sibling* of `summary`, and `totalCruised` is the count
  whose insufficiency is the whole of F2. The step-3 draft named `(summary, roots)`, a signature that
  could not express the remedy it was ruling (**J-1**).

  Three consequences, each of them a way this interface can be got wrong:

  1. **A bare summary is a legitimate input, not a tolerated one.** Three of the four rules —
     environment issues, `totalCruised`, violations — read only the summary, so a summary is a
     *complete* input for them, and the unit test is better for exercising them without inventing a
     `modules` array it would then have to keep in sync.
  2. **`roots` is optional and defaults to `[]`, which means the coverage rule is not asserted** —
     stated in the interface rather than left implicit. Making it mandatory was considered and
     **rejected**: it would force the summary-only cases to pass `['src']` and then fail on coverage
     *before* reaching the rule under test, leaving them green for the wrong reason. A stricter
     signature that degrades its own test is not a win. The CLI is the only production caller and
     refuses to run with no roots (exit 2), which is where the guarantee actually lives.
  3. **A non-empty `roots` with no `modules[]` array is its own verdict**: `not ok`, with a reason
     saying **coverage could not be checked, because the result carried no `modules[]`** — distinct
     from *"examined no module under `src/`"*. Otherwise a caller who passes roots and a summary gets
     a correct verdict with a diagnosis pointing at the tree instead of at the call.

**Two constraints on how the per-root check is built**, both of which are ways to get it wrong:

1. **The roots come from the wrapper's own argv, never from a hardcoded `['src', 'tests']`.** If
   `lint:arch` ever gains a third root, a hardcoded pair silently stops covering it — the same bug a
   fourth time, in the guard against it.
2. **It stays one cruise.** Cruising each root separately and checking each result would *disable*
   `outside-in-tests-do-not-import-src`, which only fires when `src` and `tests` are in the same
   graph. The assertion is per-root; the cruise is not. A remedy that strengthens a guard while
   turning off a rule is worse than the hole it closes.

A stronger form was considered and rejected — requiring the module count under `src/` to match a walk
of the filesystem. It duplicates what `dependency-cruiser` does, and `.d.ts` and ignored files would
make it fail for reasons unrelated to layering. The fixture keeps the stronger per-**file** form
above, where the file list is fixed and known; `lint:arch` runs against a tree that changes every
slice, so per-root non-emptiness is the assertion that stays true without maintenance.

Three cheaper options were considered and rejected. A `required` rule inside
`.dependency-cruiser.js` cannot fire when the graph is empty — no modules, no violations. A second CI
step running the JSON cruise duplicates the work and is skippable locally, so `lint:arch` would mean
different things on a laptop and in CI. Asserting it only inside `layering.test.ts` leaves the
`verify` job's `depcruise: "pass"` unguarded, and that record is exactly what C4 reads.

**Ownership and sequencing.** `tools/ci/lint-arch.mjs` and the `lint:arch` script change are the
**implementer's**, landing in **green commit 9**. They must *not* land in the red commit: at that
commit `lint:arch` has to stay today's raw CLI, so AC-3's red comes from the tree rather than from a
missing wrapper. `tools/test/lint-arch.test.mjs` is the test-engineer's, authored at step 3 under the
O3 arrangement (§11.4). It must feed **both shapes**: bare summaries for the environment-issue,
zero-cruised and violation rules, and **full cruise results with explicit roots** for the per-root
rule — one covered, and one where a root contributed no modules, asserting that **the missing root is
named**, because *"examined nothing under `src/`"* and *"examined nothing"* are different failures and
only the first tells a maintainer where to look. As authored at step 3 the file passed bare summaries
with one argument and so judged the F2 rule vacuously (**J-1**); that is the correction.

**`graph:modules` has the identical failure mode** and would render an empty graph in silence. It is
cosmetic and is deliberately **not** gated — but §5.3's first render is to be eyeballed rather than
trusted, and the implementer has already predicted it shows four modules rather than five (§11.5).

---

## 6. `tools/team-log/collect-ci.mjs`

ADR-0010 Decision 2 chose the mechanism and did not build it. This is its interface.

### CLI

```
node tools/team-log/collect-ci.mjs [--branch <name>] [--run <id>] [--slice <id>]
                                   [--from-file <path>] [--limit <n>] [--dry-run]
```

| Input | Source | Notes |
|---|---|---|
| runs | `gh run list --branch <b> --json databaseId,headSha,conclusion,status,workflowName,updatedAt,url,event` | default branch: the current one |
| per-job detail | `gh run view <id> --json jobs` | job names and per-step conclusions |
| slice | `--slice`, else `docs/team-log/.scope` | same convention the `SubagentStop` hook already uses |
| offline replay | `--from-file <gh json>` | a payload previously produced by `gh`, or the run-summary artifact (§7) |

**It writes nothing it did not compute.** There is no `--conclusion`, no `--status`, no way to state
an outcome on the command line. Every field in `checks` is parsed from `gh` output. That is the whole
justification for `appendRecords(..., { allowDerived: true })`: `write.mjs` reserves the `derived`
tier for collectors that compute the fact themselves, and a flag on a module that accepted the fact
as an argument would be the tier laundered rather than earned. The record therefore also carries
`checks.collected_via: "gh-cli" | "run-artifact"`, so the provenance of a `--from-file` collection is
visible in the log rather than indistinguishable from a live one.

**Failure behaviour.** `gh` missing, unauthenticated, or offline → exit 2, a message naming the cause,
**nothing appended**. A collector that degrades to a guess is worse than one that stops.

**Idempotent.** Runs already present in the log (matched on `checks.run_id`) are skipped and
reported. `log:audit`'s planned `OMISSION` reconciliation (ADR-0010) depends on being able to run
this repeatedly at every gate.

### The record

```json
{
  "ts": "2026-09-04T14:21:07Z",
  "slice": "00a",
  "event": "check.run",
  "source": "derived",
  "outcome": "failure",
  "checks": {
    "run_id": 17384920117,
    "head_sha": "9f2c1ab…",
    "workflow": "verify",
    "conclusion": "failure",
    "collected_via": "gh-cli",
    "depcruise": "pass",
    "red_proof": "success",
    "jobs": { "verify": "PASS", "test": "FAIL", "red-proof": "PASS" },
    "suites": { "unit": "PASS", "architecture": "PASS", "acceptance": "FAIL" }
  },
  "git": { "commits": ["9f2c1ab…"] },
  "message": "https://github.com/sleepyshark85/keyloop-challenge/actions/runs/17384920117"
}
```

Schema-valid per `tools/team-log/schema.mjs`: `ts`, `event`, `source` universal; `slice` scopes it;
`check.run` requires `checks`. Nothing else is mandatory, and `normalize()` fills `trace_id` and
`span_id`.

**Where the keys in `jobs` come from — because the record above does not say, and cannot be produced
without knowing (J-3).** `gh run view --json jobs` returns each job's **display name**. It does not
return the key the job has in the workflow YAML; the REST API does not expose it. A record carrying
`jobs.verify` is therefore only producible by a **name → key map** over the names this repository
actually uses — `docs, tools and log integrity` → `verify`, `suite (Testcontainers)` → `test`,
`red-proof` → `red-proof`. Three rules govern it:

- **unmapped names are slugified, never dropped.** An unmapped job must still reach `checks`, or a
  failure in it is invisible to constraint 2 — which is the corruption this section exists to
  prevent;
- **a key collision must not let a `PASS` overwrite a `FAIL`.** Two jobs slugging to the same key
  write the same property, last one wins, and constraint 2 breaks inside the function that enforces
  it. Unlikely, one line, and the failure is silent;
- **the map is checked against the workflow.** `JOB_KEYS` is a set of strings in a `.mjs` file keyed
  off strings in a `.yml` file, with nothing asserting the two agree — *a constraint imposed in one
  place and enforced in another that is never run*, which is F2's shape a fourth time. Rename a job's
  `name:` and `jobs.verify` silently becomes `jobs["docs-tools-and-log-integrity"]`; rename
  `red-proof` and `red_proof` reports `"not-applicable"` for a run in which it ran.
  `tools/test/collect-ci.test.mjs` therefore asserts that every job `name:` in
  `.github/workflows/verify.yml` is a key of `JOB_KEYS`, and every value of `JOB_KEYS` is a job key in
  that file. No YAML parser is needed, and it turns a silent drift into a `verify` failure at the
  moment of the rename.

**Steps carry a name and no command either**, so `checks.depcruise` is decided by matching the
`verify` step named `layering (QS-10)`. A run with no such step records **`"not-run"`**, never
`"pass"`. That third value is chosen to **fail closed**: `check.mjs:128` reads anything other than
`'pass'` as FAIL, so a run predating the phase-4 block reports a layering check that did not happen
rather than one that passed — the exact silence C4 must not record. It is lowercase and carries no
`FAIL` substring and no ratio, so constraints 1, 2 and 3 all hold. Its consequence for append order
is in §7's backfill obligation, and it is not the one constraint 4 was written for.

**Five constraints imposed by the consumer, `tools/slice/check.mjs`.** They are not obvious from the
schema and getting them wrong makes the Definition of Done silently wrong. The first three were in
the step-1 draft and all three were verified correct by the implementer at step 2; **4 and 5 are
O-2**, and have exactly the property that justified listing the first three:

1. `checks.depcruise` must be the **lowercase** string `"pass"`. `check.mjs` compares it by equality
   for the *layering clean* check.
2. `check.mjs` decides *red before green* and *tests green* by regex over
   `JSON.stringify(e.checks)`: `/FAIL|\b0\//`. Therefore the invariant is:
   **`JSON.stringify(checks)` contains the substring `FAIL` if and only if the run failed.**
   Hence the uppercase `PASS`/`FAIL` in `jobs` and `suites`, and hence `depcruise: "fail"` alone is
   not sufficient signal — a run where only layering failed must also carry `jobs.verify: "FAIL"`.
3. **No ratio strings.** `"12/12"`-style values are forbidden anywhere in `checks`, because
   `\b0\/` in a value like `"0/0 skipped"` would classify a green run as red. Counts, if wanted, go
   in separate numeric fields.
4. **Records are appended oldest-run-first.** `check.mjs:113` is `const lastRun = runs.at(-1)` —
   positional in log order, **not** by timestamp. `gh run list` returns newest-first, so a collector
   that appends in `gh` order judges *tests green* on a stale run. The collector therefore sorts by
   `updatedAt` **ascending** before appending. Invisible in a single-run collection; it appears the
   first time anyone collects a backlog at a gate, which is exactly when it is trusted.
5. **`ts` is the run's `updatedAt`, never the collection time.** `check.mjs:100` compares
   `Date.parse(e.ts) > Date.parse(failing.ts)` **strictly**, and `schema.mjs:137` does
   `out.ts ??= new Date().toISOString()` — so a collector that omits `ts` silently gets *now*.
   Collect a red run and its later green run in one invocation, both records get near-identical
   timestamps, the strict `>` fails, and **C1 reports FAIL on a correctly test-first slice** — the
   criterion this whole slice exists to make passable. This also binds `--from-file`: a replay must
   carry the run's original `updatedAt`, or offline collection reintroduces the bug through the back
   door.

A green run's `checks` therefore contains no `FAIL` anywhere — including in a job named for a failure
concept. `red_proof` uses `"success" | "failure" | "not-applicable"`, which is why it is lowercase
and why the third value is not `"NOT-FAILED"`.

**What is deliberately not fixed here.** The deeper problem behind constraint 4 is that
`tools/slice/check.mjs` orders by position rather than by timestamp, and the collector should not have
to compensate for its consumer. That change is **out of this slice's scope** and is recorded in
§11.5: the log is append-only and chronological by construction, so ordered appends are a property it
should have anyway — and changing the gate tool in the slice that first feeds it is how a gate ends
up agreeing with its own bug.

### How it is tested

**Two pure exports, and the division between them is load-bearing (F6).** The step-2 draft named only
`toCheckRunRecord(ghPayload, { slice, collectedVia })` — a single-run mapper. But **constraint 4 is a
property of a list**, so with only that export the ordering would have lived in the CLI wrapper,
where no unit test can reach it: a constraint imposed in one place and enforced in another that is
never exercised. The same defect as the `lint:arch` guard's, in a different file.

| Concern | Where it lives | Why |
|---|---|---|
| field mapping, and `ts` from the run's `updatedAt` (constraint 5) | `toCheckRunRecord(ghRun, opts)` — pure | a per-run fact |
| **ascending order by `updatedAt` (constraint 4)** | **`toCheckRunRecords(ghRuns, opts)` — pure** | a property of the list, and the only place a test can see it |
| the `gh` invocation, reading `docs/team-log/.scope`, skipping runs already present by `checks.run_id` | the CLI wrapper | all of it is I/O, and idempotence requires reading the log |

Both stay exported: the plural is authoritative for order, the singular for shape. Idempotence must
**not** migrate into the pure function — it needs the log, which makes it I/O, and a pure function
that reads a file is neither.

`tools/test/collect-ci.test.mjs` — **the test-engineer's**, per O3 (§11.4) — feeds `gh` payloads and
asserts:

- the record validates against `schema.mjs`;
- the `FAIL` invariant holds in **both** directions;
- `depcruise` is lowercase `pass` on the green fixture;
- `slice:check`'s *red before green* logic classifies the pair correctly — i.e. the two records are
  fed to the same predicate the DoD uses;
- **(O-2)** given a payload holding two runs in `gh`'s newest-first order, **`toCheckRunRecords`**
  returns them ascending by `ts`, and each record's `ts` equals its run's `updatedAt` — not the
  collection time.

The fourth assertion is the one worth having: it is easy to write a collector whose output looks
right and which the gate tool reads as green. The fifth is the one that would otherwise be found by
C1 failing on a slice that did nothing wrong.

**Fixture provenance, and the one thing that cannot be captured.** The test-engineer asked for real
`gh` payloads rather than hand-authored ones, and is right — a fixture captured from the tool beats a
fixture that encodes someone's belief about the tool. With one correction it could not have known:
**only the green payload is capturable today.** A payload in which the acceptance suite failed while
`verify` passed cannot exist in this repository until a red commit runs under the phase-4 block,
which is slice 00. Therefore:

- the **green** payload is captured from a real `verify` run on PR #4 (`gh run view <id> --json …`)
  and committed under `tools/test/fixtures/` with a header naming the run id, its URL and the capture
  date;
- the **red-proof-shaped** payload is *derived* from that captured payload by editing conclusions,
  and its header says so in as many words. A derived fixture labelled derived is honest; two
  hand-authored fixtures described as captured are not;
- if the authoring role has no `gh`, the orchestrator supplies the capture. Nobody hand-authors the
  field list from this document.

---

## 7. The CI wiring, and how 00a's red is observed

### The split, and the criterion that decides it

`.github/workflows/verify.yml` says in its own header what governs this: *"It contains only what
passes with no `src/` in the repository, on purpose… Everything that needs `src/` is at the foot of
this file as a clearly marked PHASE 4 block."* **The criterion is "does it need `src/`", not "which
phase does it belong to."** `npm test` does not need `src/` — it needs a Docker daemon, which
`ubuntu-latest` has. The step-1 draft bundled the suite into the phase-4 block with `typecheck`,
`lint:arch` and `red-proof`, which grouped by phase and put the suite three commits later than the
criterion allows. Corrected here; see §0's sixth row for why that mattered more than tidiness.

**The red commit** (test-engineer) adds **one new job**, in its final form:

```yaml
test:
  name: suite (Testcontainers)
  runs-on: ubuntu-latest      # ships a Docker daemon — TC-9, ADR-0010
  steps: checkout · setup-node 22.x · npm ci --engine-strict
       · npm test -- --reporter=json --outputFile=test-results.json
       · upload-artifact: test-results.json   (if: always(), retention 90)
```

No `needs:`, no `continue-on-error`, and no `services:` block — Testcontainers starts its own
`postgres:16` (§7.2, §7.4). It is the same job the phase-4 design already called for; it lands
earlier, so nothing new is invented and the job is never restructured mid-slice.

**Why it is the test-engineer's, and why it is in the red commit.** `verify.yml` is on neither role's
deny list. AC-1's evidence is that the container starts and the suite connects, which is the same
argument that gives them `tests/setup/`; and `CLAUDE.md` §2.4 makes the red commit responsible for
being **observed**. A commit that creates a red nobody can see has not discharged its obligation.

**Green commit 9** (implementer) then adds only what genuinely needs `src/`:

```yaml
# on the existing `verify` job, after install:
- name: typecheck            run: npm run typecheck      # tsc --noEmit -p tsconfig.json
- name: layering (QS-10)     run: npm run lint:arch      # node tools/ci/lint-arch.mjs — §5

# and one new job:
red-proof:                   needs: [verify, test]   if: always()
```

### What CI must report on the red SHA

Stated as a prediction so step 5 checks one rather than forms an impression. `verify.yml` triggers on
`pull_request`, and PR #4 is open on this branch, so the run happens on the push — nothing has to be
enabled for it to occur.

| Job | Expected | Why |
|---|---|---|
| `verify` | **PASS** | install, `docs:check`, `test:tools`, the diagram check and the log-integrity checks. The three new `tools/test/*.test.mjs` are deliberately unwired (§11.4), so `test:tools` stays green — which is now load-bearing for a second reason: a wired-in tool test would fail earlier in this job and abort the observation below |
| `test` | **FAIL** | `tests/acceptance/health.test.ts` — both AC-2 cases, no service to spawn — and `tests/architecture/layering.test.ts`'s AC-3 case, where **the cruise examines no module under `src/`**. *(Not "`depcruise` cannot open `src`": §4's `mkdirSync` creates it, so the command succeeds over an empty directory — F1, corrected at step 3.)* **Passing in the same run:** `tests/integration/postgres-harness.test.ts`, because that same `mkdirSync` keeps `globalSetup` working, and `layering.test.ts`'s AC-4 fixture cases |

**That pair is the discrimination itself.** `verify` green proves the branch is sound; `test` red
proves the acceptance suite failed. It is exactly what `red-proof` automates from slice 00 onward,
performed here by two job conclusions a human can read — which is why the suite needed its own job at
the red commit and not a step inside `verify`.

**One requirement on the test author, because C1 distinguishes an assertion from a missing import.**
The acceptance test must fail **inside its test body**, not at collection time: the spawn helper
waits with a bound and then fails with a message naming what it tried, so the Vitest JSON shows a
failed assertion in a collected file rather than a load error. That distinction is what C1's *"a real
assertion failure rather than a missing import"* is about, and it is visible in the artifact.

### The `red-proof` job's mechanics

Six details, each of which is a way to get this wrong:

1. **Reading the commit subject.** On a `pull_request` event the checked-out `HEAD` is GitHub's
   *merge* commit, whose subject is `Merge <sha> into <sha>`. The subject must be read from the head
   commit explicitly:
   `git log -1 --format=%s ${{ github.event.pull_request.head.sha || github.sha }}`.
2. **`red-proof` needs its own checkout.** It is a **new job** on its own runner with its own
   workspace, so it carries its own `actions/checkout@v4` with `fetch-depth: 0`; without the full
   history `git log -1 <head.sha>` fails on an unfetched object. The step-1 draft said `fetch-depth`
   was *"already set on the existing job"*, which is true and irrelevant — jobs do not inherit
   workspaces. Corrected at step 2.
3. **The decision is a tested script, not inline YAML.** `tools/ci/red-proof.mjs`, with
   `tools/test/red-proof.test.mjs` wired into `npm run test:tools`. ADR-0010's Consequences already
   anticipate this — *"two checks live as inline shell and `node -e` in YAML … if they grow, they
   become `tools/` scripts with tests in `tools/test/`"* — and this one grows past ten lines the
   moment it has to classify per-suite results.
4. **The invocation contract** (O3: four exit-code cases cannot be written against an unspecified
   call). Three required argv flags, nothing read from the environment, nothing from the network:

   ```
   node tools/ci/red-proof.mjs --subject-file <path> --verify <conclusion> --results <vitest.json>
   ```

   | Flag | Value |
   |---|---|
   | `--subject-file` | a file holding the head commit's subject, written by the workflow as `git log -1 --format=%s <sha> > subject.txt`. A file rather than `--subject <string>` because a commit subject is arbitrary text and must not be re-quoted through a shell |
   | `--verify` | the `verify` job's GitHub conclusion — `success`, `failure`, `cancelled`, `skipped` |
   | `--results` | path to the Vitest JSON reporter output, downloaded from the `test` job's artifact |

   Exit codes: **0** rule satisfied, or not applicable · **1** rule violated, with the failing
   condition named on stdout · **2** usage or I/O error. The module exports a pure
   **`judge({ subject, verifyConclusion, failedFiles })` → `{ ok, reason }`**, mirroring §6's
   `toCheckRunRecord` split, so every case is unit-testable without spawning a process.

   **`failedFilesFrom` yields paths rooted at the repository (`tests/…`) whichever machine produced
   the JSON — and that is a precondition of evidence item 3, not a detail of it.** Vitest records the
   **absolute path of the machine that ran the suite**, so a replayed artifact names
   `/home/runner/work/keyloop-challenge/keyloop-challenge/tests/…`. The step-2 wording said the
   distinct failing `testResults[]` entries were *"made repo-relative"*, and `relative(cwd, name)` on
   that input yields `../../../home/runner/…`, matching neither the red zone nor the must-pass set —
   so **a genuinely red run replays as "no suite failed" and exits 1**, the discriminator reporting
   the opposite of what happened, on the one path that exists to check it. It passes in CI only
   because the `test` job shares the workspace (**J-2**).

   The normalisation is therefore: **relative to the working directory when the file is inside it,
   and otherwise from the last `/tests/` segment** — *last*, not first, because a checkout directory
   may itself be called `tests`. Two alternatives were considered and rejected. A `--repo-root` flag
   adds a fourth flag to a contract deliberately kept at three, and requires the replayer to know the
   runner's workspace path. Matching the rule patterns against a path *suffix* drops the `^tests/`
   anchor entirely and is strictly weaker.

   **And it must be tested on the shape Vitest actually emits.** §6's own rule — *"a fixture captured
   from the tool beats a fixture that encodes someone's belief about the tool"* — was honoured for
   the `gh` payloads and not for the Vitest JSON: `tools/test/red-proof.test.mjs` never imports
   `failedFilesFrom`, and its CLI cases feed names that are already repo-relative, which Vitest never
   produces. The branch J-2 fixed is therefore exercised only on its trivial path and a regression in
   it would be silent — J-1's shape a third time. At least one case, CLI and pure, must use
   runner-absolute names lifted verbatim from run 33831214774's artifact, which turns a one-off manual
   replay into a wired-in regression test.

5. **The rule.** It exits 0 when:
   - the subject does **not** match `^test\(.+\): .*\(red\)$` — *not applicable*, nothing asserted; or
   - the subject matches **and** all three of AC-6's clauses hold:

   | AC-6's words | The condition |
   |---|---|
   | *"install, typecheck, lint … all passed"* | the `verify` job concluded `success` |
   | *"… and unit all passed"* | **no** failing test file under `tests/unit/` — that directory alone, because it is the only one AC-6 names |
   | *"the acceptance suite failed"* | **at least one** failing test file under `tests/(acceptance\|contract\|property\|concurrency\|integration\|architecture\|performance)/` |

   It exits 1 otherwise, naming which condition failed. A branch that does not compile fails
   `verify`, so it is reported as a **broken run, not a red proof** — which is the entire
   discrimination ADR-0010 Decision 3 asks for.

   **This is O-1, and the human ruled it.** The step-1 draft required the failure to lie under
   `tests/acceptance/` and forbade any failure outside it. The implementer showed that makes slices
   07 and 11 structurally unable to pass — `docs/slices/07-reschedule-under-contention.md` names only
   `tests/concurrency/`, `docs/slices/11-performance-budget.md` only `tests/performance/` — and that
   the negative half was stricter than AC-6, which constrains what must *pass*. The human ruled on
   2026-09-04 that **AC-6's "the acceptance suite failed" reads broad**: any test-engineer-owned
   suite. No acceptance criterion changed.

   The implementer's proposed negative condition — *no failure under `tests/unit/` **or
   `tests/integration/`*** — is **not** adopted, and this is the one place the remedy is narrower
   than the objection asked. It would break the very next slice:
   `docs/slices/00-schema-and-exclusion-constraints.md` names exactly one test file,
   `tests/integration/exclusion-constraints.test.ts`, and `CLAUDE.md` §5 assigns database-invariant
   integration tests to the test-engineer *precisely so that they can be red first*. Slice 00's red
   commit reddens `tests/integration/` and nothing else. So `tests/integration/` is in the red zone,
   and the must-pass set is `tests/unit/` alone — which is also, exactly, what AC-6 says.

6. **Six cases in the unit test**, and they are what actually satisfies AC-6:
   red-marked + acceptance-only failure + verify green → exit 0;
   red-marked + **concurrency**-only failure + verify green → exit 0 *(slice 07)*;
   red-marked + **integration**-only failure + verify green → exit 0 *(slice 00)*;
   red-marked + a failure under `tests/unit/` → exit 1;
   red-marked + everything green → exit 1 (a red proof that was not red);
   unmarked subject → exit 0, "not applicable".

The job's conclusion is therefore **success when the required failure was observed**, and the check's
name makes that inversion visible rather than hiding it in `continue-on-error`.

### How 00a's red is evidenced

Four items. The first is the **observation `CLAUDE.md` §2.4 requires**; the rest support it. The
step-1 draft had five, of which four were substitutes for an observation it had assumed impossible —
see §0's sixth row.

1. **The CI run on the red SHA.** `verify` green, `test` red, the failing files and the assertion
   text in the job log and in the uploaded `test-results.json`. This is the observation itself, and
   it is what `METHODOLOGY.md:335` obliges the orchestrator to log at step 3 — *"the red commit SHA
   and the CI run that observed it failing, with the failing assertion quoted"*. The old items 1 and
   2 (the commit; a green `verify`) are absorbed into it: the SHA is what the run is *on*, and the
   green `verify` is the discriminating half of the same run.
2. **The red commit itself**, in git, permanent — `test(00a): … (red)`, authored by the
   test-engineer, one commit, per `CLAUDE.md` §7.
3. **`tools/ci/red-proof.mjs`, replayed offline against that run's own artifact.** Its contract takes
   `--results <path>` and reads nothing from the environment, so once it exists at green commit 8 it
   can be run against the red commit's downloaded `test-results.json` with `--verify success` and the
   red SHA's subject: expected exit 0. **This narrows AC-6's bootstrap paradox rather than papering
   over it** — `red-proof` still cannot *judge* the commit that introduced it as a live job, but it
   can judge it as a replay against real data instead of only as logic over hand-made cases. It is
   supported by `tools/test/red-proof.test.mjs`, which proves the discriminator correct in all six
   cases and which under O3 is now the **test-engineer's** (§11.4) — a substitute for an independent
   check has to be independent itself.
4. **The reviewer's and the human's observation** at steps 5 and 6, recorded on the PR.

**Item 5 of the step-1 draft is withdrawn.** It asked the test-engineer to run `npm test` locally at
the red commit and return the verbatim assertion output. There is **no container runtime on either
role's machine** (§11.5), so `globalSetup` cannot start PostgreSQL and a local run produces a
Testcontainers crash rather than assertion failures — the same "red for the wrong reason" this design
rejects elsewhere. It is also no longer wanted: item 1 carries the assertion text with better
provenance, being third-party, durable and machine-readable rather than narration.

**AC-4 is green on arrival, and that is honest rather than a test-first violation.** Its fixture
exercises `.dependency-cruiser.js`, which was authored at Gate B and already exists, so the test
passes the moment it is written. `CLAUDE.md` §2.4 requires the *slice* to begin red, not every
criterion to have its own red; 00a's red comes from AC-1, AC-2 and AC-3. Stated here so it is not
raised at step 5 as a finding — and it is a second reason the test-engineer's AC-3 addition (§5)
earns its keep.

### C1 is measurable for 00a, by backfill — correcting this design

The step-1 draft asserted that **C1 is unmeasurable for slice 00a by construction**, reasoning that
`check.run` is emitted by `collect-ci.mjs`, which this slice builds, so at the moment the red commit
is authored there is nothing to record the red run with. **That reasoning was wrong, and the error is
worth naming: it conflates the moment of *authoring* with the moment of *recording*.** A CI run is a
durable artifact in GitHub's API; the collector derives from it whenever it is run, not only as it
happens. Nothing in ADR-0010 or in C1 requires the two to be simultaneous — only that the record be
*derived* rather than narrated, which is what `allowDerived` earns.

Three properties already in this design make the backfill work, and two of them were adopted for
other reasons:

- `collect-ci.mjs` accepts **`--run <id>`** and is **idempotent** on `checks.run_id` (§6), which is
  what backfill and gate-time re-collection need;
- **O-2 constraint 5** stamps `ts` from the run's `updatedAt`, not from collection time. Adopted to
  stop C1 reporting FAIL on a correct slice; here it is the enabling condition, because the red run's
  `updatedAt` is genuinely earlier than the green run's however late both are collected;
- **O-2 constraint 4** appends oldest-run-first, so the two records land in the order `check.mjs`
  reads.

**The orchestrator's obligation, which is not optional.** If this reads as a possibility it will not
happen, and the criterion returns to unmeasured:

1. At step 3, record the **run id** of the CI run on the red SHA in the step-3 log entry, alongside
   the SHA and the quoted assertion (`METHODOLOGY.md:335`).
2. At the gate, after `collect-ci.mjs` exists (green commit 7), run it for **both** that red run and
   the green run at the branch tip, in one invocation or in ascending `updatedAt` order. **This now
   matters twice, not once.** The original reason was C1: `check.mjs:113` is `runs.at(-1)`,
   positional in log order, so an out-of-order append judges *tests green* on a stale run. The second
   reason arrived with J-3's `"not-run"` — the red run **predates the layering step**, so its record
   carries `depcruise: "not-run"`, and `check.mjs:126` is `[...events].reverse().find(…)`, newest **by
   log position**. Append the red run after the green one and the layering check reads `not-run` and
   reports FAIL on a correct slice. It is constraint 4's bug on a different criterion, and the two are
   mirror images: constraint 4 protects the red-before-green reading, this protects the layering one.
3. For the red run, **`suites` is omitted, not invented.** `gh run view --json jobs` yields job and
   step conclusions only; per-suite results come from the Vitest JSON, which no collector parses.
   §6's rule stands — the collector writes nothing it did not compute — and an omitted field is
   honest where a guessed one would corrupt the very record C1 reads. `checks.jobs` carries
   `{"verify": "PASS", "test": "FAIL"}`, which satisfies the `FAIL`-iff-failed invariant on its own.

With those three done, `check.mjs` sees a failing `check.run` whose `ts` precedes a passing one and
**C1 is measured on 00a** — the pilot's fatal criterion exercised on the pilot's own precursor rather
than deferred.

**The fallback, if the backfill does not happen.** Then and only then is C1 recorded as
`UNMEASURABLE`, never as a pass — and the retro must state that the phase-4 decision rule is **not
applied** to it at all, because the rule has no row for `UNMEASURABLE`: C1 *failing* is fatal, C1
*unmeasured* is neither pass nor fail, and left unsaid it quietly reads as "not fatal, therefore
fine" — the same defeat as counting UNVERIFIED as PASS. Raised by the test-engineer at step 2, and
kept here as the fallback it now is rather than the expected outcome it was.

Nothing in `process-criteria.md` is edited by this design. C1 stands as written; it is
pre-registered, and a criterion edited after seeing a result is not a criterion.

---

## 8. Data-model delta

**None.**

No tables, no columns, no constraints, no migration files. `src/persistence/schema.ts` exports an
empty `Database` interface, which is a TypeScript typing seam and not a data model — Kysely's type
parameter has to be *something*, and `{}` is the truthful value while there are no tables. The
migrations directory is created and left empty (§4).

Stated under its own heading rather than omitted, because "the data model section is missing" and
"the data model does not change" are different claims and only one of them is checkable.

---

## 9. Quality scenarios

**QS-10 — the layering is the ruleset, and the ruleset runs.** The only scenario in scope. This slice
must make **five** things true, and all five are required — the scenario is not satisfied by any
four. The fifth was added at step 2 by O1, and it is the one that keeps the other four honest:

1. `depcruise src tests` with `.dependency-cruiser.js` exits **0** against the real tree of §1.
2. `npm run lint:arch` runs **in CI** on every push and pull request, so (1) is a build gate and not
   a command someone remembers to run (`CLAUDE.md` §2.3).
3. Each of `domain-is-pure`, `sql-only-in-persistence`, `http-must-not-reach-persistence` and
   `outside-in-tests-do-not-import-src` is shown to **fire by name** against an injected violation
   (§5) — including, for `sql-only-in-persistence`, a **type-only** import, without which
   `tsPreCompilationDeps` could silently regress and the rule would still appear to work.
4. A conforming fixture tree produces **zero** violations (the negative control), so (3) is evidence
   of discrimination rather than of indiscriminate rejection.
5. **The ruleset is proved to have *run*, not merely to have exited 0.** Every cruise this slice
   depends on — the two fixtures and `lint:arch` itself — asserts that
   `summary.environment.issues` is empty and that modules were actually cruised, **before** reading
   any violation. Without (5), (1) and (4) are both satisfied by a run that analysed nothing, which
   is not a hypothesis: it is what was measured at step 2 (§5).

QS-12 (`tests/architecture/ambiguity-containment.test.ts`) is **not** in scope: it scans for domain
arithmetic that does not exist yet. It arrives with slice 01.

---

## 10. Proposed arc42 edits, and one ADR

### Edits at step 7, inside the slice's declared scope

The scope is the seven sections the human added to the slice's `arc42:` field on 2026-09-04:
**§5.2 · §5.3 · §7.1 · §7.2 · §7.4 · §8.5 · arc42 §11.2**. (Numbers prefixed *arc42* below where this
document also has a section of that number.)

| Section | Correction |
|---|---|
| **§5.2** | The as-built file list of §1; the `Db` alias and why nothing above persistence names `Kysely`; **`ServerDeps` as the http seam, in the narrowed form of §2(c) — `src/http` cannot *name* the handle's type — with the generic-parameter counterexample recorded beside it**; `/health` described as an operational probe outside §8.6's table; `src/domain` recorded as deliberately empty until slice 01, with the reason |
| **§5.3** | The first render of the module dependency graph. It shows **four** modules, not five: `src/domain` is deliberately empty, so nothing to cruise. Eyeball it rather than trust it — §5 explains why an empty graph and a clean graph look identical |
| **§7.1** | **The compose delta, as the human ruled:** `docker-compose.yml` starts `postgres` and `otel-lgtm` only, and the service runs on the host via `npm start`. §7.1 currently draws a third `scheduler` container. Containerising the app needs a Dockerfile, a build stage and an image-caching story maintained through twelve slices for no demo benefit. **And the corrected Node range (F7):** §7.1's published *"Node ≥ 22.11 < 25"* is wrong in two ways, and the correction is a visible change to a published number rather than a silent fix — see §11.3 |
| **§7.2** | The harness as built: global setup, one container per run, **no reuse** and why; `provide`/`inject` rather than ambient env; the migration call that applies zero migrations, why it is unconditional, and why `globalSetup` also ensures the directory exists; **the two Vitest projects, `db` and `nodb`, split by whether a test needs the database — `test:domain` becomes `test:nodb` and lands here rather than in slice 01, with the Docker-less reason (§4)**; the `build` → `pretest` → spawn `dist/main.js` path the acceptance tests take |
| **§7.4** | Replace the PHASE 4 comment block's description with what shipped, **and with the split criterion that governs it — *needs `src/`*, not *belongs to phase 4***: the `test` job landing in the **red commit** so the red is observed in CI (`CLAUDE.md` §2.4), and only the two `verify` steps and the `red-proof` job deferred to green commit 9. Also: `red-proof`'s own checkout and tested script, the `test-results.json` artifact, **`lint:arch` as `tools/ci/lint-arch.mjs` and what it guards**, and the note that `red-proof` could not judge the commit that introduced it as a live job — only as a replay against that run's artifact |
| **§8.5** | The `tests/setup/`, `tests/support/` and `vitest.config.ts` ownership ruling; the shape of `tests/architecture/layering.test.ts` including the negative control and the environment guard; `tools/test/` as the home of the three tool-level tests, now test-engineer-authored (§11.4); **and the `tests/integration/` boundary rule below** |
| **arc42 §11.2** | Close R-8's first row: `collect-ci.mjs` exists after this slice, so the claim *"`check.run` remains unemitted"* is no longer true. The rest of R-8 stands until slice 00 makes C1 measurable |

**The `tests/integration/` boundary, for §8.5.** `CLAUDE.md` §5 says integration tests *"asserting a
database invariant"* belong to the test-engineer, and that phrase will not survive slice 05. The
test-engineer claimed `tests/integration/postgres-harness.test.ts` under it and asked to be corrected
if the boundary reads differently. **Confirmed, with the boundary stated structurally instead:**

> A `tests/integration/` file that reaches the database **only through a connection string** is the
> test-engineer's. One that **imports a `src/` module** and drives it against the database is the
> implementer's.

That is checkable by looking at the imports rather than by arguing about what counts as an invariant,
and it matches how §5 already reasons. `postgres-harness.test.ts` is the test-engineer's under it: it
asserts AC-1, it asserts the harness contract every later invariant test stands on, and the
test-engineer owns `tests/setup/` — splitting the harness from its own assertion would be arbitrary.

### ADR

**ADR-0011 — `/health` is an operational probe outside the API contract. Status: `proposed`.**

Nothing in ADR-0005..0010 settles whether an operational probe joins §8.6's RFC 9457 taxonomy, is
emitted into the OpenAPI document, or is traced as a business span. It is a real fork with real
downstream consequences at slices 09 and 10, and it is not the architect's to close alone, so it is
raised as a proposed ADR rather than decided inline. The recommendation is that `/health` stays
outside all three. A `status: proposed` ADR is a technical-debt item by construction and appears in
arc42 §11.1's generated register until the human rules at the gate.

Adding the ADR mechanically regenerates two **generated-tier** blocks — the index in arc42 §9 and the debt
register in arc42 §11.1 — via `npm run docs:build`, which CI's `docs:check` requires. Those are generated
content, not authored sections, and are outside the slice's declared `arc42:` scope only in the
trivial sense that generated blocks always are.

No other ADR is needed. In particular: the composition-root seam is ADR-0008 applied, not a new
decision; `tools/ci/red-proof.mjs` as a tested script rather than inline YAML is ADR-0010's own
stated escape hatch; and Fastify, Kysely, `node-pg-migrate`, Vitest and Testcontainers are all
already decided.

---

## 11. Rulings in force, the build split, and what is deferred

### 11.1 What the human ruled, and what is withdrawn

The step-1 draft raised four open questions. **Three are ruled and one is withdrawn; none is open.**

1. **Scope — ruled.** The slice's `arc42:` field gains **§7.1, arc42 §11.2, §5.3 and §7.4**. §7.4 was
   not in the original ask: it is needed because O1 makes `lint:arch` a script rather than a bare CLI
   invocation, and §7.4 describes the workflow. The slice file's frontmatter is updated to match.
2. **The first module graph — ruled** with (1). §5.3 is in scope; the render lands in this slice and
   shows four modules (§10).
3. **compose — ruled as recommended.** `postgres` and `otel-lgtm` only; the service runs on the host
   via `npm start`. Recorded in §7.1/§7.2 at step 7.
4. **Implementer-authored tool tests — WITHDRAWN, not ruled.** The question asked the human to accept
   weaker provenance for AC-5 and AC-6 on a premise the test-engineer then falsified: `test:tools` is
   a literal `&&` chain, not a glob. The recommendation did not survive the fact, so it is withdrawn
   rather than re-argued. See §11.4.

### 11.2 The `.dependency-cruiser.js` amendment — **applied**

Applied by the architect at step 2, before the red commit; it is the architect's file (`CLAUDE.md`
§2.3) and both roles need it. `outside-in-tests-do-not-import-src`'s `from.path` is now:

```
^tests/(acceptance|architecture|concurrency|contract|performance|property|setup|support)/
```

`tests/support/` holds the acceptance harness's spawn helper, and a helper there could import `src/`
and hand it to an acceptance test — the independence the rule exists to protect, spent through a file
nobody would think to look at. Including `architecture` and `performance` also makes Gate B's
ownership ruling structural rather than only guarded by the path hook.

**`setup` is the architect's own addition and neither reviewer reviewed it.** Flagged here rather
than slipped in. The reasoning is identical to `support`: `globalSetup` importing `src/` and handing
it around through `provide()` is the same loophole in a different file. It has a real consequence at
slice 00 — seeding helpers cannot be typed against `src/persistence/schema.ts` and must go through
raw SQL — which is what the rule's own comment already requires (*"they reach the system the way a
client does — over HTTP, and over SQL against the real database"*). `tests/unit/` and
`tests/integration/` stay out: both legitimately import `src/`.

The rule keeps its name, so **AC-4 is unaffected**, and the implementer verified at step 2 that
`layering.test.ts` is unaffected — it reaches `.dependency-cruiser.js` as a subprocess path argument
and imports nothing.

### 11.3 The build: what exists, who authors it, and in which commit

This subsection is O2. The step-1 draft listed nine source files and never said what turns them into
a running process, so AC-1 (*"`npm ci && npm test`"*) and AC-2 (*"given the service is started"*)
were both unbuildable.

**There is no TypeScript loader. The service is compiled.** The objection asked for one; it is
declined. `tsx` is named in neither `CLAUDE.md` §3 nor any ADR, so adopting it would be a DCR-shaped
move for a convenience; and Node 22.11's `--experimental-strip-types` does not remap `./foo.js`
specifiers onto `foo.ts`, which is how every import in this codebase is written under NodeNext. Since
`typescript` is being installed anyway (O1) and `tsc` must run for `typecheck`, compiling costs no
new dependency — and it means the acceptance test spawns **the artifact a deployment would run**,
which is a better answer to AC-2 than any loader can give, because a loader-only project has never
proved it emits.

**Scripts, and who authors each:**

| Script | Value | Author |
|---|---|---|
| `test` | `vitest run` — runs **both** projects, one `test-results.json` (§4) | test-engineer, red commit |
| `test:nodb` | `vitest run --project nodb` — the Docker-less subset (§4) | test-engineer, red commit |
| `build` | `tsc -p tsconfig.build.json` | implementer, green |
| `pretest` | `npm run build` | implementer, green |
| `start` | `node dist/main.js` | implementer, green |
| `typecheck` | `tsc --noEmit -p tsconfig.json` | implementer, green |
| `db:migrate` | the `node-pg-migrate` CLI against `src/persistence/migrations` | implementer, green |
| `lint:arch` | `node tools/ci/lint-arch.mjs` — replaces the bare CLI (§5) | implementer, green |

**`pretest` is the load-bearing choice.** npm runs it automatically, so in the end state
`npm ci && npm test` builds and then tests — AC-1 satisfied literally. And because it does not exist
at the red commit, `npm test` there goes straight to `vitest run`: the red is a set of **assertion
failures**, not a `tsc` error about a missing `src/`. It also means the test-engineer never authors,
and never later hands over, a `test` script that mentions a build. No `dev` script is created — no
acceptance criterion needs one, and slice 10's cURL harness can use `start`.

**Configuration files:**

| File | Contents | Author |
|---|---|---|
| `tsconfig.json` | `include: ["src","tests"]`, `noEmit`, NodeNext + `strict` + `verbatimModuleSyntax` | test-engineer, red commit — Vitest, `depcruise`'s `tsConfig.fileName` and the AC-4 fixture's mirrored `compilerOptions` all need it before any `src/` exists |
| `tsconfig.build.json` | extends it; `include: ["src"]`, emit on, `outDir: "dist"` | implementer, green |
| `vitest.config.ts` | **two projects, `db` and `nodb`** (§4); `globalSetup` on `db` only; **`include` scoped to `tests/**`** | test-engineer, red commit |
| `.gitignore` | `dist/` **and `test-results.json`** (F8 — the Vitest JSON reporter writes it locally as well as in CI, so it would otherwise appear in every working tree) | implementer, green |
| `package.json` `engines` | **`">=22.22.0 <23 || >=24.0.0 <25"`** — see below (F7) | implementer, green |

**The commit split.** The red commit carries the test toolchain: `tsconfig.json`, `vitest.config.ts`,
`tests/**` (including `tests/setup/` and `tests/support/`), the three `tools/test/*.test.mjs` files
per §11.4, **the `test` job in `.github/workflows/verify.yml`** (§7 — without it the red is never
observed and the board cannot leave `red`), and these dependencies —

- **devDependencies:** `vitest`, `@testcontainers/postgresql` (+ `testcontainers`), `node-pg-migrate`,
  **`typescript`** (O1: without it the fixture cruises nothing and `typecheck` cannot run),
  `@types/pg`, `@types/node` (F5 — the harness and the fixture builder use node builtins, and `tsc`
  cannot resolve them without it);
- **dependencies:** **`pg`** (O2). It is a runtime dependency of `src/persistence/db.ts`, so it must
  not land in `devDependencies` — `no-dev-dep-in-src` would fire on the legitimate import at step 4 —
  and the test-engineer's harness needs it from the red commit onward.

The implementer's commits then add `src/**`, the remaining runtime dependencies (`fastify`,
`@sinclair/typebox`, `kysely`, `pino`), `docker-compose.yml`, `tools/**`, the scripts and configs
above, and — at commit 9 — the part of the CI wiring that needs `src/`: the `typecheck` and
`lint:arch` steps on `verify`, and the `red-proof` job. Both roles edit `package.json` and
`verify.yml`, sequentially and in different stanzas and jobs; the implementer does **not** modify the
`test` job the red commit landed.

**What *"every implementer commit is green"* (`CLAUDE.md` §7) means in this slice, since there is no
local database.** It is the operative definition the reviewer checks against:

| Check | Before each commit |
|---|---|
| `npm run typecheck` · `npm run lint:arch` · `npm run test:tools` · `npm run build` | locally green |
| `npm run test:nodb` — unit tests, the AC-4 fixture, AC-3 | locally green |
| `npm test` — everything touching PostgreSQL, and both AC-2 cases | **CI only** |

Recommended, though scheduling is the orchestrator's: the implementer **pushes after each of the nine
commits** rather than in batches. They are small, the runs are cheap, and it turns "green" from an
assertion into nine recorded runs — which also feeds C4.

The implementer may still object that scaffolding is landing in a `test(…)` commit; the answer is
AC-1 — *"`npm ci && npm test` starts a container and the suite connects"* is the acceptance
criterion, so the harness that starts it is the test, not the implementation.

**`engines.node` is wrong in two ways, and the fix is the implementer's to apply (F7).** The declared
`">=22.11.0 <25"` promises support the dependency tree refuses. Verified from the installed packages
rather than from report:

```
testcontainers@12.1.0       engines.node  >= 22.22
vitest@5.0.0                engines.node  ^22.12.0 || ^24.0.0 || >=26.0.0
dependency-cruiser@18.2.0   engines.node  ^22 || ^24 || >=26
```

So **22.11–22.21 passes the repository's own floor and then fails `npm ci --engine-strict`** on a
transitive engine; and **23.x satisfies the declared range while `vitest` and `dependency-cruiser`
both exclude it**. The honest intersection under the existing `<25` cap is
**`">=22.22.0 <23 || >=24.0.0 <25"`**.

CI is unaffected — `node-version: '22.x'` resolves above the floor — which is precisely why it must be
fixed rather than deferred: the only person who hits it is a developer the repository told was
supported. On authority: arc42 §7.1 records that *"versions are pinned here because **TC-10
deliberately left them open at Gate A**"*, so TC-10's content is that a pin exists and is enforced,
and the numbers are the architect's Gate B choice. Correcting a range that was never true is not a
scope change, and §7.1 is already inside this slice's declared arc42 scope.

**`typescript` is pinned exactly, and the pin is load-bearing rather than house style (F4).**
`dependency-cruiser@18.2.0` declares its supported compiler range in
`node_modules/dependency-cruiser/src/meta.cjs:14` as `typescript: ">=2.0.0 <7.0.0"` — **not** as a
`peerDependency`. Nothing warns at install time. `npm i -D typescript` today resolves to **7.0.2**,
which is outside that range, so the naïve command a future maintainer types turns every cruise in
this repository into O1's inert cruise: exit 0, nothing examined, `depcruise: "pass"` recorded, C4
reporting an architecture nobody checked.

The pin at `6.0.3` is therefore the **preventive** control and the guards in §5 are the **detective**
ones. Deliberately, this design does **not** claim which symptom an out-of-range compiler produces:
O1 measured an *absent* compiler (`environment.issues` naming `missing-typescript-transpiler`), and
an out-of-range one has not been measured here. The claim made instead is narrower and true — the
`environment.issues` assertion and the per-root coverage assertion are **independent**, so a bump
that evades one is caught by the other. Both the pin and its reason belong in a comment beside the
dependency, where someone bumping it will read them.

**The guard hook.** `.claude/hooks/guard-paths.mjs` did not cover `tests/setup/`, `tests/support/` or
`vitest.config.ts`, so both roles could write all three — and C2 is measured from hook denials, which
makes an unenforced boundary self-reported. Both reviewers found it independently. It is a hook
change and therefore the **orchestrator's**; it has since been made, and `TEST_OWNED` now carries all
three. Recorded here because the ruling is the architect's even where the enforcement is not.

### 11.4 The three tool tests are the test-engineer's

This is O3, conceded outright. The step-1 draft argued that test-engineer-authored tool tests would
be red at step 3, fail `npm run test:tools` and destroy the "red for the right reason" signal. **That
was false.** `test:tools` is a literal `&&` chain of four named files, so a new
`tools/test/*.test.mjs` does not run in CI until someone wires it in. Therefore:

- the **test-engineer** authors `tools/test/collect-ci.test.mjs`, `tools/test/red-proof.test.mjs` and
  `tools/test/lint-arch.test.mjs` in the red commit. They are red, and **invisible to CI** — not
  named in `test:tools`, and not collected by Vitest, whose `include` is scoped to `tests/**` (§4).
  So `verify` stays green on the red commit, which §7 now depends on twice over: it is the
  discriminating half of the observation, and a failure here would abort `verify` before the run that
  observes the red is complete;
- the **implementer** wires all three into the `test:tools` chain in the green commits that make them
  pass.

This costs nothing and buys two things: C2 holds for AC-5 and AC-6 instead of being excepted, and
§7's evidence item 3 — offered as the *substitute* for a check that cannot run on this commit —
becomes independently authored, which is the whole reason it is worth offering.

**The hole this opens, and how it is closed.** The mechanism that makes the arrangement possible is
also a standing bug: a tool test nobody wires in never runs, forever. It is **not** fixed by making
`test:tools` glob, because the arrangement above depends on it not globbing. Instead, the reviewer's
step-5 checklist gains one line:

> **Every file matching `tools/test/*.test.mjs` is named in the `test:tools` chain.**

A globbing runner is recorded as a deferred improvement in §11.5.

### 11.5 Deferred improvements and standing notes

Each is a real improvement that is deliberately not made in this slice, with the reason.

| Item | Why not now |
|---|---|
| **`tools/slice/check.mjs` should order `check.run` records by timestamp**, not by `runs.at(-1)` position (O-2 constraint 4) | Out of this slice's scope, and changing the gate tool in the slice that first feeds it is how a gate ends up agreeing with its own bug. The collector sorts ascending instead; the log is append-only and chronological anyway |
| **`test:tools` should discover `tools/test/*.test.mjs` rather than name them** | §11.4's arrangement depends on the literal chain. Once all three tools are wired, a globbing runner is safe — orchestrator's, and after this slice |
| **`graph:modules` has `lint:arch`'s pre-O1 failure mode**: an empty graph and a clean graph render identically | Cosmetic; it gates nothing. §5.3's first render is eyeballed instead |
| **`docker-compose.yml` does not start the service** (human-ruled, §11.1) | A Dockerfile, a build stage and an image-caching story maintained through twelve slices for no demo benefit. Recorded in §7.1 |
| **The step-1 evidence item 5** — a local `npm test` at the red commit, returned verbatim | **Withdrawn as unavailable**, not deferred: no container runtime means a local run crashes in `globalSetup` rather than producing assertion failures. It is also no longer wanted — the CI run on the red SHA carries the assertion text with better provenance (§7) |

**No container runtime on either role's machine — a stated constraint, not an aside.** `docker` and
`podman` are both absent and `/var/run/docker.sock` does not exist, for the implementer and the
test-engineer alike; `ubuntu-latest` runners have Docker, so CI is unaffected. Reported by the
implementer at step 2 and confirmed before step 3, and it is load-bearing in three places rather than
being background:

- it forced the **two-project split** (§4), because one project makes *every* local test run
  impossible for both roles, including the implementer's inner TDD loop;
- it **withdrew evidence item 5** (§7), which removed the last item compensating for a red that was
  never going to be observed in CI — and so exposed **S-1** (§0);
- it sets the operative meaning of *"every implementer commit is green"* (§11.3): locally green on
  everything that does not need a database, CI-green on everything that does.

The reviewer should read the commit sequence with that in mind rather than treating it as
carelessness.

**Measured at step 4, replacing what step 3 declined to claim: an absent `typescript` and an
out-of-range one are byte-for-byte indistinguishable in the cruise output.** Measured on
`dependency-cruiser@18.2.0` by stashing and then stubbing `node_modules/typescript`: same `exit 0`,
same `totalCruised: 0`, same `transpilersFound[ts].currentVersion: "-"`, same
`missing-typescript-transpiler` issue with an **identical description string** — because the
description interpolates the *supported range*, and `typescript-wrap.mjs` short-circuits on the range
check without ever loading the compiler to read its version.

The step-3 draft deliberately refused to say which symptom an out-of-range compiler produces, because
only an absent one had been measured. That refusal was right, and the measurement now lets this
design say something **stronger** than it could then: nothing in the JSON names what is installed, so
**no version-comparison guard can be built from that output at all.** Gating on
`summary.environment.issues` is not one option among several — it is the only one available, and the
second guard **cannot exist**. §5's two guards are not merely independent; one of them has no
alternative.

**A standing note that outlives this slice: re-check the supported-transpiler range on any bump.**
Whenever `typescript` or `dependency-cruiser` moves, read
`node_modules/dependency-cruiser/src/meta.cjs`'s `supportedTranspilers.typescript` range and confirm
the pinned compiler falls inside it (§11.3, F4). It is not a `peerDependency`, so npm will not tell
you; the symptom is a green `lint:arch` that examined nothing, **and the tool's own message will tell
the maintainer that a compatible compiler is missing without naming the one they just installed** —
which is why `lint-arch.mjs` prints the installed version itself (§5). This is the one maintenance
obligation QS-10 carries into every later slice.

**A second standing note, from J-2: the red zone is anchored at `^tests/`.** `failedFilesFrom`
normalises to a repository-rooted path, and `RED_ZONE` and `MUST_PASS` both anchor at the start, so a
future monorepo layout — `packages/api/tests/unit/…` — would classify as neither red zone nor
must-pass, and **a unit failure would become invisible to AC-6's must-pass clause**. Not a problem in
a single-package repository. It becomes one the day the tree is split, and that split is the moment
to re-read this paragraph.

**A second note for the reviewer.** `guard-paths.mjs`'s Bash branch is a substring test: any
write-ish shell command containing the literal `src/` is denied wherever the path points, so ordinary
shell work on a temp fixture is blocked. The test-engineer had to build its step-2 probe through a
node script concatenating `'s' + 'rc'`. If something of that shape appears in the fixture builder,
that is why — and it is the hook's heuristic, not an attempt to evade a boundary. It has since bitten
twice more, once on a `git commit -F` heredoc whose message contained the literal `src/`, and once on
a `git restore --staged` naming `docs/team-log/` — the second blocking a *correction* to a boundary
violation rather than the violation. Three false positives in three runs; the heuristic is the
orchestrator's, and this is a data point rather than a ruling.

### 11.6 Deliberately not decided here

Observability wiring (`src/platform/telemetry.ts`) — slice 09, and creating an empty OTel bootstrap
now would be the first item in the junk drawer §5.2 warns about. The OpenAPI emitter and
`problem+json` error handler — slices 10 and 03; `src/http/server.ts` gets a `setErrorHandler` only
when there is a taxonomy for it to render. Seeding helpers — slice 00, with the schema they seed.
`@fastify/type-provider-typebox` — not named in ADR-0005, not needed (the implementer typechecked
plain TypeBox-produced JSON Schemas on `schema.response`), and therefore not added.

**`src/domain` ships empty** (§1), and the objection the step-1 draft predicted did not come: both
reviewers accepted it, the implementer adding a second reason — `no-orphans` would fire on a
placeholder, and a permanent warning is a warning nobody reads. It is settled, not open.
