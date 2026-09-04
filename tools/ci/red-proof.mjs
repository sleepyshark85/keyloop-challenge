#!/usr/bin/env node
/**
 * `red-proof` — AC-6, ADR-0010 Decision 3.
 *
 *   node tools/ci/red-proof.mjs --subject-file <path> --verify <conclusion> --results <json>
 *
 * It asserts the SHAPE of a failure, not merely that there was one. On a commit whose
 * subject marks it as a slice's red commit, CI must show a failing outside-in suite over an
 * otherwise sound branch — a branch that does not compile is a broken run, not a red proof,
 * and this says which.
 *
 * The job therefore SUCCEEDS when the required failure was observed. That inversion is
 * visible in the check's name rather than hidden behind `continue-on-error`.
 *
 * ── The rule, which is AC-6 mapped one clause for one ───────────────────────────────────
 *
 *   "install, typecheck, lint … all passed"   the `verify` job concluded success
 *   "… and unit all passed"                   NO failing file under tests/unit/ — that
 *                                             directory ALONE, because it is the only one
 *                                             AC-6 names
 *   "the acceptance suite failed"             AT LEAST ONE failing file under any
 *                                             test-engineer-owned suite
 *
 * The broad red zone is the human's ruling of 2026-09-04 on the implementer's escalation
 * (design §0, O-1). Under the literal reading — failure under `tests/acceptance/` and
 * nowhere else — slice 07 names only `tests/concurrency/` and slice 11 only
 * `tests/performance/`, so both would have been structurally unable to pass. And slice 00's
 * red commit reddens `tests/integration/` and nothing else, which is why the must-pass set
 * is `tests/unit/` alone rather than "unit or integration": that half of the implementer's
 * proposed remedy was deliberately not adopted. No acceptance criterion changed.
 *
 * ── The invocation contract ─────────────────────────────────────────────────────────────
 *
 * Three required flags, nothing from the environment and nothing from the network, so the
 * discriminator can be REPLAYED offline against a past run's uploaded artifact — which is
 * what design §7's evidence item 3 rests on, and the only way `red-proof` can say anything
 * about the commit that introduced it.
 *
 *   --subject-file  a file holding the head commit's subject. A file rather than
 *                   --subject <string> because a commit subject is arbitrary text and must
 *                   not be re-quoted through a shell.
 *   --verify        the `verify` job's GitHub conclusion.
 *   --results       the Vitest JSON reporter output from the `test` job.
 *
 * Exit 0 rule satisfied or not applicable · 1 rule violated, naming the condition on
 * stdout · 2 usage or I/O error. `judge()` is pure so all of it is testable without
 * spawning anything.
 */
import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * `CLAUDE.md` §7: exactly one such commit per slice, authored by the test-engineer. The
 * marker is what makes the assertion apply, so it cannot be self-awarded by the
 * implementer — anchored at both ends, so a subject that merely CONTAINS "(red)" does not
 * arm the check.
 */
export const RED_COMMIT_SUBJECT = /^test\(.+\): .*\(red\)$/;

/** Every directory the test-engineer owns. The red zone, per the human's BROAD ruling. */
export const RED_ZONE =
  /^tests\/(acceptance|contract|property|concurrency|integration|architecture|performance)\//;

/** The one directory AC-6 names on the must-pass side. */
export const MUST_PASS = /^tests\/unit\//;

/**
 * @param {{ subject: string, verifyConclusion: string, failedFiles: string[] }} input
 * @returns {{ ok: boolean, reason: string }}
 */
export function judge({ subject, verifyConclusion, failedFiles }) {
  const trimmed = String(subject ?? '').trim();
  const failed = (failedFiles ?? []).map((file) => String(file));

  if (!RED_COMMIT_SUBJECT.test(trimmed)) {
    return {
      ok: true,
      reason:
        `not applicable: the head commit subject ${JSON.stringify(trimmed)} does not match ` +
        `${RED_COMMIT_SUBJECT}, so nothing is asserted about this run`,
    };
  }

  if (verifyConclusion !== 'success') {
    return {
      ok: false,
      reason:
        `the verify job concluded ${JSON.stringify(verifyConclusion)} rather than "success". ` +
        'AC-6 requires install, typecheck and lint to have passed: a branch that does not ' +
        'build is a broken run, not a red proof',
    };
  }

  const unitFailures = failed.filter((file) => MUST_PASS.test(file));
  if (unitFailures.length > 0) {
    return {
      ok: false,
      reason:
        `AC-6 requires the unit tests to pass, and ${unitFailures.length} failed: ` +
        `${unitFailures.join(', ')}`,
    };
  }

  const suiteFailures = failed.filter((file) => RED_ZONE.test(file));
  if (suiteFailures.length === 0) {
    return {
      ok: false,
      reason:
        'the commit is marked red but no test-engineer-owned suite failed. A red proof that ' +
        `was not red proves nothing. Failing files: ${failed.length === 0 ? '(none)' : failed.join(', ')}`,
    };
  }

  return {
    ok: true,
    reason:
      `red observed: ${suiteFailures.join(', ')} failed, no unit test failed, and verify ` +
      'concluded success',
  };
}

/**
 * The distinct `testResults[]` entries with `status === "failed"`, made repo-relative and
 * POSIX-normalised — Vitest reports absolute native paths, and the rule above is written in
 * terms of `tests/…` prefixes.
 */
export function failedFilesFrom(vitestResults, cwd = process.cwd()) {
  const files = new Set();
  for (const entry of vitestResults?.testResults ?? []) {
    if (entry?.status !== 'failed') continue;
    files.add(repoRelative(String(entry.name ?? ''), cwd));
  }
  return [...files];
}

/**
 * Vitest records the ABSOLUTE path of the machine that ran the suite. In the `test` job
 * that is the same workspace, so `relative(cwd, …)` is right. It is wrong for the case this
 * tool's whole contract was designed around: design §7's evidence item 3 REPLAYS a CI run's
 * downloaded `test-results.json` on someone else's machine, where every name begins
 * `/home/runner/work/…` and `relative()` yields `../../../home/runner/…`. That matches no
 * rule here, so a genuinely red run would be judged "no suite failed" and exit 1 — the
 * discriminator reporting the opposite of what happened, on the one path that exists to
 * check it. Measured against the artifact of run 33831214774, the red commit's own run.
 *
 * So: relative to the working directory when the file is inside it, and otherwise from the
 * last `tests/` segment — last, not first, because a checkout directory may itself be
 * called `tests`.
 */
function repoRelative(name, cwd) {
  const local = relative(cwd, name).split(sep).join('/');
  if (local !== '' && !local.startsWith('..')) return local;

  const posix = name.split(sep).join('/');
  const marker = posix.lastIndexOf('/tests/');
  return marker === -1 ? posix : posix.slice(marker + 1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--subject-file') { args.subjectFile = value; i += 1; }
    else if (flag === '--verify') { args.verify = value; i += 1; }
    else if (flag === '--results') { args.results = value; i += 1; }
    else return { error: `unknown argument: ${flag}` };
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.error) {
    console.error(`red-proof: ${args.error}`);
    return 2;
  }
  for (const [flag, key] of [['--subject-file', 'subjectFile'], ['--verify', 'verify'], ['--results', 'results']]) {
    if (!args[key]) {
      console.error(`red-proof: ${flag} is required`);
      console.error('usage: red-proof.mjs --subject-file <path> --verify <conclusion> --results <json>');
      return 2;
    }
  }

  let subject;
  let results;
  try {
    // The first line only: `git log -1 --format=%s` writes a trailing newline, and a
    // subject is one line by definition.
    subject = readFileSync(args.subjectFile, 'utf8').split('\n')[0] ?? '';
    results = JSON.parse(readFileSync(args.results, 'utf8'));
  } catch (error) {
    console.error(`red-proof: ${error.message}`);
    return 2;
  }

  const verdict = judge({
    subject,
    verifyConclusion: args.verify,
    failedFiles: failedFilesFrom(results),
  });

  console.log(verdict.reason);
  return verdict.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
