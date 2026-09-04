import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration — test-engineer's, slice 00a red commit
 * (docs/slices/00a-design.md §4, §11.3).
 *
 * TWO PROJECTS, split by whether a test needs the database.
 *
 * Under a single project a failing container start aborts the whole run, so nobody could
 * execute any Vitest test without a working Docker daemon — not the AC-4 fixture, and not
 * the implementer's inner TDD loop. `npm run test:nodb` is that Docker-less subset;
 * `npm test` runs both and still produces ONE `test-results.json`, which matters because
 * `tools/ci/red-proof.mjs` takes a single `--results` path (§7).
 *
 *   nodb   tests/unit/**, tests/architecture/**            no globalSetup
 *   db     everything that talks to PostgreSQL             globalSetup: tests/setup/postgres.ts
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
          include: ['tests/unit/**/*.test.ts', 'tests/architecture/**/*.test.ts'],
          // The AC-3 and AC-4 cases shell out to `depcruise` over the whole repository.
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
            'tests/property/**/*.test.ts',
            'tests/concurrency/**/*.test.ts',
            'tests/performance/**/*.test.ts',
          ],
          globalSetup: ['tests/setup/postgres.ts'],
          // Spawning the compiled service and polling it for readiness.
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
