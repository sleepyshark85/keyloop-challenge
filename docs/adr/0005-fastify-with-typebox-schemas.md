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

TC-4 fixes a RESTful HTTP API; TC-5 makes the OpenAPI document a deliverable.
`CLAUDE.md` §3 leaves the framework open. Three forces decide it, and none is throughput:

1. **The contract must not be hand-maintained.** METHODOLOGY §4 places "OpenAPI from route schemas"
   in the *generated* tier. A hand-written contract beside hand-written validation is two sources of
   truth for one fact (P2), and the drift is silent — the harness still passes.
2. **Validation must be declarative and must fail before the domain runs**, so §8.6's split between
   *malformed* (`400`) and *semantically unusable* (`422`) is structural, not a convention.
3. **The framework must be a thin edge.** §2.1 puts correctness in the database and ADR-0008 puts
   policy in a pure domain module; a framework that also owns DI and module boundaries competes with
   `dependency-cruiser` (TC-7) for layering authority.

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
  - **Bad, and decisively: the OpenAPI document would be hand-authored**
    — the written tier, and the P2 drift. Every bolt-on avoiding it is Option A reassembled
    with less type safety.
  - Bad, because response serialisation is untyped
- **Option C — Hono** with `@hono/zod-openapi`. The closest runner-up.
  - Good, because `@hono/zod-openapi` genuinely generates the document from the schemas
  - Bad, because Hono's centre of gravity is edge and Workers runtimes; on Node its `pg`, `pino`
    and OpenTelemetry stories are "works, with assembly", and TC-8 makes instrumentation a constraint
  - Bad, because Zod schemas must be converted to JSON Schema
- **Option D — NestJS** with `@nestjs/swagger` decorators.
  - Good, because it imposes a module structure and DI out of the box
  - Bad, because its module system is a second answer to "what is a layer" alongside
    `dependency-cruiser`, which TC-7 makes the authority. Two answers is worse than either.
  - Bad, because the decorator-and-DI ceremony is a large fraction of the codebase for four
    endpoints
  - Bad, because its swagger output is driven by decorators that are separate from the validation
    pipes
- **Option E — `node:http`** directly, hand-rolled routing and validation.
  - Good, because it has no dependencies and nothing is hidden.
  - Bad, because routing, body parsing, schema validation, serialisation, error rendering and
    OpenAPI emission would all be hand-written
  - Bad, because hand-rolled infrastructure is the thing a reviewer must read most carefully

## Decision

Chosen option: **Option A — Fastify with TypeBox route schemas.**

- Every route declares `schema: { body, params, querystring, response }` as **TypeBox** types.
  Those *are* JSON Schema and TypeScript types at once: one place states a field's shape.
- The OpenAPI document is **emitted at build time from the running route table** into
  `docs/api/openapi.json`, and CI fails if the committed file differs.
- Schema failure is the `400` of §8.6, produced by Fastify's error hook before any handler runs.
- No security scheme is published, per ADR-0002 / GC-2. The absence is a statement in the contract.
- The HTTP layer may not reach the database: `.dependency-cruiser.js` forbids `src/http` →
  `src/persistence`, and `pg`/`kysely` outside it (ADR-0008).

## Consequences

**Good**

- The OpenAPI document cannot drift from the implementation, because it is not written.
- 400 versus 422 is a structural distinction — schema layer versus domain layer
- Fastify's hook model gives one place to attach the request span and the `pino` child logger
  bound to the trace id (TC-8, §8.4), and one `setErrorHandler` for RFC 9457.
- Fastify ships `pino` as its logger, so §1.2 goal 4's log correlation is the default
  rather than an integration.

**Bad, or deferred**

- TypeBox is a second thing to learn beside Fastify, and its type-level machinery produces
  unreadable compiler errors when a schema is malformed.
- `@fastify/swagger`'s output is only as good as the schemas; a route with a loose response schema
  produces a loose contract and nothing detects it — mitigated because they also serialise.
- Fastify's plugin encapsulation is a second scoping mechanism beside the module layering of
  ADR-0008, used only for wiring.
