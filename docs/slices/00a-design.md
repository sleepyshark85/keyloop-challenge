# Slice 00a — design

> Step 1 of the slice loop. Author: architect. Reviewed at step 2 by the test-engineer and the
> implementer, who may object; built against at steps 3 and 4.
>
> Slice: [`00a-walking-skeleton.md`](00a-walking-skeleton.md) · arc42 scope declared by the slice:
> **§5.2 · §7.2 · §7.4 · §8.5** · quality scenarios: **QS-10** · ADRs in force: 0005, 0006, 0007,
> 0008, 0010.

This design settles *shape*. It does not restate the acceptance criteria and it may not change them
(`CLAUDE.md` §6): AC-1 to AC-6 are the human's.

Read §11 first if you are short of time — it lists the three things most likely to be objected to at
step 2, and the four that need a human ruling.

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
    migrations/.gitkeep         the seam slice 00 drops 0001_*.sql into; zero migrations today
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
| `persistence/db.ts` | `createDb(config): Db`, `closeDb(db)`, and **`export type Db = Kysely<Database>`** | The pool must **not** connect eagerly — see §3 |
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
export interface ServerDeps {
  logger: Logger;
  checkHealth: () => Promise<HealthOutcome>;
}
```

This is not a stylistic preference either. `http-must-not-reach-persistence` forbids
`src/http → src/persistence`, and under `tsPreCompilationDeps` that includes
`import type { Db }`. So the edge layer *cannot* be handed a database handle in a way that
type-checks and passes CI. Partial application in `main.ts` is the only shape left, and it
generalises: from slice 02 onward `ServerDeps` is a record of bound use cases and nothing else.

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
        ├─ node-pg-migrate, programmatic, dir 'src/persistence/migrations'
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

**The seam slice 00 must find waiting for it.** Two things, and both must be present in 00a even
though they do nothing:

1. `src/persistence/migrations/` exists (a `.gitkeep`), and
2. `globalSetup` calls the migration runner **unconditionally**, against that directory, with the
   same programmatic API `npm run db:migrate` uses (ADR-0007). Zero files apply; `pgmigrations` is
   created; the call succeeds.

Slice 00 then adds `0001_schema.sql` and changes **no other file**. If instead 00a skipped the call
"because there is nothing to migrate", slice 00 would have to add the call, the config and the schema
at once, and any failure among them would be ambiguous.

> **The one mechanical unknown in this slice.** `node-pg-migrate` against a directory containing only
> `.gitkeep` is expected to be a no-op, but it is not verified here. If it errors, do **not** guard
> the call with an "is the directory empty" condition — that would make the seam conditional, which
> is the thing being avoided. Raise it and the architect will rule; the likely fix is a `0000` no-op
> migration, which is a data-model delta and therefore a scope question for the human.

**Directory ownership.** `tests/setup/` and `vitest.config.ts` are the **test-engineer's**, written
in the red commit at step 3 — because AC-1's evidence *is* that the container starts and the suite
connects, and a red run that could not start a container would be red for the wrong reason. See §7
for the full step-3/step-4 split, and §11 for the guard-hook gap this exposes.

**One Vitest project in 00a, not two.** §7.2 mentions `npm run test:domain` as the Docker-less
subset. It cannot exist yet: there is no `src/domain` and therefore no `tests/unit`. Rather than ship
a second project configured with `passWithNoTests` — a flag that would silently stay green forever —
00a ships a single project with the global setup, and the project split lands in slice 01 alongside
the first domain module. Recorded as an as-built delta in §7.2 at step 7.

---

## 5. `tests/architecture/layering.test.ts` — what it must establish

The test-engineer writes this file; this section specifies what it must prove, not how.

**It must run the repository's own `.dependency-cruiser.js`.** Not a copy, not a derived config with
rewritten path anchors, not the API with an inline ruleset. The artifact under test is the file CI
runs; a test against a transformed copy proves something about the copy. The config is passed by
path (`--config <repo>/.dependency-cruiser.js`) with the working directory set to the fixture root,
and the CLI is invoked exactly as `lint:arch` invokes it, with `--output-type json` so the
assertions read `summary.violations[].rule.name` rather than scraping text.

**The fixture tree is hermetic.** Built in a fresh temporary directory per run and removed in
teardown. It must contain, at the fixture root:

- `tsconfig.json`, mirroring the repository's `compilerOptions` — `.dependency-cruiser.js` resolves
  `tsConfig.fileName` relative to the working directory, and `tsPreCompilationDeps` needs a real
  TypeScript configuration to be meaningful;
- **stub packages** at `node_modules/kysely/` and `node_modules/pg/` (a `package.json` and an empty
  index each). This is the detail most likely to be got wrong: the rule matches
  `^node_modules/(pg|…|kysely)`, and if the fixture instead resolves to the repository's real
  `node_modules` by directory walking, the reported path is `../node_modules/kysely`, the anchor does
  not match, and **`sql-only-in-persistence` silently does not fire** — the test would pass by
  reporting one fewer violation than it expected only if it checks exact rule names, and would give a
  false green if it checked "some violation was reported". Stubs remove the ambiguity and the
  dependency on a prior `npm ci`.
- import specifiers written the way `src/` writes them (explicit `.js`), so resolution behaves
  identically and `not-to-unresolvable` does not fire in place of the rule under test.

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
path argument to a subprocess and never imports it, and it must not depend on the repository's real
`src/` contents in any way — it would then fail or pass for reasons belonging to another slice.

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

**Three constraints imposed by the consumer, `tools/slice/check.mjs`.** They are not obvious from the
schema and getting them wrong makes the Definition of Done silently wrong:

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

A green run's `checks` therefore contains no `FAIL` anywhere — including in a job named for a failure
concept. `red_proof` uses `"success" | "failure" | "not-applicable"`, which is why it is lowercase
and why the third value is not `"NOT-FAILED"`.

### How it is tested

The module exports a pure `toCheckRunRecord(ghPayload, { slice, collectedVia })`; the `gh` invocation
lives in the CLI wrapper. `tools/test/collect-ci.test.mjs` feeds captured `gh` payloads (one green
run, one red-proof run) and asserts:

- the record validates against `schema.mjs`;
- the `FAIL` invariant holds in **both** directions;
- `depcruise` is lowercase `pass` on the green fixture;
- `slice:check`'s *red before green* logic classifies the pair correctly — i.e. the two records are
  fed to the same predicate the DoD uses.

That last assertion is the one worth having. It is easy to write a collector whose output looks right
and which the gate tool reads as green.

---

## 7. The CI phase-4 block

### What switches on

The commented block at the foot of `.github/workflows/verify.yml` is replaced by:

**Existing job `verify`** gains two steps, after install and before the docs checks:

```yaml
- name: typecheck            run: npm run typecheck      # tsc --noEmit
- name: layering (QS-10)     run: npm run lint:arch      # CLAUDE.md §2.3
```

**New job `test`** — separate, because the red-proof discrimination has to read *which* thing failed,
and a single job's conclusion cannot say:

```yaml
test:
  name: suite (Testcontainers)
  runs-on: ubuntu-latest      # ships a Docker daemon — TC-9, ADR-0010
  steps: checkout · setup-node 22.x · npm ci --engine-strict
       · npm test -- --reporter=json --outputFile=test-results.json
       · upload-artifact: test-results.json + run-summary.json   (if: always(), retention 90)
```

No `services:` block: Testcontainers starts its own `postgres:16` (§7.2, §7.4).

**New job `red-proof`** — `needs: [verify, test]`, `if: always()`.

### The `red-proof` job's mechanics

Four details, each of which is a way to get this wrong:

1. **Reading the commit subject.** On a `pull_request` event the checked-out `HEAD` is GitHub's
   *merge* commit, whose subject is `Merge <sha> into <sha>`. The subject must be read from the head
   commit explicitly:
   `git log -1 --format=%s ${{ github.event.pull_request.head.sha || github.sha }}`, with
   `fetch-depth: 0` (already set on the existing job).
2. **The decision is a tested script, not inline YAML.** `tools/ci/red-proof.mjs`, with
   `tools/test/red-proof.test.mjs` wired into `npm run test:tools`. ADR-0010's Consequences already
   anticipate this — *"two checks live as inline shell and `node -e` in YAML … if they grow, they
   become `tools/` scripts with tests in `tools/test/`"* — and this one grows past ten lines the
   moment it has to classify per-suite results.
3. **Inputs and rule.** `red-proof.mjs` takes the commit subject, the `verify` job's conclusion, and
   the Vitest JSON results (downloaded from the `test` job's artifact). It exits 0 when:
   - the subject does **not** match `^test\(.+\): .*\(red\)$` — *not applicable*, nothing asserted; or
   - the subject matches **and** at least one failing test file lies under `tests/acceptance/`
     **and** no failing test file lies outside it **and** the `verify` job succeeded.

   It exits 1 otherwise, naming which condition failed. A branch that does not compile fails
   `verify`, so it is reported as a **broken run, not a red proof** — which is the entire
   discrimination ADR-0010 Decision 3 asks for.
4. **Four cases in the unit test**, and they are what actually satisfies AC-6:
   red-marked + acceptance-only failure + verify green → exit 0;
   red-marked + a failure outside `tests/acceptance/` → exit 1;
   red-marked + everything green → exit 1 (a red proof that was not red);
   unmarked subject → exit 0, "not applicable".

The job's conclusion is therefore **success when the required failure was observed**, and the check's
name makes that inversion visible rather than hiding it in `continue-on-error`.

### The bootstrap paradox, stated rather than papered over

**`process-criteria.md` C1 is unmeasurable for slice 00a by construction, and the phase-4 retro must
record it as `UNMEASURABLE`, not as a pass.** C1 requires *"a failing acceptance run recorded in
`check.run` before a passing one"*. `check.run` is emitted by `collect-ci.mjs`, which this slice
builds. At the moment 00a's red commit is authored, the collector does not exist, so there is nothing
to record the red run with. This is not a criterion being softened after the fact — it is a
sequencing consequence that was already visible in ADR-0010 (*"until the collector is written
`check.run` remains unemitted and C1 remains unpassable"*) and in arc42 §11 R-8, which names it as
the largest of four unenforced claims.

A second, narrower instance of the same paradox: **AC-6's `red-proof` job cannot judge 00a's own red
commit.** At that commit there is no `src/`, so `lint:arch` fails with *"Can't open 'src' for
reading"* and `typecheck` has nothing to check — the job's own precondition ("install, typecheck,
lint and unit all passed") cannot hold. The phase-4 CI block therefore lands with the implementer at
step 4, and the workflow that runs against the red commit is today's phase-3 `verify` job, which
passes.

**How 00a's red state is evidenced instead**, in decreasing durability:

1. **The red commit itself**, in git, permanent — `test(00a): … (red)`, authored by the
   test-engineer, one commit, per `CLAUDE.md` §7.
2. **The `verify` run on that SHA**, green, proving the branch was not merely broken. Combined with
   (1) this is the same discrimination `red-proof` automates, performed by a human at step 5/6
   instead of by a job.
3. **`tools/test/red-proof.test.mjs`**, which proves the discriminator itself is correct in all four
   cases — so what AC-6 promises for every later slice is verified here as logic, even though it
   cannot be verified here as a live run.
4. **The reviewer's and the human's observation** at steps 5 and 6, recorded on the PR.

**C1 becomes measurable from slice 00 onward**, where all four preconditions hold at the red commit:
`src/` exists and conforms, the workflow carries typecheck/lint/test/red-proof, `collect-ci.mjs`
exists, and the orchestrator can run it at the gate. Slice 00 is the pilot proper, which is the slice
C1 was pre-registered to judge — so the criterion measures what it was written to measure, one slice
later than the numbering suggests.

Nothing in `process-criteria.md` is edited by this design. C1 stands as written.

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
must make four things true, and all four are required — the scenario is not satisfied by any three:

1. `depcruise src tests` with `.dependency-cruiser.js` exits **0** against the real tree of §1.
2. `npm run lint:arch` runs **in CI** on every push and pull request, so (1) is a build gate and not
   a command someone remembers to run (`CLAUDE.md` §2.3).
3. Each of `domain-is-pure`, `sql-only-in-persistence`, `http-must-not-reach-persistence` and
   `outside-in-tests-do-not-import-src` is shown to **fire by name** against an injected violation
   (§5) — including, for `sql-only-in-persistence`, a **type-only** import, without which
   `tsPreCompilationDeps` could silently regress and the rule would still appear to work.
4. A conforming fixture tree produces **zero** violations (the negative control), so (3) is evidence
   of discrimination rather than of indiscriminate rejection.

QS-12 (`tests/architecture/ambiguity-containment.test.ts`) is **not** in scope: it scans for domain
arithmetic that does not exist yet. It arrives with slice 01.

---

## 10. Proposed arc42 edits, and one ADR

### Edits at step 7, inside the slice's declared scope

| Section | Correction |
|---|---|
| **§5.2** | The as-built file list of §1; the `Db` alias and why nothing above persistence names `Kysely`; `ServerDeps` as the http seam and why partial application is forced rather than chosen; `/health` described as an operational probe outside §8.6's table; `src/domain` recorded as deliberately empty until slice 01, with the reason |
| **§7.2** | The harness as built: global setup, one container per run, **no reuse** and why; `provide`/`inject` rather than ambient env; the migration call that applies zero migrations and why it is unconditional; `test:domain` and the second Vitest project deferred to slice 01; what `docker-compose.yml` actually starts (see the open question below) |
| **§7.4** | Replace the PHASE 4 comment block's description with what shipped: the two new `verify` steps, the `test` job, the `red-proof` job and its tested script, the run-summary artifact; and the note that `red-proof` could not judge the commit that introduced it |
| **§8.5** | The `tests/setup/` ownership ruling; the shape of `tests/architecture/layering.test.ts` including the negative control; `tools/test/` as the home of the two tool-level tests, and the independence caveat in §11 below |

### ADR

**ADR-0011 — `/health` is an operational probe outside the API contract. Status: `proposed`.**

Nothing in ADR-0005..0010 settles whether an operational probe joins §8.6's RFC 9457 taxonomy, is
emitted into the OpenAPI document, or is traced as a business span. It is a real fork with real
downstream consequences at slices 09 and 10, and it is not the architect's to close alone, so it is
raised as a proposed ADR rather than decided inline. The recommendation is that `/health` stays
outside all three. A `status: proposed` ADR is a technical-debt item by construction and appears in
§11.1's generated register until the human rules at the gate.

Adding the ADR mechanically regenerates two **generated-tier** blocks — the index in §9 and the debt
register in §11.1 — via `npm run docs:build`, which CI's `docs:check` requires. Those are generated
content, not authored sections, and are outside the slice's declared `arc42:` scope only in the
trivial sense that generated blocks always are.

No other ADR is needed. In particular: the composition-root seam is ADR-0008 applied, not a new
decision; `tools/ci/red-proof.mjs` as a tested script rather than inline YAML is ADR-0010's own
stated escape hatch; and Fastify, Kysely, `node-pg-migrate`, Vitest and Testcontainers are all
already decided.

---

## 11. What needs a ruling, and what will be argued at step 2

### Open questions for the human (four, all cheap now)

1. **The slice's `arc42:` scope is one section short in two places.** Reconciling *what compose
   actually starts* is a **§7.1** edit, and closing R-8's first row once `collect-ci.mjs` lands is a
   **§11.2** edit; neither section is in the slice's declared scope. Recommendation: add `§7.1` and
   `§11.2` to the slice's `arc42:` field. Leaving R-8 stating *"`collect-ci.mjs` does not exist"*
   after the slice creates it is worse than a one-line scope addition. **Not done unilaterally —
   scope is the human's.**
2. **§5.3's module dependency graph** says it is rendered *"from the first implementation slice
   onward"*. 00a is that slice, so `npm run graph:modules` produces something for the first time.
   Same question: `§5.3` is not in the declared scope. Recommendation: add it, or defer the first
   render to slice 00 and say so.
3. **`docker-compose.yml` starts `postgres` and `otel-lgtm` only; the service runs on the host**
   (`npm run dev`). §7.1 shows a third `scheduler` container. Containerising the app needs a
   Dockerfile, a build stage and an image-caching story that buys nothing for a local demo and must
   be maintained through twelve slices. Recommendation: accept the delta and record it in §7.1/§7.2.
4. **`tools/test/collect-ci.test.mjs` and `tools/test/red-proof.test.mjs` are written by the
   implementer**, in the same green commits as the code — so AC-5 and AC-6 are the only two criteria
   in this slice whose evidence is not independently authored. The alternative was worse: if the
   test-engineer wrote them at step 3 they would be red, `npm run test:tools` would fail, and the red
   commit would show the existing `verify` job failing — destroying exactly the "red for the right
   reason" signal AC-6 is about. Recommendation: accept, and note it in the retro under C2. It does
   not recur; these two tools are built once.

### The three things most likely to be objected to at step 2

1. **`src/domain` ships empty** (§1). The objection will be that a walking skeleton should touch
   every module. The answer is that a placeholder in *this* module contradicts what the module is
   for, and that `domain-is-pure` is proved by AC-4's fixture rather than by an empty directory. If
   the objection is sustained, the ruling is the human's, not the architect's — there is no
   acceptance criterion requiring `src/domain` to contain a file.
2. **`.dependency-cruiser.js` needs one amendment**, and it is the architect's file (`CLAUDE.md`
   §2.3). `tests/support/` — where the acceptance harness's spawn helper lives — is not covered by
   `outside-in-tests-do-not-import-src`, so a helper there could import `src/` and hand it to an
   acceptance test, spending the independence the rule exists to protect. The `from.path` becomes:

   ```
   ^tests/(acceptance|architecture|concurrency|contract|performance|property|support)/
   ```

   which also makes Gate B's ruling on `tests/architecture/` and `tests/performance/` structural
   rather than only guarded by the path hook. `tests/unit/` and `tests/integration/` stay out: both
   legitimately import `src/`. The rule keeps its name, so AC-4 is unaffected. **The architect
   applies this edit at step 2**, before the red commit — it is needed by both roles and it is not
   the implementer's file to change.
3. **`tests/setup/` and `vitest.config.ts` belong to the test-engineer** (§4), which means the red
   commit carries the test toolchain: the `vitest`, `testcontainers` and `node-pg-migrate`
   devDependencies, `tsconfig.json`, `vitest.config.ts` and `tests/**`. The implementer's commits
   then add `src/**`, the runtime dependencies (`fastify`, `@sinclair/typebox`, `kysely`, `pg`,
   `pino`), `docker-compose.yml`, `.npmrc`, `tools/**` and the CI block. Both roles edit
   `package.json`, sequentially and in different stanzas. The implementer may object that this is
   scaffolding work landing in a `test(…)` commit; the answer is AC-1 — *"`npm ci && npm test` starts
   a container and the suite connects"* is the acceptance criterion, so the harness that starts it is
   the test, not the implementation.

   **A gap this exposes:** `.claude/hooks/guard-paths.mjs` lists `TEST_OWNED` as the six
   `tests/{acceptance,contract,property,concurrency,architecture,performance}/` directories. Neither
   `tests/setup/` nor `vitest.config.ts` is guarded, so both roles can write both. That is a hook
   change and therefore the orchestrator's, not the architect's; recommended, and recorded here so
   the ruling exists in writing even if the hook does not enforce it.

### Deliberately not decided here

Observability wiring (`src/platform/telemetry.ts`) — slice 09, and creating an empty OTel bootstrap
now would be the first item in the junk drawer §5.2 warns about. The OpenAPI emitter and
`problem+json` error handler — slices 10 and 03; `src/http/server.ts` gets a `setErrorHandler` only
when there is a taxonomy for it to render. Seeding helpers — slice 00, with the schema they seed.
