#!/usr/bin/env node
/**
 * METHODOLOGY §9 asks for each prompt "with the report beside them".  The report
 * half is extracted from the agent's own transcript rather than retyped, so it
 * cannot drift from what the agent actually returned.  These cases prove the
 * extraction works and, more importantly, that it pairs the report with the
 * right prompt — a report filed under the wrong invocation is worse than none.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const HOOK = join(ROOT, '.claude/hooks/log-agent-finish.mjs');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** A sandbox with the real log tooling, a scope marker, and a fake transcript. */
const sandbox = ({ scope, promptFiles = [], turns }) => {
  const dir = mkdtempSync(join(tmpdir(), 'report-capture-'));
  mkdirSync(join(dir, 'docs/team-log/prompts'), { recursive: true });
  cpSync(join(ROOT, 'tools'), join(dir, 'tools'), { recursive: true });
  writeFileSync(join(dir, 'docs/team-log/.scope'), JSON.stringify(scope), 'utf8');
  writeFileSync(join(dir, 'docs/team-log/events.jsonl'), '', 'utf8');
  for (const f of promptFiles) writeFileSync(join(dir, 'docs/team-log/prompts', f), '# prompt', 'utf8');

  const sessionDir = join(dir, 'session');
  mkdirSync(join(sessionDir, 'subagents'), { recursive: true });
  writeFileSync(join(sessionDir, 'subagents', 'agent-abc.jsonl'),
    turns.map((t) => JSON.stringify(t)).join('\n'), 'utf8');
  writeFileSync(join(sessionDir, 'subagents', 'agent-abc.meta.json'),
    JSON.stringify({ agentType: 'architect', description: 'design', toolUseId: 'tu_1', spawnDepth: 1 }), 'utf8');
  return { dir, transcript: `${sessionDir}.jsonl` };
};

const turn = (text, ts) => ({
  type: 'assistant', timestamp: ts,
  message: { usage: { input_tokens: 1, output_tokens: 2 }, content: [{ type: 'text', text }] },
});

const run = ({ dir, transcript }) => spawnSync('node', [HOOK], {
  input: JSON.stringify({ agent_id: 'abc', agent_type: 'architect', cwd: dir, transcript_path: transcript }),
  encoding: 'utf8',
});

const files = (dir) => readdirSync(join(dir, 'docs/team-log/prompts')).sort();

// --- the happy path ---------------------------------------------------------
{
  const s = sandbox({
    scope: { slice: '00a' },
    promptFiles: ['s00a-architect-1.md'],
    turns: [turn('early thinking', '2026-01-01T00:00:00Z'), turn('THE FINAL REPORT', '2026-01-01T00:05:00Z')],
  });
  run(s);
  ok('a report is written beside its prompt',
    files(s.dir).includes('s00a-architect-1.report.md'), files(s.dir).join(','));
  const body = readFileSync(join(s.dir, 'docs/team-log/prompts/s00a-architect-1.report.md'), 'utf8');
  ok('the report is the agent\'s LAST turn, not its first', body.includes('THE FINAL REPORT'));
  ok('earlier turns are not mistaken for the report', !body.includes('early thinking'));
  ok('the report records the duration it was measured over', /Duration: 300s/.test(body));
}

// --- pairing: the report must find the RIGHT invocation ---------------------
{
  const s = sandbox({
    scope: { slice: '00a' },
    promptFiles: ['s00a-architect-1.md', 's00a-architect-2.md', 's00a-architect-3.md'],
    turns: [turn('THIRD RUN REPORT', '2026-01-01T00:00:00Z')],
  });
  run(s);
  ok('the report pairs with the highest-numbered prompt for that role and scope',
    files(s.dir).includes('s00a-architect-3.report.md'), files(s.dir).join(','));
  ok('earlier invocations are not overwritten',
    !files(s.dir).includes('s00a-architect-1.report.md'));
}

// --- a report with no prompt is not invented ---------------------------------
{
  const s = sandbox({ scope: { slice: '00a' }, promptFiles: [], turns: [turn('R', '2026-01-01T00:00:00Z')] });
  run(s);
  ok('no prompt file means no orphan report', files(s.dir).length === 0, files(s.dir).join(','));
  ok('the run is still logged even when the report is not',
    readFileSync(join(s.dir, 'docs/team-log/events.jsonl'), 'utf8').includes('agent.finish'));
}

// --- the log is the primary duty; report capture may never break it ---------
{
  const s = sandbox({
    scope: { slice: '00a' }, promptFiles: ['s00a-architect-1.md'],
    turns: [{ type: 'assistant', timestamp: '2026-01-01T00:00:00Z', message: { usage: { input_tokens: 1 } } }],
  });
  const r = run(s);
  ok('a turn with no text content does not crash the hook', r.status === 0);
  ok('agent.finish is logged regardless',
    readFileSync(join(s.dir, 'docs/team-log/events.jsonl'), 'utf8').includes('agent.finish'));
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
