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
const ciRun = (over = {}) => (sha, ctx) => ({
  ts: '2026-01-01T00:00:00Z', slice: '77', event: 'check.run', source: 'derived',
  ...over,
  checks: { run_id: 1, conclusion: 'success', depcruise: 'pass', jobs: { verify: 'PASS' },
            head_sha: sha,
            ...(typeof over.checks === 'function' ? over.checks(ctx) : over.checks ?? {}) },
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

const build = (events, { commits = [], slice = SLICE, branch = null, prompts = [] } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'slice-check-'));
  mkdirSync(join(dir, 'docs/team-log'), { recursive: true });
  mkdirSync(join(dir, 'docs/slices'), { recursive: true });
  mkdirSync(join(dir, 'docs/arc42'), { recursive: true });
  writeFileSync(join(dir, 'docs/slices/77-fixture.md'), slice, 'utf8');
  if (prompts.length) {
    mkdirSync(join(dir, 'docs/team-log/prompts'), { recursive: true });
    for (const f of prompts) writeFileSync(join(dir, 'docs/team-log/prompts', f), '# prompt\n', 'utf8');
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }), 'utf8');

  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'fixture@example.invalid']);
  git(dir, ['config', 'user.name', 'fixture']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'chore: fixture root']);
  // A branch makes the arc42 check gate-relative rather than message-relative; without
  // one, HEAD is the merge-base and the scope fallback applies (see R-02-1).
  if (branch) git(dir, ['checkout', '-q', '-b', branch]);

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
  // Event entries may be functions of THIS repository's context. They were functions of
  // `sha` alone, which forced any case needing a non-HEAD commit to build a SECOND repo
  // and borrow a sha from it — and two repos only share a commit id when both `git
  // commit` calls land in the same clock second, because the timestamp is hashed in.
  // That made the O-17 case fail about one run in three, in `test:tools`, in CI.
  const ctx = { sha, rootSha, shas };
  writeFileSync(join(dir, 'docs/team-log/events.jsonl'),
    events.map((e) => JSON.stringify(typeof e === 'function' ? e(sha, ctx) : e)).join('\n'), 'utf8');
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
  const { out, sha } = build([ciRun({ checks: (ctx) => ({ head_sha: ctx.rootSha }) })],
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
  // O-35. An ABBREVIATED `head_sha` for the very commit under test was reported as behind
  // it. `check.run` records do not all carry the same SHA width, the equality guard above
  // was a string comparison, and a commit IS an ancestor of itself — so the run fell
  // through to `merge-base --is-ancestor` and the gate printed the self-refuting detail
  // "the newest recorded run is 86af39b, an ancestor of this slice's last commit 86af39b".
  //
  // Right about the rule, wrong about the identity of two names for one commit. Both sides
  // are now resolved through `rev-parse` before anything is compared, which is why the
  // failing direction is asserted first: an abbreviated record must PASS, and the O-17
  // behaviour above must survive it.
  const { out, sha } = build([ciRun({ checks: (ctx) => ({ head_sha: ctx.sha.slice(0, 7) }) })]);
  ok('an ABBREVIATED head_sha for the commit under test passes — two names, one commit',
    row(out, 'tests green').startsWith('PASS'), `${sha.slice(0, 7)} — ${row(out, 'tests green')}`);
  const behind = build([ciRun({ checks: (ctx) => ({ head_sha: ctx.rootSha.slice(0, 7) }) })],
    { commits: [{ subject: 'feat(77): later work', files: { 'src/later.ts': 'export const x = 1;\n' } }] });
  ok('...and an abbreviated run that really IS behind still fails — the widening is not a hole',
    row(behind.out, 'tests green').startsWith('FAIL'), row(behind.out, 'tests green'));
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
  const { out } = build([ciRun({ checks: (ctx) => ({ head_sha: ctx.shas[1] }) })], { commits });
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
  ok('"approved" passes', row(run([ciRun(), gateEv({})]), 'approved').startsWith('PASS'));
  ok('"approved-and-merged" passes — the spelling slice 01 actually used',
    row(run([ciRun(), gateEv({ decision: 'approved-and-merged' })]), 'approved').startsWith('PASS'),
    row(run([ciRun(), gateEv({ decision: 'approved-and-merged' })]), 'approved'));
  ok('"changes-requested" FAILS — a decision that is not an approval is not a near-miss',
    row(run([ciRun(), gateEv({ decision: 'changes-requested' })]), 'approved').startsWith('FAIL'));
  ok('a PROCESS ruling is not read as this slice’s Gate E',
    row(run([ciRun(), gateEv({ gate: 'process', decision: 'approved-light-gate' })]), 'approved').startsWith('FAIL'),
    row(run([ciRun(), gateEv({ gate: 'process', decision: 'approved-light-gate' })]), 'approved'));
}

// --- the light gate, and the reversion that is its whole safety --------------
const LIGHT = SLICE.replace('loopbacks: 0', 'loopbacks: 0\ngate: light');
const raised = (over) => ({ ts: '2026-01-01T02:00:00Z', slice: '77', event: 'finding.raised',
  source: 'reported', actor: 'reviewer', ref: 'R-77-1', severity: 'MAJOR', step: 5,
  claim: 'c', scenario: 's', ...over });
{
  ok('a light-gate slice auto-approves with no open MAJOR',
    row(run([ciRun()], { slice: LIGHT }), 'approved').startsWith('PASS'),
    row(run([ciRun()], { slice: LIGHT }), 'approved'));

  const openMajor = run([ciRun(), raised({})], { slice: LIGHT });
  ok('an OPEN MAJOR revokes the light gate and demands a human',
    row(openMajor, 'approved').startsWith('FAIL') && row(openMajor, 'approved').includes('REVOKED'),
    row(openMajor, 'approved'));
  ok('...and the revocation names which finding did it',
    row(openMajor, 'approved').includes('R-77-1'), row(openMajor, 'approved'));

  // The distinction that makes the light gate usable at all: slice 01 raised three
  // MAJORs and closed all three. A slice that finds and fixes serious things is the
  // opposite of one that needs escalating.
  const ruled = { ts: '2026-01-01T03:00:00Z', slice: '77', event: 'finding.ruled', source: 'reported',
    actor: 'architect', ref: 'R-77-1', verdict: 'accepted', rationale: 'fixed' };
  ok('a RULED MAJOR does not revoke it — raised-and-closed is not open',
    row(run([ciRun(), raised({}), ruled], { slice: LIGHT }), 'approved').startsWith('PASS'),
    row(run([ciRun(), raised({}), ruled], { slice: LIGHT }), 'approved'));

  ok('a MINOR never revokes it',
    row(run([ciRun(), raised({ severity: 'MINOR', ref: 'R-77-2' })], { slice: LIGHT }), 'approved').startsWith('PASS'));

  ok('a full-gate slice does NOT auto-approve',
    row(run([ciRun()]), 'approved').startsWith('FAIL'),
    row(run([ciRun()]), 'approved'));
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

  // POST-GATE, NOT DIFFERENTLY-SPELLED — R-02-1.
  //
  // This case used to assert that a commit not scoped to the slice is not the slice's
  // edit, on the ground that step 7's `docs(arc42)` commits are post-gate. That is true
  // of WHERE they run, not of how they are spelled, and slice 02 broke the assumption:
  // `dd9bd44` hand-edited §10 at STEP 2 under a `docs(arc42)` subject, and the check
  // reported "0 hand-edited" over a file it never opened.
  //
  // The distinction that actually holds is the branch. On a branch, every commit is the
  // slice's work whatever its subject says — so this now asserts the opposite of what it
  // did, and the fixture builds a branch to say so.
  const onBranchUnscoped = build([ciRun()], { branch: 'slice/77-fixture', commits: [
    { subject: 'docs(arc42): a mid-slice hand edit wearing a post-gate subject',
      files: { 'docs/arc42/05-building-blocks.md': '# 5\nedited\n' } }] }).out;
  ok('a docs(arc42) commit ON THE BRANCH is caught — a subject line cannot make it post-gate',
    row(onBranchUnscoped, 'arc42 edits').startsWith('FAIL')
      && row(onBranchUnscoped, 'arc42 edits').includes('05'),
    row(onBranchUnscoped, 'arc42 edits'));

  const unscoped = build([ciRun()], { commits: [
    { subject: 'docs(arc42): as-built, run on main after the gate',
      files: { 'docs/arc42/05-building-blocks.md': '# 5\nedited\n' } }] }).out;
  ok('the same commit on main is NOT the slice\'s edit — step 7 runs there, post-gate',
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


// --- the gate asks whether findings were ruled — O-30 --------------------------
//
// At slice 02's gate seven MAJORs read as open and SIX were fixed: each fix was written
// into the prose of the `finding.raised` that reported it and never logged as an event.
// The orchestrator only noticed by hand-writing a query, which is the discipline this file
// replaces. Prose inside a raise must NOT count as a resolution — that is the confusion
// being removed, and it is what the third case pins.
{
  const raise = (ref, over = {}) => ({ ts: '2026-01-01T02:00:00Z', slice: '77',
    event: 'finding.raised', source: 'reported', actor: 'reviewer', ref, severity: 'MAJOR',
    step: 5, claim: 'c', scenario: 's', ...over });
  const rule = (ref) => ({ ts: '2026-01-01T03:00:00Z', slice: '77', event: 'finding.ruled',
    source: 'reported', actor: 'architect', ref, verdict: 'accepted', rationale: 'r' });

  ok('an unruled MAJOR fails the gate and is named',
    row(run([ciRun(), raise('R-77-1')]), 'findings ruled').startsWith('FAIL')
      && row(run([ciRun(), raise('R-77-1')]), 'findings ruled').includes('R-77-1'),
    row(run([ciRun(), raise('R-77-1')]), 'findings ruled'));

  ok('a ruled one passes',
    row(run([ciRun(), raise('R-77-1'), rule('R-77-1')]), 'findings ruled').startsWith('PASS'));

  ok('a fix DESCRIBED IN THE RAISE does not count — the whole of O-30',
    row(run([ciRun(), raise('R-77-2', { scenario: 'Broken. FIXED: both now corrected and tested.' })]),
      'findings ruled').startsWith('FAIL'),
    row(run([ciRun(), raise('R-77-2', { scenario: 'FIXED' })]), 'findings ruled'));

  ok('a MINOR left open does not fail the gate — that is a backlog item',
    row(run([ciRun(), raise('R-77-3', { severity: 'MINOR' })]), 'findings ruled').startsWith('PASS'));

  ok('a review.response closes it too — the reviewer answering its own finding',
    row(run([ciRun(), raise('R-77-4'), { ts: '2026-01-01T04:00:00Z', slice: '77',
      event: 'review.response', source: 'reported', finding_ref: 'R-77-4', resolution: 'fixed' }]),
      'findings ruled').startsWith('PASS'));
}

// ------------------------------------------------- O-55: the reasoning is on the PR --
//
// §6 puts every reply, disagreement and vote on the PR because THE REASONING IS THE GRADED
// ARTIFACT. Six slices went without it and no check looked, because slice:check reads the
// log and CI and never the PR. The human found it.
//
// WHAT THESE CASES CAN AND CANNOT COVER, said plainly rather than left to be discovered:
// the PASS and FAIL paths need a real PR with real comments, so they are exercised against
// the live repository at slice level and not here. What IS covered here is the half that
// decides whether the check can lie — that it reports N/A when nothing is owed, and
// UNVERIFIED rather than PASS when it cannot look. A check that answers green because the
// network was absent is the defect this whole file exists against.
{
  const agent = (actor, n) => ({
    ts: '2026-01-01T00:00:00Z', event: 'agent.finish', source: 'derived', slice: '77',
    actor, outcome: 'completed', span_id: `s-77-${actor}-${n}`,
  });

  const noRoles = run([{ ts: '2026-01-01T00:00:00Z', event: 'slice.ready', source: 'reported', slice: '77' }]);
  ok('no role ran, so no reasoning is owed — N/A, not a failure',
    /N\/A.*reasoning is on the PR/.test(row(noRoles, 'reasoning is on the PR')),
    row(noRoles, 'reasoning is on the PR'));

  const roles = run([agent('architect', 1), agent('reviewer', 1)]);
  ok('a fixture repo has no PR, so the check says it cannot look',
    /UNVERIFIED/.test(row(roles, 'reasoning is on the PR')), row(roles, 'reasoning is on the PR'));
  ok('...and never reports PASS when it could not read the PR',
    !/PASS/.test(row(roles, 'reasoning is on the PR')));
  ok('...and says WHY it could not, so the gate is not left guessing',
    /no PR|gh unavailable|unreadable|no branch/.test(row(roles, 'reasoning is on the PR')));
}

// --------------------------------------------- O-44: every dispatch reached the log --
//
// At slice 06 a role dispatched another role directly. The ruling was (a), so nothing was
// lost — but had it been (c), a loopback would have been due and the max-2 governor would
// not have counted it, because the governor is worth exactly what the log is.
//
// The reconciliation runs ONE WAY on purpose, and the asymmetry is the interesting half:
// every capture needs an event, but events without captures are normal — `SendMessage`
// resumes an agent from its transcript and produces an `agent.finish` with no new prompt.
{
  const agent = (actor, n) => ({
    ts: '2026-01-01T00:00:00Z', event: 'agent.finish', source: 'derived', slice: '77',
    actor, outcome: 'completed', span_id: `s-77-${actor}-${n}`,
  });

  const a = run([agent('architect', 1)], { prompts: ['s77-architect-1.md'] });
  ok('a capture with a matching agent event passes',
    /PASS.*every dispatch reached the log/.test(row(a, 'every dispatch reached the log')), row(a, 'every dispatch'));

  const b = run([agent('architect', 1)], { prompts: ['s77-architect-1.md', 's77-implementer-2.md'] });
  ok('a capture with NO agent event fails — the self-dispatch case',
    /FAIL/.test(row(b, 'every dispatch reached the log')));
  ok('...and it names the file, so the run can be found',
    /s77-implementer-2\.md/.test(row(b, 'every dispatch reached the log')));

  // MUST NOT FIRE. Four of slice 06's eighteen agent events were SendMessage resumes with
  // no prompt of their own; failing those would punish the cheap way to continue an agent.
  const c = run([agent('implementer', 1), agent('implementer', 2), agent('implementer', 3)],
    { prompts: ['s77-implementer-1.md'] });
  ok('events without captures are resumes, not failures',
    /PASS/.test(row(c, 'every dispatch reached the log')));

  // A `.report.md` is the RESULT of a run, not a dispatch — counting it would demand an
  // event per report and slice 05 has two reports for one prompt.
  const d = run([agent('architect', 1)],
    { prompts: ['s77-architect-1.md', 's77-architect-1.report.md', 's77-architect-1.report.2.md'] });
  ok('a report capture is not a dispatch', /PASS/.test(row(d, 'every dispatch reached the log')));

  const e = run([agent('architect', 1)], { prompts: ['s06-architect-9.md'] });
  ok('another slice\'s captures are not this slice\'s problem',
    /N\/A|PASS/.test(row(e, 'every dispatch reached the log')), row(e, 'every dispatch'));

  const f = run([agent('architect', 1)], {});
  ok('no captures at all is N/A, not a pass and not a failure',
    /N\/A/.test(row(f, 'every dispatch reached the log')));
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
