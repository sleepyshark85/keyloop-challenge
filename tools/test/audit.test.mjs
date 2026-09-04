#!/usr/bin/env node
/**
 * `npm run log:audit` is the check that makes the event log evidence rather than
 * self-report — C7, "the record is trustworthy", reads its output. It was itself
 * unpinned, and the phase-4 retro found two defects in it:
 *
 *   O-3   27 false discrepancies against an honest log, because runs were paired
 *         to transcripts by timestamp proximity one-to-one, and a resumed agent
 *         writes several agent.finish records against a single transcript.
 *         An audit that cries wolf 27 times is one nobody reads.
 *
 *   R-10  The git half of OMISSION was inert by construction — it required a
 *         `git` field no event has ever carried — so it gated nothing while the
 *         legend claimed it did.
 *
 * Fixing a check by making it quieter is the failure this project keeps finding:
 * a mechanism reporting success over work it never did. So every case below that
 * asserts silence is paired with one asserting the audit still speaks.
 */
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const T = (h, m = 0) => new Date(Date.UTC(2026, 0, 1, h, m)).toISOString();

/**
 * A sandbox with real tooling, a fake HOME holding subagent transcripts, a git
 * repo, and a slice backlog — the three ground truths the audit reconciles.
 */
const audit = ({ transcripts = [], events = [], slices = [], commits = [] }) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'audit-')));
  const home = join(dir, 'home');
  mkdirSync(join(dir, 'docs/team-log'), { recursive: true });
  mkdirSync(join(dir, 'docs/slices'), { recursive: true });
  cpSync(join(ROOT, 'tools'), join(dir, 'tools'), { recursive: true });

  const slug = dir.replace(/[^a-zA-Z0-9]/g, '-');
  const subDir = join(home, '.claude/projects', slug, 'session', 'subagents');
  mkdirSync(subDir, { recursive: true });
  for (const t of transcripts) {
    writeFileSync(join(subDir, `agent-${t.id}.jsonl`),
      t.stamps.map((ts) => JSON.stringify({ type: 'assistant', timestamp: ts, message: { content: [] } })).join('\n'), 'utf8');
    writeFileSync(join(subDir, `agent-${t.id}.meta.json`),
      JSON.stringify({ agentType: t.role, description: t.description ?? 'work' }), 'utf8');
  }

  writeFileSync(join(dir, 'docs/team-log/events.jsonl'),
    events.map((e) => JSON.stringify(e)).join('\n'), 'utf8');
  for (const id of slices) writeFileSync(join(dir, `docs/slices/${id}.md`), `---\nid: "${id}"\n---\n`, 'utf8');

  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  git('commit', '-q', '--allow-empty', '-m', 'chore: root');
  for (const subject of commits) git('commit', '-q', '--allow-empty', '-m', subject);

  const r = spawnSync('node', [join(dir, 'tools/team-log/audit.mjs')], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: home },
  });
  // eslint-disable-next-line no-control-regex
  return { out: (r.stdout ?? '').replace(/\x1b\[[0-9;]*m/g, ''), code: r.status };
};

const finish = (id, role, ts, durationMs) => ({
  ts, slice: '00', actor: role, event: 'agent.finish', source: 'derived',
  agent_id: id, duration_ms: durationMs, transcript: 'x',
});

// === O-3 — a resumed agent is ONE transcript and SEVERAL records =============
// The architect was resumed six times during slice 00a. Every resume after the
// first was reported as an invention, and each one's duration as a mismatch.
{
  const r = audit({
    transcripts: [{ id: 'arch1', role: 'architect', stamps: [T(0), T(6)] }],
    events: [
      finish('arch1', 'architect', T(0, 30), 30 * 60_000),
      finish('arch1', 'architect', T(3, 0), 20 * 60_000),
      finish('arch1', 'architect', T(6, 0), 25 * 60_000),
    ],
    slices: ['00'],
  });
  ok('three resumes against one transcript raise nothing', /no discrepancies/.test(r.out), r.out.slice(-400));
  ok('and the audit exits clean', r.code === 0, `exit ${r.code}`);
  ok('specifically, no resume is called an invention', !/UNSUPPORTED/.test(r.out));
  ok('and a log span shorter than the transcript is not a mismatch', !/MISMATCH/.test(r.out));
}

// --- but invention is still caught ------------------------------------------
{
  const r = audit({
    transcripts: [{ id: 'arch1', role: 'architect', stamps: [T(0), T(6)] }],
    events: [finish('arch1', 'architect', T(1), 60_000), finish('ghost', 'reviewer', T(2), 60_000)],
    slices: ['00'],
  });
  ok('a record whose agent_id has no transcript is UNSUPPORTED', /UNSUPPORTED/.test(r.out), r.out.slice(-400));
  ok('and it names the id it could not corroborate', /ghost/.test(r.out));
  ok('and the audit fails', r.code === 1, `exit ${r.code}`);
}

// --- and forgetting is still caught -----------------------------------------
{
  const r = audit({
    transcripts: [
      { id: 'arch1', role: 'architect', stamps: [T(0), T(1)] },
      { id: 'impl1', role: 'implementer', stamps: [T(2), T(3)], description: 'unlogged work' },
    ],
    events: [finish('arch1', 'architect', T(1), 60 * 60_000)],
    slices: ['00'],
  });
  ok('a transcript with no agent.finish at all is an OMISSION', /OMISSION/.test(r.out), r.out.slice(-400));
  ok('and it names the run that went unlogged', /unlogged work/.test(r.out));
}

// --- MISMATCH is directional, and the direction is the point ----------------
// A resume explains log < transcript. Nothing explains log > transcript.
{
  const r = audit({
    transcripts: [{ id: 'arch1', role: 'architect', stamps: [T(0), T(0, 10)] }],
    events: [finish('arch1', 'architect', T(0, 10), 5 * 60 * 60_000)],
    slices: ['00'],
  });
  ok('a record claiming MORE time than its transcript spans is a MISMATCH',
    /MISMATCH/.test(r.out), r.out.slice(-400));
  ok('and the audit fails on it', r.code === 1, `exit ${r.code}`);
}

// === R-10 — the git half of OMISSION now does work ==========================
{
  const r = audit({
    transcripts: [{ id: 'arch1', role: 'architect', stamps: [T(0), T(1)] }],
    events: [finish('arch1', 'architect', T(1), 60 * 60_000)],
    slices: ['00', '01'],
    commits: ['feat(01): work the log never heard about'],
  });
  ok('a commit scoped to a slice with no events is an OMISSION',
    /OMISSION.*slice 01/.test(r.out), r.out.slice(-500));
  ok('and it counts toward the discrepancy total rather than printing dimmed',
    r.code === 1, `exit ${r.code}`);
}

// --- a slice the log DOES know about is not a finding ------------------------
{
  const r = audit({
    transcripts: [{ id: 'arch1', role: 'architect', stamps: [T(0), T(1)] }],
    events: [finish('arch1', 'architect', T(1), 60 * 60_000)],
    slices: ['00', '01'],
    commits: ['feat(00): work the log has events for', 'chore(log): orchestrator tooling', 'Merge pull request #1 from x'],
  });
  ok('a slice commit whose slice has events raises nothing', !/OMISSION/.test(r.out), r.out.slice(-500));
  ok('a scope that is not a slice id is not treated as one', !/chore/.test(r.out.split('FINDINGS')[1] ?? ''));
  ok('non-slice commits are still listed for information', /not referenced by any event/.test(r.out));
  ok('and none of that gates', r.code === 0, `exit ${r.code}`);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
