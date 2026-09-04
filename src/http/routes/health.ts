/**
 * `GET /health` — an operational probe, and the one route in this slice.
 *
 * It is deliberately the endpoint that crosses every layer: a walking skeleton whose
 * single route short-circuits the layering proves nothing about the layering. The chain is
 *
 *   route → application/checkHealth → persistence/pingDatabase → `select 1`
 *
 * and nothing about `pg`, SQLSTATE or a connection reaches this file. The status code is
 * decided by a `switch` over a union declared in `src/application`, which is what makes it
 * compiler-checked rather than convention: `http-must-not-reach-persistence` forbids this
 * layer from even naming the database handle's type, so there is no other shape available.
 *
 * The `never` in the default branch is the exhaustiveness check. Two members today; the
 * point of writing it now is that member three cannot be added without the compiler
 * pointing here (arc42 §8.6 has this shape for the five business operations).
 */
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import type { HealthOutcome } from '../../application/checkHealth.js';

/** The route's only dependency. Declared here rather than imported from `server.ts` so the
 *  edge has no import cycle — `no-circular` sees type-only edges too. */
export interface HealthRouteDeps {
  readonly checkHealth: () => Promise<HealthOutcome>;
}

/**
 * Both bodies are the same SHAPE on both codes, so a client parses one thing (design §3).
 * They are TypeBox `response` schemas per ADR-0005: validated on the way out, and already
 * in the form slice 10's OpenAPI emitter reads.
 */
const OkBody = Type.Object(
  {
    status: Type.Literal('ok'),
    checks: Type.Object({ database: Type.Literal('up') }, { additionalProperties: false }),
  },
  { additionalProperties: false, description: 'The service and its database are both up.' },
);

const DegradedBody = Type.Object(
  {
    status: Type.Literal('degraded'),
    checks: Type.Object({ database: Type.Literal('down') }, { additionalProperties: false }),
  },
  {
    additionalProperties: false,
    description: 'The service is up; the database did not answer within the connection timeout.',
  },
);

export function registerHealthRoute(app: FastifyInstance, deps: HealthRouteDeps): void {
  app.get(
    '/health',
    { schema: { response: { 200: OkBody, 503: DegradedBody } } },
    async (_request, reply) => {
      const outcome = await deps.checkHealth();

      switch (outcome.kind) {
        case 'ok':
          return await reply.code(200).send({ status: 'ok', checks: { database: 'up' } });
        case 'degraded':
          return await reply
            .code(503)
            .send({ status: 'degraded', checks: { database: 'down' } });
        default: {
          const unhandled: never = outcome;
          throw new Error(`unhandled health outcome ${JSON.stringify(unhandled)}`);
        }
      }
    },
  );
}
