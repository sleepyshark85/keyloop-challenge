import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';

/**
 * QS-10 — "the layering is the ruleset, and the ruleset runs."
 *
 * AC-3  `npm run lint:arch` exits 0 against the real module tree.
 * AC-4  a fixture tree containing one known violation of each of `domain-is-pure`,
 *       `sql-only-in-persistence`, `http-must-not-reach-persistence` and
 *       `outside-in-tests-do-not-import-src` has each violation reported BY NAME.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * IT RUNS THE REPOSITORY'S OWN `.dependency-cruiser.js`.
 *
 * Not a copy, not a derived config with rewritten anchors, not the API with an inline
 * ruleset. The artifact under test is the file CI runs; a test against a transformed copy
 * proves something about the copy. The config is passed BY PATH with the working directory
 * set to the fixture root, and the CLI is invoked the way `lint:arch` invokes it, with
 * `--output-type json` so the assertions read `summary.violations[].rule.name` rather than
 * scraping text.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * HERMETICITY HAS A DIRECTION, AND GETTING IT BACKWARDS IS THE WHOLE OF O1.
 *
 * The fixture isolates the rule TARGETS and resolves the ANALYSER. Isolating both produces
 * a tree that is not hermetic but inert. Measured at step 2 against a fixture built to the
 * step-1 design, and reproduced independently:
 *
 *   exit 0 · violations 0 · totalCruised 0 · modules 0 · stderr empty
 *   summary.environment.issues[0].name = "missing-typescript-transpiler"
 *
 * Four planted violations, none reported, exit 0, and under `--output-type json` no other
 * signal. So: STUB WHAT THE RULES POINT AT (`pg`, `kysely`), and make sure the ANALYSER is
 * the repository's own.
 *
 * The asymmetry is real; the mechanism first written for its second half was not. This file
 * used to symlink `node_modules/typescript` into the fixture root, on the stated grounds
 * that a temp fixture root defeats Node's upward resolution. The architect checked the
 * resolution in `dependency-cruiser@18.2.0` source at step 4: EVERY `typescript` resolution
 * site goes through `src/utl/try-import.mjs` or `src/extract/transpile/try-import-available
 * .mjs`, both using `createRequire(import.meta.url)` — from the PACKAGE's own location. The
 * working directory is never consulted, so `depcruise` spawned from
 * `<repo>/node_modules/.bin` finds `<repo>/node_modules/typescript` whatever `cwd` is, and
 * the symlink was six lines of machinery with a false explanation attached (§11.6).
 *
 * What IS load-bearing is one line down: `DEPCRUISE` is an ABSOLUTE PATH into this
 * repository's `node_modules/.bin`. Never a bare `depcruise` off PATH and never `npx`, which
 * would fetch a different dependency-cruiser from the network — resolving the compiler from
 * the analyser's location is only a guarantee once the analyser itself is pinned.
 *
 * If that reading of the resolution is wrong, this is not a silent failure: the guard below
 * fires and names `missing-typescript-transpiler`. The symlink then comes back, with a true
 * explanation.
 *
 * Every cruise below therefore runs `guardTheCruiseHappened` BEFORE reading any violation.
 */

const REPO_ROOT = process.cwd();
const CONFIG = resolve(REPO_ROOT, '.dependency-cruiser.js');
const DEPCRUISE = resolve(REPO_ROOT, 'node_modules/.bin/depcruise');

interface CruiseViolation {
  from: string;
  to: string;
  rule: { name: string; severity: string };
}

interface CruiseResult {
  modules: Array<{ source: string }>;
  summary: {
    error: number;
    warn: number;
    totalCruised: number;
    violations: CruiseViolation[];
    environment: { issues?: Array<{ name: string; description: string }> };
  };
}

const fixtures: string[] = [];
afterAll(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────── the fixture tree ──

function write(root: string, relativePath: string, contents: string): void {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

/** A stub package the rules can point at, with a .d.ts that really declares its type. */
function stubPackage(root: string, name: string, declaration: string): void {
  write(
    root,
    `node_modules/${name}/package.json`,
    `${JSON.stringify({ name, version: '0.0.0-fixture', main: 'index.js', types: 'index.d.ts' }, null, 2)}\n`,
  );
  write(root, `node_modules/${name}/index.js`, 'module.exports = {};\n');
  write(root, `node_modules/${name}/index.d.ts`, declaration);
}

function newFixture(label: string): string {
  const root = mkdtempSync(join(tmpdir(), `keyloop-${label}-`));
  fixtures.push(root);

  // The repository's own compilerOptions, read with TypeScript's own parser so a comment in
  // tsconfig.json cannot make the mirror silently diverge. `tsPreCompilationDeps` is
  // meaningless without a real TypeScript configuration resolvable from the working
  // directory, and `tsConfig.fileName` in .dependency-cruiser.js is a bare filename.
  const parsed = ts.readConfigFile(resolve(REPO_ROOT, 'tsconfig.json'), ts.sys.readFile);
  expect(parsed.error, 'the repository tsconfig.json did not parse').toBeUndefined();
  const compilerOptions = (parsed.config as { compilerOptions?: unknown }).compilerOptions;
  write(
    root,
    'tsconfig.json',
    `${JSON.stringify({ compilerOptions, include: ['src', 'tests'] }, null, 2)}\n`,
  );

  // `pg` and `kysely` are DEPENDENCIES here, not devDependencies: otherwise
  // `no-dev-dep-in-src` fires alongside the rule under test and muddies the evidence.
  write(
    root,
    'package.json',
    `${JSON.stringify(
      {
        name: 'keyloop-layering-fixture',
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies: { kysely: '0.0.0-fixture', pg: '0.0.0-fixture' },
      },
      null,
      2,
    )}\n`,
  );

  // THE ASYMMETRY IS THE POINT, and only this half of it needs building. `pg` and `kysely`
  // are resolved by enhanced-resolve FROM THE WORKING DIRECTORY, so a stub here is what
  // makes the reported path `node_modules/kysely` and the rule anchor match; resolve them
  // upward to the repository instead and the path is `../node_modules/kysely`, the anchor
  // misses, and `sql-only-in-persistence` silently does not fire.
  //
  // The compiler needs nothing: dependency-cruiser resolves it from its own package
  // location, not from cwd (see the header). No symlink.
  stubPackage(root, 'kysely', 'export declare class Kysely<DB> { readonly __db?: DB }\n');
  stubPackage(root, 'pg', 'export declare class Pool { connect(): Promise<void> }\n');

  return root;
}

/**
 * One violation per file, so every assertion names one rule unambiguously. Import
 * specifiers are written the way src/ writes them (explicit `.js`) so resolution behaves
 * identically and `not-to-unresolvable` cannot fire in place of the rule under test.
 */
const VIOLATING_SOURCES: Record<string, string> = {
  // legal, and the targets the violations point at
  'src/domain/thing.ts': 'export interface Thing { readonly id: string }\n',
  'src/platform/config.ts': 'export const config = { port: 3000 };\n',
  'src/persistence/db.ts':
    "import type { Kysely } from 'kysely';\nexport type Db = Kysely<Record<string, never>>;\n",

  // domain-is-pure: the core may import NOTHING.
  'src/domain/bad.ts':
    "import { config } from '../platform/config.js';\nexport const port = config.port;\n",

  // domain-is-pure, THE INTRA-DOMAIN FORM — R-01-3, and the reason it is a separate file.
  //
  // AC-6's second clause reads "the domain-is-pure rule holds with NO ALLOWLIST", and the
  // human ruled at slice 01's gate that `to: { pathNot: '^src/domain/' }` IS one: a standing
  // exemption for exactly the class of import the literal AC-6 ruling had just forbidden. The
  // case above cannot see that. It plants its violation OUTSIDE the domain
  // (src/domain/bad.ts -> src/platform/config.ts), which the carve-out never covered, so it
  // passed identically before and after the carve-out was removed. The rule's most important
  // claim — a domain module may not import a SIBLING — had never been exercised by anything.
  //
  // THE MUTANT, measured three times independently (test-engineer, architect out of tree,
  // orchestrator), and the third row is this case's whole justification:
  //
  //   to: {}                          clean tree      -> no violations, 54 modules cruised
  //   to: {}                          this fixture    -> domain-is-pure: interval.ts -> duration.ts
  //   to: { pathNot: '^src/domain/' } this fixture    -> CLEAN, at 91 dependencies (up from 90)
  //
  // The dependency count in the third row is the detail worth keeping: the cruise demonstrably
  // SAW the edge and the old rule chose not to object. A green from a rule that never looked
  // and a green from a rule that looked and shrugged are indistinguishable from the outside,
  // which is why the control has to name the rule rather than count violations.
  //
  // Named after the real pair on purpose. `interval.ts` importing `durationMillis` from
  // `duration.ts` is the concrete regression this guards — it is the import a future
  // implementer would reach for first, and under the old `to` it would have merged green.
  'src/domain/duration.ts':
    'export const durationMillis = (minutes: number): number => minutes * 60_000;\n',
  'src/domain/interval.ts':
    "import { durationMillis } from './duration.js';\n" +
    'export const endsAt = (startsAt: number, minutes: number): number =>\n' +
    '  startsAt + durationMillis(minutes);\n',

  // sql-only-in-persistence: TYPE-ONLY on purpose. Without `tsPreCompilationDeps: true`
  // this import is erased before dependency-cruiser sees it and the rule stops catching the
  // most likely way infrastructure enters a layer that forbids it. A value import would
  // pass this test while leaving that regression undetected.
  'src/application/bad.ts':
    "import type { Kysely } from 'kysely';\nexport type Handle = Kysely<Record<string, never>>;\n",

  // http-must-not-reach-persistence: a route that can name the database handle.
  'src/http/bad.ts':
    "import type { Db } from '../persistence/db.js';\nexport type RouteDeps = { db: Db };\n",

  // outside-in-tests-do-not-import-src: independence spent through an import.
  //
  // ONE FILE PER ALTERNATIVE IN THE RULE'S `from.path`, and the reason is R-1. The rule was
  // widened at step 2 to eight directories; this fixture planted a violation under
  // `tests/acceptance/` alone, so it exercised one alternative in eight. The reviewer
  // measured the hole: cut the alternation back to `(acceptance|concurrency|contract|
  // property)` in the real config and `npm run lint:arch` exits 0 over 40 modules while the
  // whole suite passes. A rule that works today, in the file CLAUDE.md §2.3 makes the
  // architecture's source of truth, with nothing behind it.
  //
  // A subset was considered and rejected. An alternation is a LIST of independent claims —
  // there is no shared mechanism that makes covering one imply another, and any branch can
  // be lost to a one-character edit — so "covering the interesting ones" would leave the
  // rest exactly as unprotected as they were before this comment was written. Eight files
  // and eight table rows cost nothing against a fixture that is already built.
  //
  // `setup/` and `support/` are named the way slice 00 will name them, because they are the
  // concrete case: a globalSetup that types its seeding helpers against
  // src/persistence/schema.ts, hands them to an acceptance test through `provide()`, and
  // spends inside a file the test-engineer legitimately owns the independence C2 measures.
  'tests/acceptance/bad.test.ts':
    "import type { Thing } from '../../src/domain/thing.js';\nexport const thing: Thing = { id: 'x' };\n",
  'tests/architecture/bad.test.ts':
    "import type { Thing } from '../../src/domain/thing.js';\nexport const thing: Thing = { id: 'x' };\n",
  'tests/concurrency/bad.test.ts':
    "import type { Thing } from '../../src/domain/thing.js';\nexport const thing: Thing = { id: 'x' };\n",
  'tests/contract/bad.test.ts':
    "import type { Thing } from '../../src/domain/thing.js';\nexport const thing: Thing = { id: 'x' };\n",
  'tests/performance/bad.test.ts':
    "import type { Thing } from '../../src/domain/thing.js';\nexport const thing: Thing = { id: 'x' };\n",
  'tests/property/bad.test.ts':
    "import type { Thing } from '../../src/domain/thing.js';\nexport const thing: Thing = { id: 'x' };\n",
  // Not `.test.ts`: a globalSetup and a spawn helper are not test files, and the rule
  // anchors on the DIRECTORY. A fixture that only ever planted `*.test.ts` would pass over
  // a rule narrowed to test files.
  'tests/setup/postgres.ts':
    "import type { Thing } from '../../src/domain/thing.js';\nexport const seeded: Thing = { id: 'x' };\n",
  'tests/support/service.ts':
    "import type { Thing } from '../../src/domain/thing.js';\nexport const spawned: Thing = { id: 'x' };\n",

  // AND THE TWO THAT ARE DELIBERATELY OUT. `tests/unit/` and `tests/integration/` import
  // src/ legitimately — the implementer owns the first and the second asserts database
  // invariants against the real schema. Widen the rule to a bare `^tests/` and all eight
  // cases above still pass while slice 00's integration tests become unwritable. The
  // positive cases cannot see that; these two are what make the alternation a boundary
  // rather than a floor.
  'tests/unit/legitimate.test.ts':
    "import type { Thing } from '../../src/domain/thing.js';\nexport const unit: Thing = { id: 'x' };\n",
  'tests/integration/legitimate.test.ts':
    "import type { Thing } from '../../src/domain/thing.js';\nexport const integration: Thing = { id: 'x' };\n",
};

/** The eight directories `outside-in-tests-do-not-import-src` covers, one file each. */
const OUTSIDE_IN_VIOLATIONS: ReadonlyArray<[string, string]> = [
  ['acceptance', 'tests/acceptance/bad.test.ts'],
  ['architecture', 'tests/architecture/bad.test.ts'],
  ['concurrency', 'tests/concurrency/bad.test.ts'],
  ['contract', 'tests/contract/bad.test.ts'],
  ['performance', 'tests/performance/bad.test.ts'],
  ['property', 'tests/property/bad.test.ts'],
  ['setup', 'tests/setup/postgres.ts'],
  ['support', 'tests/support/service.ts'],
];

/** The two the rule must NOT reach, however it is edited. */
const OUTSIDE_IN_EXEMPT: ReadonlyArray<[string, string]> = [
  ['unit', 'tests/unit/legitimate.test.ts'],
  ['integration', 'tests/integration/legitimate.test.ts'],
];

/** Shaped like arc42 §5.2, with only legal edges. The negative control. */
const CONFORMING_SOURCES: Record<string, string> = {
  'src/domain/policy.ts': 'export const allowed = (minutes: number): boolean => minutes > 0;\n',
  'src/platform/config.ts': 'export const config = { port: 3000 };\n',
  'src/persistence/repo.ts':
    "import type { Kysely } from 'kysely';\n" +
    "import type { Pool } from 'pg';\n" +
    "import { config } from '../platform/config.js';\n" +
    "import { allowed } from '../domain/policy.js';\n" +
    'export type Db = Kysely<Record<string, never>>;\n' +
    'export type P = Pool;\n' +
    'export const port = config.port;\n' +
    'export const ok = allowed(1);\n',
  'src/application/useCase.ts':
    "import type { Db } from '../persistence/repo.js';\n" +
    "import { allowed } from '../domain/policy.js';\n" +
    'export const run = (_db: Db): boolean => allowed(30);\n',
  'src/http/route.ts':
    "import { run } from '../application/useCase.js';\nexport const handler = run;\n",
  'src/main.ts':
    "import { handler } from './http/route.js';\n" +
    "import { config } from './platform/config.js';\n" +
    'export const start = (): unknown => ({ handler, port: config.port });\n',
  'tests/acceptance/probe.test.ts':
    "import assert from 'node:assert';\nexport const check = (): void => assert.ok(true);\n",
};

function plant(root: string, sources: Record<string, string>): string[] {
  for (const [path, contents] of Object.entries(sources)) write(root, path, contents);
  return Object.keys(sources);
}

// ──────────────────────────────────────────────────────────────────────── the cruise ──

function cruise(root: string): { result: CruiseResult; status: number | null; stderr: string } {
  const run = spawnSync(
    DEPCRUISE,
    ['src', 'tests', '--config', CONFIG, '--output-type', 'json'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  let result: CruiseResult;
  try {
    result = JSON.parse(run.stdout) as CruiseResult;
  } catch {
    throw new Error(
      `depcruise produced no parseable JSON.\n  cwd ${root}\n  status ${String(run.status)}\n` +
        `  stdout ${run.stdout?.slice(0, 2000)}\n  stderr ${run.stderr?.slice(0, 2000)}`,
    );
  }
  return { result, status: run.status, stderr: run.stderr ?? '' };
}

/**
 * The same cruise under the reporter `lint:arch` actually uses.
 *
 * MEASURED, and it is not what one would assume: `--output-type json` EXITS 0 even when
 * error-severity violations were reported — only the default `err` reporter turns them into
 * a non-zero status. So the exit code that makes "conformance is a build failure, not a
 * reviewer's opinion" (.dependency-cruiser.js header, CLAUDE.md §2.3) true has to be
 * observed under the default reporter, and `tools/ci/lint-arch.mjs` must derive its own exit
 * code from the JSON rather than pass the CLI's through — which is what §5 specifies, and
 * now for a measured reason rather than an assumed one.
 */
function cruiseExitCode(root: string): number | null {
  return spawnSync(DEPCRUISE, ['src', 'tests', '--config', CONFIG], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).status;
}

/**
 * QS-10 item 5: the ruleset is proved to have RUN, not merely to have exited 0.
 *
 * Both conditions run before any violation is read, in the positive fixture and in the
 * negative control alike. Naming every planted file is deliberately stronger than
 * `totalCruised > 0`: the file list is fixed and known, so naming it costs nothing and
 * closes the hole a bare count leaves — a run that cruised one stub package and skipped
 * every source satisfies `> 0`. It matters most in the negative control, where zero
 * violations is the EXPECTED answer and a tree that was never cruised is indistinguishable
 * from a tree that conforms.
 */
function guardTheCruiseHappened(result: CruiseResult, plantedFiles: string[]): void {
  const issues = result.summary.environment.issues ?? [];
  expect(
    issues.map((issue) => `${issue.name}: ${issue.description}`),
    'the cruise reported environment issues, so it may have analysed nothing',
  ).toEqual([]);

  const cruised = new Set(result.modules.map((module) => module.source));
  const missing = plantedFiles.filter((file) => !cruised.has(file));
  expect(missing, 'planted source files that the cruise never looked at').toEqual([]);
}

// ─────────────────────────────────────────────────────────────────────── the cases ──

describe('AC-4 — every layering rule fires by name against an injected violation', () => {
  // Built in a hook rather than in the describe body: a fixture that failed to build at
  // collection time would take the AC-3 case in this file down with it, and AC-3's red at
  // step 3 has to be an assertion failure rather than a load error.
  let result: CruiseResult;
  let exitCode: number | null;
  let planted: string[];

  beforeAll(() => {
    const root = newFixture('violating');
    planted = plant(root, VIOLATING_SOURCES);
    ({ result } = cruise(root));
    exitCode = cruiseExitCode(root);
  });

  it('cruised the fixture: no environment issues, and every planted file was analysed', () => {
    guardTheCruiseHappened(result, planted);
  });

  it.each([
    ['domain-is-pure', 'src/domain/bad.ts', 'src/platform/config.ts'],
    // R-01-3: the intra-domain form. Restore `to: { pathNot: '^src/domain/' }` in
    // .dependency-cruiser.js and this row alone fails while every other case stays green.
    ['domain-is-pure', 'src/domain/interval.ts', 'src/domain/duration.ts'],
    ['sql-only-in-persistence', 'src/application/bad.ts', 'node_modules/kysely'],
    ['http-must-not-reach-persistence', 'src/http/bad.ts', 'src/persistence/db.ts'],
    ...OUTSIDE_IN_VIOLATIONS.map(
      ([, from]) =>
        ['outside-in-tests-do-not-import-src', from, 'src/domain/thing.ts'] as [
          string,
          string,
          string,
        ],
    ),
  ])('reports %s by name, at error severity, on %s', (rule, from, to) => {
    guardTheCruiseHappened(result, planted);

    const matching = result.summary.violations.filter(
      (violation) => violation.rule.name === rule && violation.from === from,
    );

    expect(
      matching.map((violation) => `${violation.rule.name} ${violation.from} -> ${violation.to}`),
      `expected ${rule} to fire on ${from}; all violations reported were ` +
        JSON.stringify(
          result.summary.violations.map((v) => `${v.rule.name} ${v.from} -> ${v.to}`),
          null,
          2,
        ),
    ).toHaveLength(1);
    expect(matching[0]?.rule.severity).toBe('error');
    expect(matching[0]?.to).toContain(to);
  });

  /**
   * R-1's other half, and the positive cases cannot see it.
   *
   * Every case above is satisfied by a rule widened to a bare `^tests/`, which would fire on
   * the two directories that import src/ LEGITIMATELY: `tests/unit/` is the implementer's
   * design tool and `tests/integration/` asserts database invariants against the real
   * schema. That mutation makes slice 00 unwritable, and eight green positives would say
   * nothing about it. The alternation is a boundary, so it is asserted from both sides.
   */
  it.each(OUTSIDE_IN_EXEMPT)(
    'does NOT fire on tests/%s/, which imports src/ legitimately',
    (_directory, from) => {
      guardTheCruiseHappened(result, planted);

      const matching = result.summary.violations.filter(
        (violation) =>
          violation.rule.name === 'outside-in-tests-do-not-import-src' && violation.from === from,
      );

      expect(
        matching.map((violation) => `${violation.rule.name} ${violation.from} -> ${violation.to}`),
        `${from} imports src/ and must be allowed to. Widen the rule to ^tests/ and every ` +
          'positive case still passes while the implementer and slice 00 lose the two ' +
          'directories they need.',
      ).toEqual([]);
    },
  );

  it('reports exactly one violation per planted violating file, and none besides', () => {
    guardTheCruiseHappened(result, planted);

    // Derived from the fixture rather than counted by hand: add a violating file and forget
    // its assertion and this fails, which a `>= n` cannot do. It is also the assertion that
    // catches a rule firing on a file nobody planted a violation in.
    const expected = [
      'src/domain/bad.ts',
      'src/domain/interval.ts',
      'src/application/bad.ts',
      'src/http/bad.ts',
      ...OUTSIDE_IN_VIOLATIONS.map(([, from]) => from),
    ].sort();

    const actual = [
      ...new Set(
        result.summary.violations
          .filter((violation) => violation.rule.severity === 'error')
          .map((violation) => violation.from),
      ),
    ].sort();

    expect(actual, 'error-severity violations, by the file they were reported on').toEqual(
      expected,
    );
    expect(result.summary.error).toBeGreaterThanOrEqual(expected.length);
  });

  it('exits non-zero under the reporter lint:arch uses, so a violation fails the build', () => {
    expect(exitCode).not.toBe(0);
  });
});

describe('AC-4 — the negative control: a conforming tree produces no violation', () => {
  let result: CruiseResult;
  let exitCode: number | null;
  let planted: string[];

  beforeAll(() => {
    const root = newFixture('conforming');
    planted = plant(root, CONFORMING_SOURCES);
    ({ result } = cruise(root));
    exitCode = cruiseExitCode(root);
  });

  it('cruised the fixture: no environment issues, and every planted file was analysed', () => {
    guardTheCruiseHappened(result, planted);
  });

  it('reports zero error-severity violations', () => {
    guardTheCruiseHappened(result, planted);

    const errors = result.summary.violations.filter(
      (violation) => violation.rule.severity === 'error',
    );

    expect(
      errors.map((violation) => `${violation.rule.name} ${violation.from} -> ${violation.to}`),
      'a ruleset that rejects everything would pass the four positive cases; this is what ' +
        'makes them evidence of discrimination rather than of indiscriminate rejection',
    ).toEqual([]);
    expect(result.summary.error).toBe(0);
    expect(exitCode).toBe(0);
  });
});

describe('AC-3 — `npm run lint:arch` exits 0 against the real module tree', () => {
  it('exits 0', () => {
    // A subprocess exit code, observed from outside. Nothing here reads src/ — which is
    // both why the test-engineer may write it and why it is honest evidence for AC-3: AC-3
    // is by definition a claim about the real tree, so it is the one case in this file that
    // may not use a fixture.
    const run = spawnSync('npm', ['run', 'lint:arch'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });

    expect(
      run.status,
      `npm run lint:arch exited ${String(run.status)}\n` +
        `  stdout\n${run.stdout}\n  stderr\n${run.stderr}`,
    ).toBe(0);
  });

  /**
   * QS-10 item 5 names `lint:arch` ITSELF, not only the two fixtures: every cruise this
   * slice depends on must prove it RAN before its verdict is believed. Exit 0 alone does
   * not, and here that is not a hypothesis — it is measured, twice:
   *
   *   - a cruise that cannot resolve a compatible `typescript` reports zero violations over
   *     zero modules and exits 0 (O1);
   *   - and `lint:arch` cruises `src tests`, so `tests/` alone keeps the module count
   *     non-zero. At this commit `src/` holds no TypeScript at all — the harness's
   *     `mkdirSync` created `src/persistence/migrations/` before any test ran — and
   *     `depcruise src tests` still exits 0 over 18 modules, none of them under `src/`.
   *
   * So "exits 0" is satisfied by a tree in which the layering was never examined. The check
   * that makes AC-3 mean what it says is the one below, and it is also what keeps this case
   * genuinely red at step 3 rather than accidentally green.
   */
  it('cruised the real src/ tree — exit 0 over an unexamined src/ is not evidence', () => {
    const run = spawnSync(
      DEPCRUISE,
      ['src', 'tests', '--config', CONFIG, '--output-type', 'json'],
      { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );

    // Asserted rather than thrown: whether `src/` exists at all when this runs depends on
    // whether the `db` project's globalSetup has already created the migrations directory,
    // and a criterion must not fail two different ways depending on project ordering.
    let result: CruiseResult | undefined;
    try {
      result = JSON.parse(run.stdout) as CruiseResult;
    } catch {
      result = undefined;
    }
    expect(
      result,
      `depcruise src tests produced no parseable JSON.\n  status ${String(run.status)}\n` +
        `  stdout ${run.stdout?.slice(0, 2000)}\n  stderr ${run.stderr?.slice(0, 2000)}`,
    ).toBeDefined();
    if (result === undefined) return;

    const issues = result.summary.environment.issues ?? [];
    expect(
      issues.map((issue) => `${issue.name}: ${issue.description}`),
      'the cruise reported environment issues, so `lint:arch` may have analysed nothing',
    ).toEqual([]);

    const underSrc = result.modules
      .map((module) => module.source)
      .filter((source) => source.startsWith('src/'));
    expect(
      underSrc.length,
      'depcruise src tests reported no module under src/. `lint:arch` exits 0 on that, ' +
        'collect-ci records depcruise: "pass", and criterion C4 reads a clean architecture ' +
        'for a tree the ruleset never looked at.',
    ).toBeGreaterThan(0);
  });
});
