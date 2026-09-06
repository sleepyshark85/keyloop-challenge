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
import { checkDestinations } from './adr-destinations.mjs';

const argv = process.argv.slice(2);
const REBASELINE = argv.includes('--rebaseline');
// `--pin 0023-….md [more…]` — add ONE new ADR without touching any existing pin.
const PIN = (() => {
  const i = argv.indexOf('--pin');
  if (i === -1) return null;
  const names = argv.slice(i + 1).filter((a) => !a.startsWith('--'));
  return names.length ? names : null;
})();
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

    // A TABLE ROW IS AN OPTION TOO, and missing that was self-inflicted: the concision
    // ruling's own remedy is to fold `Considered options` and `Pros and cons` into a
    // table, so the encouraged form was the one this could not read. ADR-0018 landed with
    // eight options as `| **A** | … | … |` and pinned ZERO, while the guard reported that
    // every considered option survives — O-24's empty-pin failure, reached by a new route.
    //
    // The letter lives in the first cell and the description in the second, so the label
    // is built from both: `A — 40P01 ⇒ other ⇒ 500 …`. Rows whose first cell is not a bare
    // option letter are ordinary table content and are left alone.
    if (inConsidered && /^\s*\|/.test(line)) {
      const cells = line.split('|').map((c) => norm(c)).filter((c, i, a) => i > 0 && i < a.length - 1);
      const letter = cells[0]?.match(/^([A-Z]|[0-9]{1,2})$/i)?.[1];
      if (letter && cells[1]) { found.add(norm(`Option ${letter} — ${cells[1]}`).slice(0, 90)); continue; }
    }

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

  // AN ADR THE BASELINE HAS NEVER SEEN IS INVISIBLE TO IT — F-02-10.
  //
  // This iterated the baseline and nothing else, so a NEW ADR was not unpinned-and-
  // reported, it was simply absent from the loop. ADR-0018 landed with a (c) ruling and
  // the guard printed "17 ADR(s) checked: every considered option and chosen option
  // survives" — green, over a decision record it had never opened. The failure is the
  // family this project keeps finding: a check that can only see what it was told about
  // reports the absence of a problem it is incapable of having.
  //
  // It is a FAILURE rather than a warning because the window is exactly when it matters:
  // a new ADR is `proposed`, so it will be edited before ratification, which is when a
  // dropped option is most likely and least visible. Remedy is a targeted pin, not
  // `--rebaseline` — that rewrites all existing pins too, discarding the pre-condensation
  // evidence for every other ADR to register one new file.
  const known = new Set(Object.keys(baseline));
  for (const f of readdirSync(adrDir).filter((x) => /^\d{4}-.*\.md$/.test(x))) {
    if (!known.has(f)) problems.push({ file: f, kind: 'unpinned', detail: 'on disk, absent from the baseline' });
  }

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

/**
 * ONE SERIALISER, so writing the baseline can never reformat it — F-04-1.
 *
 * This tool told you not to run `--rebaseline` because it rewrites every pin, and then left
 * you no way to add one ADR except by hand. The hand-edit had a trap of its own: the
 * committed file escapes every non-ASCII codepoint (`—` and friends, 215 of them) and
 * `JSON.stringify` emits them raw, so the obvious fix silently reformats 198 of 294 lines —
 * a 398-line diff on the exact file whose own error message warns against exactly that.
 *
 * It recurred four slices running (F-02-10, F-04-1 twice, A-04-4) and cost an architect a
 * commit outside its brief, which is the point at which "known trap" stops being an
 * acceptable answer. Both writers now go through here, so the encoding is a property of the
 * tool rather than of whoever last remembered it.
 */
const serialise = (obj) => `${JSON.stringify(obj, null, 1)
  .replace(/[-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}\n`;

const pinOf = (file) => {
  const t = readFileSync(join(ADR, file), 'utf8');
  return { options: [...optionsIn(t)].sort(), decision: chosenIn(t) };
};

if (!existsSync(BASELINE) && !REBASELINE) {
  console.error(`no baseline at ${BASELINE} — capture one with --rebaseline before condensing`);
  process.exit(2);
}

if (PIN) {
  // A TARGETED APPEND. It reads the existing file, adds or replaces exactly the named
  // entries, and rewrites through the same serialiser — so the diff is the new ADR and
  // nothing else, and the pre-condensation evidence for every other ADR survives.
  const current = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
  const missing = PIN.filter((f) => !existsSync(join(ADR, f)));
  if (missing.length) {
    console.error(`not in ${ADR}: ${missing.join(', ')}`);
    process.exit(2);
  }
  const before = serialise(current);
  for (const f of PIN) current[f] = pinOf(f);
  const next = serialise(Object.fromEntries(Object.keys(current).sort().map((k) => [k, current[k]])));
  writeFileSync(BASELINE, next);
  const churn = before.split('\n').filter((l, i) => l !== next.split('\n')[i]).length;
  console.log(`pinned ${PIN.join(', ')} → ${BASELINE} (${churn} line(s) changed)`);
  process.exit(0);
}

if (REBASELINE) {
  const out = {};
  for (const f of readdirSync(ADR).filter((x) => /^\d{4}-.*\.md$/.test(x))) out[f] = pinOf(f);
  writeFileSync(BASELINE, serialise(out));
  console.log(`rebaselined ${Object.keys(out).length} ADR(s) → ${BASELINE}`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const LOG = resolve(flag('log', process.env.TEAM_LOG ?? 'docs/team-log/events.jsonl'));
const SLICES = resolve(flag('slices', 'docs/slices'));
const logEvents = existsSync(LOG)
  ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean)
      .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } })
  : [];

const problems = [...check(ADR, baseline), ...checkDestinations(ADR, SLICES, logEvents)];

if (!problems.length) {
  console.log(`${Object.keys(baseline).length} ADR(s) checked: every considered option and chosen option survives.`);
  process.exit(0);
}

for (const p of problems) console.log(`  ${p.file}\n    ${p.kind}: ${p.detail}`);
if (problems.some((p) => p.kind === 'unpinned')) {
  const unpinned = problems.filter((p) => p.kind === 'unpinned').map((p) => p.file);
  console.log(
    `\n  Pin it:  npm run docs:adr-check -- --pin ${unpinned.join(' ')}\n`
    + '  Do NOT run --rebaseline: it rewrites every existing pin, discarding the\n'
    + '  pre-condensation evidence for every other ADR to register one new file.',
  );
}
const DESTINATION_KINDS = ['destination-unknown', 'destination-unrecorded'];
const contentLost = problems.filter((p) => !DESTINATION_KINDS.includes(p.kind));
const destinations = problems.filter((p) => DESTINATION_KINDS.includes(p.kind));
if (contentLost.length) {
  console.error(
    `\n${contentLost.length} ADR(s) lost content a condensation may not remove. Shortening may merge `
    + 'sections and cut prose; it may not drop a considered option or alter the chosen one — a '
    + 'rejected option is the evidence that the decision was a choice rather than a default.',
  );
}
if (destinations.length) {
  console.error(
    `\n${destinations.length} ADR(s) name a destination that no tool can follow. A-05-5: an ADR may `
    + 'never be the only place a destination is recorded, because an obligation that lives in one '
    + 'document survives exactly as long as someone remembers it.',
  );
}
process.exit(1);
