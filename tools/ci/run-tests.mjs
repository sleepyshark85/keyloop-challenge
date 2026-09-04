#!/usr/bin/env node
/**
 * `npm test` — runs the vitest projects as SEPARATE invocations and merges their results.
 *
 *   npm test
 *   npm test -- --outputFile=test-results.json
 *
 * This exists because of T-01-2, a (c) design defect ruled against slice 01's design at
 * step 2, naming `CLAUDE.md` §2.4 — *"observed red in CI"*, NON-NEGOTIABLE.
 *
 * THE DEFECT. `vitest.config.ts` declares two projects. The `db` project carries
 * `globalSetup: tests/setup/postgres.ts`, which starts a Testcontainers PostgreSQL. A single
 * `vitest run` over both projects initialises global setup BEFORE running anything, so a
 * container failure aborts the whole invocation and discards the `nodb` project's results
 * with it. Measured, with `DOCKER_HOST` pointed at nothing:
 *
 *   npx vitest run                  -> aborts in TestProject._initializeGlobalSetup
 *                                      test-results.json: 0 test files, 0 tests
 *   npx vitest run --project nodb   -> 7 files, 94 tests, 94 passed
 *
 * `tools/ci/red-proof.mjs` reads that single `test-results.json` via `--results`. With zero
 * files it takes the `failedFiles: []` branch and reports *"the commit is marked red but no
 * test-engineer-owned suite failed"* — so a red commit whose tests genuinely failed is judged
 * as never having failed, because Docker hiccuped. Red for the wrong reason.
 *
 * THE PART THAT IS EASY TO GET WRONG, and the reason this file is not three lines of shell.
 * Splitting the invocation alone opens a worse hole in the same place: if two JSONs are merged
 * and one project never ran, its absence merges as ZERO FAILURES — indistinguishable from a
 * project in which everything passed. That would be invisible on every slice rather than
 * conditional on Docker. So:
 *
 *   **A project that did not run is a loud, distinct failure and never an empty contribution.**
 *
 * A missing project JSON, or one contributing zero test files, exits `EXIT_DID_NOT_RUN` with
 * a named message, before `red-proof` is ever reached. Deliberately rejected: making
 * `globalSetup` fail soft, which would convert a missing container into skipped `db` tests —
 * a green over nothing, worse than an abort.
 *
 * The merged file keeps Vitest's shape so `red-proof`'s interface does not change — 00a's
 * single-file invocation contract is preserved. It gains one extra field, `projectReport`,
 * so a results artifact replayed on another machine can still say which projects produced it.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Exit codes, distinct so CI and a human can tell the two failures apart. */
export const EXIT_OK = 0;
export const EXIT_TESTS_FAILED = 1;
export const EXIT_DID_NOT_RUN = 2;

const PROJECTS = ['nodb', 'db'];

/**
 * Merge per-project Vitest JSON into one result, and classify each project.
 *
 * Exported and pure so `tools/test/run-tests.test.mjs` can drive it without spawning
 * Vitest — the classification is the load-bearing logic, not the spawning.
 */
export function merge(reports) {
  const projectReport = [];
  const testResults = [];
  let total = 0, passed = 0, failed = 0;

  for (const { project, json, exitCode } of reports) {
    const files = json?.testResults ?? null;
    // `null` json means no file was written at all; an empty array means Vitest wrote a
    // report having collected nothing. Both are "this project did not run": the measured
    // Docker failure produces the SECOND, so treating only the first as absence would
    // reproduce the exact defect this tool exists to close.
    if (files === null || files.length === 0) {
      projectReport.push({ project, ran: false, exitCode, files: 0 });
      continue;
    }
    projectReport.push({ project, ran: true, exitCode, files: files.length });
    testResults.push(...files);
    total += json.numTotalTests ?? 0;
    passed += json.numPassedTests ?? 0;
    failed += json.numFailedTests ?? 0;
  }

  const didNotRun = projectReport.filter((p) => !p.ran).map((p) => p.project);
  return {
    merged: {
      numTotalTestSuites: testResults.length,
      numTotalTests: total,
      numPassedTests: passed,
      numFailedTests: failed,
      success: didNotRun.length === 0 && failed === 0,
      testResults,
      projectReport,
    },
    didNotRun,
    failed,
  };
}

/** The exit code for a merge result. Separate from `merge` so the mapping is itself testable. */
export function exitCodeFor({ didNotRun, failed }) {
  if (didNotRun.length) return EXIT_DID_NOT_RUN;
  return failed > 0 ? EXIT_TESTS_FAILED : EXIT_OK;
}

function main(argv) {
  const outFlag = argv.find((a) => a.startsWith('--outputFile='));
  const outputFile = outFlag ? outFlag.split('=')[1] : 'test-results.json';

  const dir = mkdtempSync(join(tmpdir(), 'run-tests-'));
  const reports = [];
  try {
    for (const project of PROJECTS) {
      const file = join(dir, `${project}.json`);
      // Every project runs regardless of an earlier project's exit code. If `nodb` fails,
      // `db`'s results are still evidence, and vice versa — which is the whole point.
      const r = spawnSync('npx', ['vitest', 'run', '--project', project,
        '--reporter=json', `--outputFile=${file}`], { encoding: 'utf8', stdio: 'inherit' });
      let json = null;
      if (existsSync(file)) {
        try { json = JSON.parse(readFileSync(file, 'utf8')); } catch { json = null; }
      }
      reports.push({ project, json, exitCode: r.status });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const result = merge(reports);
  writeFileSync(outputFile, JSON.stringify(result.merged, null, 2), 'utf8');

  for (const p of result.merged.projectReport) {
    console.log(`  ${p.project.padEnd(6)} ${p.ran ? `ran, ${p.files} file(s)` : 'DID NOT RUN'}  (exit ${p.exitCode})`);
  }
  if (result.didNotRun.length) {
    console.error(`\n  project(s) produced no results: ${result.didNotRun.join(', ')}`);
    console.error('  This is NOT "nothing failed". A project that did not run cannot be');
    console.error('  merged as zero failures — see CLAUDE.md §2.4 and finding T-01-2.\n');
  }
  return exitCodeFor(result);
}

if (process.argv[1] && process.argv[1].endsWith('run-tests.mjs')) {
  process.exit(main(process.argv.slice(2)));
}
