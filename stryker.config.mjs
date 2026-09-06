// Mutation testing. `CLAUDE.md` §3 names Stryker in the decided stack, §10 makes a
// mutation score part of Definition of Done, and `tools/slice/check.mjs` gates on
// 0.75 — so a slice cannot reach `done` without this running.
//
// Run by the REVIEWER at step 5, deliberately not in CI: METHODOLOGY makes survivors
// *findings for a role that wrote neither the tests nor the code*, not a build
// threshold. A survivor is a question to answer, and a number in a pipeline answers
// it by ignoring it.
//
// Scoped to `src/` because that is what the implementer's unit tests exist to drive.
// `tools/` is covered by tools/test/*.test.mjs, whose assertions were mutant-checked
// by hand at slice 00a; `tests/` is not production code.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',

  // THE COMMAND RUNNER, NOT THE VITEST RUNNER, AND THIS IS THE WHOLE REASON.
  //
  // `@stryker-mutator/vitest-runner@10.0.0` does not activate mutants under `vitest@5.0.0`.
  // Its peer range is `vitest: ">=2.0.0"`, so npm warns about nothing — the same shape as
  // dependency-cruiser's typescript range (F4), and the same shape as everything else this
  // slice found: a tool reporting a number over work it never did.
  //
  // Measured, on the run that produced the 6.34 score the human ruled BLOCKING:
  //
  //   - 118 of the 130 "survivors" had `testsCompleted: 0` in mutation.json. Stryker ran
  //     NO tests against them and recorded them as survived.
  //   - Every mutant of `src/application/checkHealth.ts` survived, including the one that
  //     empties the whole function body — against a file with six dedicated tests.
  //   - Taking Stryker's OWN sandbox, unmodified, and activating that mutant by hand the
  //     documented way — `__STRYKER_ACTIVE_MUTANT__=0 npx vitest run -c
  //     vitest.mutation.config.ts` — five of those tests FAIL. The mutant is killed. The
  //     runner simply never ran them.
  //   - Same tree, same mutants, command runner: 76.06 rather than 6.34, and
  //     `config.ts` 90.28 rather than 1.39.
  //
  // (A second, unrelated defect in the same runner: `--logLevel debug` crashes it outright
  // with "Converting circular structure to JSON" from vitest-test-runner.js:95, which
  // JSON.stringifies the resolved vitest config. So the integration cannot even be debugged
  // through its own logging.)
  //
  // The command runner has no framework integration to break: Stryker sets
  // `__STRYKER_ACTIVE_MUTANT__` in the environment, runs the command, and reads the exit
  // code. It is the same thing a person does by hand, which is why it is trustworthy — and
  // for a suite this size the cost is nothing: 142 mutants in ~33 seconds.
  testRunner: 'command',
  commandRunner: { command: 'npx vitest run -c vitest.mutation.config.ts' },

  // `off` rather than `all` or `perTest`: without a framework integration there is no
  // per-test attribution to collect, so every mutant runs the whole 47-test suite. That is
  // the conservative direction — a mutant is never skipped as "not covered" — and it is
  // what makes "Ran 1.00 tests per mutant" in the output mean one full suite run.
  coverageAnalysis: 'off',

  // WHAT IS MUTATED IS A DEFINITION-OF-DONE STATEMENT (§10), so the architect owns these
  // three lines and the reviewer owns everything else in this file. `guard-paths` denies
  // this path to nobody; the split is by what the line asserts, not by where it lives.
  mutate: [
    'src/**/*.ts',
    // THE EXCLUSION SURVIVES; ITS OLD JUSTIFICATION DID NOT, AND THIS IS THE CORRECTION.
    //
    // It read "the composition root: wiring, asserted by AC-2 end to end" — a claim of
    // COVERAGE, and the reviewer showed it false of the one line that matters: delete
    // `main.ts:46` and `BOOKING_SEED` runs ADR-0009's Order-A in production unannounced
    // while `npm test`, `npm run mutation` and `depcruise` all stay green. A comment
    // asserting coverage that does not exist is this project's most-counted defect shape,
    // and it does not get to hide in the file that measures the others.
    //
    // The true reason is the opposite of coverage: THIS RUNNER CANNOT REACH THIS FILE.
    // `vitest.mutation.config.ts` includes `tests/unit/**` and nothing else, and
    // `main.ts` is unimportable by a unit test by construction — it awaits `app.listen()`
    // and calls `process.exit` at module scope. Mutating it would produce a full set of
    // uncovered survivors, lowering the score by exactly the mutant count while saying
    // nothing whatever about the tests. Excluding it is right; claiming it was asserted
    // was not.
    //
    // Considered and rejected: point the mutant command at the outside-in suites, which
    // DO exercise this file. They run the built artifact (ADR-0013), so each mutant would
    // need its own `tsc` plus a Testcontainers PostgreSQL — a ~33-second run becomes hours
    // — and Stryker would still be scoring a child process it did not instrument.
    //
    // WHAT THIS COSTS, STATED RATHER THAN IMPLIED: every line of `main.ts` is guarded by
    // an outside-in assertion or by nothing at all, and the mutation score cannot tell
    // which. `main.ts:46` was the demonstration. The remedy is an outside-in assertion in
    // a test-engineer-owned file, not a number in this one.
    '!src/main.ts',
    '!src/**/*.d.ts',
  ],

  // §10's threshold is 0.75 and `slice:check` reads the recorded score against it.
  // `break` is set one point below `low` so a marginal slice fails the reviewer's run
  // rather than passing quietly and failing the gate script afterwards.
  thresholds: { high: 90, low: 75, break: 74 },

  reporters: ['html', 'clear-text', 'progress', 'json'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },

  // Survivors are the deliverable, so they must be readable without opening the HTML.
  clearTextReporter: { allowColor: true, maxTestsToLog: 3 },

  concurrency: 4,
  timeoutMS: 60000,
  tempDirName: 'node_modules/.cache/stryker-tmp',
  disableTypeChecks: 'src/**/*.ts',
};
