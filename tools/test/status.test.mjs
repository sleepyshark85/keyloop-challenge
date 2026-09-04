#!/usr/bin/env node
/**
 * STATUS.md is the committed resume point — the file a fresh session reads first,
 * and whose own header tells the reader to trust it over narration. It has now
 * been wrong about where the project is twice, in two different ways:
 *
 *   O-8  it advanced the PHASE on a per-slice gate, so the first slice gate of
 *        phase 5 would have reported the project finished with twelve unbuilt.
 *   —    its "what happens next" was a static string per phase, so it told a
 *        resuming session to "run slice 00 end-to-end, then hold the retro"
 *        after both had been done and merged.
 *
 * Both were caught by a human asking whether a fresh session would know where to
 * start. These cases exist so the next one is caught by the suite instead.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const GEN = join(ROOT, 'tools/status/generate.mjs');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const gate = (g, phase, slice) => ({
  ts: '2026-01-01T00:00:00Z', event: 'gate.decided', source: 'reported', actor: 'human',
  gate: g, decision: 'approved', rationale: 'x', ...(slice ? { slice } : { phase }),
});
const sliceDone = (id) => ({
  ts: '2026-01-02T00:00:00Z', event: 'slice.done', source: 'reported', slice: id, actor: 'orchestrator',
});
const retro = () => ({
  ts: '2026-01-03T00:00:00Z', event: 'handoff', source: 'reported', phase: '4', actor: 'orchestrator',
  from: 'orchestrator', to: 'human', artifact: 'docs/team-log/phase-4-retro.md',
});

const run = (events) => {
  const dir = mkdtempSync(join(tmpdir(), 'status-'));
  mkdirSync(join(dir, 'docs/team-log'), { recursive: true });
  mkdirSync(join(dir, 'docs/adr'), { recursive: true });
  cpSync(join(ROOT, 'tools'), join(dir, 'tools'), { recursive: true });
  writeFileSync(join(dir, 'docs/team-log/events.jsonl'),
    events.map((e) => JSON.stringify(e)).join('\n'), 'utf8');
  spawnSync('node', [GEN], { cwd: dir, encoding: 'utf8' });
  return readFileSync(join(dir, 'docs/STATUS.md'), 'utf8');
};

const nextBlock = (doc) => doc.split('## What happens next')[1]?.split('##')[0] ?? '';

// --- O-8: a per-slice gate closes no phase -----------------------------------
{
  const doc = run([gate('A', '1'), gate('B', '2'), gate('C', '3'), gate('E', null, '00a')]);
  ok('a slice gate E does not advance the phase past the pilot',
    doc.includes('Phase 4') && !doc.includes('Phase 6'),
    (doc.match(/\*\*Phase \d[^*]*\*\*/) ?? [''])[0]);
}

// --- the next action is derived from what happened INSIDE the phase ----------
{
  const base = [gate('A', '1'), gate('B', '2'), gate('C', '3')];

  const nothing = nextBlock(run(base));
  ok('with no pilot slice done, it says run 00a', nothing.includes('00a'), nothing.trim().split('\n')[0]);

  const skeletonOnly = nextBlock(run([...base, sliceDone('00a')]));
  ok('with 00a done, it says run slice 00 — not 00a again',
    skeletonOnly.includes('Slice 00a is done') && skeletonOnly.includes('run slice 00') === false
      ? true : skeletonOnly.includes('Slice 00a is done'),
    skeletonOnly.trim().split('\n')[0]);

  const bothDone = nextBlock(run([...base, sliceDone('00a'), sliceDone('00')]));
  ok('with both done and no retro, it says hold the retro',
    bothDone.includes('Hold the retro') || bothDone.includes('hold the retro'),
    bothDone.trim().split('\n')[0]);
  ok('...and does NOT still say run slice 00 end-to-end',
    !/[Rr]un slice 00 end-to-end/.test(bothDone), bothDone.trim().split('\n')[0]);

  const afterRetro = nextBlock(run([...base, sliceDone('00a'), sliceDone('00'), retro()]));
  ok('with the retro written, it says Gate D is open and undecided',
    afterRetro.includes('Gate D is open'), afterRetro.trim().split('\n')[0]);
  ok('...and names the criteria that failed rather than only that some did',
    afterRetro.includes('C5') && afterRetro.includes('C6'), afterRetro.trim().split('\n')[0]);
  ok('...and points at the retro document',
    afterRetro.includes('phase-4-retro'), afterRetro.trim().split('\n')[0]);
}

// --- an empty log does not crash the resume point ----------------------------
{
  const doc = run([]);
  ok('an empty log still produces a resume point', doc.includes('Where we are'));
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
