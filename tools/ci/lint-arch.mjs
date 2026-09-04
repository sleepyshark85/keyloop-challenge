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
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
  // the artifact under test is still the file CI runs. The local bin rather than `npx`: npx
  // will happily fetch a DIFFERENT dependency-cruiser from the network, and a guard against
  // the wrong analyser running must not be able to run the wrong analyser.
  const local = resolve('node_modules/.bin/depcruise');
  const cruise = spawnSync(
    existsSync(local) ? local : 'depcruise',
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
  if (!verdict.ok) console.log(installedTypescript());
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
 * So a maintainer who bumps typescript past the range gets a message telling them a
 * compatible compiler is missing and NOT telling them which one they installed. This adds
 * that, from the only place it can be read.
 */
function installedTypescript() {
  try {
    const require = createRequire(import.meta.url);
    const { version } = require('typescript/package.json');
    return (
      `  (typescript ${version} is installed; dependency-cruiser@` +
      `${require('dependency-cruiser/package.json').version} supports ` +
      `${require('dependency-cruiser/src/meta.cjs').supportedTranspilers.typescript}. ` +
      'An out-of-range compiler and an absent one are reported identically.)'
    );
  } catch {
    return '  (no `typescript` is resolvable from this installation at all.)';
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
