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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
}

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
