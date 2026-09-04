---
id: "00a"
title: Walking skeleton — toolchain, real PostgreSQL under test, and the layering ruleset in CI
status: ready
depends_on: []
arc42: ["§5.2", "§5.3", "§7.1", "§7.2", "§7.4", "§8.5", "§11.2"]
adr: [5, 6, 7, 8, 10]
quality_scenarios: [QS-10]
loopbacks: 0
---

## Goal

A clean checkout can be built, started and tested. `npm test` boots a real PostgreSQL through
Testcontainers, the service answers on a port, and `depcruise` rejects a layering violation in CI.
No domain logic — the point is that every mechanism the following twelve slices depend on is proven
to work before any of them is attempted.

Split out of the pilot at Gate B. The scaffold is not trivial, and bundling it with slice 00 would
have made the phase-4 retro measure setup friction rather than the slice loop.

## Acceptance criteria

- **AC-1** — Given a clean checkout on a machine with Docker, when `npm ci && npm test` is run, then
  a PostgreSQL container starts, the suite connects to it, and the run exits 0.
- **AC-2** — Given the service is started, when `GET /health` is requested, then it returns `200`
  with a body reporting database connectivity, and returns `503` when the database is unreachable.
- **AC-3** — Given the module tree of §5.2, when `npm run lint:arch` runs, then it exits 0.
- **AC-4** — Given a temporary fixture tree containing a known violation of each of `domain-is-pure`,
  `sql-only-in-persistence`, `http-must-not-reach-persistence` and
  `outside-in-tests-do-not-import-src`, when `depcruise` runs against it, then each violation is
  reported by name. *(QS-10 — a ruleset that has never rejected anything is not evidence.)*
- **AC-5** — Given a CI run has completed, when `node tools/team-log/collect-ci.mjs` is run, then a
  `check.run` record with `source: "derived"` is appended to `docs/team-log/events.jsonl` naming the
  run id, head SHA and per-check outcomes.
- **AC-6** — Given a branch whose head commit subject matches `^test\(.+\): .*\(red\)$`, when CI
  runs, then the `red-proof` job succeeds if and only if the acceptance suite failed while install,
  typecheck, lint and unit all passed.

## In scope

- `docker-compose.yml` — PostgreSQL and the `grafana/otel-lgtm` stack, for local run and the cURL
  harness. Explicitly **not** on the test path: Testcontainers starts its own database (§7.2).
- TypeScript, Vitest, Testcontainers, Fastify, Kysely, `node-pg-migrate` (ADR-0005 to ADR-0007).
- The five module directories of §5.2 with a composition root, empty but conformant.
- `GET /health`.
- `tests/architecture/layering.test.ts` — test-engineer owned per the Gate B ruling.
- The phase-4 CI block from `.github/workflows/verify.yml`: `typecheck`, `lint:arch`, `npm test`,
  the `red-proof` job and the run summary.
- `tools/team-log/collect-ci.mjs` (ADR-0010).

## Out of scope

- Any migration, table or domain type — slice 00.
- Any endpoint other than `/health`.
- Observability wiring beyond what the OTel SDK does by default — slice 09.

## Definition of done

Beyond `CLAUDE.md` §10:

- CI is green on `main` with the phase-4 block enabled.
- `npm run slice:check 00a` reports the `check.run` evidence chain populated — this slice is what
  makes criterion C1 passable for every slice after it.
- `docs/arc42/07-deployment-view.md` §7.2 reconciled to what compose actually starts.
