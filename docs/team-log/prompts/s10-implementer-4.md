# Prompt · slice 10 · implementer · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Register Swagger UI at /documentation
- Sent: 2026-09-08T14:29:33.371Z

---

# Serve the OpenAPI documentation from the service — `@fastify/swagger-ui`

Working directory `/home/agentadmin/sources/keyloop-challenge`, **branch `main`**. Pull first. The project is complete — eleven slices merged, tree green. This is a post-close addition the human has asked for directly.

**`@fastify/swagger-ui@6.1.1` is already installed** (`package.json`, saved). `@fastify/swagger@9.8.1` was already there generating the document. Your job is to register the UI and tell me what it costs.

## What to do

Register `@fastify/swagger-ui` in `src/http/server.ts` at `routePrefix: '/documentation'`, alongside the existing `fastifySwagger` registration. `server.ts`'s docblock already explains why swagger is registered unconditionally and notes *"that is `@fastify/swagger-ui`'s job, not used"* — that comment is now false and is yours to correct.

Mind the registration-order comment already in that file: both `.register()` calls are deliberate and measured, and swagger's hook must be attached before routes are added. Do not disturb that ordering; add to it.

## The question I actually need answered, and it decides the rest of the work

**Do the UI's routes appear in the emitted `docs/api/openapi.json`?**

`tests/contract/openapi-document.test.ts` asserts `EXPECTED_PAIRS`' key set **equals** the `(method, path)` set in `doc.paths` — added yesterday as `R-10-3` precisely so a new operation cannot be added and silently skipped. So:

- **If the UI routes do not appear** (likely — they carry no schema, and `@fastify/swagger` documents schema-bearing routes), then nothing breaks, the contract stays as it is, and this is a three-line change.
- **If they do appear**, the contract test goes red and `EXPECTED_PAIRS` plus §8.6's operations column need the new paths. Do not edit `tests/contract/` — that is the test-engineer's, and I will route it.

**Measure it, do not reason about it.** Run `npm run docs:openapi` and diff `docs/api/openapi.json`. That is the same file AC-7 checks byte for byte, so if it changes, `npm run docs:openapi -- --check` is what will tell you.

## Verify

- `npm run build`, `npx vitest run --project nodb`, `npx depcruise` — green.
- Boot the service and confirm `/documentation` actually serves the UI and `/documentation/json` the document. **The service must be running against a live database**; use `docker compose up -d` and `DATABASE_URL=postgresql://keyloop:keyloop@127.0.0.1:5432/keyloop npm start`, and tear down what you start.
- Run `npm run docs:openapi -- --check` and report whether it passes or fails.
- `npm run test:tools`.

## Discipline

- `src/`, `tests/unit/`, `package.json`, `docs/api/openapi.json` are yours. **Not `tests/contract/`, not `docs/arc42/`.**
- Small commit, `feat: `, **explicit pathspecs**. Push to `main` only if everything you own is green; if the contract test goes red, **push nothing and tell me** — the test-engineer's half has to land in the same change.

## Return

The structured report, and specifically: **whether the emitted document changed, whether `docs:openapi --check` passes, and exactly which paths appeared if any.** That determines whether this is done or whether two more roles are needed.
