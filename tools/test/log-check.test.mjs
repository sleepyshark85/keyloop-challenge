#!/usr/bin/env node
/**
 * `tools/team-log/check.mjs` — the schema guard over the event log.
 *
 * The guard's own failure mode is the one that produced it: it must be RUNNABLE where
 * the mistake is made, and it must FAIL. A validator that exits 0 over a log it never
 * parsed is the same defect this project has now catalogued nine times, so the cases
 * below assert the failing direction first and name the exit code, not just the text.
 *
 * The two event types added at slice 01 under the human's ruling — `finding.resolved`
 * and `backlog.added` — are asserted from BOTH sides: a well-formed one is accepted, and
 * one missing the field that carries its meaning is rejected. Accepting them is the easy
 * half and proves nothing on its own; a schema entry with no required fields would pass
 * it.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CHECK = fileURLToPath(new URL('../team-log/check.mjs', import.meta.url));
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** Records are written as raw lines so a malformed-JSON case is expressible. */
const run = (lines) => {
  const dir = mkdtempSync(join(tmpdir(), 'log-check-'));
  mkdirSync(join(dir, 'docs/team-log'), { recursive: true });
  writeFileSync(join(dir, 'docs/team-log/events.jsonl'),
    lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n', 'utf8');
  return spawnSync('node', [CHECK], { cwd: dir, encoding: 'utf8' });
};

const valid = (over = {}) => ({
  ts: '2026-01-01T00:00:00Z', slice: '01', event: 'slice.ready', source: 'reported', ...over,
});

// --- it fails, and says where ------------------------------------------------
{
  const r = run([valid(), valid({ event: 'not.an.event' }), valid()]);
  ok('an unknown event name is rejected', r.status === 1, `exit ${r.status}`);
  ok('the offending line number is named', /:2\b|,line=2/.test(r.stdout), r.stdout.trim());
  ok('the record count and the invalid count are both reported',
    /3 record\(s\) checked, 1 invalid/.test(r.stderr), r.stderr.trim());
}
{
  const r = run([valid(), '{not json', valid()]);
  ok('a line that is not JSON is rejected rather than crashing the run',
    r.status === 1 && /not valid JSON/.test(r.stdout), `exit ${r.status}`);
  ok('a bad line does not stop later lines being checked',
    /3 record\(s\) checked/.test(r.stderr), r.stderr.trim());
}
{
  const r = run([valid({ source: 'invented' })]);
  ok('an invalid trust tier is rejected', r.status === 1 && /invalid source/.test(r.stdout));
}
{
  const r = run([{ ts: '2026-01-01T00:00:00Z', event: 'slice.ready', source: 'reported' }]);
  ok('an unscoped record — neither slice nor phase — is rejected',
    r.status === 1 && /must be scoped/.test(r.stdout));
}

// --- it passes, and only over a log it actually read --------------------------
{
  const r = run([valid(), valid({ slice: '02' })]);
  ok('a valid log exits 0', r.status === 0, r.stdout + r.stderr);
  ok('success names how many records were checked, so exit 0 over an empty read is visible',
    /2 record\(s\) checked, 0 invalid/.test(r.stdout), r.stdout.trim());
}
{
  const dir = mkdtempSync(join(tmpdir(), 'log-check-'));
  const r = spawnSync('node', [CHECK], { cwd: dir, encoding: 'utf8' });
  ok('a missing log is exit 2 — "no evidence" is not "no problems"', r.status === 2, `exit ${r.status}`);
}

// --- the two event types added at slice 01, asserted from both sides ----------
{
  const resolved = (over = {}) => valid({
    event: 'finding.resolved', actor: 'orchestrator', ref: 'R-01-3',
    message: 'the mutant was re-run and the control failed under it', ...over,
  });
  ok('a well-formed finding.resolved is accepted', run([resolved()]).status === 0);

  const noRef = run([resolved({ ref: undefined })]);
  ok('finding.resolved without a ref is rejected — it would close an unnamed finding',
    noRef.status === 1 && /missing required field: ref/.test(noRef.stdout), noRef.stdout.trim());

  const noMessage = run([resolved({ message: undefined })]);
  ok('finding.resolved without a message is rejected — a resolution that names no evidence is narration',
    noMessage.status === 1 && /missing required field: message/.test(noMessage.stdout));

  const noActor = run([resolved({ actor: undefined })]);
  ok('finding.resolved without an actor is rejected', noActor.status === 1);
}
{
  const added = (over = {}) => valid({
    event: 'backlog.added', actor: 'orchestrator', slices_added: ['12', '13'], ...over,
  });
  ok('a well-formed backlog.added is accepted', run([added()]).status === 0);

  const empty = run([added({ slices_added: [] })]);
  ok('backlog.added with an empty slices_added is rejected — a deferral that deferred nothing',
    empty.status === 1 && /non-empty array/.test(empty.stdout), empty.stdout.trim());

  const notArray = run([added({ slices_added: '12' })]);
  ok('backlog.added with a non-array slices_added is rejected',
    notArray.status === 1 && /non-empty array/.test(notArray.stdout));

  const missing = run([added({ slices_added: undefined })]);
  ok('backlog.added without slices_added is rejected',
    missing.status === 1 && /missing required field: slices_added/.test(missing.stdout));
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
