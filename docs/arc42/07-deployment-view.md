# 7. Deployment view

> Owner: architect · Written: phase 2

**Deliberately minimal, and thin on purpose.** Three containers on one machine and one pipeline (§7.4).
What a production deployment would additionally require is §11.3, named honestly there rather than
invented here: speculative Kubernetes topology would be padding, and OC-1 bounds scope by what can be
demonstrated and defended.

## 7.1 The runtime environment

```
docker compose up -d                       # postgres and otel-lgtm ONLY
  ├── postgres       postgres:16 · btree_gist enabled by migration 0001 (TC-3)
  └── otel-lgtm      grafana/otel-lgtm · OTLP :4317 · Grafana :3001

npm start                                  # the scheduler, on the HOST
  └── scheduler      Node 22 LTS · the compiled dist/main.js · :3000
```

**The service is not in compose, by ruling rather than oversight**: containerising it would cost a
Dockerfile, a build stage and an image-caching story maintained across twelve slices for no demo
benefit. Compose provides the *dependencies*; the process runs on the host against them, and
`docker-compose.yml` says so in its own header so the file and this section cannot drift. Nothing here
is on the test path — §7.2's Testcontainers starts its own `postgres:16`.

| Node | Runs | Notes |
|---|---|---|
| **scheduler** | One Node process, no clustering, **on the host** | Stateless: everything that must hold across requests holds in PostgreSQL (§4.1), so a second instance would need no coordination — but there is no reason to run one (§11.3) |
| **postgres** | PostgreSQL 16 | **The correctness boundary**, not a storage detail. Requires `CREATE EXTENSION btree_gist` (TC-3), which rules out any managed offering that restricts extension installation |
| **otel-lgtm** | Grafana, Tempo, Loki, Prometheus in one container | Receives OTLP over gRPC. **Its absence must not break the service**: telemetry export failures are logged and dropped, never propagated to a request |

Versions are pinned here because TC-10 left them open at Gate A: **PostgreSQL 16** in compose and in
the Testcontainers image tag, and in `package.json` `engines`

```
"node": ">=22.22.0 <23 || >=24.0.0 <25",
"npm":  ">=10.9.0"
```

The two PostgreSQL pins must match — a test suite that proves an invariant on a different major
version from the one that runs it has proved something about a different system.

**The disjunction in the Node range is load-bearing, not decoration.** A naive `>=22.11 <25` is wrong
in two directions and neither shows up as a warning: **22.11 to 22.21 clears the floor and then fails
`npm ci --engine-strict`**, advertising support the install refuses at a newcomer's first command; and
**23.x satisfies `<25`** while `vitest` and `dependency-cruiser` both exclude it, because an
odd-numbered Node is not an LTS line. The published range states what the dependency tree actually
admits, and `npm ci --engine-strict` in both CI jobs makes it a build failure rather than a note (§7.4).

**No gateway, no TLS, no load balancer, and the service is unsafe to expose on any reachable network.**
ADR-0002 removed authentication entirely, so anyone who can reach the port can book, read and cancel on
any customer's behalf — acceptable *only* because of this deployment, which is why the two are stated
together. §11.3 carries the retrofit.

## 7.2 Under test — Testcontainers stands in for PostgreSQL

`CLAUDE.md` §2.2 is unusually specific: no SQLite, no in-memory repository, no mocked database in any
test that asserts a persistence invariant. The reason is §4.1 — the invariant lives in the database, so
a test that substitutes it tests the substitute's imitation, and the imitation would necessarily be
check-then-act.

```
vitest globalSetup
  └── PostgreSqlContainer('postgres:16')        one container per test RUN
        └── node-pg-migrate, programmatic       the same migrations as production (ADR-0007)
              └── DATABASE_URL exported to every worker
```

Three properties this arrangement buys, each of which cost a design choice:

- **The schema under test is the schema that runs**, from the same package, migrations directory and
  `pgmigrations` table — three shared inputs rather than one shared module, because `db:migrate`
  invokes the `node-pg-migrate` **CLI** while `globalSetup` calls its **`runner()`** API, two entry
  points where [ADR-0007](../adr/0007-node-pg-migrate-with-sql-files.md) specifies one. The measured
  consequence is the `--single-transaction` default: `true` on the CLI, unset on the programmatic
  call, so a malformed migration rolls **all** files back under `db:migrate` and leaves earlier files
  **committed and recorded** under `globalSetup`. §11.2 R-9 carries it as debt.

  **One assertion establishes where the schema came from**, and it is a property of the seam rather
  than of the schema: `tests/integration/exclusion-constraints.test.ts` case 0 asserts that
  `pgmigrations` records exactly `0001_extensions`, `0002_reference_data`, `0003_appointment`, in
  filename order. Every other assertion in the repository inspects the schema and would be satisfied
  by one created by a stray `CREATE TABLE`, baked into an image, or applied by hand. It lives in the
  per-slice file because what the seam **carried** changes with the slice; `postgres-harness.test.ts`
  asserts only that the seam **ran**.
- **Tests isolate by data, not by truncation.** Each test seeds its own dealership, bays, technicians
  and service types and works only within it. Truncating between tests would serialise the suite and,
  worse, make the concurrency tests race the cleanup rather than each other; isolating by dealership
  also keeps A-9's scoping under permanent test, since every test implicitly asserts that another
  dealership's data does not leak into its own. **The granularity matters: Vitest parallelises *files*,
  not cases.** Across files, per-case seeding buys disjointness; *within* a file it buys attribution —
  with one container per run and no cleanup, every row belongs to the case that wrote it, which is what
  makes an assertion counting rows over a bay and an interval a claim about that case rather than about
  the run. So it is load-bearing whether or not anything runs concurrently.
- **Concurrency tests get real connections.** QS-1 to QS-5 open several pooled connections and fire
  genuinely simultaneous statements. Nothing about that is simulatable; it is the whole point.

The cost is TC-9: **Docker is required to run the test suite**, and it is the most likely reason a
reader's first `npm test` fails.

**As built the Docker-less subset is wider than "the `src/domain` suite", and it had to be.** Vitest
runs two projects, and the split is by *what a test needs* rather than by what it is about:

```
nodb   tests/unit/** · tests/architecture/**              no globalSetup
       tests/property/** EXCEPT *.db.test.ts
db     everything that talks to PostgreSQL, plus          globalSetup: tests/setup/postgres.ts
       tests/property/**/*.db.test.ts
```

`npm run test:nodb` is the Docker-less command. **`tests/property/` splits by database need**: a
property test that talks to PostgreSQL is named `*.db.test.ts`, everything else runs in `nodb`, so
three pure functions are not exercised behind a container and a Docker hiccup cannot turn QS-9's red
evidence into a `globalSetup` crash rather than an assertion failure (ADR-0013; §8.5 states all three
clauses).

**`npm test` is not `vitest run`, and the difference is a NON-NEGOTIABLE.** It is
[`tools/ci/run-tests.mjs`](../../tools/ci/run-tests.mjs), which runs the two projects as **separate**
invocations and merges their JSON. A single `vitest run` over both initialises global setup before
running anything, so a container failure aborts the whole invocation and discards the `nodb` project's
results with it — measured with `DOCKER_HOST` pointed at nothing: 0 test files and 0 tests written,
where `--project nodb` alone reports 94 passing. `red-proof` then reads that file, takes its
`failedFiles: []` branch, and reports *"no test-engineer-owned suite failed"*, so a red commit whose
tests genuinely failed is judged never to have failed because Docker hiccuped — `CLAUDE.md` §2.4
silently unsatisfied.

Splitting the invocation alone opens a worse hole in the same place: a project that never ran merges as
**zero failures**, indistinguishable from one in which everything passed, and invisible on every slice
rather than conditional on Docker. So the wrapper's rule is that **a project that did not run is a
loud, distinct failure and never an empty contribution** — a missing report, or one contributing zero
test files, exits `EXIT_DID_NOT_RUN = 2` before `red-proof` is reached, while `EXIT_TESTS_FAILED` is 1.
Deliberately rejected: making `globalSetup` fail soft, which converts a missing container into skipped
`db` tests — a green over nothing, worse than an abort.

**The two projects earn their keep on speed, on contributors without a daemon, and on a container
failure not aborting `tests/unit/` and `tests/architecture/`.** Docker works in all three roles' shells
and the `db` project completes in about 3.4 s, so **green means green, locally, before the push**: the
inner loop is `npm run test:db` or `npm run test:nodb` by where the slice's work is, and **`npm test`
before the push**, because only the wrapper distinguishes a project that passed from one that never
ran.

## 7.3 Configuration

Environment variables only, read once in `src/platform/config.ts` and validated at startup — a
missing or malformed value fails the process rather than surfacing as a request error at 03:00.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | HTTP listener |
| `BOOKING_ATTEMPT_CAP` | ADR-0009's cap; default 16 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector; unset disables export without disabling instrumentation |
| `LOG_LEVEL` | `pino` level |

There are no secrets, because there is nothing to authenticate to (ADR-0002) — which is a fact about
the scope, not a security posture, and §11.3 says so.

## 7.4 The pipeline

A fourth environment, and the only one that is not a container on the maintainer's machine:
**GitHub Actions on `ubuntu-latest`** ([ADR-0010](../adr/0010-github-actions-and-check-run-collection.md)),
defined in [`.github/workflows/verify.yml`](../../.github/workflows/verify.yml).

It belongs in the deployment view rather than a tooling appendix because **the runner is a correctness
prerequisite, not a convenience**: TC-9 requires Docker and §2.2 forbids substituting the database, so
a runner without a daemon can run only the tests that would pass anyway. `ubuntu-latest` ships one and
§7.2's Testcontainers starts its own `postgres:16` inside it, which is why the pipeline needs no
`services:` block.

**Compose and the test path are separate, and conflating them is the easy mistake.** Nothing in §7.2
reads `docker-compose.yml`:

| Environment | PostgreSQL comes from | Exists for |
|---|---|---|
| Local run | `docker compose up` (§7.1) | the service, the cURL harness, `otel-lgtm` |
| Test, local or CI | Testcontainers, one container per run (§7.2) | the suite — including every concurrency scenario |
| CI | Testcontainers, inside the `test` job | three jobs: `verify` (docs currency and budgets, the tools suite, the defect register, diagram export, event-log integrity, `typecheck`, `lint:arch`), `test` (the Vitest suite), `red-proof` |

Node on the runner is **22.x**. §7.1's range admits 24 as well, but the runner stays pinned to the
deployment line rather than the maintainer's laptop, so CI agrees with what would run in production.
`npm ci --engine-strict` makes TC-10's pin a build failure in both jobs that install.

**The Vitest suite has its own job, separate from `verify`, and the criterion is "does it need `src/`"
rather than "which phase does it belong to".** `typecheck`, `lint:arch` and `red-proof` need `src/`, so
they arrive with the code; `npm test` needs only a Docker daemon, so it runs from the red commit
onward. That is not tidiness: `CLAUDE.md` §2.4 requires every slice's failing acceptance test to be
*observed red in CI*, and a suite bundled behind the application would mean a red that never ran there.

The pair of job conclusions is the discrimination: `verify` green proves the branch is sound, `test`
red proves an outside-in suite failed. `red-proof` automates that pair, and its job **succeeds when the
required failure was observed** — an inversion visible in the check's name rather than hidden behind
`continue-on-error`. It is armed only by a commit subject matching `test(…): … (red)`, so it cannot be
self-awarded by the implementer.

Two consequences belong here rather than in the ADR. **QS-14's budget is stated *"on the CI
container"***, so its numbers mean a standard GitHub-hosted `ubuntu-latest` runner, and changing runner
class silently changes what that scenario asserts. And the pipeline holds `contents: read` only, so
nothing in CI can write to the repository whose git history is itself an assessed artifact (OC-7) —
which is why `check.run` is collected at each gate rather than committed by the workflow.
