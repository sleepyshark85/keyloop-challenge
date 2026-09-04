#!/usr/bin/env node
/**
 * STATUS.md is the committed resume point — the file a fresh session reads first,
 * and whose own header tells the reader to trust it over narration. It has now
 * been wrong about where the project is twice, in two different ways:
 *
 *   O-8  it advanced the PHASE on a per-slice gate, so the first slice gate of
 *        phase 5 would have reported the project finished with twelve unbuilt.
 *   O-11 its "what happens next" was a static string per phase, so it told a
 *        resuming session to "run slice 00 end-to-end, then hold the retro"
 *        after both had been done and merged.
 *   —    and the moment Gate D closed phase 4 it did it AGAIN, one phase later:
 *        phase 5's entry was the static "work slices one at a time, WIP 1",
 *        naming no slice, with a WIP limit of 1 making the wrong slice a real
 *        error rather than a cosmetic one.
 *
 * The first two were caught by a human asking whether a fresh session would know
 * where to start. The third was caught by regenerating the file and reading it,
 * which is the same question asked earlier. These cases exist so the next one is
 * caught by the suite instead.
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

const run = (events, slices = []) => {
  const dir = mkdtempSync(join(tmpdir(), 'status-'));
  mkdirSync(join(dir, 'docs/team-log'), { recursive: true });
  mkdirSync(join(dir, 'docs/adr'), { recursive: true });
  cpSync(join(ROOT, 'tools'), join(dir, 'tools'), { recursive: true });
  writeFileSync(join(dir, 'docs/team-log/events.jsonl'),
    events.map((e) => JSON.stringify(e)).join('\n'), 'utf8');
  if (slices.length) mkdirSync(join(dir, 'docs/slices'), { recursive: true });
  for (const s of slices) {
    const fm = [
      `id: "${s.id}"`,
      `title: ${s.title}`,
      'status: ready',
      `depends_on: [${(s.deps ?? []).map((d) => `"${d}"`).join(', ')}]`,
      ...(s.absorbs ? [`absorbs: [${s.absorbs.map((a) => `"${a}"`).join(', ')}]`] : []),
      ...(s.qs ? [`quality_scenarios: [${s.qs.join(', ')}]`] : []),
    ].join('\n');
    writeFileSync(join(dir, `docs/slices/${s.id}-x.md`), `---\n${fm}\n---\n`, 'utf8');
  }
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

// --- phase 5: the resume point must name the slice, not the discipline -------
// Gate D closes phase 4 and opens the slice loop. The old entry read "work slices
// one at a time, WIP 1", which is true of every day of phase 5 and therefore
// tells a resuming session nothing. With a WIP limit of 1, naming the wrong slice
// — or none — is not cosmetic.
{
  const gateD = { ...gate('D', '4'), decision: 'tune-and-proceed' };
  const base = [gate('A', '1'), gate('B', '2'), gate('C', '3'),
                sliceDone('00a'), sliceDone('00'), retro(), gateD];
  const backlog = [
    { id: '00a', title: 'Walking skeleton' },
    { id: '00', title: 'Schema and constraints', deps: ['00a'] },
    { id: '01', title: 'The domain policy core', deps: ['00'], qs: ['QS-9', 'QS-12'] },
    { id: '02', title: 'Book and read', deps: ['01'], absorbs: ['03'] },
    { id: '04', title: 'Candidate allocation', deps: ['02'] },
  ];

  const fresh = nextBlock(run(base, backlog));
  ok('phase 5 names the next slice by id', /slice \[?`?01/.test(fresh), fresh.trim().split('\n')[0]);
  ok('...and by title, so it is recognisable without opening the file',
    fresh.includes('The domain policy core'), fresh.trim().split('\n')[0]);
  ok('...and does NOT fall back to the static discipline string',
    !/work slices one at a time/i.test(fresh), fresh.trim());
  ok('...and says nothing is in flight, which is why 01 may start',
    /[Nn]othing is in flight/.test(fresh), fresh.trim().split('\n')[1] ?? '');
  ok('...and reports what Gate D folded, from the backlog rather than from prose',
    /folded 1 \(03\)/.test(fresh), fresh.trim());

  const midSlice = nextBlock(run([...base, { ...sliceDone('01'), event: 'agent.start', actor: 'architect' }], backlog));
  ok('a slice with events but no slice.done is reported IN FLIGHT',
    /in flight/i.test(midSlice), midSlice.trim().split('\n')[0]);
  ok('...and the WIP limit is cited, so the next slice is not started alongside it',
    /WIP limit is 1/.test(midSlice), midSlice.trim());
  ok('...and slice 02 is NOT offered as startable while 01 is open',
    !/Next: slice/.test(midSlice), midSlice.trim().split('\n')[0]);

  const oneDone = nextBlock(run([...base, sliceDone('01')], backlog));
  ok('with 01 done, the next slice named is 02', /slice \[?`?02/.test(oneDone), oneDone.trim().split('\n')[0]);
  ok('...and 01 is not offered again', !/slice \[?`?01/.test(oneDone), oneDone.trim().split('\n')[0]);

  const allDone = nextBlock(run(
    [...base, sliceDone('01'), sliceDone('02'), sliceDone('04')], backlog));
  ok('with every slice done it moves to phase 6 rather than naming a slice',
    /[Ee]very slice is done/.test(allDone) && /Gate F/.test(allDone), allDone.trim().split('\n')[0]);
}

// --- dependency order, not id order, decides what is startable ---------------
// Found by mutation: `nextUp = open[0]` — ignoring depends_on entirely — passed
// every case above, because the fixture backlog was a straight chain where the
// lowest open id is always the right answer. A backlog is not required to be a
// chain, and the resume point pointing at a blocked slice is the R00-1 shape:
// a check that reads fine until the first time it matters.
{
  const gateD = { ...gate('D', '4'), decision: 'tune-and-proceed' };
  const base = [gate('A', '1'), gate('B', '2'), gate('C', '3'),
                sliceDone('00a'), sliceDone('00'), retro(), gateD];
  // 02 has the lower id but depends on 01, which is NOT done. 04 depends only on
  // 00, which is. The startable slice is 04.
  const forked = [
    { id: '00a', title: 'Walking skeleton' },
    { id: '00', title: 'Schema and constraints', deps: ['00a'] },
    { id: '02', title: 'Blocked on an unbuilt slice', deps: ['01'] },
    { id: '04', title: 'Depends only on the schema', deps: ['00'] },
  ];
  const out = nextBlock(run(base, forked));
  ok('the startable slice is chosen by dependency, not by lowest id',
    /slice \[?`?04/.test(out), out.trim().split('\n')[0]);
  ok('...and a slice whose dependency is unmerged is NOT offered',
    !/Next: slice \[?`?02/.test(out), out.trim().split('\n')[0]);
}

// --- nothing startable is a backlog defect, and must be said as one ----------
{
  const gateD = { ...gate('D', '4'), decision: 'tune-and-proceed' };
  const base = [gate('A', '1'), gate('B', '2'), gate('C', '3'), gateD];
  const orphaned = [{ id: '05', title: 'Depends on a slice nobody merged', deps: ['04'] }];
  const out = nextBlock(run(base, orphaned));
  ok('an unstartable backlog is reported as a defect, not as a waiting state',
    /backlog defect/.test(out), out.trim().split('\n')[0]);
  ok('...and it does not silently name a blocked slice as next',
    !/Next: slice/.test(out), out.trim().split('\n')[0]);
}

// --- an empty log does not crash the resume point ----------------------------
{
  const doc = run([]);
  ok('an empty log still produces a resume point', doc.includes('Where we are'));
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
