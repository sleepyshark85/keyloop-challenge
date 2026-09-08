import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import buildStringify from 'fast-json-stringify';

/**
 * Slice 10 — `docs/slices/10-openapi-and-curl-harness.md`, `docs/slices/10-design.md`. AC-1,
 * AC-3, AC-3 (README half excepted — gate-verified, not mechanical, see design's "What cannot
 * fail"), AC-7 (this slice's own, not slice 09's) · arc42 §8.5, §8.6 · ADR-0005, ADR-0025.
 * Slice 09's AC-7 (docs:openapi --check), AC-8 (valid OpenAPI 3.1) and AC-5b (availability's
 * "not a reservation" / "interval queried" pair) are STANDING GUARDS this slice must keep
 * green — kept below unweakened.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * BLACK BOX ONLY, as before. This file never imports `src/`.
 *
 * THREE OF THIS SLICE'S CRITERIA WERE ASSERTED BY TESTS THAT COULD NOT FAIL (step 1). This
 * file exists to fix that:
 *
 *   AC-1  the old "AC-9" describe block asserted TYPE PRESENCE by string-scanning for
 *         `/problems/*`, never the MEDIA TYPE it arrived under. `equalityPairs()` below walks
 *         each response's `content` MEDIA-TYPE KEYS directly (step-2 commitment 1) so a `422`
 *         declared as `application/json` — today's actual defect, `problem.ts:76` has sent
 *         `application/problem+json` since slice 03 — is a mismatch, not a pass. The 2xx
 *         direction is asserted the same way: a `201` arriving as `problem+json` is §8.6's
 *         own "worse failure".
 *   AC-3  no operation's `requestBody` or `parameters` can carry a caller-supplied appointment
 *         id — the CONTRACT half of `A-06-2` (the MINTING half is `tests/architecture/
 *         uuid-mint.test.ts`, owned separately per the design's ownership table).
 *   I-10-1 / M2  a one-member `Type.Union` collapsing to `Type.Literal` reproduces §8.5's
 *         substitution defect inside AC-1's own narrowing (eight cells, DERIVED from
 *         `EXPECTED_PAIRS` below — never hand-listed, `R-10-4`). Step 5 (`R-10-2`) ruled the
 *         property apart by LEVEL, because it was never said at which level it must be shown:
 *         the BEHAVIOURAL property — reject a wrong closed-set value, never silently substitute
 *         the schema's own constant back — is the real guard and is asserted at the RUNTIME
 *         SCHEMA, `tests/unit/http/problem.test.ts`, which already fails on the collapse. At
 *         DOCUMENT level `@fastify/swagger` rewrites `const` to `enum` and
 *         `fast-json-stringify` passes an `enum` value through UNVALIDATED — neither throwing
 *         nor substituting — so the emitter erases the behavioural distinction before a
 *         document-level probe can observe it; measured directly (`node -e`, `fast-json-
 *         stringify` 5.x): `{const: x}` substitutes `x` back for any input, `{type:'string',
 *         enum:[x]}` echoes the wrong input through unrejected, and `{anyOf:[{type:'string',
 *         enum:[x]}]}` throws on a mismatch. The only faithful assertion at THIS level is
 *         therefore the artifact's SHAPE — each single-type cell's `type` property is a
 *         one-member `anyOf`, never a bare `enum` or `const` — which is a mechanism assertion
 *         step 1 declined by name; it is reversed here for the document level only, because at
 *         that level the mechanism is the sole observable. The serialiser probe stays beside it
 *         as a second signal (it throws on the shape this document actually emits today), but
 *         the shape check is what can fail on the collapse — falsified by switching the
 *         single-member branch back to a bare `Type.Union`/`Type.Literal` and re-emitting.
 *   AC-7 (slice 10)  `R-09-13`: the querystring description constant was doing two jobs and is
 *         split — three concatenated contract-prose facts (what the operation answers, the
 *         rule, the consequence) replace it, and TypeBox's rationale moves to the file's own
 *         docblock, which publishes nothing. `D-08-1`'s three surviving mutants (one per
 *         emptied literal) are what the three `it()` cases below are bound to — the architect's
 *         corrected boundary (`to` strictly later than `from`, not "at or after") is the rule
 *         asserted, per the mid-slice ruling in `10-design.md` §3.
 *
 * OQ-10-1, ANSWERED (step 2, measured): `SwaggerParser.validate` 13.0.0 accepts an
 * unreferenced `components.responses` entry, so `route-not-found` — raised by
 * `setNotFoundHandler`, answering no operation — can live there. The document-wide
 * type-presence check below is widened past `doc.paths` to `doc.paths` ∪ `doc.components`
 * accordingly; a check that only walked `paths` would false-red a correct implementation that
 * takes that home for the row.
 */

const REPO_ROOT = process.cwd();
const DOCUMENT_PATH = resolve(REPO_ROOT, 'docs/api/openapi.json');

// ───────────────────────────────────────────────────────────────── reading the document ──

interface ResponseObject {
  readonly content?: Record<string, { readonly schema?: unknown }>;
}
interface ParameterObject {
  readonly name?: string;
  readonly in?: string;
}
interface RequestBodyObject {
  readonly content?: Record<string, { readonly schema?: { readonly properties?: Record<string, unknown> } }>;
}
interface OpenApiDoc {
  readonly openapi?: string;
  readonly paths?: Record<string, Record<string, OperationObject>>;
  readonly components?: { readonly schemas?: Record<string, unknown>; readonly responses?: Record<string, unknown> };
}
interface OperationObject {
  readonly operationId?: string;
  readonly description?: string;
  readonly responses?: Record<string, ResponseObject>;
  readonly parameters?: readonly ParameterObject[];
  readonly requestBody?: RequestBodyObject;
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

/**
 * `node`, with every `$ref` resolved and inlined — cycle-safe via `seen`. Needed only for the
 * I-10-1/M2 probe below: `fast-json-stringify` does not understand this document's `#/...`
 * pointer format, so the schema handed to it must be fully dereferenced first.
 */
function dereference(node: unknown, doc: OpenApiDoc, seen: Map<unknown, unknown> = new Map()): unknown {
  if (node === null || typeof node !== 'object') return node;
  const cached = seen.get(node);
  if (cached !== undefined) return cached;
  if (Array.isArray(node)) {
    const out: unknown[] = [];
    seen.set(node, out);
    for (const item of node) out.push(dereference(item, doc, seen));
    return out;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj['$ref'] === 'string') {
    const resolved = resolveRef(doc, obj['$ref']);
    return dereference(resolved, doc, seen);
  }
  const out: Record<string, unknown> = {};
  seen.set(node, out);
  for (const [key, value] of Object.entries(obj)) out[key] = dereference(value, doc, seen);
  return out;
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

// ───────────────────────────────────────────────────────────────────────── AC-7 (slice 09) ──

describe('AC-7 (slice 09) — the committed document matches buildOpenApiDocument(), and CI can tell when it drifts', () => {
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

// ───────────────────────────────────────────────────────────────────────── AC-8 (slice 09) ──

describe('AC-8 (slice 09) — a valid OpenAPI 3.1 description covering all five operations', () => {
  it('the committed document exists, parses as JSON, and is a valid OpenAPI 3.1 document', async () => {
    const { doc, error } = readDocument();
    expect(error, error).toBeUndefined();
    expect(doc?.openapi, `expected an OpenAPI 3.1.x document.\n${JSON.stringify(doc, null, 2).slice(0, 2000)}`).toMatch(
      /^3\.1\./,
    );

    // SwaggerParser.validate resolves $ref and validates against the OpenAPI 3.1 meta-schema
    // — a structural check no hand-rolled scan below can substitute for. OQ-10-1 measured
    // (step 2) that it accepts an unreferenced components.responses entry, so route-not-found
    // living there is not itself a validity problem.
    await expect(SwaggerParser.validate(DOCUMENT_PATH)).resolves.toBeDefined();
  });

  it.each(OPERATIONS)('covers $label — $method $path', ({ path, method }) => {
    const { doc, error } = readDocument();
    expect(error, error).toBeUndefined();
    if (doc === undefined) return;
    expect(operation(doc, path, method), `no ${method.toUpperCase()} ${path} operation in the document`).toBeDefined();
  });
});

// ───────────────────────────────────────────────────────────────────────── AC-1 ──

describe('AC-1 — every §8.6 error type is document-wide, over paths AND components (OQ-10-1)', () => {
  it('every type in the closed set appears somewhere in the document as a problem+json response', () => {
    const { doc, error } = readDocument();
    expect(error, error).toBeUndefined();
    if (doc === undefined) return;

    // Widened past `doc.paths` alone (slice 09's shape): `route-not-found` has no operation
    // (`setNotFoundHandler`) and OQ-10-1 measured that an unreferenced `components.responses`
    // entry is a legal home for it under OpenAPI 3.1. A check that only walked `paths` would
    // false-red a correct implementation that takes that home for the row.
    const documentWide = collectProblemTypes({ paths: doc.paths, components: doc.components }, doc);
    const missing = ALL_PROBLEM_TYPES.filter((t) => !documentWide.has(t));
    expect(missing, `types absent from paths ∪ components entirely: ${JSON.stringify(missing)}`).toEqual([]);
  });
});

/**
 * §8.6's matrix, transposed to one row per operation — `10-design.md` §1's table, verbatim.
 * `/problems/internal` (500) is EXCLUDED from every row on purpose: §8.5 measured it carries
 * no response schema, so there is no `type` literal for a content-media-type walk to find, and
 * it is asserted document-wide above instead (as slice 09's AC-9 already did). Likewise
 * `/problems/route-not-found` never appears here — it answers no operation.
 *
 * The 2xx entry is `application/json` with no `type` — §8.6's stated "worse failure" is a
 * SUCCESS response arriving as `problem+json`, so the media type itself is the assertion.
 *
 * `GET /health` (`R-10-3`) is included too, by NAME, with an asserted-EMPTY `/problems/*` set —
 * it is §3.1's operator boundary, outside §8.6's error surface, and its `503` is a health
 * document rather than a problem response. The key set below is asserted EQUAL to every
 * `(method, path)` the document declares (the `it` immediately below the `it.each`'s
 * describe), so a future operation nobody adds a row for here fails loudly rather than passing
 * unseen — equality over a subset the test chose is not equality (`R-10-3`).
 */
const EXPECTED_PAIRS: Record<string, readonly string[]> = {
  'GET /health': ['200 application/json', '503 application/json'],
  'POST /appointments': [
    '201 application/json',
    '400 /problems/malformed-request',
    '400 /problems/outside-opening-hours',
    '409 /problems/no-capacity',
    '422 /problems/unknown-reference',
    '422 /problems/vehicle-not-owned',
  ],
  'GET /appointments/{id}': [
    '200 application/json',
    '400 /problems/malformed-request',
    '404 /problems/appointment-not-found',
  ],
  'PATCH /appointments/{id}': [
    '200 application/json',
    '400 /problems/malformed-request',
    '400 /problems/outside-opening-hours',
    '404 /problems/appointment-not-found',
    '409 /problems/no-capacity',
    '409 /problems/appointment-not-confirmed',
  ],
  'POST /appointments/{id}/cancellation': [
    '200 application/json',
    '400 /problems/malformed-request',
    '404 /problems/appointment-not-found',
  ],
  'GET /availability': [
    '200 application/json',
    '400 /problems/malformed-request',
    '422 /problems/unknown-reference',
  ],
};

/**
 * The operation's actual `(status, type)` pairs, walking each response's `content`
 * MEDIA-TYPE KEYS directly — step-2 commitment 1, and the fix for the old AC-9's own defect
 * (string-scanning for `/problems/*` regardless of which media type it was declared under,
 * so `application/json` carrying the right literal passed just as well as
 * `application/problem+json` would have).
 *
 * `500` is skipped: §8.5 measured it carries no response schema, so it has no `type` to pair
 * and is covered by the document-wide check above instead, exactly as slice 09's AC-9 scoped
 * it.
 */
function actualPairs(op: OperationObject, doc: OpenApiDoc): string[] {
  const pairs = new Set<string>();
  for (const [status, response] of Object.entries(op.responses ?? {})) {
    if (status === '500') continue;
    const content = response?.content ?? {};
    const mediaTypes = Object.keys(content);
    if (mediaTypes.length === 0) {
      pairs.add(`${status} (no content declared)`);
      continue;
    }
    for (const mediaType of mediaTypes) {
      if (mediaType === 'application/problem+json') {
        const types = collectProblemTypes(content[mediaType]?.schema, doc);
        if (types.size === 0) pairs.add(`${status} application/problem+json (no type literal found)`);
        for (const type of types) pairs.add(`${status} ${type}`);
      } else {
        // Deliberately not filtered to "application/json" — an unexpected THIRD media type
        // shows up in the actual set just as wrong as the defect this replaces, and equality
        // catches it exactly the same way.
        pairs.add(`${status} ${mediaType}`);
      }
    }
  }
  return [...pairs].sort();
}

/** Every `(method, path)` the document declares, `METHOD /path` — the same shape as `EXPECTED_PAIRS`' own keys. */
function allOperationKeys(doc: OpenApiDoc): string[] {
  const keys: string[] = [];
  for (const [path, methods] of Object.entries(doc.paths ?? {})) {
    for (const method of Object.keys(methods ?? {})) {
      keys.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return keys.sort();
}

describe('AC-1 — each operation\'s (status, type) pairs, asserted BY EQUALITY, both directions, including 2xx', () => {
  it("EXPECTED_PAIRS' key set equals every (method, path) operation the document declares (R-10-3)", () => {
    const { doc, error } = readDocument();
    expect(error, error).toBeUndefined();
    if (doc === undefined) return;

    const documented = allOperationKeys(doc);
    const asserted = Object.keys(EXPECTED_PAIRS).sort();
    expect(
      asserted,
      `EXPECTED_PAIRS must cover every (method, path) the document declares, not a subset the ` +
        `test chose — a future operation added and never given a row here must fail rather than ` +
        `pass unseen.\ndocumented: ${JSON.stringify(documented)}\nasserted:   ${JSON.stringify(asserted)}`,
    ).toEqual(documented);
  });

  it.each(Object.entries(EXPECTED_PAIRS))('%s', (opKey, expected) => {
    const { doc, error } = readDocument();
    expect(error, error).toBeUndefined();
    if (doc === undefined) return;

    const spaceIndex = opKey.indexOf(' ');
    const method = opKey.slice(0, spaceIndex).toLowerCase();
    const path = opKey.slice(spaceIndex + 1);
    const op = operation(doc, path, method);
    expect(op, `no ${opKey} operation in the document`).toBeDefined();
    if (op === undefined) return;

    const actual = actualPairs(op, doc);
    expect(
      actual,
      `${opKey}'s (status,type) pairs must equal §8.6's matrix exactly — an extra pair (a type ` +
        `the operation cannot produce) fails just as a missing one does, and a pair whose media ` +
        `type is application/json where problem+json was expected (or vice versa) fails too.\n` +
        `expected: ${JSON.stringify([...expected].sort())}\nactual:   ${JSON.stringify(actual)}`,
    ).toEqual([...expected].sort());
  });
});

// ─────────────────────────────────────────────── I-10-1 / M2: reject, not substitute ──

interface SingleTypeCell {
  readonly label: string;
  readonly path: string;
  readonly method: string;
  readonly status: string;
  readonly correctType: string;
  readonly wrongType: string;
}

/**
 * `R-10-4`: DERIVED from `EXPECTED_PAIRS` — one transcription of §8.6, not two. A "single-type
 * cell" is a `(operation, status)` with exactly one `/problems/*` entry; the hand-written list
 * this replaced had seven and its own header said seven, while the document actually carries
 * eight (`PATCH /appointments/{id}` `404` was the absent row — confirmed against the emitted
 * document, not assumed). `wrongType` is drawn from the SAME operation's OTHER cells where one
 * exists (a realistic leak within the same taxonomy — e.g. Read 400 probed with Read 404's own
 * type), falling back to the closed set at large only for a cell whose operation has none.
 * Never a value outside the closed set: the property is about a sibling cell's value leaking
 * in, not an arbitrary string.
 */
function deriveSingleTypeCells(pairs: Record<string, readonly string[]>): SingleTypeCell[] {
  const cells: SingleTypeCell[] = [];
  for (const [opKey, opPairs] of Object.entries(pairs)) {
    const spaceIndex = opKey.indexOf(' ');
    const method = opKey.slice(0, spaceIndex).toLowerCase();
    const path = opKey.slice(spaceIndex + 1);
    const label = OPERATIONS.find((o) => o.path === path && o.method === method)?.label ?? opKey;

    const byStatus = new Map<string, string[]>();
    for (const pair of opPairs) {
      const match = /^(\d\d\d) (\/problems\/[a-z-]+)$/.exec(pair);
      if (match === null) continue; // 2xx / application/json entries are not problem cells
      const status = match[1] as string;
      const type = match[2] as string;
      const list = byStatus.get(status) ?? [];
      list.push(type);
      byStatus.set(status, list);
    }

    for (const [status, types] of byStatus) {
      if (types.length !== 1) continue; // not a single-type cell
      const correctType = types[0] as string;
      const siblings = [...byStatus.entries()]
        .filter(([otherStatus]) => otherStatus !== status)
        .flatMap(([, otherTypes]) => otherTypes);
      const wrongType = siblings.find((t) => t !== correctType) ?? ALL_PROBLEM_TYPES.find((t) => t !== correctType);
      if (wrongType === undefined) continue;
      cells.push({ label: `${label} ${status}`, path, method, status, correctType, wrongType });
    }
  }
  return cells;
}

const SINGLE_TYPE_CELLS: ReadonlyArray<SingleTypeCell> = deriveSingleTypeCells(EXPECTED_PAIRS);

function extractTypeSchema(doc: OpenApiDoc, path: string, method: string, status: string): unknown {
  const op = operation(doc, path, method);
  const content = op?.responses?.[status]?.content?.['application/problem+json'];
  const schema = content?.schema;
  if (schema === undefined) return undefined;
  const deref = dereference(schema, doc) as { readonly properties?: Record<string, unknown> } | undefined;
  return deref?.properties?.['type'];
}

describe("I-10-1 / M2 — each single-type cell's schema REJECTS a wrong closed-set value, it does not silently substitute the right one", () => {
  it.each(SINGLE_TYPE_CELLS)('$label — $method $path at $status', ({ path, method, status, correctType, wrongType }) => {
    const { doc, error } = readDocument();
    expect(error, error).toBeUndefined();
    if (doc === undefined) return;

    const typeSchema = extractTypeSchema(doc, path, method, status);
    expect(
      typeSchema,
      `no application/problem+json response with a 'type' property schema at ` +
        `${method.toUpperCase()} ${path} ${status}`,
    ).toBeDefined();
    if (typeSchema === undefined) return;

    let stringify: ((value: unknown) => string) | undefined;
    try {
      stringify = buildStringify(typeSchema as never);
    } catch (buildError) {
      throw new Error(
        `fast-json-stringify could not compile the 'type' schema at ${method.toUpperCase()} ${path} ` +
          `${status}: ${String(buildError)}\nschema: ${JSON.stringify(typeSchema)}`,
      );
    }

    // Sanity: the schema's own correct value round-trips, so a throw below is not just this
    // schema being broken outright.
    const correctOutput = JSON.parse(stringify(correctType)) as unknown;
    expect(correctOutput, `the schema's own correct value ${correctType} must round-trip`).toBe(correctType);

    // THE PROPERTY (not the mechanism): fed a WRONG-but-closed-set value, the schema must not
    // let the client receive the correct literal dressed up as if the wrong value had been
    // validated. Reject it (the serialiser throws) — never SILENTLY SUBSTITUTE the schema's
    // own constant back, which is §8.5's defect reproduced inside this narrowing (I-10-1/M2).
    let threw = false;
    let wrongOutput: unknown;
    try {
      wrongOutput = JSON.parse(stringify(wrongType));
    } catch {
      threw = true;
    }

    if (!threw) {
      expect(
        wrongOutput,
        `${method.toUpperCase()} ${path} ${status}'s 'type' schema SILENTLY SUBSTITUTED ` +
          `${correctType} for the wrong value ${wrongType} instead of rejecting it. This is the ` +
          `one-member Type.Union-collapses-to-Type.Literal defect I-10-1/M2 measured, reproduced ` +
          `inside AC-1's own per-cell narrowing.`,
      ).not.toBe(correctType);
    }
  });
});

/**
 * `R-10-2`, document level: a bare `{type: 'string', enum: [x]}` or `{const: x}` is exactly
 * what `@fastify/swagger` emits when a one-member `Type.Union` collapses to `Type.Literal`, and
 * `fast-json-stringify` passes either through without validating the input — the behavioural
 * probe above cannot observe that at this level (it is fed the schema this document ALREADY
 * has, not the collapsed one). The shape itself is therefore the assertion: each single-type
 * cell's `type` property must carry a one-member `anyOf`, never a bare `enum` or `const` beside
 * it. Falsified (confirmed before this commit) by switching the single-member branch back to a
 * bare `Type.Union`/`Type.Literal` and re-emitting — this describe block goes red, the
 * behavioural one above does not.
 */
function isOneMemberAnyOf(schema: unknown): boolean {
  if (typeof schema !== 'object' || schema === null) return false;
  const obj = schema as Record<string, unknown>;
  if ('enum' in obj || 'const' in obj) return false;
  return Array.isArray(obj['anyOf']) && obj['anyOf'].length === 1;
}

describe("I-10-1 / M2 (document shape) — each single-type cell's 'type' is a one-member anyOf, never a bare enum or const", () => {
  it.each(SINGLE_TYPE_CELLS)('$label — $method $path at $status', ({ path, method, status }) => {
    const { doc, error } = readDocument();
    expect(error, error).toBeUndefined();
    if (doc === undefined) return;

    const typeSchema = extractTypeSchema(doc, path, method, status);
    expect(
      typeSchema,
      `no application/problem+json response with a 'type' property schema at ` +
        `${method.toUpperCase()} ${path} ${status}`,
    ).toBeDefined();
    if (typeSchema === undefined) return;

    expect(
      isOneMemberAnyOf(typeSchema),
      `${method.toUpperCase()} ${path} ${status}'s 'type' property must be a one-member anyOf, ` +
        `never a bare enum or const — a bare literal here reproduces I-10-1/M2's collapse at the ` +
        `document level, where fast-json-stringify passes it through unvalidated.\n` +
        `schema: ${JSON.stringify(typeSchema)}`,
    ).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────── AC-3 ──

/**
 * AC-3 discharges A-06-2's CONTRACT half: no client-facing surface can carry an appointment id
 * in before one exists. Transcribed from the CURRENTLY COMMITTED `docs/api/openapi.json`
 * (design's own "Out of scope": this slice moves no requestBody or parameter shape — AC-1 and
 * AC-7 are the only edits it makes to what is documented). Falsified by adding `appointmentId`
 * to `BookingBody`, or any stray parameter nobody declared, per the design's own wording.
 */
const EXPECTED_REQUEST_BODY_PROPERTIES: Record<string, readonly string[]> = {
  'POST /appointments': ['dealershipId', 'customerId', 'vehicleId', 'serviceTypeId', 'startsAt'],
  'GET /appointments/{id}': [],
  'PATCH /appointments/{id}': ['startsAt'],
  'POST /appointments/{id}/cancellation': [],
  'GET /availability': [],
};

const EXPECTED_PARAMETERS: Record<string, readonly string[]> = {
  'POST /appointments': [],
  'GET /appointments/{id}': ['id:path'],
  'PATCH /appointments/{id}': ['id:path'],
  'POST /appointments/{id}/cancellation': ['id:path'],
  'GET /availability': ['dealershipId:query', 'serviceTypeId:query', 'from:query', 'to:query'],
};

function requestBodyProperties(op: OperationObject): string[] {
  const schema = op.requestBody?.content?.['application/json']?.schema;
  return Object.keys(schema?.properties ?? {}).sort();
}

function parameterList(op: OperationObject): string[] {
  return (op.parameters ?? []).map((p) => `${p.name ?? '(unnamed)'}:${p.in ?? '(no in)'}`).sort();
}

describe('AC-3 — no requestBody or parameter carries a caller-supplied appointment id (A-06-2, contract half)', () => {
  it.each(Object.entries(EXPECTED_REQUEST_BODY_PROPERTIES))(
    '%s requestBody property set, by equality',
    (opKey, expected) => {
      const { doc, error } = readDocument();
      expect(error, error).toBeUndefined();
      if (doc === undefined) return;
      const spaceIndex = opKey.indexOf(' ');
      const op = operation(doc, opKey.slice(spaceIndex + 1), opKey.slice(0, spaceIndex).toLowerCase());
      expect(op, `no ${opKey} operation in the document`).toBeDefined();
      if (op === undefined) return;

      expect(
        requestBodyProperties(op),
        `${opKey}'s requestBody property set must equal exactly ${JSON.stringify(expected)} — adding ` +
          `'appointmentId' (or any other spelling of an appointment id) fails this, as does dropping ` +
          `a legitimate field`,
      ).toEqual([...expected].sort());
    },
  );

  it.each(Object.entries(EXPECTED_PARAMETERS))('%s parameter (name,in) list, by equality', (opKey, expected) => {
    const { doc, error } = readDocument();
    expect(error, error).toBeUndefined();
    if (doc === undefined) return;
    const spaceIndex = opKey.indexOf(' ');
    const op = operation(doc, opKey.slice(spaceIndex + 1), opKey.slice(0, spaceIndex).toLowerCase());
    expect(op, `no ${opKey} operation in the document`).toBeDefined();
    if (op === undefined) return;

    expect(
      parameterList(op),
      `${opKey}'s parameter list must equal exactly ${JSON.stringify(expected)} — the only id ` +
        `parameters permitted anywhere are the path 'id' on the three operations addressing an ` +
        `appointment that already exists (read, reschedule, cancel); book and availability must ` +
        `carry none`,
    ).toEqual([...expected].sort());
  });
});

// ───────────────────────────────────────────────────────────────────────── AC-5b (slice 09) ──

describe('AC-5b (slice 09) — GET /availability documents AC-5a\'s two facts: not a reservation, and only of the interval queried', () => {
  it('the operation\'s description text carries both facts', () => {
    const { doc, error } = readDocument();
    expect(error, error).toBeUndefined();
    if (doc === undefined) return;

    const op = operation(doc, '/availability', 'get');
    expect(op, 'no GET /availability operation in the document').toBeDefined();
    if (op === undefined) return;

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

// ───────────────────────────────────────────────────────────────────────── AC-7 (slice 10) ──

/**
 * `R-09-13` / `10-design.md` §3: `AVAILABILITY_QUERYSTRING_DESCRIPTION` is split into three
 * concatenated contract-prose facts (what the operation answers, the rule, the consequence);
 * the TypeBox rationale stays in the file's own docblock and publishes nothing. `D-08-1`'s
 * three surviving mutants are one per emptied literal — hence three separate `it()` cases
 * below, each bound to exactly one of the three pieces, so that emptying any ONE of them
 * fails that one case (never all three at once, which would be indistinguishable from a
 * single combined assertion and would leave two of the three mutants unkilled, reopening
 * `D-08-1`).
 *
 * The boundary is the ARCHITECT'S CORRECTED wording (mid-slice AC authority, `10-design.md`
 * §3, provisional until the gate): `to` strictly later than `from` — not "at or after" as the
 * slice file's AC-7 literally says. `availability.ts` rejects `to <= from`, so "at or after"
 * would publish a rule the code does not implement; `A-10-4` is the assumption id this
 * correction is filed under.
 */
describe("AC-7 (slice 10) — GET /availability's description states the rule and its consequence, without naming the implementation", () => {
  function availabilityDescriptionText(): { readonly text?: string; readonly error?: string } {
    const { doc, error } = readDocument();
    if (error !== undefined) return { error };
    if (doc === undefined) return { error: 'document undefined' };
    const op = operation(doc, '/availability', 'get');
    if (op === undefined) return { error: 'no GET /availability operation in the document' };
    return { text: collectDescriptions(op, doc).toLowerCase() };
  }

  it('states what the operation answers — whether the window has capacity', () => {
    const { text, error } = availabilityDescriptionText();
    expect(error, error).toBeUndefined();
    if (text === undefined) return;
    expect(
      /\b(capacity|availab\w*)\b/.test(text) && /\bfrom\b/.test(text) && /\bto\b/.test(text),
      `expected the description to say what the operation answers — capacity/availability over ` +
        `the requested from/to window.\n${text}`,
    ).toBe(true);
  });

  it('states the rule — `to` must be STRICTLY LATER than `from` (A-10-4, not "at or after")', () => {
    const { text, error } = availabilityDescriptionText();
    expect(error, error).toBeUndefined();
    if (text === undefined) return;
    expect(
      /\bstrictly\s+later\b/.test(text),
      `expected the description to state the rule as 'to' strictly later than 'from' — the ` +
        `architect's corrected boundary (A-10-4), not the slice file's own "at or after".\n${text}`,
    ).toBe(true);
  });

  it('states the consequence — a violation is 400 /problems/malformed-request', () => {
    const { text, error } = availabilityDescriptionText();
    expect(error, error).toBeUndefined();
    if (text === undefined) return;
    expect(
      /400/.test(text) && /malformed-request/.test(text),
      `expected the description to state the consequence: 400 /problems/malformed-request.\n${text}`,
    ).toBe(true);
  });

  it('names neither TypeBox nor the schema', () => {
    const { text, error } = availabilityDescriptionText();
    expect(error, error).toBeUndefined();
    if (text === undefined) return;
    expect(/typebox/.test(text), `the published description must not name TypeBox.\n${text}`).toBe(false);
    expect(/\bschema\b/.test(text), `the published description must not name "schema".\n${text}`).toBe(false);
  });
});
