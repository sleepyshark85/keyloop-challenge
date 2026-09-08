import { describe, expect, it } from 'vitest';
import buildStringify from 'fast-json-stringify';
import { PROBLEM_MEDIA_TYPE, problemResponse } from '../../../src/http/problem.js';

interface NarrowedProblemSchema {
  readonly additionalProperties: boolean;
  readonly required: readonly string[];
  readonly properties: Record<string, unknown> & { readonly type: unknown };
}

/** `problemResponse()`'s return type is deliberately loose (`TSchema`) at the call site — this
 *  file's own business is the shape TypeBox actually builds, so it reaches for that shape via
 *  `unknown` first rather than widening the production type just to make a test compile. */
function narrowedSchemaOf(response: ReturnType<typeof problemResponse>): NarrowedProblemSchema {
  return response.content[PROBLEM_MEDIA_TYPE]?.schema as unknown as NarrowedProblemSchema;
}

/**
 * Slice 10 — `problemResponse()` (`src/http/problem.ts`), the per-cell narrowing every
 * `routes/*.ts` response map is built from (AC-1, AC-2). `tests/contract/openapi-document.test.ts`
 * asserts the same property end to end, over the COMMITTED document; this file exists beside it
 * for `vitest.mutation.config.ts`'s own reason every other `tests/unit/http/*.test.ts` file does
 * (see `appointments.test.ts`'s header): the contract test cannot kill a mutant in this repository's
 * mutation run, which scores `tests/unit/**` only.
 *
 * I-10-1/M2, RE-MEASURED HERE, UNIT-SCOPED: a one-member `Type.Union` collapses to a bare
 * `Type.Literal`, which SILENTLY SUBSTITUTES its own constant back for a wrong-but-closed-set
 * value. `problemResponse()`'s single-member branch (`Type.Unsafe` + a hand-built one-member
 * `anyOf`) must REJECT instead — the property asserted below, via the exact serialiser Fastify
 * uses (`fast-json-stringify`), never the schema's own shape.
 */
describe('problemResponse() — narrowed to one member, rejects rather than substitutes (I-10-1/M2)', () => {
  it('the media type is application/problem+json, unchanged by how many types are named', () => {
    const response = problemResponse('/problems/no-capacity');
    expect(Object.keys(response.content)).toEqual([PROBLEM_MEDIA_TYPE]);
  });

  it("a single-member cell's own value round-trips", () => {
    const typeSchema = narrowedSchemaOf(problemResponse('/problems/no-capacity')).properties.type;
    const stringify = buildStringify(typeSchema as never);
    expect(JSON.parse(stringify('/problems/no-capacity')) as unknown).toBe('/problems/no-capacity');
  });

  it('a single-member cell REJECTS a different, closed-set value — it does not substitute its own', () => {
    const typeSchema = narrowedSchemaOf(problemResponse('/problems/no-capacity')).properties.type;
    const stringify = buildStringify(typeSchema as never);
    expect(() => stringify('/problems/vehicle-not-owned')).toThrow();
  });

  it('a two-member cell still enforces its own set — a third value is refused, not decorated', () => {
    const typeSchema = narrowedSchemaOf(
      problemResponse('/problems/malformed-request', '/problems/outside-opening-hours'),
    ).properties.type;
    const stringify = buildStringify(typeSchema as never);
    expect(JSON.parse(stringify('/problems/malformed-request')) as unknown).toBe(
      '/problems/malformed-request',
    );
    expect(JSON.parse(stringify('/problems/outside-opening-hours')) as unknown).toBe(
      '/problems/outside-opening-hours',
    );
    expect(() => stringify('/problems/no-capacity')).toThrow();
  });

  it('the narrowed schema keeps the rest of the RFC 9457 shape — title, status and the optional members', () => {
    const schema = narrowedSchemaOf(problemResponse('/problems/no-capacity'));
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['type', 'title', 'status']);
    expect(Object.keys(schema.properties).sort()).toEqual(
      ['closesAt', 'detail', 'opensAt', 'reference', 'resource', 'status', 'title', 'type'].sort(),
    );
  });
});
