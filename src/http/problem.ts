/**
 * RFC 9457 `application/problem+json` — the whole taxonomy, in one file.
 *
 * arc42 §8.6's table is the client contract, and QS-11 requires that every row is reachable, that
 * each carries one status and one `type`, and that no two rows collide. That is only assertable if
 * the set of types is a closed, named thing rather than a habit, so it is one `as const` array
 * here and the schema is built from it.
 *
 * ── WHY `Type.Union` OF LITERALS AND NOT `Type.Literal` PER STATUS ────────────────────────────
 *
 * Measured on this repository's pinned Fastify (design §8, measurement 8), three response schemas
 * and one wrong value each:
 *
 *   `Type.Literal('x')`                     the wrong value is SUBSTITUTED with 'x', silently
 *   `Type.Union([Literal('a'), ...])`       500 — the value does not match schema definition
 *   `Type.String({ enum: [...] })`          passed through unvalidated
 *
 * The union is the only one of the three that both ENFORCES and DOES NOT SUBSTITUTE. Under
 * `Type.Literal` a handler emitting the wrong `type` has the right answer written in for it, so
 * QS-11's contract test cannot fail; under `Type.String({enum})` the wrong answer reaches the
 * client. This is the difference between a contract test that can fail and one that cannot.
 *
 * ── THE TAXONOMY COULD ESCAPE ITSELF, AND NOW CANNOT — I-02-5 ─────────────────────────────────
 *
 * The union alone is a backstop that can BECOME the defect. Measured: with a `Problem` response
 * schema, a mistyped `type` produces `500`, `application/json`, and a body reading
 * `FST_ERR_FAILED_ERROR_SERIALIZATION` — not `problem+json`, no `type`, wrong status. §8.6's
 * `500 | Anything else` row claims totality and that escapes it. Two changes, belt and braces on
 * purpose:
 *
 *  1. {@link problem} is a COMPILE-TIME constructor over {@link ProblemType}, so an
 *     out-of-taxonomy URI is a compiler error at the call site rather than a serialisation
 *     failure at the client. Same move as ADR-0016's brand, one layer up.
 *  2. THE `500` CARRIES NO RESPONSE SCHEMA (see `routes/appointments.ts`). Measured: unschema'd,
 *     it renders exactly what the handler sent with the right content type. The last-resort
 *     renderer must not be able to fail — a schema on the one status whose job is to catch
 *     everything is a dependency the catch-all cannot afford.
 *
 * ── SLICE 10 — NARROWING PER OPERATION, AND A SECOND COLLAPSE THE FIRST FIX DID NOT COVER ─────
 *
 * §8.6's per-operation columns (`10-design.md` §1) mean each `routes/*.ts` response now declares
 * only the `type` values that operation can produce, not all nine — {@link narrowedProblemType}
 * and {@link narrowedProblemSchema} below build that per-cell schema, and {@link problemResponse}
 * wraps it in Fastify's per-response `content` form (M1) so the emitted document's media type is
 * `application/problem+json`, not the bare-schema form's `application/json` (AC-1's own defect).
 *
 * A set narrowed to ONE member reproduces `Type.Union`'s own collapse (I-10-1/M2, measured):
 * TypeBox's `Union()` returns a bare `Type.Literal` when given a single member, and a bare
 * literal SILENTLY SUBSTITUTES its own constant back regardless of the value actually sent —
 * exactly the defect this file's `ProblemSchema` union was built to avoid, reintroduced by
 * narrowing it. `Type.Unsafe` with a hand-built one-member `anyOf` rejects a mismatch instead
 * (`fast-json-stringify` throws on it) while `Static<>` still infers the narrowed literal type
 * via the explicit type parameter. Two-or-more-member sets keep `Type.Union`, exactly as
 * `ProblemSchema` above — nothing collapses there.
 */
import { Type } from '@sinclair/typebox';
import type { Static, TSchema } from '@sinclair/typebox';
import type { FastifyReply } from 'fastify';

/**
 * The nine rows of §8.6 in scope as of slice 06 — seven through slice 05, plus two landed
 * together in this one step (design §2.4): `/problems/appointment-not-confirmed` (ADR-0025 —
 * a cancelled appointment cannot be moved) and `/problems/route-not-found` (ADR-0024 —
 * `setErrorHandler` alone does not run for a genuinely unmatched route; `server.ts`'s
 * `setNotFoundHandler` is the second handler that answers inside this taxonomy rather than with
 * Fastify's own default 404 body).
 *
 * MEASURED, NOT ASSUMED, why this array being `as const` leaves it OUTSIDE Stryker's reach
 * (I-06-1): `@stryker-mutator/instrumenter`'s `syntax-helpers.js` lists `TSAsExpression` among
 * `tsTypeAnnotationNodeTypes`, so the whole subtree — this array and every string literal in it —
 * is classed as a type node and skipped. `src/http/problem.ts` is immune, not cushioned: adding
 * these two rows put NO new mutant on the mutation report. `tests/unit/http/appointments.test.ts`'s
 * set-equality assertion is a compiler-and-assertion fact, not a kill, and stays mandatory anyway
 * — it is what a DELETED row would still be caught by, since the mutation score is silent on
 * exactly that (F-06-2). `tests/contract/error-taxonomy.test.ts`'s AC-12 sweep is the other guard,
 * asserted in the direction that can fail (∀responses ∃row).
 */
export const PROBLEM_TYPES = [
  '/problems/malformed-request',
  '/problems/outside-opening-hours',
  '/problems/appointment-not-found',
  '/problems/no-capacity',
  '/problems/unknown-reference',
  '/problems/vehicle-not-owned',
  '/problems/internal',
  '/problems/appointment-not-confirmed',
  '/problems/route-not-found',
] as const;

export type ProblemType = (typeof PROBLEM_TYPES)[number];

/** RFC 9457's media type. Half the contract: a right `type` as `application/json` is a client that has to sniff. */
export const PROBLEM_CONTENT_TYPE = 'application/problem+json; charset=utf-8';

export const ProblemSchema = Type.Object(
  {
    type: Type.Union(PROBLEM_TYPES.map((type) => Type.Literal(type))),
    title: Type.String(),
    status: Type.Integer(),
    detail: Type.Optional(Type.String()),
    /** `no-capacity` only. ADR-0016: it exists because PostgreSQL produced a verdict. */
    resource: Type.Optional(Type.Union([Type.Literal('bay'), Type.Literal('technician')])),
    /** `unknown-reference` only — four failures share one `type`, and this is which. */
    reference: Type.Optional(Type.String()),
    opensAt: Type.Optional(Type.String()),
    closesAt: Type.Optional(Type.String()),
  },
  { additionalProperties: false, description: 'RFC 9457 problem detail.' },
);

export type Problem = Static<typeof ProblemSchema>;

/** The members a particular row adds on top of `type`, `title` and `status`. */
export type ProblemExtra = Omit<Problem, 'type' | 'title' | 'status'>;

/**
 * THE ONLY CONSTRUCTOR. `type` is `ProblemType`, so `PROBLEM_TYPES` being `as const` turns a typo
 * into a compiler error at the call site instead of an `FST_ERR_FAILED_ERROR_SERIALIZATION` at
 * the client.
 */
export function problem(
  type: ProblemType,
  status: number,
  title: string,
  extra: ProblemExtra = {},
): Problem {
  return { type, title, status, ...extra };
}

/**
 * Send a problem document with the RFC 9457 media type.
 *
 * The content type is set explicitly on every problem response rather than globally: a global
 * serialiser would also have to decide what a `201` is, and a `200` that arrived as
 * `problem+json` is a worse failure than a `400` that arrived as `application/json`.
 */
export async function sendProblem(reply: FastifyReply, body: Problem): Promise<void> {
  await reply.code(body.status).type(PROBLEM_CONTENT_TYPE).send(body);
}

/**
 * The bare RFC 9457 media type — no `; charset=utf-8` suffix. This is the exact `content` key a
 * per-response schema below is registered under; {@link sendProblem}'s `.type(PROBLEM_CONTENT_TYPE)`
 * call appends the charset, and Fastify's content-type matching still resolves against this bare
 * key (measured, I-10-2/M1: the content-keyed form survives the suffix).
 */
export const PROBLEM_MEDIA_TYPE = 'application/problem+json';

/**
 * The `type` property's schema for a response narrowed to fewer than all nine §8.6 rows. See the
 * file docblock's "SLICE 10" section for why a single-member set is `Type.Unsafe`, not
 * `Type.Union`.
 */
function narrowedProblemType<T extends ProblemType>(types: readonly [T, ...T[]]): TSchema {
  if (types.length === 1) {
    return Type.Unsafe<T>({ anyOf: [{ const: types[0], type: 'string' }] });
  }
  return Type.Union(types.map((type) => Type.Literal(type)));
}

/**
 * {@link ProblemSchema}'s own shape, narrowed to `types`' `type` values — so a client parses one
 * document shape from any operation regardless of which cell answered, and `docs/api/openapi.json`
 * declares only what that operation can actually produce.
 */
function narrowedProblemSchema<T extends ProblemType>(types: readonly [T, ...T[]]) {
  return Type.Object(
    {
      type: narrowedProblemType(types),
      title: Type.String(),
      status: Type.Integer(),
      detail: Type.Optional(Type.String()),
      resource: Type.Optional(Type.Union([Type.Literal('bay'), Type.Literal('technician')])),
      reference: Type.Optional(Type.String()),
      opensAt: Type.Optional(Type.String()),
      closesAt: Type.Optional(Type.String()),
    },
    { additionalProperties: false, description: 'RFC 9457 problem detail.' },
  );
}

/**
 * A `routes/*.ts` `schema.response` entry, narrowed to exactly the `type` values the calling
 * operation names. Declared via Fastify's per-response `content` form (M1, `10-design.md`
 * "Measure, do not choose in advance") rather than the classic bare-schema form: measured, the
 * bare form emits `application/json` in the document regardless of what {@link sendProblem}
 * actually sends on the wire, which is AC-1's whole defect.
 */
export function problemResponse<T extends ProblemType>(
  ...types: readonly [T, ...T[]]
): { readonly content: Record<string, { readonly schema: TSchema }> } {
  return { content: { [PROBLEM_MEDIA_TYPE]: { schema: narrowedProblemSchema(types) } } };
}
