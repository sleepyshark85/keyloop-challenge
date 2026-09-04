#!/usr/bin/env node
/**
 * Tests for tools/ci/red-proof.mjs (ADR-0010 Decision 3, AC-6).
 *
 *   node tools/test/red-proof.test.mjs
 *
 * AUTHORED BY THE TEST-ENGINEER, and deliberately NOT wired into `npm run test:tools`
 * (docs/slices/00a-design.md §11.4) — see the header of collect-ci.test.mjs for why that is
 * load-bearing twice.
 *
 * This file matters more than an ordinary tool test. `red-proof` cannot judge the commit
 * that introduces it as a live job, so §7's evidence item 3 offers a REPLAY of the discrim-
 * inator against the red run's own artifact as the substitute. A substitute for an
 * independent check has to be independent itself; that is the whole argument for these
 * cases being written by the role that did not write the tool.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * THE RULE, WHICH IS AC-6 MAPPED ONE CLAUSE FOR ONE
 *
 * Exit 0 when the head commit subject does NOT match /^test\(.+\): .*\(red\)$/ — not
 * applicable, nothing asserted. Otherwise exit 0 iff all three of AC-6's clauses hold:
 *
 *   "install, typecheck, lint … all passed"   the verify job concluded success
 *   "… and unit all passed"                   NO failing file under tests/unit/ — that
 *                                             directory alone, because it is the only one
 *                                             AC-6 names
 *   "the acceptance suite failed"             AT LEAST ONE failing file under
 *                                             tests/(acceptance|contract|property|
 *                                             concurrency|integration|architecture|
 *                                             performance)/
 *
 * The broad red zone is the human's ruling of 2026-09-04 on the implementer's escalation
 * (O-1). Under the literal reading, slice 07 names only tests/concurrency/ and slice 11 only
 * tests/performance/, so both would have been structurally unable to pass; and slice 00's
 * red commit reddens tests/integration/ and nothing else, which is why the must-pass set is
 * tests/unit/ ALONE and not "unit or integration". No acceptance criterion changed.
 *
 * The job SUCCEEDS when the required failure was observed. That inversion is visible in the
 * check's name rather than hidden in `continue-on-error`.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const TOOL = resolve('tools/ci/red-proof.mjs');
const RED_SUBJECT = 'test(00a): the walking skeleton, asserted (red)';

let passed = 0;
let failed = 0;
const check = (desc, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ok    ${desc}`); }
  else { failed++; console.log(`FAIL    ${desc}${detail ? `\n          ${detail}` : ''}`); }
};

const scratch = mkdtempSync(join(tmpdir(), 'red-proof-'));

/** The shape Vitest's json reporter emits: one testResults[] entry per test FILE. */
function vitestResults(files) {
  return {
    numTotalTestSuites: files.length,
    numTotalTests: files.length,
    numPassedTests: files.filter(([, status]) => status === 'passed').length,
    numFailedTests: files.filter(([, status]) => status === 'failed').length,
    success: files.every(([, status]) => status === 'passed'),
    testResults: files.map(([name, status]) => ({
      name: resolve(name),
      status,
      message: status === 'failed' ? 'expected 200 to be 503' : '',
      assertionResults: [{ title: name, status, failureMessages: [] }],
    })),
  };
}

const resultsFile = (label, files) => {
  const path = join(scratch, `${label}.json`);
  writeFileSync(path, JSON.stringify(vitestResults(files), null, 2));
  return path;
};

// ──────────────────────────────────────────────────────── the six cases, on judge() ──

const tool = await import(TOOL).catch((error) => {
  check('tools/ci/red-proof.mjs is importable', false, String(error?.message ?? error));
  return null;
});

if (tool) {
  const { judge } = tool;
  check('exports a pure judge({ subject, verifyConclusion, failedFiles }) → { ok, reason }',
    typeof judge === 'function',
    'mirrors §6\'s toCheckRunRecord split, so every case is testable without spawning a process');

  if (typeof judge === 'function') {
    const cases = [
      ['red-marked + acceptance-only failure + verify green → ok',
        { subject: RED_SUBJECT, verifyConclusion: 'success',
          failedFiles: ['tests/acceptance/health.test.ts'] }, true],

      ['red-marked + CONCURRENCY-only failure + verify green → ok (slice 07)',
        { subject: 'test(07): reschedule under contention (red)', verifyConclusion: 'success',
          failedFiles: ['tests/concurrency/reschedule.test.ts'] }, true],

      ['red-marked + INTEGRATION-only failure + verify green → ok (slice 00)',
        { subject: 'test(00): the exclusion constraints (red)', verifyConclusion: 'success',
          failedFiles: ['tests/integration/exclusion-constraints.test.ts'] }, true],

      ['red-marked + PERFORMANCE-only failure + verify green → ok (slice 11)',
        { subject: 'test(11): the p95 budget (red)', verifyConclusion: 'success',
          failedFiles: ['tests/performance/budget.test.ts'] }, true],

      ['red-marked + a failure under tests/unit/ → not ok',
        { subject: RED_SUBJECT, verifyConclusion: 'success',
          failedFiles: ['tests/acceptance/health.test.ts', 'tests/unit/checkHealth.test.ts'] },
        false],

      ['red-marked + everything green → not ok (a red proof that was not red)',
        { subject: RED_SUBJECT, verifyConclusion: 'success', failedFiles: [] }, false],

      ['red-marked + verify FAILED → not ok (a broken run, not a red proof)',
        { subject: RED_SUBJECT, verifyConclusion: 'failure',
          failedFiles: ['tests/acceptance/health.test.ts'] }, false],

      ['unmarked subject → ok, not applicable',
        { subject: 'feat(02): book an appointment', verifyConclusion: 'failure',
          failedFiles: ['tests/acceptance/health.test.ts'] }, true],

      ['a subject that only LOOKS marked → ok, not applicable',
        { subject: 'chore: tidy the (red) fixtures', verifyConclusion: 'success',
          failedFiles: [] }, true],
    ];

    for (const [desc, input, expected] of cases) {
      const verdict = judge(input);
      check(desc, verdict?.ok === expected,
        `expected ok=${expected}, got ${JSON.stringify(verdict)}`);
      check(`${desc} — names the condition in reason`,
        typeof verdict?.reason === 'string' && verdict.reason.length > 0,
        'exit 1 must name the failing condition on stdout, so a human reads a verdict '
        + 'rather than a status code');
    }
  }
}

// ────────────────────────────────────────────────────────── the invocation contract ──
//
// Three required argv flags, nothing from the environment and nothing from the network.
// --subject-file is a FILE rather than --subject <string> because a commit subject is
// arbitrary text and must not be re-quoted through a shell.

const subjectFile = join(scratch, 'subject.txt');
writeFileSync(subjectFile, `${RED_SUBJECT}\n`);

const unmarkedSubjectFile = join(scratch, 'subject-unmarked.txt');
writeFileSync(unmarkedSubjectFile, 'feat(02): book an appointment\n');

const redResults = resultsFile('red', [
  ['tests/acceptance/health.test.ts', 'failed'],
  ['tests/architecture/layering.test.ts', 'failed'],
  ['tests/integration/postgres-harness.test.ts', 'passed'],
]);
const greenResults = resultsFile('green', [
  ['tests/acceptance/health.test.ts', 'passed'],
  ['tests/unit/checkHealth.test.ts', 'passed'],
]);
const unitRedResults = resultsFile('unit-red', [
  ['tests/acceptance/health.test.ts', 'failed'],
  ['tests/unit/checkHealth.test.ts', 'failed'],
]);

const run = (args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' });

const cliCases = [
  ['exit 0 — the rule is satisfied', 0,
    ['--subject-file', subjectFile, '--verify', 'success', '--results', redResults]],
  ['exit 0 — not applicable on an unmarked subject', 0,
    ['--subject-file', unmarkedSubjectFile, '--verify', 'failure', '--results', greenResults]],
  ['exit 1 — red-marked but nothing failed', 1,
    ['--subject-file', subjectFile, '--verify', 'success', '--results', greenResults]],
  ['exit 1 — red-marked but a unit test failed', 1,
    ['--subject-file', subjectFile, '--verify', 'success', '--results', unitRedResults]],
  ['exit 1 — red-marked but verify did not pass', 1,
    ['--subject-file', subjectFile, '--verify', 'failure', '--results', redResults]],
  ['exit 2 — usage error, a required flag missing', 2,
    ['--subject-file', subjectFile, '--verify', 'success']],
  ['exit 2 — I/O error, the results file does not exist', 2,
    ['--subject-file', subjectFile, '--verify', 'success',
     '--results', join(scratch, 'does-not-exist.json')]],
];

for (const [desc, expected, args] of cliCases) {
  const result = run(args);
  check(desc, result.status === expected,
    `got ${result.status}\n          stdout ${result.stdout?.trim()}\n          stderr ${result.stderr?.trim()}`);
}

const named = run(['--subject-file', subjectFile, '--verify', 'success', '--results', greenResults]);
check('exit 1 names the failing condition on stdout',
  /acceptance|suite|fail/i.test(named.stdout ?? ''),
  JSON.stringify(named.stdout));

rmSync(scratch, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
