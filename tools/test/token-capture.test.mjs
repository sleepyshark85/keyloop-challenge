#!/usr/bin/env node
/**
 * R-5 — the token accumulator in `.claude/hooks/log-agent-finish.mjs` could be
 * deleted and all 216 assertions in `test:tools` stayed green, because not one
 * of them read the emitted record's `tokens` field.
 *
 * That matters more than an ordinary coverage gap. C6 — "the budget is real" —
 * is measured from this accumulator and nothing else. A change in the harness's
 * transcript `usage` shape would zero every count silently, and a 13-slice cost
 * extrapolated from zeros is indistinguishable from agents that were cheap.
 * The phase-4 retro could not report a dollar figure at all for this reason.
 *
 * These cases name the mutant, per the retro's own operational rule: each one
 * fails if the accumulator is removed, mis-summed, or reads a renamed field.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const HOOK = join(ROOT, '.claude/hooks/log-agent-finish.mjs');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** A sandbox holding the real log tooling, a scope marker and a fake transcript. */
const sandbox = (turns) => {
  const dir = mkdtempSync(join(tmpdir(), 'token-capture-'));
  mkdirSync(join(dir, 'docs/team-log/prompts'), { recursive: true });
  cpSync(join(ROOT, 'tools'), join(dir, 'tools'), { recursive: true });
  writeFileSync(join(dir, 'docs/team-log/.scope'), JSON.stringify({ slice: '00' }), 'utf8');
  writeFileSync(join(dir, 'docs/team-log/events.jsonl'), '', 'utf8');

  const sessionDir = join(dir, 'session');
  mkdirSync(join(sessionDir, 'subagents'), { recursive: true });
  writeFileSync(join(sessionDir, 'subagents', 'agent-abc.jsonl'),
    turns.map((t) => JSON.stringify(t)).join('\n'), 'utf8');
  writeFileSync(join(sessionDir, 'subagents', 'agent-abc.meta.json'),
    JSON.stringify({ agentType: 'architect', description: 'design', toolUseId: 'tu_1', spawnDepth: 1 }), 'utf8');

  spawnSync('node', [HOOK], {
    input: JSON.stringify({ agent_id: 'abc', agent_type: 'architect', cwd: dir, transcript_path: `${sessionDir}.jsonl` }),
    encoding: 'utf8',
  });
  return dir;
};

/** The emitted agent.finish record — the artifact C6 is measured from. */
const record = (dir) => {
  const lines = readFileSync(join(dir, 'docs/team-log/events.jsonl'), 'utf8').split('\n').filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
};
const errors = (dir) => {
  const p = join(dir, 'docs/team-log/.hook-errors');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
};

const turn = (usage, ts = '2026-01-01T00:00:00Z') => ({
  type: 'assistant', timestamp: ts,
  message: { ...(usage ? { usage } : {}), content: [{ type: 'text', text: 'report' }] },
});

// --- the accumulator emits what it summed, and the sum is exact -------------
// Deleting the accumulator, or dropping any single field from it, fails here.
{
  const dir = sandbox([
    turn({ input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 200,
           cache_creation_input_tokens: 15, output_tokens_details: { thinking_tokens: 1 } },
         '2026-01-01T00:00:00Z'),
    turn({ input_tokens: 20, output_tokens: 5, cache_read_input_tokens: 300,
           cache_creation_input_tokens: 25, output_tokens_details: { thinking_tokens: 2 } },
         '2026-01-01T00:05:00Z'),
  ]);
  const r = record(dir);
  ok('the record carries a tokens field at all', r.tokens !== undefined, JSON.stringify(r.tokens));
  ok('input tokens are summed across turns', r.tokens?.in === 30, `got ${r.tokens?.in}`);
  ok('output tokens are summed across turns', r.tokens?.out === 7, `got ${r.tokens?.out}`);
  ok('cache reads are summed — the dominant term in the phase-4 figures',
    r.tokens?.cache_read === 500, `got ${r.tokens?.cache_read}`);
  ok('cache writes are summed', r.tokens?.cache_write === 40, `got ${r.tokens?.cache_write}`);
  ok('thinking tokens are read from the nested details object',
    r.tokens?.thinking === 3, `got ${r.tokens?.thinking}`);
}

// --- turns with no usage are skipped, not counted as zero -------------------
{
  const dir = sandbox([
    turn(null, '2026-01-01T00:00:00Z'),
    turn({ input_tokens: 7, output_tokens: 3 }, '2026-01-01T00:05:00Z'),
    turn(null, '2026-01-01T00:06:00Z'),
  ]);
  const r = record(dir);
  ok('a turn without a usage block does not disturb the sum',
    r.tokens?.in === 7 && r.tokens?.out === 3, JSON.stringify(r.tokens));
  ok('fields absent from the usage block count as zero, not NaN',
    r.tokens?.cache_read === 0 && r.tokens?.thinking === 0, JSON.stringify(r.tokens));
}

// --- THE R-5 CASE: a usage-shape change must be loud, never silent ----------
// This is the failure R-5 names. If the harness renames its usage fields, every
// term sums to zero. Absent-and-noted is recoverable; a zero that reads as a
// cheap agent is not, because C6 would extrapolate a 13-slice budget from it.
{
  const dir = sandbox([
    turn({ inputTokens: 10, outputTokens: 2 }, '2026-01-01T00:00:00Z'),
    turn({ inputTokens: 20, outputTokens: 5 }, '2026-01-01T00:05:00Z'),
  ]);
  const r = record(dir);
  ok('a renamed usage shape emits NO tokens field rather than zeros',
    r.tokens === undefined, JSON.stringify(r.tokens));
  ok('and it is reported to the sidecar, so the collector cannot fail quietly',
    /no token usage/i.test(errors(dir)), errors(dir).trim() || '(no errors file)');
}

// --- a transcript that genuinely has no turns is a different thing ----------
{
  const dir = sandbox([]);
  ok('an empty transcript does not claim a usage-shape change',
    !/no token usage/i.test(errors(dir)), errors(dir).trim());
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
