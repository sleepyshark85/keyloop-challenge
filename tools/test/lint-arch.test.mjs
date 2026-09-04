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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const TOOL = resolve('tools/ci/lint-arch.mjs');
const REPO_ROOT = process.cwd();
const DEPCRUISE = resolve(REPO_ROOT, 'node_modules/.bin/depcruise');

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

// ── THE WRAPPER, SPAWNED: an exit code DERIVED, never passed through (F3) ──────────────
//
// This is the one rule in this tool whose deletion is invisible to the entire suite.
//
// `depcruise --output-type json` EXITS 0 WITH ERROR-SEVERITY VIOLATIONS PRESENT — measured
// at F3, and asserted again below rather than trusted, because the whole case rests on it.
// Only the default `err` reporter turns violations into a status. So `main()` derives its
// own exit code from the parsed JSON and deliberately does not pass the CLI's through.
//
// Tidy that into `return cruise.status` and `npm run lint:arch` exits 0 on every real
// layering violation. Nothing in this repository fails: layering.test.ts's AC-3 case asserts
// the wrapper exits 0 on a CLEAN tree, which is true either way, and its AC-4 cases spawn
// `depcruise` directly rather than the wrapper. `collect-ci.mjs` then records
// `checks.depcruise: "pass"`, criterion C4 reads a clean architecture, and QS-10 switches
// itself off in silence — the third instance of O1's failure mode, now in the guard written
// against the second.
//
// The only way to catch it is to SPAWN the wrapper against a tree that really violates the
// ruleset and read its status. Everything above this line tests the pure rule; the exit code
// is not in the pure rule.

const fixtureRoots = [];

/**
 * A tree the wrapper can be pointed at, with `cwd` set to it.
 *
 * Two symlinks, and both are load-bearing rather than convenient — the standard this slice
 * arrived at after the AC-4 fixture's symlink turned out to have a false explanation:
 *
 *   .dependency-cruiser.js  `main()` passes `--config .dependency-cruiser.js`, a BARE
 *                           cwd-relative filename with no flag to override it. A symlink
 *                           rather than a copy so the ruleset under test is the real file,
 *                           byte for byte, and cannot drift from the one CI runs.
 *   node_modules            `main()` resolves `node_modules/.bin/depcruise` from the cwd and
 *                           REFUSES to fall back to PATH. Verified: without this link the
 *                           wrapper exits 2 naming the missing binary — so a fixture that
 *                           failed to link cannot be mistaken for a fixture that found a
 *                           violation, since the assertions below want exit 1 specifically.
 */
function fixture(sources) {
  const root = mkdtempSync(join(tmpdir(), 'keyloop-lint-arch-'));
  fixtureRoots.push(root);

  symlinkSync(resolve(REPO_ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');
  symlinkSync(resolve(REPO_ROOT, '.dependency-cruiser.js'), join(root, '.dependency-cruiser.js'));
  writeFileSync(join(root, 'package.json'),
    `${JSON.stringify({ name: 'lint-arch-fixture', private: true, type: 'module' }, null, 2)}\n`);
  // `tsPreCompilationDeps` needs a TypeScript configuration resolvable from the working
  // directory, and `tsConfig.fileName` in the ruleset is a bare filename.
  writeFileSync(join(root, 'tsconfig.json'),
    `${JSON.stringify({ compilerOptions: {
      module: 'nodenext', moduleResolution: 'nodenext', target: 'es2023', strict: true,
    } }, null, 2)}\n`);

  for (const [path, contents] of Object.entries(sources)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  return root;
}

const LEGAL_TREE = {
  'src/platform/config.ts': 'export const config = { port: 3000 };\n',
  'src/domain/policy.ts': 'export const allowed = (n: number): boolean => n > 0;\n',
  // `tests/` is planted in both trees so the per-root coverage rule is satisfied and cannot
  // be the reason for a non-zero exit. The assertions want the VIOLATION to be the reason.
  'tests/acceptance/probe.test.ts':
    "import assert from 'node:assert';\nexport const check = (): void => assert.ok(true);\n",
};

const violatingRoot = fixture({
  ...LEGAL_TREE,
  // domain-is-pure: the core may import nothing. One violation, one rule, and no stub
  // packages needed — what is under test here is the exit code, not the ruleset's coverage,
  // which tests/architecture/layering.test.ts already establishes rule by rule.
  'src/domain/bad.ts':
    "import { config } from '../platform/config.js';\nexport const port = config.port;\n",
});
const conformingRoot = fixture(LEGAL_TREE);

const wrapper = (root, args = ['src', 'tests']) =>
  spawnSync(process.execPath, [TOOL, ...args], { cwd: root, encoding: 'utf8' });

// THE PREMISE, MEASURED. If dependency-cruiser ever made `--output-type json` exit non-zero
// on violations, `return cruise.status` would stop being a bug and every assertion below
// would stop discriminating while still passing. Asserted first, per this slice's rule.
const rawJson = spawnSync(
  DEPCRUISE,
  ['src', 'tests', '--config', '.dependency-cruiser.js', '--output-type', 'json'],
  { cwd: violatingRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);
check('premise — `depcruise --output-type json` exits 0 over a tree with a real violation',
  rawJson.status === 0 && /domain-is-pure/.test(rawJson.stdout ?? ''),
  `this is F3, and it is why the wrapper must derive its own status. got exit `
  + `${rawJson.status}, violation reported: ${/domain-is-pure/.test(rawJson.stdout ?? '')}`);

const onViolation = wrapper(violatingRoot);
check('the wrapper EXITS NON-ZERO on a real violation, though the JSON reporter exited 0',
  onViolation.status === 1,
  `pass the CLI's status through — \`return cruise.status\` — and this is 0: lint:arch goes `
  + `green on every layering violation, collect-ci records depcruise: "pass", and C4 reads a `
  + `clean architecture for a tree the ruleset rejected. got ${onViolation.status}\n`
  + `          stdout ${(onViolation.stdout ?? '').trim()}\n`
  + `          stderr ${(onViolation.stderr ?? '').trim()}`);

check('…and it names the rule, so the 1 is the violation and not a broken fixture',
  /domain-is-pure/.test(onViolation.stdout ?? ''),
  `exit 1 is also what a missing binary, an environment issue or an uncovered root produces. `
  + `Without this the case would pass on a fixture that never cruised anything. got `
  + JSON.stringify((onViolation.stdout ?? '').trim()));

const onConforming = wrapper(conformingRoot);
check('the wrapper exits 0 on a conforming tree, so it is not simply always non-zero',
  onConforming.status === 0 && /no layering violations/.test(onConforming.stdout ?? ''),
  `a wrapper hardwired to fail would satisfy the case above; this is what makes the pair `
  + `evidence. got ${onConforming.status} ${JSON.stringify((onConforming.stdout ?? '').trim())}`);

check('no roots given → exit 2, distinct from a violation',
  wrapper(conformingRoot, []).status === 2,
  'a usage error and a rejected architecture must not be the same status: CI would report '
  + 'a mistyped script as a layering failure, and the reviewer would look in the wrong file');

// ── the compiler diagnosis must not report a compiler that is there ────────────────────
//
// `describeCompilerEnvironment()` prints on every non-ok verdict, so it reaches a developer
// exactly when they have a real layering violation. At 902abb8 it printed
//
//   (no `typescript` is resolvable from this installation at all.)
//
// with typescript 6.0.3 installed and working — three version reads shared one `try`, and
// `dependency-cruiser`'s exports map publishes only "." under an `import` condition, so
// `require('dependency-cruiser/package.json')` threw and the catch asserted that TYPESCRIPT
// was missing. A developer who broke a layering rule was sent to reinstall their toolchain.
//
// THE ORACLES ARE READ OFF THE FILESYSTEM, not through a resolver. The tool locates packages
// with `import.meta.resolve` and a manifest walk; `require` is the other resolver and shares
// the exports-map behaviour that caused the bug. A path is neither, so a resolution failure
// cannot make the expectation wrong in the same direction as the answer. (The implementer
// suggested this too, for a different reason — that `require('typescript/package.json')`
// would weaken the case. Measured: it returns 6.0.3, the same string, so it would not. The
// reason to avoid it is independence, not the value.)
const installedTypescript = JSON.parse(
  readFileSync(resolve('node_modules/typescript/package.json'), 'utf8')).version;
const installedCruiser = JSON.parse(
  readFileSync(resolve('node_modules/dependency-cruiser/package.json'), 'utf8')).version;
// An ABSOLUTE path bypasses the exports map — which is the whole reason the tool cannot
// reach this file by package specifier, and why it walks to the directory first.
const supportedRange = createRequire(import.meta.url)(
  resolve('node_modules/dependency-cruiser/src/meta.cjs')).supportedTranspilers?.typescript;

check('oracle precondition — typescript, dependency-cruiser and the range are all readable',
  Boolean(installedTypescript) && Boolean(installedCruiser) && Boolean(supportedRange),
  `read straight off node_modules/, so a failure here is a broken checkout rather than a `
  + `broken tool. got ${JSON.stringify({ installedTypescript, installedCruiser, supportedRange })}`);

const diagnosis = typeof tool?.describeCompilerEnvironment === 'function'
  ? tool.describeCompilerEnvironment()
  : '';

check('exports describeCompilerEnvironment() so the diagnosis is testable without a cruise',
  typeof tool?.describeCompilerEnvironment === 'function',
  'it prints on every non-ok verdict; a string assembled inside main() could only be '
  + 'checked by scraping stdout');

check('the diagnosis NAMES the installed typescript rather than claiming there is none',
  diagnosis.includes(installedTypescript)
    && !/no `?typescript`? is resolvable/.test(diagnosis),
  `this is the 902abb8 line, and it fired precisely when a developer had a working `
  + `toolchain and a real violation. got ${JSON.stringify(diagnosis)}`);

// THE HALF THE SUGGESTED ASSERTION LEFT OPEN, and it is the half the bug came from.
// Collapsing the reads back under one `try` is caught by the line above — when the
// dependency-cruiser read throws, the typescript version is discarded with it, which IS the
// bug. But a read that fails only for dependency-cruiser degrades to a SHORTER TRUE line,
// "(typescript 6.0.3 is installed.)", and nothing above notices. Measured on two mutants:
// losing the manifest walk drops both dependency-cruiser facts; stubbing the range read
// drops one. Both leave a line that is honest and useless.
check('…and the dependency-cruiser version, so a partial read cannot pass as a whole one',
  diagnosis.includes(installedCruiser),
  `a reader that resolved only typescript prints "(typescript ${installedTypescript} is `
  + `installed.)" — true, shorter, and it passes every assertion above. got `
  + JSON.stringify(diagnosis));

check('…and the SUPPORTED RANGE, which is the only fact that tells the two failures apart',
  diagnosis.includes(supportedRange),
  `dependency-cruiser reports an ABSENT compiler and an OUT-OF-RANGE one identically, so `
  + `the range is what says which one this is — the line claims as much in its own text. `
  + `Lose it and the diagnosis stays true and stops answering the question. got `
  + JSON.stringify(diagnosis));

check('the diagnosis reaches the developer on a real violation, not only in this test',
  (onViolation.stdout ?? '').includes(installedTypescript)
    && (onViolation.stdout ?? '').includes(supportedRange),
  `main() prints it only when the verdict is not ok; that is the moment it exists for. `
  + `got ${JSON.stringify((onViolation.stdout ?? '').trim())}`);

for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
