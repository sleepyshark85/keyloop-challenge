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
 * ── THE OPERATION-LEVEL `description`, AND WHY THE QUERYSTRING NO LONGER CARRIES ITS OWN COPY ──
 *
 * `docs/slices/09-design.md` "AC-7 does not kill the seven description mutants", decision 4:
 * `@fastify/swagger` 9.8.1, measured, EXPLODES an object `querystring` schema into individual
 * `in: query` parameters and DROPS the object's own `description` in the process — so a copy
 * placed there rendered nowhere in the emitted document, unkillable from
 * `tests/contract/openapi-document.test.ts` even though that file diffs the document byte for
 * byte. An OPERATION-level `schema.description` — a sibling of `querystring`/`response`, not a
 * property of either — IS preserved into `operation.description`, which is why
 * {@link AVAILABILITY_QUERYSTRING_DESCRIPTION} lives there alone now: `10-design.md` §3 (`R-09-13`)
 * measured that dropping the querystring object's own duplicate changes no emitted byte — this
 * docblock's `@fastify/swagger` rationale above is exactly what used to be repeated, wrongly, in
 * that published copy, and `AC-7`'s `docs:openapi -- --check` is what proves the drop is silent.
 *
 * ── `R-09-13`'s SPLIT — CONTRACT PROSE, NOT AN IMPLEMENTATION NOTE ────────────────────────────
 *
 * {@link AVAILABILITY_QUERYSTRING_DESCRIPTION} is three concatenated string literals — what the
 * operation answers, the rule, and the consequence — each its OWN literal so `D-08-1`'s three
 * surviving mutants (one per emptied piece) stay separately killable; a single combined literal
 * would leave two of three unkillable. None of the three names TypeBox or "schema": that
 * rationale is this file's own, stated above, and publishing it to a client is what the split
 * removes.
 */
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { problem, problemResponse, sendProblem } from '../problem.js';
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
 * §8.6's contract prose for this operation, published ONLY at `operation.description` (see the
 * file docblock's two sections above) — three concatenated facts, one per literal, bound to
 * `D-08-1`'s three surviving mutants: what the operation answers, the rule (`A-10-4`: `to`
 * strictly later than `from`, not "at or after"), and the consequence. Names neither TypeBox
 * nor "schema" — that rationale is this file's own, not a client's concern.
 */
const AVAILABILITY_QUERYSTRING_DESCRIPTION =
  'Reports availability — capacity free for this dealership and service type over the ' +
  'requested from/to window. ' +
  'to must be strictly later than from. ' +
  'A violation is 400 /problems/malformed-request.';

const AvailabilityQuerystring = Type.Object(
  {
    dealershipId: Type.String({ pattern: UUID_PATTERN }),
    serviceTypeId: Type.String({ pattern: UUID_PATTERN }),
    from: Type.String({ pattern: RFC3339_PATTERN }),
    to: Type.String({ pattern: RFC3339_PATTERN }),
  },
  // Stryker disable next-line ObjectLiteral : {} here changes nothing observable — Fastify's ajv
  // removeAdditional strips an unknown query key regardless of this object's own
  // additionalProperties (I-08-6); the dist/ recipe (R-08-3) shows no boundary difference. No
  // `description` here at all (`R-09-13`, `10-design.md` §3): `@fastify/swagger` drops an object
  // querystring schema's own `description` when it explodes it into per-parameter entries (see
  // the file docblock), so one placed here would render nowhere and only cost AC-7 a mutant.
  {
    // Stryker disable next-line BooleanLiteral : same boundary as above — removeAdditional
    // already strips unknown keys whether this reads false or true (I-08-6).
    additionalProperties: false,
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

/**
 * `vehicle-not-owned` is gone from here (`10-design.md` §1): §8.6's matrix names it `book only`,
 * and this operation books nothing.
 */
const PROBLEM_RESPONSES = {
  400: problemResponse('/problems/malformed-request'),
  422: problemResponse('/problems/unknown-reference'),
} as const;

export function registerAvailabilityRoute(
  app: FastifyInstance,
  deps: AvailabilityRouteDeps,
): void {
  app.get<{ Querystring: AvailabilityQuerystringType }>(
    '/availability',
    {
      schema: {
        // Operation-level, sibling of `querystring`/`response` — see the file docblock. Fastify
        // maps this to the OpenAPI operation's own `description`, which is the one copy of this
        // text that survives into the emitted document at all.
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
