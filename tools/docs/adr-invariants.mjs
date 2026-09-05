#!/usr/bin/env node
/**
 * An ADR may be shortened.  It may not quietly lose a decision.
 *
 *   npm run docs:adr-check           # report
 *   npm run docs:adr-check -- --rebaseline
 *
 * WHY THIS EXISTS. `CLAUDE.md` §4 says accepted ADRs are immutable. On 2026-09-05 the
 * human overrode that **for length only** — an accepted ADR may be condensed, but not
 * changed in meaning. That override is sound: §4's stated purpose is that "the history
 * of how thinking changed is the point", and that history lives in git and in the event
 * log, not in the file being frozen. What immutability uniquely protects is that a
 * reader citing ADR-0006 later gets the same *decision*, and a meaning-preserving
 * condensation does not break that.
 *
 * But "shortened without changing the meaning" is a claim, and this project does not
 * accept a claim about a mechanism without running it. Condensing seventeen decision
 * records by hand can drop a rejected option or soften a chosen one, and nothing about
 * a smaller word count would report it. So the two things a condensation must never
 * lose are pinned to a baseline captured BEFORE the pass:
 *
 *   1. THE OPTION SET. Every option ever considered still appears. A rejected option is
 *      the most deletable thing in an ADR and the most valuable — it is the evidence
 *      that a decision was a choice rather than a default, which is what the assessment
 *      grades. This is the invariant that earns the tool.
 *   2. THE CHOSEN OPTION. The `Chosen option:` line survives, so the decision itself
 *      cannot drift while the surrounding argument is trimmed.
 *
 * Sections may be merged and prose may go: the ruling's own remedy is to fold
 * `Considered options` and `Pros and cons of the options` into one table, so the option
 * set is matched wherever it appears in the document rather than only under its
 * original heading.
 *
 * `--rebaseline` is for a genuinely NEW option added by a genuinely new decision. It
 * rewrites the pinned file, so it shows up in a diff and has to be justified in a commit
 * message — which is the point. It is not a way past a failure.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const argv = process.argv.slice(2);
const REBASELINE = argv.includes('--rebaseline');
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };

const ADR = resolve(flag('adr', 'docs/adr'));
const BASELINE = resolve(flag('baseline', 'tools/docs/adr-baseline.json'));

const norm = (s) => s.replace(/[*`_]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Option labels, matched anywhere in the document.
 *
 * Deliberately not scoped to the `## Considered options` heading: the whole point of the
 * ruling is that those two sections collapse into one table, so a scan tied to the old
 * heading would fail on every correctly-condensed file and pass on a gutted one.
 */
export function optionsIn(text) {
  const found = new Set();
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*[-*]\s*(\S.*)$/) || line.match(/^\s*\|\s*([^|]+?)\s*\|/);
    if (m) found.add(norm(m[1]).slice(0, 90));
  }
  return found;
}

export function chosenIn(text) {
  return norm(text.match(/Chosen option[^\n]*/)?.[0] ?? '');
}

/** A baseline label is present if any current label starts with it, or vice versa. */
const covers = (current, label) => {
  if (!label) return true;
  for (const c of current) {
    if (c === label || c.startsWith(label) || label.startsWith(c)) return true;
  }
  return false;
};

export function check(adrDir, baseline) {
  const problems = [];
  for (const [file, want] of Object.entries(baseline)) {
    const path = join(adrDir, file);
    if (!existsSync(path)) { problems.push({ file, kind: 'missing', detail: 'file is gone' }); continue; }
    const text = readFileSync(path, 'utf8');
    const have = optionsIn(text);
    const lost = (want.options ?? []).filter((o) => !covers(have, o));
    if (lost.length) {
      problems.push({ file, kind: 'options-dropped', detail: lost.join(' · ') });
    }
    if (want.decision && !covers(new Set([chosenIn(text)]), want.decision)) {
      problems.push({ file, kind: 'decision-changed', detail: `was: ${want.decision}` });
    }
  }
  return problems;
}

if (!existsSync(BASELINE) && !REBASELINE) {
  console.error(`no baseline at ${BASELINE} — capture one with --rebaseline before condensing`);
  process.exit(2);
}

if (REBASELINE) {
  const out = {};
  for (const f of readdirSync(ADR).filter((x) => /^\d{4}-.*\.md$/.test(x))) {
    const t = readFileSync(join(ADR, f), 'utf8');
    out[f] = { options: [...optionsIn(t)].sort(), decision: chosenIn(t) };
  }
  writeFileSync(BASELINE, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`rebaselined ${Object.keys(out).length} ADR(s) → ${BASELINE}`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const problems = check(ADR, baseline);

if (!problems.length) {
  console.log(`${Object.keys(baseline).length} ADR(s) checked: every considered option and chosen option survives.`);
  process.exit(0);
}

for (const p of problems) console.log(`  ${p.file}\n    ${p.kind}: ${p.detail}`);
console.error(
  `\n${problems.length} ADR(s) lost content a condensation may not remove. Shortening may merge `
  + 'sections and cut prose; it may not drop a considered option or alter the chosen one — a '
  + 'rejected option is the evidence that the decision was a choice rather than a default.',
);
process.exit(1);
