import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * QS-12 — "ambiguity containment" (AC-5), and ADR-0013's narrowed consequence for AC-6.
 *
 * AC-5  duration arithmetic appears only in src/domain/duration.ts; occupancy-interval
 *       construction only in src/domain/interval.ts; wall-clock/IANA-zone reasoning only in
 *       src/domain/openingHours.ts.
 * ADR-0013  "the test-engineer is adding a source scan it owns, under tests/architecture/,
 *       that fails when an outside-in test file references src/ by any route — which catches
 *       the [dynamic-import] form dependency-cruiser cannot." (docs/adr/0013 §"Bad, or
 *       deferred"). That is the second `describe` block below.
 *
 * A source scan that finds nothing because its glob was wrong reports the same green as a
 * scan that finds nothing because the tree is clean. Three mechanisms separate them, in both
 * scans below: (1) a corpus guard asserting what was actually examined, before any violation
 * assertion; (2) a planted-violation control, so the scan is shown to fire; (3) a conforming
 * negative control, so it is shown NOT to fire on legitimate code — "exactly one", not "at
 * most one", so a scan over an empty tree cannot pass vacuously.
 */

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

// ─────────────────────────────────────────────────────────────────── fixture machinery ──

const fixtures: string[] = [];
afterAll(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

function write(root: string, relativePath: string, contents: string): void {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function newFixture(label: string): string {
  const root = mkdtempSync(join(tmpdir(), `keyloop-ambiguity-${label}-`));
  fixtures.push(root);
  return root;
}

function plant(root: string, sources: Record<string, string>): string[] {
  for (const [path, contents] of Object.entries(sources)) write(root, path, contents);
  return Object.keys(sources);
}

/** Root resolved from `import.meta.url`, NEVER `process.cwd()` (design §7.1; 00a's own lesson). */
function listFilesUnder(absoluteDir: string): string[] {
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(absoluteDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(absoluteDir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesUnder(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function toPosixRelative(rootDir: string, absoluteFile: string): string {
  return relative(rootDir, absoluteFile).split('\\').join('/');
}

// ───────────────────────────────────────────────────────── AC-5 / QS-12: the three markers ──

type Marker = 'duration-arithmetic' | 'occupancy-interval' | 'wall-clock-and-zone';

interface MarkerHit {
  readonly marker: Marker;
  readonly file: string;
}

/**
 * `duration-arithmetic` — DEFINED BY WHAT IT MUST CATCH, not by one spelling (design §7.2.1,
 * R-01-6). The architect ruled the earlier definition its own defect: both the step-1 and
 * step-2 versions said "the literal `60_000` or `60000`, matched on word boundaries", which is
 * a SPELLING. `minutes * 60 * 1000`, `1000 * 60`, `ms / 60000` and `secs * 1000` are all the
 * same concept and all went unflagged — and §7.4's planted control used the one spelling the
 * pattern was written for, so it proved only that the pattern matches itself.
 *
 * The concept: ANY conversion between minutes or seconds and milliseconds, anywhere under
 * `src/` outside `duration.ts`. §7.2.1's six-row spelling table, and which pattern covers it:
 *
 *   1  `60_000`, `60000`                       MS_PER_MINUTE_LITERAL
 *   2  `60 * 1000`, `1000 * 60`, `60*1_000`    MS_PER_MINUTE_PRODUCT
 *   3  `minutes * 60 * 1000`, `60 * 60 * 1000` MS_PER_MINUTE_PRODUCT — a three-term product
 *                                              CONTAINS `60 * 1000`, so row 2 subsumes it
 *   4  `ms / 60000`, `ms / (60 * 1000)`        rows 1 and 2 again — a divisor is the same
 *                                              token in a different operator position, and
 *                                              matching the token rather than the expression
 *                                              is why the inverse needs no pattern of its own
 *   5  `60_000.0`, `60000.0`                   MS_PER_MINUTE_LITERAL — `\b` sits between the
 *                                              final `0` and the `.`, so the decimal variant
 *                                              matches without a second alternative
 *   6  `seconds * 1000`, `minutes * 1000`      MS_PER_SECOND_SCALE + isMinutesOrSecondsQuantity
 *
 * THE WORD-BOUNDARY CORRECTION STANDS AND IS NOT UNDONE. `600000` — an ordinary
 * six-hundred-second timeout — must still not match. `\b` treats `_` as a word character, so
 * `\b60_000\b` and `\b60000\b` each require the token to stand alone; neither matches inside
 * `600000` (asserted below, in the word-boundary regression guard) nor inside a longer
 * identifier. `\b1_?000\b` carries the same protection for row 2's thousand.
 *
 * ROW 6 IS THE WIDEST, and the design says so outright: a two-step conversion — `const secs =
 * minutes * 60;` then `secs * 1000` — is exactly how this arithmetic escapes a scan that only
 * knows the fused constant. But `x * 1000` is not duration arithmetic on its own (`kilobytes *
 * 1000` is bytes), so the row is scoped by the QUANTITY being scaled: the identifier must
 * contain a whole word-segment naming minutes or seconds. Segments, not substrings — `admin`
 * and `minimumSpend` contain "min" and are not minutes, and a substring test would have made
 * row 6 the false-positive machine its critics expect. Both are asserted below.
 *
 * If row 6 false-positives on something genuinely not duration arithmetic, §7.2.1 rules that
 * is "a finding to raise, not a licence to narrow the concept back to a spelling", so the
 * remedy would be a DCR and not a quiet edit here.
 */
const MS_PER_MINUTE_LITERAL = /\b(?:60_000|60000)\b/;
const MS_PER_MINUTE_PRODUCT = /\b60\s*\*\s*1_?000\b|\b1_?000\s*\*\s*60\b/;

/** Row 6, first half: an identifier multiplied by 1000, in either operand order. */
const MS_PER_SECOND_SCALE_SOURCE =
  '\\b([A-Za-z_$][A-Za-z0-9_$]*)\\s*\\*\\s*1_?000\\b' +
  '|\\b1_?000\\s*\\*\\s*([A-Za-z_$][A-Za-z0-9_$]*)\\b';

const MINUTE_OR_SECOND_WORDS = new Set([
  'sec',
  'secs',
  'second',
  'seconds',
  'min',
  'mins',
  'minute',
  'minutes',
]);

/**
 * Row 6, second half: is this identifier naming a quantity of minutes or seconds?
 *
 * camelCase and snake_case are split into segments and each segment is matched WHOLE against
 * the word list. `durationMinutes` -> [duration, minutes] yes; `totalSecs` -> [total, secs]
 * yes; `MINUTES` -> [minutes] yes; `admin` -> [admin] no; `minimumSpend` -> [minimum, spend]
 * no. A substring test would say yes to the last two, which is the difference between a wide
 * rule and a broken one.
 */
function isMinutesOrSecondsQuantity(identifier: string): boolean {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[_$\s]+/)
    .filter(Boolean)
    .some((segment) => MINUTE_OR_SECOND_WORDS.has(segment.toLowerCase()));
}

function matchesDurationArithmetic(content: string): boolean {
  if (MS_PER_MINUTE_LITERAL.test(content)) return true;
  if (MS_PER_MINUTE_PRODUCT.test(content)) return true;
  for (const match of content.matchAll(new RegExp(MS_PER_SECOND_SCALE_SOURCE, 'g'))) {
    const identifier = match[1] ?? match[2];
    if (identifier !== undefined && isMinutesOrSecondsQuantity(identifier)) return true;
  }
  return false;
}

/** Definitions, not call sites — `^\s*export\s+(function|const|type)\s+<name>\b`, per line. */
function exportsDefinitionOf(content: string, kind: 'function' | 'const' | 'type', name: string): boolean {
  const pattern = new RegExp(`^\\s*export\\s+${kind}\\s+${name}\\b`, 'm');
  return pattern.test(content);
}

const MARKER_TESTS: ReadonlyArray<{ name: Marker; test: (content: string) => boolean }> = [
  {
    name: 'duration-arithmetic',
    test: (c) =>
      matchesDurationArithmetic(c) ||
      exportsDefinitionOf(c, 'function', 'serviceDuration') ||
      exportsDefinitionOf(c, 'const', 'serviceDuration') ||
      exportsDefinitionOf(c, 'function', 'durationMillis') ||
      exportsDefinitionOf(c, 'const', 'durationMillis'),
  },
  {
    name: 'occupancy-interval',
    test: (c) =>
      exportsDefinitionOf(c, 'function', 'appointmentInterval') ||
      exportsDefinitionOf(c, 'const', 'appointmentInterval') ||
      exportsDefinitionOf(c, 'function', 'occupancyInterval') ||
      exportsDefinitionOf(c, 'const', 'occupancyInterval') ||
      exportsDefinitionOf(c, 'type', 'Interval'),
  },
  {
    name: 'wall-clock-and-zone',
    test: (c) => /Intl\s*\.\s*DateTimeFormat/.test(c) || /\b(?:timeZone|ianaZone|time_zone)\b/.test(c),
  },
];

const PERMITTED_FILE: Record<Marker, string> = {
  'duration-arithmetic': 'src/domain/duration.ts',
  'occupancy-interval': 'src/domain/interval.ts',
  'wall-clock-and-zone': 'src/domain/openingHours.ts',
};

/** Corpus: `src/**\/*.ts`. Migrations are `.sql` and are outside it — see the corpus guard. */
function listSourceCorpus(rootDir: string): string[] {
  return listFilesUnder(join(rootDir, 'src'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => toPosixRelative(rootDir, f));
}

function scanForMarkers(rootDir: string): MarkerHit[] {
  const hits: MarkerHit[] = [];
  for (const relFile of listSourceCorpus(rootDir)) {
    const content = readFileSync(join(rootDir, relFile), 'utf8');
    for (const marker of MARKER_TESTS) {
      if (marker.test(content)) hits.push({ marker: marker.name, file: relFile });
    }
  }
  return hits;
}

// ─────────────────────────────────────────────────────── §7.3: the corpus guard (real tree) ──

/** The seven pre-existing modules plus the three this slice adds — named, not counted (00a). */
const NAMED_MODULES = [
  'src/main.ts',
  'src/http/server.ts',
  'src/http/routes/health.ts',
  'src/application/checkHealth.ts',
  'src/persistence/db.ts',
  'src/platform/config.ts',
  'src/domain/duration.ts',
  'src/domain/interval.ts',
  'src/domain/openingHours.ts',
];

describe('§7.3 — corpus guard: what the scan examined, asserted before any violation', () => {
  it('the real src/ tree is non-empty and was scanned', () => {
    const corpus = listSourceCorpus(REPO_ROOT);
    expect(corpus.length, 'src/**/*.ts produced no files — the scan below would be vacuous').toBeGreaterThan(
      0,
    );
  });

  it('the corpus contains every module this design names, by file name', () => {
    // Deliberately includes the three new domain modules. This is RED until the implementer
    // creates them — correctly so: a scan cannot certify containment of a file it never saw,
    // and 00a's own defect was a guard that counted modules rather than naming them.
    const corpus = new Set(listSourceCorpus(REPO_ROOT));
    const missing = NAMED_MODULES.filter((f) => !corpus.has(f));
    expect(missing, 'named modules absent from the scanned corpus').toEqual([]);
  });
});

// ───────────────────────────────────── AC-5 / QS-12: exactly one file matches, on the real tree ──

describe('AC-5 / QS-12 — each marker fires on exactly one file, and it is the permitted one', () => {
  it.each(Object.entries(PERMITTED_FILE))('%s appears in exactly one file: %s', (markerName, permitted) => {
    const hits = scanForMarkers(REPO_ROOT).filter((h) => h.marker === markerName);
    const files = [...new Set(hits.map((h) => h.file))];

    // `exactly one`, not `at most one` — with src/domain empty, "the marker appears only in
    // duration.ts" is vacuously true. This is what makes the assertion fail at the red
    // commit with "found 0" rather than pass vacuously (design §7.5).
    expect(
      files,
      `expected exactly one file under src/ to match ${markerName}; found ${files.length}`,
    ).toEqual([permitted]);
  });
});

// ──────────────────────────────────────────────── §7.4: the planted-violation control ──

interface PlantedCase {
  readonly label: string;
  readonly file: string;
  readonly contents: string;
  readonly marker: Marker;
}

const PLANTED_CASES: readonly PlantedCase[] = [
  {
    label: 'wall-clock reasoning outside openingHours.ts',
    file: 'src/http/routes/appointments.ts',
    contents: "export const format = (tz: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz });\n",
    marker: 'wall-clock-and-zone',
  },
  // §7.4 fixtures 2 and 2b — R-01-6. BOTH plant a spelling §7.2.1's pattern was NOT authored
  // against, and that is the entire point of them. The step-3 version planted
  // `minutes * 60_000` — row 1, the literal the pattern was written for — so a green here
  // proved only that the pattern matches itself. The negative control could not catch that
  // either: a reflexive pattern reports zero on a conforming tree exactly as a correct one
  // does. Restore either fixture to `minutes * 60_000` and this control stops being one.
  {
    label: 'duration arithmetic outside duration.ts — row 3, the three-term product',
    file: 'src/application/bookAppointment.ts',
    contents: 'export function endOf(startsAt: number, minutes: number): number {\n' +
      '  const endsAt = startsAt + minutes * 60 * 1000;\n' +
      '  return endsAt;\n' +
      '}\n',
    marker: 'duration-arithmetic',
  },
  {
    label: 'duration arithmetic outside duration.ts — row 6, the two-step escape',
    file: 'src/application/slotWindow.ts',
    contents: 'export function windowMillis(minutes: number): number {\n' +
      '  const seconds = minutes * 60;\n' +
      '  const ms = seconds * 1000;\n' +
      '  return ms;\n' +
      '}\n',
    marker: 'duration-arithmetic',
  },
  {
    label: 'occupancy-interval construction outside interval.ts',
    file: 'src/persistence/appointmentRepository.ts',
    contents:
      'export function appointmentInterval(startsAt: number, durationMillis: number) {\n' +
      '  return { startsAt, endsAt: startsAt + durationMillis };\n' +
      '}\n',
    marker: 'occupancy-interval',
  },
];

describe('§7.4 — the planted-violation control: one violation per fixture, reported by file and marker', () => {
  it.each(PLANTED_CASES.map((c) => [c.label, c] as const))('%s', (_label, planted) => {
    const root = newFixture('planted');
    const files = plant(root, { [planted.file]: planted.contents });

    const hits = scanForMarkers(root);
    expect(hits.map((h) => `${h.marker} ${h.file}`)).toEqual([`${planted.marker} ${planted.file}`]);
    // and the corpus guard held for this fixture too, in the sense that the planted file
    // really was inside the scanned corpus:
    expect(listSourceCorpus(root)).toEqual(files);
  });
});

describe('§7.4 — the conforming negative control: a tree shaped like the real one reports zero', () => {
  const CONFORMING: Record<string, string> = {
    'src/domain/duration.ts':
      "export type DurationMinutes = number & { readonly __brand: 'DurationMinutes' };\n" +
      'export function serviceDuration(st: { durationMinutes: number }): DurationMinutes | null {\n' +
      '  return st.durationMinutes > 0 ? (st.durationMinutes as DurationMinutes) : null;\n' +
      '}\n' +
      'export function durationMillis(d: DurationMinutes): number {\n' +
      '  return d * 60_000;\n' +
      '}\n',
    'src/domain/interval.ts':
      "export type Instant = number & { readonly __brand: 'Instant' };\n" +
      'export type Interval = { readonly startsAt: Instant; readonly endsAt: Instant };\n' +
      'export function instant(epochMillis: number): Instant | null {\n' +
      '  return Number.isInteger(epochMillis) ? (epochMillis as Instant) : null;\n' +
      '}\n' +
      'export function appointmentInterval(startsAt: Instant, durationMillis: number): Interval {\n' +
      '  return { startsAt, endsAt: (startsAt + durationMillis) as Instant };\n' +
      '}\n' +
      'export function occupancyInterval(interval: Interval): Interval {\n' +
      '  return interval;\n' +
      '}\n',
    'src/domain/openingHours.ts':
      'export function withinOpeningHours(startsAtMillis: number, endsAtMillis: number, ianaZone: string) {\n' +
      "  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: ianaZone, hourCycle: 'h23' });\n" +
      '  return formatter.formatToParts(new Date(startsAtMillis));\n' +
      '}\n',
    // A LEGITIMATE CALL SITE, not a definition — "definitions, not call sites" (§7.2).
    // Calling serviceDuration from application code must not itself trip the marker.
    'src/application/bookAppointment.ts':
      "import type { Db } from '../persistence/db.js';\n" +
      'export function plan(db: Db, minutes: number): unknown {\n' +
      '  return { db, minutes };\n' +
      '}\n',
    'src/persistence/db.ts': 'export type Db = { readonly ok: true };\n',
    // An ORDINARY timeout, unrelated to duration arithmetic. The word-boundary regression
    // guard below asserts on this fixture specifically; it is included here too so the
    // conforming control is not itself silently relying on an empty platform/config.ts.
    'src/platform/config.ts': 'export const requestTimeoutMillis = 600000;\n',
    // ROW 6's BOUNDARY, in the negative control rather than in a one-off fixture, because
    // this is the file that has to stay quiet for the wide row to be usable at all.
    // `x * 1000` is not duration arithmetic; `kilobytes * 1000` is bytes. And the two
    // identifiers that a SUBSTRING test for "min" would flag — `admin` and `minimumSpend` —
    // are here because the segment classifier is the only thing standing between row 6 and a
    // scan that fails on ordinary code.
    'src/platform/units.ts':
      'export const bytesIn = (kilobytes: number): number => kilobytes * 1000;\n' +
      'export const seatsFor = (admin: number): number => admin * 1000;\n' +
      'export const budgetFor = (minimumSpend: number): number => minimumSpend * 1000;\n',
  };

  it('reports each marker exactly once, and only in its permitted file', () => {
    const root = newFixture('conforming');
    plant(root, CONFORMING);

    const hits = scanForMarkers(root);
    for (const [markerName, permitted] of Object.entries(PERMITTED_FILE)) {
      const files = [...new Set(hits.filter((h) => h.marker === markerName).map((h) => h.file))];
      expect(files, `marker ${markerName} on a conforming tree`).toEqual([permitted]);
    }
  });

  it('does NOT flag a call site (as opposed to a definition) of serviceDuration', () => {
    const root = newFixture('conforming-call-site');
    plant(root, CONFORMING);

    const hits = scanForMarkers(root).filter((h) => h.file === 'src/application/bookAppointment.ts');
    expect(hits, 'a call site was flagged as though it were a definition').toEqual([]);
  });

  it('row 6 boundary: `kilobytes * 1000`, `admin * 1000` and `minimumSpend * 1000` are not duration arithmetic', () => {
    // §7.2.1 row 6 is the widest row in the table and the architect expects it to be argued
    // with. This is the argument, made as an assertion: the row is scoped to the QUANTITY
    // being scaled, by whole word-segment, so a `* 1000` on bytes is untouched and the two
    // identifiers a substring test for "min" would catch are untouched too.
    const root = newFixture('row-six-boundary');
    plant(root, CONFORMING);

    const hits = scanForMarkers(root).filter((h) => h.file === 'src/platform/units.ts');
    expect(
      hits,
      'row 6 flagged an ordinary `* 1000` scale — if this ever fires on real code it is a ' +
        'finding to raise (§7.2.1), not a licence to narrow the concept back to a spelling',
    ).toEqual([]);
  });

  it('word-boundary regression guard: an ordinary 600000ms timeout is not duration arithmetic', () => {
    // The step-1 design specified a plain substring match on `60000`, which false-positives
    // on `600000` — an ordinary ten-minute timeout that could legitimately appear anywhere
    // in src/. Measured as a defect at step 2 (design §7.2, §13) and fixed with `\b`.
    const root = newFixture('word-boundary');
    plant(root, CONFORMING);

    const hits = scanForMarkers(root).filter((h) => h.file === 'src/platform/config.ts');
    expect(hits, '600000 was mistaken for the 60_000/60000 duration-arithmetic marker').toEqual([]);
  });
});

// ─────────────────────────────────── §7.2.1: the spelling table, row by row ──

/**
 * The concept is "any minutes/seconds <-> milliseconds conversion outside duration.ts", and
 * §7.2.1 enumerates it as an OPEN set of spellings with the concept stated above it — so a
 * spelling not listed is a gap in the scan rather than a licence. This table is that set,
 * executable. Its negatives are the half that keeps the widest rows honest.
 *
 * §7.4's two planted fixtures already use rows 3 and 6; this covers the rest, and covers them
 * one row at a time so a regression names the spelling it lost rather than "the control".
 */
const SPELLING_ROWS: ReadonlyArray<readonly [string, string, boolean]> = [
  ['row 1 — the fused literal, underscore form', 'const ms = minutes * 60_000;', true],
  ['row 1 — the fused literal, plain form', 'const ms = minutes * 60000;', true],
  ['row 2 — the factors, sixty first', 'const ms = minutes * 60 * 1000;', true],
  ['row 2 — the factors, thousand first', 'const ms = 1000 * 60 * minutes;', true],
  ['row 2 — the factors, no spacing, separated thousand', 'const ms = 60*1_000;', true],
  ['row 3 — three terms through seconds', 'const ms = hours * 60 * 60 * 1000;', true],
  ['row 4 — the inverse, fused literal divisor', 'const minutes = ms / 60000;', true],
  ['row 4 — the inverse, parenthesised factor divisor', 'const minutes = ms / (60 * 1000);', true],
  ['row 5 — decimal variant of the fused literal', 'const ms = minutes * 60_000.0;', true],
  ['row 6 — seconds scaled to milliseconds', 'const ms = seconds * 1000;', true],
  ['row 6 — minutes scaled, thousand first', 'const ms = 1000 * durationMinutes;', true],
  ['row 6 — snake_case quantity', 'const ms = elapsed_secs * 1000;', true],

  // NEGATIVES. Each one is a spelling that LOOKS like a row above and is not the concept.
  ['negative — a six-hundred-second timeout', 'const timeout = 600000;', false],
  ['negative — 600_000, the same number separated', 'const timeout = 600_000;', false],
  ['negative — a thousand scaling something that is not time', 'const bytes = kilobytes * 1000;', false],
  ['negative — "min" as a substring, not a segment', 'const seats = admin * 1000;', false],
  ['negative — "minimum" is not minutes', 'const budget = minimumSpend * 1000;', false],
  ['negative — seconds-of-day normalisation (§7.2: that is wall-clock, not duration)', 'const s = h * 3600 + m * 60;', false],
];

describe('§7.2.1 — duration-arithmetic is a concept, and every spelling in the table is caught', () => {
  it.each(SPELLING_ROWS.map((row) => [row[0], row[1], row[2]] as const))(
    '%s',
    (_label, line, shouldMatch) => {
      const root = newFixture('spelling');
      plant(root, { 'src/application/candidate.ts': `export function f(): void {\n  ${line}\n}\n` });

      const hits = scanForMarkers(root).filter((h) => h.marker === 'duration-arithmetic');
      expect(
        hits.map((h) => h.file),
        shouldMatch
          ? `${line} is a minutes/seconds <-> milliseconds conversion and must be flagged ` +
              'outside duration.ts'
          : `${line} is not duration arithmetic and must not be flagged`,
        ).toEqual(shouldMatch ? ['src/application/candidate.ts'] : []);
    },
  );
});

// ──────────────────────────────────── ADR-0013: no outside-in test computes a src/ import ──

/**
 * ADR-0013's narrowed consequence: `dependency-cruiser` cannot see a COMPUTED dynamic
 * import (that is the whole reason ADR-0013 chose it for reaching `dist/domain/*.js` from
 * this very directory), so the same technique would let a future outside-in test import
 * `src/` invisibly. This scan is the second mechanism the ADR promises, owned by the role
 * that would be the one to breach it.
 *
 * Heuristic, and honestly so: it is a text scan, not a module resolver. It looks for a
 * relative-path fragment climbing out of the test's own directory into `src/` — `../src/`,
 * `../../src/`, and so on — inside an outside-in test file, whether that fragment sits in a
 * plain string or (the case dependency-cruiser cannot see) inside a template literal used to
 * build a computed specifier. `dist/`-referencing specifiers — the legitimate ADR-0013
 * mechanism this very file's sibling (`opening-hours-dst.test.ts`) uses — never match, because
 * the pattern names `src/` specifically.
 *
 * SCOPE, narrowed deliberately and recorded rather than left implicit: `tests/architecture/`
 * is excluded from the directories this particular scan reads, and this file and
 * `layering.test.ts` are the reason. Both are fixture-authoring meta-tests whose entire job is
 * to write source-shaped TEXT — including, several times over in this very file, strings that
 * spell out `../../src/domain/...` as fixture CONTENT for the AC-5 and ADR-0013 checks above
 * and below. A raw-text scan cannot tell "this file's own code" from "a string this file emits
 * as test data" apart — that distinction needs a real parser, which is exactly the tool
 * dependency-cruiser already is for literal/statically-visible imports. What this scan adds is
 * coverage of the COMPUTED form, and the realistic home for that risk is a test capable of
 * reaching a module at runtime — `property`, `setup`, `support` — not a scanner testing a
 * scanner. Measured, not assumed: running this scan over `tests/architecture/**` before this
 * narrowing was added flagged BOTH `layering.test.ts` and this file itself, over fixture
 * strings neither one actually imports.
 */
const OUTSIDE_IN_DIRS = [
  'acceptance',
  'concurrency',
  'contract',
  'performance',
  'property',
  'setup',
  'support',
];

const SRC_REFERENCE = /\.\.\/(?:\.\.\/)*src\//;

interface SrcReferenceHit {
  readonly file: string;
}

function scanOutsideInForSrcReferences(rootDir: string): SrcReferenceHit[] {
  const hits: SrcReferenceHit[] = [];
  for (const dir of OUTSIDE_IN_DIRS) {
    for (const absFile of listFilesUnder(join(rootDir, 'tests', dir))) {
      const relFile = toPosixRelative(rootDir, absFile);
      const content = readFileSync(absFile, 'utf8');
      if (SRC_REFERENCE.test(content)) hits.push({ file: relFile });
    }
  }
  return hits;
}

describe('ADR-0013 — no outside-in test file references src/ by a computed or literal route', () => {
  it('the real tree: zero outside-in files reference src/ (this file\'s own sibling uses dist/, not src/)', () => {
    const hits = scanOutsideInForSrcReferences(REPO_ROOT);
    expect(
      hits.map((h) => h.file),
      'an outside-in test referenced src/ — independence quietly spent',
    ).toEqual([]);
  });

  it('planted control: a computed specifier built from a template literal containing ../../src/ is caught', () => {
    const root = newFixture('src-reference-planted');
    const planted = plant(root, {
      'tests/property/bad.db.test.ts':
        "const name = 'duration';\n" +
        'const specifier = new URL(`../../src/domain/${name}.ts`, import.meta.url).href;\n' +
        'export const load = () => import(specifier);\n',
    });

    const hits = scanOutsideInForSrcReferences(root);
    expect(hits.map((h) => h.file)).toEqual(planted);
  });

  it('negative control: the legitimate dist/-referencing loader is not flagged', () => {
    const root = newFixture('src-reference-negative');
    plant(root, {
      'tests/property/good.test.ts':
        "const name = 'duration';\n" +
        'const specifier = new URL(`../../dist/domain/${name}.js`, import.meta.url).href;\n' +
        'export const load = () => import(specifier);\n',
    });

    const hits = scanOutsideInForSrcReferences(root);
    expect(hits).toEqual([]);
  });

  it('negative control: tests/unit/ and tests/integration/ are out of scope for this scan, on purpose', () => {
    // Those two directories import src/ LEGITIMATELY (CLAUDE.md §5) — this scan only ever
    // looks inside the eight outside-in directories, mirroring
    // `outside-in-tests-do-not-import-src`'s own `from.path` alternation.
    const root = newFixture('src-reference-exempt');
    plant(root, {
      'tests/unit/legitimate.test.ts':
        "import type { Thing } from '../../src/domain/thing.js';\nexport const thing: Thing = { id: 'x' };\n",
    });

    const hits = scanOutsideInForSrcReferences(root);
    expect(hits).toEqual([]);
  });

  it('deliberate scope narrowing: tests/architecture/ itself is not scanned (fixture-authoring meta-tests legitimately embed src/-shaped text as data)', () => {
    const root = newFixture('src-reference-architecture-scope');
    plant(root, {
      'tests/architecture/embeds-example-text.test.ts':
        'const exampleFixtureContent = `../../src/domain/thing.ts`;\nexport const x = exampleFixtureContent;\n',
    });

    const hits = scanOutsideInForSrcReferences(root);
    expect(hits, 'tests/architecture/ must be out of scope — see the SCOPE comment above').toEqual([]);
  });
});
