# 1. Introduction and goals

> Owner: architect · Written: phase 1 · Gate A

## 1.1 Requirements overview

A service-appointment scheduler for automotive dealerships. The brief states the task as *"Build an
Appointment Scheduler application to replace manual booking systems"* and gives three core
requirements, quoted because everything below traces to them:

1. **Resource Constrained Booking** — *"Allow a user to request a service appointment for a specific
   vehicle, service type, and dealership at a desired time."*
2. **Real-Time Availability Check** — *"Before confirming, check for the availability of both a
   ServiceBay and a qualified Technician for the entire service duration."*
3. **Confirmed Appointment Record** — *"Upon success, create a persistent Appointment record
   associating the customer, vehicle, technician, and service bay."*

**What the system does.** A booking request names a customer, a vehicle, a service type, a dealership
and a desired start. It does *not* name a bay or a technician: those are physical resources the system
allocates. The system derives the interval from the service type's duration, finds a bay at that
dealership and a qualified technician both free for the whole interval, and persists one Appointment
binding all five. If either resource is unavailable the request is refused and nothing is written. A
separate, read-only availability query answers *"what is free?"* for the booking screen.

**Why this is not a CRUD exercise.** A single booking consumes two independently scarce physical
resources for the same span, and requests arrive concurrently. The failure that matters is not a
malformed payload; it is two customers told at 09:00:00.000 that bay 3 is theirs — a car on a ramp and
a car on the forecourt, which software cannot undo. The brief's wording invites the defect: *"Before
confirming, check for the availability"* describes check-then-act, the read-then-write race that
produces the double booking. `CLAUDE.md` §2.1 therefore decides, before any architecture, that overlap
is made unrepresentable by a PostgreSQL exclusion constraint and that availability queries exist for
user experience and never for correctness. Requirement 2 is honoured as a UX affordance; requirement
3's integrity is honoured by the database.

**Scale and shape.** One deployment serves several dealerships, each with single-digit bays and tens of
technicians. Booking volume is low — tens of appointments a day at a busy dealership — but bursts of
contention are real, because everyone wants 08:00 on a Saturday. The design is therefore optimised for
*provable correctness under contention* rather than throughput (§1.2).

**Boundaries.** Backend only, per the brief's *"Choose one service layer to implement fully"*; the
client is an OpenAPI contract and a cURL harness. No external system is integrated — *"replace manual
booking systems"* is read as replacing a paper diary and a phone call, not as federating existing
software. §3.3 lists what is deliberately excluded, and §1.4 records the dozen places Scenario A
underdetermines the system.

## 1.2 Quality goals

Ranked, because unranked quality goals constrain nothing: the ranking tells a later reviewer which way
to resolve a trade-off without reconvening a gate. Each goal becomes one or more executable scenarios
in §10. Quality goals are the human's under `CLAUDE.md` §6, and this ranking — performance last, with
its cost stated — was ratified at Gate A exactly as proposed.

| # | Quality goal | What it means concretely | Why it ranks here |
|---|---|---|---|
| **1** | **Booking integrity under concurrency** | No two non-cancelled appointments share a bay, or a technician, with overlapping intervals — under any interleaving of concurrent requests | The only property whose violation cannot be undone by the software that caused it. Every other goal describes how well the system works; this one decides whether it works at all |
| **2** | **Verifiability** | Every claim in this documentation is checkable by something other than an agent's assertion: the invariant by a concurrency test against real PostgreSQL, layering by `dependency-cruiser`, test quality by mutation score, "done" by a script | An unverified invariant is a claim, not a property. The brief also grades *"your process for verifying and refining"* AI output as a primary criterion |
| **3** | **Modifiability** | A change to one of §1.4's ambiguities — durations varying by vehicle, a cleanup buffer, opening hours — is absorbed by one building block plus a migration, not a rewrite | §1.4 makes it near-certain the domain model *will* change: four open questions land after design begins, each with a defensible answer either way |
| **4** | **Observability** | The availability check and the insert are separate spans, so the check-then-act window is visible in a waterfall; `booking_conflicts_total{resource}` makes goal 1 measurable in production | Explicitly requested by the brief. Below modifiability because it reports on the system rather than constituting it; above performance, because without it a correctness regression in production is invisible |
| **5** | **Performance** | Availability queries answer within a human-interactive budget for one dealership's schedule; a booking is a single round trip | Last **deliberately and with a stated cost**: the correctness mechanism serialises conflicting writes, capping throughput for a contended resource. At this scale that ceiling is orders of magnitude from binding, so goal 1 is bought with headroom nothing else spends (§11.2 R-1) |

**How to use the ranking.** Where two goals conflict the lower-numbered one wins, and the loss is
recorded in §11 as debt rather than silently absorbed.

## 1.3 Stakeholders

| Role | Expectation |
|---|---|
| **Service advisor** (primary actor, ADR-0002) | Books, cancels and reschedules on a customer's behalf during a phone call. Wants a yes/no in seconds and, on a no, to be told *which* resource was unavailable |
| **Customer / vehicle owner** | An appointment honoured on arrival — entirely quality goal 1. Never touches the system; the advisor acts for them (ADR-0002) |
| **Service manager** | No technician double-committed, and no bay left idle by a scheduler refusing bookings it could have accepted (ADR-0004). Owns the reference data, including opening hours (ADR-0001) |
| **Technician** | A *resource*, not a user. Committed to one job at a time (`CLAUDE.md` §2.1, A-2) |
| **Operator** | Runs the service from a clean checkout, tells whether it is healthy, and sees conflicts and latency without attaching a debugger |
| **Human engineer** (the submitter) | Owns scope, acceptance criteria and quality goals; resolves Gate A; can defend every design decision as their own |
| **Keyloop assessor** | Reads the repository under time pressure and expects the reasoning, not just the result: why this concurrency mechanism, what was assumed, what was left out, and how the AI's output was verified |
| **Hypothetical downstream integrator** | Not in scope, named so the omission is visible: a real deployment would publish appointment events to a DMS (§3.3, §11) |

## 1.4 Assumptions

Ambiguity is deliberate in the brief, so none of it is silently resolved. Two kinds were distinguished
and both are closed. An **assumption (A-n)** is a reading the architect took, stating what would change
if it is wrong; Gate A left all ten standing, including **A-4** (no buffer between appointments) and
**A-6** (nothing is created implicitly by a booking), which were put to the human explicitly and remain
cheap to overturn. A **ruling** materially changed the design *and* was a scope decision, which
`CLAUDE.md` §6 reserves to the human; all four blocked Gate A and were decided on 2026-09-03 as
ADR-0001 to ADR-0004. Their `OQ-n` identifiers are retained so citations elsewhere still resolve, but
they are answers now: overturning one means **superseding its ADR**, not editing a table.

### Assumptions taken

| id | Ambiguity | Reading taken | If the reading is wrong |
|---|---|---|---|
| **A-1** | Is a service duration fixed per service type, or does it vary by vehicle? | Fixed per service type. The request carries a desired **start**; the server derives the end and never trusts a client-supplied one | Duration becomes a function of *(service type, vehicle)*: a resolution table and a domain step before the interval exists. The invariant is untouched, because the constraint operates on whatever interval it is given — additive, hence an assumption rather than a blocker |
| **A-2** | Can one technician cover two bays at once? | No. A technician is exclusively committed for the whole appointment | **Already settled**: `CLAUDE.md` §2.1's exclusion constraint on `technician_id` *is* the statement that technician capacity is one. Recorded so it is visible as considered. A capacity-*n* technician needs a different mechanism entirely (§11.2 R-2) |
| **A-3** | Are technician qualifications global, or scoped per dealership? | A technician is employed by exactly one dealership, so a *(technician, service type)* qualification is dealership-scoped through employment | Floating technicians need an assignment table with validity periods, and the eligibility query gains a join and a temporal predicate. The invariant is unaffected — it does not care *why* a technician was chosen, only that they are not double-committed |
| **A-4** | Does a bay need a setup or cleanup buffer between appointments? | No buffer. The appointment interval *is* the occupancy interval | The two separate and the constraint moves onto a padded range: one migration plus one constraint change. Bounded and mechanical — but the assumption most likely to be wrong in a real dealership, and the reason §5 keeps "the interval the constraint sees" a named concept |
| **A-5** | Is "a desired time" an exact start, or a preference the system optimises within? | An exact start: *"can you have 09:00 on Tuesday?"*, not *"find me something Tuesday"* | Booking becomes search-then-book, a materially different endpoint, and the availability query stops being advisory and starts driving allocation. A one-word reading that quietly doubles the scope |
| **A-6** | Must the customer, vehicle and reference data already exist? | Yes — all of it is seeded. Booking references by id and fails with a client error if one is absent or mismatched; nothing is created implicitly, and a vehicle belongs to exactly one customer | Booking becomes a multi-entity transaction, its failure modes multiply, and ownership becomes temporal because cars get sold. Keeping booking a *single insert* is what makes the invariant simple to state and test, so this is load-bearing |
| **A-7** | Is reference data managed through the API? | No. It arrives via migrations and fixtures; the API is booking, availability and reading an appointment | Adds conventional CRUD carrying no interesting risk, which is why it is excluded: it would consume the review attention `CLAUDE.md` §8 identifies as scarce and buy nothing the assessor is grading |
| **A-8** | How is time represented across the boundary? | Instants. RFC 3339 with an offset on the wire, `timestamptz` in storage, `tstzrange` in the constraint, so overlap is decided on the absolute timeline | Nothing, for the invariant — this reading is what makes it zone-safe. **Now load-bearing**: ADR-0001 validates opening hours stated in local wall-clock time, so the dealership carries an IANA zone used for validation only |
| **A-9** | Does the system serve one dealership or many? | Many, in one deployment — the *"Unified"* of the title. A bay and a technician belong to exactly one dealership | Single-tenant would remove a scoping predicate from every query: harmless if wrong that way, expensive the other, so the multi-dealership reading is taken |
| **A-10** | Does the requester choose the bay and technician? | No. The brief's request names a vehicle, service type, dealership and time and conspicuously not resources, so the system allocates them | If a requester may pin a technician — a real dealership expectation — allocation becomes optional and ADR-0004's conflict semantics change shape. The *policy* for choosing among free candidates was always an architecture decision |

### Decided at Gate A — the four former open questions

Each ruling is the human's. The ADR carries the argument, the alternatives and whether the architect's
recommendation was accepted, modified or overridden.

| id | The question that was open | Ruling | Record |
|---|---|---|---|
| **OQ-1** | Are opening hours and technician shifts modelled, or is time unbounded? | **Opening hours are validated; shifts are not modelled.** Validating them cannot reintroduce check-then-act, because they are a static property of the *request* | [ADR-0001](../adr/0001-validate-dealership-opening-hours.md) — *architect's "unbounded" recommendation overridden* |
| **OQ-2** | Who is the actor, and is authentication in scope? | **Service advisor, no authentication.** Vehicle ownership is **validation**, not a security control | [ADR-0002](../adr/0002-service-advisor-actor-no-authentication.md) — *accepted as recommended* |
| **OQ-3** | Are cancellation and rescheduling in scope? | **Both.** Cancellation is a `confirmed → cancelled` transition, which is what makes the constraint's `WHERE (status <> 'cancelled')` predicate testable; rescheduling is a **single atomic `UPDATE`**, never a cancel followed by an insert | [ADR-0003](../adr/0003-cancellation-and-rescheduling-in-scope.md) — *architect recommended deferring rescheduling; the human expanded scope and fixed the mechanism* |
| **OQ-4** | When a request conflicts but capacity remained, is a refusal acceptable? | **No — retry across the remaining candidates, then refuse.** The candidate read stays **advisory**, so this is not check-then-act | [ADR-0004](../adr/0004-retry-across-remaining-candidates.md) — *accepted as recommended* |

*Not questions for Gate A, recorded so it is clear they were not asked:* the HTTP framework, the query
layer, the migration tool and the module decomposition were reserved to the architect at phase 0;
candidate ordering, the retry mechanism and the attempt cap's value by
[ADR-0004](../adr/0004-retry-across-remaining-candidates.md). All were decided at Gate B (§2.2, §4.2).
Gate A decided what the system does, not how.
