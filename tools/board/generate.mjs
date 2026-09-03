#!/usr/bin/env node
/**
 * Generate the team board from the event log and the slice files.
 *
 *   npm run board
 *   npm run board -- --log docs/team-log/events.demo.jsonl
 *   npm run board -- --watch
 *
 * Four panels, answering four questions (METHODOLOGY.md §9):
 *   BOARD     where is everything
 *   WATERFALL at which point did which agent do what — loopbacks included
 *   THREAD    what was communicated
 *   METRICS   what was the result, and the trend
 *
 * Output is gitignored: it is a view, never a source of truth (P2).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, watch } from 'node:fs';
import { resolve, join } from 'node:path';
import { BOARD_COLUMNS, DCR_RULINGS } from '../team-log/schema.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const LOG = resolve(flag('log', 'docs/team-log/events.jsonl'));
const SLICE_DIR = resolve(flag('slices', 'docs/slices'));
const OUT = resolve(flag('out', 'docs/board.html'));
const WATCH = argv.includes('--watch');

const WIP_LIMIT = 1;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- inputs ---

function loadEvents() {
  if (!existsSync(LOG)) return [];
  return readFileSync(LOG, 'utf8').split('\n').filter(Boolean)
    .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } })
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

/** Minimal frontmatter reader — scalars, inline arrays, quoted strings. */
function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let [, k, v] = kv;
    v = v.replace(/\s+#.*$/, '').trim();
    if (v === '' || v === 'null') { out[k] = null; continue; }
    if (v.startsWith('[')) {
      out[k] = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      continue;
    }
    out[k] = v.replace(/^["']|["']$/g, '');
  }
  return out;
}

function loadSlices() {
  if (!existsSync(SLICE_DIR)) return [];
  return readdirSync(SLICE_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => ({ file: f, ...frontmatter(readFileSync(join(SLICE_DIR, f), 'utf8')) }))
    .filter((s) => s.id)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

// --------------------------------------------------------------- derive ----

const fmtDur = (ms) => {
  if (!ms && ms !== 0) return '';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}`;
};

function summarise(slice, events) {
  const ev = events.filter((e) => e.slice === slice.id);
  const moves = ev.filter((e) => e.board?.to);
  const status = moves.length ? moves.at(-1).board.to : (slice.status ?? 'ready');

  const commits = new Set();
  for (const e of ev) for (const c of e.git?.commits ?? []) commits.add(c);

  const findings = ev.filter((e) => e.event === 'review.finding');
  const disputed = ev.filter((e) => e.event === 'review.response' && e.resolution === 'disputed');
  const mutation = [...ev].reverse().find((e) => e.checks?.mutation_score !== undefined);
  const loopbacks = ev.filter((e) => e.event === 'loopback').length;
  const interventions = ev.filter((e) => e.event === 'gate.decided' || e.event === 'escalation').length;
  const deferred = ev.filter((e) => e.event === 'dcr.resolved' && e.ruling === 'b').length;

  // Escape distance: steps between where a mismatch originated and where it was caught.
  const escapes = ev.filter((e) => e.event === 'dcr.raised').map((e) => Number(e.step) || 0);

  const wall = ev.length >= 2 ? Date.parse(ev.at(-1).ts) - Date.parse(ev[0].ts) : 0;

  return {
    ...slice, events: ev, status, wall,
    commits: commits.size,
    findings: findings.length,
    blocking: findings.filter((f) => f.severity === 'BLOCKING').length,
    disputed: disputed.length,
    mutation: mutation?.checks.mutation_score,
    loopbacks, interventions, deferred,
    escape: escapes.length ? Math.max(...escapes) : null,
  };
}

/** One bar per agent invocation, positioned across the slice's own span. */
function spans(s) {
  const finishes = s.events.filter((e) => e.event === 'agent.finish' && e.duration_ms);
  if (!finishes.length || !s.wall) return [];
  const t0 = Date.parse(s.events[0].ts);
  return finishes.map((e) => {
    const end = Date.parse(e.ts);
    const start = end - e.duration_ms;
    return {
      actor: e.actor,
      outcome: e.outcome,
      dur: e.duration_ms,
      left: Math.max(0, ((start - t0) / s.wall) * 100),
      width: Math.max(1.2, (e.duration_ms / s.wall) * 100),
      flag: e.outcome === 'blocked' ? 'blocked'
        : e.outcome === 'red-committed' ? 'red'
        : e.outcome === 'changes-requested' ? 'warn' : '',
    };
  });
}

function threadLine(e) {
  switch (e.event) {
    case 'handoff': return `${e.from} → ${e.to} · ${e.artifact}`;
    case 'check.run': return Object.entries(e.checks ?? {}).map(([k, v]) => `${k}=${v}`).join('  ');
    case 'review.finding': return `${e.severity} ${e.file}${e.line ? `:${e.line}` : ''} — ${e.claim}`;
    case 'review.response': return `${e.finding_ref} → ${e.resolution}${e.message ? ` · ${e.message}` : ''}`;
    case 'dcr.raised': return `step ${e.step}: ${e.reason}`;
    case 'dcr.discussed': return e.position;
    case 'dcr.resolved':
      return `(${e.ruling}) ${DCR_RULINGS[e.ruling]}${e.failing_criterion ? ` [${e.failing_criterion}]` : ''} — ${e.rationale}`;
    case 'loopback': return `step ${e.from_step} → ${e.to_step}: ${e.reason}`;
    case 'gate.decided': return `gate ${e.gate}: ${e.decision} — ${e.rationale}`;
    case 'board.move': return `${e.board?.from} → ${e.board?.to}`;
    case 'arc42.updated': return (e.sections ?? []).join(' ');
    case 'adr.recorded':
      return typeof e.adr === 'object'
        ? `ADR-${e.adr.id} ${e.adr.status}${e.adr.supersedes ? ` (supersedes ${e.adr.supersedes})` : ''}`
        : String(e.adr);
    case 'escalation': return e.reason;
    default: return e.message ?? e.outcome ?? '';
  }
}

// ---------------------------------------------------------------- render ---

function render(slices, events) {
  const active = slices.filter((s) => !['done', 'ready'].includes(s.status));
  const cols = BOARD_COLUMNS.filter((c) => c !== 'blocked');
  const blocked = slices.filter((s) => s.status === 'blocked');

  const board = cols.map((col) => {
    const inCol = slices.filter((s) => s.status === col);
    return `<div class="col"><div class="col-h">${col}<span>${inCol.length}</span></div>
      ${inCol.map((s) => `<div class="card ${s.status}">
        <div class="cid">${esc(s.id)}</div>
        <div class="ct">${esc(s.title)}</div>
        <div class="cm">${s.commits ? `${s.commits} commits` : '&mdash;'}${
          s.loopbacks ? ` · <span class="lb">⟲${s.loopbacks}</span>` : ''}</div>
      </div>`).join('') || '<div class="empty">—</div>'}</div>`;
  }).join('');

  const waterfalls = slices.filter((s) => s.events.length).map((s) => {
    const bars = spans(s);
    const loops = s.events.filter((e) => e.event === 'loopback');
    return `<section class="wf">
      <h3>${esc(s.id)} · ${esc(s.title)}
        <span class="meta">${fmtDur(s.wall)} · ${s.commits} commits${
          s.loopbacks ? ` · <span class="lb">⟲ ${s.loopbacks} loopback</span>` : ''}</span></h3>
      ${bars.map((b) => `<div class="row">
        <span class="who">${esc(b.actor)}</span>
        <span class="track"><span class="bar ${b.flag}" style="left:${b.left.toFixed(2)}%;width:${b.width.toFixed(2)}%"
          title="${esc(b.actor)} · ${esc(b.outcome)} · ${fmtDur(b.dur)}"></span></span>
        <span class="dur">${fmtDur(b.dur)}</span>
        <span class="oc ${b.flag}">${esc(b.outcome)}</span>
      </div>`).join('')}
      ${loops.map((l) => `<div class="loopnote">⟲ rewind · step ${esc(l.from_step)} → ${esc(l.to_step)} · ${esc(l.reason)}</div>`).join('')}
    </section>`;
  }).join('');

  const thread = events.map((e) => {
    const t = new Date(e.ts).toISOString().slice(11, 16);
    const mark = e.source === 'derived' ? '=' : e.source === 'narrated' ? '~' : '·';
    const key = ['dcr.resolved', 'loopback', 'gate.decided', 'review.finding', 'escalation'].includes(e.event);
    return `<div class="te ${e.source} ${key ? 'key' : ''}">
      <span class="tt">${t}</span>
      <span class="tsrc" title="${esc(e.source)}">${mark}</span>
      <span class="tev">${esc(e.event)}</span>
      <span class="tac">${esc(e.actor ?? '')}</span>
      <span class="td">${esc(threadLine(e))}</span></div>`;
  }).join('');

  const metrics = slices.filter((s) => s.events.length).map((s) => `<tr>
    <td class="mono">${esc(s.id)}</td><td>${esc(s.title)}</td>
    <td class="num">${fmtDur(s.wall)}</td><td class="num">${s.commits}</td>
    <td class="num">${s.findings}${s.disputed ? ` <span class="dim">(${s.disputed} disp)</span>` : ''}</td>
    <td class="num">${s.mutation !== undefined ? `${Math.round(s.mutation * 100)}%` : '—'}</td>
    <td class="num ${s.loopbacks ? 'lb' : ''}">${s.loopbacks}</td>
    <td class="num">${s.deferred}</td>
    <td class="num">${s.escape ?? '—'}</td>
    <td class="num">${s.interventions}</td></tr>`).join('');

  const isDemo = LOG.includes('demo');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Team board · Keyloop scheduler</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--paper:#f5f5f5;--paper2:#fff;--ink:#2d3142;--muted:#4f5d75;--soft:#7a8399;
--accent:#eb6c36;--link:#2e5aa8;--rule:rgba(45,49,66,.12);
--sans:'Geist',system-ui,sans-serif;--serif:'Instrument Serif',serif;--mono:'Geist Mono',ui-monospace,monospace}
@media (prefers-color-scheme:dark){:root{--paper:#2d3142;--paper2:rgba(245,245,245,.04);
--ink:#f5f5f5;--muted:#bfc0c0;--soft:#8f96a8;--rule:rgba(245,245,245,.14);--link:#7fa9e0}}
body{font-family:var(--sans);background:var(--paper);color:var(--ink);padding:2.5rem 2rem;font-size:13px;line-height:1.45}
.wrap{max-width:1280px;margin:0 auto}
.eyebrow{font-family:var(--mono);font-size:.66rem;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
h1{font-family:var(--serif);font-weight:400;font-size:2rem;letter-spacing:-.02em;margin:.25rem 0 .25rem}
.sub{color:var(--muted);margin-bottom:2rem}
.banner{border:1px solid var(--accent);background:rgba(235,108,54,.07);color:var(--ink);
padding:.6rem .9rem;border-radius:6px;margin-bottom:1.75rem;font-size:12px}
h2{font-family:var(--mono);font-size:.66rem;letter-spacing:.18em;text-transform:uppercase;
color:var(--muted);border-top:1px solid var(--rule);padding-top:.75rem;margin:2.25rem 0 1rem}
h2 .wip{float:right;letter-spacing:.08em}
.cols{display:grid;grid-template-columns:repeat(6,1fr);gap:.75rem}
.col-h{font-family:var(--mono);font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;
color:var(--muted);padding-bottom:.5rem;border-bottom:1px solid var(--rule);margin-bottom:.6rem}
.col-h span{float:right;color:var(--soft)}
.card{background:var(--paper2);border:1px solid var(--rule);border-radius:6px;padding:.6rem;margin-bottom:.5rem}
.card.red{border-color:var(--accent)}.card.blocked{border-color:var(--accent);background:rgba(235,108,54,.06)}
.cid{font-family:var(--mono);font-size:8.5px;color:var(--soft);letter-spacing:.1em}
.ct{font-weight:600;font-size:12px;margin:.15rem 0}
.cm{font-family:var(--mono);font-size:9px;color:var(--muted)}
.empty{color:var(--soft);font-size:11px;text-align:center;padding:.5rem}
.wf{margin-bottom:1.75rem}
.wf h3{font-size:12px;font-weight:600;margin-bottom:.6rem}
.wf h3 .meta{font-family:var(--mono);font-size:9px;color:var(--muted);font-weight:400;margin-left:.6rem}
.row{display:grid;grid-template-columns:110px 1fr 52px 120px;align-items:center;gap:.6rem;margin-bottom:.28rem}
.who{font-family:var(--mono);font-size:9px;color:var(--muted)}
.track{position:relative;height:12px;background:rgba(45,49,66,.05);border-radius:2px}
@media (prefers-color-scheme:dark){.track{background:rgba(245,245,245,.06)}}
.bar{position:absolute;top:0;height:12px;background:var(--muted);border-radius:2px;opacity:.75}
.bar.red,.bar.blocked,.bar.warn{background:var(--accent);opacity:1}
.dur,.oc{font-family:var(--mono);font-size:9px;color:var(--muted)}
.oc.red,.oc.blocked,.oc.warn{color:var(--accent)}
.loopnote{font-family:var(--mono);font-size:9px;color:var(--accent);margin:.35rem 0 .35rem 118px}
.lb{color:var(--accent)}
.te{display:grid;grid-template-columns:38px 12px 118px 96px 1fr;gap:.5rem;padding:.22rem 0;
border-bottom:1px solid var(--rule);font-size:11.5px;align-items:baseline}
.te.narrated{opacity:.55;font-style:italic}
.te.key .td{color:var(--accent)}
.tt,.tsrc,.tev,.tac{font-family:var(--mono);font-size:9px;color:var(--muted)}
.tsrc{color:var(--soft)}
.td{color:var(--ink)}
table{width:100%;border-collapse:collapse;font-size:11.5px}
th{font-family:var(--mono);font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;
color:var(--muted);text-align:left;padding:.4rem .5rem;border-bottom:1px solid var(--rule);font-weight:500}
td{padding:.4rem .5rem;border-bottom:1px solid var(--rule)}
.num{text-align:right;font-family:var(--mono);font-size:10px}
.mono{font-family:var(--mono);font-size:10px}
.dim{color:var(--soft)}
footer{margin-top:2.5rem;padding-top:.75rem;border-top:1px solid var(--rule);
font-family:var(--mono);font-size:9px;color:var(--soft)}
</style></head><body><div class="wrap">
<p class="eyebrow">Team board · generated</p>
<h1>Keyloop service scheduler</h1>
<p class="sub">Agent team telemetry — a slice is a trace, an agent invocation is a span.</p>
${isDemo ? '<div class="banner"><strong>Synthetic data.</strong> Rendered from <code>events.demo.jsonl</code>. Slice 99 is a fixture for checking the view, not real work.</div>' : ''}

<h2>Slices<span class="wip">WIP ${active.length}/${WIP_LIMIT}${active.length > WIP_LIMIT ? ' · OVER LIMIT' : ''}${blocked.length ? ` · ${blocked.length} blocked` : ''}</span></h2>
<div class="cols">${board}</div>

<h2>Waterfall</h2>
${waterfalls || '<p class="dim">No agent invocations recorded yet.</p>'}

<h2>Thread<span class="wip">= derived &nbsp; · reported &nbsp; ~ narrated</span></h2>
${thread || '<p class="dim">No events yet.</p>'}

<h2>Metrics</h2>
<table><thead><tr><th>Slice</th><th>Title</th><th class="num">Wall</th><th class="num">Commits</th>
<th class="num">Findings</th><th class="num">Mutation</th><th class="num">Loopbacks</th>
<th class="num">Deferred</th><th class="num">Escape</th><th class="num">Human</th></tr></thead>
<tbody>${metrics || '<tr><td colspan="10" class="dim">No completed slices.</td></tr>'}</tbody></table>

<footer>Generated ${new Date().toISOString()} from ${esc(LOG.replace(process.cwd() + '/', ''))} · npm run board</footer>
</div></body></html>`;
}

// ------------------------------------------------------------------ main ---

function build() {
  const events = loadEvents();
  const slices = loadSlices().map((s) => summarise(s, events));
  writeFileSync(OUT, render(slices, events), 'utf8');
  const rel = OUT.replace(process.cwd() + '/', '');
  console.log(`board → ${rel}  (${slices.length} slice(s), ${events.length} event(s))`);
}

build();
if (WATCH) {
  console.log('watching for changes… ctrl-c to stop');
  let t;
  const debounced = () => { clearTimeout(t); t = setTimeout(build, 150); };
  for (const p of [LOG, SLICE_DIR]) if (existsSync(p)) watch(p, debounced);
}
