#!/usr/bin/env node
/**
 * T-01-2 — a (c) design defect ruled at slice 01 step 2, naming `CLAUDE.md` §2.4.
 *
 * A `db`-project container failure aborted the whole `vitest run` and discarded the `nodb`
 * project's results, so `red-proof` read a `test-results.json` with zero test files and
 * reported that no test-engineer-owned suite failed — on a commit whose tests really had
 * failed. Red for the wrong reason.
 *
 * `tools/ci/run-tests.mjs` splits the invocation and merges. The danger in that fix is that
 * it can install a WORSE defect than the one it removes: a project that never ran merging as
 * zero failures, indistinguishable from a project where everything passed, invisible on every
 * slice rather than conditional on Docker. Most of the cases below exist to pin that, not the
 * happy path.
 */
import { merge, exitCodeFor, EXIT_OK, EXIT_TESTS_FAILED, EXIT_DID_NOT_RUN } from '../ci/run-tests.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const report = (project, files, { total = files.length, passed = files.length, failed = 0, exitCode = 0 } = {}) => ({
  project, exitCode,
  json: {
    numTotalTests: total, numPassedTests: passed, numFailedTests: failed,
    testResults: files.map((f) => ({ name: f.name ?? f, status: f.status ?? 'passed' })),
  },
});
/** Vitest wrote a report having collected nothing — the MEASURED Docker-failure shape. */
const ranNothing = (project, exitCode = 1) => ({ project, exitCode, json: { numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, testResults: [] } });
/** No file written at all. */
const noFile = (project, exitCode = 1) => ({ project, exitCode, json: null });

// === the happy path ==========================================================
{
  const r = merge([report('nodb', ['a.test.ts', 'b.test.ts']), report('db', ['c.test.ts'])]);
  ok('both projects merge into one result set', r.merged.testResults.length === 3, String(r.merged.testResults.length));
  ok('and the merged file keeps Vitest\'s shape for red-proof',
    Array.isArray(r.merged.testResults) && typeof r.merged.numTotalTests === 'number');
  ok('and success is true when everything ran and nothing failed', r.merged.success === true);
  ok('and the exit code is 0', exitCodeFor(r) === EXIT_OK, String(exitCodeFor(r)));
}

// === THE T-01-2 CASE: db never ran ==========================================
// This is the measured failure. Vitest DID write a report; it just collected nothing.
{
  const r = merge([report('nodb', ['a.test.ts', 'b.test.ts']), ranNothing('db')]);
  ok('a project that collected nothing is recorded as DID NOT RUN',
    r.didNotRun.includes('db'), JSON.stringify(r.didNotRun));
  ok('...and is NOT silently merged as zero failures', r.merged.success === false);
  ok('...and gets its own exit code, distinct from a test failure',
    exitCodeFor(r) === EXIT_DID_NOT_RUN, String(exitCodeFor(r)));
  ok('...while the OTHER project\'s results are preserved, which is the whole point',
    r.merged.testResults.length === 2, String(r.merged.testResults.length));
  ok('...and the artifact says which projects produced it',
    r.merged.projectReport.find((p) => p.project === 'db')?.ran === false);
}

// --- a missing file is the same verdict as an empty one ----------------------
{
  const r = merge([report('nodb', ['a.test.ts']), noFile('db')]);
  ok('a project whose JSON was never written is also DID NOT RUN', r.didNotRun.includes('db'));
  ok('...and exits DID_NOT_RUN, not OK', exitCodeFor(r) === EXIT_DID_NOT_RUN, String(exitCodeFor(r)));
}

// --- and the reverse direction: nodb dying must not hide db ------------------
{
  const r = merge([ranNothing('nodb'), report('db', ['c.test.ts'])]);
  ok('the guard is symmetric — nodb failing to run is caught too', r.didNotRun.includes('nodb'));
  ok('...and db\'s results still survive it', r.merged.testResults.length === 1);
}

// === a real test failure is still a real test failure ========================
// The DID_NOT_RUN guard must not swallow the ordinary red this whole pipeline exists to observe.
{
  const r = merge([
    report('nodb', [{ name: 'a.test.ts', status: 'failed' }], { failed: 1, passed: 0, total: 1 }),
    report('db', ['c.test.ts']),
  ]);
  ok('a genuine failure is reported as a failure, not as did-not-run',
    r.didNotRun.length === 0 && r.failed === 1, JSON.stringify(r.didNotRun));
  ok('...and exits TESTS_FAILED, which is what a red commit must produce',
    exitCodeFor(r) === EXIT_TESTS_FAILED, String(exitCodeFor(r)));
  ok('...and the failing file survives into the merged results red-proof reads',
    r.merged.testResults.some((t) => t.status === 'failed' && t.name === 'a.test.ts'));
}

// --- both projects dead ------------------------------------------------------
{
  const r = merge([ranNothing('nodb'), ranNothing('db')]);
  ok('both projects failing to run names both', r.didNotRun.length === 2, JSON.stringify(r.didNotRun));
  ok('...and never reports success', r.merged.success === false);
}

// --- counts are summed, not taken from one project ---------------------------
{
  const r = merge([
    report('nodb', ['a.test.ts'], { total: 94, passed: 94 }),
    report('db', ['c.test.ts'], { total: 18, passed: 17, failed: 1 }),
  ]);
  ok('totals are summed across projects', r.merged.numTotalTests === 112, String(r.merged.numTotalTests));
  ok('passes are summed across projects', r.merged.numPassedTests === 111, String(r.merged.numPassedTests));
  ok('failures are summed across projects', r.merged.numFailedTests === 1, String(r.merged.numFailedTests));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
