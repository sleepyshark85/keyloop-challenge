#!/usr/bin/env node
/**
 * Generate docs/system-design.md — the entry point to the architecture
 * documentation.
 *
 *   npm run docs:build
 *   npm run docs:build -- --check    # CI: fail if regeneration would change anything
 *
 * It is an INDEX, not a copy. An earlier version concatenated every arc42 section
 * into one file, which meant the same prose existed in two places — and produced
 * exactly the bugs that predicts: relative links correct in one location and
 * broken in the other, and staleness needing to be checked twice. Linking has
 * neither problem, and keeps one source per concern (METHODOLOGY.md P2).
 *
 * Two tables are derived rather than written, and are generated INTO their
 * section files between markers, because docs/arc42/ is what a reader browses:
 *   §9  the ADR index, from docs/adr/*.md frontmatter
 *   §11 the deferred-improvement register, from ADRs with status: proposed
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { frontmatter, body } from '../lib/frontmatter.mjs';

// Paths are overridable so the test suite can point at a fixture tree instead of
// the real docs/. Every bug this tool has shipped produced plausible output
// rather than an error, which is only catchable by asserting on real output.
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };

const ARC42 = resolve(flag('arc42', 'docs/arc42'));
const ADR = resolve(flag('adr', 'docs/adr'));
const OUT = resolve(flag('out', 'docs/system-design.md'));
const CHECK = argv.includes('--check');

// Links in the assembled page are relative to the page's own directory.
const ARC42_REL = basename(ARC42);
const ADR_REL = basename(ADR);

// ------------------------------------------------------------------- ADRs ---

const adrList = existsSync(ADR)
  ? readdirSync(ADR)
      .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
      .map((f) => ({ file: f, ...frontmatter(readFileSync(join(ADR, f), 'utf8')) }))
      .filter((a) => a.id)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  : [];

// Paths are written relative to docs/arc42/, where these tables live.
const adrTable = adrList.length
  ? ['| ADR | Title | Status | Supersedes |', '|---|---|---|---|',
     ...adrList.map((a) =>
       `| [${a.id}](../${ADR_REL}/${a.file}) | ${a.title ?? ''} | ${a.status ?? ''} | ${a.supersedes ?? '—'} |`)].join('\n')
  : '_No decisions recorded yet._';

// AB-01-7. The register has TWO sources, and for a long time it claimed two and read
// one.
//
// §11.1's lead sentence said the table is generated from every `proposed` ADR *and
// every deferred-improvement slice*. Only the first half was ever implemented; nothing
// here read `docs/slices/` at all. It stayed invisible because until 2026-09-05 every
// deferred-improvement slice had a `proposed` ADR standing in the register on its
// behalf — so the missing half was covered by the half that worked.
//
// Ratifying ADR-0014 and ADR-0015 is what made it bite. Both became ACCEPTED AND
// UNIMPLEMENTED, a state this table could not represent, and both dropped straight out
// of it: the debt did not shrink, its RECORD did. That is the worse direction, because
// the register is what a reader consults to find out what is owed.
//
// So the second source is real now: a slice whose `adr:` names an ADR that is accepted
// while the slice itself is not `done` is AGREED AND UNBUILT, and says so with the
// remedy's own slice link. `proposed` remains "not yet agreed"; the two rows are
// different claims and the *Status* column keeps them apart rather than merging them
// into an undifferentiated pile of debt.
const SLICES = resolve(flag('slices', 'docs/slices'));
const sliceList = existsSync(SLICES)
  ? readdirSync(SLICES)
      .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
      .map((f) => ({ file: f, ...frontmatter(readFileSync(join(SLICES, f), 'utf8')) }))
      .filter((s) => s.id)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  : [];
const SLICE_REL = basename(SLICES);

// THE PREDICATE IS `deferred_from`, NOT "accepted ADR on an unfinished slice", and the
// difference is not pedantry — the first version of this fix used the looser test and
// produced nineteen rows, listing ADR-0001 and ADR-0008 as outstanding debt because
// slices 02 through 09 have not run yet. Those are the FOUNDING decisions: every slice
// references them and building the system is how they get implemented. Calling that
// debt makes the register useless in the ordinary direction, by burying the two real
// items among seventeen restatements of "the project is not finished".
//
// What makes slices 12 and 13 debt is not that their ADR is accepted. It is that each
// exists BECAUSE A FINDING WAS DEFERRED under a §6 (b) ruling — work that was found,
// judged real, and consciously not done. `deferred_from` names that finding, which is
// also what lets the register point a reader at the argument rather than only at the
// remedy.
const adrById = new Map(adrList.map((a) => [String(a.id).padStart(4, '0'), a]));
const proposed = adrList.filter((a) => a.status === 'proposed');
const agreedUnbuilt = sliceList
  .filter((s) => s.deferred_from && s.status !== 'done')
  .map((s) => ({
    slice: s,
    adr: (Array.isArray(s.adr) ? s.adr : []).map((n) => adrById.get(String(n).padStart(4, '0')))
      .find((a) => a && a.status === 'accepted') ?? null,
  }));

const debtRows = [
  ...proposed.map((a) =>
    `| ${a.title ?? a.id} | [ADR-${a.id}](../${ADR_REL}/${a.file}) | proposed — not yet agreed |`),
  ...agreedUnbuilt.map(({ adr, slice }) =>
    `| ${adr?.title ?? slice.title ?? slice.id} | `
    + (adr ? `[ADR-${adr.id}](../${ADR_REL}/${adr.file}) · ` : '')
    + `[slice ${slice.id}](../${SLICE_REL}/${slice.file}) `
    + `· deferred from ${slice.deferred_from} | `
    + (adr ? '**agreed and unbuilt**' : 'deferred — remedy not yet an accepted ADR') + ' |'),
];
const debtTable = debtRows.length
  ? ['| Item | Origin | Status |', '|---|---|---|', ...debtRows].join('\n')
  : '_No deferred improvements recorded._';

/** Replace a generated block inside a section file, between markers. */
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
  return { path, current, next: current.replace(re, `${open}\n${table}\n${close}`) };
}

const generated = [
  syncGenerated('09-architecture-decisions.md', 'adr-index', adrTable),
  syncGenerated('11-risks-technical-debt.md', 'debt-register', debtTable),
];

if (!CHECK) {
  for (const g of generated) if (g.current !== g.next) writeFileSync(g.path, g.next, 'utf8');
}

// --------------------------------------------------------------- sections ---

const sectionFiles = readdirSync(ARC42)
  .filter((f) => /^\d\d-.*\.md$/.test(f) && !f.startsWith('00-'))
  .sort();

/** Title from the H1, plus the first line of real prose as a one-line summary. */
function describe(file) {
  const raw = readFileSync(join(ARC42, file), 'utf8');
  const title = (raw.match(/^#\s+(.*)$/m)?.[1] ?? file).replace(/^\d+\.\s*/, '');
  const number = file.slice(0, 2).replace(/^0/, '');

  // Work in paragraphs, not lines: scanning line-by-line picks up the second line
  // of a skipped block and yields a mid-sentence fragment.
  const skip = /^(#|>|\||<!--|```|\*|-|\d+\.)/;
  const para = body(raw)
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .find((b) => b && !skip.test(b)) ?? '';

  const summary = para
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')  // links → their text; a relative
                                              // href copied here would resolve
                                              // against docs/, not the section
    .replace(/\|/g, '\\|')                    // a bare pipe would split the cell
    .trim();

  // A section with no prose is still a stub. Say so, using the schedule the stub
  // itself declares — a blank cell reads as a bug, where "awaiting phase 2" reads
  // as a plan and is the truth.
  if (!summary) {
    const owner = raw.match(/^>\s*Owner:\s*(.+)$/m)?.[1] ?? '';
    const when = owner.match(/Written:\s*([^·]+)/)?.[1]?.trim();
    return {
      number, title, file,
      summary: when ? `*awaiting ${when}*` : '*not yet written*',
    };
  }

  // First sentence only — the index is a signpost, not a précis.
  //
  // Take the first full stop that ends a plausible sentence rather than the
  // first one outright, so "e.g." and "§1." do not cut it short. An earlier
  // version required the stop to be past character 40, which silently kept the
  // WHOLE paragraph whenever the opening sentence was shorter than that.
  const MIN_SENTENCE = 25;
  let sentence = summary;
  for (const m of summary.matchAll(/\.\s/g)) {
    if (m.index >= MIN_SENTENCE) { sentence = summary.slice(0, m.index + 1); break; }
  }
  const trimmed = sentence.length > 160 ? `${sentence.slice(0, 157).trimEnd()}…` : sentence;
  return { number, title, file, summary: trimmed };
}

const sections = sectionFiles.map(describe);

const guide = existsSync(join(ARC42, '00-reader-guide.md'))
  ? readFileSync(join(ARC42, '00-reader-guide.md'), 'utf8')
      .replace(/^# .*\n/, '')
      .replace(/^\*Sections are maintained[\s\S]*$/m, '')
      .trim()
  : '';

const index = ['| § | Section | |', '|---|---|---|',
  ...sections.map((s) => `| **${s.number}** | [${s.title}](${ARC42_REL}/${s.file}) | ${s.summary} |`)].join('\n');

const methodologyLink = existsSync(join(dirname(OUT), 'METHODOLOGY.md'))
  ? '\nProcess and team method: [`METHODOLOGY.md`](METHODOLOGY.md).'
  : '';

const doc = `# System design — Keyloop service scheduler

*Scenario A: Unified Service Scheduler (backend).*

The entry point to the architecture documentation. Each section below links to its own file under
[\`${ARC42_REL}/\`](${ARC42_REL}/) — the documentation lives there and nowhere else, so nothing on this page can go
stale against it.

**Generated by \`npm run docs:build\`. Edit the sections, not this file.**

---

${guide}

---

## Sections

${index}

## Decisions

Individual MADR files under [\`${ADR_REL}/\`](${ADR_REL}/), indexed in
[§9](${ARC42_REL}/09-architecture-decisions.md). Immutable: an accepted ADR is never edited, only
superseded by a later one that references it. Each carries \`proposed-by\`, \`decided-by\` and
\`ai-input\`, so where an agent's recommendation was accepted, modified or overridden is visible
without taking anyone's word for it.

${adrList.length
  ? adrList.map((a) => `- [**ADR-${a.id}**](${ADR_REL}/${a.file}) — ${a.title ?? ''} *(${a.status})*`).join('\n')
  : '_No decisions recorded yet._'}

---

*Architecture documentation follows [arc42](https://arc42.org), used under CC BY-SA.${methodologyLink}*
`;

// ----------------------------------------------------------------- output ---

if (CHECK) {
  const stale = generated.find((g) => g.current !== g.next);
  if (stale) {
    console.error(`${stale.path} has a stale generated block — run \`npm run docs:build\`.`);
    process.exit(1);
  }
  if ((existsSync(OUT) ? readFileSync(OUT, 'utf8') : '') !== doc) {
    console.error('system-design.md is stale — run `npm run docs:build` and commit the result.');
    process.exit(1);
  }
  console.log(`system-design.md is current (${sections.length} sections, ${adrList.length} ADRs).`);
  process.exit(0);
}

writeFileSync(OUT, doc, 'utf8');
console.log(`docs/system-design.md ← index of ${sections.length} sections, ${adrList.length} ADR(s), ${proposed.length} deferred`);
