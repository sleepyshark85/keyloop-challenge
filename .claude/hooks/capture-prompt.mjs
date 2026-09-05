#!/usr/bin/env node
/**
 * PreToolUse on Task — capture every agent prompt as sent, before it runs.
 *
 * METHODOLOGY §9: "Prompts are written **before** invocation to
 * docs/team-log/prompts/<slice>-<agent>-<n>.md with the report beside them, so
 * the record cannot drift from what ran; the prompt library is the primary
 * evidence for *strategy for directing AI*."
 *
 * That was a rule the orchestrator was trusted to follow by hand, and it was
 * not followed: phases 2 and 3 ran with no prompt files at all.  A rule whose
 * only enforcement is discipline is a rule that records nothing on the day it
 * matters, so it becomes a hook — P3, executable beats asserted.
 *
 * Never blocks.  A failure to record must not stop the work being recorded;
 * it writes to .hook-errors and exits 0, exactly as log-agent-finish does.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveScope } from './scope.mjs';

const ROLES = new Set(['architect', 'test-engineer', 'implementer', 'reviewer', 'scribe']);

let payload;
try { payload = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }

// The subagent-spawn tool is `Task` in some Claude Code builds and `Agent` in
// others.  Matching only one silently captured nothing — which is how the very
// first pair of step-2 prompts went unrecorded after this hook was written.
const SPAWN_TOOLS = new Set(['Task', 'Agent']);
if (!SPAWN_TOOLS.has(payload.tool_name ?? '')) process.exit(0);

const cwd = payload.cwd ?? process.cwd();
const input = payload.tool_input ?? {};
const role = input.subagent_type ?? '';
// Only team roles are slice work.  A general-purpose research spike is
// orchestrator tooling and does not belong in the prompt library.
if (!ROLES.has(role)) process.exit(0);

const note = (msg) => {
  try {
    appendFileSync(join(cwd, 'docs/team-log/.hook-errors'),
      `${new Date().toISOString()} capture-prompt: ${msg}\n`, 'utf8');
  } catch { /* nothing further to try */ }
};

try {
  // ---- scope --------------------------------------------------------------
  // The same resolver log-agent-finish uses, so a prompt file and its agent.finish
  // record cannot disagree about which slice they belong to — which they did, silently,
  // for four runs at slice 02. See .claude/hooks/scope.mjs.
  const scope = resolveScope(cwd, (m) => note(`${m} (${role} invoked)`));
  const tag = scope.slice ? `s${scope.slice}` : `p${scope.phase ?? '0'}`;

  const dir = join(cwd, 'docs/team-log/prompts');
  mkdirSync(dir, { recursive: true });

  // ---- invocation number --------------------------------------------------
  // Nth invocation of this role in this scope.  Counts prompt files rather than
  // events, so it stays correct even if a run is never logged.
  const prefix = `${tag}-${role}-`;
  const n = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && /-(\d+)\.md$/.test(f))
    .reduce((max, f) => Math.max(max, Number(f.match(/-(\d+)\.md$/)[1])), 0) + 1;

  const scopeLine = scope.slice ? `slice ${scope.slice}` : `phase ${scope.phase ?? '0'}`;
  const file = join(dir, `${prefix}${n}.md`);

  writeFileSync(file, [
    `# Prompt · ${scopeLine} · ${role} · invocation ${n}`,
    '',
    `Captured at invocation by \`.claude/hooks/capture-prompt.mjs\`, per METHODOLOGY.md §9.`,
    `This file is the prompt **as sent** — written before the agent ran, not reconstructed after.`,
    '',
    `- Task: ${input.description ?? '—'}`,
    `- Sent: ${new Date().toISOString()}`,
    '',
    '---',
    '',
    String(input.prompt ?? '').trimEnd(),
    '',
  ].join('\n'), 'utf8');
} catch (err) {
  note(String(err?.message ?? err));
}

process.exit(0);
