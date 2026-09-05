#!/usr/bin/env node
/**
 * Tests for tools/docs/build.mjs.
 *
 *   npm run test:docs
 *
 * This tool assembles the assessment's primary deliverable and has shipped three
 * bugs, every one of which produced plausible-looking output rather than an
 * error: links correct in one location and broken in another, a table generated
 * into the assembly while its source section stayed empty, and summaries that
 * began mid-sentence. None would have been caught by "did it crash".
 *
 * So these tests assert on the CONTENT of generated files, against a fixture
 * tree in a temp directory. Cases marked ↩ are regressions for bugs that shipped.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const BUILD = resolve('tools/docs/build.mjs');

let passed = 0;
let failed = 0;
const check = (desc, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ok    ${desc}`); }
  else { failed++; console.log(`FAIL    ${desc}${detail ? `\n          ${detail}` : ''}`); }
};

// ------------------------------------------------------------------ fixture --

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'docs-build-'));
  const arc42 = join(root, 'arc42');
  const adr = join(root, 'adr');
  mkdirSync(arc42); mkdirSync(adr);

  writeFileSync(join(arc42, '00-reader-guide.md'),
    '# Reader\'s guide\n\nStart at §1.\n');

  // Ordinary section: prose summary expected.
  writeFileSync(join(arc42, '01-introduction-goals.md'),
    '# 1. Introduction and goals\n\n> Owner: architect · Written: phase 1\n\n'
    + 'A scheduler for dealerships. It does a second thing that must not appear in the summary.\n');

  // ↩ Only italic guidance and a continuation line. The line-scanning version
  //   skipped the italic line and returned its continuation — a fragment.
  writeFileSync(join(arc42, '04-solution-strategy.md'),
    '# 4. Solution strategy\n\n> Owner: architect · Written: phase 2 · Gate B\n\n'
    + '*The shortest section that carries the most weight: the decisions\neverything else follows from.*\n');

  // ↩ Prose containing a relative link and a pipe. The link href leaked into the
  //   index as a broken path; an unescaped pipe would split the table cell.
  writeFileSync(join(arc42, '03-context-scope.md'),
    '# 3. Context and scope\n\n> Owner: architect · Written: phase 1\n\n'
    + 'See [the decisions](../adr/0001-x.md) for context | and more.\n');

  // ↩ Generated blocks must be written into the SECTION file, not only the assembly.
  writeFileSync(join(arc42, '09-architecture-decisions.md'),
    '# 9. Architecture decisions\n\n> Owner: architect\n\nDecisions live as MADR files.\n\n'
    + '<!-- generated:adr-index -->\n<!-- /generated:adr-index -->\n');
  writeFileSync(join(arc42, '11-risks-technical-debt.md'),
    '# 11. Risks and technical debt\n\n> Owner: architect\n\nDebt is derived.\n\n'
    + '<!-- generated:debt-register -->\n<!-- /generated:debt-register -->\n');

  const adrFile = (id, title, status) =>
    writeFileSync(join(adr, `${id}-${title.toLowerCase().replace(/\W+/g, '-')}.md`),
      `---\nid: "${id}"\ntitle: ${title}\nstatus: ${status}\nsupersedes: null\n---\n\n## Decision\n`);

  adrFile('0002', 'Second decision', 'accepted');   // deliberately out of order
  adrFile('0001', 'First decision', 'accepted');
  adrFile('0003', 'A deferred idea', 'proposed');   // must reach the debt register
  writeFileSync(join(adr, '_template.md'), '---\nid: "NNNN"\n---\n');  // must be ignored

  // AB-01-7. The register has a SECOND source, and until slice 01 it claimed one it
  // never read: §11.1 said the table is generated from proposed ADRs *and every
  // deferred-improvement slice*, while nothing here opened docs/slices/ at all.
  //
  // Three shapes, because the predicate is `deferred_from` and NOT "accepted ADR on an
  // unfinished slice". The looser test was written first and produced nineteen rows —
  // it listed the FOUNDING decisions as outstanding debt, because every unbuilt slice
  // references them. `ordinary` is the fixture that catches that regression.
  const slices = join(root, 'slices');
  mkdirSync(slices);
  const sliceFile = (id, title, fm) =>
    writeFileSync(join(slices, `${id}-${title.toLowerCase().replace(/\W+/g, '-')}.md`),
      `---\nid: "${id}"\ntitle: ${title}\n${fm}\n---\n\n## Goal\n`);

  sliceFile('50', 'Ordinary unbuilt work', 'status: ready\nadr: [1]');
  sliceFile('51', 'A deferred remedy', 'status: ready\nadr: [2]\ndeferred_from: "R-99-1"');
  sliceFile('52', 'A deferred remedy already built', 'status: done\nadr: [1]\ndeferred_from: "R-99-2"');

  return { root, arc42, adr, slices, out: join(root, 'system-design.md') };
}

const run = (f, extra = []) => spawnSync('node',
  [BUILD, '--arc42', f.arc42, '--adr', f.adr, '--slices', f.slices, '--out', f.out, ...extra],
  { encoding: 'utf8' });

// --------------------------------------------------------------------- run ---

const f = makeFixture();
const build = run(f);
check('build exits 0', build.status === 0, build.stderr);

const doc = existsSync(f.out) ? readFileSync(f.out, 'utf8') : '';
const s09 = readFileSync(join(f.arc42, '09-architecture-decisions.md'), 'utf8');
const s11 = readFileSync(join(f.arc42, '11-risks-technical-debt.md'), 'utf8');

// --- the index ---
check('index lists every numbered section', ['01-', '03-', '04-', '09-', '11-']
  .every((n) => doc.includes(n)));
check('reader\'s guide is not listed as a section', !doc.includes('00-reader-guide.md'));
check('reader\'s guide content is included', doc.includes('Start at §1.'));

// --- ↩ every link resolves from the document's own directory ---
const links = [...new Set([...doc.matchAll(/\]\((?!https?:\/\/|#)([^)#]+)/g)].map((m) => m[1]))];
const broken = links.filter((l) => !existsSync(join(f.root, l)));
check('↩ every relative link in the index resolves', broken.length === 0,
  broken.length ? `broken: ${broken.join(', ')}` : '');
check('links follow the configured directory names', links.some((l) => l.startsWith('arc42/')));

// --- ↩ summaries ---
const row = (n) => doc.split('\n').find((l) => l.startsWith(`| **${n}**`)) ?? '';
check('summary is the first sentence only',
  row(1).includes('A scheduler for dealerships.') && !row(1).includes('second thing'));
check('↩ a stub section reports its schedule, not a blank cell',
  row(4).includes('awaiting phase 2'), row(4));
check('↩ summary never begins mid-sentence',
  !row(4).includes('everything else follows'), row(4));
check('↩ a link in prose contributes its text, not its href',
  row(3).includes('the decisions') && !row(3).includes('../adr/'), row(3));
check('↩ a pipe in prose is escaped so the table survives',
  row(3).includes('\\|'), row(3));

// --- ↩ generated blocks land in the SECTION files ---
check('↩ §9 source carries the ADR table, not just the assembly',
  s09.includes('0001-first-decision.md') && s09.includes('| ADR |'));
check('§9 table is inside the markers',
  /<!-- generated:adr-index -->[\s\S]*0001[\s\S]*<!-- \/generated:adr-index -->/.test(s09));
check('ADRs are sorted by id despite filesystem order',
  s09.indexOf('0001-') < s09.indexOf('0002-'));
check('the ADR template is not indexed', !s09.includes('_template'));
check('§9 links are relative to the section, not the assembly',
  s09.includes('](../adr/'), 'expected ../adr/ from inside arc42/');

// --- the debt register ---
check('a proposed ADR reaches the debt register', s11.includes('A deferred idea'));
check('a proposed ADR is labelled as not yet agreed, not as agreed debt',
  /A deferred idea.*proposed — not yet agreed/.test(s11), s11);

// --- AB-01-7: the second source, and the line that keeps it narrow ---
check('a slice with deferred_from and an accepted ADR is AGREED AND UNBUILT',
  /Second decision.*slice 51.*agreed and unbuilt/.test(s11), s11);
check('...and it names the finding it was deferred from, not just the remedy',
  s11.includes('deferred from R-99-1'), s11);
check('an ordinary unbuilt slice is NOT debt — its founding ADR is the architecture, '
  + 'and listing it would bury the real items under "the project is not finished"',
  !s11.includes('slice 50'), s11);
check('a deferred slice that is DONE is no longer debt', !s11.includes('slice 52'), s11);
check('an accepted ADR alone does not reach the register',
  !/First decision.*agreed and unbuilt/.test(s11), s11);

// --- ↩ --check must catch drift in BOTH places ---
check('--check passes immediately after a build', run(f, ['--check']).status === 0);

writeFileSync(f.out, `${doc}\n<!-- tampered -->\n`);
check('--check fails on a stale assembly', run(f, ['--check']).status === 1);
run(f);

writeFileSync(join(f.arc42, '09-architecture-decisions.md'), s09.replace('0001', 'XXXX'));
check('↩ --check fails on a stale SECTION file', run(f, ['--check']).status === 1);
run(f);

// --- degenerate inputs ---
const empty = makeFixture();
rmSync(empty.adr, { recursive: true, force: true });
const noAdr = run(empty);
check('an absent ADR directory is handled, not crashed', noAdr.status === 0, noAdr.stderr);
check('…and says so rather than printing an empty table',
  readFileSync(empty.out, 'utf8').includes('No decisions recorded yet'));

rmSync(f.root, { recursive: true, force: true });
rmSync(empty.root, { recursive: true, force: true });

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
