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

type Marker =
  | 'duration-arithmetic'
  | 'occupancy-interval'
  | 'wall-clock-reasoning'
  | 'zone-transport'
  | 'appointment-table-access'
  | 'contended-resource-cast';

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


// ────────────────────────────────── slice 02: the markers respecified, and the two new ones ──

/**
 * COMMENTS ARE STRIPPED FOR THE FOUR SLICE-02 MARKERS, AND ONLY FOR THEM.
 *
 * Three of the four are defined over tokens that appear naturally in PROSE — a docblock that
 * says "reads from appointment", or one that quotes `getHours` while explaining why the module
 * must not call it. A raw-text scan cannot tell a module's code from its own commentary, and a
 * marker that fires on the sentence explaining the rule is a marker nobody can keep green.
 *
 * It is NOT applied to `duration-arithmetic` or `occupancy-interval`. Those two are merged,
 * passing, and their permitted files may well carry their literals inside docblocks; changing
 * what they examine would be a silent change to a slice-01 claim inside a slice-02 commit.
 *
 * The stripper is deliberately simple and is documented as residue rather than sold as a
 * parser: it removes `/* … *\/` blocks and `// …` lines, and it does not know that either can
 * appear inside a string literal. A `const sql = "-- // not a comment"` would lose text it
 * should have kept. That direction is the safe one for a containment scan's false NEGATIVES
 * only in the sense that it is the direction §4.2's "residue, named rather than promised away"
 * already covers; a spelling this misses is a finding to raise, not a licence.
 */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * `wall-clock-reasoning` — arc42 §10.2's concept, verbatim: DERIVING A WALL CLOCK OR CALENDAR
 * FIELD FROM AN INSTANT, BY ANY ROUTE. Permitted in `src/domain/openingHours.ts` and nowhere
 * else.
 *
 * It replaces slice 01's `wall-clock-and-zone`, which was ruled BLIND at step 2 (E-02-2,
 * design §8 measurement 12). Measured on this repository with three zone-reasoning violations
 * planted into a copy of `src/`:
 *
 *   `d.toLocaleString('en-GB')` in a route          MISSED   <- the worst bug available here:
 *                                                              it silently uses the SERVER's zone
 *   `d.getHours()` in a use case                    MISSED
 *   `new Intl.DateTimeFormat(…)` in a repository    caught
 *
 * Two of three, including the one that produces wrong opening-hours verdicts on a server in a
 * different zone. A scan that reports very nearly the same file set whether or not the tree
 * contains zone reasoning is not evidence — the standard this project applied to
 * `domain-is-pure` at slice 01 and to `duration-arithmetic` at R-01-6.
 *
 * The forms below ENUMERATE the concept and are OPEN (design §0/E-02-2, arc42 §10.2, GC-1,
 * ADR-0001). A spelling not listed is a gap to raise, not a licence.
 *
 * TWO EXCLUSIONS ARE BOUNDARIES THE ARCHITECT DREW, NOT SPELLINGS THE LIST FORGOT, and both
 * have negative controls below so the difference is executable:
 *
 *   - the `getUTC*` family — zone-FREE by construction, and the correct way to read an instant
 *     outside the domain;
 *   - ambient-zone CONSTRUCTION (`new Date(y, m, d, …)`, a zone-less `Date.parse('…T09:00')`).
 *     It is the same bug class, but it builds an instant FROM a wall clock rather than deriving
 *     one from an instant, so it falls outside the concept as worded. Widening to reach it
 *     would also catch legitimate fixture construction. Design §0 books it as a deliberate row
 *     in arc42 §11's irreducible-for-a-text-scan table, beside `duration-arithmetic`'s.
 *
 * ONE NARROWING IS MINE AND IS STATED SO IT CAN BE ARGUED WITH. `toString` is on the
 * architect's form list, and a bare `\btoString\b` would fire on `buffer.toString('hex')` and
 * `n.toString(16)` — ordinary code with no wall clock anywhere near it. `Date.prototype.toString`
 * TAKES NO ARGUMENTS, so the zero-argument call is the only form that can be it, and that is
 * what the pattern requires. `toDateString` and `toTimeString` are Date-only and need no such
 * scoping. R-01-6's precedent is that the architect defines the marker as a concept and the
 * test-engineer implements it with the four mechanisms; this is that, and the argument-bearing
 * forms are asserted as negatives below.
 */
const WALL_CLOCK_FORMS: ReadonlyArray<readonly [string, RegExp]> = [
  // explicit formatting
  ['Intl.DateTimeFormat', /\bIntl\s*\.\s*DateTimeFormat\b/],
  ['formatToParts', /\bformatToParts\s*\(/],
  ['hourCycle', /\bhourCycle\b/],
  ['timeZone as an option key', /\btimeZone\s*:/],
  // ambient-zone rendering
  ['toLocaleString / toLocaleDateString / toLocaleTimeString', /\.toLocale(?:String|DateString|TimeString)\s*\(/],
  ['toDateString / toTimeString', /\.to(?:Date|Time)String\s*\(/],
  ['a zero-argument .toString()', /\.toString\s*\(\s*\)/],
  // ambient-zone field reads, and their `set` counterparts
  [
    'getHours / getMinutes / getSeconds / getMilliseconds / getDay / getDate / getMonth / getFullYear, and set*',
    /\.(?:get|set)(?:Hours|Minutes|Seconds|Milliseconds|Day|Date|Month|FullYear)\s*\(/,
  ],
  // the cheapest hand-rolled route to a local rendering, and the one that matters most: a list
  // stopping before it leaves the obvious escape open (design §0/E-02-2).
  ['getTimezoneOffset', /\.getTimezoneOffset\s*\(/],
];

function matchesWallClockReasoning(content: string): boolean {
  return WALL_CLOCK_FORMS.some(([, pattern]) => pattern.test(content));
}

/**
 * `zone-transport` — the identifier `time_zone` or `ianaZone`, and nothing else.
 *
 * arc42 §10.2: "CARRYING AN OPAQUE ZONE STRING IS NOT REASONING ABOUT A ZONE. Naming a
 * `time_zone` column, or moving its value uninterpreted, is transport, held to its own short
 * named file list."
 *
 * This slice is what forced the split. A dealership's IANA zone must travel from a `text`
 * column into a pure function that takes it as a parameter, and the column HAS A NAME that any
 * runtime read has to say — measured at step 2 across raw `pg` with a column list, `select *`
 * followed by `row.time_zone`, and a `sql` template: every one is caught identically, so
 * ADR-0006's query layer is not implicated and reconsidering it would change nothing.
 *
 * QS-12's response measure — "one source file plus one migration" — SURVIVES the split, and
 * that is the test of whether the split is honest: the transport files hold a string they never
 * interpret, so if ADR-0001's rule grows breaks, holidays or a second zone per dealership, only
 * `openingHours.ts` changes. A split that moved real REASONING into the permitted list would
 * break that measure, which is why `wall-clock-reasoning` still fires inside a
 * transport-permitted file — asserted, not assumed, in the planted controls below.
 */
const ZONE_TRANSPORT = /\b(?:time_zone|ianaZone)\b/;

/**
 * `appointment-table-access` — a query ISSUED AGAINST the `appointment` table. Permitted in
 * `src/persistence/appointmentRepository.ts` only. This is AC-5's mechanism: "no code path
 * reads availability and then decides whether to insert."
 *
 * IT IS A CONCEPT, NOT THE TOKEN `appointment` — T-02-2, agreed in part at step 2. Measured:
 * `/\bappointment\b/` over `src/**\/*.ts` at HEAD reports two files (`domain/interval.ts`,
 * `persistence/schema.ts`), both of them PROSE and a Kysely type declaration; the concept form
 * reports ZERO, which is the right answer when nothing outside the repository touches the table
 * and the repository does not exist yet.
 *
 * The architect disagreed with the other half of that objection and the disagreement is
 * load-bearing: this marker is INCOMPLETE, not blind. On a fixture with violations planted it
 * catches both forms (design §8 measurement 11), where `wall-clock-and-zone` missed two of
 * three. Redefining the concept would not have fixed this one; adding mechanisms would not have
 * fixed that one.
 *
 * Two forms:
 *   A. the Kysely builder entry points, with the table as a string literal;
 *   B. SQL text — a `sql` template or a query string — with the table in keyword position.
 *
 * Residue, named rather than promised away (§4.2), and irreducible for a text scan: a computed
 * or interpolated table name; a database VIEW over `appointment`; a helper inside
 * `appointmentRepository.ts` that legitimately holds the token and is then called from
 * anywhere. The first two are gaps in the scan, not licences. The third is why §4.1's brand
 * exists.
 */
const APPOINTMENT_TABLE_KYSELY =
  /\b(?:selectFrom|insertInto|updateTable|deleteFrom|replaceInto|into|innerJoin|leftJoin|rightJoin|fullJoin|crossJoin|innerJoinLateral|leftJoinLateral)\s*\(\s*['"`](?:public\.)?appointment\b/;
const APPOINTMENT_TABLE_SQL =
  /\b(?:from|into|update|join|table|truncate)\s+(?:only\s+)?(?:public\s*\.\s*)?"?appointment"?\b/i;

function matchesAppointmentTableAccess(content: string): boolean {
  return APPOINTMENT_TABLE_KYSELY.test(content) || APPOINTMENT_TABLE_SQL.test(content);
}

/** `contended-resource-cast` — the one escape §4.1 measured, confined to the site that mints the brand. */
const CONTENDED_RESOURCE_CAST = /\bas\s+ContendedResource\b/;


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
    name: 'wall-clock-reasoning',
    test: (c) => matchesWallClockReasoning(stripComments(c)),
  },
  {
    name: 'zone-transport',
    test: (c) => ZONE_TRANSPORT.test(stripComments(c)),
  },
  {
    name: 'appointment-table-access',
    test: (c) => matchesAppointmentTableAccess(stripComments(c)),
  },
  {
    name: 'contended-resource-cast',
    test: (c) => CONTENDED_RESOURCE_CAST.test(stripComments(c)),
  },
];

/**
 * Markers whose containment claim is "EXACTLY ONE file under src/, and it is this one".
 *
 * `zone-transport` is not here because its claim is a NAMED LIST rather than a single file,
 * and `contended-resource-cast` is not here because its claim is containment only — both are
 * asserted separately below, with their reasons.
 */
const PERMITTED_FILE: Record<
  Exclude<Marker, 'zone-transport' | 'contended-resource-cast'>,
  string
> = {
  'duration-arithmetic': 'src/domain/duration.ts',
  'occupancy-interval': 'src/domain/interval.ts',
  'wall-clock-reasoning': 'src/domain/openingHours.ts',
  // §4.2 mechanism 4, the one the specification was missing: EXACTLY this file, not AT MOST
  // this file. A scan reporting zero because its glob is wrong now fails, instead of passing
  // the way a clean tree passes — and it gives the marker real content at the red commit,
  // since `appointmentRepository.ts` does not exist yet.
  'appointment-table-access': 'src/persistence/appointmentRepository.ts',
};

/**
 * `zone-transport`'s permitted list, asserted by SET EQUALITY and not by containment.
 *
 * The architect's reason, kept here because it is the whole point of the marker: an
 * over-long transport list is exactly how transport turns into reasoning without anyone
 * deciding to. A file that should NOT be on the list fails this assertion just as a missing
 * one does, so growing the list is a deliberate act with a diff attached.
 *
 * CONSEQUENCE, FLAGGED RATHER THAN RESOLVED. Set equality means each of these four files must
 * actually carry `time_zone` or `ianaZone` in code. Design §2.5 sketches `deriveInterval`'s
 * signature with a parameter named `zone`, which would NOT match — so either that parameter
 * is named `ianaZone` (the name `openingHours.ts` already uses, and the reading this test
 * takes) or the list loses a row. Raised in the step-3 report; a one-line change either way,
 * and the failure message below names which file is missing.
 */
const ZONE_TRANSPORT_FILES: readonly string[] = [
  'src/application/deriveInterval.ts',
  'src/domain/openingHours.ts',
  'src/persistence/referenceRepository.ts',
  'src/persistence/schema.ts',
];

/**
 * `contended-resource-cast` — containment only, and the vacuity is acknowledged rather than
 * hidden.
 *
 * §4.1 measured that the `ContendedResource` brand forecloses every shape that does not CAST
 * (`tsc` exit 2, TS2322) and that a cast defeats it (exit 0) — F-02-4. The residue is this
 * scan: a cast anywhere but the one site that mints the brand from `err.constraint` is a
 * fabricated capacity refusal.
 *
 * There is deliberately NO positive assertion here, unlike `appointment-table-access`. The
 * brand can legitimately be minted without the literal `as ContendedResource` — a function
 * whose declared return type is `ContendedResource` needs no cast at its call site — so
 * requiring the token would false-red a correct implementation. What stops this from being a
 * vacuous green is the corpus guard: `pgError.ts` must be in the scanned corpus by name
 * before this assertion runs at all.
 */
const CONTENDED_RESOURCE_CAST_FILE = 'src/persistence/pgError.ts';

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

/**
 * Every module the design names, by FILE NAME and never by count (00a's own defect).
 *
 * Slice 02 grows the corpus from twelve files to twenty-two, and it is the first slice where
 * "a marker matches in exactly one file" is a real claim rather than a nearly-empty one
 * (design §7, QS-12). The ten additions are `docs/slices/02-design.md` §2's module table.
 *
 * This list is what stops every containment assertion below from being vacuous: a scan cannot
 * certify containment of a file it never saw, and a scan whose glob missed half the tree
 * reports the same clean green as a clean tree. It is RED until the implementer creates them,
 * correctly so.
 */
const NAMED_MODULES = [
  // slice 00a and slice 01
  'src/main.ts',
  'src/http/server.ts',
  'src/http/routes/health.ts',
  'src/application/checkHealth.ts',
  'src/persistence/db.ts',
  'src/persistence/schema.ts',
  'src/platform/config.ts',
  'src/domain/duration.ts',
  'src/domain/interval.ts',
  'src/domain/openingHours.ts',
  // slice 02 — design §2
  'src/http/problem.ts',
  'src/http/routes/appointments.ts',
  'src/application/deriveInterval.ts',
  'src/application/bookAppointment.ts',
  'src/application/readAppointment.ts',
  'src/persistence/pgError.ts',
  'src/persistence/appointmentRepository.ts',
  'src/persistence/candidateRepository.ts',
  'src/persistence/referenceRepository.ts',
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

describe('AC-5 / QS-12 — each single-file marker fires on exactly one file, and it is the permitted one', () => {
  it.each(Object.entries(PERMITTED_FILE))('%s appears in exactly one file: %s', (markerName, permitted) => {
    const hits = scanForMarkers(REPO_ROOT).filter((h) => h.marker === markerName);
    const files = [...new Set(hits.map((h) => h.file))];

    // `exactly one`, not `at most one` — with src/domain empty, "the marker appears only in
    // duration.ts" is vacuously true. This is what makes the assertion fail at the red
    // commit with "found 0" rather than pass vacuously (design §7.5). For
    // `appointment-table-access` it is §4.2's mechanism 4, which the specification was
    // missing and which is the one that matters most: AC-5's claim is that the booking path
    // has nothing to read, and a scan that reports zero because it looked in the wrong place
    // makes exactly that claim on no evidence.
    expect(
      files,
      `expected exactly one file under src/ to match ${markerName}; found ${files.length}`,
    ).toEqual([permitted]);
  });
});

describe('QS-12 — zone-transport is held to a named list, by SET EQUALITY', () => {
  it('exactly the four permitted files carry the zone identifier — no more, and no fewer', () => {
    const files = [
      ...new Set(
        scanForMarkers(REPO_ROOT)
          .filter((h) => h.marker === 'zone-transport')
          .map((h) => h.file),
      ),
    ].sort();

    // SET EQUALITY, NOT CONTAINMENT, and the reason is the marker's whole purpose: an
    // over-long transport list is exactly how transport turns into reasoning without anyone
    // deciding to. A file that has quietly joined the list fails here just as a missing one
    // does, so the list can only grow by an edit somebody has to justify.
    expect(
      files,
      'zone-transport must match exactly the named list of design §0/E-02-2. A file present ' +
        'here and absent from the list is transport that nobody agreed to; a file on the list ' +
        'and absent here either does not exist yet (the red commit) or names its parameter ' +
        'something other than `ianaZone`.',
    ).toEqual([...ZONE_TRANSPORT_FILES].sort());
  });

  it('and none of them is `openingHours.ts` doing the reasoning for the others — the response measure survives the split', () => {
    // QS-12's response measure is "one source file plus one migration". The split is honest
    // only if the transport files hold a string they never INTERPRET, so this asserts the
    // other marker's containment from the transport side: no file on the transport list may
    // also do wall-clock reasoning, except the one file permitted to reason at all.
    const reasoning = new Set(
      scanForMarkers(REPO_ROOT)
        .filter((h) => h.marker === 'wall-clock-reasoning')
        .map((h) => h.file),
    );
    const offenders = ZONE_TRANSPORT_FILES.filter(
      (f) => reasoning.has(f) && f !== PERMITTED_FILE['wall-clock-reasoning'],
    );
    expect(
      offenders,
      'a transport file that also reasons about the zone would break QS-12\'s response ' +
        'measure: a change to ADR-0001\'s rule would then touch more than one source file',
    ).toEqual([]);
  });
});

describe('§4.1 / F-02-4 — the ContendedResource cast is confined to the site that mints the brand', () => {
  it('no file outside pgError.ts casts to ContendedResource', () => {
    // Containment only, and deliberately: see CONTENDED_RESOURCE_CAST_FILE above for why
    // there is no positive assertion, and why the corpus guard is what keeps this from being
    // a vacuous green.
    const offenders = [
      ...new Set(
        scanForMarkers(REPO_ROOT)
          .filter((h) => h.marker === 'contended-resource-cast')
          .map((h) => h.file),
      ),
    ].filter((f) => f !== CONTENDED_RESOURCE_CAST_FILE);

    expect(
      offenders,
      '§4.1 measured that the brand forecloses every shape that does not cast (tsc exit 2, ' +
        'TS2322) and that `as ContendedResource` defeats it (exit 0). A cast outside ' +
        `${CONTENDED_RESOURCE_CAST_FILE} is a capacity refusal fabricated without a database verdict.`,
    ).toEqual([]);
  });
});

// ──────────────────────────────────────────────── §7.4: the planted-violation control ──

interface PlantedCase {
  readonly label: string;
  readonly files: Record<string, string>;
  /** Every `<marker> <file>` the scan must report on this fixture — exactly, sorted. */
  readonly expected: readonly string[];
}

const PLANTED_CASES: readonly PlantedCase[] = [
  // §7.4 fixtures 1 and 1b — R-01-6. BOTH plant a spelling §7.2.1's pattern was NOT authored
  // against, and that is the entire point of them. The step-3 version planted
  // `minutes * 60_000` — row 1, the literal the pattern was written for — so a green here
  // proved only that the pattern matches itself. The negative control could not catch that
  // either: a reflexive pattern reports zero on a conforming tree exactly as a correct one
  // does. Restore either fixture to `minutes * 60_000` and this control stops being one.
  {
    label: 'duration arithmetic outside duration.ts — row 3, the three-term product',
    files: {
      'src/application/bookAppointment.ts':
        'export function endOf(startsAt: number, minutes: number): number {\n' +
        '  const endsAt = startsAt + minutes * 60 * 1000;\n' +
        '  return endsAt;\n' +
        '}\n',
    },
    expected: ['duration-arithmetic src/application/bookAppointment.ts'],
  },
  {
    label: 'duration arithmetic outside duration.ts — row 6, the two-step escape',
    files: {
      'src/application/slotWindow.ts':
        'export function windowMillis(minutes: number): number {\n' +
        '  const seconds = minutes * 60;\n' +
        '  const ms = seconds * 1000;\n' +
        '  return ms;\n' +
        '}\n',
    },
    expected: ['duration-arithmetic src/application/slotWindow.ts'],
  },
  {
    label: 'occupancy-interval construction outside interval.ts',
    files: {
      'src/persistence/appointmentRepository.ts':
        'export function appointmentInterval(startsAt: number, durationMillis: number) {\n' +
        '  return { startsAt, endsAt: startsAt + durationMillis };\n' +
        '}\n',
    },
    expected: ['occupancy-interval src/persistence/appointmentRepository.ts'],
  },

  // ── THE THREE E-02-2 CONTROLS. These are the exact violations design §8 measurement 12
  //    planted into a copy of src/, where the OLD `wall-clock-and-zone` marker MISSED two of
  //    three. They are the reason QS-12's marker was respecified, so they are the reason this
  //    marker has to be shown firing on all three rather than on the one it already caught.
  {
    label: 'E-02-2 control 1 — toLocaleString in a route: the AMBIENT zone, the worst bug available here',
    files: {
      'src/http/routes/appointments.ts':
        'export const render = (d: Date): string => d.toLocaleString(\'en-GB\');\n',
    },
    expected: ['wall-clock-reasoning src/http/routes/appointments.ts'],
  },
  {
    label: 'E-02-2 control 2 — getHours in a use case',
    files: {
      'src/application/bookAppointment.ts':
        'export const hourOf = (d: Date): number => d.getHours();\n',
    },
    expected: ['wall-clock-reasoning src/application/bookAppointment.ts'],
  },
  {
    label:
      'E-02-2 control 3 — Intl.DateTimeFormat in a repository that is ALSO permitted to carry the zone: transport does not license reasoning',
    files: {
      // `referenceRepository.ts` is on the `zone-transport` permitted list, so it may hold the
      // identifier — and this fixture holds it, deliberately. What it may NOT do is INTERPRET
      // it, and the two hits below are the assertion that the split is real: the transport
      // hit is permitted, the reasoning hit is a violation, and one file produces both.
      'src/persistence/referenceRepository.ts':
        'export function localHour(ianaZone: string, d: Date): string {\n' +
        "  const f = new Intl.DateTimeFormat('en-US', { timeZone: ianaZone });\n" +
        "  return f.formatToParts(d).map((p) => p.value).join('');\n" +
        '}\n',
    },
    expected: [
      'wall-clock-reasoning src/persistence/referenceRepository.ts',
      'zone-transport src/persistence/referenceRepository.ts',
    ],
  },

  // ── THE FORMS ADDED AFTER STEP 2's ROUTING (design §0/E-02-2). `getTimezoneOffset` is the
  //    one that matters: it is the cheapest hand-rolled route to a local rendering, so a list
  //    stopping before it leaves the obvious escape open — R-01-6 exactly, a marker
  //    enumerating the spellings its author thought of.
  {
    label: 'getTimezoneOffset — the hand-rolled route to a local rendering',
    files: {
      'src/application/deriveInterval.ts':
        'export const localMillis = (d: Date): number => d.getTime() - d.getTimezoneOffset() * 60 * 1000;\n',
    },
    expected: [
      // The fixture is duration arithmetic too, and saying so is the point: the scan reports
      // every marker a file trips, not the first one.
      'duration-arithmetic src/application/deriveInterval.ts',
      'wall-clock-reasoning src/application/deriveInterval.ts',
    ],
  },
  {
    label: 'getSeconds and getMilliseconds — the `get*` completions',
    files: {
      'src/application/readAppointment.ts':
        'export const stamp = (d: Date): string => `${d.getSeconds()}.${d.getMilliseconds()}`;\n',
    },
    expected: ['wall-clock-reasoning src/application/readAppointment.ts'],
  },
  {
    label: 'toDateString / toTimeString / a zero-argument toString',
    files: {
      'src/http/problem.ts':
        'export const a = (d: Date): string => d.toDateString();\n' +
        'export const b = (d: Date): string => d.toTimeString();\n' +
        'export const c = (d: Date): string => d.toString();\n',
    },
    expected: ['wall-clock-reasoning src/http/problem.ts'],
  },

  // ── AC-5: the booking path has nothing to read. Both forms of §4.2's concept.
  {
    label: 'appointment-table-access — the Kysely form, outside appointmentRepository.ts',
    files: {
      'src/application/bookAppointment.ts':
        "import type { Db } from '../persistence/db.js';\n" +
        'export async function isFree(db: Db, bayId: string): Promise<boolean> {\n' +
        "  const rows = await db.selectFrom('appointment').select('id').where('bay_id', '=', bayId).execute();\n" +
        '  return rows.length === 0;\n' +
        '}\n',
    },
    expected: ['appointment-table-access src/application/bookAppointment.ts'],
  },
  {
    label: 'appointment-table-access — the sql-template form, outside appointmentRepository.ts',
    files: {
      'src/persistence/candidateRepository.ts':
        "import { sql } from 'kysely';\n" +
        'export const freeBays = sql`select b.id from service_bay b where not exists ' +
        '(select 1 from appointment a where a.bay_id = b.id)`;\n',
    },
    expected: ['appointment-table-access src/persistence/candidateRepository.ts'],
  },
  {
    label: 'contended-resource-cast — a fabricated capacity refusal, outside pgError.ts',
    files: {
      'src/application/bookAppointment.ts':
        "export const refuse = () => ({ kind: 'no-capacity', resource: 'bay' as ContendedResource, attempts: 0 });\n",
    },
    expected: ['contended-resource-cast src/application/bookAppointment.ts'],
  },
];

describe('§7.4 — the planted-violation control: every fixture is reported, by file and marker', () => {
  it.each(PLANTED_CASES.map((c) => [c.label, c] as const))('%s', (_label, planted) => {
    const root = newFixture('planted');
    const files = plant(root, planted.files);

    const hits = scanForMarkers(root)
      .map((h) => `${h.marker} ${h.file}`)
      .sort();
    expect(hits, 'the scan must report exactly the planted violations, and nothing else').toEqual(
      [...planted.expected].sort(),
    );
    // and the corpus guard held for this fixture too, in the sense that the planted files
    // really were inside the scanned corpus:
    expect(listSourceCorpus(root).sort()).toEqual([...files].sort());
  });
});

/**
 * THE MEASUREMENT THAT CONVINCED EVERYONE, MADE EXECUTABLE.
 *
 * E-02-2 turned on one fact: the OLD marker reported very nearly the same file set whether or
 * not the tree contained zone reasoning. That is what "a scan that cannot discriminate is not
 * evidence" means, and it is a property of the marker, not of any one fixture — so it is
 * asserted here as a difference between two scans of the same tree rather than left in the
 * design as a table.
 */
describe('E-02-2 — the respecified marker DISCRIMINATES: the same tree, with and without a violation', () => {
  const BASE: Record<string, string> = {
    'src/domain/openingHours.ts':
      'export function withinOpeningHours(startsAtMillis: number, ianaZone: string) {\n' +
      "  const f = new Intl.DateTimeFormat('en-US', { timeZone: ianaZone, hourCycle: 'h23' });\n" +
      '  return f.formatToParts(new Date(startsAtMillis));\n' +
      '}\n',
    'src/http/routes/appointments.ts': 'export const route = (): string => "ok";\n',
    'src/application/bookAppointment.ts': 'export const book = (): string => "ok";\n',
  };

  const AMBIENT_FORMS: ReadonlyArray<readonly [string, string]> = [
    ['toLocaleString', "export const r = (d: Date): string => d.toLocaleString('en-GB');\n"],
    ['getHours', 'export const h = (d: Date): number => d.getHours();\n'],
    ['getTimezoneOffset', 'export const o = (d: Date): number => d.getTimezoneOffset();\n'],
    ['toString()', 'export const s = (d: Date): string => d.toString();\n'],
  ];

  it('with no violation planted, exactly one file reasons about the wall clock', () => {
    const root = newFixture('discriminate-clean');
    plant(root, BASE);
    const files = scanForMarkers(root)
      .filter((h) => h.marker === 'wall-clock-reasoning')
      .map((h) => h.file);
    expect(files).toEqual(['src/domain/openingHours.ts']);
  });

  it.each(AMBIENT_FORMS.map((f) => [f[0], f[1]] as const))(
    'planting %s into a route makes the scan report TWO files — the old marker reported one',
    (_label, source) => {
      const root = newFixture('discriminate-planted');
      plant(root, { ...BASE, 'src/http/routes/appointments.ts': source });
      const files = scanForMarkers(root)
        .filter((h) => h.marker === 'wall-clock-reasoning')
        .map((h) => h.file)
        .sort();
      expect(
        files,
        'if this reports one file, the marker cannot tell a tree with zone reasoning in a ' +
          'route from one without — which is the exact defect E-02-2 was raised on',
      ).toEqual(['src/domain/openingHours.ts', 'src/http/routes/appointments.ts']);
    },
  );
});

/**
 * THE TWO DELIBERATE EXCLUSIONS, asserted so that a boundary the architect DREW cannot be
 * mistaken for a spelling the list FORGOT — and so that a later reader widening the concept
 * has to delete an assertion rather than add one.
 */
describe('QS-12 — what wall-clock-reasoning deliberately does NOT catch', () => {
  const NEGATIVES: ReadonlyArray<readonly [string, string]> = [
    [
      'the getUTC* family — zone-FREE by construction, and the correct way to read an instant outside the domain',
      'export const parts = (d: Date): number[] => [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCDay()];\n',
    ],
    [
      'toISOString — a UTC rendering, not a wall clock',
      'export const iso = (d: Date): string => d.toISOString();\n',
    ],
    [
      'ambient-zone CONSTRUCTION — it builds an instant FROM a wall clock rather than deriving one from an instant (design §0: booked as a deliberate arc42 §11 row, not missed)',
      'export const built = (): Date => new Date(2026, 2, 28, 9, 0);\n' +
        "export const parsed = (): number => Date.parse('2026-03-28T09:00');\n",
    ],
    [
      'a .toString() WITH an argument — Date.prototype.toString takes none, so this cannot be it',
      "export const hex = (b: Buffer): string => b.toString('hex');\n" +
        'export const radix = (n: number): string => n.toString(16);\n',
    ],
    [
      'getTime and Date.now — instants, not wall clocks',
      'export const now = (): number => Date.now();\nexport const t = (d: Date): number => d.getTime();\n',
    ],
  ];

  it.each(NEGATIVES.map((n) => [n[0], n[1]] as const))('%s', (_label, source) => {
    const root = newFixture('wall-clock-negative');
    plant(root, { 'src/application/candidate.ts': source });
    const hits = scanForMarkers(root).filter((h) => h.marker === 'wall-clock-reasoning');
    expect(
      hits.map((h) => h.file),
      'this form is outside the concept as arc42 §10.2 words it — widening to reach it is a ' +
        'design change, not a test edit',
    ).toEqual([]);
  });
});

describe('§4.1 — what contended-resource-cast deliberately does NOT catch', () => {
  /**
   * THE TYPE TRAVELS; ONLY THE CAST IS CONFINED — and that distinction is the marker.
   *
   * `BookOutcome`'s `no-capacity` variant CARRIES a `ContendedResource` (design §2.6), so
   * `bookAppointment.ts`, `problem.ts` and the route all name the type legitimately. §4.1's
   * claim is narrower: the brand forecloses every shape that does not CAST, and the residue
   * is the cast. A marker matching the identifier rather than the cast would flag every file
   * the type flows through — which is a scan nobody can keep green, and the R-01-6 failure
   * mode in the other direction.
   *
   * Added at step 3 after a mutant survived: widening the pattern to `/\bContendedResource\b/`
   * changed no test result at all, which meant the narrowness was asserted nowhere.
   */
  const NEGATIVES: ReadonlyArray<readonly [string, string, string]> = [
    [
      'importing the type and naming it in a discriminated union',
      'src/application/bookAppointment.ts',
      "import type { ContendedResource } from '../persistence/pgError.js';\n" +
        'export type BookOutcome =\n' +
        "  | { readonly kind: 'confirmed' }\n" +
        "  | { readonly kind: 'no-capacity'; readonly resource: ContendedResource; readonly attempts: number };\n",
    ],
    [
      'annotating a parameter and a return type with it',
      'src/http/problem.ts',
      "import type { ContendedResource } from '../persistence/pgError.js';\n" +
        'export function resourceOf(r: ContendedResource): ContendedResource {\n' +
        '  return r;\n' +
        '}\n',
    ],
  ];

  it.each(NEGATIVES.map((n) => [n[0], n[1], n[2]] as const))('%s', (_label, file, source) => {
    const root = newFixture('cast-negative');
    plant(root, { [file]: source });
    const hits = scanForMarkers(root).filter((h) => h.marker === 'contended-resource-cast');
    expect(
      hits.map((h) => h.file),
      'the marker is the CAST, not the identifier — the branded type is meant to flow',
    ).toEqual([]);
  });
});

describe('§4.2 — what appointment-table-access deliberately does NOT catch', () => {
  const NEGATIVES: ReadonlyArray<readonly [string, string, string]> = [
    [
      'a Kysely Database interface naming the table as a TYPE — a declaration, not a query',
      'src/persistence/schema.ts',
      'export interface Database {\n' +
        '  appointment: AppointmentTable;\n' +
        '  service_bay: ServiceBayTable;\n' +
        '}\n',
    ],
    [
      'prose. Measured: /\\bappointment\\b/ over src/**/*.ts at HEAD reports two files, both of them commentary',
      'src/domain/interval.ts',
      '/**\n * The occupancy interval an appointment occupies. Reads nothing from appointment.\n' +
        ' * A future reader might select from appointment here; they must not.\n */\n' +
        'export const x = 1;\n',
    ],
    [
      'an identifier that merely contains the word',
      'src/application/readAppointment.ts',
      'export const appointmentView = (id: string): string => id;\n' +
        'export const appointmentInterval = 1;\n',
    ],
  ];

  it.each(NEGATIVES.map((n) => [n[0], n[1], n[2]] as const))('%s', (_label, file, source) => {
    const root = newFixture('table-access-negative');
    plant(root, { [file]: source });
    const hits = scanForMarkers(root).filter((h) => h.marker === 'appointment-table-access');
    expect(hits.map((h) => h.file), 'the concept is a query ISSUED AGAINST the table').toEqual([]);
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
    // ── slice 02. The conforming shape of the four markers this slice respecified or added.
    // The ONE file permitted to query the table, in both of §4.2's forms, so the positive
    // assertion (§4.2 mechanism 4) has something to be positive about here too.
    'src/persistence/appointmentRepository.ts':
      "import { sql } from 'kysely';\n" +
      "import type { Db } from './db.js';\n" +
      'export async function insertAppointment(db: Db, values: Record<string, unknown>) {\n' +
      "  return await db.insertInto('appointment').values(values).returningAll().executeTakeFirstOrThrow();\n" +
      '}\n' +
      'export const byId = sql`select * from appointment where id = $1`;\n',
    // The ONE site that mints the brand — the cast lives here and nowhere else (§4.1).
    'src/persistence/pgError.ts':
      "export type ContendedResource = ('bay' | 'technician') & { readonly __brand: 'ContendedResource' };\n" +
      'export function classify(constraint: string): ContendedResource {\n' +
      "  return (constraint === 'no_bay_overlap' ? 'bay' : 'technician') as ContendedResource;\n" +
      '}\n',
    // The three TRANSPORT files besides openingHours.ts. Each names the zone and NONE of them
    // interprets it — which is the split QS-12's response measure depends on being real.
    'src/persistence/schema.ts':
      'export interface DealershipTable {\n  id: string;\n  name: string;\n  time_zone: string;\n}\n',
    'src/persistence/referenceRepository.ts':
      "import type { Db } from './db.js';\n" +
      'export async function findDealership(db: Db, id: string) {\n' +
      "  const row = await db.selectFrom('dealership').select(['id', 'time_zone']).where('id', '=', id).executeTakeFirst();\n" +
      '  return row === undefined ? null : { id: row.id, ianaZone: row.time_zone };\n' +
      '}\n',
    'src/application/deriveInterval.ts':
      "import { withinOpeningHours } from '../domain/openingHours.js';\n" +
      'export function deriveInterval(startsAtMillis: number, ianaZone: string, weekly: unknown) {\n' +
      '  return withinOpeningHours(startsAtMillis, ianaZone, weekly);\n' +
      '}\n',
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

  it('and zone-transport reports exactly the named list — the set-equality claim, on a tree that satisfies it', () => {
    // The real-tree assertion is red until all four files exist. This is the same assertion
    // over a tree that HAS them, so a green here says the set-equality check works and the
    // red there is about the tree rather than about the check.
    const root = newFixture('conforming-transport');
    plant(root, CONFORMING);

    const files = [
      ...new Set(
        scanForMarkers(root)
          .filter((h) => h.marker === 'zone-transport')
          .map((h) => h.file),
      ),
    ].sort();
    expect(files).toEqual([...ZONE_TRANSPORT_FILES].sort());
  });

  it('and a fifth transport file FAILS set equality — containment would have let it through', () => {
    // The whole reason the claim is set equality rather than "at most these four": an
    // over-long transport list is how transport turns into reasoning without anyone deciding
    // to. Under a containment assertion this fixture passes.
    const root = newFixture('conforming-transport-extra');
    plant(root, {
      ...CONFORMING,
      'src/http/routes/appointments.ts':
        "export const zoneOf = (d: { ianaZone: string }): string => d.ianaZone;\n",
    });

    const files = [
      ...new Set(
        scanForMarkers(root)
          .filter((h) => h.marker === 'zone-transport')
          .map((h) => h.file),
      ),
    ].sort();
    expect(files).not.toEqual([...ZONE_TRANSPORT_FILES].sort());
    expect(files).toContain('src/http/routes/appointments.ts');
  });

  it('and contended-resource-cast fires only in pgError.ts', () => {
    const root = newFixture('conforming-cast');
    plant(root, CONFORMING);
    const files = [
      ...new Set(
        scanForMarkers(root)
          .filter((h) => h.marker === 'contended-resource-cast')
          .map((h) => h.file),
      ),
    ];
    expect(files, 'the mint site casts; nothing else may').toEqual([CONTENDED_RESOURCE_CAST_FILE]);
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
