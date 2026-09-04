#!/usr/bin/env node
/**
 * The defect register is generated, so it belongs to the tier that cannot drift.
 * These cases exist because the register's own failure mode is the one this
 * project has now caught seven times: a file that looks maintained because
 * nothing reports that it is not.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GEN = fileURLToPath(new URL('../defects/generate.mjs', import.meta.url));
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const raised = (over) => ({
  ts: '2026-01-01T00:00:00Z', slice: '00a', actor: 'test-engineer',
  event: 'finding.raised', source: 'reported', ref: 'X-1', severity: 'MAJOR',
  step: 3, introduced_at_step: 1, claim: 'a claim', scenario: 'a scenario', ...over,
});
const ruledEv = (over) => ({
  ts: '2026-01-01T01:00:00Z', slice: '00a', actor: 'architect',
  event: 'finding.ruled', source: 'reported', ref: 'X-1',
  verdict: 'accepted', rationale: 'because', ...over,
});

const run = (events, args = []) => {
  const dir = mkdtempSync(join(tmpdir(), 'defects-'));
  mkdirSync(join(dir, 'docs/team-log'), { recursive: true });
  writeFileSync(join(dir, 'docs/team-log/events.jsonl'),
    events.map((e) => JSON.stringify(e)).join('\n'), 'utf8');
  const r = spawnSync('node', [GEN, ...args], { cwd: dir, encoding: 'utf8' });
  let out = '';
  try { out = readFileSync(join(dir, 'docs/DEFECTS.md'), 'utf8'); } catch { /* --check */ }
  return { ...r, doc: out, dir };
};

// --- the register reflects the log -------------------------------------------
{
  const { doc } = run([raised({}), ruledEv({})]);
  ok('a ruled finding appears with its verdict', /X-1/.test(doc) && /accepted/.test(doc));
  ok('the scenario is carried, not just the claim', doc.includes('a scenario'));
  ok('the rationale is carried', doc.includes('because'));
}

// --- an unruled finding must be visibly open, not silently absent ------------
{
  const { doc } = run([raised({})]);
  ok('an unruled finding is marked open', /\*\*open\*\*/.test(doc), doc.slice(0, 200));
  ok('and is counted in the summary', /Awaiting a ruling \| \*\*1\*\*/.test(doc));
}

// --- a REJECTED finding is kept, because that was the ruling -----------------
{
  const { doc } = run([raised({}), ruledEv({ verdict: 'rejected' })]);
  ok('a rejected finding stays in the register', /X-1/.test(doc) && /rejected/.test(doc));
}

// --- escape distance, the number the retro reads -----------------------------
{
  const { doc } = run([
    raised({ ref: 'A', step: 3, introduced_at_step: 1 }),   // +2
    raised({ ref: 'B', step: 4, introduced_at_step: 4 }),   // +0
  ]);
  ok('escape distance is computed per finding', /\+2/.test(doc) && /\+0/.test(doc));
  ok('and averaged in the summary', /Mean escape distance \| 1\.00/.test(doc), doc.match(/Mean escape.*/)?.[0]);
}

// --- --check is the CI gate and must fail on drift ---------------------------
{
  const events = [raised({}), ruledEv({})];
  const first = run(events);
  ok('a freshly generated register passes --check', (() => {
    const r = spawnSync('node', [GEN, '--check'], { cwd: first.dir, encoding: 'utf8' });
    return r.status === 0;
  })());

  writeFileSync(join(first.dir, 'docs/DEFECTS.md'), '# hand-edited\n', 'utf8');
  const r = spawnSync('node', [GEN, '--check'], { cwd: first.dir, encoding: 'utf8' });
  ok('--check FAILS on a hand-edited register', r.status !== 0, `exit ${r.status}`);

  // The failure this whole file exists for: a finding logged and never rendered.
  writeFileSync(join(first.dir, 'docs/team-log/events.jsonl'),
    [...events, raised({ ref: 'X-2' })].map((e) => JSON.stringify(e)).join('\n'), 'utf8');
  const r2 = spawnSync('node', [GEN, '--check'], { cwd: first.dir, encoding: 'utf8' });
  ok('--check FAILS when a new finding is logged but not regenerated', r2.status !== 0, `exit ${r2.status}`);
}

// --- an empty log is handled, not crashed ------------------------------------
{
  const { status, doc } = run([]);
  ok('an empty log produces a register rather than a crash', status === 0 && doc.includes('Defect register'));
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
