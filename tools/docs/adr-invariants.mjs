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
  // OPTION LABELS ONLY — not every bullet in the file.
  //
  // The first version matched any list item or leading table cell, and pinned 809 labels
  // across seventeen ADRs of which just 75 were options. The rest were pros-and-cons
  // prose, ordinary bullets, and in one case a table rule (`--`). That is the same
  // spelling-versus-concept error this project has now found in five markers, and here it
  // did active harm: pinning a `Good, because …` line means its first physical line must
  // survive verbatim as a prefix, which set a hard floor of 469–842 words per ADR before
  // any context, made the fold into a pure options table impossible, and forced prose to
  // end mid-clause because adding a full stop broke the match. A guard that dictates
  // punctuation is measuring the wrong thing.
  //
  // What the ruling protects is the OPTION SET: a rejected option is the evidence that a
  // decision was a choice rather than a default. So an option is a bullet or heading
  // labelled `Option X`, or any bullet under `## Considered options` — the two shapes the
  // corpus actually uses, before and after the condensation.
  const found = new Set();
  // Fenced blocks are skipped. The budget does not charge for them, so a scan that read
  // them would let prose be laundered into a fence to keep its pin while going free.
  const lines = text.replace(/```[\s\S]*?```/g, '').split('\n');
  let inConsidered = false;
  for (const line of lines) {
    const heading = line.match(/^##+\s+(.*)$/);
    if (heading) inConsidered = /^considered options\b/i.test(norm(heading[1]));
    const item = line.match(/^\s*[-*]\s+(\S.*)$/) || line.match(/^##+\s+(\S.*)$/);
    if (!item) continue;
    const label = norm(item[1]);
    if (/^\*{0,2}Option\s+[A-Z0-9]/i.test(label) || (inConsidered && !heading)) {
      found.add(label.slice(0, 90));
    }
  }
  return found;
}

export function chosenIn(text) {
  return norm(text.match(/Chosen option[^\n]*/)?.[0] ?? '');
}

/**
 * An option is identified by its LETTER, not by its phrasing.
 *
 * Pinning the label text forbade rewording, which the ruling explicitly permits — and the
 * condensation did reword: `Option A — normalise the exclusive endpoint to 86400 on the
 * start's day` became `Option A — normalise the endpoint`. Same option, shorter label. The
 * prefix rule reported fifteen ADRs as having dropped options that were all still there,
 * listed by letter, three lines below the heading.
 *
 * A guard that fires on correct work is worse than no guard, because it is the one people
 * switch off. So what is pinned is what the ruling actually protects: the SET OF OPTIONS
 * a decision weighed. Drop Option C and this fails; rewrite Option C's summary and it does
 * not. The prose that argues each option is exactly what the ruling frees you to compress.
 */
const letterOf = (label) => norm(label).match(/^Option\s+([A-Z0-9]+)\b/i)?.[1]?.toUpperCase() ?? null;

const covers = (current, label) => {
  if (!label) return true;
  const want = letterOf(label);
  if (want) {
    for (const c of current) if (letterOf(c) === want) return true;
    return false;
  }
  // A considered-options entry that is not letter-labelled falls back to prefix matching.
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
