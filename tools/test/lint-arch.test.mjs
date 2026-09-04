#!/usr/bin/env node
/**
 * Tests for tools/ci/lint-arch.mjs — the guard O1 put around `npm run lint:arch`.
 *
 *   node tools/test/lint-arch.test.mjs
 *
 * AUTHORED BY THE TEST-ENGINEER, and deliberately NOT wired into `npm run test:tools`
 * (docs/slices/00a-design.md §11.4). The implementer wires it in with the green commit that
 * creates tools/ci/lint-arch.mjs and repoints the `lint:arch` script at it.
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
 * `judgeCruiseResult(summary)` is the pure rule, so it is testable without running a cruise.
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
  check('exports a pure judgeCruiseResult(summary) → { ok, reason }',
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
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
