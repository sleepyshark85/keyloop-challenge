#!/usr/bin/env node
/**
 * Word budgets for the architecture documentation.  METHODOLOGY.md §4.
 *
 *   npm run docs:budget            # report
 *   npm run docs:budget -- --check # CI: exit 1 if anything is over
 *
 * WHY A TOOL AND NOT A CONVENTION. The human ruled on 2026-09-05 that the corpus is
 * too chatty — measured at 31.8k words of arc42, 35.4k of ADRs and 69k of slices, with
 * an average ADR of 2,080 words against a normal MADR's 400–800. A budget stated in a
 * methodology document and enforced by nobody is the shape this project has catalogued
 * five times: a mechanism that reports success over work it never did. So it is
 * measured, it runs in `test:tools`, and it fails the build.
 *
 * WHAT IS NOT COUNTED, AND WHY EACH EXCLUSION IS NARROW:
 *
 *   - FRONTMATTER. Machine-read fields, not prose. Excluding it also stops the budget
 *     punishing an ADR for recording provenance the assessment asks for.
 *   - GENERATED BLOCKS. `docs:build` writes §9's ADR index and §11's debt register
 *     between markers. They grow with the project, nobody authored them, and counting
 *     them would make the budget fail as a consequence of the project working.
 *   - FENCED CODE. A schema, a SQL statement or a measured `depcruise` transcript is
 *     evidence, and the ruling was about prose repeated across artifacts rather than
 *     about showing the thing. Trimming code to fit a word count would be the exact
 *     wrong response, so the counter cannot create that pressure.
 *   - TABLE MARKUP, but not table CONTENT. The ruling's own remedy is to replace prose
 *     with option tables, so a counter that charged full price for pipes and dashes
 *     would penalise the fix it exists to encourage.
 *
 * ESCAPE HATCH, deliberately explicit. An ADR may declare `contested: true` in its
 * frontmatter for a genuinely argued decision, raising its budget. It is a declaration
 * in the record, visible in a diff and reviewable — not a silent exemption. ADR-0013,
 * 0016 and 0017 are the shape it exists for.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { frontmatter } from '../lib/frontmatter.mjs';

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };

const ARC42 = resolve(flag('arc42', 'docs/arc42'));
const ADR = resolve(flag('adr', 'docs/adr'));
const SLICES = resolve(flag('slices', 'docs/slices'));

/** Budgets in words of authored prose. */
export const BUDGETS = {
  adr: 700,
  adrContested: 1200,
  arc42: 1500,
  // §8 is the crosscutting-concepts section and legitimately carries the most: the
  // error taxonomy, the test strategy and the observability contract all live there.
  // A single number would either strangle §8 or excuse everything else.
  arc42Overrides: { '08': 3000, '11': 2500 },

  // Slice documents, under the human's 2026-09-05 ruling to shorten these AGGRESSIVELY.
  // Measured at that moment: four design files held 54,605 of the 69k words in
  // docs/slices/ — 00a 17,459, 00 15,294, 01 11,573, 02 10,279 — while every slice file
  // itself was between 156 and 1,416.
  //
  // A MERGED slice's design has already been reconciled into arc42 by step 7. That is
  // what step 7 IS: the architect moves what was decided into the document §4 calls the
  // single source of truth. Keeping the working prose afterwards is the cross-artifact
  // duplication the ruling is about, in its purest form — so a merged design is an
  // as-built record (what was decided, what was measured and is cited elsewhere, what
  // was ruled, what debt was booked) and nothing else.
  //
  // The IN-FLIGHT design gets room, because roles are reading it to work from. It comes
  // down to `sliceDesignMerged` when its slice reaches done.
  sliceDesign: 3000,
  sliceDesignMerged: 1200,
  slice: 800,
  sliceTombstone: 400,
};

/** Authored prose only — see the header for why each exclusion is narrow. */
export function countWords(raw, { file = '' } = {}) {
  let t = raw;
  // ACCEPTANCE CRITERIA ARE THE CONTRACT, NOT PROSE, and are not charged for.
  //
  // Slice 02 carries nineteen criteria in 613 words — irreducible, because each one is a
  // Given/When/Then a test asserts and a human gated. A budget that squeezed them would
  // push toward vaguer criteria, and this project has already paid twice for exactly
  // that: AC-10 needed a human ruling mid-slice at 00, and AC-2 and AC-6 both did at 01,
  // every time because of what the criterion SAID rather than what anyone built. Creating
  // pressure to compress the one artifact whose ambiguity has cost the most would be the
  // opposite of the ruling's intent.
  if (file.startsWith('slices/')) {
    t = t.replace(/^## Acceptance criteria[\s\S]*?(?=^## |\Z)/m, '');
  }
  t = t.replace(/^---\n[\s\S]*?\n---\n/, '');                                   // frontmatter
  t = t.replace(/<!-- generated:([^>]+) -->[\s\S]*?<!-- \/generated:\1 -->/g, ''); // generated
  t = t.replace(/```[\s\S]*?```/g, '');                                          // fenced code
  t = t.replace(/^\s*\|[-: |]+\|\s*$/gm, '');                                    // table rules
  t = t.replace(/\|/g, ' ');                                                     // table pipes
  return t.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

function budgetFor(file, fm) {
  if (file.startsWith('adr/')) return fm.contested ? BUDGETS.adrContested : BUDGETS.adr;
  if (file.startsWith('slices/')) {
    if (fm.folded_into) return BUDGETS.sliceTombstone;
    if (!file.endsWith('-design.md')) return BUDGETS.slice;
    // The design belongs to the slice of the same id; a design is "merged" once that
    // slice is done, which is exactly when step 7 has moved its content into arc42.
    const id = file.match(/slices\/(\d+[a-z]?)-design\.md$/)?.[1];
    const owner = id && existsSync(join(SLICES, ''))
      ? readdirSync(SLICES).find((f) => f.startsWith(`${id}-`) && !f.endsWith('-design.md'))
      : null;
    const done = owner && /^status:\s*done\s*$/m.test(readFileSync(join(SLICES, owner), 'utf8'));
    return done ? BUDGETS.sliceDesignMerged : BUDGETS.sliceDesign;
  }
  const n = basename(file).match(/^(\d+)/)?.[1];
  return BUDGETS.arc42Overrides[n] ?? BUDGETS.arc42;
}

export function survey({ arc42 = ARC42, adr = ADR, slices = SLICES } = {}) {
  const rows = [];
  const read = (dir, prefix) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.md') && !x.startsWith('_'))) {
      const raw = readFileSync(join(dir, f), 'utf8');
      const key = `${prefix}/${f}`;
      const fm = frontmatter(raw) ?? {};
      // A tombstone is a pointer, not a document; it has no id and nothing schedules it.
      if (prefix === 'adr' && !fm.id) continue;
      if (prefix === 'slices' && f === '_template.md') continue;
      // NO EXEMPTION FOR ACCEPTED ADRs, and the reason is a human ruling rather than a
      // reading of §4. This tool briefly exempted them: §4 says an accepted ADR is
      // immutable, thirteen were accepted before the budget existed, and failing forever
      // on documents nobody may change is broken CI rather than a guard.
      //
      // The human overrode §4 on 2026-09-05, narrowly — an accepted ADR MAY be shortened,
      // and may NOT be changed in meaning. The override is sound on §4's own terms: its
      // stated purpose is that "the history of how thinking changed is the point", and
      // that history is in git and in the event log, not in the file being frozen. What
      // immutability uniquely protects is that a reader citing ADR-0006 later gets the
      // same decision — which a meaning-preserving condensation does not touch.
      //
      // The meaning half is not left to good intentions: tools/docs/adr-invariants.mjs
      // pins every considered option and every chosen option against a baseline captured
      // before the condensation pass, so an option quietly dropped fails the build.
      rows.push({ file: key, words: countWords(raw, { file: key }), budget: budgetFor(key, fm),
                  contested: Boolean(fm.contested) });
    }
  };
  read(arc42, 'arc42');
  read(adr, 'adr');
  read(slices, 'slices');
  for (const r of rows) r.over = r.words - r.budget;
  return rows.sort((a, b) => b.over - a.over);
}

const rows = survey();
const over = rows.filter((r) => r.over > 0);

if (!CHECK || over.length) {
  const show = CHECK ? over : rows;
  console.log(`\n${'FILE'.padEnd(58)}${'WORDS'.padStart(7)}${'BUDGET'.padStart(8)}${'OVER'.padStart(7)}`);
  for (const r of show) {
    const mark = r.over > 0 ? '  OVER' : '';
    console.log(
      `${r.file.padEnd(58)}${String(r.words).padStart(7)}${String(r.budget).padStart(8)}`
      + `${(r.over > 0 ? `+${r.over}` : '—').padStart(7)}`
      + `${mark}${r.contested ? '  (contested)' : ''}`,
    );
  }
  const total = rows.reduce((n, r) => n + r.words, 0);
  console.log(`\n${rows.length} document(s), ${total} words of authored prose, ${over.length} over budget `
    + `(${rows.reduce((n, r) => n + Math.max(0, r.over), 0)} words to cut).`);
}

if (CHECK && over.length) {
  console.error(
    `\n${over.length} document(s) over budget. Prose that argues a decision belongs in the ADR; `
    + 'narrative and measurement belong in the event log and on the PR; arc42 says what the '
    + 'system IS. An ADR that is genuinely contested may declare `contested: true`.',
  );
  process.exit(1);
}
