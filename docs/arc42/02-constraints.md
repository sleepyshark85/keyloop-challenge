# 2. Architecture constraints

> Owner: architect · Written: phase 1 · Gate A

A constraint is something **imposed** — by the brief, by the human, by the constitution, or by the
environment. Anything the architect is free to choose is not a constraint; it belongs in §4 with an
ADR. The boundary is stated at the end of §2.2 so a reader does not go looking here for decisions that
were never taken here.

## 2.1 Standing invariants

Decided before the architecture, and not open to relitigation. Full statements in `CLAUDE.md` §2.

| Constraint | Consequence |
|---|---|
| Double-booking is prevented by a PostgreSQL exclusion constraint, never by application code | Check-then-act is forbidden; the service maps SQLSTATE `23P01` to `409 Conflict` |
| Tests asserting persistence run against real PostgreSQL via Testcontainers | No SQLite, no in-memory repository, no mocked database |
| Layering is enforced by `dependency-cruiser` in CI | Conformance is a build failure, not a reviewer's opinion |
| Every slice begins with a failing acceptance test, committed red by a different author | A test that has never failed is not evidence |

These four are the reason the rest of the document is short. Each removes a class of decision from
the design space rather than adding to it.

## 2.2 Technical constraints

| id | Constraint | Imposed by | Consequence for the architecture |
|---|---|---|---|
| **TC-1** | TypeScript on Node | Human, phase 0 | Language and runtime are not an open decision |
| **TC-2** | PostgreSQL as the persistent store | Required by the `CLAUDE.md` §2.1 invariant | The invariant is expressed in a PostgreSQL-specific feature. This is a deliberate, load-bearing coupling: portability to another engine is given up in exchange for the correctness guarantee, and §11 records that trade |
| **TC-3** | The database must permit `CREATE EXTENSION btree_gist` | The exclusion constraint mixes an equality column with a range column, which GiST cannot index without it | Rules out any deployment target that restricts extension installation. Testcontainers grants superuser, so tests are unaffected; a managed-Postgres deployment must be checked against this before it is chosen |
| **TC-4** | A RESTful HTTP API over a persistent database | Brief: *"If you choose Backend: Expose a RESTful API and use a persistent database"* | Not a message bus, not GraphQL, not RPC |
| **TC-5** | Backend only; the client layer is stubbed with an OpenAPI contract and a cURL harness | Brief: *"Choose one service layer to implement fully"*; `CLAUDE.md` §1 | The API contract is a deliverable in its own right, because it is the only description of the boundary that a reader gets |
| **TC-6** | Vitest, Testcontainers, `fast-check`, Stryker | Human, phase 0 | The test strategy is fixed at four levels; mutation score is an available signal and §10 may rely on it |
| **TC-7** | `dependency-cruiser` for layering, authored by the architect | `CLAUDE.md` §2.3 | Whatever decomposition §5 defines must be expressible as a machine-checkable rule set. A layering that cannot be written down as rules is not an acceptable layering |
| **TC-8** | OpenTelemetry with `pino`, correlated by trace id | Human, phase 0; the brief requires an observability strategy | Instrumentation is designed in, not retrofitted; §8 must name the spans and metrics |
| **TC-9** | Docker must be present to run the tests that prove this system correct | METHODOLOGY §0 — Testcontainers and the local `grafana/otel-lgtm` stack | **The constraint is real and narrower than total, and both halves matter.** A Docker-less runner cannot run the `db` project, and `CLAUDE.md` §2.2 (NON-NEGOTIABLE) means no substitute is permitted for any test asserting a persistence invariant — so on such a runner the central invariant is untested and no amount of green says otherwise. What it *can* run, as built from slice 01, is the `nodb` project (§7.2): unit, architecture and the database-free property tests. That is the subset that would have passed anyway, which is exactly why the constraint is not weakened by it. Still the most likely reason a reader's first `npm test` fails, and still what makes the CI runner a **correctness** choice rather than a convenience one — see ADR-0010 and §7.4 |
| **TC-10** | Node and npm versions are pinned at Gate B | METHODOLOGY §0 | Pinned in `package.json` `engines` (§7.1) and **enforced** by `npm ci --engine-strict` in CI (ADR-0010). Enforcement is CI-only: making it bite locally as well needs `.npmrc`, which ADR-0010 recommends and leaves to the human |

**Not constraints — reserved decisions.** The **HTTP framework**, the **query layer / ORM**, the
**migration tool** and the **module decomposition** were reserved to the architect at phase 0 and
decided at Gate B, each with the alternative it beat ([ADR-0005](../adr/0005-fastify-with-typebox-schemas.md)
to [ADR-0008](../adr/0008-module-decomposition.md), §4.2). They are absent from this section because
listing a free choice as a constraint is how an architecture launders a preference into an
obligation.

## 2.3 Organisational constraints

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

## 2.4 Constraints set at Gate A

Two of the four Gate A rulings (§1.4) are constraints in the sense this section means: they are scope
decisions taken by the human, they remove options the architect would otherwise have had, and under
OC-4 the architect may not revisit them. They sit here rather than in §4 for exactly that reason.

| id | Constraint | Imposed by | Consequence for the architecture |
|---|---|---|---|
| **GC-1** | A booking or reschedule whose derived interval falls outside the dealership's opening hours is rejected with **`400 Bad Request`**. Opening hours and an IANA time zone are reference data on the dealership. Technician shifts, holidays and absence are **not** modelled | Gate A, [ADR-0001](../adr/0001-validate-dealership-opening-hours.md) | The check is request-local: it reads reference data and **no other booking**, so it is validation and not an availability check. It must sit on the validation path, before any candidate is considered, and must never acquire knowledge of what is booked — that would reintroduce check-then-act and breach §2.1. It is the only place in the system that reasons in wall-clock time (A-8) |
| **GC-2** | No authentication and no authorisation. The caller is trusted, supplies `customer_id` in the request body, and the OpenAPI document publishes no security scheme | Gate A, [ADR-0002](../adr/0002-service-advisor-actor-no-authentication.md) | *"This vehicle belongs to this customer"* is a **validation** rule with a plain `4xx` failure, not a `403` and not a security boundary. No identity, session or actor is threaded through any layer, and no appointment records who booked it. §11 carries the retrofit cost, which is not additive: the rule changes layer and changes its observable failure mode |

The other two rulings — cancellation and rescheduling in scope ([ADR-0003](../adr/0003-cancellation-and-rescheduling-in-scope.md)), and retry-then-refuse on
conflict ([ADR-0004](../adr/0004-retry-across-remaining-candidates.md)) — are deliberately **not** listed here. Both expand what the system does rather
than fencing off the design space, so §1.4 and their ADRs are their home. ADR-0003 is the closer call,
because it does fix one mechanism: a move is a single atomic `UPDATE` and never a delete or cancel
followed by an insert. That prohibition is a direct application of the §2.1 invariant to a new
operation rather than a new restriction beside it, and it is stated once, in the ADR, where its
reasoning sits. Listing every decision here is how a document stops distinguishing what was imposed
from what was chosen.
