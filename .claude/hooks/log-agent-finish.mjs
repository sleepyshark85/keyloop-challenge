#!/usr/bin/env node
/**
 * SubagentStop hook — records every role-agent run automatically.
 *
 * This is the one part of the event log the orchestrator cannot influence. The
 * hook runs in the Claude Code harness, outside the model's context: it fires
 * when a subagent stops, whether or not the orchestrator remembers, wants to, or
 * reports the run accurately. Its records are `derived` because every number in
 * them is computed here from the subagent's own transcript.
 *
 * Payload (verified, Claude Code v2.1.259):
 *   { session_id, hook_event_name, agent_id, agent_type, last_assistant_message,
 *     cwd, permission_mode, transcript_path }
 *
 * Duration and tokens are NOT in the payload. They are computed from the
 * subagent's own transcript, whose location is derived in the body below —
 * note it is NOT beside the parent transcript, which is the obvious wrong guess.
 *
 * Never blocks. A logging failure must not prevent an agent from stopping, so
 * every path exits 0 and problems are written to the sidecar error file.
 */
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROLES = new Set(['architect', 'test-engineer', 'implementer', 'reviewer', 'scribe']);

let payload;
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}

const { agent_id: agentId, agent_type: role, cwd, transcript_path: transcriptPath } = payload;

// Only team roles are slice work. Research spikes are orchestrator tooling and
// show up in `npm run log:audit` ground truth without polluting the team record.
if (!agentId || !ROLES.has(role) || !cwd) process.exit(0);

const note = (msg) => {
  try {
    appendFileSync(join(cwd, 'docs/team-log/.hook-errors'),
      `${new Date().toISOString()} ${msg}\n`, 'utf8');
  } catch { /* nothing further to try */ }
};

try {
  process.chdir(cwd);
  const { appendRecords } = await import(resolve(cwd, 'tools/team-log/write.mjs'));

  // ---- read the subagent's own transcript -------------------------------
  // transcript_path is the PARENT session file:
  //   ~/.claude/projects/<slug>/<session-id>.jsonl
  // and subagent transcripts live in a directory of the same name, minus the
  // extension — NOT beside the parent file:
  //   ~/.claude/projects/<slug>/<session-id>/subagents/agent-<id>.jsonl
  const sessionDir = String(transcriptPath ?? '').replace(/\.jsonl$/, '');
  const subPath = join(sessionDir, 'subagents', `agent-${agentId}.jsonl`);
  const metaPath = join(sessionDir, 'subagents', `agent-${agentId}.meta.json`);

  let duration = null;
  let tokens = null;
  let resumed = false;

  if (existsSync(subPath)) {
    const lines = readFileSync(subPath, 'utf8').split('\n').filter(Boolean)
      .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });

    const stamps = lines.map((l) => Date.parse(l.timestamp ?? l.ts)).filter((n) => !Number.isNaN(n));
    if (stamps.length >= 2) {
      duration = Math.max(...stamps) - Math.min(...stamps);
      // A resumed agent's span includes the idle gap between invocations, which
      // would overstate the run. Flag it rather than silently reporting it.
      const gaps = stamps.slice().sort((a, b) => a - b)
        .map((t, i, a) => (i ? t - a[i - 1] : 0));
      resumed = gaps.some((g) => g > 10 * 60 * 1000);
    }

    let i = 0, o = 0, cr = 0, cw = 0, thinking = 0;
    for (const l of lines) {
      const u = l.message?.usage;
      if (!u) continue;
      i += u.input_tokens ?? 0;
      o += u.output_tokens ?? 0;
      cr += u.cache_read_input_tokens ?? 0;
      cw += u.cache_creation_input_tokens ?? 0;
      thinking += u.output_tokens_details?.thinking_tokens ?? 0;
    }
    if (i || o || cr || cw) tokens = { in: i, out: o, cache_read: cr, cache_write: cw, thinking };
  } else {
    note(`no transcript at ${subPath} for ${role}/${agentId}`);
  }

  let meta = {};
  if (existsSync(metaPath)) {
    try { meta = JSON.parse(readFileSync(metaPath, 'utf8')); } catch { /* optional */ }
  }

  // ---- scope ------------------------------------------------------------
  // The harness has no idea which slice is in flight; the orchestrator writes a
  // marker at the start of each slice or phase. Scope is not the falsifiable
  // part — whether the run happened, and how long it took, is, and that is
  // computed above.
  let scope = { phase: '0' };
  const markerPath = join(cwd, 'docs/team-log/.scope');
  if (existsSync(markerPath)) {
    try { scope = JSON.parse(readFileSync(markerPath, 'utf8')); }
    catch { note(`unparseable scope marker; defaulted to phase 0`); }
  } else {
    note(`no scope marker when ${role} finished; defaulted to phase 0`);
  }

  appendRecords({
    ...scope,
    event: 'agent.finish',
    actor: role,
    source: 'derived',
    outcome: 'completed',
    ...(duration !== null ? { duration_ms: duration } : {}),
    ...(tokens ? { tokens } : {}),
    agent_id: agentId,
    spawn_tool_use_id: meta.toolUseId,
    spawn_depth: meta.spawnDepth,
    transcript: subPath,
    ...(resumed ? { duration_caveat: 'agent was resumed; span includes idle time between invocations' } : {}),
    message: meta.description ?? '',
  }, { allowDerived: true });
} catch (err) {
  note(`failed to log ${role}/${agentId}: ${err.message}`);
}

process.exit(0);
