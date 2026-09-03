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

Slice 00a adds `GET /health`, the first and — until slice 02 — only endpoint. arc42 §8.6 fixes the
API surface at **five operations** (book, read, reschedule, cancel, availability) and states that
**errors are RFC 9457 `application/problem+json` with a stable `type` per failure**. ADR-0005 states
that the OpenAPI document is *emitted from the running route table*, so every registered route is in
the contract unless something excludes it. §8.4 gives every request a span.

`/health` fits none of those statements comfortably, and it returns a `503`:

- Is that `503` an RFC 9457 problem document with a `type` of `/problems/…`? §8.6's table has no row
  for it, and adding one would put an operational state into a taxonomy whose every other entry is a
  *domain* outcome decided by a named module or by PostgreSQL.
- Is `/health` in `docs/api/openapi.json`? ADR-0005 emits from the route table, so by default yes —
  and a stubbed client (TC-5) would then see six operations where §3 describes five.
- Is a health probe a traced business operation? Under load a probe every few seconds would dominate
  the trace count and the `booking_*` metrics' surrounding context.

This is not a large decision, but it is a **fork with three downstream consequences** — in slices 03
(error taxonomy), 09 (observability) and 10 (OpenAPI and the cURL harness) — and answering it three
times independently is how the answers come out different. It is settled by none of ADR-0005 to
ADR-0010, which is why it is recorded rather than chosen inline in a slice design.

The question stated plainly: **is `/health` part of the API this system offers, or part of the
machinery that runs it?**

## Considered options

- **Option A — an operational probe, outside the contract.** Plain JSON body on both `200` and `503`;
  not in the emitted OpenAPI document; not a business span; no `/problems/…` type.
- **Option B — a sixth operation, inside the contract.** `503` rendered as `application/problem+json`
  with `type: /problems/service-degraded`; a row in §8.6's status table; present in the OpenAPI
  document and in the cURL harness; traced like any other request.
- **Option C — split: `/health` (liveness, no dependencies) and `/ready` (readiness, checks the
  database)**, as METHODOLOGY §352 sketches; the readiness probe carries the `503`.
- **Option D — no endpoint; connectivity is observed from logs and metrics only.**

## Decision

Chosen option: **Option A — `/health` is an operational probe outside the API contract.**

Concretely, and these five points are the decision:

1. **The body is the same shape on both codes**, and it is not `problem+json`:
   `{ "status": "ok" | "degraded", "checks": { "database": "up" | "down" } }`, `200` when
   `status` is `ok` and `503` when it is `degraded`. A degraded probe is not a failed *request* — the
   request succeeded and its answer is bad news — and RFC 9457 is for reporting that a request could
   not be fulfilled.
2. **§8.6's status table does not grow a row.** Every row in it names the component that decides the
   failure — a domain module, or PostgreSQL. `/health`'s `503` is decided by a `TCP` connect timeout,
   which is not that kind of fact.
3. **It is excluded from the emitted OpenAPI document** when slice 10 wires the emitter. The document
   describes what a client may call; an operator's probe is not that, and TC-5's stubbed client has
   no use for it.
4. **It is not a business span.** Slice 09 may instrument it at whatever level it chooses, but it
   does not join the `availability.candidates` / `appointment.insert` hierarchy of §8.4 and it does
   not touch `booking_*` metrics.
5. **The route still crosses every layer** — `http → application → persistence` — exactly as a
   business operation does. Being outside the *contract* is not licence to be outside the
   *architecture*: `http-must-not-reach-persistence` applies unchanged, and the walking skeleton's
   whole value is that its one endpoint traverses the real path (slice 00a design, §3).

Point 5 is the one that makes this an architecture decision rather than a documentation preference.
It would be easy to read "operational, not a business operation" as permission for the route to open
its own connection and check it. It is not.

Option C is the one that was close, and it is rejected **for now, not on principle**. Liveness and
readiness are genuinely different questions and Kubernetes-style deployments need both — but §7 is
three containers on one machine with no orchestrator, nothing consumes a liveness signal, and a
second endpoint whose only reader is a document would be scaffolding for a deployment model §11.3
explicitly defers. If the deployment model changes, this ADR is superseded and the split arrives with
the thing that needs it.

## Consequences

**Good**

- §8.6's taxonomy keeps the property that makes it worth testing (QS-11): every entry is a domain
  outcome with a named decider. One operational entry would blur that, and QS-11's exhaustiveness
  assertion would have to carve out an exception.
- The emitted contract keeps saying *five operations*, agreeing with §3 and §8.6 without a caveat.
- Slices 03, 09 and 10 inherit an answer instead of each re-deriving one.
- The probe stays cheap to change: nothing external is promised about its body, so adding
  `checks.migrations` or `checks.telemetry` later breaks no contract test.

**Bad, or deferred**

- **Two response conventions in one service.** A reader meeting `/health` first will see plain JSON
  and may assume it is the house style; §5.2 and this ADR must say otherwise. This is the real cost.
- **Nothing enforces exclusion from the OpenAPI document** until slice 10 writes the emitter and its
  test. Between 00a and 10 the decision is prose. Recorded in §11 rather than pretended otherwise.
- **The `503` has no machine-readable failure type**, so a sophisticated operator client cannot
  distinguish *database down* from *degraded for another reason* except by reading `checks`. Accepted:
  `checks` is that discriminator, and it is a better-shaped one for a probe than a URI would be.
- **Liveness is unavailable.** With one endpoint that touches the database, a service that is running
  but cannot reach PostgreSQL reports `503` and an orchestrator that restarts on `503` would restart
  it pointlessly. Harmless in §7's deployment, and Option C is the documented remedy if that changes.

## Pros and cons of the options

### Option A — an operational probe, outside the contract

- Good, because §8.6's taxonomy stays uniform: every entry a domain outcome with a named decider.
- Good, because the emitted contract keeps matching §3's five operations with no exception to explain.
- Good, because the probe body can evolve freely — no contract test pins it.
- Bad, because the service now has two response conventions, and the one a reader meets first is the
  exception.
- Bad, because the exclusion from OpenAPI is unenforced until slice 10.

### Option B — a sixth operation, inside the contract

- Good, because there is exactly one error convention in the whole service, which is the simplest
  thing to explain and to review.
- Good, because the probe is documented for whoever has to operate the service.
- Bad, because `/problems/service-degraded` sits in a table whose other seven rows are decided by
  `domain/openingHours.ts`, appointment status, or SQLSTATE. QS-11 asserts that table is *total and
  stable*; an operational row makes "total" mean something looser.
- Bad, because it puts an operator concern into a client contract, and TC-5's stubbed client would
  carry an operation no client would ever call.

### Option C — split `/health` (liveness) and `/ready` (readiness)

- Good, because it is the correct long-run shape and the one an orchestrator expects.
- Good, because liveness stops depending on PostgreSQL, so a database outage cannot cause a restart
  loop.
- Bad, because nothing in §7's deployment reads either signal — no orchestrator, no load balancer, no
  restart policy that would consult them (§7.1).
- Bad, because it doubles the surface of the one endpoint in a slice whose purpose is to prove the
  toolchain, and OC-1 bounds scope by what can be demonstrated and defended.
- Deferred rather than rejected: superseding this ADR is the route back to it.

### Option D — no endpoint; observe connectivity from logs and metrics

- Good, because it adds no surface at all and the information is available to anyone with the
  telemetry stack up.
- Bad, because AC-2 of slice 00a requires the endpoint, and acceptance criteria are the human's.
- Bad, because §1.4 and §3.1 give the operator *"can tell whether it is healthy"* as a goal, and
  "attach Grafana" is a poor answer to it.
- Bad, because the walking skeleton would then have no endpoint at all, and nothing would prove the
  layers connect end to end.
