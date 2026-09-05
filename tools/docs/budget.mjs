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
  // §08 was 3000 until it was measured. That number was set on an enumeration of THREE
  // concerns — the error taxonomy (~420 words), the test strategy (~1,290) and the
  // observability contract (~385), about 2,095 together. §8 carries three more of
  // comparable weight: the domain model and schema (~416), the exclusion constraint and
  // its consequences (~556 — the mechanism the whole system exists for), and the
  // time/zone/DST model (~966). The budget was guessed rather than measured, and the
  // architect caught it by enumerating what the section actually holds. Correcting a
  // number set without measurement is not the same act as moving it to fit a document
  // that will not comply, and the distinction is the reason this comment exists.
  //
  // The alternative — splitting §8.1–8.3 into their own section file — is a change to the
  // arc42 structure itself and belongs to the human, not to a budget tool.
  arc42Overrides: { '08': 4000, '11': 2500 },

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

  // The two process documents, added after the human asked why they were exempt.
  //
  // CLAUDE.md is deliberately generous relative to its size: it is 1,439 words of almost
  // pure operative rule, it is loaded into every agent's context on every run, and it is
  // the document that has demonstrably worked — §6's adjudication discipline, the (c)
  // naming test, the test-ownership paths. Every word that is not a rule dilutes the
  // rules, so the pressure here should be against NARRATIVE creeping in, not against the
  // rules themselves. The budget exists to catch the former.
  //
  // METHODOLOGY is the opposite case: 5,307 words, much of it restating CLAUDE.md, with a
  // unique contribution — the role model, the phase model, the reasoning behind the
  // process — that is smaller than the document.
  claude: 1500,
  // 2,500 was a guess, made from this file on the estimate that METHODOLOGY's unique
  // contribution "is smaller than the document". That was true before the pass and is
  // spent after it. The architect removed every restatement of a CLAUDE.md rule and three
  // cross-artifact duplications, landing at 3,999, then spent a full compression pass over
  // the remainder and recovered 54 WORDS. That measurement is the argument: what is left
  // is arguments, not padding, and each further 100 words is one argument deleted.
  //
  // What the remainder holds, enumerated rather than asserted: the role, phase and
  // principle models (454); seven near-misses that shaped the process — the index is not a
  // file, defects had no home, `narrowed`, rule-and-amend-in-one-pass, prompts never
  // written for two phases, the generator that did not exist, diagram validators CI cannot
  // run (~600); and three evidence tables with no other home — the log coverage/trust
  // table, the process metrics, the PR-thread contract (597). Reaching 2,500 means
  // deleting the coverage table, which is the document admitting four of its own event
  // types are unverifiable, and is among the most assessment-relevant artifacts here.
  //
  // Corrected by the same rule as arc42 §8: a number set by estimate loses to a number set
  // by enumeration. Correcting a guess with a measurement is not the same act as moving a
  // budget to fit a document that will not comply.
  methodology: 3800,
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
  // AN ASSUMPTION REGISTER IS NOT PROSE EITHER, by the same argument and by the
  // constitution's own words. `CLAUDE.md` §11: "Do not silently invent a resolution.
  // Record the assumption explicitly, flag it for the human... Documented assumptions are
  // graded work, not preamble." arc42 §1.4 holds ten of them plus the four Gate A rulings
  // — 1,000 of §1's 2,061 words. Charging for them would put a word budget in tension
  // with a NON-NEGOTIABLE instruction to write them down, and pressure toward recording
  // fewer assumptions is the last thing this project needs.
  if (file.startsWith('arc42/')) {
    // `\Z` is not a JavaScript anchor — it matched literally, so this silently never
    // fired and §1 stayed 561 over while appearing to be excluded. `$(?![\s\S])` is the
    // end-of-input assertion JavaScript actually has.
    t = t.replace(/^##+ [^\n]*Assumptions[^\n]*\n[\s\S]*?(?=^## |$(?![\s\S]))/m, '');
  }
  t = t.replace(/^---\n[\s\S]*?\n---\n/, '');                                   // frontmatter
  t = t.replace(/<!-- generated:([^>]+) -->[\s\S]*?<!-- \/generated:\1 -->/g, ''); // generated
  t = t.replace(/```[\s\S]*?```/g, '');                                          // fenced code
  t = t.replace(/^\s*\|[-: |]+\|\s*$/gm, '');                                    // table rules
  t = t.replace(/\|/g, ' ');                                                     // table pipes
  return t.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

function budgetFor(file, fm) {
  if (file === 'CLAUDE.md') return BUDGETS.claude;
  if (file.endsWith('METHODOLOGY.md')) return BUDGETS.methodology;
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
  for (const [path, key] of [[resolve('CLAUDE.md'), 'CLAUDE.md'], [resolve('docs/METHODOLOGY.md'), 'docs/METHODOLOGY.md']]) {
    if (!existsSync(path)) continue;
    const raw = readFileSync(path, 'utf8');
    rows.push({ file: key, words: countWords(raw, { file: key }), budget: budgetFor(key, {}), contested: false });
  }
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
