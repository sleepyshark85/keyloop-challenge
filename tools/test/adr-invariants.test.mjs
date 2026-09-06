#!/usr/bin/env node
/**
 * `tools/docs/adr-invariants.mjs` — the option set survives a condensation, and adding one
 * ADR does not rewrite every pin.
 *
 * F-04-1, fourth recurrence. This tool's error message told you not to run `--rebaseline`
 * because it rewrites every existing pin, and then left no way to register a new ADR except
 * by hand. The hand-edit carried its own trap: the committed baseline escapes every
 * non-ASCII codepoint and `JSON.stringify` emits them raw, so the obvious fix silently
 * reformatted 198 of 294 lines — a 398-line diff on the exact file the message warns about.
 * It caught an architect twice and a reviewer once before anyone fixed it.
 *
 * So the cases that matter here are about WRITING, not only about checking, and the
 * encoding one is asserted in the failing direction: a pin must be byte-stable, because a
 * writer that reformats is indistinguishable from the `--rebaseline` it warns you off.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOOL = fileURLToPath(new URL('../docs/adr-invariants.mjs', import.meta.url));
let pass = 0; let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

// An em dash and a section sign, so every case exercises the escaping that caused F-04-1.
const adr = (n, opts, chosen) => `---\nid: "${n}"\nstatus: accepted\n---\n\n`
  + '## Considered options\n\n'
  + opts.map(([l, d]) => `- **Option ${l}** — ${d} (§2)\n`).join('')
  + `\nChosen option: **${chosen}** — it wins.\n`;

const build = (adrs) => {
  const dir = mkdtempSync(join(tmpdir(), 'adrinv-'));
  mkdirSync(join(dir, 'adr'), { recursive: true });
  for (const [f, body] of Object.entries(adrs)) writeFileSync(join(dir, 'adr', f), body);
  return { dir, bp: join(dir, 'baseline.json'), adrDir: join(dir, 'adr') };
};
const run = ({ adrDir, bp }, args = []) => spawnSync('node', [TOOL, '--adr', adrDir, '--baseline', bp, ...args], { encoding: 'utf8' });

const A = adr('0001', [['A', 'normalise the endpoint'], ['B', 'widen the range'], ['C', 'do nothing']], 'A');
const B = adr('0002', [['A', 'lock both'], ['B', 'lock neither']], 'A');

// --- the invariant it exists for -------------------------------------------------
{
  const f = build({ '0001-x.md': A });
  run(f, ['--rebaseline']);
  ok('a pinned ADR that is unchanged passes', run(f).status === 0, run(f).stdout.trim());

  writeFileSync(join(f.adrDir, '0001-x.md'),
    adr('0001', [['A', 'normalise the endpoint'], ['B', 'widen the range']], 'A'));
  const dropped = run(f);
  ok('...and DROPPING a rejected option fails — the evidence a decision was a choice',
    dropped.status === 1 && /options-dropped/.test(dropped.stdout), dropped.stdout.trim().slice(0, 120));

  writeFileSync(join(f.adrDir, '0001-x.md'),
    adr('0001', [['A', 'normalise it'], ['B', 'widen it'], ['C', 'do nothing']], 'A'));
  ok('...while REWORDING every option label passes — identity is the letter, not the phrasing',
    run(f).status === 0, run(f).stdout.trim().slice(0, 120));
}

// --- F-02-10: an ADR the baseline has never seen ---------------------------------
{
  const f = build({ '0001-x.md': A });
  run(f, ['--rebaseline']);
  writeFileSync(join(f.adrDir, '0002-y.md'), B);
  const r = run(f);
  ok('a NEW ADR is reported unpinned, not silently skipped',
    r.status === 1 && /unpinned/.test(r.stdout), r.stdout.trim().slice(0, 120));
  ok('...and the message names --pin rather than leaving a hand-edit as the only route',
    /--pin 0002-y\.md/.test(r.stdout), r.stdout.trim().slice(0, 200));
  ok('...and still warns off --rebaseline', /Do NOT run --rebaseline/.test(r.stdout));
}

// --- F-04-1: writing must not reformat -------------------------------------------
{
  const f = build({ '0001-x.md': A, '0002-y.md': B });
  run(f, ['--rebaseline']);
  const before = readFileSync(f.bp, 'utf8');
  ok('the baseline escapes non-ASCII — the convention the committed file uses',
    /\\u2014/.test(before) && !/—/.test(before), before.slice(0, 80));

  const again = run(f, ['--pin', '0001-x.md']);
  ok('re-pinning an unchanged ADR is BYTE-STABLE — a writer that reformats is '
    + 'indistinguishable from the --rebaseline it warns you off',
  readFileSync(f.bp, 'utf8') === before, again.stdout.trim());
  ok('...and says so: zero lines changed', /\(0 line\(s\) changed\)/.test(again.stdout), again.stdout.trim());
}
{
  const f = build({ '0001-x.md': A });
  run(f, ['--rebaseline']);
  const before = readFileSync(f.bp, 'utf8');
  writeFileSync(join(f.adrDir, '0002-y.md'), B);
  const r = run(f, ['--pin', '0002-y.md']);
  const after = readFileSync(f.bp, 'utf8');
  ok('pinning a NEW ADR leaves every existing pin byte-identical',
    after.includes(before.trim().slice(1, 200).split('\n').slice(1, 4).join('\n')), r.stdout.trim());
  ok('...and the existing ADR\'s options are untouched',
    JSON.stringify(JSON.parse(after)['0001-x.md']) === JSON.stringify(JSON.parse(before)['0001-x.md']));
  ok('...and the check then passes', run(f).status === 0, run(f).stdout.trim());
}
{
  const f = build({ '0001-x.md': A });
  run(f, ['--rebaseline']);
  const r = run(f, ['--pin', '9999-absent.md']);
  ok('pinning a file that does not exist fails loudly rather than writing an empty pin',
    r.status === 2 && /not in/.test(r.stderr), `${r.status} ${r.stderr.trim().slice(0, 80)}`);
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
