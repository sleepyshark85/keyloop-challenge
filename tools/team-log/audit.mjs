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
 *   OMISSION     an agent ran, or a slice commit exists, and the log is silent
 *   UNSUPPORTED  the log claims an agent run that no transcript corroborates
 *   MISMATCH     the log claims MORE time than the transcript spans
 *
 * Omissions catch forgetting. Unsupported records catch invention. Run it at
 * every gate; a clean audit is what makes the numbers in §13 worth quoting.
 *
 * Two corrections out of the phase-4 retro, both instances of the same shape —
 * a check that reported over work it had not done:
 *
 *   O-3  Runs were paired to transcripts by timestamp proximity, one-to-one.
 *        A resumed agent stops once per resume and writes one agent.finish each,
 *        but all resumes share ONE transcript, so every resume after the first
 *        was reported UNSUPPORTED and its duration MISMATCHed. 27 discrepancies
 *        against an honest log. Pairing is now by `agent_id`, which the hook has
 *        always written, and MISMATCH is directional: a log span SHORTER than
 *        the transcript is what a resume predicts, while a log claiming more
 *        time than the transcript spans is the direction invention runs in.
 *
 *   R-10 The git half of OMISSION was inert by construction: it required events
 *        to carry a `git` field and no event has ever carried one, so every
 *        commit was "unreferenced", printed dimmed, and gated nothing. Linkage
 *        is now DERIVED from the Conventional Commit scope — a commit scoped to
 *        a known slice id whose slice has no events in the log is a real
 *        omission and counts. Nothing needs backfilling for that to work.
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

// ---------------------------------------------------- ground truth: slices --
// The backlog's own ids, so a commit scope can be recognised as a slice rather
// than as a phase or an area. Read from the files rather than hardcoded: a new
// slice must not silently fall outside the audit.
function sliceIds() {
  const dir = join(process.cwd(), 'docs/slices');
  if (!existsSync(dir)) return new Set();
  const ids = new Set();
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    const m = src.match(/^id:\s*"?([^"\n]+)"?/m);
    if (m) ids.add(m[1].trim());
    // A slice folded into another keeps its id recognisable here even though the
    // tombstone carries no `id:`. Gate D folded 03 into 02 and 10 and 11 into 09;
    // a commit still scoped `feat(03):` afterwards is a mistake worth catching,
    // and dropping the id from the audit is how it would stop being caught.
    const a = src.match(/^absorbs:\s*\[([^\]]*)\]/m);
    if (a) for (const id of a[1].match(/"([^"]+)"/g) ?? []) ids.add(id.replace(/"/g, ''));
  }
  return ids;
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

// O-3. Pair by agent_id, which the SubagentStop hook has always written, rather
// than by timestamp proximity. One transcript may legitimately carry SEVERAL
// agent.finish records — an agent resumed via SendMessage stops once per resume
// and writes one each, while all of them append to the single transcript for
// that agent_id. Proximity pairing called every resume after the first an
// invention. Ids are matched against ALL runs on disk, not the --since window,
// so a resume inside the window whose transcript began before it is still paired.
const runById = new Map(runs.map((r) => [r.id, r]));
const pairOf = (e) => {
  if (e.agent_id) return runById.get(e.agent_id) ?? null;
  // Records written before the hook carried agent_id fall back to the old
  // heuristic. Nothing in the log needs rewriting for the fix to apply.
  return teamRuns.find((r) =>
    r.type === e.actor && Math.abs(Date.parse(e.ts) - (r.end ?? 0)) < 10 * 60 * 1000) ?? null;
};
const finishesFor = (r) => loggedFinishes.filter((e) =>
  e.agent_id ? e.agent_id === r.id
             : e.actor === r.type && Math.abs(Date.parse(e.ts) - (r.end ?? 0)) < 10 * 60 * 1000);

// (1) an agent ran and the log is silent
for (const r of teamRuns) {
  if (!finishesFor(r).length) {
    findings.push({
      kind: 'OMISSION',
      what: `${r.type} ran for ${fmt(r.duration)} (${r.description || 'no description'}) — no agent.finish in the log`,
      when: r.end,
    });
  }
}

// (2) the log claims a run nothing corroborates
for (const e of loggedFinishes.filter((e) => recent(Date.parse(e.ts)))) {
  if (!pairOf(e)) {
    findings.push({
      kind: 'UNSUPPORTED',
      what: `log records ${e.actor} finishing at ${new Date(e.ts).toISOString().slice(11, 16)}`
          + `${e.agent_id ? ` as ${e.agent_id}` : ''} — no subagent transcript corroborates it`,
      when: Date.parse(e.ts),
    });
  }
}

// (3) durations that claim more than the transcript spans
// Directional, per O-3. A resumed agent's record covers ONE invocation while the
// transcript spans them all, so log < transcript is what an honest resume looks
// like and firing on it is what made the audit cry wolf. A record claiming MORE
// time than its transcript spans cannot be explained that way, and that is the
// direction invention runs in.
for (const e of loggedFinishes) {
  const r = pairOf(e);
  if (r && e.duration_ms && r.duration && e.duration_ms - r.duration > 60_000) {
    findings.push({
      kind: 'MISMATCH',
      what: `${e.actor}: log claims ${fmt(e.duration_ms)}, transcript spans only ${fmt(r.duration)}`,
      when: Date.parse(e.ts),
    });
  }
}

// (4) R-10. Commits the log cannot account for.
// The `git.commits` field this once relied on has never been written by anything,
// so the check was inert and every commit read as unreferenced. Linkage is now
// derived from the Conventional Commit scope §7 already mandates: a commit
// scoped to a known slice id belongs to that slice's work, so if the log holds
// no events for that slice, the log is missing work that demonstrably happened.
// That is an OMISSION under the legend's own wording, and it now counts as one.
const ids = sliceIds();
const scopeOf = (subject) => subject.match(/^[a-z]+\(([^)]+)\)!?:/)?.[1] ?? null;
const slicesInLog = new Set(log.filter((e) => e.slice != null).map((e) => String(e.slice)));
const referenced = new Set(log.flatMap((e) => e.git?.commits ?? []).map((c) => c.slice(0, 7)));

for (const c of gitCommits.filter((c) => recent(c.ts) && !referenced.has(c.sha))) {
  const scope = scopeOf(c.subject);
  if (scope && ids.has(scope) && !slicesInLog.has(scope)) {
    findings.push({
      kind: 'OMISSION',
      what: `commit ${c.sha} is scoped to slice ${scope} (${c.subject}) — the log has no events for that slice`,
      when: c.ts,
    });
  }
}

// Everything else — phase work, orchestrator tooling, merges — is reported for
// information and does not gate. Stated plainly rather than dressed as a check.
const unreferenced = gitCommits.filter((c) => {
  if (!recent(c.ts) || referenced.has(c.sha)) return false;
  const scope = scopeOf(c.subject);
  return !(scope && ids.has(scope));
});

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
