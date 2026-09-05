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
 */
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type { FastifyReply } from 'fastify';

/**
 * The seven rows of §8.6 in scope for this slice.
 *
 * `/problems/appointment-not-confirmed` is deliberately absent: it needs rescheduling and is
 * slice 06's, per the slice file's out-of-scope. It joins the union there, and the union is
 * exactly what makes that addition a one-line, compiler-visible change.
 */
export const PROBLEM_TYPES = [
  '/problems/malformed-request',
  '/problems/outside-opening-hours',
  '/problems/appointment-not-found',
  '/problems/no-capacity',
  '/problems/unknown-reference',
  '/problems/vehicle-not-owned',
  '/problems/internal',
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
