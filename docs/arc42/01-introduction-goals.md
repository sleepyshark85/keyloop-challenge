# 1. Introduction and goals

> Owner: architect · Written: phase 1 · Gate A

## 1.1 Requirements overview

A service-appointment scheduler for automotive dealerships. The brief's three core requirements, quoted
because everything below traces to them:

1. **Resource Constrained Booking** — *"Allow a user to request a service appointment for a specific
   vehicle, service type, and dealership at a desired time."*
2. **Real-Time Availability Check** — *"Before confirming, check for the availability of both a
   ServiceBay and a qualified Technician for the entire service duration."*
3. **Confirmed Appointment Record** — *"Upon success, create a persistent Appointment record
   associating the customer, vehicle, technician, and service bay."*

**What the system does.** A booking request names a customer, a vehicle, a service type, a dealership
and a desired start — not a bay or a technician, which the system allocates. The server derives the
interval from the service type's duration, finds a bay and a qualified technician free for the whole
interval, and persists one Appointment binding all five; if either is unavailable, nothing is written.
A separate read-only availability query answers *"what is free?"* for the booking screen.

**Why this is not a CRUD exercise.** One booking consumes two independently scarce physical resources
over the same span, concurrently, and the failure that matters — two customers both told bay 3 is
theirs — software cannot undo. The brief's own wording invites it: *"Before confirming, check for the
availability"* is check-then-act. So overlap is made unrepresentable by a PostgreSQL exclusion
constraint (§4.1): **requirement 2 is honoured as a UX affordance, requirement 3's integrity by the
database.**

**Scale, and boundaries.** Several dealerships in one deployment, single-digit bays and tens of
technicians each, tens of appointments a day — but real bursts of contention, because everyone wants
08:00 on a Saturday. Backend only per *"Choose one service layer to implement fully"*, with the client
an OpenAPI contract and a cURL harness and nothing external integrated (§3.3).

## 1.2 Quality goals

Ranked, because unranked goals constrain nothing: the ranking says which way to resolve a trade-off.
Each becomes executable scenarios in §10. The ranking is the human's, ratified at Gate A.

| # | Quality goal | Why it ranks here |
|---|---|---|
| **1** | **Booking integrity under concurrency** — no two non-cancelled appointments share a bay or a technician over overlapping intervals, under any interleaving | The only property whose violation the software cannot undo |
| **2** | **Verifiability** — invariant by concurrency tests against real PostgreSQL, layering by `dependency-cruiser`, test quality by mutation score, *done* by a script | An unverified invariant is a claim, not a property; the brief grades the process for verifying AI output |
| **3** | **Modifiability** — a change to one of §1.4's ambiguities is absorbed by one building block plus a migration | §1.4 makes it near-certain the domain model *will* change |
| **4** | **Observability** — check and insert are separate spans, so the check-then-act window is visible in a waterfall; `booking_conflicts_total{resource}` makes goal 1 measurable in production | Requested by the brief; below modifiability because it reports on the system rather than constituting it |
| **5** | **Performance** — availability within a human-interactive budget, a booking one round trip | Last **deliberately, with a stated cost**: the mechanism serialises conflicting writes, a ceiling orders of magnitude from binding (§11.2 R-1) |

Where two goals conflict the lower-numbered one wins, and the loss is recorded in §11 as debt.

## 1.3 Stakeholders

**The system does not name its primary actor, deliberately**: the brief says only *"allow **a user** to
request a service appointment"*, and
[ADR-0034](../adr/0034-the-caller-is-a-user-and-the-system-does-not-name-the-role.md) withdraws the
earlier naming while keeping its scope — authentication is out because the client layer is stubbed.

**A user** books, cancels and reschedules for a customer named in the request, wanting a yes/no in
seconds and, on a no, *which* resource was unavailable. The **customer / vehicle owner** wants the
appointment honoured on arrival. The **service manager** wants no technician double-committed and no
bay idled by a needless refusal, and owns the reference data. A **technician** is a *resource*, not a
user: one job at a time (A-2). The **operator** sees health, conflicts and latency without a debugger.
The **human engineer** who submits this owns scope, acceptance criteria and quality goals; the **Keyloop
assessor** reads under time pressure and wants the reasoning. A **downstream integrator** is out of
scope, named so the omission is visible.

## 1.4 Assumptions

Ambiguity is deliberate in the brief and none of it is resolved silently. An **assumption (A-n)** is a
reading the architect took, with what changes if it is wrong; Gate A left all ten standing. Four further
ambiguities were **scope** decisions and went to the human as ADR-0001 to ADR-0004. Overturning one
means superseding its ADR.

### Assumptions taken

| id | Reading taken | If the reading is wrong |
|---|---|---|
| **A-1** | Duration is **fixed per service type**, not varying by vehicle. The request carries a start; the server derives the end and never trusts a client-supplied one | Duration becomes a function of *(service type, vehicle)*; the invariant is untouched, the constraint taking whatever interval it is given |
| **A-2** | A technician **cannot** cover two bays at once — exclusively committed for the whole appointment | Already settled: the constraint on `technician_id` *is* the statement that capacity is one; capacity-*n* needs another mechanism (§11.2 R-2) |
| **A-3** | Qualification is **dealership-scoped through employment**: a technician is employed by exactly one dealership | Floating technicians need an assignment table with validity periods, and a join in the eligibility query |
| **A-4** | **No setup or cleanup buffer**: the appointment interval *is* the occupancy interval | One migration and one constraint change; the reading most likely to be wrong in a real dealership, and why §5 names "the interval the constraint sees" |
| **A-5** | *"A desired time"* is an **exact start**, not a preference: *"can I have 09:00 on Tuesday?"*, not *"find me something Tuesday"* | Booking becomes search-then-book, availability starts driving allocation: one word, double the scope |
| **A-6** | Customer, vehicle and reference data **already exist**, seeded. Booking references by id and fails with a client error if one is absent or mismatched | Booking becomes a multi-entity transaction; the **single `INSERT`** is what makes the invariant simple to state and test |
| **A-7** | Reference data is **not** managed through the API: migrations and fixtures. The API is book, read, cancel, reschedule, availability | Conventional CRUD, no interesting risk |
| **A-8** | Time crosses as **instants**: RFC 3339 with an offset on the wire, `timestamptz` in storage, `tstzrange` in the constraint | Nothing — this reading is what makes the invariant zone-safe; the dealership's IANA zone serves opening-hours validation alone (ADR-0001) |
| **A-9** | **Many dealerships** in one deployment — the *"Unified"* of the title. A bay and a technician belong to exactly one | Single-tenant drops a scoping predicate: harmless wrong that way, expensive the other |
| **A-10** | The requester **does not choose** bay or technician. The brief's request names a vehicle, service type, dealership and time, conspicuously not resources | Pinning a technician makes allocation optional and reshapes ADR-0004's conflict semantics |

### Decided at Gate A — the four questions the architect could not answer

| id | Ruling | Record |
|---|---|---|
| **OQ-1** | Opening hours and shifts: **hours validated, shifts not modelled.** Validating hours cannot reintroduce check-then-act — they are a static property of the *request* | [ADR-0001](../adr/0001-validate-dealership-opening-hours.md) — *architect's recommendation overridden* |
| **OQ-2** | The actor and authentication: **neither.** The actor is unnamed; vehicle ownership is **validation**, not a security control | [ADR-0002](../adr/0002-service-advisor-actor-no-authentication.md), superseded by [ADR-0034](../adr/0034-the-caller-is-a-user-and-the-system-does-not-name-the-role.md) |
| **OQ-3** | Cancellation and rescheduling: **both in scope.** Cancellation is a `confirmed → cancelled` transition, making the constraint's `WHERE (status <> 'cancelled')` predicate testable; a reschedule is a **single atomic `UPDATE`** | [ADR-0003](../adr/0003-cancellation-and-rescheduling-in-scope.md) — *human expanded scope and fixed the mechanism* |
| **OQ-4** | A conflict while capacity remained: **retry across the remaining candidates, then refuse.** The candidate read stays **advisory**, so this is not check-then-act | [ADR-0004](../adr/0004-retry-across-remaining-candidates.md) — *accepted as recommended* |

*Not asked at Gate A:* HTTP framework, query layer, migration tool and module decomposition were
reserved to the architect and decided at Gate B (§4.2).
