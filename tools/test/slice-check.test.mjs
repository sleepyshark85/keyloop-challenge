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

const ciRun = (over) => ({
  ts: '2026-01-01T00:00:00Z', slice: '77', event: 'check.run', source: 'derived',
  checks: { run_id: 1, conclusion: 'success', depcruise: 'pass', jobs: { verify: 'PASS' } }, ...over,
});
const mutationRun = (over) => ({
  ts: '2026-01-01T05:00:00Z', slice: '77', event: 'check.run', source: 'reported',
  checks: { mutation_score: 0.95, killed: 10, survived: 0 }, ...over,
});

const run = (events) => {
  const dir = mkdtempSync(join(tmpdir(), 'slice-check-'));
  mkdirSync(join(dir, 'docs/team-log'), { recursive: true });
  mkdirSync(join(dir, 'docs/slices'), { recursive: true });
  writeFileSync(join(dir, 'docs/slices/77-fixture.md'), SLICE, 'utf8');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }), 'utf8');
  writeFileSync(join(dir, 'docs/team-log/events.jsonl'),
    events.map((e) => JSON.stringify(e)).join('\n'), 'utf8');
  const r = spawnSync('node', [CHECK, '77'], { cwd: dir, encoding: 'utf8' });
  return (r.stdout ?? '').replace(/\x1b\[[0-9;]*m/g, '');
};

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

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
