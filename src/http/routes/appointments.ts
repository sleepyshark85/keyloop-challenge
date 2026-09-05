/**
 * `POST /appointments` and `GET /appointments/{id}` — the whole of this slice's client surface.
 *
 * The status codes are decided by ONE EXHAUSTIVE SWITCH per route, over a union declared in
 * `src/application`. That is what makes §8.6's mapping compiler-checked rather than conventional:
 * an eighth `BookOutcome` member cannot be added without this file failing to build. Nothing about
 * `pg`, SQLSTATE or a connection reaches here — `http-must-not-reach-persistence` forbids this
 * layer even from NAMING the database handle's type, so the use cases arrive already bound.
 *
 * ── THE `500` CARRIES NO RESPONSE SCHEMA, AND THAT IS THE POINT — I-02-5 ──────────────────────
 *
 * Measured: with a `Problem` response schema on a status, a body that does not match produces
 * `500`, `application/json`, `FST_ERR_FAILED_ERROR_SERIALIZATION` — not `problem+json`, no `type`,
 * wrong status. §8.6's `500 | Anything else` row claims totality and that escapes it. So the one
 * status whose job is to catch everything has no schema to fail: unschema'd, Fastify renders
 * exactly what the handler sent, with the content type the handler set. `400`, `404`, `409` and
 * `422` keep theirs — for ADR-0005's emitted OpenAPI document, and as the runtime backstop behind
 * `problem.ts`'s compile-time constructor.
 *
 * ── AC-6 FALLS OUT OF THE SCHEMA, AND THERE IS A SECOND, STRUCTURAL REASON ────────────────────
 *
 * Measured: a body carrying an extra `endsAt` returns `201` with the property STRIPPED, because
 * Fastify's default ajv options set `removeAdditional: true`. So a supplied end never reaches the
 * handler. And there is no `endsAt` parameter anywhere on the path to receive one:
 * `appointmentInterval` takes a start and a duration. Two independent reasons, one of which does
 * not depend on a framework default.
 */
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { PROBLEM_CONTENT_TYPE, ProblemSchema, problem, sendProblem } from '../problem.js';
import type { Problem } from '../problem.js';
import type { BookCommand, BookOutcome } from '../../application/bookAppointment.js';
import type { ReadOutcome } from '../../application/readAppointment.js';

export interface AppointmentRouteDeps {
  readonly bookAppointment: (command: BookCommand) => Promise<BookOutcome>;
  readonly readAppointment: (id: string) => Promise<ReadOutcome>;
}

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

/**
 * RFC 3339, with an explicit offset required.
 *
 * A zone-less `2026-09-08T09:00:00` would be parsed by `Date.parse` in the SERVER's zone, which
 * is the worst bug available in this system and the one QS-12's `wall-clock-reasoning` marker
 * exists to catch elsewhere. Requiring `Z` or `±HH:MM` makes the request name an INSTANT, which
 * is what `instant()` takes.
 *
 * F-02-2, recorded rather than fixed: a regex cannot know how long February is, so
 * `2026-02-30T10:00:00Z` is accepted and `Date.parse` silently yields 2026-03-02. Fixing it means
 * a leap-year calculation in `src/http`, and slice 01 already ruled that a second calendar
 * implementation is a risk this design rejects. OQ-02-1 carries it.
 */
const RFC3339_PATTERN =
  '^\\d{4}-\\d{2}-\\d{2}[Tt]\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?([Zz]|[+-]\\d{2}:\\d{2})$';

const BookingBody = Type.Object(
  {
    dealershipId: Type.String({ pattern: UUID_PATTERN }),
    customerId: Type.String({ pattern: UUID_PATTERN }),
    vehicleId: Type.String({ pattern: UUID_PATTERN }),
    serviceTypeId: Type.String({ pattern: UUID_PATTERN }),
    startsAt: Type.String({ pattern: RFC3339_PATTERN }),
  },
  {
    additionalProperties: false,
    description:
      'A booking request. There is deliberately no end time: the interval is derived from the ' +
      "service type's duration (AC-6).",
  },
);

type BookingBodyType = Static<typeof BookingBody>;

const AppointmentParams = Type.Object(
  { id: Type.String({ pattern: UUID_PATTERN }) },
  { additionalProperties: false },
);

type AppointmentParamsType = Static<typeof AppointmentParams>;

/**
 * The ONE body shape the `201` and the `200` both return — `AppointmentView` from
 * `src/application/bookAppointment.ts`, restated here as a schema because a schema is what the
 * edge owes ADR-0005's OpenAPI emitter.
 *
 * `status` is a UNION OF LITERALS and not `Type.Literal('confirmed')`. Measured: a single literal
 * SUBSTITUTES the constant for whatever the handler computed, so slice 05's cancellation test
 * would be unable to fail. The union enforces without substituting.
 */
const AppointmentBody = Type.Object(
  {
    id: Type.String(),
    dealershipId: Type.String(),
    customerId: Type.String(),
    vehicleId: Type.String(),
    serviceTypeId: Type.String(),
    technicianId: Type.String(),
    bayId: Type.String(),
    startsAt: Type.String(),
    endsAt: Type.String(),
    status: Type.Union([Type.Literal('confirmed'), Type.Literal('cancelled')]),
  },
  { additionalProperties: false, description: 'A confirmed or cancelled appointment.' },
);

/**
 * `500` is ABSENT on purpose — see the file docblock. Adding it here would give the catch-all a
 * dependency it cannot afford.
 */
const PROBLEM_RESPONSES = {
  400: ProblemSchema,
  404: ProblemSchema,
  409: ProblemSchema,
  422: ProblemSchema,
} as const;

export function registerAppointmentRoutes(
  app: FastifyInstance,
  deps: AppointmentRouteDeps,
): void {
  app.post<{ Body: BookingBodyType }>(
    '/appointments',
    { schema: { body: BookingBody, response: { 201: AppointmentBody, ...PROBLEM_RESPONSES } } },
    async (request, reply) => {
      const body = request.body;
      const outcome = await deps.bookAppointment({
        dealershipId: body.dealershipId,
        customerId: body.customerId,
        vehicleId: body.vehicleId,
        serviceTypeId: body.serviceTypeId,
        // The pattern above guarantees an explicit offset, so this names an instant and not a
        // wall clock. `instant()` refuses the `NaN` a pattern-valid-but-unparseable value gives.
        startsAtMillis: Date.parse(body.startsAt),
      });

      switch (outcome.kind) {
        case 'confirmed':
          return await reply.code(201).send(outcome.appointment);

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

        case 'vehicle-not-owned':
          // ADR-0002: validation, not authorisation. A 403 would say the caller may not do this;
          // the truth is that this vehicle and this customer are not a pair.
          return await sendProblem(
            reply,
            problem('/problems/vehicle-not-owned', 422, 'The vehicle is not this customer\'s', {
              detail: 'the named vehicle does not belong to the named customer',
            }),
          );

        case 'no-capacity':
          return await sendProblem(
            reply,
            problem('/problems/no-capacity', 409, 'No bay and technician are both free', {
              resource: outcome.resource,
              detail: `every candidate ${outcome.resource} was already occupied for this interval`,
            }),
          );

        case 'no-verdict':
        case 'reference-data-invalid':
          // TWO OUTCOMES, ONE TAXONOMY ROW, deliberately. Both are the system's fault rather than
          // the client's, so they render identically; they stay separate in `BookOutcome` so this
          // switch still names them apart and the operator's log line can. T-02-9 grew the
          // outcome union by one and §8.6's client contract by nothing.
          return await sendInternal(reply);

        default: {
          const unhandled: never = outcome;
          throw new Error(`unhandled booking outcome ${JSON.stringify(unhandled)}`);
        }
      }
    },
  );

  app.get<{ Params: AppointmentParamsType }>(
    '/appointments/:id',
    {
      schema: {
        params: AppointmentParams,
        response: { 200: AppointmentBody, ...PROBLEM_RESPONSES },
      },
    },
    async (request, reply) => {
      const outcome = await deps.readAppointment(request.params.id);

      switch (outcome.kind) {
        case 'found':
          return await reply.code(200).send(outcome.appointment);

        case 'not-found':
          return await sendProblem(
            reply,
            problem('/problems/appointment-not-found', 404, 'No such appointment', {
              detail: 'no appointment exists with that id',
            }),
          );

        default: {
          const unhandled: never = outcome;
          throw new Error(`unhandled read outcome ${JSON.stringify(unhandled)}`);
        }
      }
    },
  );
}

/**
 * AC-7 names this explicitly: an out-of-hours interval is `400`, NOT `409`. It is a fact about
 * the dealership's schedule, decided by `src/domain/openingHours.ts`, which reads no booking.
 *
 * `opensAt` and `closesAt` are carried when the verdict has them, because "outside opening hours"
 * without the hours is a client that has to guess. The two verdicts that mean broken reference
 * data never reach here — `deriveInterval` routes them to `reference-data-invalid`.
 */
type OutsideOpeningHoursVerdict = Extract<
  BookOutcome,
  { kind: 'outside-opening-hours' }
>['verdict'];

function outsideOpeningHours(verdict: OutsideOpeningHoursVerdict): Problem {
  const extra =
    verdict.kind === 'outside-window'
      ? { opensAt: verdict.opensAt, closesAt: verdict.closesAt }
      : {};
  return problem(
    '/problems/outside-opening-hours',
    400,
    'The requested interval is outside the dealership\'s opening hours',
    { detail: verdict.kind, ...extra },
  );
}

/**
 * The last-resort renderer, and it must not be able to fail. No schema on `500`, and the content
 * type set here rather than by a serialiser that could itself throw.
 */
async function sendInternal(reply: {
  code: (status: number) => { type: (t: string) => { send: (b: unknown) => unknown } };
}): Promise<void> {
  await reply
    .code(500)
    .type(PROBLEM_CONTENT_TYPE)
    .send(
      problem('/problems/internal', 500, 'The request could not be completed', {
        detail: 'the service could not complete this request; the failure has been logged',
      }),
    );
}
