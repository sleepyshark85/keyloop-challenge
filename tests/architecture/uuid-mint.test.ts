import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * AC-3b — `docs/slices/10-openapi-and-curl-harness.md` "AC-3, and a second half for A-06-2",
 * `docs/slices/10-design.md` §"AC-3, and a second half for A-06-2". ADR-0025's permanent
 * `absent` answer for a freshly-booked appointment's id rests on "an id is unreachable before
 * it exists" — `tests/contract/openapi-document.test.ts`'s AC-3 discharges the CONTRACT half
 * (no client-facing field can carry one in); this file discharges the MINTING half: the ONLY
 * place in `src/**` that mints a fresh appointment id is `deps.newId()`, wired to
 * `crypto.randomUUID()` exactly once, in `src/main.ts`.
 *
 * `A-06-2` HAS BEEN DECLARED DISCHARGED TWICE ALREADY ON ASSERTIONS THAT DID NOT MAKE IT
 * (slice 06, re-deferred; slice 09 step 7, re-deferred again). This is the third attempt, and
 * it is built to the standard `conflict-counter-increment` needed at slice 09
 * (`tests/architecture/ambiguity-containment.test.ts`) after ITS OWN first version was found
 * blind at review: a marker built on a TEXT SPELLING (the bare word `randomUUID` anywhere) is
 * defeated by a comment explaining why a file must NOT mint one, or a variable that merely
 * SHARES the name. This marker instead tracks the mint call's OWN IMPORTED IDENTITY — each
 * file's own local binding for whatever it imports as `randomUUID` from `node:crypto` (a
 * named import, following an `as` alias; or a default/namespace import, followed by
 * `.randomUUID(`) — and only THEN looks for a call made through that binding. A different
 * function merely named `randomUUID` and imported from somewhere else is not this marker, by
 * construction (see the negative controls below).
 *
 * IT IS A DENYLIST, NOT A PROOF OF MINTING (design "What cannot fail — say it now, or repeat
 * the defect": "AC-3b is a denylist"). It catches the REALISTIC reintroduction — a second call
 * site added under refactor, or a helper reached for out of convenience — not an adversary
 * deliberately renaming the import to defeat the pattern. The residual is stated rather than
 * promised away, exactly as `contended-resource-cast`'s residual is at slice 02.
 */

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

// ─────────────────────────────────────────────────────────────────── fixture machinery ──
// (Mirrors tests/architecture/ambiguity-containment.test.ts's own conventions.)

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
  const root = mkdtempSync(join(tmpdir(), `keyloop-uuid-mint-${label}-`));
  fixtures.push(root);
  return root;
}

function plant(root: string, sources: Record<string, string>): string[] {
  for (const [path, contents] of Object.entries(sources)) write(root, path, contents);
  return Object.keys(sources);
}

/** Root resolved from `import.meta.url`, NEVER `process.cwd()` (00a's own lesson). */
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

/** Corpus: `src/**\/*.ts`. */
function listSourceCorpus(rootDir: string): string[] {
  return listFilesUnder(join(rootDir, 'src'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => toPosixRelative(rootDir, f));
}

function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// ─────────────────────────────────────────────────────────── the mint marker itself ──

/**
 * Every call FORM this marker recognises as "minting via `randomUUID`", anchored on an
 * IDENTITY rather than a bare spelling:
 *
 *   1. THE AMBIENT GLOBAL — measured (see below) as `src/main.ts`'s ACTUAL shape today:
 *      `crypto.randomUUID()` with NO import at all. Node (and every browser) exposes
 *      `globalThis.crypto` unimported, so there is no binding to alias here — `crypto` IS the
 *      identity, always, and `crypto.randomUUID(` is included as a baseline form
 *      unconditionally. A local variable named `crypto` that SHADOWS the global and is not
 *      itself the WebCrypto object would defeat this — an adversarial rename, not a realistic
 *      reintroduction, and the same class of residual `contended-resource-cast` already
 *      accepts (§4.1).
 *   2. AN EXPLICIT IMPORT — a future refactor might import `randomUUID` from `node:crypto`
 *      explicitly instead of reaching for the global. If it does, the binding it introduces is
 *      what is tracked: a NAMED import (`<binding>(`, following an `as` alias), or a
 *      default/namespace import (`<binding>.randomUUID(`) — this is the part that mirrors
 *      `conflict-counter-increment`'s anchor-on-the-imported-binding fix most directly.
 *
 * Returns the ambient form ALWAYS, plus whatever explicit-import forms this file's own import
 * statements introduce (usually none, since form 1 needs none).
 */
function randomUuidCallForms(strippedContent: string): string[] {
  const forms: string[] = ['crypto.randomUUID('];

  // Named import, optionally aliased: `import { randomUUID } from 'node:crypto'` or
  // `import { randomUUID as mintId } from 'node:crypto'`. Bare `'crypto'` accepted too — Node
  // permits both specifiers for its own builtins.
  const namedImportPattern = /import\s*\{([^}]*)\}\s*from\s*['"](?:node:)?crypto['"]/g;
  let match: RegExpExecArray | null;
  while ((match = namedImportPattern.exec(strippedContent)) !== null) {
    for (const raw of (match[1] ?? '').split(',')) {
      const specifier = raw.trim();
      if (specifier === '') continue;
      const aliased = /^randomUUID\s+as\s+([A-Za-z_$][\w$]*)$/.exec(specifier);
      if (aliased?.[1] !== undefined) forms.push(`${aliased[1]}(`);
      else if (specifier === 'randomUUID') forms.push('randomUUID(');
    }
  }

  // Default or namespace import: `import someName from 'node:crypto'` /
  // `import * as someName from 'node:crypto'`, called as `<binding>.randomUUID(`. Excludes the
  // bare identifier `crypto` — already the unconditional baseline above, and re-adding it here
  // under an EXPLICIT import would just duplicate form 1.
  const namespaceImportPattern = /import\s+(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s*from\s*['"](?:node:)?crypto['"]/g;
  while ((match = namespaceImportPattern.exec(strippedContent)) !== null) {
    const binding = match[1];
    if (binding !== undefined && binding !== 'crypto') forms.push(`${binding}.randomUUID(`);
  }

  return forms;
}

function mintsUuid(content: string): boolean {
  const stripped = stripComments(content);
  const forms = randomUuidCallForms(stripped);
  return forms.some((form) => stripped.includes(form));
}

function scanCorpus(rootDir: string): string[] {
  return listSourceCorpus(rootDir).filter((relFile) => mintsUuid(readFileSync(join(rootDir, relFile), 'utf8')));
}

const PERMITTED_FILE = 'src/main.ts';

// ───────────────────────────────────────────────────── corpus guard (real tree), before any claim ──

describe('corpus guard — what the scan examined, asserted before any violation (§7.3\'s own precedent)', () => {
  it('the real src/ tree is non-empty and was scanned', () => {
    const corpus = listSourceCorpus(REPO_ROOT);
    expect(corpus.length, 'src/**/*.ts produced no files — the scan below would be vacuous').toBeGreaterThan(0);
  });

  it(`${PERMITTED_FILE} is present in the scanned corpus, by name`, () => {
    const corpus = new Set(listSourceCorpus(REPO_ROOT));
    expect(corpus.has(PERMITTED_FILE), `${PERMITTED_FILE} absent from the scanned corpus — this scan cannot certify containment of a file it never saw`).toBe(true);
  });
});

// ──────────────────────────────────────────────────────── AC-3b: exactly one file, real tree ──

describe('AC-3b — the appointment id is minted in exactly one place, by SET EQUALITY', () => {
  it(`only ${PERMITTED_FILE} mints a fresh id via randomUUID() — no more, no fewer`, () => {
    const files = scanCorpus(REPO_ROOT).sort();
    expect(
      files,
      `expected exactly one file to mint via randomUUID(): ${PERMITTED_FILE}. Found ${JSON.stringify(files)}. ` +
        `A second call site (a realistic reintroduction under refactor) fails this just as a ` +
        `renamed or missing one does — ADR-0025's permanent 'absent' answer for a fresh id rests ` +
        `on there being exactly one place an id could ever come from before an appointment exists.`,
    ).toEqual([PERMITTED_FILE]);
  });
});

// ───────────────────────────────────────────────────────────── planted-violation control ──

describe('planted-violation control: a second mint site is reported, by file', () => {
  it('a named import, called directly, outside main.ts', () => {
    const root = newFixture('planted-named');
    plant(root, {
      'src/application/bookAppointment.ts':
        "import { randomUUID } from 'node:crypto';\n" +
        'export function mintExtra(): string {\n' +
        '  return randomUUID();\n' +
        '}\n',
    });
    const files = scanCorpus(root);
    expect(files, 'a named-import call site outside main.ts must be reported').toEqual([
      'src/application/bookAppointment.ts',
    ]);
  });

  it('an aliased named import, called through its alias', () => {
    const root = newFixture('planted-aliased');
    plant(root, {
      'src/persistence/appointmentRepository.ts':
        "import { randomUUID as mintId } from 'node:crypto';\n" +
        'export function newRow(): string {\n' +
        '  return mintId();\n' +
        '}\n',
    });
    const files = scanCorpus(root);
    expect(files, 'an aliased named import, called through its OWN alias, must be reported').toEqual([
      'src/persistence/appointmentRepository.ts',
    ]);
  });

  it('a default/namespace import, called as crypto.randomUUID()', () => {
    const root = newFixture('planted-namespace');
    plant(root, {
      'src/http/routes/appointments.ts':
        "import crypto from 'node:crypto';\n" +
        'export function mintFromRoute(): string {\n' +
        '  return crypto.randomUUID();\n' +
        '}\n',
    });
    const files = scanCorpus(root);
    expect(files, 'a default-import call site outside main.ts must be reported').toEqual([
      'src/http/routes/appointments.ts',
    ]);
  });

  it(`a genuine ${PERMITTED_FILE} plus a second offender: both are reported`, () => {
    const root = newFixture('planted-both');
    plant(root, {
      [PERMITTED_FILE]:
        "import crypto from 'node:crypto';\n" +
        'export function bootstrap(): string {\n' +
        '  return crypto.randomUUID();\n' +
        '}\n',
      'src/application/rescheduleAppointment.ts':
        "import { randomUUID } from 'node:crypto';\n" +
        'export function mintOnReschedule(): string {\n' +
        '  return randomUUID();\n' +
        '}\n',
    });
    const files = scanCorpus(root).sort();
    expect(files, 'set equality must fail with BOTH files named, not just the extra one').toEqual(
      [PERMITTED_FILE, 'src/application/rescheduleAppointment.ts'].sort(),
    );
  });
});

// ──────────────────────────────────────────────────────────────── negative controls ──

describe('what the marker deliberately does NOT catch', () => {
  const NEGATIVES: ReadonlyArray<readonly [string, string, string]> = [
    [
      'a comment explaining why a file must NOT mint one — text-spelling markers are defeated by exactly this',
      'src/application/readAppointment.ts',
      '// This module must never call randomUUID() — appointment ids are minted in src/main.ts only.\n' +
        'export const ok = 1;\n',
    ],
    [
      'a variable merely SHARING the name, imported from nowhere',
      'src/domain/interval.ts',
      'export function withRandomUUID(randomUUID: string): string {\n' +
        '  return randomUUID;\n' +
        '}\n',
    ],
    [
      'randomUUID imported from an UNRELATED module, not node:crypto',
      'src/persistence/candidateRepository.ts',
      "import { randomUUID } from './idGenerator.js';\n" +
        'export function notTheMintSite(): string {\n' +
        '  return randomUUID();\n' +
        '}\n',
    ],
    [
      "node:crypto imported for something ELSE entirely — the identifier 'randomUUID' never appears",
      'src/http/problem.ts',
      "import { createHash } from 'node:crypto';\n" +
        'export function hashOf(s: string): string {\n' +
        "  return createHash('sha256').update(s).digest('hex');\n" +
        '}\n',
    ],
  ];

  it.each(NEGATIVES.map((n) => [n[0], n[1], n[2]] as const))('%s', (_label, file, source) => {
    const root = newFixture('negative');
    plant(root, { [file]: source });
    const files = scanCorpus(root);
    expect(files, 'the marker is the MINT CALL through its own imported binding, not a text spelling').toEqual([]);
  });
});

// ─────────────────────────────────────── conforming negative control: today's real shape ──

describe('conforming negative control: a tree shaped like the real one reports exactly the permitted file', () => {
  it(`${PERMITTED_FILE} minting via crypto.randomUUID(), and nothing else, reports exactly that one file`, () => {
    const root = newFixture('conforming');
    plant(root, {
      [PERMITTED_FILE]:
        "import crypto from 'node:crypto';\n" +
        "import { startServer } from './http/server.js';\n" +
        'export function newId(): string {\n' +
        '  return crypto.randomUUID();\n' +
        '}\n' +
        'void startServer;\n',
      'src/application/bookAppointment.ts':
        "export function book(id: string): string {\n" +
        '  return id;\n' +
        '}\n',
    });
    const files = scanCorpus(root);
    expect(files).toEqual([PERMITTED_FILE]);
  });
});
