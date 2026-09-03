#!/usr/bin/env node
/**
 * Append one validated record to the team event log.
 *
 * The orchestrator is the sole writer (METHODOLOGY.md §5) — with two exceptions
 * that exist precisely because they cannot be fabricated: the post-commit hook
 * and the test reporter, which append `source: "derived"` records.
 *
 *   echo '{"event":"agent.finish","slice":"03","actor":"implementer",...}' \
 *     | node tools/team-log/append.mjs
 *
 *   node tools/team-log/append.mjs --json '{"event":"slice.ready","slice":"00"}'
 *
 * Exits non-zero on a schema violation and writes nothing. A slice cannot
 * advance on an invalid report.
 */
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validate, normalize, serialize } from './schema.mjs';

const LOG = process.env.TEAM_LOG ?? resolve('docs/team-log/events.jsonl');

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function loadPrior() {
  if (!existsSync(LOG)) return [];
  return readFileSync(LOG, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch {
        console.error(`warn: ${LOG}:${i + 1} is not valid JSON; ignoring for span numbering`);
        return null;
      }
    })
    .filter(Boolean);
}

const argv = process.argv.slice(2);
const jsonFlag = argv.indexOf('--json');
const raw = jsonFlag !== -1 ? argv[jsonFlag + 1] : readStdin();

if (!raw || !raw.trim()) {
  console.error('append: no event given. Pipe JSON on stdin or pass --json \'{...}\'.');
  process.exit(2);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  console.error(`append: input is not valid JSON — ${err.message}`);
  process.exit(2);
}

const events = Array.isArray(parsed) ? parsed : [parsed];
const prior = loadPrior();
const accepted = [];

for (const [i, e] of events.entries()) {
  const record = normalize(e, [...prior, ...accepted]);
  const { ok, errors } = validate(record);
  if (!ok) {
    console.error(`append: event[${i}] rejected (${errors.length} error(s)):`);
    for (const msg of errors) console.error(`  - ${msg}`);
    console.error('nothing was written.');
    process.exit(1);
  }
  accepted.push(record);
}

mkdirSync(dirname(LOG), { recursive: true });
appendFileSync(LOG, accepted.map(serialize).join('\n') + '\n', 'utf8');

for (const e of accepted) {
  console.log(`logged ${e.event} · slice ${e.slice ?? '--'} · ${e.span_id ?? ''}`);
}
