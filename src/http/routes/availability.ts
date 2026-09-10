/**
 * `GET /availability` — design §2. The whole of this slice's client surface.
 *
 * Same discipline as `routes/appointments.ts`: ONE exhaustive `switch` over `AvailabilityOutcome`
 * decides the status code, so a sixth member cannot be added to the union without this file
 * failing to build, and nothing about `pg`, SQLSTATE or a connection reaches here
 * (`http-must-not-reach-persistence`).
 *
 * ── ADR-0039: `startsAt` ONLY, AND THE RESPONSE NAMES THE INTERVAL IT ANSWERED ABOUT ──────────
 *
 * `from`/`to` are gone, not kept alongside `startsAt` — a REPLACEMENT, not an addition (design
 * ruling 1). `queryAvailability` derives the window through `deriveInterval`, the function
 * `bookAppointment` calls unedited, so the `200` can carry the `startsAt`/`endsAt` it actually
 * derived rather than echoing a caller-chosen window back.
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
 * operation answers (now: a window DERIVED from `startsAt`), and the two consequences a client
 * can still reach (`malformed-request`, `outside-opening-hours`) — each its OWN literal so
 * `D-08-1`'s surviving mutants (one per emptied piece) stay separately killable. None of the
 * three names TypeBox or "schema": that rationale is this file's own, stated above, and
 * publishing it to a client is what the split removes.
 */
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { problem, problemResponse, sendProblem } from '../problem.js';
import { RFC3339_PATTERN, UUID_PATTERN, outsideOpeningHours } from './appointments.js';
import type { AvailabilityOutcome, AvailabilityQuery } from '../../application/queryAvailability.js';

export interface AvailabilityRouteDeps {
  readonly queryAvailability: (query: AvailabilityQuery) => Promise<AvailabilityOutcome>;
}

/**
 * AC-5's two facts, present as free text a client (and the acceptance test, by keyword) can read
 * without parsing anything beyond the JSON body: this is not a reservation, and it holds only for
 * the interval named in THIS response (ADR-0039) — no longer a window the caller chose.
 */
const DISCLAIMER =
  'This result is advisory only: it is not a reservation, and it is true only of the interval ' +
  'named in this response (startsAt/endsAt) at the instant this response was generated — a ' +
  'concurrent booking can make it stale immediately afterwards. Only POST /appointments makes an ' +
  'adjudicated decision.';

/**
 * §8.6's contract prose for this operation, published ONLY at `operation.description` (see the
 * file docblock's two sections above) — three concatenated facts, one per literal, bound to
 * `D-08-1`'s surviving mutants: what the operation answers (ADR-0039: a window derived from
 * `startsAt` and the service type's duration, the same derivation `POST /appointments` uses),
 * and the two consequences a client can still reach. Names neither TypeBox nor "schema" — that
 * rationale is this file's own, not a client's concern.
 */
const AVAILABILITY_QUERYSTRING_DESCRIPTION =
  'Reports availability — capacity free for this dealership and service type over the window ' +
  "derived from startsAt and the service type's duration, the same derivation POST " +
  '/appointments uses. ' +
  'An unrenderable startsAt is 400 /problems/malformed-request. ' +
  "A derived interval outside the dealership's opening hours is 400 /problems/outside-opening-hours.";

const AvailabilityQuerystring = Type.Object(
  {
    dealershipId: Type.String({ pattern: UUID_PATTERN }),
    serviceTypeId: Type.String({ pattern: UUID_PATTERN }),
    startsAt: Type.String({ pattern: RFC3339_PATTERN }),
  },
  // Stryker disable next-line ObjectLiteral : {} here changes nothing observable — Fastify's ajv
  // removeAdditional strips an unknown query key regardless of this object's own
  // additionalProperties (I-08-6). No `description` here at all (`R-09-13`): `@fastify/swagger`
  // drops an object querystring schema's own `description` when it explodes it into per-parameter
  // entries (see the file docblock), so one placed here would render nowhere and only cost AC-7 a
  // mutant.
  {
    // Stryker disable next-line BooleanLiteral : same boundary as above — removeAdditional
    // already strips unknown keys whether this reads false or true (I-08-6).
    additionalProperties: false,
  },
);

type AvailabilityQuerystringType = Static<typeof AvailabilityQuerystring>;

const AvailabilityBody = Type.Object(
  {
    /** AC-2, AC-7: the interval this response answered about — `deriveInterval`'s own bounds,
     * never a caller-supplied window (ADR-0039). Required, alongside the other five members. */
    startsAt: Type.String(),
    endsAt: Type.String(),
    bays: Type.Array(Type.String()),
    technicians: Type.Array(Type.String()),
    /** AC-5. `Type.Boolean()`, deliberately not `Type.Literal(true)` — see the file docblock. */
    advisory: Type.Boolean(),
    /** AC-5's two facts, as free text. `Type.String()` for the same non-substitution reason. */
    disclaimer: Type.String(),
  },
  // Stryker disable next-line ObjectLiteral : {} here changes nothing observable either — the
  // response serializer already drops keys not named in `AvailabilityBody`'s own properties
  // regardless of this options object's additionalProperties/description (I-08-6).
  {
    // Stryker disable next-line BooleanLiteral : same boundary as the querystring schema's
    // additionalProperties above — the response serializer already drops unlisted keys whether
    // this reads false or true (I-08-6).
    additionalProperties: false,
    description:
      'The interval named by startsAt/endsAt, and the bays and technicians free over it, as of ' +
      'the instant this response was generated. Advisory only: it is not a reservation, and it ' +
      'is true only of the interval queried — a concurrent booking can make it stale ' +
      'immediately afterwards. Only POST /appointments performs an adjudicated, ' +
      'database-verified booking.',
  },
);

/**
 * The last-resort body for this operation. `I-16-1` (design §5 ruling 6): rebuilt LOCALLY rather
 * than imported, because `/problems/internal` is already duplicated by construction site and held
 * in agreement by `tests/contract/error-taxonomy.test.ts` — not by shared code. The two existing
 * sites are `src/http/server.ts` (the escaped-exception handler) and
 * `src/http/routes/appointments.ts` (booking/reschedule's identical arm); this is the third. The
 * `500` deliberately carries no response schema (`appointments.ts`'s own docblock, I-02-5), so
 * there is nothing here to share beyond this frozen string.
 */
const INTERNAL = problem('/problems/internal', 500, 'The request could not be completed', {
  detail: 'the service could not complete this request; the failure has been logged',
});

/**
 * `vehicle-not-owned` is gone from here (`10-design.md` §1): §8.6's matrix names it `book only`,
 * and this operation books nothing.
 *
 * TWO MEMBERS AT `400` IS LOAD-BEARING, NOT INCIDENTAL (I-10-1, design §5 ruling 6): a
 * one-member `Type.Union` collapses to a `Literal` and silently substitutes. No `500` entry — the
 * catch-all cannot afford a schema of its own (I-02-5).
 */
const PROBLEM_RESPONSES = {
  400: problemResponse('/problems/malformed-request', '/problems/outside-opening-hours'),
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
        // entirely, but nothing this route ever sends carries a field it would strip (I-08-6).
        response: { 200: AvailabilityBody, ...PROBLEM_RESPONSES },
      },
    },
    async (request, reply) => {
      const { dealershipId, serviceTypeId, startsAt } = request.query;
      const outcome = await deps.queryAvailability({
        dealershipId,
        serviceTypeId,
        // Same construction as the booking and reschedule routes': the pattern guarantees an
        // explicit offset, so this names an instant, and an unparsable value's `NaN` is
        // `malformed-instant`'s subject rather than this handler's.
        startsAtMillis: Date.parse(startsAt),
      });

      switch (outcome.kind) {
        case 'available':
          return await reply.code(200).send({
            startsAt: new Date(outcome.startsAt).toISOString(),
            endsAt: new Date(outcome.endsAt).toISOString(),
            bays: outcome.bays,
            technicians: outcome.technicians,
            advisory: true,
            disclaimer: DISCLAIMER,
          });

        case 'malformed-instant':
          return await sendProblem(
            reply,
            problem('/problems/malformed-request', 400, 'The request could not be understood', {
              detail: 'startsAt is not a usable instant',
            }),
          );

        case 'outside-opening-hours':
          return await sendProblem(reply, outsideOpeningHours(outcome.verdict));

        case 'unknown-reference':
          return await sendProblem(
            reply,
            problem('/problems/unknown-reference', 422, 'A named reference does not exist', {
              reference: outcome.reference,
              detail: `no ${outcome.reference} matches the id in this request`,
            }),
          );

        case 'reference-data-invalid':
          // The system's fault, never the client's — same taxonomy row `bookAppointment`'s
          // identical arm renders (design §5 ruling 3).
          return await sendProblem(reply, INTERNAL);

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
