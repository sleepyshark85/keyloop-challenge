#!/usr/bin/env node
/**
 * Assemble docs/system-design.md from the arc42 section files.
 *
 *   npm run docs:build
 *   npm run docs:build -- --check    # CI: fail if regeneration would change anything
 *
 * Agents edit small section files; the evaluator reads one document. The
 * generated file is a projection, never a source — edit the sections (P2).
 *
 * Two things are derived rather than written, which is what stops them going
 * stale (METHODOLOGY.md §4, tier 1):
 *   §9  the ADR index, from docs/adr/*.md frontmatter
 *   §11 the deferred-improvement register, from ADRs with status: proposed
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { frontmatter } from '../lib/frontmatter.mjs';

const ARC42 = resolve('docs/arc42');
const ADR = resolve('docs/adr');
const OUT = resolve('docs/system-design.md');
const CHECK = process.argv.includes('--check');

function adrs() {
  if (!existsSync(ADR)) return [];
  return readdirSync(ADR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => ({ file: f, ...frontmatter(readFileSync(join(ADR, f), 'utf8')) }))
    .filter((a) => a.id)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

const list = adrs();

const adrTable = list.length
  ? ['| ADR | Title | Status | Supersedes |', '|---|---|---|---|',
     ...list.map((a) => `| [${a.id}](../adr/${a.file}) | ${a.title ?? ''} | ${a.status ?? ''} | ${a.supersedes ?? '—'} |`)].join('\n')
  : '_No decisions recorded yet._';

const proposed = list.filter((a) => a.status === 'proposed');
const debtTable = proposed.length
  ? ['| Item | Origin | Why deferred |', '|---|---|---|',
     ...proposed.map((a) => `| ${a.title ?? a.id} | [ADR-${a.id}](../adr/${a.file}) | deferred improvement |`)].join('\n')
  : '_No deferred improvements recorded._';

// 00 is the reader's guide — spliced in above rather than as a numbered section.
/**
 * Write a generated table into a section file, between markers.
 *
 * Generating only into the assembled document was a mistake: docs/arc42/ is the
 * source of truth, so a reader browsing it saw an empty table under "Architecture
 * decisions" and read it as unfinished work. Generated content belongs in the
 * source, with the boundary marked so nobody hand-edits it.
 */
function syncGenerated(file, marker, table) {
  const path = join(ARC42, file);
  const current = readFileSync(path, 'utf8');
  const open = `<!-- generated:${marker} -->`;
  const close = `<!-- /generated:${marker} -->`;
  const re = new RegExp(`${open}[\\s\\S]*?${close}`);
  if (!re.test(current)) {
    console.error(`  warn: ${file} has no ${open} block; skipping`);
    return { path, current, next: current };
  }
  const next = current.replace(re, `${open}\n${table}\n${close}`);
  return { path, current, next };
}

const generated = [
  syncGenerated('09-architecture-decisions.md', 'adr-index', adrTable),
  syncGenerated('11-risks-technical-debt.md', 'debt-register', debtTable),
];

if (!CHECK) {
  for (const g of generated) if (g.current !== g.next) writeFileSync(g.path, g.next, 'utf8');
}

const sections = readdirSync(ARC42)
  .filter((f) => /^\d\d-.*\.md$/.test(f) && !f.startsWith('00-'))
  .sort();

const parts = sections.map((f) => {
  let text = readFileSync(join(ARC42, f), 'utf8').trimEnd();
  // Strip the per-file ownership annotation: useful to an agent editing the
  // section, noise to someone reading the finished document.
  text = text.replace(/^> Owner:.*$/gm, '').replace(/\n{3,}/g, '\n\n');
  // Sections already carry their generated tables (syncGenerated above), so the
  // assembly is a plain concatenation. Strip only the generation markers.
  text = text.replace(/^<!-- \/?generated:[a-z-]+ -->$/gm, '');
  // Rebase relative links. Sections live in docs/arc42/ and correctly link to
  // ../adr/…; the assembled document lives in docs/, where that resolves one
  // directory too high. Flattening the files has to flatten their links too.
  text = text.replace(/\]\(\.\.\//g, '](');

  // Demote every heading one level: the assembled document owns the H1.
  return text.replace(/^(#{1,5}) /gm, '#$1 ');
});

const guide = existsSync(join(ARC42, '00-reader-guide.md'))
  ? readFileSync(join(ARC42, '00-reader-guide.md'), 'utf8')
      .replace(/^# .*\n/, '')
      .replace(/^\*Sections are maintained[\s\S]*$/m, '')
      .trim()
  : '';

const doc = `# System design — Keyloop service scheduler

*Scenario A: Unified Service Scheduler (backend). Generated from \`docs/arc42/\` by
\`npm run docs:build\` — edit the sections, not this file.*

${guide}

---

${parts.join('\n\n---\n\n')}

---

*Architecture documentation follows [arc42](https://arc42.org), used under CC BY-SA.*
`;

if (CHECK) {
  const staleSection = generated.find((g) => g.current !== g.next);
  if (staleSection) {
    console.error(`${staleSection.path} has a stale generated block — run \`npm run docs:build\`.`);
    process.exit(1);
  }
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== doc) {
    console.error('system-design.md is stale — run `npm run docs:build` and commit the result.');
    process.exit(1);
  }
  console.log(`system-design.md is current (${sections.length} sections, ${list.length} ADRs).`);
  process.exit(0);
}

writeFileSync(OUT, doc, 'utf8');
console.log(`docs/system-design.md ← ${sections.length} sections, ${list.length} ADR(s), ${proposed.length} deferred`);
