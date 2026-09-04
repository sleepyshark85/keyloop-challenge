#!/usr/bin/env node
/**
 * `npm run lint:arch` — QS-10's gate, with the guard O1 put around it.
 *
 *   node tools/ci/lint-arch.mjs <root> [<root>…]
 *
 * ── Why this is not just `depcruise src tests` ──────────────────────────────────────────
 *
 * That command EXITS 0 HAVING CRUISED NOTHING when dependency-cruiser detects a TypeScript
 * environment and cannot resolve a compatible compiler. Measured at slice 00a step 2 on a
 * fixture built to the step-1 design:
 *
 *   exit 0 · violations 0 · totalCruised 0 · modules 0 · stderr empty
 *   summary.environment.issues[0].name = "missing-typescript-transpiler"
 *
 * It is not hypothetical. `dependency-cruiser@18.2.0` declares its supported range in
 * `src/meta.cjs` as `typescript: ">=2.0.0 <7.0.0"`, and it is NOT a peerDependency, so
 * nothing warns at install time — while `npm i -D typescript` today resolves 7.x. Left
 * unguarded, `collect-ci.mjs` records `checks.depcruise: "pass"` and criterion C4 reports a
 * clean architecture for twelve slices in which the ruleset never ran. QS-10 would switch
 * itself off in silence.
 *
 * So the guard lives inside whatever produces that "pass" — this script — and not only
 * inside tests/architecture/layering.test.ts, which does not gate the `verify` job.
 *
 * ── The rule this slice kept rediscovering (design §5) ──────────────────────────────────
 *
 *   A cruise that exits 0 says nothing about what it examined. Every assertion about
 *   violations must be preceded by an assertion about COVERAGE — which files were cruised,
 *   not how many.
 *
 * Found three times in one slice: O1 (an unresolvable compiler), F1 (AC-3's red coming from
 * an empty `src/` rather than an absent one), and F2 — the first version of THIS guard,
 * which counted modules overall, so `tests/` alone kept the count non-zero while `src/`
 * went unexamined behind a green gate. Hence per-root, naming the root.
 *
 * ── Two constraints on the per-root check, both of which are ways to get it wrong ───────
 *
 * 1. THE ROOTS COME FROM ARGV, never from a hardcoded ['src', 'tests']. If `lint:arch` ever
 *    gains a third root, a hardcoded pair silently stops covering it — the same bug a
 *    fourth time, inside the guard against it.
 * 2. IT STAYS ONE CRUISE. Cruising each root separately would DISABLE
 *    `outside-in-tests-do-not-import-src`, which only fires when `src` and `tests` share a
 *    graph. The assertion is per-root; the cruise is not. A remedy that strengthens a guard
 *    while turning off a rule is worse than the hole it closes.
 *
 * Exit 0 clean · 1 the ruleset rejected something, or could not have examined it · 2 the
 * cruise could not be run at all.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CONFIG = '.dependency-cruiser.js';

/**
 * The pure rule, so it is testable without running a cruise.
 *
 * `cruiseResult` is dependency-cruiser's `--output-type json` payload, `{ modules, summary }`.
 * A bare summary is accepted too: the violation and environment rules read only the summary,
 * and the unit test exercises them with hand-built summaries. Coverage needs `modules`,
 * because `summary` carries a total and no file list — and "which files were cruised, not
 * how many" is the whole of the rule above.
 *
 * @param {object} cruiseResult
 * @param {string[]} roots  the paths the cruise was asked to examine, from argv
 * @returns {{ ok: boolean, reason: string }}
 */
export function judgeCruiseResult(cruiseResult, roots = []) {
  const summary = cruiseResult?.summary ?? cruiseResult ?? {};
  const modules = cruiseResult?.modules ?? [];
  const issues = summary.environment?.issues ?? [];

  // FIRST, always. Zero violations over zero modules is the exact signature of a cruise
  // that could not run, and it is indistinguishable from a clean tree by any later check —
  // so the reason has to name the environment rather than the empty result.
  if (issues.length > 0) {
    return {
      ok: false,
      reason:
        'the cruise reported environment issues, so it may have analysed nothing:\n' +
        issues.map((issue) => `  ${issue.name}: ${issue.description}`).join('\n'),
    };
  }

  if ((summary.totalCruised ?? 0) === 0) {
    return {
      ok: false,
      reason:
        'the cruise examined no modules at all. An empty graph and a clean graph are ' +
        'reported identically, so this is a failure rather than a pass',
    };
  }

  // Per ROOT (F2), and only over roots the caller actually asked for.
  //
  // A caller that asks for coverage but hands over a payload with no `modules[]` gets its
  // OWN verdict, not "examined no module under src/". The two are different failures and
  // point at different places: the first is a bug in the call, the second a fact about the
  // tree. Reporting the second for the first sends someone to look at a source directory
  // that is fine.
  if (roots.length > 0 && !Array.isArray(cruiseResult?.modules)) {
    return {
      ok: false,
      reason:
        'coverage could not be checked: the cruise result carried no `modules[]`, so which ' +
        `files were examined is unknown. Roots asked about: ${roots.join(', ')}. A summary ` +
        'alone is a complete input for the environment and violation rules, but not for ' +
        'this one',
    };
  }

  for (const root of roots) {
    const prefix = root.endsWith('/') ? root : `${root}/`;
    const covered = modules.some(
      (module) => module.source === root || module.source?.startsWith(prefix),
    );
    if (!covered) {
      return {
        ok: false,
        reason:
          `the cruise examined no module under ${JSON.stringify(root)}. The other roots keep ` +
          'the overall count non-zero, so this exits 0 as a clean architecture for a tree ' +
          'the ruleset never looked at — which is what criterion C4 would then record',
      };
    }
  }

  const errors = (summary.violations ?? []).filter(
    (violation) => violation.rule?.severity === 'error',
  );
  if (errors.length > 0) {
    return {
      ok: false,
      reason:
        `${errors.length} layering violation(s):\n` +
        errors
          .map((violation) => `  ${violation.rule.name}: ${violation.from} → ${violation.to}`)
          .join('\n'),
    };
  }

  return {
    ok: true,
    reason:
      `no layering violations. ${summary.totalCruised} module(s) cruised` +
      (roots.length > 0 ? `, every root covered: ${roots.join(', ')}` : ''),
  };
}

function main(argv) {
  const roots = argv.filter((argument) => !argument.startsWith('-'));
  if (roots.length === 0) {
    console.error('lint-arch: no roots given.  usage: lint-arch.mjs <root> [<root>…]');
    return 2;
  }

  // The same CLI with the same arguments the bare script used, plus the JSON reporter — so
  // the artifact under test is still the file CI runs.
  //
  // THE LOCAL BINARY, AND ONLY THE LOCAL BINARY. Not `npx`, which will fetch a different
  // dependency-cruiser from the network; and not a PATH fallback either, which was the
  // first version of this and was the same mistake with the network removed: a globally
  // installed depcruise brings its own node_modules and therefore its own `typescript`
  // resolution — dependency-cruiser resolves the compiler with
  // `createRequire(import.meta.url)`, from ITS OWN location, never from the cwd — so it
  // could cruise this repository under a compiler nobody here pinned, or under none, which
  // is the exact silence this whole file exists to break. A guard against the wrong
  // analyser running must not be able to run the wrong analyser.
  const local = resolve('node_modules/.bin/depcruise');
  if (!existsSync(local)) {
    console.error(
      `lint-arch: ${local} is missing. Run \`npm ci\`.\n` +
        '  Refusing to fall back to a depcruise on PATH: a different installation resolves ' +
        'a different TypeScript compiler, and a cruise under an unknown analyser cannot ' +
        'stand in for this one.',
    );
    return 2;
  }

  const cruise = spawnSync(
    local,
    [...roots, '--config', CONFIG, '--output-type', 'json'],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  );

  if (cruise.error) {
    console.error(`lint-arch: could not run depcruise — ${cruise.error.message}`);
    return 2;
  }

  let result;
  try {
    result = JSON.parse(cruise.stdout);
  } catch {
    // NOTE: `--output-type json` exits 0 even with error-severity violations, so the exit
    // code is deliberately NOT passed through; it is only consulted here, where no parseable
    // result came back at all.
    console.error(
      `lint-arch: depcruise produced no parseable JSON (exit ${cruise.status}).\n` +
        `${(cruise.stderr ?? '').trim()}`,
    );
    return 2;
  }

  const verdict = judgeCruiseResult(result, roots);
  console.log(verdict.reason);
  if (!verdict.ok) console.log(describeCompilerEnvironment());
  return verdict.ok ? 0 : 1;
}

/**
 * The one thing the cruise output cannot tell you, and it was worth measuring rather than
 * assuming: an ABSENT typescript and an OUT-OF-RANGE typescript are reported IDENTICALLY.
 * Both give exit 0, `totalCruised: 0`, `available: false`, `currentVersion: "-"`, and one
 * `missing-typescript-transpiler` issue whose description interpolates the SUPPORTED RANGE
 * rather than the version found — because `typescript-wrap.mjs` short-circuits on the range
 * check and never loads the compiler, so its version is never read. Measured on
 * dependency-cruiser@18.2.0 by stashing and then stubbing `node_modules/typescript`.
 *
 * So a maintainer who bumps typescript past the range is told a compatible compiler is
 * missing and NOT told which one they installed. This says it, from the only place it can
 * be read.
 *
 * ── Two things the first version of this got wrong ──────────────────────────────────────
 *
 * It read `<package>/package.json` through `require`. That works for typescript and throws
 * ERR_PACKAGE_PATH_NOT_EXPORTED for dependency-cruiser, whose `exports` map publishes
 * neither `./package.json` nor `./src/meta.cjs`. And all three reads shared ONE try/catch,
 * so the dependency-cruiser failure claimed the typescript one had failed too: on a working
 * toolchain with a real layering violation it printed "no typescript is resolvable from
 * this installation at all" — sending a developer to reinstall instead of to the rule they
 * broke. A diagnosis nobody had run, in the file this slice added to stop exactly that.
 *
 * So: resolve each package's ENTRY POINT and walk up to the directory holding its manifest
 * — `import.meta.resolve` honours the `import` condition, and a path on disk is not subject
 * to an `exports` map — and give every fact its own failure, so one unreadable version can
 * never assert anything about another.
 *
 * Exported so it can be pinned: the correct assertion is that in an installation where
 * `node_modules/typescript/package.json` exists, the returned string contains that version
 * and does not claim the compiler is missing.
 */
export function describeCompilerEnvironment() {
  const typescript = packageVersion('typescript');
  const cruiser = packageVersion('dependency-cruiser');
  const supported = supportedTypescriptRange();

  if (typescript === undefined) {
    return '  (no `typescript` is resolvable from this installation at all — run `npm ci`.)';
  }

  return (
    `  (typescript ${typescript} is installed` +
    (cruiser === undefined ? '' : `; dependency-cruiser@${cruiser}`) +
    (supported === undefined ? '' : ` supports ${supported}`) +
    '. An out-of-range compiler and an absent one are reported identically, so this line ' +
    'is the only place the installed version appears.)'
  );
}

/** The directory holding `<name>`'s package.json, found from its entry point. */
function packageDir(name) {
  let dir;
  try {
    dir = dirname(fileURLToPath(import.meta.resolve(name)));
  } catch {
    return undefined;
  }

  for (;;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        if (JSON.parse(readFileSync(manifest, 'utf8')).name === name) return dir;
      } catch {
        return undefined;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function packageVersion(name) {
  const dir = packageDir(name);
  if (dir === undefined) return undefined;
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
  } catch {
    return undefined;
  }
}

/**
 * `supportedTranspilers.typescript` from dependency-cruiser's own metadata — the range that
 * decides whether a cruise happens at all. Read from an absolute path, which `exports` does
 * not gate; its own try, because a future layout change here must not silence the line above.
 */
function supportedTypescriptRange() {
  const dir = packageDir('dependency-cruiser');
  if (dir === undefined) return undefined;
  try {
    return createRequire(import.meta.url)(join(dir, 'src/meta.cjs')).supportedTranspilers
      ?.typescript;
  } catch {
    return undefined;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
