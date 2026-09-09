# 2. Architecture constraints

> Owner: architect · Written: phase 1 · Gate A

A constraint is something **imposed** — by the brief, the human, the constitution or the environment.
Anything the architect was free to choose belongs in §4 with an ADR.

## 2.1 Standing invariants

Decided before the architecture and not open to relitigation. Full statements in `CLAUDE.md` §2.

| Constraint | Consequence |
|---|---|
| Double-booking is prevented by a PostgreSQL exclusion constraint, never by application code | Check-then-act is forbidden; the service maps SQLSTATE `23P01` to `409 Conflict` |
| Tests asserting persistence run against real PostgreSQL via Testcontainers | No SQLite, no in-memory repository, no mocked database |
| Layering is enforced by `dependency-cruiser` in CI | Conformance is a build failure, not a reviewer's opinion |
| Every slice begins with a failing acceptance test, committed red by a different author | A test that has never failed is not evidence |

## 2.2 Technical constraints

Fixed by the human at phase 0: **TC-1** TypeScript on Node; **TC-6** Vitest, Testcontainers,
`fast-check` and Stryker, so the test strategy is four levels and §10 may rely on mutation score;
**TC-8** OpenTelemetry with `pino` correlated by trace id, so instrumentation is designed in rather than
retrofitted (§8.4). Fixed by the brief: **TC-4** *"Expose a RESTful API and use a persistent database"*
— not a message bus, GraphQL or RPC; **TC-5** *"Choose one service layer to implement fully"*, which
stubs the client and makes the OpenAPI contract the only description of the boundary a reader gets.

Following from §2.1: **TC-2** PostgreSQL, a load-bearing coupling that gives up portability for the
correctness guarantee (§11 records the trade); **TC-3** the database must permit
`CREATE EXTENSION btree_gist`, since the constraint mixes an equality column with a range column and
GiST cannot index that without it — ruling out any target restricting extension installation, though
Testcontainers grants superuser; **TC-7** `dependency-cruiser` enforces layering, so a layering not
expressible as a machine-checkable rule set is unacceptable; **TC-9** Docker must be present, because a
Docker-less runner cannot run the `db` project and no substitute is permitted for a persistence
invariant — it runs the subset that would have passed anyway (§7.2), and is the most likely reason a
reader's first `npm test` fails. **TC-10** pins Node and npm in `package.json` `engines`, enforced by
`npm ci --engine-strict` in CI only (§7.1).

**Not constraints — reserved decisions.** The **HTTP framework**, **query layer**, **migration tool**
and **module decomposition** were reserved to the architect and decided at Gate B
([ADR-0005](../adr/0005-fastify-with-typebox-schemas.md) to
[ADR-0008](../adr/0008-module-decomposition.md), §4.2). Listing a free choice as a constraint is how an
architecture launders a preference into an obligation.

## 2.3 Organisational constraints

A **time-boxed assessment** producing a design document, a repository and a 5–10 minute video, so scope
is bounded by what can be *demonstrated and defended*. **GenAI use is mandatory** and the brief grades
*"your process for guiding and verifying the AI's work"*, which is why verifiability is a ranked quality
goal and why evidence is derived from git, CI and tooling rather than narrated. **One human engineer, a
team of AI agents, WIP limit 1**: human review attention is the scarce resource, so the architecture is
optimised to be reviewable in thin vertical slices. **Test ownership is enforced by path**, so the
system must be testable from outside by a role that has never read `src/`. **arc42 is the single source
of truth and ADRs are immutable**, superseded rather than edited. The git history is itself an assessed
artifact: one red commit per slice, every implementer commit green, every merge through a human gate.

## 2.4 Constraints set at Gate A

Two of the four Gate A rulings remove options the architect would otherwise have had.

**GC-1** — a booking or reschedule whose derived interval falls outside the dealership's opening hours
is rejected **`400 Bad Request`**; opening hours and an IANA zone are reference data on the dealership,
and shifts, holidays and absence are **not** modelled
([ADR-0001](../adr/0001-validate-dealership-opening-hours.md)). The check reads reference data and **no
other booking**, so it is validation rather than an availability check, and it is the only place in the
system that reasons in wall-clock time (A-8).

**GC-2** — no authentication and no authorisation; the caller is trusted, supplies `customer_id` in the
request body, and the OpenAPI document publishes no security scheme
([ADR-0034](../adr/0034-the-caller-is-a-user-and-the-system-does-not-name-the-role.md)). *"This vehicle
belongs to this customer"* is **validation** with a plain `4xx` failure, not a `403`; no actor is
threaded through any layer and no appointment records who booked it. §11.3 carries the retrofit, which
is not additive.

The other two rulings expand what the system does rather than fencing off the design space, so §1.4 and
their ADRs are their home.
