#!/usr/bin/env node
/**
 * `npm run slice:close <id>` — record a slice's human gate and transition it, in
 * one act.
 *
 * The two were separate, and the separation cost the pilot its entry gate. Slice
 * 00a was approved and merged, the `gate.decided` record was written, and nobody
 * set `status: done` in the frontmatter — so `slice:check` reported
 * `FAIL dependencies merged — not done: 00a` from the moment slice 00 began, on
 * every run, for the whole slice, and it was not read. All thirteen files were
 * `status: ready` and each `depends_on` its predecessor, so one missed edit had
 * failed the Definition of Ready for every remaining slice.
 *
 * Reviewer, slice 00, finding 1. Its C5 reading is the reason this file exists:
 * **gates being in the right place is not the same as gates being read.**
 *
 * So the transition stops being a thing the orchestrator remembers. The
 * `gate.decided` event already carries everything needed, and a rule whose only
 * enforcement is discipline is the failure this project has now catalogued nine
 * times.
 *
 * `CLAUDE.md` §9 still holds: only the orchestrator runs this, and no agent marks
 * its own work done.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SLICES = resolve('docs/slices');
const [, , rawId, ...rest] = process.argv;
const dry = rest.includes('--dry-run');

if (!rawId || rawId.startsWith('--')) {
  console.error('usage: slice:close <id> [--rationale "..."] [--dry-run]');
  process.exit(2);
}
const id = String(rawId).padStart(2, '0').replace(/^0+(\d\d[a-z]?)$/, '$1');

const rationaleAt = rest.indexOf('--rationale');
const rationale = rationaleAt >= 0 ? rest[rationaleAt + 1] : null;

// --- find the slice file -----------------------------------------------------
const file = readdirSync(SLICES)
  .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
  .find((f) => {
    const fm = readFileSync(join(SLICES, f), 'utf8').match(/^id:\s*"?([^"\n]+)"?/m);
    return fm && fm[1].trim() === id;
  });

if (!file) {
  console.error(`slice:close: no slice with id ${id} in docs/slices/`);
  process.exit(2);
}
const path = join(SLICES, file);
const text = readFileSync(path, 'utf8');

// --- the gate must already be recorded ---------------------------------------
// This is the ordering that matters: the transition is DERIVED from the human's
// ruling, never a substitute for it. `CLAUDE.md` §10 — a slice does not reach
// done because an agent says so.
const LOG = resolve('docs/team-log/events.jsonl');
const events = existsSync(LOG)
  ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean)
      .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } })
  : [];
const gate = [...events].reverse().find(
  (e) => e.event === 'gate.decided' && String(e.slice) === id && e.decision === 'approved',
);

if (!gate) {
  console.error(
    `slice:close: no gate.decided with decision "approved" for slice ${id}.\n` +
    '  The human\'s ruling is the precondition, not the consequence. Record the\n' +
    '  gate first; this transition is derived from it.',
  );
  process.exit(1);
}

const current = text.match(/^status:\s*(\S+)/m)?.[1];
if (current === 'done') {
  console.log(`slice ${id} is already done — nothing to do.`);
  process.exit(0);
}

const updated = text.replace(/^status:\s*\S+/m, 'status: done');
if (updated === text) {
  console.error(`slice:close: no status: line in ${file}`);
  process.exit(2);
}

if (dry) {
  console.log(`--dry-run: ${file} would go ${current} -> done (gate at ${gate.ts})`);
  process.exit(0);
}

writeFileSync(path, updated, 'utf8');
console.log(`slice ${id}: ${current} -> done  (gate.decided ${gate.ts})`);
if (rationale) console.log(`  ${rationale}`);
console.log('  run `npm run slice:check ' + id + '` to confirm, then commit the slice file.');
