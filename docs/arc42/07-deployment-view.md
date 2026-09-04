# 7. Deployment view

> Owner: architect · Written: phase 2

**Deliberately minimal, and this section stays thin on purpose.** Three containers on one machine,
and one pipeline (§7.4). What a production deployment would additionally require is §11.3, named
honestly there rather than invented here — three paragraphs of speculative Kubernetes topology would
be padding, and OC-1 bounds scope by what can be demonstrated and defended.

## 7.1 The runtime environment

```
docker compose up -d                       # postgres and otel-lgtm ONLY
  ├── postgres       postgres:16 · btree_gist enabled by migration 0001 (TC-3)
  └── otel-lgtm      grafana/otel-lgtm · OTLP :4317 · Grafana :3001

npm start                                  # the scheduler, on the HOST
  └── scheduler      Node 22 LTS · the compiled dist/main.js · :3000
```

**The service is not in compose, and that is a ruling rather than an oversight.** The human ruled at
slice 00a that containerising it would cost a Dockerfile, a build stage and an image-caching story
maintained across twelve slices for no demo benefit. Compose provides the *dependencies*; the process
runs on the host against them. `docker-compose.yml` says so in its own header, so the file and this
section cannot drift apart. Nothing here is on the test path — §7.2's Testcontainers starts its own
`postgres:16` — and conflating the two is the mistake §7.4 warns about.

| Node | Runs | Notes |
|---|---|---|
| **scheduler** | One Node process, no clustering, **on the host** | Stateless. Everything that must be true across requests is true in PostgreSQL (§4.1), so a second instance would need no coordination — but there is no reason to run one, and §11.3 records what running several would actually require |
| **postgres** | PostgreSQL 16 | **The correctness boundary**, not a storage detail. Requires `CREATE EXTENSION btree_gist` (TC-3), which rules out any managed offering that restricts extension installation |
| **otel-lgtm** | Grafana, Tempo, Loki, Prometheus in one container | Receives OTLP over gRPC. **Its absence must not break the service**: telemetry export failures are logged and dropped, never propagated to a request |

Versions are pinned here because TC-10 deliberately left them open at Gate A: **PostgreSQL 16** in
compose and in the Testcontainers image tag, and in `package.json` `engines`

```
"node": ">=22.22.0 <23 || >=24.0.0 <25",
"npm":  ">=10.9.0"
```

The two PostgreSQL pins must match — a test suite that proves an invariant on a different major
version from the one that runs it has proved something about a different system.

**The Node range is a correction, and it is flagged rather than quietly restated because it changes a
published number.** This section said **≥ 22.11 < 25** at Gate B. The tree does not support that, in
two directions, and neither shows up as a warning:

- **22.11 to 22.21 clears the declared floor and then fails `npm ci --engine-strict`**, so the pin
  advertised support the install refuses — the worst kind, because it fails at the newcomer's first
  command;
- **23.x satisfies a naive `<25` upper bound** while `vitest` and `dependency-cruiser` both exclude
  it. An odd-numbered Node is not an LTS line, and the disjunction says so structurally instead of
  relying on the reader knowing.

The published range now states what the dependency tree actually admits, and `npm ci --engine-strict`
in both CI jobs turns it from a note into a build failure (§7.4).

**No gateway, no TLS, no load balancer, and the service is unsafe to expose on any reachable
network.** ADR-0002 removed authentication entirely, so anyone who can reach the port can book, read
and cancel on any customer's behalf. That is acceptable *only* because of this deployment, which is
why the two decisions are stated together rather than in separate sections. §11.3 carries the retrofit.

## 7.2 Under test — Testcontainers stands in for PostgreSQL

`CLAUDE.md` §2.2 is unusually specific: no SQLite, no in-memory repository, no mocked database in any
test that asserts a persistence invariant. The reason is §4.1 — the most important invariant in this
system lives in the database, and a test that substitutes the database does not test it. It tests the
substitute's imitation of it, and the imitation would necessarily be check-then-act.

```
vitest globalSetup
  └── PostgreSqlContainer('postgres:16')        one container per test RUN
        └── node-pg-migrate, programmatic       the same migrations as production (ADR-0007)
              └── DATABASE_URL exported to every worker
```

Three properties this arrangement buys, each of which cost a design choice:

- **The schema under test is the schema that runs — and as built, `db:migrate` does not conform to
  ADR-0007.** As built, `db:migrate` invokes the `node-pg-migrate` **CLI** (`package.json:18`) while
  `globalSetup` calls its **`runner()`** API. Two entry points, not one call. What actually holds them
  together is that they share **the same package, the same migrations directory and the same
  `pgmigrations` table** — three inputs, none of them a shared module.

  **This section previously called that a narrowing of arc42's own phase-2 overstatement. That was
  wrong, and correcting it is the point of this paragraph.** [ADR-0007](../adr/0007-node-pg-migrate-with-sql-files.md)'s
  Decision states that the runner is invoked *"programmatically … **both** by `npm run db:migrate`
  against the local compose stack **and** by the Testcontainers fixture"*. So the CLI entry point does
  not merely fall short of a claim arc42 made; **it contradicts an accepted, immutable ADR.** Narrowing
  the claim here, unilaterally, left the *"single source of truth for architecture"* (`CLAUDE.md` §4)
  disagreeing with an ADR that still asserts the original, with nothing recording that it did. The
  right repair for a decision that no longer matches the code is a superseding ADR or a conforming
  change — never a quieter sentence in arc42. Raised at slice 00 step 2 as **I-9**; the reconciliation
  defect is the architect's own, from slice 00a step 7.

  **The measured consequence**, since "a CLI-only flag would diverge silently" has now come true:
  `--single-transaction` defaults to `true` on the CLI and is unset on the programmatic call, so a
  malformed migration rolls **all** files back under `db:migrate` and leaves earlier files
  **committed and recorded** under `globalSetup`. Measured on `postgres:16` with
  `node-pg-migrate@9.0.0`, 2026-09-04. It bites only on a broken migration and both paths fail
  loudly, which is why slice 00 deferred it rather than conforming mid-slice. Carried as debt in
  §11.2 R-9, with the recommendation to **conform `db:migrate`, not to supersede ADR-0007**.
- **Tests isolate by data, not by truncation.** Each test seeds its own dealership, bays,
  technicians and service types, and works only within it. Truncating between tests would serialise
  the suite and — worse — would make the concurrency tests race the cleanup rather than each other.
  Isolating by dealership lets the suite run in parallel *and* keeps A-9's multi-dealership scoping
  under permanent test, since every test is implicitly asserting that another dealership's data does
  not leak into its own.

  **The granularity is worth stating, because slice 00's design first read it too broadly. Vitest
  parallelises *files*, not cases.** Across files, per-case seeding buys disjointness. *Within* a file
  it buys something the tests lean on more heavily: with one container per run and no cleanup, every
  row in the table is **attributable** to the case that wrote it, which is what makes an assertion
  that counts rows over a bay and an interval a claim about that case rather than about the run.
  Isolation by data is therefore load-bearing whether or not anything runs concurrently.
- **Concurrency tests get real connections.** QS-1 to QS-5 open several pooled connections and fire
  genuinely simultaneous statements. Nothing about that is simulatable; it is the whole point.

The cost is TC-9: **Docker is required to run the test suite**, and it is the most likely reason a
reader's first `npm test` fails.

**As built the Docker-less subset is wider than "the `src/domain` suite", and it had to be.** Vitest
runs two projects, and the split is by *what a test needs* rather than by what it is about:

```
nodb   tests/unit/** · tests/architecture/**        no globalSetup
db     everything that talks to PostgreSQL          globalSetup: tests/setup/postgres.ts
```

`npm run test:nodb` is the Docker-less command. Per-project `globalSetup` was the one mechanical
unknown flagged for verification before 00a's red commit, and it was verified on the pinned
`vitest@5.0.0` rather than assumed.

**The split's justification at 00a no longer holds; the split does.** It was forced by a constraint
the phase-2 text did not anticipate — *"neither the implementer nor the test-engineer had a container
runtime"* — which would have made every local test run impossible for both. **Measured again at slice
00 step 2 on 2026-09-04: Docker works in all three roles' shells, and the `db` project completes in
about 3.4 s.** So that premise is false as of slice 00, and 00a §11.5 should be read as a report of
what was true then rather than as a standing constraint.

The two projects stay, on merits that never depended on it: a database-less subset is worth having for
its speed, for a contributor without a daemon, and because a container failure should not be able to
abort `tests/unit/` and `tests/architecture/`. What changes is the operative meaning of a green
commit. At 00a it was **locally green on everything that does not need a database, CI-green on
everything that does** — read 00a's commit sequence with that in mind rather than as carelessness.
**From slice 00 it recovers its plain sense: green means green, locally, before the push**, and
`npx vitest run --project db` is the stated inner loop for any slice whose work is in the database.

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

It belongs in the deployment view rather than in a tooling appendix because **the runner is a
correctness prerequisite, not a convenience**. TC-9 requires Docker; §2.2 forbids substituting the
database; so a runner without a Docker daemon cannot run the tests that prove this system correct —
only the ones that would pass anyway. `ubuntu-latest` ships a daemon, and §7.2's Testcontainers
starts its own `postgres:16` inside it, which is why the pipeline needs no `services:` block.

**Compose and the test path are separate, and conflating them is the easy mistake.** Nothing in §7.2
reads `docker-compose.yml`:

| Environment | PostgreSQL comes from | Exists for |
|---|---|---|
| Local run | `docker compose up` (§7.1) | the service, the cURL harness, `otel-lgtm` |
| Test, local or CI | Testcontainers, one container per run (§7.2) | the suite — including every concurrency scenario |
| CI, as built at 00a | Testcontainers, inside the `test` job | three jobs: `verify` (docs currency, the tools suite, the defect register, diagram export, event-log integrity, `typecheck`, `lint:arch`), `test` (the Vitest suite), `red-proof` |

Node on the runner is **22.x**. §7.1's range now admits 24 as well, but the runner stays pinned to the
deployment line rather than tracking the maintainer's local Node, so CI agrees with what would run in
production rather than with a laptop. `npm ci --engine-strict` turns TC-10's pin from a note into a
build failure, in both jobs that install.

The workflow is **phased**: it contains only what passes before the application exists, because
METHODOLOGY §261 puts CI *before* slice 00's step 3 and therefore before the code it will eventually
check.

**The criterion that decides what waits is "does it need `src/`" — not "which phase does it belong
to", and getting that backwards cost this slice its most serious finding.** `typecheck`, `lint:arch`
and `red-proof` need `src/` or need a tool that does not exist yet, so they waited. **`npm test` does
not need `src/`. It needs a Docker daemon, which `ubuntu-latest` has** — so the Vitest suite got its
own job **in the red commit itself**, three commits earlier than a phase-shaped reading would have put
it.

That is not tidiness. `CLAUDE.md` §2.4 requires every slice's failing acceptance test to be *observed
red in CI*, and METHODOLOGY makes the step-3 log entry *"the red commit SHA **and the CI run that
observed it failing**"*. With the suite bundled into the phase-4 block, slice 00a's red would never
have run in CI at all — the board could not have left `red` truthfully, and the design that produced
that state had offered four substitute evidence items instead of raising it. **A NON-NEGOTIABLE was
being worked around, and the working-around was written down as an evidence chain.** The fix is this
split; the record is ADR-0010 and the slice file.

The pair of job conclusions is also the discrimination itself: `verify` green proves the branch is
sound, `test` red proves an outside-in suite failed. `red-proof` automates exactly that pair from
slice 00 onward, and its job **succeeds when the required failure was observed** — an inversion made
visible in the check's name rather than hidden behind `continue-on-error`. It is armed only by a
commit subject matching `test(…): … (red)`, so it cannot be self-awarded by the implementer. Two consequences belong here rather than in the ADR. **QS-14's latency budget is stated
*"on the CI container"***, so its numbers mean *a standard GitHub-hosted `ubuntu-latest` runner*, and
changing runner class silently changes what that scenario asserts. And the pipeline holds
`contents: read` only, so nothing in CI can write to the repository whose git history is itself an
assessed artifact (OC-7) — which is why `check.run` is collected at each gate rather than committed
by the workflow.
