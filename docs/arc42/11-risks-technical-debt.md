# 11. Risks and technical debt

> Owner: architect · Appended throughout

## 11.1 Deferred improvements

Generated: every ADR with `status: proposed` and every deferred-improvement slice is, by
construction, a debt item traceable to the decision that created it.

<!-- generated:debt-register -->
| Item | Origin | Why deferred |
|---|---|---|
| Use Fastify with TypeBox route schemas, and generate the OpenAPI document from them | [ADR-0005](../adr/0005-fastify-with-typebox-schemas.md) | deferred improvement |
| Use Kysely as a typed SQL builder over node-postgres, and adopt no ORM | [ADR-0006](../adr/0006-kysely-as-typed-sql-builder.md) | deferred improvement |
| Run migrations with node-pg-migrate, written as plain .sql files | [ADR-0007](../adr/0007-node-pg-migrate-with-sql-files.md) | deferred improvement |
| Decompose into five layered modules around a dependency-free policy core | [ADR-0008](../adr/0008-module-decomposition.md) | deferred improvement |
| Order candidates by a seeded shuffle, prune by the constraint that fired, and cap attempts at 16 | [ADR-0009](../adr/0009-candidate-ordering-and-attempt-cap.md) | deferred improvement |
<!-- /generated:debt-register -->

**Read that table with one correction, until Gate B closes.** ADR-0005 to ADR-0009 are the *founding*
decisions of this architecture, not deferred improvements. They carry `status: proposed` because
Gate B is where the human ratifies them, and the register is generated from that status, so it
currently reports them under the wrong heading. When they are accepted the register empties, and
every entry that appears in it afterwards will genuinely be a deferred improvement — a `(b)` DCR
ruling under `CLAUDE.md` §6, which is what the register exists to make impossible to lose.

## 11.2 Known risks

Ordered by how much they would cost to be wrong about, not by likelihood.

### R-1 · The write-throughput ceiling bought with goal 1

§1.2 ranks integrity first and performance last **with the cost stated**, and this is the cost. It is
worth stating in numbers rather than in prose, because "it serialises writes" sounds worse than it is
and "it scales fine" sounds better.

Two different limits are often confused:

- **Per contended key.** When two inserts conflict on the same bay over overlapping intervals, the
  second *blocks* on the first until it commits (§6.1). That is genuine serialisation — but only one
  of them can ever succeed, so what it caps is how fast losers are told *no*, not how fast bookings
  are made. At single-statement autocommit latency it is on the order of a thousand refusals per
  second on one slot. Non-conflicting inserts do not interact at all: GiST exclusion waits only on a
  row it actually conflicts with.
- **Aggregate write throughput on `appointment`.** Every insert maintains two partial GiST indexes,
  which is materially more expensive than a btree. Low thousands of inserts per second on modest
  hardware is the honest order of magnitude before it needs attention.

Against §1.1's load profile — tens of bookings per dealership per day — that is roughly two orders of
magnitude of headroom in aggregate and about five on the contended path. The trade buys the
invariant with capacity that has no other use.

**Revisit when** sustained confirmed bookings exceed a few hundred per second across the deployment,
or when the `appointment` table passes single-digit millions of live rows and GiST maintenance starts
showing in write latency. **The first move is partitioning `appointment` by `dealership_id`**, and it
works precisely because of A-9: an exclusion constraint cannot span partitions, and it does not need
to, because a bay and a technician belong to exactly one dealership and an appointment never spans
two. That is a happy accident of the data model worth recording before it is needed.

### R-2 · A capacity-*n* resource would need a different mechanism (A-2)

An exclusion constraint expresses capacity **one**, exactly. A-2 assumed one technician cannot cover
two bays at once, and `CLAUDE.md` §2.1 encoded that assumption by putting a constraint on
`technician_id` — so if a dealership ever wants a technician who can oversee two jobs, or a bay that
takes two small vehicles, the whole mechanism is the wrong shape and no amount of tuning fixes it.

The cheapest route back is to keep the mechanism and change the model: give the resource *n* numbered
slots and make each slot a capacity-one resource. Capacity *n* becomes *n* × capacity 1, the
constraint is untouched, and only candidate generation changes. The alternatives — a counting
constraint (which PostgreSQL has no declarative form of), or `SERIALIZABLE` plus an application-side
count — both move correctness back into code and would need to be argued against §2.1 rather than
adopted.

### R-3 · The constraint names are behaviour, not documentation

ADR-0009 prunes candidates by reading `err.constraint`, and §8.4 labels
`booking_conflicts_total{resource}` from it. A migration that renames `no_bay_overlap` therefore
degrades the retry loop from an additive bound to a multiplicative one, and mislabels the conflict
metric — **without failing to compile and without any behaviour looking wrong in a single-threaded
test**. QS-1 and QS-2 assert the names explicitly. It remains a coupling between a migration and
application code that nothing structural enforces.

### R-4 · The attempt cap can still refuse while capacity exists

ADR-0004 accepted this deliberately as a liveness guard, and ADR-0009 set the cap at 16. With
resource-level pruning, reaching 16 needs sixteen distinct bays or technicians to be taken out from
under one request while it loops, which the §1.1 load profile does not produce. It is not zero. The
`outcome="capped"` counter exists so the risk is measured rather than assumed: **a non-zero value in
production means the cap is wrong**, and it is a config value precisely so that can be fixed without
a deploy.

### R-5 · Two SQL expressions must agree, and only a test holds them together

The exclusion constraint's range expression (in a migration) and the availability query's (in a
repository) express the same idea in two files. A shared `IMMUTABLE` SQL function looks like the fix
and is a trap — redefining one that a GiST index depends on does not rebuild the index, it silently
corrupts it (§4.2). QS-8 is therefore load-bearing rather than a nice-to-have, and if QS-8 is ever
weakened or skipped, this risk is unmitigated with no other signal.

### R-6 · The `Database` interface can drift from the migrations

ADR-0006 keeps schema types in `src/persistence/schema.ts` and the schema itself in `.sql`
migrations. Nothing forces them to agree until the regeneration check is in place (regenerate from a
migrated database in CI, fail on a diff). Until that lands, a migration merged without a matching
type edit produces code that compiles and is wrong.

### R-7 · Smaller structural gaps, recorded so they are not discovered

| id | Gap | Why it is accepted |
|---|---|---|
| R-7a | ADR-0009's ordering seed must actually vary per request; if it does not, ordering silently degrades to sorted order and the retry work becomes quadratic under burst. No test fails — the symptom is latency, not incorrectness | Cheap to get right, and QS-14's budget would eventually show it |
| R-7b | `src/http` may import `src/domain`, and the rule is not "types only". An implementer could put policy in a route handler and `dependency-cruiser` would not notice | QS-12 catches the three ambiguities that matter; the rest is review |
| R-7c | `src/platform` is importable-by-all and imports nothing, which is exactly the shape of a junk drawer | The leaf rule stops it acquiring behaviour, not contents. Reviewer's job |
| R-7d | Down migrations are written and never run (ADR-0007), so they are unverified by construction | The deployment is a fresh container; rollback in anger is not a story this system has |
| R-7e | The retry loop must not be wrapped in a transaction (§6). Nothing structural enforces it | QS-3 fails immediately if it is — `25P02` on the second attempt |
| R-7f | Docker is required for everything but the `src/domain` suite (TC-9) | A consequence of §2.2 being right about where the invariant lives |

## 11.3 What production would additionally require

Named honestly. Scope that was cut deliberately is judgement; scope that was cut silently is a gap.
Every item below traces to a §3.3 exclusion marked **†** or to a Gate A ruling.

| Missing | Consequence today | What adding it costs |
|---|---|---|
| **Authentication and authorisation** (ADR-0002, GC-2) | **The service is unsafe on any reachable network.** Anyone who can reach the port can book, read and cancel on any customer's behalf | Not additive. The ownership rule moves from validation into a security boundary, its status changes from `422` to `403`, its body must stop distinguishing "not yours" from "does not exist", and every test asserting the current shape needs revising |
| **Technician shifts, holidays, absence** (ADR-0001) | A technician is bookable whenever the dealership is open, including on their day off. A dealership shut on 25 December accepts bookings | The expensive one. Per-resource, time-varying availability is a *second* class of availability rule sitting beside the database-enforced one — it needs its own mechanism, its own concurrency story and its own quality scenario, or it is the loophole §2.1 exists to close |
| **Appointment history and audit** (ADR-0003, ADR-0002) | A moved appointment shows only its current interval. "Who cancelled this, and when?" is unanswerable — there is no actor on the record at all | An append-only event or history table beside `appointment`. Additive, and the first thing to add if cancellation disputes matter |
| **DMS event publication** (§3.1.2, §3.3) | Nothing downstream learns an appointment exists. A real dealership group's DMS owns customers and vehicles and would need to | An outbox table written in the same statement as the appointment — which this design supports well, because the write is already a single statement |
| **High availability, backup, recovery** (§3.3) | One container. A lost volume is a lost schedule | Ordinary PostgreSQL operations. Note that the *application* is stateless and needs no coordination to run several instances (§7.1), because everything that must hold across requests holds in the database |
| **Vehicle-dependent durations (A-1), buffers (A-4), search-style booking (A-5)** | The three most likely real-world corrections | The first two are one domain function plus one migration each, by construction (ADR-0008, QS-12). A-5 is a new use case and materially larger — it turns the advisory availability read into something that drives allocation |
| **Reference-data management** (A-7) | Bays, technicians and opening hours change only by migration | Conventional CRUD. Excluded because it carries no interesting risk and would spend the review attention OC-3 names as the scarce resource |
| **Waitlists, overbooking, priority jobs** (§3.3) | No scheduling policy at all beyond first-come-first-served | Policy is where a real scheduler earns its keep, and it is the part that cannot be done convincingly without a real dealership's data. ADR-0009's Order-D (load balancing) is the first honest step |
| **GDPR-grade PII handling** (§3.3) | Customer names are stored; logs carry ids only (§8.4), which is the cheapest available mitigation rather than a policy | Retention, subject access, erasure — and erasure interacts with the append-only history above |
