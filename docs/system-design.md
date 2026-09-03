# System design — Keyloop service scheduler

*Scenario A: Unified Service Scheduler (backend). Generated from `docs/arc42/` by
`npm run docs:build` — edit the sections, not this file.*

This is the architecture documentation for the Keyloop service scheduler, following
[arc42](https://arc42.org) (CC BY-SA). All twelve standard sections are retained; several are
deliberately thin and say why. One section is added outside the standard twelve: **§13 AI
Collaboration**.

**If you are assessing this submission** — §1 goals, §4 solution strategy, §9 decisions,
§11 risks and debt, §13 AI collaboration.
**If you are implementing** — §5 building blocks, §8 cross-cutting concepts, §10 quality scenarios.
**If you are operating it** — §7 deployment, §8 observability.

## How to read the quality scenarios

§10 numbers each scenario `QS-n`, and every one names the test that enforces it. The chain

```
§10 quality scenario → slice acceptance criterion → test name → CI result
```

is walkable in both directions, and CI fails if a `QS-*` names a test that does not exist. A quality
attribute that cannot be traced to a test is aspiration.

## As-designed versus as-built

This document was written as-designed at the architecture gate and corrected to as-built at each
slice merge. The difference is preserved on purpose: where the plan was wrong is worth more than a
plan that reads as though it never was. §11 and §13 discuss the material deltas.

---

## 1. Introduction and goals

### 1.1 Requirements overview

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

### 1.2 Quality goals

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

### 1.3 Stakeholders

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

### 1.4 Assumptions

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

#### Assumptions taken

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

#### Decided at Gate A — the four former open questions

Each ruling is the human's, taken on 2026-09-03. The ADR carries the full argument, the alternatives
that were live, and whether the architect's recommendation was accepted, modified or overridden.

| id | The question that was open | Ruling | Record |
|---|---|---|---|
| **OQ-1** | Are dealership opening hours and technician shifts modelled, or is time unbounded? | **Opening hours are validated; shifts are not modelled.** A request whose derived interval falls outside the dealership's opening hours is rejected with `400 Bad Request`. Opening hours are a static property of the *request* — decidable without reading any other booking — so validating them cannot reintroduce check-then-act; availability and contention remain entirely the database's business. Technician shifts, holidays and absence would be a per-resource availability rule and are excluded (§3.3) | [ADR-0001](adr/0001-validate-dealership-opening-hours.md) — *architect's recommendation ("unbounded") overridden in favour of a middle path* |
| **OQ-2** | Who is the actor, and is authentication or authorisation in scope? | **Service advisor, no authentication.** `customer_id` travels in the request body; the rule that a vehicle belongs to the named customer is a **validation** rule, not a security control. Authentication, authorisation, sessions, rate limiting and per-actor audit are out of scope (§3.3) and carried in §11 | [ADR-0002](adr/0002-service-advisor-actor-no-authentication.md) — *accepted as recommended* |
| **OQ-3** | Are cancellation and rescheduling in scope? | **Both are in scope.** Cancellation is a `confirmed → cancelled` transition, which is what makes the constraint's `WHERE (status <> 'cancelled')` predicate meaningful and testable. Rescheduling is a **single atomic `UPDATE`** on the existing row, guarded by the same exclusion constraint — never a delete or cancel followed by an insert, because a move must not transiently release the slot | [ADR-0003](adr/0003-cancellation-and-rescheduling-in-scope.md) — *architect recommended deferring rescheduling; the human expanded scope to include it, and fixed the mechanism* |
| **OQ-4** | When a request conflicts but the dealership still had capacity, is a refusal acceptable? | **No — retry across the remaining candidates, then refuse.** On SQLSTATE `23P01` the next candidate is attempted; `409 Conflict` is returned only when the candidate list is exhausted. The candidate read stays **advisory** — correctness still comes from the write — so this is not check-then-act; the loop is bounded by a single read of a finite candidate set plus a hard attempt cap | [ADR-0004](adr/0004-retry-across-remaining-candidates.md) — *accepted as recommended* |

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

---

## 2. Architecture constraints

A constraint is something **imposed** — by the brief, by the constitution, or by the environment.
Anything the architect is free to choose is not a constraint; it belongs in §4 with an ADR. The
boundary is stated at the end of §2.2 so a reader does not go looking here for decisions that were
never taken here.

### 2.1 Standing invariants

Decided before the architecture, and not open to relitigation. Full statements in `CLAUDE.md` §2.

| Constraint | Consequence |
|---|---|
| Double-booking is prevented by a PostgreSQL exclusion constraint, never by application code | Check-then-act is forbidden; the service maps SQLSTATE `23P01` to `409 Conflict` |
| Tests asserting persistence run against real PostgreSQL via Testcontainers | No SQLite, no in-memory repository, no mocked database |
| Layering is enforced by `dependency-cruiser` in CI | Conformance is a build failure, not a reviewer's opinion |
| Every slice begins with a failing acceptance test, committed red by a different author | A test that has never failed is not evidence |

These four are the reason the rest of the document is short. Each removes a class of decision from
the design space rather than adding to it.

### 2.2 Technical constraints

| id | Constraint | Imposed by | Consequence for the architecture |
|---|---|---|---|
| **TC-1** | TypeScript on Node | `CLAUDE.md` §3 | Language and runtime are not an open decision |
| **TC-2** | PostgreSQL as the persistent store | `CLAUDE.md` §3, and required by the §2.1 invariant | The invariant is expressed in a PostgreSQL-specific feature. This is a deliberate, load-bearing coupling: portability to another engine is given up in exchange for the correctness guarantee, and §11 records that trade |
| **TC-3** | The database must permit `CREATE EXTENSION btree_gist` | The exclusion constraint mixes an equality column with a range column, which GiST cannot index without it | Rules out any deployment target that restricts extension installation. Testcontainers grants superuser, so tests are unaffected; a managed-Postgres deployment must be checked against this before it is chosen |
| **TC-4** | A RESTful HTTP API over a persistent database | Brief: *"If you choose Backend: Expose a RESTful API and use a persistent database"* | Not a message bus, not GraphQL, not RPC |
| **TC-5** | Backend only; the client layer is stubbed with an OpenAPI contract and a cURL harness | Brief: *"Choose one service layer to implement fully"*; `CLAUDE.md` §1 | The API contract is a deliverable in its own right, because it is the only description of the boundary that a reader gets |
| **TC-6** | Vitest, Testcontainers, `fast-check`, Stryker | `CLAUDE.md` §3 | The test strategy is fixed at four levels; mutation score is an available signal and §10 may rely on it |
| **TC-7** | `dependency-cruiser` for layering, authored by the architect | `CLAUDE.md` §2.3, §3 | Whatever decomposition §5 defines must be expressible as a machine-checkable rule set. A layering that cannot be written down as rules is not an acceptable layering |
| **TC-8** | OpenTelemetry with `pino`, correlated by trace id | `CLAUDE.md` §3, METHODOLOGY §9 | Instrumentation is designed in, not retrofitted; §8 must name the spans and metrics |
| **TC-9** | Docker must be present to run the tests | METHODOLOGY §0 — Testcontainers and the local `grafana/otel-lgtm` stack | The test suite is not runnable in a Docker-less CI runner. Stated as a constraint because it is the most likely reason a reader's first `npm test` fails |
| **TC-10** | Node and npm versions are pinned at Gate B | METHODOLOGY §0 | Left open here on purpose; recorded so its absence is not read as an oversight |

**Not constraints — reserved decisions.** `CLAUDE.md` §3 explicitly leaves the **HTTP framework**, the
**query layer / ORM**, the **migration tool** and the **module decomposition** to the architect at
Gate B, each to be recorded as an ADR with alternatives considered. They are absent from this section
because listing a free choice as a constraint is how an architecture launders a preference into an
obligation.

### 2.3 Organisational constraints

| id | Constraint | Consequence |
|---|---|---|
| **OC-1** | This is a time-boxed technical assessment producing three artifacts: a system design document, a working repository, and a 5–10 minute video | Scope is bounded by what can be *demonstrated and defended*, not by what a production scheduler would need. §3.3's exclusions are a design output, not an apology |
| **OC-2** | GenAI use is mandatory, and *"your process for guiding and verifying the AI's work is a primary evaluation criterion"* | Verifiability is a graded quality goal (§1.2, rank 2), not only an engineering preference. Evidence must be derivable — from git, from CI, from tooling — rather than narrated |
| **OC-3** | One human engineer plus a team of AI agents; **WIP limit 1** (`CLAUDE.md` §8) | Human review attention is the scarce resource. The architecture is optimised to be reviewable in small vertical slices, which favours a decomposition with thin, stable interfaces over one that is merely elegant |
| **OC-4** | Role authority is fixed (`CLAUDE.md` §6). The architect decides interfaces, layering, data model and patterns, and **may not** change scope, acceptance criteria or quality goals | The four open questions in §1.4 could not be resolved by this document; they went to Gate A and were decided there (ADR-0001 to ADR-0004). Two of those rulings bind the architecture and appear below as §2.4 |
| **OC-5** | Test ownership is enforced by path, by a hook | The architecture must be testable *from outside* by a role that has never read `src/`. An interface that can only be exercised through internals is not an acceptable interface |
| **OC-6** | arc42 is the single source of truth for architecture; ADRs are immutable and superseded, never edited | Design history is a deliverable. A superseded ADR chain is evidence of thinking, not of churn |
| **OC-7** | Merge commits only; exactly one red commit per slice; every implementer commit green | The git history is itself an artifact under assessment, so slices must be small enough to keep it legible |
| **OC-8** | Everything from phase 1 onward lands through a pull request; each phase and slice ends at a human gate | Architecture is delivered incrementally and is corrected to as-built at each merge (§0 reader's guide) |

### 2.4 Constraints set at Gate A

Two of the four Gate A rulings (§1.4) are constraints in the sense this section means: they are scope
decisions taken by the human, they remove options the architect would otherwise have had, and under
OC-4 the architect may not revisit them. They sit here rather than in §4 for exactly that reason.

| id | Constraint | Imposed by | Consequence for the architecture |
|---|---|---|---|
| **GC-1** | A booking or reschedule whose derived interval falls outside the dealership's opening hours is rejected with **`400 Bad Request`**. Opening hours and an IANA time zone are reference data on the dealership. Technician shifts, holidays and absence are **not** modelled | Gate A, [ADR-0001](adr/0001-validate-dealership-opening-hours.md) | The check is request-local: it reads reference data and **no other booking**, so it is validation and not an availability check. It must sit on the validation path, before any candidate is considered, and must never acquire knowledge of what is booked — that would reintroduce check-then-act and breach §2.1. It is the only place in the system that reasons in wall-clock time (A-8) |
| **GC-2** | No authentication and no authorisation. The caller is trusted, supplies `customer_id` in the request body, and the OpenAPI document publishes no security scheme | Gate A, [ADR-0002](adr/0002-service-advisor-actor-no-authentication.md) | *"This vehicle belongs to this customer"* is a **validation** rule with a plain `4xx` failure, not a `403` and not a security boundary. No identity, session or actor is threaded through any layer, and no appointment records who booked it. §11 carries the retrofit cost, which is not additive: the rule changes layer and changes its observable failure mode |

The other two rulings — cancellation and rescheduling in scope ([ADR-0003](adr/0003-cancellation-and-rescheduling-in-scope.md)), and retry-then-refuse on
conflict ([ADR-0004](adr/0004-retry-across-remaining-candidates.md)) — are deliberately **not** listed here. Both expand what the system does rather
than fencing off the design space, so §1.4 and their ADRs are their home. ADR-0003 is the closer call,
because it does fix one mechanism: a move is a single atomic `UPDATE` and never a delete or cancel
followed by an insert. That prohibition is a direct application of the §2.1 invariant to a new
operation rather than a new restriction beside it, and it is stated once, in the ADR, where its
reasoning sits. Listing every decision here is how a document stops distinguishing what was imposed
from what was chosen.

---

## 3. Context and scope

*The context diagram is drawn in phase 2 with the rest of the presentation diagrams (METHODOLOGY §4);
this section is the text it will illustrate.*

### 3.1 Business context

The system sits alone. It has human actors and one persistent store, and **no neighbouring systems** —
that is the single most consequential fact about the context, and §3.1.2 justifies it rather than
leaving it as an omission.

#### 3.1.1 Actors

| Actor | Relationship | What crosses the boundary, in domain terms |
|---|---|---|
| **Service advisor** *(primary; ADR-0002, and see A-6)* | Books on a customer's behalf, typically while the customer is on the phone | **In:** a booking request — customer, vehicle, service type, dealership, desired start. **Out:** either a confirmed appointment naming the allocated bay, technician and interval; or a refusal stating which resource was unavailable, once every candidate has been tried (ADR-0004); or a rejection, if the request is invalid — an unknown or mismatched reference (A-6), or a time outside the dealership's opening hours (ADR-0001) |
| **Service advisor** *(same actor, changing a booking)* | The customer calls back: the car is not ready to come in, or Tuesday no longer works | **In:** a cancellation, or a reschedule naming an existing appointment and a new desired start (ADR-0003). **Out:** the cancelled or moved appointment — the id is unchanged by a move — or a refusal. A refused move is the interesting outcome and the contract states it: **the original appointment is still confirmed, at its original time** |
| **Service advisor** *(same actor, browsing)* | Looks for a workable slot before committing | **In:** an availability enquiry — dealership, service type, time window. **Out:** candidate intervals and resources, **explicitly advisory**: a slot returned as free may be taken by the time it is booked, and the boundary contract says so. This is the direct consequence of `CLAUDE.md` §2.1 and it is a property of the *domain* interface, not an implementation detail |
| **Customer / vehicle owner** | The party the appointment is for | Nothing crosses. Under ADR-0002 the customer does not touch the system; the advisor acts for them and names them by `customer_id` in the request. They are named here because had the ruling gone the other way they would be an actor and the boundary would change shape — identity would arrive *with* the request rather than inside it |
| **Service manager** | Owns the reference data — bays, technicians, qualifications, service types, and the dealership's opening hours and time zone (ADR-0001) — and reads the day's schedule | **In:** reference data, as seed and migration rather than across the API (A-7). **Out:** the schedule, by reading appointments |
| **Technician** | **A resource, not a user.** Consumed by an appointment, exclusively, for its whole duration (A-2) | Nothing crosses. Recorded because the temptation to model a technician as a user of a scheduling system is strong and would expand the scope considerably |
| **Operator** | Runs and watches the service | **Out:** health and readiness, traces, metrics, structured logs. Notably `booking_conflicts_total{resource}` — the invariant made observable |

#### 3.1.2 Why there are no neighbouring systems

The scenario is titled *"The Unified Service Scheduler"*, which reads as though it might federate
existing booking systems. The task text does not support that: *"Build an Appointment Scheduler
application to replace manual booking systems."* The thing being replaced is a **manual** process — a
paper diary, a whiteboard, a phone call — so "unified" is read as *one scheduler across a dealership
group* (A-9), not *one view over several schedulers*. Scenario D is the integration scenario; this is
not it.

A production deployment would still have neighbours — a DMS owning customers and vehicles, an
identity provider, a notification service, a parts system. Every one of them is excluded in §3.3 and
carried in §11 rather than quietly ignored, because "no integrations" is a decision with a shelf life.

### 3.2 Technical context

The same boundaries as protocols and formats. There are three.

| Boundary | Direction | Protocol and format | Notes |
|---|---|---|---|
| **Stubbed client → Scheduler API** | inbound | HTTP/1.1, JSON request and response bodies. Timestamps are RFC 3339 with an offset (A-8). Operations: book, cancel, reschedule (ADR-0003), query availability, read an appointment. `customer_id` is a body field and **no security scheme is published** (ADR-0002, GC-2). Contract published as an **OpenAPI** document; exercised by a **cURL harness** (TC-5) | The only interface a reader of this repository can actually see, since there is no UI. It therefore carries the domain vocabulary of §3.1 rather than a persistence-shaped one |
| — *outcomes on that boundary* | outbound | `2xx` with the appointment; **`400 Bad Request`** for a malformed request or one outside the dealership's opening hours (ADR-0001, GC-1); a `4xx` for an unknown or mismatched reference, ownership included (A-6, GC-2); **`409 Conflict`** where every candidate has been refused by the database (SQLSTATE `23P01`, ADR-0004) | The `409` is the invariant surfacing at the boundary, and after ADR-0004 it means *the dealership had nothing free* rather than *we guessed badly*. Keeping the out-of-hours case a `400` is deliberate: it is decidable without reading any booking, so calling it a conflict would corrupt `booking_conflicts_total` as a signal. The error body's media type — RFC 9457 `application/problem+json` is the obvious candidate — is a Gate B choice, not a constraint |
| **Scheduler → PostgreSQL** | outbound | PostgreSQL wire protocol over TCP, pooled. `timestamptz` columns; `tstzrange` in the exclusion constraint; the `btree_gist` extension (TC-3) | Not a generic persistence port. The correctness of the system lives on this boundary, which is why §2.1 forbids substituting it in tests |
| **Scheduler → telemetry collector** | outbound | **OTLP** traces and metrics to a local `grafana/otel-lgtm` container; `pino` JSON log lines on stdout, correlated by trace id | Availability check and insert are separate spans by design, so the window that check-then-act would have raced in is visible in a waterfall even though the code never relies on it |

Transport security, gateways, load balancers and TLS termination are absent: the deployment is a
single local container (§7 will say so and say why). Adding them is a deployment concern that does
not move any boundary in this table.

### 3.3 Out of scope

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
  ([ADR-0001](adr/0001-validate-dealership-opening-hours.md)). **†** A technician is bookable whenever the dealership is open. Excluded because
  shift and absence data is a *resource availability* rule, which would sit beside the one the
  exclusion constraint enforces and need its own mechanism and its own quality scenario. Dealership
  opening hours are **not** in this exclusion: they are validated, because they are decidable from the
  request alone.
- **Public holidays and one-off closures** ([ADR-0001](adr/0001-validate-dealership-opening-hours.md)). **†** Opening hours are the same every week of the year.
- **Authentication, authorisation, sessions, rate limiting and per-actor audit**
  ([ADR-0002](adr/0002-service-advisor-actor-no-authentication.md), GC-2). **†** The service is therefore unsafe to expose on any reachable network,
  which is acceptable only because §7 deploys a single local container. Vehicle ownership is checked,
  but as validation — no appointment records who booked, moved or cancelled it.
- **Cancellation policy** — notice periods, fees, or any restriction on cancelling an appointment that
  has already begun ([ADR-0003](adr/0003-cancellation-and-rescheduling-in-scope.md)). Cancellation and rescheduling themselves are in scope; the *policy*
  around them is not.
- **Appointment history** — a moved appointment shows only its current interval; where it was moved
  from is not retained ([ADR-0003](adr/0003-cancellation-and-rescheduling-in-scope.md)). **†**
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

A reader who disagrees with any line above is disagreeing about scope, not about architecture. Gate A
is closed, so that disagreement is now resolved by superseding the ADR that decided it — which is the
point of keeping the ADRs immutable.

---

## 4. Solution strategy

*The shortest section that carries the most weight: the handful of decisions everything else
follows from, each linked to its ADR.*

### 4.1 Preventing double-booking

*The central decision. Must name check-then-act as a considered and rejected alternative, and
explain why correctness is delegated to the database rather than to application code.*

### 4.2 Technology decisions

*Each with its ADR. A technology named without a rejected alternative is a preference, not a decision.*

### 4.3 Achieving the quality goals

*How the §1.2 goals map onto structure.*

---

## 5. Building block view

### 5.1 Level 1 — containers

*C4 container view. Diagram: `diagram-design`, exported to SVG and referenced here.*

### 5.2 Level 2 — components

*Whitebox of the service.*

### 5.3 Module dependency graph

*Generated from `dependency-cruiser`, never hand-drawn — a hand-drawn dependency graph is a claim,
a generated one is a fact. The same configuration enforces these boundaries in CI.*

---

## 6. Runtime view

### 6.1 Concurrent booking — the database decides

**Mandatory.** Two racing requests for the same bay; the exclusion constraint commits the first and
rejects the second with `23P01`, which the service maps to `409 Conflict`. This is the scenario the
whole design exists to make safe, so it is documented before the happy path.

### 6.2 Availability query

### 6.3 Successful booking

---

## 7. Deployment view

*Deliberately minimal: a single-container local deployment plus a PostgreSQL instance and one
`grafana/otel-lgtm` container for telemetry. What a production deployment would additionally
require is stated in §11 rather than invented here — three paragraphs of speculative Kubernetes
topology would be padding, not design.*

---

## 8. Cross-cutting concepts

### 8.1 Domain model

### 8.2 Persistence and the exclusion constraint

*Where the central invariant physically lives, and what that implies for testing.*

### 8.3 Observability

*OpenTelemetry traces with `pino` logs correlated by trace id. Spans around the availability check
and the insert separately, so the check-then-act window is visible in a waterfall. Metrics are
domain metrics — `appointments_booked_total`, `booking_conflicts_total`,
`availability_query_duration_seconds` — because CPU graphs do not tell you whether the business
invariant held.*

### 8.4 Testability

*Test levels, ownership, and why acceptance tests are written by a role that never reads `src/`.*

### 8.5 Error handling and API semantics

---

## 9. Architecture decisions

Decisions live as individual MADR files under [`docs/adr/`](adr/). They are **immutable**: an
accepted ADR is never edited, only superseded by a later one that references it. The record of how
thinking changed is the reason to keep them at all.

Each carries `proposed-by`, `decided-by` and `ai-input`, so where an agent's recommendation was
accepted, modified or overridden is visible without taking anyone's word for it.

| ADR | Title | Status | Supersedes |
|---|---|---|---|
| [0001](adr/0001-validate-dealership-opening-hours.md) | Validate dealership opening hours, do not model technician shifts | accepted | — |
| [0002](adr/0002-service-advisor-actor-no-authentication.md) | Treat the service advisor as the actor and leave authentication out of scope | accepted | — |
| [0003](adr/0003-cancellation-and-rescheduling-in-scope.md) | Support cancellation and rescheduling, and move an appointment with one atomic UPDATE | accepted | — |
| [0004](adr/0004-retry-across-remaining-candidates.md) | On exclusion violation, try the next candidate and refuse only when the list is exhausted | accepted | — |



---

## 10. Quality requirements

### 10.1 Quality tree

### 10.2 Quality scenarios

Each scenario is written so it can be executed, and names the test that enforces it. CI fails if a
scenario names a test that does not exist.

| id | Scenario | Enforced by |
|---|---|---|
| QS-1 | *(stimulus → response, measurable)* | *(test path)* |

*"The system should be fast" is not a quality scenario. "No two confirmed appointments may share a
bay with overlapping intervals under any interleaving of concurrent requests" is.*

---

## 11. Risks and technical debt

### 11.1 Deferred improvements

Generated: every ADR with `status: proposed` and every deferred-improvement slice is, by
construction, a debt item traceable to the decision that created it.

_No deferred improvements recorded._

### 11.2 Known risks

### 11.3 What production would additionally require

*Named honestly. Scope that was cut deliberately is judgement; scope that was cut silently is a gap.*

---

## 12. Glossary

Domain terms only. Process vocabulary lives in `docs/METHODOLOGY.md`.

| Term | Meaning |
|---|---|
| Service bay | A physical workspace at a dealership; a booking occupies exactly one for its duration |
| Technician | A person qualified for particular service types |
| Service type | A category of work with an expected duration and required qualification |
| Appointment | The persisted record binding customer, vehicle, technician, bay and interval |

---

## 13. AI collaboration

Sourced from artifacts, never from memory: the ADR set, PR threads, `docs/team-log/events.jsonl`,
the prompt library under `docs/team-log/prompts/`, and git history. Every claim here cites one.

### 13.1 Team structure and bounded authority

### 13.2 Verification — what it caught

*Independent acceptance tests, the mutation audit, hook-enforced path locks, the red-commit trail.
With what each actually found, not what it was intended to find.*

### 13.3 Where the human overrode the agents

*From ADR `ai-input` fields and `gate.decided` events.*

### 13.4 Design changes and the superseding chain

### 13.5 What the process cost

*Per role, from the token collector. Reconstructed from session transcripts, not a billing record,
and labelled as such.*

### 13.6 What did not work

*This subsection is worth more than the ones above it.*

---

*Architecture documentation follows [arc42](https://arc42.org), used under CC BY-SA.*
