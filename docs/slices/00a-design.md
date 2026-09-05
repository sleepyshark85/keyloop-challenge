# Slice 00a — design

> **Merged.** Reconciled at step 7 into arc42 **§5.2 · §5.3 · §7.1 · §7.2 · §7.4 · §8.5 · §11.2**.
> Quality scenario **QS-10**; ADRs 0005–0008 and 0010 in force; ADR-0011 raised here.
>
> Condensed 2026-09-05 under the human's concision ruling. The deliberation is on PR #4 and in
> `docs/team-log/events.jsonl`; the two review-discipline rules this slice produced are in
> `docs/team-log/phase-4-retro.md` and `docs/DEFECTS.md`.

## Decided

- **Module tree** — nine files. `src/domain` ships empty behind a `.gitkeep`: a placeholder would be
  the first non-policy file in the module whose only claim is that just policy lives there.
- **Composition root: partial application.** `main.ts` holds the only `Db`; `buildServer` takes bound
  use cases; `persistence/db.ts` exports `type Db = Kysely<Database>` so nothing above persistence
  names `Kysely`. Under `tsPreCompilationDeps` the ruleset forecloses every shape that *names* the
  handle; a generic parameter evades it only by declining to name it.
- **`GET /health` is an operational probe**, outside §8.6's taxonomy — ADR-0011, `proposed`. Its
  failure is bounded by a `connectionTimeoutMillis: 1000` constant in `db.ts` rather than an
  environment variable, and the pool must not connect at boot or AC-2's `503` is untestable.
- **Harness** — `globalSetup`, one container per run, no `withReuse()`, `provide`/`inject` rather than
  ambient environment, isolation by data. The migration runner is called **unconditionally** against
  `src/persistence/migrations/`, whose existence `globalSetup` guarantees with `mkdirSync`; without it
  the red commit dies in setup rather than in assertions.
- **Two Vitest projects**, `db` and `nodb`, split on whether a test needs the database. `npm test`
  runs both and produces one `test-results.json`, which `red-proof --results` requires.
- **The service is compiled; there is no TypeScript loader.** `pretest` runs `build`, so
  `npm ci && npm test` satisfies AC-1 literally and the acceptance test spawns the artifact a
  deployment would run.
- **`lint:arch` is `tools/ci/lint-arch.mjs`**, not the bare CLI: it spawns the repository's own
  `node_modules/.bin/depcruise` with **no `PATH` fallback** (exit 2 if absent), fails on a non-empty
  `summary.environment.issues` while printing the installed compiler version, fails **per root** when
  a root contributed no modules, and exports pure `judgeCruiseResult(cruiseResult, roots)` — the whole
  cruise result, because coverage is a claim about a file list and `summary` carries none. Roots come
  from argv; it stays **one** cruise, or `outside-in-tests-do-not-import-src` stops firing.
- **`tools/team-log/collect-ci.mjs`** is ADR-0010 Decision 2's interface: writes nothing it did not
  compute (which earns `allowDerived`), exits 2 rather than guessing, idempotent on `checks.run_id`,
  and exports `toCheckRunRecord` **and** `toCheckRunRecords`, because ordering is a property of the
  list and belongs where a unit test can reach it.
- **`tools/ci/red-proof.mjs`** — `--subject-file --verify --results`, nothing from the environment;
  pure `judge({ subject, verifyConclusion, failedFiles })`; exits 0 satisfied or not applicable, 1
  violated, 2 usage. Must-pass is `tests/unit/` alone; the red zone is every other test-engineer
  directory, `tests/integration/` included.
- **`.dependency-cruiser.js` amended** by the architect at step 2:
  `outside-in-tests-do-not-import-src`'s `from.path` becomes
  `^tests/(acceptance|architecture|concurrency|contract|performance|property|setup|support)/`.
  `unit` and `integration` stay out — both legitimately import `src/`.
- **The `tests/integration/` boundary, structurally:** a file reaching the database only through a
  connection string is the test-engineer's; one importing a `src/` module is the implementer's.

## Ruled

| # | Finding | Ruling |
|---|---|---|
| **O1** | test-engineer: the AC-4 fixture cruises 0 modules at exit 0 | **(c)** — AC-4 and QS-10 named; coverage asserted everywhere |
| **O2** | test-engineer: nothing said how the service is built or started | **(a)** — compile; `tests/support/` is the test-engineer's |
| **O3** | test-engineer: `test:tools` is a literal `&&` chain, not a glob | **(a)** — all three tool tests become test-engineer-authored |
| **O-1** | implementer: the red zone makes slices 07 and 11 unpassable | **(d) → human: AC-6 reads broad** |
| **O-2** | implementer: two more `collect-ci` constraints are load-bearing | **(a)** — 4 and 5 below |
| **S-1** | **architect, self-raised**: this design worked around `CLAUDE.md` §2.4 | **(c)** on §2's authority — the suite joins the red commit's own CI job |
| **F1, F2** | test-engineer: AC-3's predicted red was wrong; the guard counted modules overall | **(a)** — assert coverage, per **root** |
| **F6, F7** | test-engineer: ordering is a list property; `engines.node` is wrong twice | **(a)** — see below |
| **J-1, J-2, J-3** | test-engineer: `judgeCruiseResult`'s signature, path normalisation, job keys | **(a)** — whole cruise result; last-`/tests/` fallback; a checked name→key map |
| **A-1** | **architect, self-raised**: `lint-arch.mjs` had the `PATH` fallback its own comment forbade | **(a)** — exit 2 |

Human rulings of 2026-09-04: **AC-6 reads broad** (any test-engineer-owned suite); the slice's arc42
scope gains **§7.1, §11.2, §5.3, §7.4**; **`docker-compose.yml` starts `postgres` and `otel-lgtm`
only** and the service runs on the host.

**S-1 outlived the slice.** No acceptance criterion and no quality scenario failed — the end state was
green either way — so by the letter of `CLAUDE.md` §6 the gravest defect available was the one class
the rule could not name. Ruled (c) on §2's authority; the human then amended §6 so a §2 breach is
nameable. `loopbacks: 0`; every other ruling was (a).

## Measured, and cited nowhere else

**An inert cruise and a clean cruise are indistinguishable at exit 0** — the whole of O1:

```
exit 0 · violations 0 · totalCruised 0 · modules 0 · stderr empty
summary.environment.issues[0].name = "missing-typescript-transpiler"
```

**An absent compiler and an out-of-range one are byte-identical in that output** (on
`dependency-cruiser@18.2.0`): same exit 0, `totalCruised: 0`,
`transpilersFound[ts].currentVersion: "-"` and an identical description string, because the
description interpolates the *supported range* and `typescript-wrap.mjs` short-circuits before loading
the compiler. **So no version-comparison guard is constructible from that output at all** — gating on
`environment.issues` is the only option, which is why `lint-arch.mjs` prints the installed version
itself. The range lives in `node_modules/dependency-cruiser/src/meta.cjs`
(`typescript: ">=2.0.0 <7.0.0"`) and is **not** a `peerDependency`, so nothing warns on a bump.

**`engines.node`** — the declared `">=22.11.0 <25"` promised support the tree refuses:

```
testcontainers@12.1.0       >= 22.22
vitest@5.0.0                ^22.12.0 || ^24.0.0 || >=26.0.0
dependency-cruiser@18.2.0   ^22 || ^24 || >=26
```

22.11–22.21 passes our floor then fails `npm ci --engine-strict`; 23.x satisfies the declared range
while two packages exclude it. Corrected to `">=22.22.0 <23 || >=24.0.0 <25"` (arc42 §7.1).

**`node-pg-migrate` against a directory holding only `.gitkeep` is a clean no-op** —
`dist/migration.js:82` defaults `ignorePattern` to `^\..*` and `dist/runner.js:236–248` calls
`ensureMigrationsTable` *before* the empty-list check, so `pgmigrations` is created and nothing
applies. No `0000` migration exists.

**Five constraints `tools/slice/check.mjs` imposes on `collect-ci.mjs`**, invisible from the schema
and each one a silent corruption of the Definition of Done:

1. `checks.depcruise` must be the lowercase string `"pass"`.
2. `JSON.stringify(checks)` contains `FAIL` **iff** the run failed — `check.mjs` decides *red before
   green* by `/FAIL|\b0\//` over it.
3. No ratio strings anywhere in `checks`; `\b0\/` in `"0/0 skipped"` reads a green run as red.
4. Records are appended **oldest-run-first**: `check.mjs:113` is `runs.at(-1)`, positional in log
   order, while `gh run list` returns newest-first.
5. `ts` is the run's `updatedAt`, never the collection time — `schema.mjs:137` defaults it to *now*,
   and `check.mjs:100` compares strictly, so collecting a red and its green together fails C1 on a
   correct slice.

`checks.depcruise` records **`"not-run"`** when the layering step is absent, chosen to fail closed.

**The red was observed**, and `red-proof.mjs` was replayed offline against that run's own artifact
(run 33831214774) at exit 0.

## Debt booked

| Item | Why not here |
|---|---|
| `tools/slice/check.mjs` should order `check.run` by timestamp, not by position | Changing the gate tool in the slice that first feeds it is how a gate agrees with its own bug |
| `test:tools` should discover `tools/test/*.test.mjs` rather than name them | O3 depends on the literal chain until all three are wired |
| `graph:modules` renders an empty graph and a clean one identically | Cosmetic; gates nothing |
| `docker-compose.yml` does not start the service | Human-ruled: a Dockerfile and an image-caching story, for no demo benefit |
| **Standing:** re-check `supportedTranspilers.typescript` on any bump | Not a `peerDependency`; the symptom is a green `lint:arch` that examined nothing |
| **Standing:** `RED_ZONE` and `MUST_PASS` anchor at `^tests/` | A monorepo split hides a unit failure from AC-6's must-pass clause |
