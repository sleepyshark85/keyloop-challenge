# 1. Introduction and goals

> Owner: architect · Written: phase 1 · Gate A

## 1.1 Requirements overview

A service-appointment scheduler for automotive dealerships. The assessment brief states the task as
*"Build an Appointment Scheduler application to replace manual booking systems"* and gives three core
requirements, quoted here because everything below traces to them:

1. **Resource Constrained Booking** — *"Allow a user to request a service appointment for a specific
   vehicle, service type, and dealership at a desired time."*
2. **Real-Time Availability Check** — *"Before confirming, check for the availability of both a
   ServiceBay and a qualified Technician for the entire service duration."*
3. **Confirmed Appointment Record** — *"Upon success, create a persistent Appointment record
   associating the customer, vehicle, technician, and service bay."*

**What the system does.** A booking request names a customer, a vehicle, a service type, a dealership
and a desired start time. It does *not* name a bay or a technician: those are physical resources the
system allocates. The system derives the appointment's interval from the service type's duration,
finds a bay at that dealership and a technician qualified for that service type who are both free for
the whole interval, and persists one Appointment binding all five — customer, vehicle, technician,
bay, interval. If either resource is unavailable the request is refused and nothing is written. A
separate, read-only availability query answers *"what is free?"* for the booking screen.

**Why this is not a CRUD exercise.** A single booking consumes two independently scarce physical
resources for the same span of time, and requests arrive concurrently. The failure that matters is
not a malformed payload; it is two customers being told at 09:00:00.000 that bay 3 is theirs. That
error is not recoverable in software — it is a car on a ramp and a car on the forecourt, and a
service manager on the phone. The brief's wording invites the defect: *"Before confirming, check for
the availability"* describes check-then-act, which under concurrency is exactly the read-then-write
race that produces the double booking. `CLAUDE.md` §2.1 therefore decides, before any architecture,
that overlap is made unrepresentable by a PostgreSQL exclusion constraint and that availability
queries exist for user experience and never for correctness. Requirement 2 is honoured as a UX
affordance; requirement 3's integrity is honoured by the database. This document is written on that
footing.

**Scale and shape.** One deployment serves several dealerships. Each dealership has a small number of
bays (single digits) and technicians (tens). Booking volume is low — a busy dealership books tens of
appointments a day — but bursts of contention are real, because everyone wants 08:00 on a Saturday.
The load profile means the design is optimised for *provable correctness under contention*, not for
throughput; that ranking is made explicit in §1.2 and is the single most important judgement in the
submission.

**Boundaries.** Backend only, per the brief's *"Choose one service layer to implement fully"*. The
client layer is stubbed with an OpenAPI contract and a cURL harness (`CLAUDE.md` §1). No external
system is integrated: *"replace manual booking systems"* is read as replacing a manual process — a
paper diary and a phone call — not as federating existing software. §3.3 lists what is deliberately
excluded.

**Deliberate ambiguity.** The brief states that these scenarios *"are designed to mimic real-world
requirements, which can be ambiguous"* and asks that assumptions be documented. Scenario A
underdetermines the system in roughly a dozen places, several of which change the data model. §1.4
records every one: ten assumptions taken by the architect (each stating what would change if the
reading is wrong) and four questions that materially changed the design and were therefore reserved
to the human. Those four were **decided at Gate A** and are now ADR-0001 to ADR-0004; §1.4 carries the
rulings and §9 indexes the records. Nothing in this document is still open.

## 1.2 Quality goals

Ranked, because unranked quality goals constrain nothing: the ranking is what tells a later reviewer
which way to resolve a trade-off without reconvening a gate. Each goal becomes one or more executable
scenarios in §10 at Gate B. *Proposed by the architect; quality goals are the human's under
`CLAUDE.md` §6. **Ratified at Gate A exactly as proposed** — the ranking below, including performance
last with its cost stated, is the human's decision and not the architect's preference.*

| # | Quality goal | What it means concretely | Why it ranks here |
|---|---|---|---|
| **1** | **Booking integrity under concurrency** | No two non-cancelled appointments share a bay, or share a technician, with overlapping intervals — under any interleaving of concurrent requests, including at exactly the same instant | The only property whose violation cannot be undone by the software that caused it. Every other goal describes how well the system works; this one decides whether it works at all |
| **2** | **Verifiability** | Every claim in this documentation is checkable by something other than an agent's assertion: the invariant by a concurrency test against real PostgreSQL, layering by `dependency-cruiser`, test quality by mutation score, "done" by a script | Ranked immediately below the invariant because an unverified invariant is a claim, not a property. The brief grades *"your process for verifying and refining"* AI output as a primary criterion, so this is also a graded goal in its own right |
| **3** | **Modifiability** | A change to one of the ambiguities in §1.4 — durations varying by vehicle, a cleanup buffer, opening hours — is absorbed by one building block plus a migration, not by a rewrite | Ranked above observability and performance because §1.4 makes it near-certain that the domain model *will* change: four open questions land after design begins, and each has a defensible answer either way |
| **4** | **Observability** | A booking's availability check and its insert are separate spans, so the check-then-act window is visible in a waterfall; `booking_conflicts_total{resource}` makes goal 1 measurable in production rather than only in tests | Explicitly requested by the brief. Ranked below modifiability because it reports on the system rather than constituting it — but above performance, because without it a correctness regression in production is invisible |
| **5** | **Performance** | Availability queries answer within a human-interactive budget for a single dealership's schedule; a booking is a single round trip | Ranked last **deliberately and with a stated cost**: the chosen correctness mechanism serialises conflicting writes at the database, which caps write throughput for a contended resource. At single-dealership scale that ceiling is orders of magnitude away from binding, so goal 1 is bought with headroom that is not otherwise spent. §11 records the scale at which this trade would need revisiting |

**How to use the ranking.** Where two goals conflict, the lower-numbered one wins and the loss is
recorded in §11 as debt rather than silently absorbed. The 1-over-5 case is live and already decided
above. The 3-over-5 case is expected during the slice loop: prefer the decomposition that isolates an
ambiguity over the one that saves a query.

## 1.3 Stakeholders

| Role | Expectation |
|---|---|
| **Service advisor** (primary actor, ADR-0002; see also A-6) | Books, cancels and reschedules on a customer's behalf during a phone call (ADR-0003). Wants a yes/no in seconds, and — when it is a no — to be told *which* resource was unavailable so they can offer an alternative without re-querying |
| **Customer / vehicle owner** | An appointment that is actually honoured on arrival. Their interest is entirely in quality goal 1; under ADR-0002 they never touch the system directly — the advisor acts for them |
| **Service manager** | Bays and technicians are not left idle by a scheduler that refuses bookings it could have accepted — the interest ADR-0004 serves — and no technician is double-committed. Owns the reference data: technicians, qualifications, bays, service types, and the dealership's opening hours (ADR-0001) |
| **Technician** | Appears in this scope as a *resource*, not a user. Expects to be committed to one job at a time (settled by `CLAUDE.md` §2.1; see A-2) |
| **Operator** | Can run the service from a clean checkout, tell whether it is healthy, and see conflicts and latency without attaching a debugger |
| **Human engineer** (the submitter) | Owns scope, acceptance criteria and quality goals; resolves Gate A; retains the ability to defend every design decision as their own |
| **Keyloop assessor** | Reads the repository under time pressure. Expects to find the reasoning, not just the result: why the concurrency mechanism was chosen, what was assumed, what was left out, and how the AI's output was verified |
| **Hypothetical downstream integrator** | Not in scope, and named so the omission is visible: a real deployment would publish appointment events to a DMS. §3.3 and §11 record this |

## 1.4 Assumptions

The assessment states ambiguity is deliberate, so none of it is silently resolved here. Two kinds were
distinguished, and both are now closed:

- **Assumption (A-n)** — a reasonable reading was taken by the architect and work proceeded. Each
  states the reading and what would change if it is wrong. Gate A left all ten standing. Two were put
  to the human explicitly — **A-4** (no setup or cleanup buffer between appointments) and **A-6**
  (nothing is created implicitly by a booking) — and remain assumptions rather than rulings: they are
  the architect's readings, and overturning either is still cheap.
- **Ruling (formerly open question, OQ-n)** — the choice materially changed the design *and* was a
  scope or acceptance-criteria decision, which `CLAUDE.md` §6 reserves to the human. These blocked
  Gate A. **All four were decided on 2026-09-03 and are recorded as ADR-0001 to ADR-0004.**

The `OQ-n` identifiers are retained rather than renumbered, so that references to them elsewhere in
this documentation still resolve — but they are answers now, not questions. Each ruling carries the
same standing as an assumption above with one difference: overturning one means **superseding its
ADR**, not editing a table.

### Assumptions taken

| id | Ambiguity | Reading taken | Affects | If the reading is wrong |
|---|---|---|---|---|
| **A-1** | Is a service duration fixed per service type, or does it vary by vehicle? | Fixed per service type. The request carries a desired **start**; the server derives the end from the service type's duration and never trusts a client-supplied end | Criteria 2 and 3 — the interval whose availability is checked, and the interval persisted | Duration becomes a function of *(service type, vehicle)* rather than an attribute of service type: a resolution table and a domain step that runs before the interval exists. The concurrency invariant is untouched, because the constraint operates on whatever interval it is given. Additive, hence an assumption rather than a blocker |
| **A-2** | Can one technician cover two bays at once? | No. A technician is exclusively committed for the whole appointment | Criterion 2 | **Already settled**, not open: `CLAUDE.md` §2.1 mandates an exclusion constraint on `technician_id` as well as `bay_id`, which *is* the statement that technician capacity is one. Recorded here so it is visible as considered rather than overlooked. A future capacity-*n* technician would need a different mechanism than an exclusion constraint; §11 will carry it as debt |
| **A-3** | Are technician qualifications global, or scoped per dealership? | A technician is employed by exactly one dealership; a qualification is a *(technician, service type)* pair, and is therefore dealership-scoped through employment. No cross-dealership booking | Criterion 2 — which technicians are candidates | Floating technicians need an assignment table with validity periods, and the eligibility query gains a join and a temporal predicate. The invariant is unaffected — it does not care *why* a technician was chosen, only that they are not double-committed |
| **A-4** | Does a bay need a setup or cleanup buffer between appointments? | No buffer. The appointment interval *is* the occupancy interval | Criterion 2, and the exclusion constraint's range | Occupancy and the customer-facing interval separate: the constraint moves onto a padded occupancy range, which is a migration over existing rows plus a change to the one constraint. Bounded and mechanical, so an assumption — but it is the assumption most likely to be wrong in a real dealership, and it is why §5 should keep "the interval the constraint sees" a named concept |
| **A-5** | Is "a desired time" an exact start, or a preference the system optimises within? | An exact start. The system answers *"can you have 09:00 on Tuesday?"*, not *"find me something Tuesday"* | Criterion 1 | Booking becomes search-then-book, a materially different endpoint, and the availability query stops being advisory-only and starts driving allocation. Called out because it is a one-word reading of *"at a desired time"* that quietly doubles the scope |
| **A-6** | Must the customer, vehicle and reference data already exist? | Yes. Customers, vehicles, dealerships, bays, technicians, service types and qualifications are seeded reference data. Booking references them by id and fails with a client error if one is absent or mismatched; nothing is created implicitly. A vehicle belongs to exactly one customer | Criterion 3 — what the appointment associates | Booking becomes a multi-entity transaction (find-or-create the vehicle by VIN, then insert), its failure modes multiply, and vehicle ownership becomes temporal because cars get sold. Keeping the booking path a *single insert* is what makes the exclusion-constraint invariant simple to state and to test, so this assumption is load-bearing |
| **A-7** | Is reference data managed through the API? | No. It arrives via migrations and fixtures. The API surface is booking, availability, and reading an appointment | Scope | Adds CRUD endpoints that are conventional and carry no interesting risk — which is precisely why they are excluded: they would consume the human review attention that `CLAUDE.md` §8 identifies as the scarce resource, and buy nothing the assessor is grading |
| **A-8** | How is time represented across the boundary? | Instants. The API accepts and returns RFC 3339 timestamps with an offset; storage is `timestamptz` and the constraint uses `tstzrange`, so overlap is decided on the absolute timeline and is immune to zone and DST bugs. A dealership's local time is a presentation concern | Criteria 2 and 3 | Nothing, for the invariant — this is the reading that makes the invariant timezone-safe. **Now load-bearing:** ADR-0001 validates opening hours, which are stated in a dealership's local wall-clock time, so the dealership carries an IANA zone and the boundary stays instants. The zone is used for validation only and never enters the overlap calculation |
| **A-9** | Does the system serve one dealership or many? | Many, in one deployment — the *"Unified"* in the scenario title. A bay and a technician belong to exactly one dealership; appointments never span dealerships | Criterion 1 | Single-tenant would remove a scoping predicate from every query. Harmless if wrong in that direction; expensive if wrong in the other, so the multi-dealership reading is taken |
| **A-10** | Does the requester choose the bay and technician? | No. The brief's request names *"a specific vehicle, service type, and dealership at a desired time"* and conspicuously does not name resources, so the system allocates them | Criteria 1 and 3 | If the requester may pin a specific technician ("the one who did it last time" is a real dealership expectation), allocation becomes optional and the conflict semantics of OQ-4 / ADR-0004 change shape. Note that the *policy* for choosing among free candidates is an architecture decision, deferred to Gate B — it is not a Gate A question |

### Decided at Gate A — the four former open questions

Each ruling is the human's, taken on 2026-09-03. The ADR carries the full argument, the alternatives
that were live, and whether the architect's recommendation was accepted, modified or overridden.

| id | The question that was open | Ruling | Record |
|---|---|---|---|
| **OQ-1** | Are dealership opening hours and technician shifts modelled, or is time unbounded? | **Opening hours are validated; shifts are not modelled.** A request whose derived interval falls outside the dealership's opening hours is rejected with `400 Bad Request`. Opening hours are a static property of the *request* — decidable without reading any other booking — so validating them cannot reintroduce check-then-act; availability and contention remain entirely the database's business. Technician shifts, holidays and absence would be a per-resource availability rule and are excluded (§3.3) | [ADR-0001](../adr/0001-validate-dealership-opening-hours.md) — *architect's recommendation ("unbounded") overridden in favour of a middle path* |
| **OQ-2** | Who is the actor, and is authentication or authorisation in scope? | **Service advisor, no authentication.** `customer_id` travels in the request body; the rule that a vehicle belongs to the named customer is a **validation** rule, not a security control. Authentication, authorisation, sessions, rate limiting and per-actor audit are out of scope (§3.3) and carried in §11 | [ADR-0002](../adr/0002-service-advisor-actor-no-authentication.md) — *accepted as recommended* |
| **OQ-3** | Are cancellation and rescheduling in scope? | **Both are in scope.** Cancellation is a `confirmed → cancelled` transition, which is what makes the constraint's `WHERE (status <> 'cancelled')` predicate meaningful and testable. Rescheduling is a **single atomic `UPDATE`** on the existing row, guarded by the same exclusion constraint — never a delete or cancel followed by an insert, because a move must not transiently release the slot | [ADR-0003](../adr/0003-cancellation-and-rescheduling-in-scope.md) — *architect recommended deferring rescheduling; the human expanded scope to include it, and fixed the mechanism* |
| **OQ-4** | When a request conflicts but the dealership still had capacity, is a refusal acceptable? | **No — retry across the remaining candidates, then refuse.** On SQLSTATE `23P01` the next candidate is attempted; `409 Conflict` is returned only when the candidate list is exhausted. The candidate read stays **advisory** — correctness still comes from the write — so this is not check-then-act; the loop is bounded by a single read of a finite candidate set plus a hard attempt cap | [ADR-0004](../adr/0004-retry-across-remaining-candidates.md) — *accepted as recommended* |

**Consequences that land elsewhere in this document.** OQ-1 and OQ-2 become constraints in §2.4, since
the architect is no longer free to choose either. §3.1 and §3.2 gain the cancel and reschedule
operations on the boundary and the `400` for an out-of-hours request. §3.3's exclusion list becomes
firm and gains technician-shift modelling and authentication, while rescheduling leaves it. §10 must
carry, at Gate B, a no-spurious-refusal scenario alongside the no-overlap one (ADR-0004), a scenario
in which a refused move leaves the original appointment confirmed (ADR-0003), and a DST-boundary
scenario for opening-hours validation (ADR-0001).

*Not questions for Gate A, recorded so it is clear they were not asked:* the HTTP framework, the query
layer, the migration tool and the module decomposition are reserved to the architect at Gate B by
`CLAUDE.md` §3; so are candidate-selection ordering and the retry *mechanism* under OQ-4's chosen
semantics, and the attempt cap's value. Gate A decided what the system does, not how.
