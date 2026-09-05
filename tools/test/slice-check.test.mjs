#!/usr/bin/env node
/**
 * `slice:check` is what says a slice is done. These cases exist because it was
 * reading a record that did not mean what it assumed — twice.
 *
 * `check.run` carries two kinds of record: a CI run, which reports whether tests
 * ran, and a mutation score, which does not. Reading them alike let a mutation
 * record satisfy "tests green" and stand in as the green half of red-before-green.
 * Recorded as O-6 at slice 00a, deferred with a sequencing workaround — "append
 * the CI run last" — and it recurred at slice 00 the first time the orchestrator
 * forgot. A guard whose only enforcement is discipline is the shape this project
 * has now catalogued eight times.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CHECK = join(ROOT, 'tools/slice/check.mjs');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const SLICE = `---
id: "77"
title: fixture
status: ready
depends_on: []
arc42: ["§1"]
quality_scenarios: [QS-1]
loopbacks: 0
---

## Acceptance criteria

- **AC-1** — Given a thing, when it happens, then it holds.
`;

// `head_sha` defaults to the fixture's HEAD, so a case that is about something else
// does not silently become a case about O-17. Pass `head_sha` explicitly to make it one.
const ciRun = (over = {}) => (sha) => ({
  ts: '2026-01-01T00:00:00Z', slice: '77', event: 'check.run', source: 'derived',
  ...over,
  checks: { run_id: 1, conclusion: 'success', depcruise: 'pass', jobs: { verify: 'PASS' },
            head_sha: sha, ...(over.checks ?? {}) },
});
const mutationRun = (over) => ({
  ts: '2026-01-01T05:00:00Z', slice: '77', event: 'check.run', source: 'reported',
  checks: { mutation_score: 0.95, killed: 10, survived: 0 }, ...over,
});

/**
 * THE FIXTURE IS A REAL GIT REPOSITORY, and that is not incidental.
 *
 * Two of the predicates below read git: "tests green" now requires the recorded CI
 * run to cover HEAD (O-17), and the arc42 declaration is checked against the slice's
 * own commits by Conventional Commit scope (O-14). A fixture with no repository makes
 * both answer "cannot tell", which is honest but tests nothing — the cases would pass
 * against a predicate that had been deleted.
 *
 * `sha` is handed back so a case can say whether the CI run it records is the one
 * that tested this commit, which is the entire content of O-17.
 */
const git = (dir, args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });

const build = (events, { commits = [], slice = SLICE } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'slice-check-'));
  mkdirSync(join(dir, 'docs/team-log'), { recursive: true });
  mkdirSync(join(dir, 'docs/slices'), { recursive: true });
  mkdirSync(join(dir, 'docs/arc42'), { recursive: true });
  writeFileSync(join(dir, 'docs/slices/77-fixture.md'), slice, 'utf8');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }), 'utf8');

  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'fixture@example.invalid']);
  git(dir, ['config', 'user.name', 'fixture']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'chore: fixture root']);

  // Extra commits, each { subject, files: { path: contents } }, so a case can plant a
  // scoped commit that touches a declared or undeclared arc42 section.
  for (const c of commits) {
    for (const [f, body] of Object.entries(c.files ?? {})) {
      mkdirSync(join(dir, f.split('/').slice(0, -1).join('/')), { recursive: true });
      writeFileSync(join(dir, f), body, 'utf8');
    }
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', c.subject]);
  }

  const sha = git(dir, ['rev-parse', 'HEAD']).stdout.trim();
  const rootSha = git(dir, ['rev-list', '--max-parents=0', 'HEAD']).stdout.trim();
  const shas = git(dir, ['rev-list', 'HEAD']).stdout.trim().split('\n');   // newest first
  writeFileSync(join(dir, 'docs/team-log/events.jsonl'),
    events.map((e) => JSON.stringify(typeof e === 'function' ? e(sha) : e)).join('\n'), 'utf8');
  const r = spawnSync('node', [CHECK, '77'], { cwd: dir, encoding: 'utf8' });
  return { out: (r.stdout ?? '').replace(/\x1b\[[0-9;]*m/g, ''), sha, rootSha, shas, dir };
};

const run = (events, opts) => build(events, opts).out;

const row = (out, label) => (out.split('\n').find((l) => l.includes(label)) ?? '').trim();

// --- a mutation record is NOT a test outcome ---------------------------------
{
  const out = run([ciRun({ ts: '2026-01-01T00:00:00Z' }), mutationRun({})]);
  const line = row(out, 'tests green');
  ok('"tests green" reads the CI run, not a later mutation record',
    line.includes('run_id') && !line.includes('mutation_score'), line);
}

// --- and cannot stand in as the green half of red-before-green ---------------
{
  const red = ciRun({ ts: '2026-01-01T00:00:00Z', checks: { run_id: 1, jobs: { test: 'FAIL' } } });
  const out = run([red, mutationRun({})]);   // mutation only, no green CI run
  ok('a mutation record is not the green half of red-before-green',
    row(out, 'test-first').includes('FAIL'), row(out, 'test-first'));

  const out2 = run([red, mutationRun({}), ciRun({ ts: '2026-01-01T09:00:00Z', checks: { run_id: 2, jobs: { test: 'PASS' } } })]);
  ok('...but a real later green CI run is', row(out2, 'test-first').includes('PASS'), row(out2, 'test-first'));
}

// --- newest by timestamp, not by log position --------------------------------
// A gate backfill may append an older run after a newer one; §7's ordering
// obligation exists for the same reason, and asking two mechanisms to agree is
// how they drift apart.
{
  const newer = ciRun({ ts: '2026-01-01T09:00:00Z', checks: { run_id: 2, conclusion: 'success', depcruise: 'pass', jobs: { test: 'PASS' } } });
  const older = ciRun({ ts: '2026-01-01T00:00:00Z', checks: { run_id: 1, jobs: { test: 'FAIL' } } });
  const out = run([newer, older]);           // appended newest-first, as `gh` lists them
  ok('"tests green" takes the newest CI run by ts even when appended out of order',
    row(out, 'tests green').includes('PASS') && !row(out, 'tests green').includes('FAIL'),
    row(out, 'tests green'));
}

// --- the mutation gate still reads the mutation record -----------------------
{
  const out = run([ciRun({}), mutationRun({})]);
  ok('the mutation gate still finds its own record', row(out, 'mutation score').includes('0.95'), row(out, 'mutation score'));
  const out2 = run([ciRun({})]);
  ok('and reports UNVERIFIED when Stryker has not run',
    row(out2, 'mutation score').includes('UNVERIFIED'), row(out2, 'mutation score'));
}

// --- no CI run at all is UNVERIFIED, not a pass ------------------------------
{
  const out = run([mutationRun({})]);
  ok('a mutation record alone leaves "tests green" UNVERIFIED',
    row(out, 'tests green').includes('UNVERIFIED'), row(out, 'tests green'));
}

// --- the three states, which are three different facts ----------------------
// PASS on a vacuous score let a slice clear §10's "on changed files" clause on a
// number about the previous slice. UNVERIFIED blocked a SQL-only slice forever.
// N/A is the third: the criterion does not reach this diff.
{
  const vacuous = mutationRun({ checks: { mutation_score: 0.95, mutation_measures_changed_files: false } });
  const out = run([ciRun({}), vacuous]);
  const line = row(out, 'mutation score');
  ok('a vacuous score is N/A, not PASS', line.startsWith('N/A'), line);
  ok('...and says whose score it actually is', line.includes('measures the slice before it'), line);
  // Not "the fixture has no unverified rows" — it has others. The claim is that
  // N/A does not ADD one, which is what blocking would mean.
  const countUnverified = (o) => Number((o.match(/(\d+) unverified/) ?? [0, 0])[1]);
  ok('...and does NOT block done: N/A adds no unverified row',
    countUnverified(out) === countUnverified(run([ciRun({}), mutationRun({ checks: { mutation_score: 0.95, mutation_measures_changed_files: true } })])),
    `vacuous=${countUnverified(out)} vs measured=${countUnverified(run([ciRun({}), mutationRun({ checks: { mutation_score: 0.95, mutation_measures_changed_files: true } })]))}`);
  ok('...and the summary names it as not applicable', out.includes('not applicable'), out.split('\n').slice(-3).join(' | '));

  const real = mutationRun({ checks: { mutation_score: 0.95, mutation_measures_changed_files: true } });
  ok('a score that DOES measure the diff still passes',
    row(run([ciRun({}), real]), 'mutation score').startsWith('PASS'),
    row(run([ciRun({}), real]), 'mutation score'));

  const low = mutationRun({ checks: { mutation_score: 0.4, mutation_measures_changed_files: true } });
  ok('...and still fails when below threshold',
    row(run([ciRun({}), low]), 'mutation score').startsWith('FAIL'),
    row(run([ciRun({}), low]), 'mutation score'));

  ok('a missing score is UNVERIFIED and DOES block done',
    row(run([ciRun({})]), 'mutation score').startsWith('UNVERIFIED') && run([ciRun({})]).includes('unverified'),
    row(run([ciRun({})]), 'mutation score'));
}


// --- O-17: the run must COVER the commit being gated -------------------------
// Slice 01, on its own branch: after the whole AC-6 remedy landed across five commits
// this gate reported "tests green" citing a run five commits behind that predated every
// part of the remedy — while the run for the real HEAD had FAILED, invisibly, because a
// failing run nobody collected is indistinguishable from one that does not exist.
{
  const seed = build([], { commits: [{ subject: 'feat(77): later work', files: { 'src/later.ts': 'export const x = 1;\n' } }] });
  const { out, sha } = build([ciRun({ checks: { head_sha: seed.rootSha } })],
    { commits: [{ subject: 'feat(77): later work', files: { 'src/later.ts': 'export const x = 1;\n' } }] });
  ok("a run predating the slice's last commit fails — it ran before the work finished",
    row(out, 'tests green').startsWith('FAIL') && row(out, 'tests green').includes('ancestor'),
    row(out, 'tests green'));
  ok('...and the failure names the remedy rather than only the problem',
    row(out, 'tests green').includes('collect-ci.mjs'), row(out, 'tests green'));
  ok('a run on HEAD itself passes', row(run([ciRun()]), 'tests green').startsWith('PASS'), sha.slice(0, 7));
}
{
  const out = run([ciRun({ checks: { head_sha: 'de1e7ed0000000000000000000000000deadbeef' } })]);
  ok('a head_sha git cannot relate to HEAD is UNVERIFIED, not PASS',
    row(out, 'tests green').startsWith('UNVERIFIED'), row(out, 'tests green'));
}

{
  // The retarget, and the reason for it: pinning to HEAD meant every later commit to
  // `main` retroactively invalidated the gate of every slice already done. A merged
  // slice's approval is a fact about the work that was approved, and that work stopped
  // changing when its last commit landed.
  // THE RUN IS RECORDED AT THE SLICE'S COMMIT, not at HEAD, and that is the whole
  // discrimination. The first version of this case recorded it at HEAD — which the
  // pre-retarget code accepts too, since HEAD === HEAD — so the mutant that pins the
  // target back to HEAD SURVIVED it. A case that passes under the change it was written
  // to catch is not evidence, and this is the second time in this project that a
  // fixture's convenient default hid exactly the property under test.
  const commits = [
    { subject: 'feat(77): the slice\'s last commit', files: { 'src/a.ts': 'export const a = 1;\n' } },
    { subject: 'chore(99): unrelated later work on main', files: { 'src/b.ts': 'export const b = 2;\n' } },
  ];
  const seeded = build([], { commits });
  const sliceCommit = seeded.shas[1];
  const { out } = build([ciRun({ checks: { head_sha: sliceCommit } })], { commits });
  ok('a run on the slice\'s last commit still passes after main moves on',
    row(out, 'tests green').startsWith('PASS'), row(out, 'tests green'));
}

// --- the gate reads a MEANING, not a spelling --------------------------------
// This compared `decision === 'approved'` by exact equality until slice 01, where the
// human's `approved-and-merged` read as NOT approved. Slice 00a papered over it by
// logging the same human decision twice to satisfy the compare.
const gateEv = (over) => ({ ts: '2026-01-02T00:00:00Z', slice: '77', event: 'gate.decided',
  source: 'reported', gate: 'E', decision: 'approved', rationale: 'because', ...over });
{
  ok('"approved" passes', row(run([ciRun(), gateEv({})]), 'human approved').startsWith('PASS'));
  ok('"approved-and-merged" passes — the spelling slice 01 actually used',
    row(run([ciRun(), gateEv({ decision: 'approved-and-merged' })]), 'human approved').startsWith('PASS'),
    row(run([ciRun(), gateEv({ decision: 'approved-and-merged' })]), 'human approved'));
  ok('"changes-requested" FAILS — a decision that is not an approval is not a near-miss',
    row(run([ciRun(), gateEv({ decision: 'changes-requested' })]), 'human approved').startsWith('FAIL'));
  ok('a PROCESS ruling is not read as this slice’s Gate E',
    row(run([ciRun(), gateEv({ gate: 'process', decision: 'approved-light-gate' })]), 'human approved').startsWith('FAIL'),
    row(run([ciRun(), gateEv({ gate: 'process', decision: 'approved-light-gate' })]), 'human approved'));
}

// --- the light gate, and the reversion that is its whole safety --------------
const LIGHT = SLICE.replace('loopbacks: 0', 'loopbacks: 0\ngate: light');
const raised = (over) => ({ ts: '2026-01-01T02:00:00Z', slice: '77', event: 'finding.raised',
  source: 'reported', actor: 'reviewer', ref: 'R-77-1', severity: 'MAJOR', step: 5,
  claim: 'c', scenario: 's', ...over });
{
  ok('a light-gate slice auto-approves with no open MAJOR',
    row(run([ciRun()], { slice: LIGHT }), 'human approved').startsWith('PASS'),
    row(run([ciRun()], { slice: LIGHT }), 'human approved'));

  const openMajor = run([ciRun(), raised({})], { slice: LIGHT });
  ok('an OPEN MAJOR revokes the light gate and demands a human',
    row(openMajor, 'human approved').startsWith('FAIL') && row(openMajor, 'human approved').includes('REVOKED'),
    row(openMajor, 'human approved'));
  ok('...and the revocation names which finding did it',
    row(openMajor, 'human approved').includes('R-77-1'), row(openMajor, 'human approved'));

  // The distinction that makes the light gate usable at all: slice 01 raised three
  // MAJORs and closed all three. A slice that finds and fixes serious things is the
  // opposite of one that needs escalating.
  const ruled = { ts: '2026-01-01T03:00:00Z', slice: '77', event: 'finding.ruled', source: 'reported',
    actor: 'architect', ref: 'R-77-1', verdict: 'accepted', rationale: 'fixed' };
  ok('a RULED MAJOR does not revoke it — raised-and-closed is not open',
    row(run([ciRun(), raised({}), ruled], { slice: LIGHT }), 'human approved').startsWith('PASS'),
    row(run([ciRun(), raised({}), ruled], { slice: LIGHT }), 'human approved'));

  ok('a MINOR never revokes it',
    row(run([ciRun(), raised({ severity: 'MINOR', ref: 'R-77-2' })], { slice: LIGHT }), 'human approved').startsWith('PASS'));

  ok('a full-gate slice does NOT auto-approve',
    row(run([ciRun()]), 'human approved').startsWith('FAIL'),
    row(run([ciRun()]), 'human approved'));
}

// --- O-14: the arc42 declaration is checked against what the slice edited ----
const MARKED = '# 9\n\n<!-- generated:adr-index -->\nold\n<!-- /generated:adr-index -->\n';
{
  const undeclared = build([ciRun()], { commits: [
    { subject: 'docs(77): touch an undeclared section', files: { 'docs/arc42/05-building-blocks.md': '# 5\nedited\n' } }] }).out;
  ok('a hand edit to an UNDECLARED arc42 section fails',
    row(undeclared, 'arc42 edits').startsWith('FAIL') && row(undeclared, 'arc42 edits').includes('05'),
    row(undeclared, 'arc42 edits'));

  const declared = build([ciRun()], { commits: [
    { subject: 'docs(77): touch the declared section', files: { 'docs/arc42/01-introduction.md': '# 1\nedited\n' } }] }).out;
  ok('a hand edit to a DECLARED section passes (§1 is declared by the fixture)',
    row(declared, 'arc42 edits').startsWith('PASS'), row(declared, 'arc42 edits'));

  const unscoped = build([ciRun()], { commits: [
    { subject: 'docs(arc42): as-built, not slice work', files: { 'docs/arc42/05-building-blocks.md': '# 5\nedited\n' } }] }).out;
  ok('a commit NOT scoped to the slice is not the slice’s edit — step 7 is post-gate',
    row(unscoped, 'arc42 edits').startsWith('N/A') || row(unscoped, 'arc42 edits').startsWith('PASS'),
    row(unscoped, 'arc42 edits'));

  // Generated blocks are not edits: docs:build writes §9 and §11 into markers, so every
  // slice recording an ADR "changes" §9. Counting those makes the declaration a record
  // of what the build regenerated.
  const gen = build([ciRun()], { commits: [
    { subject: 'chore: seed the marked file', files: { 'docs/arc42/09-architecture-decisions.md': MARKED } },
    { subject: 'docs(77): regenerate the ADR index',
      files: { 'docs/arc42/09-architecture-decisions.md': MARKED.replace('old', 'new row') } }] }).out;
  ok('a change entirely inside generated markers is not an undeclared edit',
    row(gen, 'arc42 edits').startsWith('PASS'), row(gen, 'arc42 edits'));

  const both = build([ciRun()], { commits: [
    { subject: 'chore: seed the marked file', files: { 'docs/arc42/09-architecture-decisions.md': MARKED } },
    { subject: 'docs(77): regenerate AND edit prose',
      files: { 'docs/arc42/09-architecture-decisions.md': MARKED.replace('old', 'new row').replace('# 9', '# 9\nhand-written') } }] }).out;
  ok('...but a hand edit in the SAME file as a regeneration still fails',
    row(both, 'arc42 edits').startsWith('FAIL'), row(both, 'arc42 edits'));

  ok('a slice with no commits of its own is N/A, not a blocking UNVERIFIED',
    row(run([ciRun()]), 'arc42 edits').startsWith('N/A'), row(run([ciRun()]), 'arc42 edits'));
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
