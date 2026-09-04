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
 * Word-boundary matched, NOT a substring match. The step-1 draft specified a plain substring
 * test, and `600000` — an ordinary six-hundred-second timeout that could legitimately appear
 * anywhere in src/ — contains `60000`. `\b` treats `_` as a word character, so `\b60_000\b`
 * and `\b60000\b` each require the token to stand alone: neither matches inside `600000`
 * (measured below, in the word-boundary regression guard) nor inside a longer identifier.
 */
const DURATION_LITERAL = /\b(?:60_000|60000)\b/;

/** Definitions, not call sites — `^\s*export\s+(function|const|type)\s+<name>\b`, per line. */
function exportsDefinitionOf(content: string, kind: 'function' | 'const' | 'type', name: string): boolean {
  const pattern = new RegExp(`^\\s*export\\s+${kind}\\s+${name}\\b`, 'm');
  return pattern.test(content);
}

const MARKER_TESTS: ReadonlyArray<{ name: Marker; test: (content: string) => boolean }> = [
  {
    name: 'duration-arithmetic',
    test: (c) =>
      DURATION_LITERAL.test(c) ||
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
  {
    label: 'duration arithmetic outside duration.ts',
    file: 'src/application/bookAppointment.ts',
    contents: 'export function endOf(startsAt: number, minutes: number): number {\n' +
      '  const endsAt = startsAt + minutes * 60_000;\n' +
      '  return endsAt;\n' +
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
