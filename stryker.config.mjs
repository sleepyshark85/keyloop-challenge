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
  testRunner: 'vitest',

  // A dedicated config rather than the test-engineer's: the vitest runner cannot
  // select one project (its schema offers only `dir`, `related` and `configFile`,
  // and `dir` does not override a project's `include`), and `nodb` spans both
  // tests/unit and tests/architecture. See vitest.mutation.config.ts for why the
  // architecture tests are excluded — briefly, they assert the ruleset rather than
  // `src/`, so they would survive every mutant and inflate the score.
  // `related: false` because Vitest's related-mode maps a mutated file to its tests
  // through the import graph, and it resolves nothing here: the unit tests import
  // `../../../src/...` with an explicit `.js` extension (NodeNext), which does not
  // match the mutant's own path. Measured — with related on, Stryker instrumented
  // 142 mutants and then reported "No tests were found". Running the whole `nodb`
  // project per mutant is cheap: it is 54 tests with no container.
  vitest: { configFile: 'vitest.mutation.config.ts', related: false },

  mutate: [
    'src/**/*.ts',
    '!src/main.ts',        // the composition root: wiring, asserted by AC-2 end to end
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

  // `all` rather than the default `perTest`. Measured: with perTest, the dry run
  // ran all 43 unit tests successfully and then reported 142 of 142 mutants as
  // "no coverage" — a 6.34 score that says nothing about the tests. perTest needs
  // the runner to attribute executed lines to individual tests, and the vitest
  // runner does not do so for modules imported at the top of a spec, which is how
  // every one of these tests imports its subject. `all` runs the whole suite per
  // mutant; at 43 tests with no container that costs seconds.
  coverageAnalysis: 'all',

  concurrency: 4,
  timeoutMS: 20000,
  tempDirName: 'node_modules/.cache/stryker-tmp',
  disableTypeChecks: 'src/**/*.ts',
};
