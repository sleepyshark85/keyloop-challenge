---
id: "0005"
title: Use Fastify with TypeBox route schemas, and generate the OpenAPI document from them
status: accepted
date: 2026-09-04
supersedes: null
superseded_by: null
arc42: ["§4.2", "§5.2", "§7", "§8.6"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  ACCEPTED as recommended at Gate B on 2026-09-04, unmodified.
  Proposed by the architect at Gate B. `CLAUDE.md` §3
  reserves the HTTP framework to the architect, so this is the architect's
  recommendation in full rather than a summary of one. The deciding argument is not
  performance — it is that METHODOLOGY §4 places the OpenAPI document in the
  *generated* tier, and only a schema-first framework can put it there.
---

## Context and problem statement

Someone changes a field on the booking request. The route works, the tests pass, the harness passes
— and the published OpenAPI document now describes a system that no longer exists. The API and that
document are both fixed deliverables; the framework carrying them is open, and three forces decide
it, none of them throughput:

1. **The contract must not be hand-maintained.** Hand-written beside hand-written validation it is a
   second source of truth, and the drift is silent. The documentation rules put "OpenAPI from route
   schemas" in the *generated* tier, and only a schema-first framework can put it there.
2. **Validation must be declarative and must fail before the domain runs**, so the taxonomy's split
   between *malformed* (`400`) and *semantically unusable* (`422`) is structural rather than a
   convention.
3. **The framework must be a thin edge.** Correctness lives in the database, policy in a pure domain
   module; a framework owning injection and module boundaries would compete with
   `dependency-cruiser` for layering authority.

## Considered options

- **Option A — Fastify**, with TypeBox schemas on every route and `@fastify/swagger` emitting the
  OpenAPI document from those same schemas. **Chosen.**
  - Good, because one schema declaration serves validation, typing, serialisation and the contract
  - Good, because it is a thin edge
  - Good, because `pino` and OpenTelemetry integration are first-class
  - Bad, because TypeBox's error messages are poor
  - Bad, because Fastify's JSON-Schema dialect support lags the spec
- **Option B — Express (5.x)** with a validation middleware (`zod`/`ajv`) and a separately authored
  OpenAPI document.
  - Good, because it is the most widely understood option
  - **Bad, and decisively: the OpenAPI document would be hand-authored** — written, not generated,
    and free to drift. Every bolt-on avoiding that is Option A with less type safety.
  - Bad, because response serialisation is untyped
- **Option C — Hono** with `@hono/zod-openapi`. The closest runner-up.
  - Good, because `@hono/zod-openapi` genuinely generates the document from the schemas
  - Bad, because Hono's centre of gravity is edge and Workers runtimes; on Node its `pg`, `pino`
    and OpenTelemetry stories are "works, with assembly", and instrumentation is a constraint
  - Bad, because Zod schemas must be converted to JSON Schema
- **Option D — NestJS** with `@nestjs/swagger` decorators.
  - Good, because it imposes a module structure and DI out of the box
  - Bad, because its module system is a second answer to "what is a layer" alongside
    `dependency-cruiser`. Two answers is worse than either.
  - Bad, because the decorator-and-DI ceremony is a large fraction of a four-endpoint codebase
  - Bad, because its swagger output is driven by decorators that are separate from the validation
    pipes
- **Option E — `node:http`** directly, hand-rolled routing and validation.
  - Good, because it has no dependencies and nothing is hidden.
  - Bad, because routing, body parsing, validation, serialisation, error rendering and OpenAPI
    emission would all be hand-written
  - Bad, because hand-rolled infrastructure is what a reviewer must read most carefully

## Decision

Chosen option: **Option A — Fastify with TypeBox route schemas.**

- Every route declares `schema: { body, params, querystring, response }` as **TypeBox** types,
  which *are* JSON Schema and TypeScript types at once: one place states a field's shape.
- The OpenAPI document is **emitted at build time from the running route table** into
  `docs/api/openapi.json`, and CI fails if the committed file differs.
- Schema failure is the taxonomy's `400`, produced by Fastify's error hook before any handler runs.
- No security scheme is published: authentication is out of scope, and the absence is a statement
  in the contract.
- The HTTP layer may not reach the database: `.dependency-cruiser.js` forbids `src/http` →
  `src/persistence`, and `pg`/`kysely` outside persistence.

## Consequences

**Good**

- The OpenAPI document cannot drift from the implementation, because it is not written.
- 400 versus 422 is a structural distinction — schema layer versus domain layer
- Fastify's hook model gives one place to attach the request span and the trace-bound `pino` child
  logger, and one `setErrorHandler` for RFC 9457.
- Fastify ships `pino`, so correlating a log line to a trace is a default rather than an
  integration.

**Bad, or deferred**

- TypeBox is a second thing to learn beside Fastify, and produces unreadable compiler errors when a
  schema is malformed.
- `@fastify/swagger`'s output is only as good as the schemas: a loose response schema produces a
  loose contract and nothing detects it — mitigated because schemas also serialise.
- Fastify's plugin encapsulation is a second scoping mechanism beside the module layering, used
  only for wiring.
