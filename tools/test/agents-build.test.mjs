#!/usr/bin/env node
/**
 * `tools/agents/generate.mjs` — the generator the agent definitions claimed to have.
 *
 * The header said "Derived from docs/METHODOLOGY.md … then regenerate" and nothing
 * generated anything. These cases exist so the claim is now true and stays true, and the
 * failing direction is asserted first: a generator that silently writes nothing looks
 * exactly like one that had nothing to do.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GEN = fileURLToPath(new URL('../agents/generate.mjs', import.meta.url));
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const METHODOLOGY = `# Methodology

## 2. Roles

| Role | Decides | Must not | Model |
|---|---|---|---|
| **Architect** | Interfaces and layering | Change scope or AC | Opus |
| **Scribe** | Nothing | Write code | Haiku |

## 8. Commits

<!-- agents:committing -->
Commit by explicit pathspec.
<!-- /agents:committing -->

## 9. Next
`;

const AGENT = (role, model = 'sonnet') => `---
name: ${role}
model: ${model}
---

## Authority

<!-- generated:role-constraints -->
<!-- /generated:role-constraints -->

Role-specific craft that must survive untouched.

## Committing

<!-- generated:committing -->
<!-- /generated:committing -->
`;

const build = (agents, methodology = METHODOLOGY, args = []) => {
  const dir = mkdtempSync(join(tmpdir(), 'agents-build-'));
  mkdirSync(join(dir, 'docs'), { recursive: true });
  mkdirSync(join(dir, 'agents'), { recursive: true });
  writeFileSync(join(dir, 'docs/METHODOLOGY.md'), methodology);
  for (const [name, body] of Object.entries(agents)) writeFileSync(join(dir, 'agents', name), body);
  const r = spawnSync('node', [GEN, '--methodology', join(dir, 'docs/METHODOLOGY.md'),
    '--agents', join(dir, 'agents'), ...args], { encoding: 'utf8' });
  const read = (n) => readFileSync(join(dir, 'agents', n), 'utf8');
  return { ...r, read, dir };
};

// --- it generates, and from the right column ---------------------------------
{
  const r = build({ 'architect.md': AGENT('architect') });
  ok('exits 0', r.status === 0, r.stderr);
  const out = r.read('architect.md');
  ok('model comes from §2, overriding what the file said',
    /^model: opus$/m.test(out), out.split('\n')[2]);
  ok('the Decides column lands in the role-constraints block',
    /Decides:\*\* Interfaces and layering/.test(out), out);
  ok('so does Must not', /Must not:\*\* Change scope or AC/.test(out));
  ok('the committing rule comes from METHODOLOGY, not from the agent file',
    out.includes('Commit by explicit pathspec.'));
  ok('AUTHORED PROSE IS UNTOUCHED — the whole point of a narrow generator',
    out.includes('Role-specific craft that must survive untouched.'));
}
{
  const r = build({ 'scribe.md': AGENT('scribe', 'opus') });
  ok('a different role takes its own row', /^model: haiku$/m.test(r.read('scribe.md')));
}

// --- --check is the CI guard, and must FAIL on drift -------------------------
{
  const r = build({ 'architect.md': AGENT('architect') }, METHODOLOGY, ['--check']);
  ok('--check fails when a definition is stale', r.status === 1, `exit ${r.status}`);
  ok('...and names the file', /architect\.md/.test(r.stderr), r.stderr.trim());
}
{
  const first = build({ 'architect.md': AGENT('architect') });
  const r = spawnSync('node', [GEN, '--methodology', join(first.dir, 'docs/METHODOLOGY.md'),
    '--agents', join(first.dir, 'agents'), '--check'], { encoding: 'utf8' });
  ok('--check passes immediately after a build', r.status === 0, r.stderr);
}
{
  // The drift that actually happened: METHODOLOGY changed, the agent file did not.
  const first = build({ 'architect.md': AGENT('architect') });
  writeFileSync(join(first.dir, 'docs/METHODOLOGY.md'),
    METHODOLOGY.replace('Change scope or AC', 'Change scope, AC or quality goals'));
  const r = spawnSync('node', [GEN, '--methodology', join(first.dir, 'docs/METHODOLOGY.md'),
    '--agents', join(first.dir, 'agents'), '--check'], { encoding: 'utf8' });
  ok('a METHODOLOGY-only rule change is caught as drift — ac04f1e, mechanised',
    r.status === 1, `exit ${r.status}`);
}

// --- it refuses to generate nothing quietly ----------------------------------
{
  const r = build({ 'architect.md': AGENT('architect') },
    METHODOLOGY.replace(/<!-- agents:committing -->[\s\S]*?<!-- \/agents:committing -->/, ''));
  ok('a missing source block is an ERROR, not an empty generated block',
    r.status !== 0 && /agents:committing/.test(r.stderr), r.stderr.trim());
}
{
  const r = build({ 'architect.md': AGENT('architect') },
    METHODOLOGY.replace('Commit by explicit pathspec.', ''));
  ok('an EMPTY source block is an error too — the failure that looks like success',
    r.status !== 0 && /empty/.test(r.stderr), r.stderr.trim());
}
{
  const r = build({ 'ghost.md': AGENT('ghost') });
  ok('a role with no row in §2 is an error, not a silent skip',
    r.status !== 0 && /ghost/.test(r.stderr), r.stderr.trim());
}
{
  const noMarkers = AGENT('architect').replace(/<!-- generated:committing -->\n<!-- \/generated:committing -->/, '');
  const r = build({ 'architect.md': noMarkers });
  ok('a file missing its generated markers is an error, not a no-op',
    r.status !== 0 && /committing/.test(r.stderr), r.stderr.trim());
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
