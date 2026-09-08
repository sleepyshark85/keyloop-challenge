import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Vitest configuration — test-engineer's, slice 00a red commit
 * (docs/slices/00a-design.md §4, §11.3), amended at slice 01's red commit under ADR-0013
 * (docs/adr/0013-outside-in-tests-exercise-the-built-artifact.md §6.3), and again at slice 09
 * (`T-09-3`) to give `tests/performance/**` its own project and its own container.
 *
 * THREE PROJECTS. `nodb` splits by whether a test needs the database at all; `perf` then
 * splits OFF `tests/performance/**` from `db` so the QS-14 budget runs EXCLUSIVELY — no other
 * project's files execute in the same invocation, and no other project's requests share its
 * container — because "uncontended" (arc42 §10.2, `09-design.md` "What makes QS-14
 * assertable") is a property of the RUNNER as well as of the request.
 *
 * Under a single project a failing container start aborts the whole run, so nobody could
 * execute any Vitest test without a working Docker daemon — not the AC-4 fixture, and not
 * the implementer's inner TDD loop. `npm run test:nodb` is that Docker-less subset;
 * `npm test` runs all three, as SEPARATE `vitest run` invocations merged by
 * `tools/ci/run-tests.mjs` (T-01-2, ADR-0013's third clause; `PROJECTS` there is `tools/ci`'s
 * own file to change) — never as one invocation over several projects, because a
 * `globalSetup` abort in one project would otherwise discard the other projects' results
 * entirely (measured: 0 files, 0 tests).
 *
 *   nodb   tests/unit/**, tests/architecture/**,                    no globalSetup
 *          tests/property/** EXCEPT *.db.test.ts
 *   db     everything else that talks to PostgreSQL,                globalSetup: tests/setup/postgres.ts
 *          tests/property/**\/*.db.test.ts
 *   perf   tests/performance/** ONLY                                globalSetup: tests/setup/postgres.ts
 *
 * `perf` and `db` point at the SAME `globalSetup` file. That is what gives `perf` its OWN
 * container rather than sharing `db`'s: `tests/setup/postgres.ts`'s `setup()` starts a fresh
 * `PostgreSqlContainer` on every invocation, and per-project `globalSetup` runs once per
 * project that owns a file in the run (verified below and in that file's own header) — so two
 * projects naming the same setup file get two containers, not one shared between them.
 *
 * `T-09-3`'s alternative — `fileParallelism: false` scoped to `db` — was REFUSED: it would
 * serialise all 21 `db` files to isolate the one `performance` file, on every run of every
 * future slice, for one container start's saving. A third project buys exclusivity at the
 * CONTAINER rather than at the file, for the same cost `db` already pays once.
 *
 * `tests/property/` SPLITS BY DATABASE NEED (ADR-0013, slice 01). It used to sit entirely in
 * `db`, behind `globalSetup: tests/setup/postgres.ts` — which would start a real PostgreSQL
 * container to exercise three pure functions that import nothing, and worse, would let a
 * Docker hiccup turn QS-9's red evidence into a `globalSetup` crash rather than an assertion
 * failure (exactly the trap slice 00 was built to avoid). A property test that needs the
 * database is named `*.db.test.ts` and runs in `db`; everything else under `tests/property/`
 * runs in `nodb`. `tests/property/opening-hours-dst.test.ts` (slice 01, QS-9) needs no
 * database — it loads `dist/domain/*.js` directly (ADR-0013 §6.2) — so it belongs in `nodb`.
 *
 * TWO CONSTRAINTS this split must hold, stated because they are easy to violate silently:
 *
 *   - a `*.db.test.ts` file must run in EXACTLY ONE project. `nodb`'s `include` glob
 *     `tests/property/**\/*.test.ts` would ALSO match a `*.db.test.ts` file (the suffix is a
 *     still a `.test.ts` file), so `nodb`'s `exclude` below removes it explicitly — without
 *     that exclude, such a file would run twice, once with no container.
 *   - Vitest's `exclude` REPLACES its defaults rather than extending them. `nodb` therefore
 *     spreads `configDefaults.exclude` before adding its own entry, or `node_modules` and
 *     `dist` come back into collection (and `dist/**\/*.test.ts`, were such a thing ever
 *     built, would be collected as source).
 *
 * Per-project `globalSetup` was the one mechanical unknown §4 flagged for verification
 * before the red commit. Verified on the pinned vitest@5.0.0: `globalSetup` is absent from
 * `NonProjectOptions`, is explicitly NOT inherited from the root config, and is run by
 * `TestProject._initializeGlobalSetup()` only for projects that own a file in the run. So
 * `vitest run --project nodb` starts no container, and no second config file is needed.
 *
 * `include` is scoped to `tests/**` on purpose. `tools/test/*.test.mjs` are plain node
 * scripts run by `npm run test:tools`; if Vitest collected them they would run inside
 * `npm test`, redden the red commit for a reason that is not an acceptance criterion, and
 * pollute the failure set `red-proof` classifies.
 */
export default defineConfig({
  test: {
    // Root-level only: `reporters` and `outputFile` are non-project options in Vitest, so
    // `npm test -- --reporter=json --outputFile=test-results.json` yields one file for
    // both projects. That is the property red-proof.mjs's single `--results` input rests on.
    projects: [
      {
        test: {
          name: 'nodb',
          include: [
            'tests/unit/**/*.test.ts',
            'tests/architecture/**/*.test.ts',
            'tests/property/**/*.test.ts',
          ],
          exclude: [...configDefaults.exclude, 'tests/property/**/*.db.test.ts'],
          // The AC-3 and AC-4 cases shell out to `depcruise` over the whole repository; the
          // property project runs `fc.assert` over up to 1800 runs per property.
          testTimeout: 120_000,
        },
      },
      {
        test: {
          name: 'db',
          include: [
            'tests/acceptance/**/*.test.ts',
            'tests/contract/**/*.test.ts',
            'tests/integration/**/*.test.ts',
            'tests/property/**/*.db.test.ts',
            'tests/concurrency/**/*.test.ts',
          ],
          globalSetup: ['tests/setup/postgres.ts'],
          // Spawning the compiled service and polling it for readiness.
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
      {
        test: {
          name: 'perf',
          include: ['tests/performance/**/*.test.ts'],
          // Deliberately the SAME setup file as `db` — see this file's header for why that
          // gives `perf` its own container rather than sharing one.
          globalSetup: ['tests/setup/postgres.ts'],
          // The QS-14 fixture seeds 500 appointments and runs 100+100+ timed HTTP round
          // trips; generous headroom over `db`'s own bound rather than a measured minimum.
          testTimeout: 180_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
