# Prompt · slice 00a · implementer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 00a step 4 commits 1-6
- Sent: 2026-09-04T03:10:23.927Z

---

You are the implementer at **step 4 (Green)** of the slice loop for **slice 00a — the walking skeleton**. Branch `slice/00a-walking-skeleton`, currently at the test-engineer's red commit `a483d09`. PR #4 is the venue.

**Scope this run: commits 1 through 6 only.** Stop after commit 6 and report. Commits 7–9 (`collect-ci.mjs`, `red-proof.mjs`, `lint-arch.mjs` + the CI phase-4 block) are held because the architect is ruling on four step-3 findings that change exactly those files. Do not start them.

## Read first — the design has changed substantially since you reviewed it

**`docs/slices/00a-design.md` in full.** Your two objections were ruled on, the test-engineer's three were, and then the architect self-raised a sixth finding that reversed two of its own decisions. §0 is the audit trail. What matters most to you:

- **Your O-1 was upheld and the human ruled on the escalation** — AC-6 reads BROAD. Your proposed remedy was *rejected in part*: `tests/integration/` stays inside the red zone, because slice 00's only test file lives there and excluding it would break the pilot.
- **Your O-2 was upheld** — constraints 4 and 5 are in §6.
- **Your §2(c) counterexample was accepted.** The design no longer claims partial application is the only shape; it claims `src/http` cannot *name* the handle's type, with your `GenericDeps<TDb>` recorded beside it.
- **Your `node-pg-migrate` source reading was accepted** — §4's warning is struck.
- **`ServerDeps.logger: FastifyBaseLogger`, `pool.on('error')`** — both accepted and in the design.
- **NEW: two Vitest projects**, `db` and `nodb`, split by whether a test needs the database. This is your inner TDD loop.
- **NEW: no TypeScript loader.** The project compiles — `pretest` runs `build`, `start` is `node dist/main.js`.

Also read the test-engineer's report at `docs/team-log/prompts/s00a-test-engineer-2.report.md` — it carries nine findings, several of which constrain you.

## Environment has changed too

**Docker is now available locally** — 29.8.0, `postgres:16` pulled and cached. You reported having none at step 2. You can and must run the full suite locally now.

## What is already done for you

The test-engineer's red commit landed `tsconfig.json`, `vitest.config.ts`, `tests/setup/`, `tests/support/`, the tests, the `test` CI job, and these devDependencies: `typescript@6.0.3` (**pinned deliberately — see below**), `@types/node`, `vitest`, `@testcontainers/postgresql`, `node-pg-migrate`, `pg`, `@types/pg`.

**`typescript` is pinned to `6.0.3` and the pin is load-bearing.** `npm i -D typescript` now installs 7.0.2, and `dependency-cruiser@18.2.0` declares `typescript: ">=2.0.0 <7.0.0"`. With 7.x installed, every cruise in this repository silently becomes inert — `lint:arch` exits 0 having examined nothing. **Do not bump it.**

## Your commits 1–6, per the design

1. `feat(00a): config and logger` — `src/platform/config.ts`, `src/platform/logger.ts`, `tests/unit/platform/config.test.ts`; adds `pino`
2. `feat(00a): the database handle and the Db alias` — `src/persistence/schema.ts`, `src/persistence/db.ts`, `src/persistence/migrations/.gitkeep`, `tests/unit/persistence/db.test.ts` (assert `pool.totalCount === 0` after `createDb` — the lazy-pool property AC-2 depends on, pinned by a test rather than by prose); adds `kysely`
3. `feat(00a): pingDatabase never rethrows a driver error` — `src/persistence/health.ts`, `tests/unit/persistence/health.test.ts`
4. `feat(00a): checkHealth returns a HealthOutcome union` — `src/application/checkHealth.ts`, `tests/unit/application/checkHealth.test.ts`
5. `feat(00a): GET /health maps outcome to 200 and 503` — `src/http/routes/health.ts`, `src/http/server.ts`, `tests/unit/http/health.test.ts` via `app.inject`; adds `fastify`, `@sinclair/typebox`
6. `feat(00a): composition root, signals, and the local stack` — `src/main.ts`, `src/domain/.gitkeep`, `docker-compose.yml`, `.gitignore` additions, and the `package.json` scripts assigned to you in §11.3

That order is yours from step 2; follow it unless the amended design says otherwise, in which case the design wins.

## What "green" means here, and it is not optional

Per the design's §11.3, before **each** commit:

- `npm run typecheck`
- `npm run lint:arch` — the raw `depcruise` CLI at this point; the wrapper is commit 9
- `npm run test:tools`
- `npm run test:nodb` — your fast inner loop, no container

Run `npm test` (the full suite, with Docker) before your final commit of this run. **AC-2 should go green at commit 6** once `dist/main.js` exists — that is the first moment the acceptance test can pass, and I want it confirmed rather than assumed.

`process-criteria.md` **C4** measures whether your first submission passes layering without a review round. Run `lint:arch` before every commit, not at the end.

Push after each commit rather than in batches — the design recommends it, runs are cheap, and it converts "green" from an assertion into recorded runs.

## Rules

- **Do not edit any test the test-engineer owns**: `tests/acceptance/`, `tests/contract/`, `tests/property/`, `tests/concurrency/`, `tests/architecture/`, `tests/performance/`, `tests/integration/`, `tests/setup/`, `tests/support/`, `vitest.config.ts`. The path hook enforces this. If one is wrong, **raise a DCR** — do not edit it.
- Do not touch `.github/workflows/verify.yml` — the `test` job is the test-engineer's and the rest is commit 9.
- Do not write to `docs/team-log/`, do not move the board, do not comment on the PR.
- Small commits. If one changes more than ~150 lines, it should probably have been two.
- End each commit message with:

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WsmVKqwdSeBsLAv6qMduLw

## Report back

The six SHAs in order, with what each contains and the local check results for each. Confirmation of whether AC-2 went green at commit 6 and what the full `npm test` reported. Whether `lint:arch` passed on every commit without a fix-up — C4 turns on that, so report it honestly if it did not. And anything the design gets wrong that you hit while building; the test-engineer found nine such things at step 3 and you found several at step 2.
