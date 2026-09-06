#!/usr/bin/env node
/**
 * `tools/docs/budget.mjs` — the word budgets and the ratchet.
 *
 * This is the tool that enforces the human's concision rule and it had no tests, which is
 * a poor joke given what it exists to catch. The cases below are written failing-direction
 * first, because every one of this tool's defects so far has been a green report over
 * something it did not look at:
 *
 *   - it was kept out of CI entirely, so it measured 18,607 words of drift and stopped
 *     nothing (O-32);
 *   - `\Z` is not a JavaScript anchor, so the assumption-register exclusion silently never
 *     fired and §1 sat 561 words over while appearing exempt;
 *   - and the ratchet did not TIGHTEN, so `02-design.md` fell 13,566 → 1,200 while its
 *     ceiling stayed at 13,566 and it could have grown all the way back.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BUDGET = fileURLToPath(new URL('../docs/budget.mjs', import.meta.url));
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const words = (n) => Array.from({ length: n }, () => 'word').join(' ');

/** ADR files need `id:` to be surveyed at all; arc42 files are taken by filename. */
const adr = (n, body) => `---\nid: "${n}"\ntitle: t\nstatus: proposed\n---\n\n${body}\n`;

const build = ({ adrs = {}, arc42 = {}, baseline = null } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-'));
  mkdirSync(join(dir, 'adr'), { recursive: true });
  mkdirSync(join(dir, 'arc42'), { recursive: true });
  mkdirSync(join(dir, 'slices'), { recursive: true });
  for (const [f, b] of Object.entries(adrs)) writeFileSync(join(dir, 'adr', f), b);
  for (const [f, b] of Object.entries(arc42)) writeFileSync(join(dir, 'arc42', f), b);
  const bp = join(dir, 'baseline.json');
  if (baseline) writeFileSync(bp, JSON.stringify(baseline));
  return { dir, bp };
};

// CLAUDE.md and METHODOLOGY are pointed at the fixture too; they were hard-coded against
// the working directory, so without this every case also measured the real repository.
const run = ({ dir, bp }, args = []) => spawnSync('node', [BUDGET,
  '--adr', join(dir, 'adr'), '--arc42', join(dir, 'arc42'), '--slices', join(dir, 'slices'),
  '--claude', join(dir, 'absent-CLAUDE.md'), '--methodology', join(dir, 'absent-METHODOLOGY.md'),
  '--baseline', bp, ...args], { encoding: 'utf8' });

// --- plain --check: over budget fails --------------------------------------------
{
  const f = build({ adrs: { '0001-x.md': adr('0001', words(900)) } });
  const r = run(f, ['--check']);
  ok('an ADR over its 700-word budget fails --check', r.status === 1, `exit ${r.status}`);
  ok('...and names the file', /0001-x\.md/.test(r.stdout), r.stdout.trim().slice(0, 120));
}
{
  const f = build({ adrs: { '0001-x.md': adr('0001', words(300)) } });
  ok('an ADR under budget passes', run(f, ['--check']).status === 0);
}
{
  const f = build({ adrs: { '0001-x.md': `---\nid: "0001"\ntitle: t\nstatus: proposed\ncontested: true\n---\n\n${words(900)}\n` } });
  ok('`contested: true` raises the ceiling to 1200 — a declaration, not a silent exemption',
    run(f, ['--check']).status === 0);
}

// --- what is deliberately NOT charged for ----------------------------------------
{
  const fenced = adr('0001', `${words(300)}\n\n\`\`\`\n${words(2000)}\n\`\`\`\n`);
  ok('fenced code is free — trimming a measured transcript to fit a word count would be '
    + 'the wrong response', run(build({ adrs: { '0001-x.md': fenced } }), ['--check']).status === 0);
}
{
  const gen = adr('0001', `${words(300)}\n\n<!-- generated:x -->\n${words(2000)}\n<!-- /generated:x -->\n`);
  ok('a generated block is free — it grows with the project and nobody authored it',
    run(build({ adrs: { '0001-x.md': gen } }), ['--check']).status === 0);
}
{
  // §1.4's ten assumptions are 1,000 of its words, and CLAUDE.md §11 calls documented
  // assumptions "graded work, not preamble". `\Z` is not a JS anchor and this silently
  // never fired.
  const a = `# 1\n\n${words(300)}\n\n## 1.4 Assumptions\n\n${words(3000)}\n`;
  ok('an arc42 assumption register is free — a budget must not push toward recording fewer',
    run(build({ arc42: { '01-introduction-goals.md': a } }), ['--check']).status === 0);
}

// --- the ratchet -----------------------------------------------------------------
{
  const f = build({
    adrs: { '0001-x.md': adr('0001', words(1500)) },
    baseline: { 'adr/0001-x.md': 1500 },
  });
  ok('an over-budget file that HOLDS at its ceiling passes the ratchet',
    run(f, ['--check', '--ratchet']).status === 0, run(f, ['--check', '--ratchet']).stderr.trim());
}
{
  const f = build({
    adrs: { '0001-x.md': adr('0001', words(1600)) },
    baseline: { 'adr/0001-x.md': 1500 },
  });
  const r = run(f, ['--check', '--ratchet']);
  ok('...and fails the moment it GROWS past it', r.status === 1, `exit ${r.status}`);
  ok('...with a message about the ceiling, not the budget',
    /GREW past their ceiling/.test(r.stderr), r.stderr.trim().slice(0, 120));
}
{
  const f = build({ adrs: { '0002-new.md': adr('0002', words(900)) }, baseline: {} });
  ok('a NEW file must meet its budget outright — no ceiling is inherited',
    run(f, ['--check', '--ratchet']).status === 1);
}
{
  // The defect the architect found the moment it shrank a file: the ceiling stayed where
  // it was, so a 13,566 → 1,200 reduction could have grown all the way back unnoticed.
  const f = build({
    adrs: { '0001-x.md': adr('0001', words(400)) },
    baseline: { 'adr/0001-x.md': 1500 },
  });
  const r = run(f, ['--check', '--ratchet']);
  ok('a MATERIAL reduction fails until it is recorded — a ratchet that does not tighten '
    + 'does not hold', r.status === 1, `exit ${r.status}`);
  ok('...and says to rebaseline, in the change that earned the reduction',
    /rebaseline/.test(r.stderr), r.stderr.trim().slice(0, 140));
}
{
  const f = build({
    adrs: { '0001-x.md': adr('0001', words(1480)) },
    baseline: { 'adr/0001-x.md': 1500 },
  });
  ok('a TRIVIAL reduction does not demand a baseline commit — ordinary rewording is not a '
    + 'reduction', run(f, ['--check', '--ratchet']).status === 0);
}
{
  const f = build({
    adrs: { '0001-x.md': adr('0001', words(400)) },
    baseline: { 'adr/0001-x.md': 1500 },
  });
  const rebaselined = run(f, ['--rebaseline']);
  ok('--rebaseline records current sizes', rebaselined.status === 0);
  ok('...and the ratchet is then clean and tighter',
    run(f, ['--check', '--ratchet']).status === 0
      && JSON.parse(readFileSync(f.bp, 'utf8'))['adr/0001-x.md'] < 1500,
    JSON.stringify(JSON.parse(existsSync(f.bp) ? readFileSync(f.bp, 'utf8') : '{}')));
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
