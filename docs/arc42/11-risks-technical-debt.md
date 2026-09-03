# 11. Risks and technical debt

> Owner: architect · Appended throughout

## 11.1 Deferred improvements

Generated: every ADR with `status: proposed` and every deferred-improvement slice is, by
construction, a debt item traceable to the decision that created it.

<!-- generated:debt-register -->
| Item | Origin | Why deferred |
|---|---|---|
| Use Fastify with TypeBox route schemas, and generate the OpenAPI document from them | [ADR-0005](../adr/0005-fastify-with-typebox-schemas.md) | deferred improvement |
| Use Kysely as a typed SQL builder over node-postgres, and adopt no ORM | [ADR-0006](../adr/0006-kysely-as-typed-sql-builder.md) | deferred improvement |
| Run migrations with node-pg-migrate, written as plain .sql files | [ADR-0007](../adr/0007-node-pg-migrate-with-sql-files.md) | deferred improvement |
| Decompose into five layered modules around a dependency-free policy core | [ADR-0008](../adr/0008-module-decomposition.md) | deferred improvement |
| Order candidates by a seeded shuffle, prune by the constraint that fired, and cap attempts at 16 | [ADR-0009](../adr/0009-candidate-ordering-and-attempt-cap.md) | deferred improvement |
<!-- /generated:debt-register -->

## 11.2 Known risks

## 11.3 What production would additionally require

*Named honestly. Scope that was cut deliberately is judgement; scope that was cut silently is a gap.*
