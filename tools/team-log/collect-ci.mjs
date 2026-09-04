#!/usr/bin/env node
/**
 * `check.run` collector — ADR-0010 Decision 2, AC-5.
 *
 *   node tools/team-log/collect-ci.mjs [--branch <name>] [--run <id>] [--slice <id>]
 *                                      [--from-file <path>] [--limit <n>] [--dry-run]
 *
 * IT WRITES NOTHING IT DID NOT COMPUTE. There is no `--conclusion`, no `--status`, no way
 * to state an outcome on the command line: every field under `checks` is parsed from `gh`
 * output. That is the whole justification for `appendRecords(…, { allowDerived: true })` —
 * `write.mjs` reserves the `derived` tier for collectors that compute the fact themselves,
 * and a flag on a module that accepted the fact as an argument would be the tier laundered
 * rather than earned. `checks.collected_via` records which door the payload came through,
 * so a `--from-file` replay is distinguishable in the log from a live collection.
 *
 * ── Two pure exports, and the division between them is load-bearing (F6) ────────────────
 *
 *   toCheckRunRecord(ghRun, opts)    per-run SHAPE, and `ts` from the run's updatedAt
 *   toCheckRunRecords(ghRuns, opts)  the LIST property: ascending by updatedAt
 *
 * The step-2 draft named only the singular. But constraint 4 below is a property of a list,
 * so with one export the ordering would have lived down here in the CLI wrapper where no
 * unit test can reach it — a constraint imposed in one place and enforced in another that
 * is never exercised. Idempotence deliberately stays here and does NOT migrate into the
 * pure functions: it has to read the log, which makes it I/O, and a pure function that
 * reads a file is neither.
 *
 * ── Five constraints imposed by the CONSUMER, tools/slice/check.mjs (design §6) ─────────
 *
 * None is visible from the schema, and each makes the Definition of Done silently wrong
 * when broken.
 *
 *   1  `checks.depcruise` is the LOWERCASE string "pass" — check.mjs compares by equality.
 *   2  JSON.stringify(checks) contains "FAIL" IFF the run failed. check.mjs decides both
 *      *red before green* and *tests green* by /FAIL|\b0\// over that string. Hence the
 *      uppercase PASS/FAIL in `jobs`, and hence a lowercase `red_proof: "success"` — a
 *      green run must carry no FAIL anywhere, including in a field named for a failure
 *      concept, which is why the third value is "not-applicable" and not "NOT-FAILED".
 *   3  No ratio strings anywhere in `checks`: `\b0\/` inside "0/0 skipped" reads a green
 *      run as red. Counts, if ever wanted, go in separate numeric fields.
 *   4  Records are appended OLDEST-RUN-FIRST. check.mjs:113 is `runs.at(-1)` — positional
 *      in log order, not by timestamp — and `gh run list` returns newest-first, so a
 *      collector that appends in gh order judges *tests green* on a stale run. Invisible
 *      in a single-run collection; it appears the first time anyone collects a backlog at
 *      a gate, which is exactly when it is trusted.
 *   5  `ts` is the run's `updatedAt`, never the collection time. check.mjs:100 compares
 *      strictly and schema.mjs:137 does `out.ts ??= new Date().toISOString()`, so an
 *      omitted ts silently becomes *now*; collect a red run and its later green run in one
 *      invocation and C1 reports FAIL on a correctly test-first slice.
 *
 * `suites` is deliberately NOT emitted. `gh run view --json jobs` yields job and step
 * conclusions only; per-suite results live in the Vitest JSON, which no collector parses.
 * An omitted field is honest where a guessed one would corrupt the record C1 reads.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { appendRecords, loadLog } from './write.mjs';

/**
 * `gh run view --json jobs` returns each job's DISPLAY NAME. It does not return the key
 * the job has in the workflow YAML — the REST API does not expose it — so a record with
 * `jobs.verify` can only be produced by mapping the names this repository actually uses.
 * Anything unrecognised is slugified rather than dropped: an unmapped job still has to
 * reach `checks`, or a failure in it would be invisible to constraint 2.
 */
const JOB_KEYS = new Map([
  ['docs, tools and log integrity', 'verify'],
  ['suite (Testcontainers)', 'test'],
  ['red-proof', 'red-proof'],
]);

/** The `verify` step that runs `npm run lint:arch`. Steps carry a name and no command. */
const LAYERING_STEP = /layering|lint:arch/i;

const slug = (name) =>
  String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'job';

const jobKey = (name) => JOB_KEYS.get(name) ?? slug(name);

/**
 * PASS only for a literal `success`. Everything else — failure, cancelled, timed_out — is
 * FAIL, because constraint 2 needs the string to appear whenever the run did not pass, and
 * a cancelled job is not evidence that anything held.
 */
const passFail = (conclusion) => (conclusion === 'success' ? 'PASS' : 'FAIL');

function jobsOf(ghRun, done = true) {
  const jobs = {};
  for (const job of ghRun.jobs ?? []) {
    // A job still running has `conclusion: null`, which is not a failure. Only a completed
    // run's jobs are classified at all; anything else would put a FAIL in the record for a
    // job that has not yet had the chance to pass.
    if (!done && job.status !== 'completed') continue;
    jobs[jobKey(job.name)] = passFail(job.conclusion);
  }
  return jobs;
}

/**
 * "pass" | "fail" | "not-run" — lowercase, because check.mjs compares `=== 'pass'` and
 * because "FAIL" here would break constraint 2 on a run that was green everywhere else.
 * `not-run` is the honest answer for a run predating the phase-4 block: the step is absent,
 * so nothing was checked, and a `pass` there would be the exact silence C4 must not record.
 */
function depcruiseOf(ghRun) {
  for (const job of ghRun.jobs ?? []) {
    for (const step of job.steps ?? []) {
      if (LAYERING_STEP.test(step.name ?? '')) {
        return step.conclusion === 'success' ? 'pass' : 'fail';
      }
    }
  }
  return 'not-run';
}

/** "success" | "failure" | "not-applicable" — lowercase, per constraint 2. */
function redProofOf(ghRun) {
  const job = (ghRun.jobs ?? []).find((candidate) => jobKey(candidate.name) === 'red-proof');
  if (job === undefined) return 'not-applicable';
  return job.conclusion === 'success' ? 'success' : 'failure';
}

/**
 * One `gh` run object → one `check.run` record. Pure: no clock, no filesystem, no network.
 *
 * @param {object} ghRun  a run as `gh run list --json …` / `gh run view --json …` emits it
 * @param {{ slice: string, collectedVia: 'gh-cli' | 'run-artifact' }} opts
 */
export function toCheckRunRecord(ghRun, { slice, collectedVia }) {
  // `gh` reports an unfinished run as `conclusion: ""` — an empty STRING, so `??` does not
  // fall through it. Found by running this against a live branch: the record for a run
  // still executing came back `conclusion: ""` with every job FAIL, which would have put a
  // fabricated failure into the log and, through constraint 2, into C1's red-before-green
  // reading. The CLI skips unfinished runs outright; this is the second line of defence.
  const done = ghRun.status === 'completed';
  const conclusion = (ghRun.conclusion || undefined) ?? ghRun.status ?? 'unknown';
  const jobs = jobsOf(ghRun, done);

  // Constraint 2, enforced rather than assumed. A COMPLETED run whose conclusion is a
  // failure and whose every job reads PASS would stringify without FAIL and be read as
  // green by the gate; that is the corruption this whole section exists to prevent. It is
  // deliberately conditioned on `done`: a run that has not finished has not failed.
  if (done && conclusion !== 'success' && !Object.values(jobs).includes('FAIL')) {
    jobs[jobKey(ghRun.workflowName ?? 'run')] = 'FAIL';
  }

  return {
    // Constraint 5. NEVER `new Date()`: schema.mjs fills an omitted ts with *now*, which
    // collapses a red run and its later green run onto the same instant.
    ts: ghRun.updatedAt,
    slice,
    event: 'check.run',
    source: 'derived',
    outcome: conclusion,
    checks: {
      run_id: ghRun.databaseId,
      head_sha: ghRun.headSha,
      workflow: ghRun.workflowName,
      conclusion,
      collected_via: collectedVia,
      depcruise: depcruiseOf(ghRun),
      red_proof: redProofOf(ghRun),
      jobs,
    },
    git: { commits: [ghRun.headSha].filter(Boolean) },
    message: ghRun.url,
  };
}

/**
 * A list of runs → records in the order the log must receive them (constraint 4).
 *
 * The sort is the entire reason this export exists. `gh run list` is newest-first and
 * `check.mjs` reads `runs.at(-1)`, so appending in gh order judges the newest run by the
 * oldest record. Pure, so the property is testable without a log or a network call.
 */
export function toCheckRunRecords(ghRuns, opts) {
  return [...(ghRuns ?? [])]
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
    .map((run) => toCheckRunRecord(run, opts));
}

// ─────────────────────────────────────────────────────────────────── the CLI wrapper ──
//
// Everything below is I/O: invoking gh, reading docs/team-log/.scope, and skipping runs
// already in the log. None of it can be pure and none of it belongs above.

const RUN_FIELDS = 'databaseId,headSha,conclusion,status,workflowName,updatedAt,url,event';

function parseArgs(argv) {
  const args = { limit: 20, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--branch') { args.branch = value; i += 1; }
    else if (flag === '--run') { args.run = value; i += 1; }
    else if (flag === '--slice') { args.slice = value; i += 1; }
    else if (flag === '--from-file') { args.fromFile = value; i += 1; }
    else if (flag === '--limit') { args.limit = Number(value); i += 1; }
    else if (flag === '--dry-run') { args.dryRun = true; }
    else return { error: `unknown argument: ${flag}` };
  }
  return args;
}

/**
 * A slice id: two digits and an optional letter, `00a` or `07`. Checked, because the log
 * schema is not going to check it — `validate()` accepts any non-empty string for `slice`,
 * so a malformed value is written silently and every query scoped to the slice then misses
 * it. Found the hard way: reading `.scope` raw produced `slice: "{\"slice\":\"00a\"}"`,
 * a record that validated cleanly and was scoped to a slice that does not exist.
 */
const SLICE_ID = /^\d{2}[a-z]?$/;

/**
 * `--slice`, else `docs/team-log/.scope` — which holds JSON, `{"slice":"00a"}` or
 * `{"phase":"2"}`, exactly as `.claude/hooks/log-agent-finish.mjs` writes and reads it.
 * It is NOT a bare id, and treating it as one is how the malformed record above happened.
 */
function resolveSlice(explicit) {
  if (explicit) return explicit;

  const marker = resolve('docs/team-log/.scope');
  if (!existsSync(marker)) return undefined;
  try {
    const scope = JSON.parse(readFileSync(marker, 'utf8'));
    return scope?.slice === undefined ? undefined : String(scope.slice);
  } catch {
    return undefined;
  }
}

/**
 * A collector that degrades to a guess is worse than one that stops: gh missing,
 * unauthenticated or offline exits 2 naming the cause, and nothing is appended.
 */
function gh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error?.code === 'ENOENT') {
    throw new Error('the GitHub CLI (`gh`) is not installed or not on PATH');
  }
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(' ')} exited ${result.status}: ${(result.stderr ?? '').trim()}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`gh ${args.join(' ')} did not return JSON`);
  }
}

function currentBranch() {
  const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

/**
 * A payload previously produced by gh, or a run-summary artifact. Accepts the shapes those
 * actually take rather than one canonical envelope: a bare run, `{ run }`, `{ runs }` or an
 * array of runs.
 */
function readFromFile(path) {
  const parsed = JSON.parse(readFileSync(resolve(path), 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.runs)) return parsed.runs;
  if (parsed.run) return [parsed.run];
  if (parsed.databaseId !== undefined) return [parsed];
  throw new Error(`${path} holds no run — expected a gh run payload, { run }, { runs } or an array`);
}

function collectFromGh(args) {
  if (args.run) return [gh(['run', 'view', String(args.run), '--json', `${RUN_FIELDS},jobs`])];

  const branch = args.branch ?? currentBranch();
  if (!branch) throw new Error('could not determine a branch; pass --branch');

  const runs = gh([
    'run', 'list', '--branch', branch, '--limit', String(args.limit), '--json', RUN_FIELDS,
  ]);
  // Per-job detail is a second call: `gh run list` does not return jobs, and `checks.jobs`
  // is what constraint 2 rests on.
  return runs.map((run) => ({
    ...run,
    ...gh(['run', 'view', String(run.databaseId), '--json', 'jobs']),
  }));
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.error) {
    console.error(`collect-ci: ${args.error}`);
    return 2;
  }

  const slice = resolveSlice(args.slice);
  if (!slice) {
    console.error(
      'collect-ci: no slice. Pass --slice, or put {"slice":"00a"} in docs/team-log/.scope.',
    );
    return 2;
  }
  if (!SLICE_ID.test(slice)) {
    console.error(
      `collect-ci: ${JSON.stringify(slice)} is not a slice id (two digits, optional letter). ` +
        'The log schema would accept it and every query scoped to the slice would then miss it.',
    );
    return 2;
  }

  let runs;
  const collectedVia = args.fromFile ? 'run-artifact' : 'gh-cli';
  try {
    runs = args.fromFile ? readFromFile(args.fromFile) : collectFromGh(args);
  } catch (error) {
    console.error(`collect-ci: ${error.message}`);
    console.error('nothing was appended.');
    return 2;
  }

  // A verdict on a run that has not finished is not a measurement. Skipped loudly rather
  // than silently, because "collect at the gate" is a thing someone does while a run is
  // still going and the omission should be visible.
  const finished = [];
  for (const run of runs) {
    if (run.status === 'completed') finished.push(run);
    else console.log(`skipped  ${run.databaseId}  still ${run.status ?? 'unfinished'}`);
  }

  const records = toCheckRunRecords(finished, { slice, collectedVia });

  // Idempotence lives here and only here: it needs the log, which is I/O. `log:audit`'s
  // OMISSION reconciliation depends on this being safe to re-run at every gate.
  const known = new Set(
    loadLog()
      .filter((e) => e.event === 'check.run')
      .map((e) => e.checks?.run_id)
      .filter((id) => id !== undefined),
  );

  const fresh = [];
  for (const record of records) {
    if (known.has(record.checks.run_id)) {
      console.log(`skipped  ${record.checks.run_id}  already in the log`);
    } else {
      fresh.push(record);
      known.add(record.checks.run_id);
    }
  }

  if (fresh.length === 0) {
    console.log('nothing new to append.');
    return 0;
  }

  if (args.dryRun) {
    for (const record of fresh) console.log(JSON.stringify(record));
    console.log(`--dry-run: ${fresh.length} record(s) NOT appended.`);
    return 0;
  }

  try {
    for (const record of appendRecords(fresh, { allowDerived: true })) {
      console.log(`logged   ${record.checks.run_id}  ${record.checks.conclusion}  ${record.ts}`);
    }
  } catch (error) {
    console.error(`collect-ci: ${error.message}`);
    console.error('nothing was appended.');
    return 1;
  }
  return 0;
}

// Importable without side effects: the tool test imports this module for its two pure
// exports, and a CLI that ran on import would append to the log during a test run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
