---
id: "0011"
title: Treat /health as an operational probe outside the API contract, not as a sixth operation
status: proposed
date: 2026-09-04
supersedes: null
superseded_by: null
arc42: ["§5.2", "§8.6"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  Raised by the architect at step 1 of slice 00a, unprompted, on finding that ADR-0005 to ADR-0010
  settle every other question the walking skeleton asks but not this one. Recommended as written
  below — /health outside the RFC 9457 taxonomy, outside the emitted OpenAPI document, and outside
  the business span hierarchy. AWAITING the human's ruling at slice 00a's gate; if it is refused,
  the alternative is Option B and the cost is one problem type and one contract entry, both of which
  are cheap to add and expensive to remove once a client depends on them.
---

## Context and problem statement

Slice 00a adds `GET /health`, the walking skeleton's only endpoint. arc42 §8.6 fixes the
API surface at **five operations** and states that
**errors are RFC 9457 `application/problem+json` with a stable `type` per failure**.
ADR-0005 emits the OpenAPI document *from the route table*, so every route is in the contract
unless excluded, and §8.4 gives every request a span. `/health` fits none of that, and returns
a `503`:

- Is that `503` an RFC 9457 problem document with a `type` of `/problems/…`? §8.6's table has no row
  for it; adding one would put an operational state into a taxonomy whose every entry is a
  *domain* outcome decided by a named module or by PostgreSQL.
- Is `/health` in `docs/api/openapi.json`? ADR-0005 emits from the route table, so by default yes
  — a stubbed client (TC-5) would then see six operations, not §3's five.
- Is a health probe a traced business operation? Under load a probe every few seconds would
  dominate the traces.

Small, but a **fork with three downstream consequences** — slices 03, 09 and 10 — and answering it
three times is how the answers come out different. Plainly: **is `/health` part of the API, or of
the machinery that runs it?**

## Considered options

- **Option A — an operational probe, outside the contract.**
  **Chosen.**
  - Good, because §8.6's taxonomy stays uniform
  - Good, because the emitted contract keeps matching §3's five operations
  - Good, because the probe body can evolve freely
  - Bad, because the service now has two response conventions
  - Bad, because the exclusion from OpenAPI is unenforced until slice 10.
- **Option B — a sixth operation, inside the contract.**
  `503` as `problem+json` with `type: /problems/service-degraded`.
  - Good, because there is exactly one error convention
  - Good, because the probe is documented
  - Bad, because `/problems/service-degraded` sits in a table whose other seven rows are decided
    by a domain module, appointment status or SQLSTATE.
  - Bad, because it puts an operator concern into a client contract
- **Option C — split: `/health` (liveness, no dependencies) and `/ready`** (readiness, checks the
  database).
  - Good, because it is the correct long-run shape
  - Good, because liveness stops depending on PostgreSQL
  - Bad, because nothing in §7's deployment reads either signal
  - Bad, because it doubles the surface
  - Deferred rather than rejected: superseding this ADR is the route back
- **Option D — no endpoint; connectivity is observed from logs and metrics only.**
  - Good, because it adds no surface at all
  - Bad, because AC-2 of slice 00a requires the endpoint
  - Bad, because §1.4 and §3.1 give the operator *"can tell whether it is healthy"*
  - Bad, because the walking skeleton would then have no endpoint

## Decision

Chosen option: **Option A — `/health` is an operational probe outside the API contract.**

The body is one shape on both codes, not `problem+json`; `200` for `ok`, `503` for `degraded`:

```json
{ "status": "ok" | "degraded", "checks": { "database": "up" | "down" } }
```

A degraded probe is not a failed *request*, which is what RFC 9457 reports.
So **§8.6's status table does not grow a row**: every row there names the component deciding the
failure; a TCP timeout is not one. It is **excluded from the emitted OpenAPI document** at
slice 10, and is **not a business span**: out of §8.4's hierarchy and `booking_*`.

The route still crosses every layer. Outside the *contract* is not licence to be outside the
*architecture*: `http-must-not-reach-persistence` applies unchanged
— the walking skeleton's one endpoint traverses the real path.

Option C is rejected **for now, not on principle**: §7 has no orchestrator, so a second endpoint
would be scaffolding for a deployment model §11.3 defers.

## Consequences

**Good**

- §8.6's taxonomy keeps the property that makes it worth testing (QS-11)
- The emitted contract keeps saying *five operations*
- Slices 03, 09 and 10 inherit an answer
- The probe stays cheap to change: nothing external is promised about its body

**Bad, or deferred**

- **Two response conventions in one service.** A reader meeting `/health` first will see plain JSON
- **Nothing enforces exclusion from the OpenAPI document** until slice 10
  writes its test. Until then it is prose; §11 records that.
- **The `503` has no machine-readable failure type**
  — `checks` is the discriminator, and a better-shaped one for a probe than a URI.
- **Liveness is unavailable.** With one endpoint that touches the database, a service that is
  running but cannot reach PostgreSQL reports `503`. Harmless in §7; Option C is the remedy.
