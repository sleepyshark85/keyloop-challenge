# 4. Solution strategy

> Owner: architect · Written: phase 2 · Gate B

Five decisions. Everything in §5 to §8 follows from them, and each links to the record that argues
it. This section is short on purpose: if it needs a sixth paragraph to explain a choice, the choice
belongs in an ADR.

## 4.1 Preventing double-booking

**The system does not check whether a resource is free before booking it. It attempts the booking and
lets PostgreSQL refuse.**

The brief asks for the opposite in as many words — *"Before confirming, check for the availability of
both a ServiceBay and a qualified Technician"* — and that wording describes the defect. Written
literally it is:

```ts
// REJECTED — the shape the brief's wording invites
const free = await checkAvailability(bayId, interval);
if (free) await createAppointment(bayId, interval);   // ← another request booked it here
```

Two requests arriving at 09:00:00.000 both read *free*, both insert, and both customers are told bay 3
is theirs. The window between the read and the write is not a small window to be narrowed; it is a
window that cannot be closed by any amount of care in application code, because the read's result
stops being true the instant it is returned. Every mitigation that keeps the shape — a shorter
window, a re-check, a version column, a `SELECT … FOR UPDATE` over a row that does not yet exist —
either fails under some interleaving or is a lock in disguise.

**Check-then-act was considered and is rejected.** So is its serious cousin, a per-dealership
application lock (or `SERIALIZABLE` isolation), under which check-then-act would genuinely be
*correct*. That option is rejected on a different ground and it is the more interesting one: a lock
makes correctness depend on every present and future write path remembering to take it. One missed
call site — a repair script, a new endpoint, a well-meant refactor — and the guarantee is silently
gone, with nothing failing until two cars arrive for the same ramp. The full argument is
[ADR-0004](../adr/0004-retry-across-remaining-candidates.md) Option D.

Instead, **overlap is made unrepresentable**. Two PostgreSQL exclusion constraints (`CLAUDE.md` §2.1,
verbatim in §8.2) make a row that overlaps an existing non-cancelled appointment on the same bay, or
on the same technician, an object the database will not store. The consequences run through the whole
design:

- **Correctness is a property of the data, not of the code.** It holds for the API, for a migration,
  for a `psql` session, for a bug. There is no call site to forget.
- **The write is the decision.** A booking exists if and only if PostgreSQL accepted the statement.
  Nothing upstream is authorised to conclude anything.
- **Availability queries become advisory**, and the API says so out loud (§3.1, §8.6). They exist for
  the service advisor's user experience. Requirement 2 of the brief is honoured as a UX affordance;
  requirement 3's integrity is honoured by the database.
- **The failure mode is a specific, catchable one.** SQLSTATE `23P01` with the violated constraint
  named, which §8.6 maps to `409 Conflict` and §8.4 counts as `booking_conflicts_total{resource}`.

Three later decisions sit on top of this without moving it. A reschedule is one atomic `UPDATE` on
the existing row, so a refused move leaves the original confirmed and never transiently releases its
slot ([ADR-0003](../adr/0003-cancellation-and-rescheduling-in-scope.md)). On `23P01` the next candidate is attempted and `409` is returned only when
none is left, so a refusal means the dealership was full rather than that the allocator guessed badly
([ADR-0004](../adr/0004-retry-across-remaining-candidates.md), [ADR-0009](../adr/0009-candidate-ordering-and-attempt-cap.md)). Opening hours are validated before any candidate is considered — a rule
decidable from the request alone, so it cannot reintroduce a check-then-act window
([ADR-0001](../adr/0001-validate-dealership-opening-hours.md), GC-1). None of the three adds a second place where correctness lives.

## 4.2 Technology decisions

§2.2 fixes TypeScript, Node, PostgreSQL, Vitest, Testcontainers, `fast-check`, Stryker,
`dependency-cruiser`, OpenTelemetry and `pino` — the human's, at phase 0 — and reserves four choices
to this gate. They are taken here, each with the alternative that was rejected and why — a technology
named without a rejected alternative is a preference, not a decision.

| Choice | Decision | The rejected alternative that mattered | Record |
|---|---|---|---|
| **HTTP framework** | **Fastify** with TypeBox route schemas; the OpenAPI document is *emitted* from those schemas, not written | **Express** — the contract would be hand-authored beside hand-written validation, two sources of truth for one fact. **NestJS** — its module system is a second answer to "what is a layer" beside `dependency-cruiser`, which TC-7 makes the authority | [ADR-0005](../adr/0005-fastify-with-typebox-schemas.md) |
| **Query layer** | **Kysely** as a typed SQL builder over `pg`. No ORM anywhere | **Prisma**, disqualified twice over: exclusion constraints and `tstzrange` do not exist in its schema language, and it wraps the driver error so `23P01` and `err.constraint` would have to be recovered by parsing a message string. **`pg` alone** was the close runner-up and lost only on §1.2 goal 3 | [ADR-0006](../adr/0006-kysely-as-typed-sql-builder.md) |
| **Migration tool** | **`node-pg-migrate`** running plain `.sql` files | **`drizzle-kit` / `prisma migrate`** — a generator that cannot express the exclusion constraint would be confidently incomplete about the schema's most important object. **A hand-rolled runner** — a small program with a large blast radius, and nothing the assessment grades | [ADR-0007](../adr/0007-node-pg-migrate-with-sql-files.md) |
| **Module decomposition** | **Five layered modules around a dependency-free policy core**; layer boundaries chosen so each §1.4 ambiguity lands in one module | **Ports and adapters** — a `BookingRepository` port is an interface that *can* be implemented in memory, and any in-memory implementation is a check-then-act booking. Offering the socket invites the substitution `CLAUDE.md` §2.2 bans | [ADR-0008](../adr/0008-module-decomposition.md) |

A fifth decision closes the two parameters [ADR-0004](../adr/0004-retry-across-remaining-candidates.md) explicitly deferred to this gate: candidates are
ordered by a **seeded shuffle** so concurrent requests disagree about what to try first, a `23P01`
prunes the **whole resource** that the violated constraint names rather than only the pair that
failed, and attempts are capped at **16** ([ADR-0009](../adr/0009-candidate-ordering-and-attempt-cap.md)). The pruning rule is what makes a cap that
small meaningful: it changes the attempt bound from bays × technicians to bays + technicians.

One rejection is worth naming because it is not in any table. There is **no shared SQL function**
defining "the interval the constraint sees", even though A-4 asks for that concept to be named and a
function would appear to unify the exclusion constraint with the availability query. Redefining an
`IMMUTABLE` function that a GiST index depends on does not rebuild the index — the index simply
becomes wrong, silently. The concept is named in `src/domain/interval.ts` and the agreement between
the two SQL expressions is held by a test instead (QS-8), which is slower to write and impossible to
get silently wrong.

## 4.3 Achieving the quality goals

How each §1.2 goal is bought, in the order the human ranked them.

**1 — Booking integrity under concurrency.** §4.1, in the database. The structural support is
`sql-only-in-persistence` in `.dependency-cruiser.js`: `pg` and `kysely` are importable from
`src/persistence` and nowhere else, so SQLSTATE translation has exactly one site and a second one
cannot be added without failing CI. QS-1 to QS-9 assert the property against real PostgreSQL under
concurrency.

**2 — Verifiability.** Nothing here is asserted that something cannot check. The invariant is checked
by concurrency tests against a real database (§2.2); the layering by `dependency-cruiser` (§5.3);
test quality by Stryker; the OpenAPI contract by regenerating it and failing on a diff; *done* by
`npm run slice:check`. §10 names the enforcing artifact for every scenario, and OC-5's requirement
that the system be testable by a role that has never read `src/` is itself a rule
(`outside-in-tests-do-not-import-src`).

**3 — Modifiability**, defined by §1.2 as *one building block plus a migration*. This is what chose
the decomposition rather than the other way round. Duration lives only in `src/domain/duration.ts`
(A-1); the occupancy interval only in `src/domain/interval.ts` (A-4); wall-clock reasoning only in
`src/domain/openingHours.ts` (ADR-0001). ADR-0008 carries the full containment table, including the
row that is honestly *not* contained — authentication, which ADR-0002 already said would not be
additive.

**4 — Observability.** The availability read and the write are separate spans, deliberately, so the
window that check-then-act would have raced in is visible in a waterfall even though no code relies
on it. `booking_conflicts_total{resource, outcome}` distinguishes a conflict that was absorbed by a
retry from one that ended in a refusal — different signals, and conflating them would make the metric
unreadable at exactly the moment it matters (§8.4).

**5 — Performance**, ranked last with its cost stated. The exclusion constraint serialises writers
that actually conflict, which caps write throughput for one contended resource. §11.2 works out where
that ceiling sits and how far it is from the §1.1 load profile. The compensation is that the GiST
indexes the constraints create are the same indexes the availability query's range predicate uses, so
the mechanism that costs throughput pays for the read path. QS-14 states the budget rather than
leaving performance unmeasured because it ranked last.
