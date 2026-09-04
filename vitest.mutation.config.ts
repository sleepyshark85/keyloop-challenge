import { defineConfig } from 'vitest/config';

/**
 * The suite Stryker runs, and only that.
 *
 * `vitest.config.ts` is the test-engineer's and stays untouched; this file is
 * reviewer tooling, referenced only by `stryker.config.mjs`.
 *
 * It exists because the `nodb` project spans `tests/unit/**` *and*
 * `tests/architecture/**`, and Stryker's vitest runner has no way to select one
 * project — its schema offers `dir`, `related` and `configFile`, and `dir` does
 * not override a project's own `include` globs. Measured: with the real config,
 * Stryker's dry run failed on `tests/architecture/layering.test.ts`.
 *
 * The architecture tests are excluded for two reasons, not one:
 *
 *   1. They spawn `depcruise` as a subprocess. Stryker copies the project into a
 *      sandbox and runs there, where relative resolution differs — the dry run
 *      reported five `not-to-unresolvable` violations reaching into
 *      `../../../vitest/*.d.ts` that do not exist in a normal checkout. The test
 *      is correct; the sandbox is not the tree it was written against.
 *   2. They assert properties of the *ruleset*, not of `src/`. Mutating a line of
 *      `src/platform/config.ts` cannot change whether `domain-is-pure` fires, so
 *      every architecture test would survive every mutant and dilute the score
 *      with tests that were never evidence for the mutated code.
 *
 * That second reason is the load-bearing one: including them would raise the
 * mutation score without any mutant being killed, which is the same shape as
 * every other false green this slice has found.
 */
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    // No globalSetup: nothing here touches PostgreSQL, and a container per mutant
    // would make the run unusable.
    environment: 'node',
    passWithNoTests: false,
  },
});
