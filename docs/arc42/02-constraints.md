# 2. Architecture constraints

> Owner: architect · Written: phase 1 · Gate A

## 2.1 Standing invariants

Decided before the architecture, and not open to relitigation. Full statements in `CLAUDE.md` §2.

| Constraint | Consequence |
|---|---|
| Double-booking is prevented by a PostgreSQL exclusion constraint, never by application code | Check-then-act is forbidden; the service maps SQLSTATE `23P01` to `409 Conflict` |
| Tests asserting persistence run against real PostgreSQL via Testcontainers | No SQLite, no in-memory repository, no mocked database |
| Layering is enforced by `dependency-cruiser` in CI | Conformance is a build failure, not a reviewer's opinion |
| Every slice begins with a failing acceptance test, committed red by a different author | A test that has never failed is not evidence |

## 2.2 Technical constraints

*Stack, runtime, and anything imposed rather than chosen. Choices made freely belong in §4 with an ADR.*

## 2.3 Organisational constraints

*Assessment scope and the time budget. Backend only; the client layer is stubbed with an OpenAPI
contract and a cURL harness.*
