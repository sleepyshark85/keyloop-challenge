import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';

/**
 * Slice 09 — the OpenAPI contract, `tests/contract/openapi-document.test.ts` (QS-11's second
 * half). `docs/slices/09-observability.md` AC-7, AC-8, AC-9, AC-5b · arc42 §8.5, §8.6 ·
 * ADR-0005 · `T-09-1`'s ruling (§4 already decides the path: `docs/api/openapi.json`, emitted
 * by `buildOpenApiDocument()`, written by `npm run docs:openapi`).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * BLACK BOX ONLY. This file never imports `src/` — `outside-in-tests-do-not-import-src`
 * covers `tests/contract/`. It reaches `buildOpenApiDocument()` the only way an outside-in
 * test may: by running the `npm run docs:openapi` script the design pins as that function's
 * caller (AC-7), and by reading the COMMITTED artifact the script writes (AC-8, AC-9, AC-5b).
 *
 * AC-7's own wording is "a drifted document fails CI", which is a claim about a CHECK MODE,
 * never about mutating the working tree from inside a test run. `docs:check`,
 * `defects:check`, `docs:budget:check` and `docs:adr-check` are this repository's own
 * established shape for that: a `--check` flag that reports drift and exits non-zero without
 * writing anything. This file assumes `npm run docs:openapi -- --check` follows that same
 * shape — an assumption rather than an observation, because neither the script nor its flag
 * exist at this commit. If the implementer wires the check under a different name or flag,
 * AC-7's case below fails with "Missing script" or a non-zero exit for that reason, which is
 * a real, diagnosable answer for a criterion whose mechanism does not exist yet, and never a
 * silent pass.
 */

const REPO_ROOT = process.cwd();
const DOCUMENT_PATH = resolve(REPO_ROOT, 'docs/api/openapi.json');

// ───────────────────────────────────────────────────────────────── reading the document ──

interface OpenApiDoc {
  readonly openapi?: string;
  readonly paths?: Record<string, Record<string, OperationObject>>;
  readonly components?: { readonly schemas?: Record<string, unknown> };
}
interface OperationObject {
  readonly operationId?: string;
  readonly description?: string;
  readonly responses?: Record<string, unknown>;
}

function readDocument(): { readonly doc?: OpenApiDoc; readonly error?: string } {
  if (!existsSync(DOCUMENT_PATH)) {
    return { error: `${DOCUMENT_PATH} does not exist — buildOpenApiDocument() has not been emitted yet (T-09-1).` };
  }
  const raw = readFileSync(DOCUMENT_PATH, 'utf8');
  try {
    return { doc: JSON.parse(raw) as OpenApiDoc };
  } catch (error) {
    return { error: `${DOCUMENT_PATH} is not valid JSON: ${String(error)}` };
  }
}

// ─────────────────────────────────────────────────── resolving $ref and scanning for /problems/* ──

function resolveRef(doc: OpenApiDoc, ref: string): unknown {
  if (!ref.startsWith('#/')) return undefined;
  const segments = ref.slice(2).split('/');
  let node: unknown = doc;
  for (const segment of segments) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

const PROBLEM_TYPE = /^\/problems\/[a-z-]+$/;

/** Every `/problems/<slug>` string literal reachable from `node`, following `$ref`. */
function collectProblemTypes(node: unknown, doc: OpenApiDoc, seen: Set<unknown> = new Set()): Set<string> {
  const found = new Set<string>();
  function walk(n: unknown): void {
    if (n === null || n === undefined) return;
    if (typeof n === 'string') {
      if (PROBLEM_TYPE.test(n)) found.add(n);
      return;
    }
    if (Array.isArray(n)) {
      for (const item of n) walk(item);
      return;
    }
    if (typeof n === 'object') {
      if (seen.has(n)) return;
      seen.add(n);
      const obj = n as Record<string, unknown>;
      if (typeof obj['$ref'] === 'string') walk(resolveRef(doc, obj['$ref']));
      for (const [key, value] of Object.entries(obj)) {
        if (key === '$ref') continue;
        walk(value);
      }
    }
  }
  walk(node);
  return found;
}

/** Every `description` string reachable from `node`, following `$ref`, concatenated. */
function collectDescriptions(node: unknown, doc: OpenApiDoc, seen: Set<unknown> = new Set()): string {
  const parts: string[] = [];
  function walk(n: unknown): void {
    if (n === null || n === undefined) return;
    if (Array.isArray(n)) {
      for (const item of n) walk(item);
      return;
    }
    if (typeof n === 'object') {
      if (seen.has(n)) return;
      seen.add(n);
      const obj = n as Record<string, unknown>;
      if (typeof obj['description'] === 'string') parts.push(obj['description']);
      if (typeof obj['$ref'] === 'string') walk(resolveRef(doc, obj['$ref']));
      for (const [key, value] of Object.entries(obj)) {
        if (key === '$ref' || key === 'description') continue;
        walk(value);
      }
    }
  }
  walk(node);
  return parts.join('\n');
}

/** arc42 §8.6's closed `type` set, transcribed independently from the table — never from src/. */
const ALL_PROBLEM_TYPES = [
  '/problems/malformed-request',
  '/problems/outside-opening-hours',
  '/problems/appointment-not-found',
  '/problems/route-not-found',
  '/problems/no-capacity',
  '/problems/appointment-not-confirmed',
  '/problems/unknown-reference',
  '/problems/vehicle-not-owned',
  '/problems/internal',
] as const;

/** The five operations of §8.6's surface table, and how this file names them below. */
const OPERATIONS: ReadonlyArray<{ readonly label: string; readonly path: string; readonly method: string }> = [
  { label: 'Book', path: '/appointments', method: 'post' },
  { label: 'Read', path: '/appointments/{id}', method: 'get' },
  { label: 'Reschedule', path: '/appointments/{id}', method: 'patch' },
  { label: 'Cancel', path: '/appointments/{id}/cancellation', method: 'post' },
  { label: 'Availability', path: '/availability', method: 'get' },
];

function operation(doc: OpenApiDoc, path: string, method: string): OperationObject | undefined {
  return doc.paths?.[path]?.[method];
}

// ───────────────────────────────────────────────────────────────────────── AC-7 ──

describe('AC-7 — the committed document matches buildOpenApiDocument(), and CI can tell when it drifts', () => {
  it('npm run docs:openapi -- --check exits 0 against the committed docs/api/openapi.json', () => {
    const run = spawnSync('npm', ['run', 'docs:openapi', '--', '--check'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });

    expect(
      run.status,
      `expected 'npm run docs:openapi -- --check' to exit 0 (the emitted document matches ` +
        `docs/api/openapi.json byte for byte).\n  status ${String(run.status)}\n  stdout\n${run.stdout}\n  stderr\n${run.stderr}`,
    ).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────── AC-8 ──

describe('AC-8 — a valid OpenAPI 3.1 description covering all five operations', () => {
  it('the committed document exists, parses as JSON, and is a valid OpenAPI 3.1 document', async () => {
    const { doc, error } = readDocument();
    expect(error, error).toBeUndefined();
    expect(doc?.openapi, `expected an OpenAPI 3.1.x document.\n${JSON.stringify(doc, null, 2).slice(0, 2000)}`).toMatch(
      /^3\.1\./,
    );

    // SwaggerParser.validate resolves $ref and validates against the OpenAPI 3.1 meta-schema
    // — a structural check no hand-rolled scan below can substitute for.
    await expect(SwaggerParser.validate(DOCUMENT_PATH)).resolves.toBeDefined();
  });

  it.each(OPERATIONS)('covers $label — $method $path', ({ path, method }) => {
    const { doc, error } = readDocument();
    expect(error, error).toBeUndefined();
    if (doc === undefined) return;
    expect(operation(doc, path, method), `no ${method.toUpperCase()} ${path} operation in the document`).toBeDefined();
  });
});

// ───────────────────────────────────────────────────────────────────────── AC-9 ──

describe('AC-9 — every §8.6 error type is described as an application/problem+json response', () => {
  it('every type in the closed set appears somewhere in the document as a problem+json response', () => {
    const { doc, error } = readDocument();
    expect(error, error).toBeUndefined();
    if (doc === undefined) return;

    const documentWide = collectProblemTypes(doc.paths ?? {}, doc);
    const missing = ALL_PROBLEM_TYPES.filter((t) => !documentWide.has(t));
    expect(missing, `types absent from the document entirely: ${JSON.stringify(missing)}`).toEqual([]);
  });

  /**
   * A CONSERVATIVE subset, scoped deliberately narrower than the full type x operation
   * matrix. Two rows of §8.6 are excluded from a per-operation claim rather than guessed at:
   *
   *   - `/problems/internal` structurally carries no response schema (§8.5: "the 500 alone
   *     carries no response schema") — there is nothing for a per-operation OpenAPI response
   *     to describe, so its presence is asserted document-wide above and not pinned here.
   *   - `/problems/route-not-found` is raised by `setNotFoundHandler`, which is a FASTIFY
   *     fallback rather than a route's own schema (§8.6) — it has no operation to be a
   *     response of, so the same document-wide check above is what AC-9 can mean for it.
   *
   * The four rows below are the ones §8.6's own prose names against a SPECIFIC operation
   * unambiguously, so they are asserted there and not merely document-wide.
   */
  it.each([
    { type: '/problems/appointment-not-found', path: '/appointments/{id}', method: 'get', why: 'the read that a move needs anyway (ADR-0025)' },
    { type: '/problems/appointment-not-confirmed', path: '/appointments/{id}', method: 'patch', why: 'moving a cancelled appointment (ADR-0003)' },
    { type: '/problems/vehicle-not-owned', path: '/appointments', method: 'post', why: 'the composite FK on booking (A-6, GC-2)' },
    { type: '/problems/no-capacity', path: '/appointments', method: 'post', why: 'every candidate refused, or the cap reached (ADR-0004/0009)' },
    { type: '/problems/no-capacity', path: '/appointments/{id}', method: 'patch', why: 'F-06-1: reschedule shares the extracted attempt loop' },
  ])('$type is a documented response of $method $path — $why', ({ type, path, method }) => {
    const { doc, error } = readDocument();
    expect(error, error).toBeUndefined();
    if (doc === undefined) return;

    const op = operation(doc, path, method);
    expect(op, `no ${method.toUpperCase()} ${path} operation in the document`).toBeDefined();
    if (op === undefined) return;

    const found = collectProblemTypes(op.responses ?? {}, doc);
    expect(
      found.has(type),
      `${type} not found among ${method.toUpperCase()} ${path}'s responses; found ${JSON.stringify([...found])}`,
    ).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────── AC-5b ──

describe('AC-5b — GET /availability documents AC-5a\'s two facts: not a reservation, and only of the interval queried', () => {
  it('the operation\'s description text carries both facts', () => {
    const { doc, error } = readDocument();
    expect(error, error).toBeUndefined();
    if (doc === undefined) return;

    const op = operation(doc, '/availability', 'get');
    expect(op, 'no GET /availability operation in the document').toBeDefined();
    if (op === undefined) return;

    // Collected from anywhere under the operation — its own `description`, or its response
    // schema's — because design §"AC-7 does not kill the seven description mutants" decision
    // 4 places the rescued prose at the OPERATION level (Fastify's `schema.description`,
    // OpenAPI's `operation.description`) rather than pinning a single JSON pointer this test
    // would have to guess exactly.
    const text = collectDescriptions(op, doc).toLowerCase();

    expect(
      /not a reservation/.test(text),
      `expected the availability operation's description to say a free result is NOT A RESERVATION.\n${text}`,
    ).toBe(true);
    expect(
      /interval queried|only.*interval|interval.*only/.test(text),
      `expected the availability operation's description to say the answer is true ONLY OF ` +
        `THE INTERVAL QUERIED.\n${text}`,
    ).toBe(true);
  });
});
