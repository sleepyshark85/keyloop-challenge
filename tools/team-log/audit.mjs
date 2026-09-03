#!/usr/bin/env node
/**
 * Reconcile the event log against ground truth.
 *
 *   npm run log:audit
 *   npm run log:audit -- --since 2026-09-03
 *
 * The log is written by the orchestrator, which means it depends on the
 * orchestrator's diligence — and a record that depends on the diligence of the
 * thing being recorded is not evidence. This closes that gap by comparing the
 * log against artifacts the orchestrator does not author:
 *
 *   subagent transcripts   ~/.claude/projects/<slug>/<session>/subagents/
 *   git history            commits in the repository
 *
 * It reports in BOTH directions, which is the point:
 *
 *   OMISSION     an agent ran, or a commit exists, and the log does not say so
 *   UNSUPPORTED  the log claims an agent run that no transcript corroborates
 *
 * Omissions catch forgetting. Unsupported records catch invention. Run it at
 * every gate; a clean audit is what makes the numbers in §13 worth quoting.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { loadLog, LOG_PATH } from './write.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const since = flag('since');
const sinceTs = since ? Date.parse(since) : 0;

// Claude Code slugs the project directory by replacing non-alphanumerics with '-'.
const slug = process.cwd().replace(/[^a-zA-Z0-9]/g, '-');
const projectDir = join(homedir(), '.claude', 'projects', slug);

// ---------------------------------------------------- ground truth: agents --
function subagentRuns() {
  if (!existsSync(projectDir)) return { runs: [], sessions: 0 };
  const sessions = readdirSync(projectDir)
    .filter((f) => statSync(join(projectDir, f)).isDirectory());
  const runs = [];
  for (const s of sessions) {
    const dir = join(projectDir, s, 'subagents');
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
      const id = f.replace(/^agent-|\.jsonl$/g, '');
      let meta = {};
      const metaPath = join(dir, `agent-${id}.meta.json`);
      if (existsSync(metaPath)) { try { meta = JSON.parse(readFileSync(metaPath, 'utf8')); } catch {} }

      const lines = readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean)
        .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
      if (!lines.length) continue;

      const stamps = lines.map((l) => Date.parse(l.timestamp ?? l.ts)).filter((n) => !Number.isNaN(n));
      const start = stamps.length ? Math.min(...stamps) : null;
      const end = stamps.length ? Math.max(...stamps) : null;

      let tin = 0, tout = 0, cread = 0, cwrite = 0;
      for (const l of lines) {
        const u = l.message?.usage;
        if (!u) continue;
        tin += u.input_tokens ?? 0;
        tout += u.output_tokens ?? 0;
        cread += u.cache_read_input_tokens ?? 0;
        cwrite += u.cache_creation_input_tokens ?? 0;
      }
      runs.push({
        id, type: meta.agentType ?? '(unknown)', description: meta.description ?? '',
        start, end, duration: start && end ? end - start : null,
        tokens: { in: tin, out: tout, cache_read: cread, cache_write: cwrite },
        session: s,
      });
    }
  }
  return { runs: runs.sort((a, b) => (a.start ?? 0) - (b.start ?? 0)), sessions: sessions.length };
}

// ------------------------------------------------------ ground truth: git --
function commits() {
  try {
    const out = execFileSync('git', ['log', '--format=%H%x09%ct%x09%s'], { encoding: 'utf8' });
    return out.split('\n').filter(Boolean).map((l) => {
      const [sha, ct, subject] = l.split('\t');
      return { sha: sha.slice(0, 7), full: sha, ts: Number(ct) * 1000, subject };
    });
  } catch { return []; }
}

// ------------------------------------------------------------- reconcile ---
const log = loadLog();
const { runs, sessions } = subagentRuns();
const gitCommits = commits();

const ROLES = new Set(['architect', 'test-engineer', 'implementer', 'reviewer', 'scribe']);
const recent = (t) => !sinceTs || (t ?? 0) >= sinceTs;

// Only role agents are expected in the log; ad-hoc research agents are not team work.
const teamRuns = runs.filter((r) => ROLES.has(r.type) && recent(r.start));
const loggedFinishes = log.filter((e) => e.event === 'agent.finish' && ROLES.has(e.actor));

const findings = [];

// (1) an agent ran and the log is silent
for (const r of teamRuns) {
  const match = loggedFinishes.find((e) =>
    e.actor === r.type && Math.abs(Date.parse(e.ts) - (r.end ?? 0)) < 10 * 60 * 1000);
  if (!match) {
    findings.push({
      kind: 'OMISSION',
      what: `${r.type} ran for ${fmt(r.duration)} (${r.description || 'no description'}) — no agent.finish in the log`,
      when: r.end,
    });
  }
}

// (2) the log claims a run nothing corroborates
for (const e of loggedFinishes.filter((e) => recent(Date.parse(e.ts)))) {
  const match = teamRuns.find((r) =>
    r.type === e.actor && Math.abs(Date.parse(e.ts) - (r.end ?? 0)) < 10 * 60 * 1000);
  if (!match) {
    findings.push({
      kind: 'UNSUPPORTED',
      what: `log records ${e.actor} finishing at ${new Date(e.ts).toISOString().slice(11, 16)} — no subagent transcript corroborates it`,
      when: Date.parse(e.ts),
    });
  }
}

// (3) durations that disagree with the transcript
for (const e of loggedFinishes) {
  const r = teamRuns.find((r) =>
    r.type === e.actor && Math.abs(Date.parse(e.ts) - (r.end ?? 0)) < 10 * 60 * 1000);
  if (r && e.duration_ms && r.duration && Math.abs(e.duration_ms - r.duration) > 60_000) {
    findings.push({
      kind: 'MISMATCH',
      what: `${e.actor}: log says ${fmt(e.duration_ms)}, transcript says ${fmt(r.duration)}`,
      when: Date.parse(e.ts),
    });
  }
}

// (4) commits nothing in the log points at
const referenced = new Set(log.flatMap((e) => e.git?.commits ?? []).map((c) => c.slice(0, 7)));
const unreferenced = gitCommits.filter((c) => recent(c.ts) && !referenced.has(c.sha));

// ---------------------------------------------------------------- report ---
function fmt(ms) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}`;
}
const C = { OMISSION: '\x1b[31m', UNSUPPORTED: '\x1b[31m', MISMATCH: '\x1b[33m' };
const R = '\x1b[0m';
const dim = (s) => `\x1b[2m${s}${R}`;

console.log(`\nlog audit  ${dim(LOG_PATH().replace(process.cwd() + '/', ''))}`);
console.log(dim(`  ground truth: ${runs.length} subagent transcript(s) across ${sessions} session(s), ${gitCommits.length} commit(s)`));
console.log(dim(`  log: ${log.length} record(s), ${loggedFinishes.length} agent.finish`));

if (teamRuns.length) {
  console.log(dim('\n  AGENT RUNS ON DISK'));
  for (const r of teamRuns) {
    const t = r.tokens;
    console.log(`  ${r.type.padEnd(14)} ${fmt(r.duration).padEnd(7)} ` +
      dim(`in ${t.in} out ${t.out} cache-r ${t.cache_read} cache-w ${t.cache_write}`));
  }
}

if (findings.length) {
  console.log('\n  FINDINGS');
  for (const f of findings.sort((a, b) => (a.when ?? 0) - (b.when ?? 0))) {
    console.log(`  ${C[f.kind]}${f.kind.padEnd(12)}${R} ${f.what}`);
  }
}

if (unreferenced.length) {
  console.log(dim(`\n  ${unreferenced.length} commit(s) not referenced by any event:`));
  for (const c of unreferenced.slice(0, 10)) console.log(dim(`    ${c.sha}  ${c.subject}`));
  if (unreferenced.length > 10) console.log(dim(`    … and ${unreferenced.length - 10} more`));
  console.log(dim('  (expected for phase-0 and orchestrator commits; a slice commit here is a gap)'));
}

console.log();
if (!findings.length) {
  console.log('  \x1b[32mno discrepancies\x1b[0m — every recorded agent run is corroborated, and none is missing\n');
} else {
  console.log(`  \x1b[31m${findings.length} discrepanc${findings.length === 1 ? 'y' : 'ies'}\x1b[0m — the log does not match what happened\n`);
}
process.exit(findings.length ? 1 : 0);
