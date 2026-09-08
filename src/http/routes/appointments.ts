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
import { problem, problemResponse, sendProblem } from '../problem.js';
import type { Problem } from '../problem.js';
import type { BookCommand, BookOutcome } from '../../application/bookAppointment.js';
import type { ReadOutcome } from '../../application/readAppointment.js';
import type { CancelOutcome } from '../../application/cancelAppointment.js';
import type { RescheduleCommand, RescheduleOutcome } from '../../application/rescheduleAppointment.js';
import type { OpeningHoursVerdict } from '../../domain/openingHours.js';

export interface AppointmentRouteDeps {
  readonly bookAppointment: (command: BookCommand) => Promise<BookOutcome>;
  readonly readAppointment: (id: string) => Promise<ReadOutcome>;
  /**
   * Slice 05. Its outcome is a union of its OWN, not `ReadOutcome`, although the two are
   * structurally identical today: a member added for one route must not silently change the
   * other route's exhaustiveness check (§5.2).
   */
  readonly cancelAppointment: (id: string) => Promise<CancelOutcome>;
  /**
   * Slice 06. ITS OWN union too, for the same reason — `RescheduleOutcome` has members none of
   * the other three do (`not-confirmed`, a `no-capacity` reachable via re-allocation) and none
   * of theirs (no `confirmed`, no `vehicle-not-owned`).
   */
  readonly rescheduleAppointment: (command: RescheduleCommand) => Promise<RescheduleOutcome>;
}

/** Exported for `routes/availability.ts` (slice 08): one pattern, so the two routes cannot drift. */
export const UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

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
 *
 * Exported for `routes/availability.ts`: `from`/`to` are RFC 3339 instants too, and a second
 * hand-copied literal is how the two routes' notion of "a valid instant" would drift apart.
 */
export const RFC3339_PATTERN =
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

/**
 * `PATCH /appointments/{id}` — design §3. `startsAt` ONLY: `additionalProperties: false` is what
 * strips a bay or technician the client names, before the handler ever runs — AC-6's structural
 * argument, reused rather than re-argued. There is no end time here either, for the same reason
 * `BookingBody` has none: the interval's length is the appointment's service type's, and a move
 * cannot change it (this slice's own "Out of scope").
 */
const RescheduleBody = Type.Object(
  { startsAt: Type.String({ pattern: RFC3339_PATTERN }) },
  {
    additionalProperties: false,
    description:
      'A reschedule request. Only startsAt: the interval\'s length, dealership, service type, ' +
      'customer and vehicle are all unchanged by a move.',
  },
);

type RescheduleBodyType = Static<typeof RescheduleBody>;

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
 *
 * FOUR SEPARATE MAPS, ONE PER OPERATION (`10-design.md` §1's transposed matrix), because the
 * four operations below no longer share one taxonomy-wide `type` set at each status: `book`'s
 * `409` is `no-capacity` alone, `reschedule`'s is that plus `appointment-not-confirmed`, and
 * neither `read` nor `cancellation` has a `409` at all. `problemResponse()` narrows each cell to
 * exactly the `type` values that operation can produce (AC-1, AC-2).
 */
const BOOK_RESPONSES = {
  400: problemResponse('/problems/malformed-request', '/problems/outside-opening-hours'),
  409: problemResponse('/problems/no-capacity'),
  422: problemResponse('/problems/unknown-reference', '/problems/vehicle-not-owned'),
} as const;

const READ_RESPONSES = {
  400: problemResponse('/problems/malformed-request'),
  404: problemResponse('/problems/appointment-not-found'),
} as const;

const CANCEL_RESPONSES = {
  400: problemResponse('/problems/malformed-request'),
  404: problemResponse('/problems/appointment-not-found'),
} as const;

const RESCHEDULE_RESPONSES = {
  400: problemResponse('/problems/malformed-request', '/problems/outside-opening-hours'),
  404: problemResponse('/problems/appointment-not-found'),
  409: problemResponse('/problems/no-capacity', '/problems/appointment-not-confirmed'),
} as const;

export function registerAppointmentRoutes(
  app: FastifyInstance,
  deps: AppointmentRouteDeps,
): void {
  app.post<{ Body: BookingBodyType }>(
    '/appointments',
    { schema: { body: BookingBody, response: { 201: AppointmentBody, ...BOOK_RESPONSES } } },
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
          return await sendProblem(reply, INTERNAL);

        default: {
          const unhandled: never = outcome;
          // Stryker disable next-line all : an exhaustive switch's `never` arm is unreachable
          // by construction (every real member is handled above) and structurally unkillable
          // — there is no input that reaches it, so no mutant on this line can ever be
          // observed by a test (design §2.4, reviewer slice 05/06 — R-06-A). `disable
          // next-line` binds to this line only, so nothing else in this switch loses
          // coverage; a `disable all`/`restore all` pair does NOT restore here because the
          // instrumenter's directive bookkeeping reads leading comments only, and `restore
          // all` written as a block's last statement is a trailing comment of nothing.
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
        response: { 200: AppointmentBody, ...READ_RESPONSES },
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
          // Stryker disable next-line all : see the identical arm above (R-06-A) — unreachable
          // by construction, structurally unkillable, and a single-line directive so nothing
          // else in this switch loses coverage.
          throw new Error(`unhandled read outcome ${JSON.stringify(unhandled)}`);
        }
      }
    },
  );

  /**
   * `POST /appointments/{id}/cancellation` — AC-3, AC-4, and ADR-0003's status transition.
   *
   * A SUB-RESOURCE RATHER THAN `DELETE`, because the appointment remains readable at its own URL
   * afterwards and `DELETE` would misdescribe that. AC-2 is the assertion that it does.
   *
   * It reads NO BODY: `AppointmentParams` is the whole input. It therefore carries no `body`
   * schema, so a request that sends one is not rejected here — an empty or unparseable JSON body
   * is answered by the content-type parser before this route is ever consulted, which is AC-5 and
   * lives in `server.ts`.
   *
   * §8.6 gains no row. Both arms reuse types slice 02 minted, and the `200` is the same
   * `AppointmentBody` the `201` and the `GET` return.
   */
  app.post<{ Params: AppointmentParamsType }>(
    '/appointments/:id/cancellation',
    {
      schema: {
        params: AppointmentParams,
        response: { 200: AppointmentBody, ...CANCEL_RESPONSES },
      },
    },
    async (request, reply) => {
      const outcome = await deps.cancelAppointment(request.params.id);

      switch (outcome.kind) {
        case 'cancelled':
          // 200 and not 201: a cancellation creates nothing, and a replay must be able to answer
          // the same thing twice (AC-3).
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
          // Stryker disable next-line all : see the identical arm above (R-06-A) — unreachable
          // by construction, structurally unkillable, and a single-line directive so nothing
          // else in this switch loses coverage.
          throw new Error(`unhandled cancel outcome ${JSON.stringify(unhandled)}`);
        }
      }
    },
  );

  /**
   * `PATCH /appointments/{id}` — ADR-0025, ADR-0026, ADR-0027; design §3.
   *
   * A move, never a cancel-plus-book: the SAME resource, the same URL, the same schema the
   * `201`, the `GET` and the cancellation `200` all render through — `AppointmentBody` — so a
   * client parses one thing regardless of which route answered.
   *
   * THE RULED CONSEQUENCE (ADR-0025 decision 4), recorded at the one place a reviewer would
   * otherwise have to reconstruct it: `not-confirmed` and `outside-opening-hours` are both
   * reachable from a single doubly-invalid request, and the use case decides which — this
   * `switch` only renders what it is handed, in the order the union happens to be written, which
   * is why the ORDER OF THESE ARMS ASSERTS NOTHING. The order that matters is inside
   * `rescheduleAppointment`.
   */
  app.patch<{ Params: AppointmentParamsType; Body: RescheduleBodyType }>(
    '/appointments/:id',
    {
      schema: {
        params: AppointmentParams,
        body: RescheduleBody,
        response: { 200: AppointmentBody, ...RESCHEDULE_RESPONSES },
      },
    },
    async (request, reply) => {
      const outcome = await deps.rescheduleAppointment({
        id: request.params.id,
        // Same construction as the booking route's: the pattern guarantees an explicit offset,
        // so this names an instant, and `NaN` from a pattern-valid-but-unparseable value is
        // `malformed-instant`'s subject rather than this handler's.
        startsAtMillis: Date.parse(request.body.startsAt),
      });

      switch (outcome.kind) {
        case 'moved':
          // 200, not 201: a move creates nothing and the id survives it (AC-1).
          return await reply.code(200).send(outcome.appointment);

        case 'not-found':
          // §8.6 gains no row: the type slice 02 minted for GET is reused verbatim (AC-5).
          return await sendProblem(
            reply,
            problem('/problems/appointment-not-found', 404, 'No such appointment', {
              detail: 'no appointment exists with that id',
            }),
          );

        case 'not-confirmed':
          // AC-4 — a DIFFERENT type from a contended 409, so a client that cannot retry a
          // terminal appointment is told so distinctly from one it may retry.
          return await sendProblem(
            reply,
            problem(
              '/problems/appointment-not-confirmed',
              409,
              'The appointment is not confirmed',
              { detail: 'only a confirmed appointment can be rescheduled' },
            ),
          );

        case 'malformed-instant':
          return await sendProblem(
            reply,
            problem('/problems/malformed-request', 400, 'The request could not be understood', {
              detail: 'startsAt is not a usable instant',
            }),
          );

        case 'outside-opening-hours':
          // AC-3, and ADR-0025 decision 4's ruled consequence for a doubly-invalid request: this
          // arm is reached whether or not the row is confirmed, because the domain rule runs
          // before the database ever consults the row's status.
          return await sendProblem(reply, outsideOpeningHours(outcome.verdict));

        case 'no-capacity':
          // Reached only when the appointment's OWN pair conflicts and re-allocation also fails
          // (ADR-0027) — the same taxonomy row booking's own no-capacity renders.
          return await sendProblem(
            reply,
            problem('/problems/no-capacity', 409, 'No bay and technician are both free', {
              resource: outcome.resource,
              detail: `every candidate ${outcome.resource} was already occupied for this interval`,
            }),
          );

        case 'no-verdict':
        case 'reference-data-invalid':
          // Both the system's fault, exactly as booking's mirror arm — neither should be
          // reachable by anything a client controls.
          return await sendProblem(reply, INTERNAL);

        default: {
          const unhandled: never = outcome;
          // Stryker disable next-line all : see the identical arm above (R-06-A) — unreachable
          // by construction, structurally unkillable, and a single-line directive so nothing
          // else in this switch loses coverage.
          throw new Error(`unhandled reschedule outcome ${JSON.stringify(unhandled)}`);
        }
      }
    },
  );
}

/**
 * AC-7 (booking) and AC-3 (reschedule) name this explicitly: an out-of-hours interval is `400`,
 * NOT `409`. It is a fact about the dealership's schedule, decided by `src/domain/openingHours.ts`,
 * which reads no booking — and it is the SAME domain rule both routes render, not a second copy
 * of it (design §1), which is why this takes `OpeningHoursVerdict` directly rather than a type
 * extracted from either use case's own outcome union.
 *
 * `opensAt` and `closesAt` are carried when the verdict has them, because "outside opening hours"
 * without the hours is a client that has to guess. The two verdicts that mean broken reference
 * data never reach here — `deriveInterval` routes them to `reference-data-invalid`.
 */
function outsideOpeningHours(verdict: OpeningHoursVerdict): Problem {
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
 * The last-resort body, built once through the same constructor every other row uses.
 *
 * It tells the client nothing it could act on, deliberately: both outcomes that reach it are the
 * SYSTEM's fault, and the SQLSTATE, the constraint name and the dealership id go to the log where
 * the person who can act on them will look. `server.ts` renders the identical document for an
 * escaped exception, so §8.6's `500 | Anything else` row reads the same however it is reached.
 */
const INTERNAL = problem('/problems/internal', 500, 'The request could not be completed', {
  detail: 'the service could not complete this request; the failure has been logged',
});
