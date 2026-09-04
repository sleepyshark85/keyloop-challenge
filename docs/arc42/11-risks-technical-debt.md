# 11. Risks and technical debt

> Owner: architect · Appended throughout

## 11.1 Deferred improvements

Generated: every ADR with `status: proposed` and every deferred-improvement slice is, by
construction, a debt item traceable to the decision that created it.

<!-- generated:debt-register -->
| Item | Origin | Why deferred |
|---|---|---|
| Treat /health as an operational probe outside the API contract, not as a sixth operation | [ADR-0011](../adr/0011-health-is-an-operational-probe.md) | deferred improvement |
| Seed reference data from a test-engineer-owned loader, per case, and defer the demo dataset | [ADR-0012](../adr/0012-seed-fixtures-are-a-test-owned-loader.md) | deferred improvement |
<!-- /generated:debt-register -->

The register held nothing until slice 00a, and that was the correct reading rather than an omission.
Between the architect writing this section and Gate B closing it reported ADR-0005 to ADR-0010 as
debt, because it is generated from `status: proposed` and those were the *founding* decisions
awaiting ratification, not deferred improvements. **The human accepted all six at Gate B on
2026-09-04**, so the register emptied on its own.

The single entry above is the first genuine one: **ADR-0011** was raised by the architect at slice
00a step 1 and is `proposed` because it is the human's to rule at that slice's gate, not the
architect's to close inline. It is debt in the narrow sense the register means — an open decision
with a recommendation attached — and it leaves the register the moment it is accepted or rejected.
Every other entry that appears here is a deferred improvement from a `(b)` DCR ruling under
`CLAUDE.md` §6, which is what the register exists to make impossible to lose.

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
| R-7d | Down migrations are written and are exercised by no test (ADR-0007), so they are unverified by CI. *"Never run"* was true until 2026-09-04, when the architect reversed the whole corpus once by hand while designing slice 00 — a dated measurement, not a guarantee | The deployment is a fresh container; rollback in anger is not a story this system has |
| R-7e | The retry loop must not be wrapped in a transaction (§6). Nothing structural enforces it | QS-3 fails immediately if it is — `25P02` on the second attempt |
| R-7g | Case 0's constraint-set assertion filters `contype <> 'p'`. Measured across three majors: clean on 16.15 and 17.11, but **PostgreSQL 18 surfaces `NOT NULL` as `contype = 'n'` rows** — twelve of them on `appointment`, one per column. The fix is an allowlist, `contype IN ('c','f','u','x')` | Cannot fail today: the image is pinned and `postgres-harness.test.ts` asserts `^16\.`. **The direction of the failure is the finding, not the failure.** A denylist breaks with a dozen invented names that nobody added, so the bump reads as *"the assertion is too strict"* and invites loosening the one thing that makes §8.1's seven-and-only-seven enforceable — and the noise **scales with the `NOT NULL` count, so it gets louder the more correct the schema becomes.** An allowlist ignores what the *platform* adds while still catching everything a *developer* can add |
| R-7f | Docker is required for everything but the `nodb` project — `tests/unit/` and `tests/architecture/` (TC-9, §7.2) | A consequence of §2.2 being right about where the invariant lives. At 00a neither implementer nor test-engineer had a container runtime, which is what forced the two-project split; **measured again at slice 00, all three roles have Docker**, so the split now stands on its merits rather than on that constraint (§7.2) |

### R-8 · Four things CI is *said* to enforce — one closed at slice 00a, three open

ADR-0010 founds the pipeline (§7.4), and writing it turned up a set of claims made in prose that no
tool implements. They are listed here rather than quietly fixed later, because the failure mode of an
unenforced enforcement claim is that everyone stops checking by hand. **The first row closed at slice
00a and is struck through rather than deleted** — a debt item that vanishes on payment leaves no
evidence it was ever owed.

| Claimed | Claimed by | State today |
|---|---|---|
| ~~`check.run` is emitted by tooling, tier `derived`~~ | METHODOLOGY §400 | **Closed at slice 00a.** `tools/team-log/collect-ci.mjs` exists, derives every field from `gh` output — there is no `--conclusion` and no way to state an outcome on the command line — and has run against real runs on this branch. **C1 is measured, not merely passable**: the red run and its later green run were both collected and `slice:check 00a` reads *test-first proven (red before green)* from records rather than from narration |
| The diagram scripts `self_check.py` and `verify-geometry.py` run in CI | METHODOLOGY §4 | **Cannot run.** They live in a `diagram-design` plugin cache outside the repository and nothing vendors them. CI checks the honest subset: every `.html` has a committed `.svg`, and every diagram link resolves |
| Link integrity and ADR existence are enforced | METHODOLOGY §4 | No tool. CI checks diagram links only; the rest of the documentation's relative links are unchecked |
| `QS-*` names a real test, or CI fails | METHODOLOGY §4, §10.2, §0 | Still no tool — **and as of slice 00a the excuse has expired.** This row read *"nothing to check against until `tests/` exists"*; `tests/` now exists and QS-10 has a committed test, so the traceability chain's last link is now a plain gap rather than a blocked one. It is the oldest unpaid item in this table and should land with slice 00 |

A fifth is a fact about tooling rather than a gap: **`npm run log:audit` cannot run in CI.** Its
ground truth is subagent transcripts under `~/.claude/projects/`, which exist only on the maintainer's
machine; on a fresh checkout it reports every honest agent run as `UNSUPPORTED` and exits 1. That is
correct behaviour, and it is why §9 calls it a gate-time command. CI substitutes two structural
checks it *can* make — the log is append-only, and every record validates against the schema.

### R-9 · `npm run db:migrate` does not conform to ADR-0007, and the built artifact cannot migrate

Two items, recorded together because **the second is a trap laid for whoever pays the first**.

**R-9a — the conformance drift.** [ADR-0007](../adr/0007-node-pg-migrate-with-sql-files.md)'s Decision
states that the runner is invoked *"programmatically … both by `npm run db:migrate` … and by the
Testcontainers fixture"*. `package.json:18` is the CLI binary. The observable consequence is the
`--single-transaction` default (§7.2): a malformed migration rolls everything back under `db:migrate`
and leaves earlier files committed under the test harness. It bites only on a broken migration and
both paths fail loudly, which is why slice 00 recorded it instead of conforming mid-slice.

This is debt of an unusual kind and it is worth naming as such: **not code falling short of a
document, but an accepted immutable decision that the code silently stopped implementing, with arc42
having quietly narrowed its own copy of the claim rather than reporting the mismatch.** §7.2 carries
that correction; this row carries the obligation.

> **Recommendation, stated so it is not re-argued: conform `db:migrate`. Do not supersede ADR-0007.**
> Superseding an accepted decision to legitimise a drift nobody argued for is the worse precedent, and
> the ADR's underlying requirement — in-process, no shelling out to a binary that may not be on the
> path — is the right requirement. The cost is a small runner module and a location decision, which is
> why it did not belong in the slice that had to land the invariant.

**R-9b — `dist/persistence/` holds no migrations.** `tsc` emits only what it compiles, so
`npm run build` copies no `.sql` and the built artifact cannot migrate itself. Inert today: both
migration paths read `src/persistence/migrations/` from the working tree, and `dist/main.js` never
migrates. It becomes real the first time the service is packaged — which §11.3 and the human's §7.1
ruling both defer.

**The coupling is the point.** A programmatic `db:migrate` written to close R-9a must resolve the
migrations directory from a location the build actually populates, or **the conforming fix ships
broken in the built artifact** — passing in development, failing in the first container. Whoever takes
R-9a takes R-9b with it.

### R-11 · Assertions that would survive their own subject being deleted

Two items from slice 00, kept together because they share a shape: **a specification exists, the thing
it specifies works, and nothing would notice if it stopped.**

**R-11a — four reference-table constraints (R00-5).** `opening_hours.day_of_week BETWEEN 0 AND 6`,
`opening_hours.closes_at > opens_at`, `service_type.duration_minutes > 0`, and `vehicle.vin UNIQUE`
are specified in §8.1 and asserted by nothing. Measured live: all four exist and all four fire
(`23514`, `23514`, `23514`, `23505`). Drop any one and the whole suite stays green. Every other
reference-table constraint is structurally self-enforcing — the `UNIQUE (id, dealership_id)` pairs and
`technician_qualification`'s primary key are foreign-key targets, so dropping one fails migration
`0003` — which is why these four and only these four are exposed.

**It is not symmetric with the `appointment` constraints and should not be paid the same way.** Slice
00's case 0 asserts `appointment`'s seven by name-set and by definition because that is the table every
case writes to. The remedy here is smaller: two of the four are about to acquire a *consumer*, since
slice 01's opening-hours and duration code will assume `closes_at > opens_at` and
`duration_minutes > 0` hold. **Assert them where the code that relies on them lands**, not by extending
case 0 across nine tables — that is the first step back toward a whole-schema snapshot, which slice 00
rejected as brittle.

**R-11b — `appointment_technician_in_dealership` is proven to exist and not to fire (R00-3).** Six of
the seven constraints have a case that provokes them; the seventh has only case 0. Measured: booking a
D1 technician under D2 *is* correctly rejected `23503` on that constraint, so it works. But drop it
from the migration and case 0's set-equality is the only assertion that fails; key it on the wrong
column pair and case 0's definition-equality is the only one. **The technician half of A-9 rides on a
catalogue assertion alone**, where the bay half has a behavioural one. Four lines against the
two-dealership fixture AC-7 already seeds would close it.

### R-10 · `updated_at` is maintained by the writer, and nothing enforces it

`appointment.updated_at` has `DEFAULT now()` and no trigger. ADR-0003's atomic move is an `UPDATE`,
so unless every such statement sets `updated_at = now()` explicitly the column will be wrong from
slice 05 onward, silently and unrecoverably.

No trigger is added, deliberately: `CLAUDE.md` §2.1's discipline is that the **database holds the
invariant** while the application holds the convenience, and a mutable-column trigger is convenience.
The obligation therefore sits on `src/persistence/appointmentRepository.ts`, and no test currently
asserts it. Recorded here because a column that lies is discovered long after the commit that made it
lie.

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
