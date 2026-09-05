#!/usr/bin/env node
/**
 * Generate the derivable parts of `.claude/agents/*.md` from `docs/METHODOLOGY.md`.
 *
 *   npm run agents:build
 *   npm run agents:build -- --check    # CI: fail if regeneration would change anything
 *
 * WHY THIS EXISTS AT ALL. Every agent definition carried this header:
 *
 *     Derived from docs/METHODOLOGY.md §2 (roles), §7 (tests), §8 (commits).
 *     Do not edit directly: change the methodology first, then regenerate.
 *
 * There was no generator. Nothing in `tools/` wrote `.claude/agents/` and no npm script
 * mentioned them, so "then regenerate" instructed every future editor to follow a process
 * that did not exist — the sixth instance in this project of a mechanism stated and never
 * run, sitting in the file that defines the methodology.
 *
 * It had already drifted. `ac04f1e` changed METHODOLOGY alone to say slice PRs open as a
 * draft at step 1; `test-engineer.md` has never mentioned a draft. `084a34b` added the
 * adjudication discipline to METHODOLOGY and CLAUDE.md, and it reached `architect.md` only
 * because someone typed it there later.
 *
 * THE HEADER WAS ALSO OVER-BROAD, and that is why this generator has a narrow scope. Of 26
 * sections across the five agent files, exactly ONE is byte-identical between roles. The
 * other 25 are role-specific craft — what the reviewer checks, how the test-engineer
 * proves a red, the shape of each role's report. None of that is in METHODOLOGY and none
 * of it should be: generating it would mean either bloating METHODOLOGY with five roles'
 * worth of instructions, or flattening the instructions to whatever the two documents
 * happen to share.
 *
 * So this generates what is genuinely derived and says so, and the header now names those
 * three things instead of gesturing at three sections:
 *
 *   1. `model:` frontmatter        ← §2's role table, Model column
 *   2. the role's constraints      ← §2's role table, Decides / Must not columns
 *   3. the committing rule         ← §8, identical in all five files
 *
 * Everything else is authored, and the file says which is which. A generated block that
 * claims less than it does is worth more than a header that claims more.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };

const METHODOLOGY = resolve(flag('methodology', 'docs/METHODOLOGY.md'));
const AGENTS = resolve(flag('agents', '.claude/agents'));

/** §2's role table: `| **Role** | decides | must not | model |`. */
export function parseRoles(text) {
  const section = text.match(/^## 2\. Roles[\s\S]*?(?=^## \d|\Z)/m)?.[0] ?? '';
  const roles = {};
  for (const line of section.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 5) continue;
    const name = cells[1].replace(/\*\*/g, '').trim().toLowerCase();
    if (!name || name === 'role' || name.startsWith('---')) continue;
    roles[name] = { decides: cells[2], mustNot: cells[3], model: cells[4].toLowerCase() };
  }
  return roles;
}

/**
 * The committing rule, taken from a marked block in METHODOLOGY rather than by scraping
 * §8. A heading-scrape would silently produce an empty block the day someone renumbers a
 * section, and an empty generated block is the failure this project keeps finding: it
 * looks like a successful generation.
 */
export function committingRule(text) {
  const m = text.match(/<!-- agents:committing -->\n([\s\S]*?)<!-- \/agents:committing -->/);
  if (!m) throw new Error('docs/METHODOLOGY.md has no <!-- agents:committing --> block');
  const body = m[1].trim();
  if (!body) throw new Error('the <!-- agents:committing --> block in METHODOLOGY is empty');
  return body;
}

const replaceBlock = (text, marker, body) => {
  const open = `<!-- generated:${marker} -->`;
  const close = `<!-- /generated:${marker} -->`;
  const re = new RegExp(`${open}[\\s\\S]*?${close}`);
  if (!re.test(text)) return { text, found: false };
  return { text: text.replace(re, `${open}\n${body}\n${close}`), found: true };
};

export function render(agentText, role, roles, committing) {
  const spec = roles[role];
  if (!spec) throw new Error(`docs/METHODOLOGY.md §2 has no row for role "${role}"`);
  let out = agentText;

  // `model:` is a fact about the role, decided in §2 and duplicated into frontmatter.
  out = out.replace(/^model:.*$/m, `model: ${spec.model}`);

  const constraints = `**Decides:** ${spec.decides}.\n\n**Must not:** ${spec.mustNot}.`;
  for (const [marker, body] of [['role-constraints', constraints], ['committing', committing]]) {
    const r = replaceBlock(out, marker, body);
    if (!r.found) throw new Error(`${role}.md has no <!-- generated:${marker} --> block`);
    out = r.text;
  }
  return out;
}

const methodology = readFileSync(METHODOLOGY, 'utf8');
const roles = parseRoles(methodology);
const committing = committingRule(methodology);

const stale = [];
for (const file of readdirSync(AGENTS).filter((f) => f.endsWith('.md') && !f.startsWith('_'))) {
  const path = join(AGENTS, file);
  const current = readFileSync(path, 'utf8');
  const role = file.replace(/\.md$/, '');
  const next = render(current, role, roles, committing);
  if (next === current) continue;
  stale.push(file);
  if (!CHECK) writeFileSync(path, next, 'utf8');
}

if (CHECK && stale.length) {
  console.error(
    `${stale.length} agent definition(s) are stale against docs/METHODOLOGY.md: ${stale.join(', ')}.\n`
    + 'Run `npm run agents:build`. The role table and the committing rule are single-sourced; '
    + 'editing them in an agent file is what drifted before this tool existed.',
  );
  process.exit(1);
}

console.log(
  CHECK
    ? `${Object.keys(roles).length} role(s) in §2; every agent definition is current.`
    : `${stale.length ? `regenerated ${stale.join(', ')}` : 'no change'} — ${Object.keys(roles).length} role(s) in §2.`,
);
