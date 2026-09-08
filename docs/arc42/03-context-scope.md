# 3. Context and scope

> Owner: architect · Written: phase 1 · Gate A

## 3.1 Business context

The system sits alone: human actors, one persistent store, and **no neighbouring systems**. §1.3 names
the stakeholders; this is what crosses the boundary.

| Actor | What crosses |
|---|---|
| **A user** *(primary; the brief's word — the system names no role)* | **In:** a booking request (customer, vehicle, service type, dealership, desired start), a cancellation, or a reschedule. **Out:** a confirmed appointment naming the allocated bay, technician and interval; a refusal naming the unavailable resource once every candidate was tried; or a rejection for an unknown reference (A-6) or a time outside opening hours (GC-1). **A refused move leaves the original confirmed at its original time, and the contract says so** |
| **The same user**, *browsing* | **In:** dealership, service type, window. **Out:** candidate resources, **explicitly advisory** — a slot returned free may be taken by the time it is booked, and the contract says so |
| **Service manager** | **In:** reference data — bays, technicians, qualifications, service types, opening hours, zone — by seed and migration, not across the API (A-7). **Out:** the schedule, by reading appointments |
| **Operator** | **Out:** health and readiness, traces, metrics, structured logs — notably `booking_conflicts_total{resource}`, the invariant made observable |

Nothing crosses for the **customer**, named by `customer_id` *inside* the request, or for the
**technician**, a resource rather than a user. The client layer is stubbed (TC-5):
`docs/api/openapi.json`, emitted from the route schemas, is the contract every actor reaches through,
and `harness/` is a cURL client for the five operations and the contention demo. There are no
neighbouring systems because the brief says *"replace manual booking systems"*, so *"unified"* is one
scheduler across a dealership group (A-9), not one view over several.

## 3.2 Technical context

| Boundary | Protocol and format |
|---|---|
| **Stubbed client → Scheduler API** | HTTP/1.1, JSON bodies, RFC 3339 timestamps with an offset (A-8). Five operations: book, read, cancel, reschedule, availability. `customer_id` is a body field and **no security scheme is published** (GC-2). Published as **OpenAPI**, exercised by a **cURL harness** |
| — *outcomes* | `2xx` with the appointment; **`400`** for a malformed request or one outside opening hours; a `4xx` for an unknown or mismatched reference; **`409`** where every candidate was refused by the database (SQLSTATE `23P01`). Errors are RFC 9457 `application/problem+json`. Out-of-hours stays a `400` deliberately: decidable without reading any booking, so calling it a conflict would corrupt `booking_conflicts_total` as a signal |
| **Scheduler → PostgreSQL** | PostgreSQL wire protocol over TCP, pooled. `timestamptz` columns, `tstzrange` in the exclusion constraint, the `btree_gist` extension (TC-3). Not a generic persistence port: correctness lives on this boundary, so no test may substitute it |
| **Scheduler → telemetry collector** | **OTLP** traces and metrics to a local `grafana/otel-lgtm` container; `pino` JSON on stdout, correlated by trace id. Availability check and insert are separate spans, so the window check-then-act would have raced in is visible in a waterfall |

Transport security, gateways, load balancers and TLS termination are absent: a single local container
(§7). Adding them moves no boundary in this table.

## 3.3 Out of scope

What a system deliberately does not do is part of its design. *Proposed by the architect and ratified at
Gate A.* Items marked **†** are carried into §11.3 as debt, with the cost of adding them. Cancellation,
**rescheduling** and opening-hours validation are all **in** scope.

**By the brief** — any user interface (TC-5); integration with any external system: DMS, CRM, calendar,
parts, warranty. **†**

**By a Gate A ruling** — technician shifts, rotas, holidays, absence and one-off closures **†**, a
per-resource calendar being a *second* availability rule beside the one the constraint enforces;
authentication, authorisation, sessions, rate limiting and per-actor audit (GC-2) **†**; cancellation
*policy* — notice periods, fees, restrictions; appointment history **†**; vehicle-dependent durations
(A-1), buffers (A-4) and search-style booking (A-5). **†**

**As conventional** — CRUD for customers, vehicles, dealerships, bays, technicians, service types and
qualifications (A-7), seed data instead; pagination, filtering and sorting beyond the availability
query's own; notifications; payments, invoicing, estimates, labour times, parts, courtesy vehicles.

**As out of the domain at this size** — waitlists, overbooking, priority jobs and queue-jumping policy,
each a scheduling *policy* question and exactly why none can be done convincingly inside an
assessment **†**; splitting a job across technicians; skill levels; recurring or multi-day jobs;
analytics.

**Operationally** — horizontal scale-out, HA, failover, backup and disaster recovery **†**; migration
from the manual system replaced; GDPR-grade PII handling, retention and data-subject requests **†**,
personal data being limited to a customer name and a vehicle identifier.

Disagreement with any line above is about scope, not architecture, and is resolved by superseding the
ADR that decided it.
