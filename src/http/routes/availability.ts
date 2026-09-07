/**
 * `GET /availability` — design §2. The whole of this slice's client surface.
 *
 * Same discipline as `routes/appointments.ts`: ONE exhaustive `switch` over `AvailabilityOutcome`
 * decides the status code, so a fourth member cannot be added to the union without this file
 * failing to build, and nothing about `pg`, SQLSTATE or a connection reaches here
 * (`http-must-not-reach-persistence`).
 *
 * ── `to <= from` IS A ROUTE-LEVEL GUARD, NOT A SCHEMA ONE (AC-6, F-08-3) ──────────────────────
 *
 * TypeBox validates each querystring member against its own pattern; it cannot compare two
 * properties to each other, so there is no schema shape that rejects `to <= from` before a
 * handler runs. `queryAvailability` decides it — `malformed-window` — and this route only renders
 * what it is handed, exactly as `malformed-instant` already works on the booking path.
 *
 * ── AC-5: THE ADVISORY FLAG AND THE TWO FACTS, IN THE BODY AND IN THE SCHEMA'S OWN DESCRIPTION ─
 *
 * `advisory` is `Type.Boolean()`, not `Type.Literal(true)` — measured in `problem.ts`'s own
 * docblock: a `Type.Literal` SUBSTITUTES the schema's constant for whatever the handler actually
 * sent, silently. That is exactly wrong for a field whose entire job is to be trustworthy: a
 * response schema that would launder a wrongly-computed `false` back into `true` makes AC-5
 * unable to fail against a broken implementation. `Type.Boolean()` and `Type.String()` (for
 * `disclaimer`) both pass the handler's actual value through unchanged.
 *
 * The disclaimer text is repeated as the response schema's own `description` — the OpenAPI half
 * AC-5 also requires, now assertable end to end via `buildOpenApiDocument()` (AC-5b).
 *
 * ── THE OPERATION-LEVEL `description`, AND WHY THE QUERYSTRING'S OWN COPY STAYS TOO ────────────
 *
 * `docs/slices/09-design.md` "AC-7 does not kill the seven description mutants", decision 4:
 * `@fastify/swagger` 9.8.1, measured, EXPLODES an object `querystring` schema into individual
 * `in: query` parameters and DROPS the object's own `description` in the process — so
 * `AVAILABILITY_QUERYSTRING_DESCRIPTION`'s three concatenated literals rendered nowhere in the
 * emitted document, unkillable from `tests/contract/openapi-document.test.ts` even though that
 * file diffs the document byte for byte. An OPERATION-level `schema.description` — a sibling of
 * `querystring`/`response`, not a property of either — IS preserved into `operation.description`.
 * The constant is reused rather than duplicated: a mutation to any of its three literal pieces
 * changes the ONE emitted copy, so `AC-5b`'s test (which reads the whole operation, not just the
 * response) can still tell. It touches no criterion — AC-5b names the response schema's own two
 * facts, which are unrelated text — and renders, in the document, a rule that previously
 * rendered nowhere in it at all.
 */
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { ProblemSchema, problem, sendProblem } from '../problem.js';
import { RFC3339_PATTERN, UUID_PATTERN } from './appointments.js';
import type { AvailabilityOutcome, AvailabilityQuery } from '../../application/queryAvailability.js';

export interface AvailabilityRouteDeps {
  readonly queryAvailability: (query: AvailabilityQuery) => Promise<AvailabilityOutcome>;
}

/**
 * AC-5's two facts, present as free text a client (and the acceptance test, by keyword) can read
 * without parsing anything beyond the JSON body: this is not a reservation, and it holds only for
 * the interval this request named.
 */
const DISCLAIMER =
  'This result is advisory only: it is not a reservation, and it is true only of the interval ' +
  'queried (the from/to window on this request) at the instant this response was generated — a ' +
  'concurrent booking can make it stale immediately afterwards. Only POST /appointments makes an ' +
  'adjudicated decision.';

/**
 * The three concatenated literals `AC-7 does not kill the seven description mutants` (decision 4)
 * relocates onto the route's own operation-level `schema.description` below — SAME constant, not
 * a second copy, so a mutation to either use is caught by the one place the document keeps it.
 */
const AVAILABILITY_QUERYSTRING_DESCRIPTION =
  'What is free for this dealership and service type over [from, to). TypeBox validates ' +
  'each instant on its own; to <= from is rejected by the route (400), not by this schema, ' +
  'because a schema cannot compare two of its own properties.';

const AvailabilityQuerystring = Type.Object(
  {
    dealershipId: Type.String({ pattern: UUID_PATTERN }),
    serviceTypeId: Type.String({ pattern: UUID_PATTERN }),
    from: Type.String({ pattern: RFC3339_PATTERN }),
    to: Type.String({ pattern: RFC3339_PATTERN }),
  },
  // Stryker disable next-line ObjectLiteral : {} here changes nothing observable — Fastify's ajv
  // removeAdditional strips an unknown query key regardless of this object's own
  // additionalProperties/description (I-08-6); the dist/ recipe (R-08-3) shows no boundary
  // difference, and the only killer left would assert this description string verbatim.
  {
    // Stryker disable next-line BooleanLiteral : same boundary as above — removeAdditional
    // already strips unknown keys whether this reads false or true (I-08-6).
    additionalProperties: false,
    description: AVAILABILITY_QUERYSTRING_DESCRIPTION,
  },
);

type AvailabilityQuerystringType = Static<typeof AvailabilityQuerystring>;

const AvailabilityBody = Type.Object(
  {
    bays: Type.Array(Type.String()),
    technicians: Type.Array(Type.String()),
    /** AC-5. `Type.Boolean()`, deliberately not `Type.Literal(true)` — see the file docblock. */
    advisory: Type.Boolean(),
    /** AC-5's two facts, as free text. `Type.String()` for the same non-substitution reason. */
    disclaimer: Type.String(),
  },
  // Stryker disable next-line ObjectLiteral : {} here changes nothing observable either — the
  // response serializer already drops keys not named in `AvailabilityBody`'s own properties
  // regardless of this options object's additionalProperties/description (I-08-6); the dist/
  // recipe (R-08-3) shows no boundary difference, and the only killer left would assert this
  // description string verbatim.
  {
    // Stryker disable next-line BooleanLiteral : same boundary as the querystring schema's
    // additionalProperties above — the response serializer already drops unlisted keys whether
    // this reads false or true (I-08-6).
    additionalProperties: false,
    description:
      'The bays and technicians free over the queried interval, as of the instant this response ' +
      'was generated. Advisory only: it is not a reservation, and it is true only of the ' +
      'interval queried — a concurrent booking can make it stale immediately afterwards. Only ' +
      'POST /appointments performs an adjudicated, database-verified booking.',
  },
);

const PROBLEM_RESPONSES = { 400: ProblemSchema, 422: ProblemSchema } as const;

export function registerAvailabilityRoute(
  app: FastifyInstance,
  deps: AvailabilityRouteDeps,
): void {
  app.get<{ Querystring: AvailabilityQuerystringType }>(
    '/availability',
    {
      schema: {
        // Operation-level, sibling of `querystring`/`response` — see the file docblock. Fastify
        // maps this to the OpenAPI operation's own `description`, which survives where the
        // querystring's own (identical) copy above does not.
        description: AVAILABILITY_QUERYSTRING_DESCRIPTION,
        querystring: AvailabilityQuerystring,
        // Stryker disable next-line ObjectLiteral : {} here drops response-schema validation
        // entirely, but nothing this route ever sends carries a field it would strip (I-08-6) —
        // the dist/ recipe (R-08-3) shows no boundary difference, and the only killer left would
        // assert this response map's own shape.
        response: { 200: AvailabilityBody, ...PROBLEM_RESPONSES },
      },
    },
    async (request, reply) => {
      const { dealershipId, serviceTypeId, from, to } = request.query;
      const outcome = await deps.queryAvailability({
        dealershipId,
        serviceTypeId,
        // Same construction as the booking and reschedule routes': the pattern guarantees an
        // explicit offset, so this names an instant, and an unparsable value's `NaN` is
        // `malformed-window`'s subject rather than this handler's.
        fromMillis: Date.parse(from),
        toMillis: Date.parse(to),
      });

      switch (outcome.kind) {
        case 'available':
          return await reply.code(200).send({
            bays: outcome.bays,
            technicians: outcome.technicians,
            advisory: true,
            disclaimer: DISCLAIMER,
          });

        case 'malformed-window':
          return await sendProblem(
            reply,
            problem('/problems/malformed-request', 400, 'The request could not be understood', {
              detail: 'to must be strictly later than from',
            }),
          );

        case 'unknown-reference':
          return await sendProblem(
            reply,
            problem('/problems/unknown-reference', 422, 'A named reference does not exist', {
              reference: outcome.reference,
              detail: `no ${outcome.reference} matches the id in this request`,
            }),
          );

        default: {
          const unhandled: never = outcome;
          // Stryker disable next-line all : an exhaustive switch's `never` arm is unreachable by
          // construction — see `routes/appointments.ts`'s identical arms (R-06-A) for the full
          // reasoning this single-line directive relies on. It reaches only this `throw`, not
          // the `default:` arm above it — those two mutants stay in the denominator on purpose
          // (O-62).
          throw new Error(`unhandled availability outcome ${JSON.stringify(unhandled)}`);
        }
      }
    },
  );
}
