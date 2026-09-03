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

TC-4 fixes a RESTful HTTP API; TC-5 makes the OpenAPI document a deliverable in its own right,
because it is the only description of the boundary a reader gets. `CLAUDE.md` §3 leaves the framework
open. Three forces decide it, and none of them is throughput:

1. **The OpenAPI document must not be hand-maintained.** METHODOLOGY §4 sorts documentation into
   generated, enforced and written tiers and places "OpenAPI from route schemas" in the *generated*
   one. A hand-written contract beside hand-written validation is two sources of truth for the same
   fact (P2), and the failure is silent: the document drifts and the harness still passes.
2. **Validation must be declarative and must fail before the domain runs.** §8.6 needs a clean split
   between *malformed* (`400`, schema) and *semantically unusable* (`422`, references) — see ADR-0002
   and A-6. A framework where validation is imperative code inside the handler blurs that line by
   default.
3. **The framework must be a thin edge.** §2.1 puts correctness in the database and ADR-0008 puts
   policy in a pure domain module. The HTTP layer's whole job is parse, dispatch, map the error. A
   framework that also wants to own dependency injection, module boundaries and persistence is
   competing with `dependency-cruiser` (TC-7) for the role of layering authority.

## Considered options

- **Option A — Fastify**, with TypeBox schemas on every route and `@fastify/swagger` emitting the
  OpenAPI document from those same schemas.
- **Option B — Express (5.x)** with a validation middleware (`zod`/`ajv`) and a separately authored
  OpenAPI document.
- **Option C — Hono** with `@hono/zod-openapi`.
- **Option D — NestJS** with `@nestjs/swagger` decorators.
- **Option E — `node:http` directly**, hand-rolled routing and validation.

## Decision

Chosen option: **Option A — Fastify with TypeBox route schemas.**

- Every route declares `schema: { body, params, querystring, response }` as **TypeBox** types.
  TypeBox values *are* JSON Schema and are simultaneously TypeScript types, so one declaration gives
  runtime validation, compile-time handler typing, response serialisation and the OpenAPI document.
  There is exactly one place a field's shape is stated.
- The OpenAPI document is **emitted at build time from the running route table** into
  `docs/api/openapi.json`, and CI fails if the committed file differs from the emitted one. This is
  what puts the contract in the generated tier rather than the written one.
- Schema failure is the `400` of §8.6, produced by Fastify's error hook before any handler runs.
  Everything past that point is a domain outcome.
- No security scheme is published, per ADR-0002 / GC-2. The absence is a statement in the contract.
- The HTTP layer may not reach the database: `.dependency-cruiser.js` forbids `src/http` → `src/persistence`
  and forbids importing `pg`/`kysely` outside `src/persistence` (ADR-0008).

## Consequences

**Good**

- The OpenAPI document cannot drift from the implementation, because it is not written.
- `400` versus `422` is a structural distinction — schema layer versus domain layer — not a
  convention an implementer has to remember (§8.6).
- Fastify's hook model gives one place to attach the request span and the `pino` child logger bound
  to the trace id (TC-8, §8.4), and one `setErrorHandler` to render RFC 9457 `application/problem+json`.
- Fastify ships `pino` as its logger, so §1.2 goal 4's log correlation is the default rather than an
  integration.

**Bad, or deferred**

- TypeBox is a second thing to learn beside Fastify, and its type-level machinery produces
  famously unreadable compiler errors when a schema is malformed.
- `@fastify/swagger`'s output is only as good as the schemas; a route with a loose `response` schema
  produces a loose contract, and nothing detects that. The mitigation is that response schemas are
  also used for serialisation, so a loose one is visible in the response body.
- Fastify's plugin encapsulation is a second scoping mechanism beside the module layering of
  ADR-0008. It is used only for wiring (registering routes, decorating the instance), never to
  express architecture — but the temptation exists and a reviewer should watch for it.

## Pros and cons of the options

### Option A — Fastify + TypeBox

- Good, because one schema declaration serves validation, typing, serialisation and the contract,
  which is the only configuration in which the OpenAPI document can be *generated* (METHODOLOGY §4).
- Good, because it is a thin edge: routes, hooks, an error handler, and nothing that claims authority
  over layering.
- Good, because `pino` and OpenTelemetry integration are first-class and already required by TC-8.
- Bad, because TypeBox's error messages are poor and its generic types are hard to read.
- Bad, because Fastify's JSON-Schema dialect support lags the spec, so an exotic schema construct can
  fail at registration time rather than at review time.

### Option B — Express + validation middleware

- Good, because it is the most widely understood option, so a reader needs no explanation.
- Good, because Express 5 is stable and its middleware model is trivially inspectable.
- **Bad, and decisively: the OpenAPI document would be hand-authored**, which moves the contract from
  the generated tier to the written tier and creates exactly the two-sources-of-truth drift P2 exists
  to prevent. Every bolt-on that avoids this (`express-openapi-validator`, `tsoa`) is really Option A
  reassembled from parts with less type safety.
- Bad, because response serialisation is untyped, so a handler can return a field the contract does
  not mention and nothing complains.

### Option C — Hono + `@hono/zod-openapi`

- Good, because `@hono/zod-openapi` genuinely generates the document from the schemas, so it satisfies
  force 1 as well as Option A does — this is the closest runner-up and it is close.
- Good, because Zod's error messages are far better than TypeBox's.
- Bad, because Hono's centre of gravity is edge and Workers runtimes; on Node its `pg`, `pino` and
  OpenTelemetry auto-instrumentation stories are all "works, with assembly" rather than default. TC-8
  makes instrumentation a constraint, not a nicety, and choosing the option that needs more glue
  there buys nothing the assessment grades.
- Bad, because Zod schemas must be *converted* to JSON Schema to become OpenAPI, so the contract is a
  derivation of a derivation; TypeBox skips a step by being JSON Schema already.

### Option D — NestJS

- Good, because it imposes a module structure and DI out of the box, and `@nestjs/swagger` produces a
  contract from decorators.
- Bad, because its module system is a *second* answer to "what is a layer" alongside
  `dependency-cruiser`, which TC-7 makes the authority. Two answers is worse than either.
- Bad, because the decorator-and-DI ceremony is a large fraction of the codebase for four endpoints,
  and it would spend the scarce human review budget (OC-3) on framework wiring rather than on the
  concurrency path the assessment grades.
- Bad, because its swagger output is driven by decorators that are *separate* from the validation
  pipes, so the contract and the validation can disagree — the very drift Option B is rejected for.

### Option E — `node:http` directly

- Good, because it has no dependencies and nothing is hidden.
- Bad, because routing, body parsing, schema validation, serialisation, error rendering and OpenAPI
  emission would all be hand-written — several hundred lines of infrastructure carrying real bugs, in
  a submission whose interesting risk is elsewhere entirely.
- Bad, because hand-rolled infrastructure is the thing a reviewer must read most carefully and learns
  least from.
