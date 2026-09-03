#!/usr/bin/env node
/**
 * Read the team event log from the terminal.  METHODOLOGY.md §9.
 *
 *   npm run log                                  # everything, newest last
 *   npm run log -- --slice 03                    # one slice
 *   npm run log -- --slice 03 --actor reviewer   # one role within it
 *   npm run log -- --event dcr.resolved          # every design change
 *   npm run log -- --source narrated             # what is opinion, not measurement
 *   npm run log -- --format jsonl                # pipe to jq
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DCR_RULINGS } from './schema.mjs';

const LOG = process.env.TEAM_LOG ?? resolve('docs/team-log/events.jsonl');

const argv = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const filters = {
  slice: flag('slice'),
  actor: flag('actor'),
  event: flag('event'),
  source: flag('source'),
  since: flag('since'),
};
const format = flag('format', 'table');

if (!existsSync(LOG)) {
  console.error(`no log at ${LOG} — nothing has been recorded yet.`);
  process.exit(0);
}

let rows = readFileSync(LOG, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l, i) => {
    try {
      return JSON.parse(l);
    } catch {
      console.error(`warn: line ${i + 1} is not valid JSON; skipped`);
      return null;
    }
  })
  .filter(Boolean);

if (filters.slice) rows = rows.filter((r) => r.slice === String(filters.slice).padStart(2, '0'));
if (filters.actor) rows = rows.filter((r) => r.actor === filters.actor);
if (filters.event) rows = rows.filter((r) => r.event === filters.event);
if (filters.source) rows = rows.filter((r) => r.source === filters.source);
if (filters.since) {
  const t = Date.parse(filters.since);
  if (Number.isNaN(t)) {
    console.error(`--since is not a parseable date: ${filters.since}`);
    process.exit(2);
  }
  rows = rows.filter((r) => Date.parse(r.ts) >= t);
}

rows.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

if (format === 'jsonl') {
  for (const r of rows) console.log(JSON.stringify(r));
  process.exit(0);
}
if (format === 'json') {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

// ---- table ----------------------------------------------------------------
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
// narrated records are opinion, not measurement — the view must say so (P5)
const MARK = { derived: '=', reported: '·', narrated: '~' };

const dur = (ms) => {
  if (ms === undefined) return '';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}`;
};

const detail = (r) => {
  switch (r.event) {
    case 'review.finding':
      return `${r.severity} ${r.file}${r.line ? `:${r.line}` : ''} — ${r.claim}`;
    case 'review.response':
      return `${r.finding_ref} → ${r.resolution}`;
    case 'dcr.raised':
      return `step ${r.step}: ${r.reason}`;
    case 'dcr.resolved':
      return `(${r.ruling}) ${DCR_RULINGS[r.ruling]} — ${r.rationale}` +
             (r.failing_criterion ? ` [${r.failing_criterion}]` : '');
    case 'loopback':
      return `step ${r.from_step} → ${r.to_step}: ${r.reason}`;
    case 'gate.decided':
      return `${r.gate}: ${r.decision} — ${r.rationale}`;
    case 'check.run':
      return Object.entries(r.checks ?? {}).map(([k, v]) => `${k}=${v}`).join(' ');
    case 'handoff':
      return `${r.from} → ${r.to}  ${r.artifact}`;
    case 'board.move':
      return `${r.board?.from} → ${r.board?.to}`;
    case 'arc42.updated':
      return (r.sections ?? []).join(' ');
    case 'adr.recorded':
      return typeof r.adr === 'object' ? JSON.stringify(r.adr) : String(r.adr);
    default:
      return r.message ?? r.outcome ?? '';
  }
};

if (rows.length === 0) {
  console.log('no matching events.');
  process.exit(0);
}

console.log(
  bold('TIME      SL  ACTOR         EVENT             DUR    DETAIL'),
);
for (const r of rows) {
  const t = new Date(r.ts).toISOString().slice(11, 19);
  const line =
    `${t}  ${(r.slice ?? '--').padEnd(3)} ` +
    `${(r.actor ?? '').padEnd(13)} ` +
    `${MARK[r.source] ?? ' '}${r.event.padEnd(17)} ` +
    `${dur(r.duration_ms).padEnd(6)} ` +
    detail(r);
  console.log(r.source === 'narrated' ? dim(line) : line);
}
console.log(
  dim(`\n${rows.length} event(s)   = derived (tooling)   · reported (agent)   ~ narrated (orchestrator)`),
);
