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
import { readFileSync, writeFileSync, existsSync, appendFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveScope } from './scope.mjs';

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
  // Hoisted: the report capture at the foot of this file reads the same parsed
  // transcript rather than re-reading the file.
  let lines = [];

  if (existsSync(subPath)) {
    lines = readFileSync(subPath, 'utf8').split('\n').filter(Boolean)
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
    // R-5. C6 — "the budget is real" — is measured from this accumulator and
    // nothing else. If the harness renames its usage fields, every term above
    // sums to zero; emitting `tokens: {in: 0, ...}` would then be indistinguishable
    // from an agent that was genuinely cheap, and a 13-slice cost extrapolated
    // from zeros reads as success. Absent-and-noted is recoverable. Silent zeros
    // are not — so a transcript with turns but no readable usage says so.
    if (tokens === null && lines.length) note(`no token usage read from ${subPath} (${lines.length} turns) — usage shape may have changed`);
  } else {
    note(`no transcript at ${subPath} for ${role}/${agentId}`);
  }

  let meta = {};
  if (existsSync(metaPath)) {
    try { meta = JSON.parse(readFileSync(metaPath, 'utf8')); } catch { /* optional */ }
  }

  // ---- scope ------------------------------------------------------------
  // Derived from the BRANCH first and the orchestrator's marker only as a fallback;
  // see .claude/hooks/scope.mjs for why, and for the four slice-02 runs that were
  // filed under slice 01 before it did.
  const scope = resolveScope(cwd, (m) => note(`${m} (${role} finished)`));

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

  // ---- the report, beside its prompt --------------------------------------
  // METHODOLOGY §9 asks for the prompt "with the report beside them".  The
  // report is the subagent's final assistant turn, which is already in the
  // transcript read above — so it is derived from what ran, not retyped by the
  // orchestrator, and cannot drift from it.
  try {
    const tag = scope.slice ? `s${scope.slice}` : `p${scope.phase ?? '0'}`;
    const dir = join(cwd, 'docs/team-log/prompts');
    if (existsSync(dir) && lines.length) {
      const prefix = `${tag}-${role}-`;
      // Pair with the highest-numbered prompt for this role and scope: the hook
      // that wrote it ran at the spawn this stop corresponds to.
      //
      // An agent RESUMED via SendMessage stops again without a new prompt file,
      // so a single `<scope>-<role>-<n>.report.md` would be overwritten by every
      // resume and only the last would survive.  During slice 00a the architect
      // was resumed six times and five reports were silently lost — the same
      // failure shape this slice kept finding elsewhere: a mechanism that looks
      // like it works because losing data is silent.  Resumes therefore get
      // `.report.2.md`, `.report.3.md`, … beside the first, so the reasoning
      // chain of a long adjudication survives in order.
      const n = readdirSync(dir)
        .filter((f) => f.startsWith(prefix) && /-(\d+)\.md$/.test(f))
        .reduce((max, f) => Math.max(max, Number(f.match(/-(\d+)\.md$/)[1])), 0);
      const last = [...lines].reverse().find((l) => l.type === 'assistant' && l.message?.content);
      const text = (last?.message?.content ?? [])
        .filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (n && text) {
        // First stop writes .report.md; each later stop of the same invocation
        // appends a numbered sibling rather than replacing it.
        const base = `${prefix}${n}.report`;
        let reportName = `${base}.md`;
        if (existsSync(join(dir, reportName))) {
          let turn = 2;
          while (existsSync(join(dir, `${base}.${turn}.md`))) turn++;
          reportName = `${base}.${turn}.md`;
        }
        writeFileSync(join(dir, reportName), [
          `# Report · ${scope.slice ? `slice ${scope.slice}` : `phase ${scope.phase ?? '0'}`} · ${role} · invocation ${n}`,
          '',
          'Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.',
          'This is the report **as returned** — it is derived, not retyped, so it cannot drift.',
          '',
          `- Task: ${meta.description ?? '—'}`,
          `- Returned: ${new Date().toISOString()}`,
          duration !== null ? `- Duration: ${Math.round(duration / 1000)}s` : '- Duration: —',
          '',
          '---',
          '',
          text,
          '',
        ].join('\n'), 'utf8');
      }
    }
  } catch (err) {
    note(`report capture failed for ${role}/${agentId}: ${err.message}`);
  }
} catch (err) {
  note(`failed to log ${role}/${agentId}: ${err.message}`);
}

process.exit(0);
