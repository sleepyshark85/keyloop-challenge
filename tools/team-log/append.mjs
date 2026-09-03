#!/usr/bin/env node
/**
 * Orchestrator write path into the team event log.
 *
 *   echo '{"event":"agent.finish","slice":"03","actor":"implementer",...}' \
 *     | node tools/team-log/append.mjs
 *
 *   node tools/team-log/append.mjs --json '{"event":"slice.ready","slice":"00"}'
 *
 * Records written here are `reported` or `narrated`. **`derived` is refused** —
 * that tier asserts a fact came from tooling, and is reserved for the collectors
 * that compute it (collect-git.mjs, and the SubagentStop hook). See write.mjs.
 *
 * Exits non-zero on a schema violation and writes nothing.
 */
import { readFileSync } from 'node:fs';
import { appendRecords } from './write.mjs';

const argv = process.argv.slice(2);
const jsonFlag = argv.indexOf('--json');
const raw = jsonFlag !== -1
  ? argv[jsonFlag + 1]
  : (() => { try { return readFileSync(0, 'utf8'); } catch { return ''; } })();

if (!raw || !raw.trim()) {
  console.error("append: no event given. Pipe JSON on stdin or pass --json '{...}'.");
  process.exit(2);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  console.error(`append: input is not valid JSON — ${err.message}`);
  process.exit(2);
}

try {
  for (const e of appendRecords(parsed)) {
    console.log(`logged ${e.event} · ${e.slice ? `slice ${e.slice}` : `phase ${e.phase}`} · ${e.span_id ?? ''}`);
  }
} catch (err) {
  console.error(`append: ${err.message}`);
  console.error('nothing was written.');
  process.exit(1);
}
