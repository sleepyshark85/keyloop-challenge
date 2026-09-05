#!/usr/bin/env node
/**
 * A citation must still resolve after a document is shortened.
 *
 *   npm run docs:refs
 *
 * arc42 and the ADRs cite identifiers that are DEFINED in slice designs — `D-01-2` (the
 * debt the literal AC-6 ruling booked), `OQ-01-1`, and their kin. On 2026-09-05 the
 * human ruled the designs cut aggressively: four of them held 54,605 words, and a merged
 * slice's design has by definition already been reconciled into arc42 by step 7.
 *
 * That cut is right, and it has one specific way of going wrong that a word count cannot
 * see. Delete the paragraph that DEFINES `D-01-2` and arc42 §11 still cites it, ADR-0014
 * still calls it "D-01-2's first concrete instance", and both now point at nothing. The
 * documents stay valid markdown, the budget goes green, and the reader following the
 * citation is the one who finds out.
 *
 * So the rule is narrow and mechanical: every design-local identifier cited from
 * `docs/arc42/` or `docs/adr/` must be defined in some `docs/slices/*-design.md`.
 * Shortening may cut the argument around a definition; it may not cut the definition out
 * from under a citation.
 *
 * THE EVENT LOG IS A CITATION SOURCE, and it is the one that matters most. §9 makes
 * `docs/team-log/events.jsonl` append-only, so a citation there can NEVER be repaired —
 * arc42 and an ADR can drop a reference in the same commit that drops its definition, and
 * the log cannot. The first version of this tool read only arc42 and the ADRs and so
 * missed exactly that: the design condensation left `F-01-2` cited four times in the log
 * and no longer defined anywhere, and every guard stayed green.
 *
 * It is deliberately one-directional. An identifier defined in a design and cited
 * nowhere is not an error — a design is allowed to name its own debt before anything
 * refers to it, and flagging that would push authors to delete records rather than keep
 * them, which is the opposite of the point.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const flag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const ARC42 = resolve(flag('arc42', 'docs/arc42'));
const ADR = resolve(flag('adr', 'docs/adr'));
const SLICES = resolve(flag('slices', 'docs/slices'));
const LOG = resolve(flag('log', 'docs/team-log/events.jsonl'));

/** `D-01-2`, `OQ-02-1`, `DA-00a-3`, `F-02-6` — a design-local identifier. */
export const REF = /\b(?:D|F|DA|OQ|A)-\d{2}[a-z]?-\d+\b/g;

/**
 * A DEFINITION, not a mention — and the distinction is the whole tool.
 *
 * The first version of this counted an identifier as defined if it appeared anywhere in
 * any design. The mutant that proves a checker works — rename `D-01-2` in the design that
 * defines it — SURVIVED, because `02-design.md` also *cites* it twice. "Appears in a
 * design" and "is defined in a design" are different facts, and collapsing them is the
 * same spelling-versus-concept error this project has now found in four markers.
 *
 * A definition here is the identifier appearing in the LABEL of a heading, list item or
 * table row — the part before the em dash or colon that introduces it. Not merely at the
 * start of that label: `**OQ-01-2 / F-01-2** — AC-5 confines…` defines BOTH identifiers,
 * and an earlier version of this that anchored the ref to the start of the bold span
 * reported `F-01-2` as orphaned when its definition was sitting right there. It produced
 * a false positive against a correct document, which is the failure mode that gets a
 * guard switched off.
 */
export const DEFINITION = (ref) => {
  const rx = new RegExp(`\\b${ref}\\b`);
  return {
    test(text) {
      for (const line of text.split('\n')) {
        // A definition line is a heading, list item or table row — or a bold label
        // paragraph, which is the form §11's debt entries actually use:
        // `**D-01-1 — composition order left the domain.**` has no list marker at all.
        const m = line.match(/^\s*(?:#{1,6}\s+|[-*]\s+|\|\s*)(.*)$/)
          || line.match(/^\s*(\*\*.*)$/);
        if (!m) continue;
        // The label is what introduces the entry: everything before the em dash, en dash
        // or colon that starts its explanation. A ref further into the prose is a mention.
        const label = m[1].split(/\s[—–]\s|:\s/)[0];
        if (rx.test(label)) return true;
      }
      return false;
    },
  };
};

const readAll = (dir, filter = () => true) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_') && filter(f))
    .map((f) => ({ file: `${dir.split('/').pop()}/${f}`, text: readFileSync(join(dir, f), 'utf8') }));
};

export function check({ arc42 = ARC42, adr = ADR, slices = SLICES, log = LOG } = {}) {
  const designs = readAll(slices, (f) => f.endsWith('-design.md'));
  const defined = new Set();
  for (const d of designs) {
    for (const ref of new Set(d.text.match(REF) ?? [])) {
      if (DEFINITION(ref).test(d.text)) defined.add(ref);
    }
  }

  const citations = new Map(); // ref -> [files]
  const sources = [...readAll(arc42), ...readAll(adr)];
  if (existsSync(log)) sources.push({ file: 'team-log/events.jsonl (append-only)', text: readFileSync(log, 'utf8') });
  for (const { file, text } of sources) {
    for (const ref of text.match(REF) ?? []) {
      if (!citations.has(ref)) citations.set(ref, []);
      if (!citations.get(ref).includes(file)) citations.get(ref).push(file);
    }
  }

  const orphans = [...citations.entries()].filter(([ref]) => !defined.has(ref));
  return { defined, citations, orphans, designs: designs.length };
}

const { defined, citations, orphans, designs } = check();

if (!orphans.length) {
  console.log(
    `${citations.size} identifier(s) cited from arc42 and the ADRs, all defined across `
    + `${designs} slice design(s); ${defined.size} defined in total.`,
  );
  process.exit(0);
}

for (const [ref, files] of orphans) console.log(`  ${ref}  cited by ${files.join(', ')} — defined nowhere`);
console.error(
  `\n${orphans.length} citation(s) no longer resolve. Shortening a design may cut the argument `
  + 'around a definition; it may not cut the definition out from under something that cites it. '
  + 'Either keep the definition, or remove the citation in the same commit.',
);
process.exit(1);
