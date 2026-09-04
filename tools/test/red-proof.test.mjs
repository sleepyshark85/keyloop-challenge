#!/usr/bin/env node
/**
 * Tests for tools/ci/red-proof.mjs (ADR-0010 Decision 3, AC-6).
 *
 *   node tools/test/red-proof.test.mjs
 *
 * AUTHORED BY THE TEST-ENGINEER, unwired at the red commit (docs/slices/00a-design.md
 * §11.4) and wired into `npm run test:tools` by the implementer in the green commit that
 * created tools/ci/red-proof.mjs — see the header of collect-ci.test.mjs for why the delay
 * was load-bearing twice, and what it cost the one file that stayed unwired.
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
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
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

/**
 * The RED RUN'S OWN ARTIFACT, captured with `gh run download 33831214774 -n test-results`.
 *
 * §6 of collect-ci.test.mjs states the rule this file broke: "a fixture captured from the
 * tool beats a fixture that encodes someone's belief about the tool". It was honoured for
 * the `gh` payloads and not for the Vitest JSON — every case below builds names with
 * `resolve()`, which makes them absolute against the LOCAL cwd, so `repoRelative` was only
 * ever exercised on its first branch (the file is inside cwd, `relative()` answers). The
 * branch that handles a path from ANOTHER machine — the one this tool exists to read, since
 * red-proof replays a downloaded artifact — was never run.
 */
const CAPTURED_RED = JSON.parse(
  readFileSync(resolve('tools/test/fixtures/vitest-red-run.captured.json'), 'utf8'),
);

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

  // ──────────────────────── failedFilesFrom, on RUNNER-ABSOLUTE names (J-3) ──
  //
  // `judge` takes failedFiles already normalised, so every case above tested the RULE and
  // none tested the READER that produces its input. That reader is the half that has to
  // cope with a path from another machine, because red-proof's whole purpose is to be run
  // against a downloaded artifact.

  const { failedFilesFrom } = tool;
  check('exports failedFilesFrom(vitestResults, cwd) → the failing files, repo-relative',
    typeof failedFilesFrom === 'function',
    'the normalisation is the half of this tool that reads a foreign machine\'s paths, and '
    + 'it was reachable from the CLI only');

  if (typeof failedFilesFrom === 'function') {
    // COVERAGE BEFORE VERDICT. If this fixture ever stopped carrying runner-absolute names
    // — recaptured from a local run, say — every assertion below would quietly fall back to
    // the trivial branch and keep passing while proving nothing. That is this slice's
    // recurring failure mode, so it is asserted rather than assumed.
    const capturedNames = (CAPTURED_RED.results?.testResults ?? []).map((entry) => entry.name);
    check('fixture precondition — the captured artifact carries RUNNER-absolute names',
      capturedNames.length === 3
        && capturedNames.every((name) => name.startsWith('/home/runner/work/')),
      `Vitest records the absolute path of the machine that ran the suite; a fixture with `
      + `repo-relative names encodes a belief about the tool that is false. got `
      + JSON.stringify(capturedNames));

    // The cwd is this machine's repo root and the paths are the runner's. THE MISMATCH IS
    // THE CASE: `relative(cwd, name)` escapes upward, so the second branch has to answer.
    const failed = failedFilesFrom(CAPTURED_RED.results, process.cwd());
    check('the red run\'s failing files normalise to repo-relative paths',
      JSON.stringify([...failed].sort()) === JSON.stringify([
        'tests/acceptance/health.test.ts',
        'tests/architecture/layering.test.ts',
      ]),
      `un-normalised, every name starts /home/runner/… and matches neither RED_ZONE nor `
      + `MUST_PASS, so red-proof would report "nothing failed" on a run that failed twice. `
      + `got ${JSON.stringify(failed)}`);

    check('a PASSING file in the same artifact is not reported as failing',
      !failed.some((file) => file.includes('postgres-harness')),
      `tests/integration/postgres-harness.test.ts passed in run 33831214774 and is inside `
      + `the red zone, so a reader that ignored status would still look right. got `
      + JSON.stringify(failed));

    // §7 evidence item 3, which was a one-off manual replay, now wired in as a regression.
    const replay = judge({
      subject: RED_SUBJECT, verifyConclusion: 'success', failedFiles: failed,
    });
    check('AC-6 holds against the red run\'s own artifact, end to end',
      replay?.ok === true,
      `the replay that discharges §7 evidence item 3 is now a test rather than a transcript. `
      + `got ${JSON.stringify(replay)}`);

    // "relative to cwd when inside it, otherwise from the LAST /tests/ segment" — LAST,
    // because a checkout directory may itself be called `tests`. A first-match reader
    // returns tests/tests/tests/acceptance/health.test.ts here, which matches no anchor.
    const nested = failedFilesFrom({
      testResults: [{
        name: '/home/runner/work/tests/tests/tests/acceptance/health.test.ts',
        status: 'failed',
      }],
    }, '/somewhere/else');
    check('normalisation takes the LAST /tests/ segment, not the first',
      nested[0] === 'tests/acceptance/health.test.ts',
      `a repository checked out into a directory called "tests" is the case this choice is `
      + `for. got ${JSON.stringify(nested)}`);

    const noMarker = failedFilesFrom({
      testResults: [{ name: '/elsewhere/spec/health.test.ts', status: 'failed' }],
    }, '/somewhere/else');
    check('a path with no /tests/ segment is returned whole rather than mangled',
      noMarker[0] === '/elsewhere/spec/health.test.ts',
      `it will match no anchor either way, but it must reach the reason string intact so a `
      + `human can see what was read. got ${JSON.stringify(noMarker)}`);
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

// The red run's artifact, written back out VERBATIM — runner-absolute names and all. Every
// other file here is built by vitestResults(), which resolve()s names against the local cwd
// and therefore cannot reach the normalisation branch the CLI needs in CI.
const capturedRedResults = join(scratch, 'captured-red.json');
writeFileSync(capturedRedResults, JSON.stringify(CAPTURED_RED.results, null, 2));

const run = (args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' });

const cliCases = [
  ['exit 0 — the rule is satisfied', 0,
    ['--subject-file', subjectFile, '--verify', 'success', '--results', redResults]],
  ['exit 0 — THE RED RUN\'S OWN ARTIFACT, runner-absolute names, through the CLI', 0,
    ['--subject-file', subjectFile, '--verify', 'success', '--results', capturedRedResults]],
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

// -- the subject file is read A LINE AT A TIME, and that is not cosmetic ----------------
//
// Raised as low priority and it earns a case, though not for the reason it looked like.
// `judge()` already trims, so dropping `.split('\n')[0]` is invisible for the trailing
// newline `git log -1 --format=%s` produces — every existing case here passes either way.
// It bites on a MULTI-LINE subject file: `RED_COMMIT_SUBJECT` carries no `m` flag, so `$`
// is end-of-input, a subject with a body after it matches nothing, and red-proof reports
// NOT APPLICABLE and exits 0.
//
// That is the failure direction that matters. The check does not go red, it goes quiet —
// AC-6 stops being asserted on precisely the commit it exists for, and the only way to
// notice is to read the job's log. One edit to the workflow step (`%B` instead of `%s`, or
// a `--format` that appends anything) is enough. Measured: real exits 1, the mutant exits 0.
const multiLineSubject = join(scratch, 'subject-multiline.txt');
writeFileSync(multiLineSubject, `${RED_SUBJECT}\n\nA body paragraph, as %B would give.\n`);

const multiLine = run(
  ['--subject-file', multiLineSubject, '--verify', 'success', '--results', greenResults]);
check('a subject file with a body still arms the check — only the FIRST LINE is the subject',
  multiLine.status === 1,
  `red-marked with nothing failed is exit 1. Read the file whole and the subject matches `
  + `nothing, so the tool reports "not applicable" and exits 0 — AC-6 silently unasserted on `
  + `the one commit it is for. got ${multiLine.status}\n          stdout `
  + `${(multiLine.stdout ?? '').trim()}`);
check('…and it did NOT report itself not-applicable',
  !/not applicable/i.test(multiLine.stdout ?? ''),
  `exit 1 could also come from a later clause; this is what pins the subject as recognised. `
  + `got ${JSON.stringify((multiLine.stdout ?? '').trim())}`);

const named = run(['--subject-file', subjectFile, '--verify', 'success', '--results', greenResults]);
check('exit 1 names the failing condition on stdout',
  /acceptance|suite|fail/i.test(named.stdout ?? ''),
  JSON.stringify(named.stdout));

rmSync(scratch, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
