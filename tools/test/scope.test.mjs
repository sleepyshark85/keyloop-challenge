#!/usr/bin/env node
/**
 * `.claude/hooks/scope.mjs` — which slice or phase an agent run belongs to.
 *
 * These cases exist because the answer was wrong for four consecutive runs and nothing
 * said so. `docs/team-log/.scope` is a gitignored file the orchestrator has to remember
 * to update; at slice 02 it still read `{"slice":"01"}`, so the step-1 design, both
 * step-2 AGREE reports and the step-2 adjudication were logged as slice 01 and filed as
 * `s01-*`. The architect went looking for `s02-*.report.md`, found nothing, and ruled
 * eleven objections from a relay instead of from what the roles wrote.
 *
 * The hooks warned when the marker was ABSENT and never when it was WRONG, which is the
 * distinction every case below is about. The failing direction is asserted first, and
 * the stale-marker case is the one that would have caught it.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveScope, sliceFromBranch } from '../../.claude/hooks/scope.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const git = (dir, args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });

/** A repo on `branch`, optionally carrying a scope marker. */
const fixture = ({ branch, marker } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'scope-'));
  mkdirSync(join(dir, 'docs/team-log'), { recursive: true });
  writeFileSync(join(dir, 'docs/team-log/keep'), 'x');
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'f@example.invalid']);
  git(dir, ['config', 'user.name', 'f']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'root']);
  if (branch) git(dir, ['checkout', '-q', '-b', branch]);
  if (marker !== undefined) writeFileSync(join(dir, 'docs/team-log/.scope'), marker);
  return dir;
};

const notes = [];
const note = (m) => notes.push(m);
const run = (dir) => { notes.length = 0; return resolveScope(dir, note); };

// --- the case that would have caught it --------------------------------------
{
  const dir = fixture({ branch: 'slice/02-book-and-read-an-appointment', marker: '{"slice":"01"}' });
  const scope = run(dir);
  ok('a STALE marker loses to the branch — the slice-02 failure, exactly',
    scope.slice === '02', JSON.stringify(scope));
  ok('...and the disagreement is REPORTED, not silently resolved',
    notes.some((n) => /stale/i.test(n) && n.includes('01') && n.includes('02')), JSON.stringify(notes));
}

// --- the branch is the authority whenever there is one -----------------------
{
  const dir = fixture({ branch: 'slice/02-book-and-read-an-appointment' });
  ok('a slice branch with NO marker still resolves', run(dir).slice === '02');
  ok('...and says nothing about staleness, because nothing is stale',
    !notes.some((n) => /stale/i.test(n)), JSON.stringify(notes));
}
{
  const dir = fixture({ branch: 'slice/00a-walking-skeleton', marker: '{"slice":"00a"}' });
  ok('a lettered slice id survives the branch parse', run(dir).slice === '00a');
  ok('...and an AGREEING marker produces no note', notes.length === 0, JSON.stringify(notes));
}

// --- the marker remains the fallback where there is no slice branch ----------
{
  const dir = fixture({ marker: '{"slice":"01"}' });
  ok('on main, the marker is still honoured — step 7 and gate work run there',
    run(dir).slice === '01', JSON.stringify(run(dir)));
}
{
  const dir = fixture({ marker: '{"phase":"4"}' });
  ok('a phase marker survives on main', run(dir).phase === '4');
}
{
  const dir = fixture({ branch: 'fix/some-tooling', marker: '{"phase":"4"}' });
  ok('a NON-slice branch does not override the marker',
    run(dir).phase === '4', JSON.stringify(run(dir)));
}

// --- absence and corruption are still reported -------------------------------
{
  const dir = fixture({});
  const scope = run(dir);
  ok('no marker and no slice branch is phase 0, and says so',
    scope.phase === '0' && notes.some((n) => /no scope marker/.test(n)), JSON.stringify(notes));
}
{
  const dir = fixture({ marker: 'not json' });
  const scope = run(dir);
  ok('an unparseable marker is reported and does not throw',
    scope.phase === '0' && notes.some((n) => /unparseable/.test(n)), JSON.stringify(notes));
}
{
  const dir = fixture({ branch: 'slice/02-x', marker: 'not json' });
  ok('an unparseable marker still loses to a usable branch', run(dir).slice === '02');
}
{
  const dir = mkdtempSync(join(tmpdir(), 'scope-nogit-'));
  const scope = run(dir);
  ok('outside a git repository it falls back rather than crashing', scope.phase === '0');
}

// --- the parser itself -------------------------------------------------------
{
  const dir = fixture({ branch: 'slice/02-book-and-read-an-appointment' });
  ok('sliceFromBranch reads the id', sliceFromBranch(dir) === '02');
  const other = fixture({ branch: 'slice-02-not-the-convention' });
  ok('...and does not match a branch that only looks similar',
    sliceFromBranch(other) === null, String(sliceFromBranch(other)));
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
