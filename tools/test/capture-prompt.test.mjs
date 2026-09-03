#!/usr/bin/env node
/**
 * The prompt library is the primary evidence for "strategy for directing AI"
 * (METHODOLOGY §9), and it was empty for two whole phases because the rule was
 * enforced by discipline.  These cases exist so the replacement mechanism is
 * proven rather than assumed — the same standard §2.3 applies to layering.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../../.claude/hooks/capture-prompt.mjs', import.meta.url));
let pass = 0, fail = 0;

const sandbox = (scope) => {
  const dir = mkdtempSync(join(tmpdir(), 'capture-prompt-'));
  mkdirSync(join(dir, 'docs/team-log/prompts'), { recursive: true });
  if (scope) writeFileSync(join(dir, 'docs/team-log/.scope'), JSON.stringify(scope), 'utf8');
  return dir;
};

const run = (dir, payload) =>
  spawnSync('node', [HOOK], { input: JSON.stringify(payload), encoding: 'utf8' });

const prompts = (dir) => readdirSync(join(dir, 'docs/team-log/prompts')).sort();

const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

// --- a team role in a slice is captured -------------------------------------
{
  const dir = sandbox({ slice: '00a' });
  run(dir, { tool_name: 'Task', cwd: dir,
    tool_input: { subagent_type: 'architect', description: 'design', prompt: 'BODY-ONE' } });
  const files = prompts(dir);
  ok('a slice invocation is captured as s<slice>-<role>-1.md',
    files.length === 1 && files[0] === 's00a-architect-1.md', files.join(','));
  const body = readFileSync(join(dir, 'docs/team-log/prompts', files[0]), 'utf8');
  ok('the prompt is stored verbatim', body.includes('BODY-ONE'));
  ok('the header names the scope and role', body.includes('slice 00a') && body.includes('architect'));
}

// --- a phase invocation uses the p<phase> tag --------------------------------
{
  const dir = sandbox({ phase: '2' });
  run(dir, { tool_name: 'Task', cwd: dir,
    tool_input: { subagent_type: 'reviewer', description: 'review', prompt: 'X' } });
  ok('a phase invocation is captured as p<phase>-<role>-1.md',
    prompts(dir)[0] === 'p2-reviewer-1.md', prompts(dir).join(','));
}

// --- invocation numbers increment per role, per scope ------------------------
{
  const dir = sandbox({ slice: '00a' });
  for (const p of ['ONE', 'TWO', 'THREE']) {
    run(dir, { tool_name: 'Task', cwd: dir,
      tool_input: { subagent_type: 'implementer', description: 'd', prompt: p } });
  }
  run(dir, { tool_name: 'Task', cwd: dir,
    tool_input: { subagent_type: 'reviewer', description: 'd', prompt: 'R' } });
  const files = prompts(dir);
  ok('invocations increment per role', files.includes('s00a-implementer-3.md'), files.join(','));
  ok('a different role starts its own numbering', files.includes('s00a-reviewer-1.md'));
  ok('nothing is overwritten', files.length === 4, `${files.length} files`);
}

// --- what must NOT be captured ----------------------------------------------
{
  const dir = sandbox({ slice: '00a' });
  run(dir, { tool_name: 'Task', cwd: dir,
    tool_input: { subagent_type: 'general-purpose', description: 'spike', prompt: 'X' } });
  ok('a research spike is not in the prompt library', prompts(dir).length === 0);

  run(dir, { tool_name: 'Bash', cwd: dir, tool_input: { command: 'ls' } });
  ok('a non-Task tool is ignored', prompts(dir).length === 0);
}

// --- never blocks the work it records ---------------------------------------
{
  const dir = sandbox(null);   // no scope marker at all
  const r = run(dir, { tool_name: 'Task', cwd: dir,
    tool_input: { subagent_type: 'architect', description: 'd', prompt: 'X' } });
  ok('a missing scope marker still captures, defaulted to phase 0',
    r.status === 0 && prompts(dir).some((f) => f.startsWith('p0-architect-')), prompts(dir).join(','));
  ok('a missing scope marker is noted for the orchestrator',
    existsSync(join(dir, 'docs/team-log/.hook-errors')));

  const bad = spawnSync('node', [HOOK], { input: 'not json', encoding: 'utf8' });
  ok('a malformed payload never blocks the invocation', bad.status === 0);
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
