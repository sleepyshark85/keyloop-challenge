# 3. Context and scope

> Owner: architect · Written: phase 1 · Gate A

*The context diagram is drawn in phase 2 with the rest of the presentation diagrams (METHODOLOGY §4);
this section is the text it will illustrate.*

## 3.1 Business context

The system sits alone: human actors, one persistent store, and **no neighbouring systems** — the single
most consequential fact about the context, justified in §3.1.2 rather than left as an omission.

### 3.1.1 Actors

| Actor | Relationship | What crosses the boundary, in domain terms |
|---|---|---|
| **Service advisor** *(primary; ADR-0002, and see A-6)* | Books on a customer's behalf, typically while the customer is on the phone | **In:** a booking request — customer, vehicle, service type, dealership, desired start. **Out:** either a confirmed appointment naming the allocated bay, technician and interval; or a refusal stating which resource was unavailable, once every candidate has been tried (ADR-0004); or a rejection, if the request is invalid — an unknown or mismatched reference (A-6), or a time outside the dealership's opening hours (ADR-0001) |
| **Service advisor** *(same actor, changing a booking)* | The customer calls back: the car is not ready to come in, or Tuesday no longer works | **In:** a cancellation, or a reschedule naming an existing appointment and a new desired start (ADR-0003). **Out:** the cancelled or moved appointment — the id is unchanged by a move — or a refusal. A refused move is the interesting outcome and the contract states it: **the original appointment is still confirmed, at its original time** |
| **Service advisor** *(same actor, browsing)* | Looks for a workable slot before committing | **In:** an availability enquiry — dealership, service type, time window. **Out:** candidate intervals and resources, **explicitly advisory**: a slot returned as free may be taken by the time it is booked, and the boundary contract says so. This is the direct consequence of `CLAUDE.md` §2.1 and it is a property of the *domain* interface, not an implementation detail |
| **Customer / vehicle owner** | The party the appointment is for | Nothing crosses. Under ADR-0002 the customer does not touch the system; the advisor acts for them and names them by `customer_id` in the request. They are named here because had the ruling gone the other way they would be an actor and the boundary would change shape — identity would arrive *with* the request rather than inside it |
| **Service manager** | Owns the reference data — bays, technicians, qualifications, service types, and the dealership's opening hours and time zone (ADR-0001) — and reads the day's schedule | **In:** reference data, as seed and migration rather than across the API (A-7). **Out:** the schedule, by reading appointments |
| **Technician** | **A resource, not a user.** Consumed by an appointment, exclusively, for its whole duration (A-2) | Nothing crosses. Recorded because the temptation to model a technician as a user of a scheduling system is strong and would expand the scope considerably |
| **Operator** | Runs and watches the service | **Out:** health and readiness, traces, metrics, structured logs. Notably `booking_conflicts_total{resource}` — the invariant made observable |

### 3.1.2 Why there are no neighbouring systems

The scenario is titled *"The Unified Service Scheduler"*, which reads as though it might federate
existing booking systems. The task text does not support that: *"Build an Appointment Scheduler
application to replace manual booking systems."* What is being replaced is a **manual** process — a
paper diary, a whiteboard, a phone call — so "unified" is read as *one scheduler across a dealership
group* (A-9), not *one view over several schedulers*. Scenario D is the integration scenario.

A production deployment would still have neighbours — a DMS owning customers and vehicles, an identity
provider, a notification service, a parts system. Each is excluded in §3.3 and carried in §11 rather
than quietly ignored, because "no integrations" is a decision with a shelf life.

## 3.2 Technical context

The same boundaries as protocols and formats. There are three.

| Boundary | Direction | Protocol and format | Notes |
|---|---|---|---|
| **Stubbed client → Scheduler API** | inbound | HTTP/1.1, JSON request and response bodies. Timestamps are RFC 3339 with an offset (A-8). Operations: book, cancel, reschedule (ADR-0003), query availability, read an appointment. `customer_id` is a body field and **no security scheme is published** (ADR-0002, GC-2). Contract published as an **OpenAPI** document; exercised by a **cURL harness** (TC-5) | The only interface a reader of this repository can actually see, since there is no UI. It therefore carries the domain vocabulary of §3.1 rather than a persistence-shaped one |
| — *outcomes on that boundary* | outbound | `2xx` with the appointment; **`400 Bad Request`** for a malformed request or one outside the dealership's opening hours (ADR-0001, GC-1); a `4xx` for an unknown or mismatched reference, ownership included (A-6, GC-2); **`409 Conflict`** where every candidate has been refused by the database (SQLSTATE `23P01`, ADR-0004) | The `409` is the invariant surfacing at the boundary, and after ADR-0004 it means *the dealership had nothing free* rather than *we guessed badly*. Keeping the out-of-hours case a `400` is deliberate: it is decidable without reading any booking, so calling it a conflict would corrupt `booking_conflicts_total` as a signal. The error body's media type — RFC 9457 `application/problem+json` is the obvious candidate — is a Gate B choice, not a constraint |
| **Scheduler → PostgreSQL** | outbound | PostgreSQL wire protocol over TCP, pooled. `timestamptz` columns; `tstzrange` in the exclusion constraint; the `btree_gist` extension (TC-3) | Not a generic persistence port. The correctness of the system lives on this boundary, which is why §2.1 forbids substituting it in tests |
| **Scheduler → telemetry collector** | outbound | **OTLP** traces and metrics to a local `grafana/otel-lgtm` container; `pino` JSON log lines on stdout, correlated by trace id | Availability check and insert are separate spans by design, so the window that check-then-act would have raced in is visible in a waterfall even though the code never relies on it |

Transport security, gateways, load balancers and TLS termination are absent: the deployment is a single
local container (§7). Adding them moves no boundary in this table.

## 3.3 Out of scope

Named explicitly, because what a system deliberately does not do is part of its design. *Proposed by
the architect; scope is the human's, and this list was **ratified at Gate A** on 2026-09-03.* Items
marked **†** are carried into §11 as debt with a note on what would trigger them.

**In scope, stated here because an earlier draft of this list deferred them:** cancelling an
appointment and **rescheduling** one are both built (ADR-0003), and dealership opening hours are
validated (ADR-0001). Their absence from the exclusions below is deliberate, not an oversight.

**Excluded by the brief**

- A user interface of any kind. The brief permits one service layer; the client is a contract and a
  cURL harness (TC-5).
- Integration with any external system — DMS, CRM, calendar, parts, warranty. **†**

**Excluded by a Gate A ruling** *(firm; each cites the ADR that decided it)*

- **Technician shifts, rotas, holidays and absence** — any per-technician working calendar
  ([ADR-0001](../adr/0001-validate-dealership-opening-hours.md)). **†** A technician is bookable whenever the dealership is open. Excluded because
  shift and absence data is a *resource availability* rule, which would sit beside the one the
  exclusion constraint enforces and need its own mechanism and its own quality scenario. Dealership
  opening hours are **not** in this exclusion: they are validated, because they are decidable from the
  request alone.
- **Public holidays and one-off closures** ([ADR-0001](../adr/0001-validate-dealership-opening-hours.md)). **†** Opening hours are the same every week of the year.
- **Authentication, authorisation, sessions, rate limiting and per-actor audit**
  ([ADR-0002](../adr/0002-service-advisor-actor-no-authentication.md), GC-2). **†** The service is therefore unsafe to expose on any reachable network,
  which is acceptable only because §7 deploys a single local container. Vehicle ownership is checked,
  but as validation — no appointment records who booked, moved or cancelled it.
- **Cancellation policy** — notice periods, fees, or any restriction on cancelling an appointment that
  has already begun ([ADR-0003](../adr/0003-cancellation-and-rescheduling-in-scope.md)). Cancellation and rescheduling themselves are in scope; the *policy*
  around them is not.
- **Appointment history** — a moved appointment shows only its current interval; where it was moved
  from is not retained ([ADR-0003](../adr/0003-cancellation-and-rescheduling-in-scope.md)). **†**
- Vehicle-dependent service durations (A-1), inter-appointment buffers (A-4), and search-style
  "find me any slot on Tuesday" booking (A-5). **†**

**Excluded as conventional — no interesting risk, and it would spend the scarce review budget**

- CRUD endpoints for customers, vehicles, dealerships, bays, technicians, service types and
  qualifications (A-7). Seed data instead.
- Pagination, filtering and sorting beyond what the availability query needs.
- Notifications, reminders, confirmations by email or SMS.
- Payments, invoicing, estimates, labour times, parts reservation, courtesy vehicles.

**Excluded as out of the domain at this size**

- Waitlists, overbooking, priority or emergency jobs, and any queue-jumping policy. Each is a
  scheduling *policy* question, and policy is where a scheduler earns its keep — which is exactly why
  none of it can be done convincingly inside an assessment. **†**
- Splitting one job across several technicians, or technician skill levels and efficiency ratings.
- Recurring or series appointments; multi-day jobs.
- Analytics, reporting and schedule optimisation.

**Excluded operationally**

- Horizontal scale-out, high availability, failover, backup and disaster recovery. A single container
  locally (§7). **†**
- Migration or import from the manual system being replaced.
- GDPR-grade PII handling, retention policies, and data subject requests. Personal data is limited to
  a customer name and a vehicle identifier. **†**

A reader who disagrees with any line above is disagreeing about scope, not architecture. Gate A is
closed, so that disagreement is resolved by superseding the ADR that decided it.
