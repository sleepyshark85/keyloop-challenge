# 7. Deployment view

> Owner: architect · Written: phase 2

**Deliberately minimal, and this section stays thin on purpose.** Three containers on one machine,
and one pipeline (§7.4). What a production deployment would additionally require is §11.3, named
honestly there rather than invented here — three paragraphs of speculative Kubernetes topology would
be padding, and OC-1 bounds scope by what can be demonstrated and defended.

## 7.1 The runtime environment

```
docker compose up
  ├── scheduler      Node 22 LTS · the src/main.ts process · :3000
  ├── postgres       postgres:16 · btree_gist enabled by migration 0001 (TC-3)
  └── otel-lgtm      grafana/otel-lgtm · OTLP :4317 · Grafana :3001
```

| Node | Runs | Notes |
|---|---|---|
| **scheduler** | One Node process, no clustering | Stateless. Everything that must be true across requests is true in PostgreSQL (§4.1), so a second instance would need no coordination — but there is no reason to run one, and §11.3 records what running several would actually require |
| **postgres** | PostgreSQL 16 | **The correctness boundary**, not a storage detail. Requires `CREATE EXTENSION btree_gist` (TC-3), which rules out any managed offering that restricts extension installation |
| **otel-lgtm** | Grafana, Tempo, Loki, Prometheus in one container | Receives OTLP over gRPC. **Its absence must not break the service**: telemetry export failures are logged and dropped, never propagated to a request |

Versions are pinned here because TC-10 deliberately left them open at Gate A: **Node ≥ 22.11 < 25**
and **npm ≥ 10.9** in `package.json` `engines`, **PostgreSQL 16** in compose and in the Testcontainers
image tag. The two PostgreSQL pins must match — a test suite that proves an invariant on a different
major version from the one that runs it has proved something about a different system.

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

- **The schema under test is byte-identical to the schema that runs.** Migrations are applied by the
  same programmatic call `npm run db:migrate` makes, so "did the test fixture drift from the
  migrations" is not a question that can be asked.
- **Tests isolate by data, not by truncation.** Each test seeds its own dealership, bays,
  technicians and service types, and works only within it. Truncating between tests would serialise
  the suite and — worse — would make the concurrency tests race the cleanup rather than each other.
  Isolating by dealership lets the suite run in parallel *and* keeps A-9's multi-dealership scoping
  under permanent test, since every test is implicitly asserting that another dealership's data does
  not leak into its own.
- **Concurrency tests get real connections.** QS-1 to QS-5 open several pooled connections and fire
  genuinely simultaneous statements. Nothing about that is simulatable; it is the whole point.

The cost is TC-9: **Docker is required to run the test suite**, and it is the most likely reason a
reader's first `npm test` fails. Only the `src/domain` suite runs without it, which is a consequence
of ADR-0008 making the pure core the unit-testable surface — the split is sharp rather than blurred,
and `npm run test:domain` is the Docker-less subset.

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
| CI, today | nothing; there is no application code yet | docs currency, the tools suite, diagram export, event-log integrity |

Node on the runner is **22.x** — §7.1's deployment runtime, not the maintainer's local Node 24, so
CI agrees with what runs in production rather than with a laptop. `npm ci --engine-strict` turns
TC-10's pin from a note into a build failure.

The workflow is **phased**: it contains only what passes before the application exists, because
METHODOLOGY §261 puts CI *before* slice 00's step 3 and therefore before the code it will eventually
check. What gets wired in at phase 4 — `typecheck`, `lint:arch` (QS-10), the Vitest suite, the
`red-proof` job and the `check.run` run summary — is listed in the workflow itself and argued in
ADR-0010. Two consequences belong here rather than in the ADR. **QS-14's latency budget is stated
*"on the CI container"***, so its numbers mean *a standard GitHub-hosted `ubuntu-latest` runner*, and
changing runner class silently changes what that scenario asserts. And the pipeline holds
`contents: read` only, so nothing in CI can write to the repository whose git history is itself an
assessed artifact (OC-7) — which is why `check.run` is collected at each gate rather than committed
by the workflow.
