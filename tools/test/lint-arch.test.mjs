#!/usr/bin/env node
/**
 * Tests for tools/ci/lint-arch.mjs — the guard O1 put around `npm run lint:arch`.
 *
 *   node tools/test/lint-arch.test.mjs
 *
 * AUTHORED BY THE TEST-ENGINEER, unwired at the red commit (docs/slices/00a-design.md
 * §11.4) and wired into `npm run test:tools` by the implementer in the green commit that
 * created tools/ci/lint-arch.mjs and repointed the `lint:arch` script at it.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * WHY THE GUARD EXISTS AT ALL
 *
 * `depcruise src tests --config .dependency-cruiser.js` EXITS 0 HAVING CRUISED NOTHING when
 * it detects a TypeScript environment and cannot resolve a compatible `typescript`. Measured
 * at step 2 on a fixture built to the step-1 design:
 *
 *   exit 0 · violations 0 · totalCruised 0 · modules 0 · stderr empty
 *   summary.environment.issues[0].name = "missing-typescript-transpiler"
 *
 * That is not hypothetical here. dependency-cruiser 18.2.0 declares
 * `supportedTranspilers.typescript = ">=2.0.0 <7.0.0"`, and `npm i -D typescript` today
 * resolves 7.x — so the range in §5 is an ACTIVE constraint, not a footnote. The red commit
 * pins typescript to 6.x for exactly this reason.
 *
 * Left unguarded, `collect-ci.mjs` records `checks.depcruise: "pass"`, and criterion C4 —
 * "architecture held unprompted", measured from `depcruise` in `check.run` — reports a clean
 * architecture for twelve slices in which the ruleset never ran. QS-10 would switch itself
 * off in silence. So the guard has to live inside whatever produces that "pass", which is
 * the `lint:arch` step itself, and not only inside tests/architecture/layering.test.ts.
 *
 * `judgeCruiseResult(cruiseResult, roots)` is the pure rule, so it is testable without
 * running a cruise.
 *
 * ── J-1: this file was written before the step-3 ruling, and could not exercise F2 ──────
 *
 * The cases below were authored against the step-2 signature and pass a bare `summary`.
 * F2's remedy — "exits non-zero if any ROOT passed on the command line contributed no
 * modules, naming the root" (design §5) — cannot be reached from a summary: `modules[]` is a
 * SIBLING of `summary` in the `--output-type json` payload, and a summary alone carries
 * `totalCruised` and no file list. So every case here judged the F2 rule vacuously.
 *
 * That is F2's own defect a second time: a constraint imposed in one place and enforced in
 * another that is never run. The per-root block at the bottom is the fix — full cruise
 * results, explicit roots, and an assertion that the missing root is NAMED, because "the
 * cruise examined nothing under src" and "the cruise examined nothing" are different
 * failures and only the first tells a maintainer where to look.
 */
import { resolve } from 'node:path';

const TOOL = resolve('tools/ci/lint-arch.mjs');

let passed = 0;
let failed = 0;
const check = (desc, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ok    ${desc}`); }
  else { failed++; console.log(`FAIL    ${desc}${detail ? `\n          ${detail}` : ''}`); }
};

/** A cruise summary, in the shape dependency-cruiser's --output-type json emits. */
const summary = (overrides = {}) => ({
  error: 0,
  warn: 0,
  info: 0,
  totalCruised: 42,
  violations: [],
  environment: {
    version: '18.2.0',
    nodeVersionSupported: '>=20',
    nodeVersionFound: 'v22.11.0',
    osVersionFound: 'linux',
    transpilersFound: [{ name: 'typescript', version: '6.0.3', available: true }],
    extensionsFound: [],
  },
  ...overrides,
});

const tool = await import(TOOL).catch((error) => {
  check('tools/ci/lint-arch.mjs is importable', false, String(error?.message ?? error));
  return null;
});

if (tool) {
  const { judgeCruiseResult } = tool;
  check('exports a pure judgeCruiseResult(cruiseResult, roots) → { ok, reason }',
    typeof judgeCruiseResult === 'function',
    'so the rule is unit-testable without running a cruise');

  if (typeof judgeCruiseResult === 'function') {
    // The three summaries §5 names, plus the happy case.
    const cases = [
      ['a clean cruise over a real tree → ok', summary(), true],

      ['AN ENVIRONMENT ISSUE → not ok, however clean the result looks',
        summary({
          environment: {
            ...summary().environment,
            transpilersFound: [{ name: 'typescript', version: '7.0.2', available: false }],
            issues: [{
              severity: 'warn',
              name: 'missing-typescript-transpiler',
              description: 'dependency-cruiser detected a TypeScript environment, but not a '
                + 'compatible TypeScript compiler (typescript: 7.0.2).',
            }],
          },
        }),
        false],

      ['ZERO MODULES CRUISED → not ok, because an empty graph and a clean graph look identical',
        summary({ totalCruised: 0 }), false],

      ['a real error-severity violation → not ok',
        summary({
          error: 1,
          violations: [{
            from: 'src/domain/interval.ts',
            to: 'src/persistence/db.ts',
            rule: { name: 'domain-is-pure', severity: 'error' },
          }],
        }),
        false],

      ['a warn-severity violation alone → still ok',
        summary({
          warn: 1,
          violations: [{
            from: 'src/http/orphan.ts',
            to: '',
            rule: { name: 'no-orphans', severity: 'warn' },
          }],
        }),
        true],
    ];

    for (const [desc, input, expected] of cases) {
      const verdict = judgeCruiseResult(input);
      check(desc, verdict?.ok === expected,
        `expected ok=${expected}, got ${JSON.stringify(verdict)}`);
      if (expected === false) {
        check(`${desc} — names the cause in reason`,
          typeof verdict?.reason === 'string' && verdict.reason.length > 0,
          'the developer-facing output must be no worse than the bare CLI\'s');
      }
    }

    check('an environment issue is judged BEFORE violations are read',
      judgeCruiseResult(summary({
        error: 0,
        violations: [],
        totalCruised: 0,
        environment: {
          ...summary().environment,
          issues: [{ severity: 'warn', name: 'missing-typescript-transpiler', description: 'x' }],
        },
      }))?.reason?.includes('typescript'),
      'zero violations over zero modules is the exact signature of the failure, so the '
      + 'reason must name the environment rather than the empty result');

    // ── F2: per-ROOT coverage (J-1) ────────────────────────────────────────────────────
    //
    // The cases above pass a bare summary, which has no `modules[]` and therefore cannot
    // reach this rule at all. These pass the real payload shape.

    /** A `--output-type json` result: modules[] is a SIBLING of summary, not inside it. */
    const cruise = (sources, overrides = {}) => ({
      modules: sources.map((source) => ({ source, dependencies: [], dependents: [] })),
      summary: summary({ totalCruised: sources.length, ...overrides }),
    });

    const srcAndTests = ['src/domain/interval.ts', 'src/http/server.ts', 'tests/unit/a.test.ts'];

    check('a cruise covering every root → ok',
      judgeCruiseResult(cruise(srcAndTests), ['src', 'tests'])?.ok === true,
      JSON.stringify(judgeCruiseResult(cruise(srcAndTests), ['src', 'tests'])));

    // THE CASE F2 EXISTS FOR. Overall the count is non-zero, so the pre-F2 guard passed it.
    const testsOnly = judgeCruiseResult(cruise(['tests/unit/a.test.ts']), ['src', 'tests']);
    check('a root that contributed NO modules → not ok, though the overall count is non-zero',
      testsOnly?.ok === false,
      'this is F2: `tests/` alone keeps totalCruised > 0 while `src/` — the thing QS-10 is '
      + `about — goes unexamined behind a green gate. got ${JSON.stringify(testsOnly)}`);
    check('…and the reason NAMES the uncovered root',
      typeof testsOnly?.reason === 'string' && testsOnly.reason.includes('src'),
      '"the cruise examined nothing under src" and "the cruise examined nothing" are '
      + `different failures; only the first says where to look. got ${testsOnly?.reason}`);

    // Constraint 1 of §5: the roots come from the wrapper's own argv. A rule hardcoded to
    // ['src','tests'] passes the case above and silently stops covering a third root — the
    // same bug a fourth time, inside the guard against it.
    const thirdRoot = judgeCruiseResult(cruise(srcAndTests), ['src', 'tests', 'tools']);
    check('a THIRD root with no modules → not ok, naming it (roots come from argv)',
      thirdRoot?.ok === false && thirdRoot?.reason?.includes('tools'),
      'src and tests are covered here, so a rule hardcoded to that pair reports ok. '
      + `got ${JSON.stringify(thirdRoot)}`);

    // A root is a PATH PREFIX, not a string prefix: "srcery/" must not count as covering
    // "src". A substring test reads this tree as fully cruised.
    const notABoundary = judgeCruiseResult(
      cruise(['srcery/x.ts', 'tests/unit/a.test.ts']), ['src', 'tests']);
    check('a module under a directory that merely starts with the root name does not cover it',
      notABoundary?.ok === false && notABoundary?.reason?.includes('src'),
      `"srcery/x.ts" is not under "src". got ${JSON.stringify(notABoundary)}`);

    check('an environment issue is judged BEFORE coverage, too',
      judgeCruiseResult(
        cruise([], {
          environment: {
            ...summary().environment,
            issues: [{ severity: 'warn', name: 'missing-typescript-transpiler', description: 'x' }],
          },
        }),
        ['src', 'tests'],
      )?.reason?.includes('typescript'),
      'an unresolvable compiler produces an empty modules[], so the per-root rule would '
      + 'also fire — and would send the maintainer to look at `src/` for a problem that is '
      + 'in their toolchain');

    // An error-severity violation must still be reported when coverage is fine, so the new
    // rule cannot mask the old one.
    const violating = judgeCruiseResult(
      cruise(srcAndTests, {
        error: 1,
        violations: [{
          from: 'src/domain/interval.ts',
          to: 'src/persistence/db.ts',
          rule: { name: 'domain-is-pure', severity: 'error' },
        }],
      }),
      ['src', 'tests'],
    );
    check('a covered cruise with a real violation → not ok, naming the rule',
      violating?.ok === false && violating?.reason?.includes('domain-is-pure'),
      JSON.stringify(violating));
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
