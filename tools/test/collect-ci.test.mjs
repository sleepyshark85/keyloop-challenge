#!/usr/bin/env node
/**
 * Tests for tools/team-log/collect-ci.mjs (ADR-0010 Decision 2, AC-5).
 *
 *   node tools/test/collect-ci.test.mjs
 *
 * AUTHORED BY THE TEST-ENGINEER, and at the red commit deliberately NOT wired into
 * `npm run test:tools` (docs/slices/00a-design.md §11.4). `test:tools` is a literal `&&`
 * chain of named files, so a new file here does not run in CI until someone wires it in.
 * Two things depended on that: criterion C2 held for AC-5 instead of being excepted, and the
 * `verify` job stayed green on the red commit — which §7 needed twice over, because a
 * failure here would abort `verify` before the run observing the red was complete.
 *
 * NOW WIRED IN, and the delay cost something worth recording. While unwired this file never
 * ran, so an assertion it carried — "a green→red pair is not test-first", fed the red→green
 * pair in reversed array order — went four commits without anyone discovering that NO
 * correct collector could satisfy it (see the DoD-predicate block below). An outside-in test
 * that cannot run is indistinguishable from one that passes. That is the same failure the
 * design's §5 table names three times over: an exit code standing in for work never done.
 *
 * The reviewer's step-5 checklist carries the line that closes the hole generally: every
 * file matching tools/test/*.test.mjs must be named in the `test:tools` chain by merge.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * WHAT IS ACTUALLY BEING PROTECTED
 *
 * Not "does the collector run". Five constraints imposed by the CONSUMER,
 * tools/slice/check.mjs, none of which is visible from the schema, and each of which makes
 * the Definition of Done silently wrong when broken (§6):
 *
 *   1  checks.depcruise is the LOWERCASE string "pass"          — compared by equality
 *   2  JSON.stringify(checks) contains "FAIL" IFF the run failed — the red/green predicate
 *   3  no ratio strings anywhere in checks                       — `\b0\/` reads "0/0" as red
 *   4  records are appended OLDEST-RUN-FIRST                     — check.mjs:113 is runs.at(-1)
 *   5  ts is the run's updatedAt, never the collection time      — check.mjs:100 compares strictly
 *
 * Fixtures under tools/test/fixtures/ carry their own provenance header. Only the GREEN
 * pre-00a payload is capturable today: a run in which the acceptance suite failed while
 * verify passed cannot exist in this repository until a red commit runs under the test job,
 * which is the commit this file lands in. The other two say DERIVED in as many words.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validate } from '../team-log/schema.mjs';

const MODULE = '../team-log/collect-ci.mjs';

let passed = 0;
let failed = 0;
const check = (desc, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ok    ${desc}`); }
  else { failed++; console.log(`FAIL    ${desc}${detail ? `\n          ${detail}` : ''}`); }
};

const fixture = (name) =>
  JSON.parse(readFileSync(resolve('tools/test/fixtures', name), 'utf8'));

const CAPTURED_GREEN = fixture('gh-run-verify-green.captured.json');
const DERIVED_RED = fixture('gh-run-red.derived.json');
const DERIVED_GREEN = fixture('gh-run-green.derived.json');

// ─────────────────────────────────────────────── the predicate the DoD actually uses ──
//
// The fourth assertion in §6's list says the two records must be fed to "the same predicate
// the DoD uses". Reimplementing check.mjs's regex here would be a test of this file's
// opinion, so the regex is EXTRACTED FROM tools/slice/check.mjs's source instead: if that
// literal ever changes, the extraction changes with it and these assertions follow.
const CHECK_SOURCE = readFileSync(resolve('tools/slice/check.mjs'), 'utf8');
const REDNESS_LITERAL = CHECK_SOURCE.match(/\/FAIL\|(?:\\.|[^/\\])*\//)?.[0];
const redness = REDNESS_LITERAL
  ? new RegExp(REDNESS_LITERAL.slice(1, -1))
  : null;

/** check.mjs:99-101, applied to a log slice. Positional order, strict timestamp compare. */
const classifyRedBeforeGreen = (records) => {
  const runs = records.filter((e) => e.event === 'check.run');
  const failing = runs.find((e) => redness.test(JSON.stringify(e.checks ?? {})));
  const passingAfter =
    failing &&
    runs.find(
      (e) =>
        Date.parse(e.ts) > Date.parse(failing.ts) &&
        !redness.test(JSON.stringify(e.checks ?? {})),
    );
  return Boolean(failing && passingAfter);
};

// ──────────────────────────────────────────────────────────────────────────── cases ──

const collector = await import(MODULE).catch((error) => {
  check(`tools/team-log/collect-ci.mjs is importable`, false, String(error?.message ?? error));
  return null;
});

if (collector) {
  const { toCheckRunRecord, toCheckRunRecords } = collector;

  check('exports a pure toCheckRunRecord(ghRun, { slice, collectedVia })',
    typeof toCheckRunRecord === 'function',
    'the gh invocation belongs in the CLI wrapper; the mapping must be testable without it');

  check('exports toCheckRunRecords(ghRuns, { slice, collectedVia }) for a multi-run payload',
    typeof toCheckRunRecords === 'function',
    'constraint 4 is a property of a LIST of runs, so the ordering has to be testable as one');

  if (typeof toCheckRunRecord === 'function') {
    const opts = { slice: '00a', collectedVia: 'gh-cli' };
    const green = toCheckRunRecord(DERIVED_GREEN.run, opts);
    const red = toCheckRunRecord(DERIVED_RED.run, opts);
    const preSlice = toCheckRunRecord(CAPTURED_GREEN.run, opts);

    // -- the record itself -------------------------------------------------------------
    for (const [label, record] of [['green', green], ['red', red], ['captured', preSlice]]) {
      const { ok, errors } = validate(record);
      check(`the ${label} record validates against schema.mjs`, ok, (errors ?? []).join('; '));
      check(`the ${label} record is event check.run, source derived, slice 00a`,
        record?.event === 'check.run' && record?.source === 'derived' && record?.slice === '00a',
        JSON.stringify({ event: record?.event, source: record?.source, slice: record?.slice }));
      check(`the ${label} record names run id, head SHA and workflow (AC-5)`,
        typeof record?.checks?.run_id === 'number'
          && typeof record?.checks?.head_sha === 'string'
          && typeof record?.checks?.workflow === 'string',
        JSON.stringify(record?.checks));
      check(`the ${label} record records its provenance in checks.collected_via`,
        record?.checks?.collected_via === 'gh-cli',
        'a --from-file replay must be distinguishable from a live collection in the log');
    }

    // -- constraint 2, in BOTH directions ----------------------------------------------
    check('the redness predicate was extracted from tools/slice/check.mjs',
      redness !== null, 'could not find the /FAIL|…/ literal — check.mjs changed shape');
    check('constraint 2 — a FAILED run stringifies to something containing FAIL',
      /FAIL/.test(JSON.stringify(red?.checks ?? {})),
      JSON.stringify(red?.checks));
    check('constraint 2 — a PASSED run stringifies to something containing no FAIL',
      !/FAIL/.test(JSON.stringify(green?.checks ?? {})),
      'including in a field named for a failure concept — hence red_proof: "success", lowercase, '
      + `and not "NOT-FAILED". got ${JSON.stringify(green?.checks)}`);
    check('constraint 2 — a failed run also carries a FAIL among checks.jobs',
      Object.values(red?.checks?.jobs ?? {}).includes('FAIL'),
      'depcruise: "fail" alone is not sufficient signal');
    check('constraint 2 — jobs values are the uppercase PASS/FAIL the predicate reads',
      Object.values({ ...(red?.checks?.jobs ?? {}), ...(green?.checks?.jobs ?? {}) })
        .every((v) => v === 'PASS' || v === 'FAIL'),
      JSON.stringify({ red: red?.checks?.jobs, green: green?.checks?.jobs }));

    // -- constraint 1 -------------------------------------------------------------------
    check('constraint 1 — checks.depcruise is the lowercase string "pass" on a green run',
      green?.checks?.depcruise === 'pass',
      `check.mjs compares it by equality for the layering-clean check; got `
      + `${JSON.stringify(green?.checks?.depcruise)}`);

    // -- constraint 3 -------------------------------------------------------------------
    const ratios = Object.entries(green?.checks ?? {})
      .concat(Object.entries(red?.checks ?? {}))
      .filter(([, v]) => typeof v === 'string' && /\d+\s*\/\s*\d+/.test(v));
    check('constraint 3 — no ratio strings anywhere in checks',
      ratios.length === 0,
      `\\b0\\/ in a value like "0/0 skipped" classifies a green run as red. found `
      + JSON.stringify(ratios));

    // -- constraint 5 -------------------------------------------------------------------
    check('constraint 5 — ts is the run\'s updatedAt, not the collection time',
      red?.ts === DERIVED_RED.run.updatedAt && green?.ts === DERIVED_GREEN.run.updatedAt,
      `schema.mjs:137 does out.ts ??= new Date().toISOString(), so an omitted ts silently `
      + `becomes *now*, both records get near-identical timestamps, check.mjs's strict > `
      + `fails, and C1 reports FAIL on a correctly test-first slice. got `
      + `${JSON.stringify({ red: red?.ts, green: green?.ts })}`);

    // -- the DoD predicate, on a log -----------------------------------------------------
    //
    // C1 and its inverse. The inverse needs a green run whose ts PRECEDES the red's, which
    // the red→green pair cannot supply in either array order: check.mjs finds `failing` by
    // regex (uniquely determined when the log holds one red) and then `passingAfter` by a
    // strict timestamp compare, so reordering those two records cannot change the verdict.
    //
    // The green that precedes the red is the CAPTURED pre-00a run — a real verify run of
    // 2026-09-04, against a red derived to 2026-09-05. It is used rather than a third
    // derived fixture on purpose: a captured payload that already has the property is
    // better evidence than one hand-edited until the assertion comes out right.
    //
    // That ordering is a PRECONDITION of the inverse, so it is asserted rather than assumed.
    // Design §5's rule — no assertion about a verdict without a prior assertion that the
    // thing being judged is what you think it is — applies to this file too: recapture the
    // fixture from a later run and the inverse case would start passing vacuously.
    if (redness) {
      check('fixture precondition — the captured green run precedes the derived red run',
        Date.parse(preSlice?.ts) < Date.parse(red?.ts)
          && Date.parse(red?.ts) < Date.parse(green?.ts),
        JSON.stringify({ captured: preSlice?.ts, red: red?.ts, green: green?.ts }));

      check('slice:check classifies the red→green pair as test-first',
        classifyRedBeforeGreen([red, green]),
        'this is the criterion the whole slice exists to make passable');
      check('slice:check does NOT classify a green-only log as test-first',
        !classifyRedBeforeGreen([green]),
        'a slice with no recorded red must not read as red-before-green');

      // C1's inverse, and the case that actually protects the criterion.
      check('slice:check does NOT classify green-then-red as test-first',
        !classifyRedBeforeGreen([preSlice, red]),
        'a green run PRECEDING the red is implementation-first. The existence of a passing '
        + 'run is not the criterion; its position in time is');
      check('…and that verdict is decided by ts, not by array position',
        !classifyRedBeforeGreen([red, preSlice]),
        'the same two records reordered must give the same answer. The earlier form of this '
        + 'assertion fed the red→green pair reversed and expected FALSE — unsatisfiable by '
        + 'any correct collector, and it went unnoticed because this file was not yet named '
        + 'in the `test:tools` chain and therefore never ran');
      check('an earlier green does not spoil a genuine red→green',
        classifyRedBeforeGreen([preSlice, red, green]),
        'a branch whose CI was green before its red commit is still test-first for that '
        + 'red; C1 must not be defeated by unrelated history in the log');
    }
  }

  // -- constraint 4 ---------------------------------------------------------------------
  if (typeof toCheckRunRecords === 'function') {
    // gh run list returns NEWEST FIRST. A collector that appends in gh order judges "tests
    // green" on a stale run, because check.mjs:113 is `runs.at(-1)` — positional in log
    // order, not by timestamp. Invisible in a single-run collection; it appears the first
    // time anyone collects a backlog at a gate, which is exactly when it is trusted.
    const newestFirst = [DERIVED_GREEN.run, DERIVED_RED.run];
    const records = toCheckRunRecords(newestFirst, { slice: '00a', collectedVia: 'gh-cli' });
    const timestamps = (records ?? []).map((r) => r.ts);

    check('constraint 4 — records come back ascending by ts from a newest-first payload',
      timestamps.length === 2
        && Date.parse(timestamps[0]) < Date.parse(timestamps[1]),
      JSON.stringify(timestamps));
    check('constraint 4 — the LAST record is the newest run, so "tests green" reads it',
      records?.at(-1)?.checks?.run_id === DERIVED_GREEN.run.databaseId,
      JSON.stringify(records?.map((r) => r.checks?.run_id)));
    check('constraint 4 + 5 — each record\'s ts equals its own run\'s updatedAt',
      records?.[0]?.ts === DERIVED_RED.run.updatedAt
        && records?.[1]?.ts === DERIVED_GREEN.run.updatedAt,
      JSON.stringify(records?.map((r) => r.ts)));
  }

  // -- conformance: the job names in verify.yml and the keys the DoD reads ---------------
  //
  // A SIXTH constraint, and it is the shape this slice keeps producing: a constraint imposed
  // in one place and enforced in another that is never run. `collect-ci.mjs` maps a job's
  // DISPLAY NAME to the key it records under; `.github/workflows/verify.yml` owns those
  // display names; nothing connects them. Rename `name: docs, tools and log integrity`
  // today and the mapping falls through to the slug, `checks.jobs.verify` silently becomes
  // `checks.jobs["docs-tools-and-log-integrity"]`, and every consumer that reads the old key
  // reads `undefined` — a green nothing, not an error.
  //
  // Asserted BEHAVIOURALLY, through toCheckRunRecord, rather than by importing the map: the
  // observable contract is the key that lands in the record, and a test that reads the
  // internal constant would still pass if the record stopped using it. No YAML parser — the
  // block is scanned by indentation, which is enough for a two-level structure and adds no
  // dependency to a repository whose point is that its tooling runs offline.
  const WORKFLOW = '.github/workflows/verify.yml';
  const workflowJobs = (() => {
    const lines = readFileSync(resolve(WORKFLOW), 'utf8').split('\n');
    const start = lines.findIndex((line) => line === 'jobs:');
    if (start === -1) return [];
    const jobs = [];
    for (const line of lines.slice(start + 1)) {
      if (/^\S/.test(line)) break;                       // a new top-level key ends `jobs:`
      const key = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);  // `  red-proof:`
      if (key) { jobs.push({ key: key[1], name: null }); continue; }
      const name = /^    name:\s*(\S.*?)\s*$/.exec(line); // `    name: red-proof`
      if (name && jobs.length > 0 && jobs.at(-1).name === null) jobs.at(-1).name = name[1];
    }
    return jobs;
  })();

  // Coverage before verdict, again: a regex that matched nothing would make every assertion
  // below vacuously true, which is the exact defect this case exists to prevent elsewhere.
  check('conformance precondition — verify.yml parsed, every job carrying a display name',
    workflowJobs.length >= 3 && workflowJobs.every((job) => typeof job.name === 'string'),
    `scanned ${WORKFLOW} and found ${JSON.stringify(workflowJobs)}`);

  if (workflowJobs.length >= 3 && typeof toCheckRunRecord === 'function') {
    const record = toCheckRunRecord(
      {
        ...DERIVED_GREEN.run,
        jobs: workflowJobs.map((job) => ({
          name: job.name, conclusion: 'success', status: 'completed', steps: [],
        })),
      },
      { slice: '00a', collectedVia: 'gh-cli' },
    );

    check('every job in verify.yml records under its own YAML key',
      JSON.stringify(Object.keys(record?.checks?.jobs ?? {}))
        === JSON.stringify(workflowJobs.map((job) => job.key)),
      `a display name with no mapping falls through to the slug, so the key drifts silently `
      + `and the old one reads undefined. workflow ${JSON.stringify(
        workflowJobs.map((job) => `${job.key} = ${job.name}`))}, recorded ${JSON.stringify(
        Object.keys(record?.checks?.jobs ?? {}))}`);

    check('…including the two keys the Definition of Done reads by name',
      record?.checks?.jobs?.verify === 'PASS' && record?.checks?.jobs?.test === 'PASS',
      `check.mjs reads jobs.verify for "tests green" and §7 reads jobs.test; a rename that `
      + `moved either is a silent DoD failure. got ${JSON.stringify(record?.checks?.jobs)}`);
  }

  // -- an UNFINISHED run is not a measurement -------------------------------------------
  //
  // Every fixture in this file is `status: "completed"`, so the skip and the `done`
  // conditioning inside toCheckRunRecord are both unexercised: delete either and nothing
  // here fails. This protects C1 directly. The implementer shipped it broken once — `gh`
  // reports a running run as `conclusion: ""`, an empty STRING, which `??` does not fall
  // through, so every job came back FAIL and a fabricated red run would have gone into the
  // log and into check.mjs's red-before-green reading. A red that never happened is worse
  // than a missing one: C1 would report test-first for a slice that was not.
  //
  // Derived from the green fixture rather than captured, because a payload mid-run cannot be
  // captured after the fact — but the two fields that matter, `conclusion: ""` alongside
  // `status: "in_progress"`, are the shape the implementer measured against a live branch.
  if (typeof toCheckRunRecord === 'function') {
    const unfinishedRun = {
      ...DERIVED_GREEN.run,
      status: 'in_progress',
      conclusion: '',
      jobs: (DERIVED_GREEN.run.jobs ?? []).map((job) => ({
        ...job, status: 'in_progress', conclusion: null,
      })),
    };

    check('fixture precondition — the run is unfinished and its conclusion is the EMPTY STRING',
      unfinishedRun.status === 'in_progress'
        && unfinishedRun.conclusion === ''
        && unfinishedRun.jobs.every((job) => job.conclusion === null),
      'null instead of "" would fall through `??` and test a different bug than the one '
      + 'that shipped');

    const running = toCheckRunRecord(unfinishedRun, { slice: '00a', collectedVia: 'gh-cli' });

    check('an unfinished run classifies NO job, so nothing reads as failed',
      JSON.stringify(running?.checks?.jobs) === '{}',
      `a job with conclusion null has not failed, it has not finished. passFail() maps every `
      + `non-success to FAIL, so classifying an unfinished job invents a failure. got `
      + JSON.stringify(running?.checks?.jobs));

    check('an unfinished run carries no FAIL anywhere in checks (constraint 2)',
      !/FAIL/.test(JSON.stringify(running?.checks ?? {})),
      `check.mjs decides red-before-green by /FAIL|\\b0\\// over this string, so a FAIL here `
      + `is a red run that never happened. got ${JSON.stringify(running?.checks)}`);

    check('an unfinished run\'s conclusion is its STATUS, not the empty string',
      running?.checks?.conclusion === 'in_progress' && running?.outcome === 'in_progress',
      `\`ghRun.conclusion ?? ghRun.status\` keeps "" — it is not nullish — and "" !== `
      + `"success", so the completed-run backstop then injects a FAIL. got `
      + JSON.stringify({ outcome: running?.outcome, conclusion: running?.checks?.conclusion }));
  }

  // -- ON A KEY COLLISION, FAIL WINS ----------------------------------------------------
  //
  // Two display names can slug to one key — a matrix, a rename, any two names differing only
  // in punctuation. A plain assignment is last-write-wins, so a later PASS overwrites an
  // earlier FAIL and the record stringifies without it: constraint 2 corrupted inside the
  // function written to enforce it.
  //
  // BOTH ARRAY ORDERS, AND ONLY ONE OF THEM DOES THE WORK. Measured against
  // `jobs[key] = verdict`: failure-first gives PASS (caught), failure-last gives FAIL
  // (passes anyway, because last-write-wins happens to write the FAIL last). So one order
  // is a real test and the other is a coin that landed the right way up, and there is
  // nothing in the case itself to say which. Do not "simplify" this to a single order.
  if (typeof toCheckRunRecord === 'function') {
    const collidingJobs = [
      { name: 'suite (linux)', status: 'completed', conclusion: 'failure', steps: [] },
      { name: 'suite [linux]', status: 'completed', conclusion: 'success', steps: [] },
    ];

    const keysFor = (jobs) => Object.keys(toCheckRunRecord(
      { ...DERIVED_GREEN.run, conclusion: 'success', jobs },
      { slice: '00a', collectedVia: 'gh-cli' },
    ).checks.jobs);

    check('fixture precondition — the two display names really do collide on one key',
      keysFor(collidingJobs).length === 1,
      `if they stopped colliding there would be two keys, both assertions below would pass `
      + `trivially, and the rule would be untested again. got `
      + JSON.stringify(keysFor(collidingJobs)));

    for (const [label, jobs] of [
      ['failure first', collidingJobs],
      ['failure LAST', [...collidingJobs].reverse()],
    ]) {
      const collided = toCheckRunRecord(
        // conclusion `success` on purpose: it disables the completed-run backstop that would
        // otherwise inject a FAIL under the workflow key, so a FAIL here can only have come
        // from the collision rule itself.
        { ...DERIVED_GREEN.run, conclusion: 'success', jobs },
        { slice: '00a', collectedVia: 'gh-cli' },
      );
      check(`a job-key collision keeps the FAIL — ${label}`,
        collided?.checks?.jobs?.['suite-linux'] === 'FAIL',
        `last-write-wins loses the failing job and the run reads green at the gate. got `
        + JSON.stringify(collided?.checks?.jobs));
      check(`…and the FAIL came from the collision, not from the backstop — ${label}`,
        JSON.stringify(Object.keys(collided?.checks?.jobs ?? {})) === '["suite-linux"]',
        `an extra key would mean the run-level injection fired and the collision rule could `
        + `still be broken. got ${JSON.stringify(collided?.checks?.jobs)}`);
    }
  }
}

// ── the CLI wrapper: main() is where the slice and the skip actually happen ────────────
//
// Everything above tests the two pure exports. `main()` was untested in its entirety, and it
// holds two rules that fail SILENTLY and write to the log while doing it. Both are driven
// here through `--dry-run`, which computes and prints every record and appends none — so
// these cases exercise the real CLI without touching docs/team-log/.
//
// `loadLog()` and `resolveSlice()` both resolve their paths from the CURRENT WORKING
// DIRECTORY, so each case runs in a scratch directory of its own. That is not a workaround:
// it is the only way to reach `.scope` parsing without writing to the repository's own.

const scratch = mkdtempSync(join(tmpdir(), 'collect-ci-'));

const runsFile = (label, runs) => {
  const path = join(scratch, `${label}.json`);
  writeFileSync(path, JSON.stringify({ runs }, null, 2));
  return path;
};

const cli = (args, cwd) =>
  spawnSync(process.execPath, [resolve('tools/team-log/collect-ci.mjs'), ...args], {
    cwd, encoding: 'utf8',
  });

const workdir = (label, scope) => {
  const dir = join(scratch, label);
  mkdirSync(join(dir, 'docs/team-log'), { recursive: true });
  if (scope !== undefined) writeFileSync(join(dir, 'docs/team-log/.scope'), scope);
  return dir;
};

const mixedRuns = runsFile('mixed', [
  { ...DERIVED_GREEN.run, status: 'in_progress', conclusion: '', databaseId: 44400001,
    jobs: (DERIVED_GREEN.run.jobs ?? []).map((job) => ({
      ...job, status: 'in_progress', conclusion: null,
    })) },
  DERIVED_RED.run,
]);

// -- main()'s unfinished-run skip -------------------------------------------------------
{
  const result = cli(
    ['--from-file', mixedRuns, '--slice', '00a', '--dry-run'],
    workdir('skip', undefined),
  );
  const stdout = result.stdout ?? '';

  check('CLI precondition — a --dry-run collection succeeds and prints its records',
    result.status === 0 && stdout.includes('--dry-run'),
    `every assertion below reads this output, so an exit 2 here would make them all vacuous. `
    + `got ${result.status}\n          stdout ${stdout.trim()}\n          stderr `
    + `${(result.stderr ?? '').trim()}`);

  check('main() SKIPS the unfinished run, and says so rather than dropping it silently',
    /skipped\s+44400001\s+still in_progress/.test(stdout),
    `"collect at the gate" is something a human does while a run is still going, so the `
    + `omission has to be visible. got ${JSON.stringify(stdout.trim())}`);

  check('…and no record is emitted for it',
    !stdout.includes('44400001,') && !stdout.includes('"run_id":44400001'),
    `delete the filter and toCheckRunRecord's own \`done\` guard is the only thing left `
    + `between a running build and a fabricated verdict in the log. got `
    + JSON.stringify(stdout.trim()));

  check('…while the FINISHED run in the same payload is still collected',
    stdout.includes(`"run_id":${DERIVED_RED.run.databaseId}`),
    `a skip that dropped everything would satisfy the case above. got `
    + JSON.stringify(stdout.trim()));
}

// -- resolveSlice: .scope holds JSON, and SLICE_ID is the backstop ----------------------
//
// Reading `.scope` raw produced `slice: "{\"slice\":\"00a\"}"`, which validate() ACCEPTS —
// the schema takes any non-empty string — so the record was written, looked fine, and every
// slice-scoped query missed it. Two independent rules, so two cases: the parse, and the
// guard that catches the parse being wrong again.
{
  const parsed = cli(
    ['--from-file', runsFile('one', [DERIVED_RED.run]), '--dry-run'],
    workdir('scope', '{"slice":"00a"}\n'),
  );
  check('main() reads docs/team-log/.scope as JSON, not as a bare id',
    parsed.status === 0 && (parsed.stdout ?? '').includes('"slice":"00a"'),
    `a raw read yields slice "{\\"slice\\":\\"00a\\"}", which the schema accepts and every `
    + `query then misses. got ${parsed.status}\n          stdout `
    + `${(parsed.stdout ?? '').trim()}\n          stderr ${(parsed.stderr ?? '').trim()}`);

  const malformed = cli(
    ['--from-file', runsFile('two', [DERIVED_RED.run]), '--slice', '{"slice":"00a"}', '--dry-run'],
    workdir('malformed', undefined),
  );
  check('SLICE_ID rejects a slice the log schema would have accepted',
    malformed.status === 2 && /not a slice id/i.test(malformed.stderr ?? ''),
    `this is the backstop for the bug above, and it is the only thing standing between a `
    + `malformed slice and a silently unqueryable log. got ${malformed.status}\n`
    + `          stderr ${(malformed.stderr ?? '').trim()}`);

  const noScope = cli(
    ['--from-file', runsFile('three', [DERIVED_RED.run]), '--dry-run'],
    workdir('none', undefined),
  );
  check('no --slice and no .scope → exit 2 naming both ways to supply one',
    noScope.status === 2 && /--slice/.test(noScope.stderr ?? '') && /\.scope/.test(noScope.stderr ?? ''),
    `guessing a slice would put the record under the wrong one. got ${noScope.status}\n`
    + `          stderr ${(noScope.stderr ?? '').trim()}`);
}

rmSync(scratch, { recursive: true, force: true });

// -- fixture provenance is part of the evidence, not decoration -------------------------
check('the captured fixture says it was captured, and names the run it came from',
  CAPTURED_GREEN._fixture?.provenance === 'CAPTURED'
    && typeof CAPTURED_GREEN._fixture?.run_id === 'number'
    && typeof CAPTURED_GREEN._fixture?.url === 'string',
  'a fixture captured from the tool beats a fixture that encodes someone\'s belief about it');
check('both derived fixtures say DERIVED in as many words',
  DERIVED_RED._fixture?.provenance === 'DERIVED'
    && DERIVED_GREEN._fixture?.provenance === 'DERIVED',
  'a derived fixture labelled derived is honest; two hand-authored fixtures described as '
  + 'captured are not');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
