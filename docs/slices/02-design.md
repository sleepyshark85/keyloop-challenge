# Slice 02 — design (as built)

> **Merged, condensed at step 7**, which reconciled arc42 — the source of truth. What survives is
> what a merged design keeps: decisions, measurements something else cites, rulings, debt.
> Deliberation: git, the event log, PR #12.

[`02-book-and-read-an-appointment.md`](02-book-and-read-an-appointment.md) — nineteen acceptance
criteria: the booking path, the error taxonomy, two ratified domain remedies. The slice where the
double-booking invariant became a running program.

## 1. What was decided, and where it lives now

| Decision | Home |
|---|---|
| Ten modules, four layers; no migration and **no data-model delta**; use cases return discriminated unions, never exceptions — `BookOutcome`, `ReadOutcome`, `PgOutcome`, `AppointmentView` | §5.2 |
| A capacity refusal is constructible only from a value PostgreSQL produced | ADR-0016 |
| Two class-scoped advisory locks per attempt; `40P01` is a `500` and is never retried; one transaction per attempt, none around the loop | ADR-0018, §6.1 |
| `candidateRepository` reads **reference data only** here — no availability read existing, check-then-act has no subject | §5.2 |
| Zero service bays is broken reference data ⇒ `500`; a dealership with no qualified technician for a service type is ordinary ⇒ `422 unknown-reference` | §8.6 |
| The problem `type` is a union of the taxonomy's literals behind a compile-time constructor, the `500` alone carrying no response schema | §8.5, §8.6 |
| QS-12's `wall-clock-and-zone` marker splits by **concept** into `wall-clock-reasoning` and `zone-transport`, joined by two new markers | §10.2 |
| Until QS-13's span, the constraint name the concurrency scenarios assert on is observable through one `booking.conflict` line per `23P01` | §6.1 |
| `deriveInterval.ts` is the composition order the literal AC-6 ruling took out of the types (**D-01-1**) — pure, over one `DealershipHours` pair | §5.2 |

Of the twenty-two measurements here, those still cited live in ADR-0016, ADR-0018 and §8.5; three
are recorded nowhere else, two in §4 and the ownership pair in §2.

## 2. Ownership is disambiguated after the composite foreign key fires

Five inserts against this repository's migrations on `postgres:16-alpine`: an unknown vehicle, an
unknown customer and a vehicle owned by a *different* customer **all report `23503` on
`appointment_vehicle_owned_by_customer`**. One name, three failures, where §8.6 asks that key for two
problem types — so `err.constraint` suffices for `23P01`, never for `23503`.

**Validating ownership before the insert — cheaper, and what most reviewers would write — was
refused** because it makes the foreign key's `23503` arm unreachable: a measured constraint rendered
inert by its consumer's design. Singleton foreign keys were refused for the schema slice's reason: an
unknown customer violates both, and which one PostgreSQL names is index order. `OwnershipVerdict` has
three members and **none is `ok`**, so the type cannot express permission: a pre-flight gate must
change it first.

**A second measurement binds the tests.** An insert violating both the ownership foreign key and an
exclusion constraint raises **`23P01`, not `23503`** — exclusions check at index insertion, the
foreign key at end of statement — so the unknown-reference and not-owned fixtures must be
uncontended, or the contract test passes for a reason unrelated to what it names.

## 3. Rulings

Each finding, its severity and this ruling's text are in `docs/DEFECTS.md`.

| Raised | Verdict, and by whom |
|---|---|
| **E-02-1** | **Human**: ADR-0004's retry loop is in scope; without it the refusal names the *abundant* resource (F-02-1), breaking AC-11 |
| **E-02-2** | **Human**: read QS-12's marker by concept, not by spelling |
| **E-02-3** | **Human**: routed, being outside scope; §8.5's serialiser advice reverses once its table is complete |
| **T-02-9** | **Architect, (c)**, naming AC-3, AC-4, QS-1 and QS-2: a simultaneous loser is refused `40P01`, which this design called a `500`. First under the 2026-09-06 amendment, **provisional until the gate**; ADR-0018 followed |
| **I-02-9** | **(a)**: the design is right, one artifact's expression of it wrong. **No loopback** |
| **T-02-1** | **(a)**: prune per resource **value**; *"prune the whole resource"* does not produce AC-4 |
| **T-02-2** | **(a) in part**: a corpus guard, two controls, a **positive** assertion; the offered remedy fixes E-02-2's marker, not this |
| **T-02-3 / I-02-7** | **(a)**: define the success body and `ReadOutcome` both, so the `GET` route's `switch` is checked too |
| **T-02-4** | **(a)**: the outcome is reachable and AC-12 satisfiable; one *producer* is not |
| **I-02-8 / T-02-7** | **(a) in part**: only the zero-bay half was mislabelled, and a service-not-offered row was refused, no AC naming it |
| **I-02-6** | **(a)**, blocking: the constraint name reaches no outside-in observer — hence the log line |
| **I-02-5** | **(a)**: a compile-time constructor and no response schema on the `500`, a mistyped `type` otherwise rendering a serialisation failure as `application/json` |
| **I-02-3** | **(a)**: mutation evidences branches, order needs precedence unit tests; the claim narrows to that |
| **T-02-8** | **(a)**, routed to **F-02-7** |
| Step 4 ×4 | **AGREE ×4**, all corrections to the architect's own text: a signature, a stale *no transaction anywhere* rule, a module name, a third `EXISTS` |
| **R-02-1** | Wording proposed to the orchestrator, not edited here |
| **R-02-2 / R-02-3** | **(b) both**, absorbed by slice 05 under ADR-0019 |

**Loopback ledger: 1 of 2.** T-02-9 spent it, at the right price: a test-engineer ran the design
against a real container after the red. Steps 2 and 4 spent none — nothing was built at step 2, and
(a) resumes where it was raised.

## 4. Measured here, and recorded nowhere else

- **F-02-1** — **which constraint PostgreSQL names under a double violation is index creation order,
  not a contract.** A doubly-violating insert reports `no_bay_overlap`; the same pair created in
  reverse reports the technician one, index insertion walking indexes in OID order. arc42 §11 calls
  the constraint *names* behaviour and should say the *choice between them* is not. **Routed, not
  landed.**
- **The `pg` column mappings** (`postgres:16-alpine`, `pg` 8.23): a `time` arrives as a **string**
  verbatim and `'24:00:00'` round-trips, so AC-19 is reachable with real reference data and not only
  a fixture; a `timestamptz` arrives as a `Date`, rendered with `.toISOString()`.

## 5. Assumptions, open questions and findings

- **DA-02-1** — the appointment id is minted by the application, not `gen_random_uuid()`. A retried
  attempt **reuses** it: the failed attempt inserted nothing.
- **DA-02-2** — `AppointmentView` renders its instants as ISO-8601 UTC; local time would put zone
  reasoning in `src/http`, which QS-12 forbids.
- **OQ-02-1** — should the edge reject a calendar-invalid but pattern-valid date such as
  `2026-02-30`, which `Date.parse` moves to 2 March? Recommendation **no**: the fix is a second
  calendar in `src/http`, which slice 01 ruled against.
- **F-02-6** — AC-5 has no runtime leg; a `pg_stat_statements` detector asserting **zero** `SELECT`s
  against `appointment` in an uncontended booking would give one. Deferred on scope.
- **F-02-7** — there is **no seed in slice 02**: ordering is deterministic, so *record the seed* is
  met more strongly than a seed could, the failure message carrying the candidate order and fixture
  ids.
- **F-02-8** — `hashtext` is undocumented and internal; any deterministic `int4` per id serves.
- **F-02-9** — **every write path to `appointment` must take both advisory locks in one order**,
  inherited by slices 06 and 07.
- **F-02-10** — `docs:adr-check` could not see an ADR absent from its baseline, so ADR-0018 landed
  unpinned while the guard reported seventeen checked. Fixed in tooling.
- **F-02-11** — **an instruction stated in prose creates no work item.** One control was written
  imperatively and built, one descriptively and dropped, unnoticed until review. A ruling creating
  work needs a numbered item.

## 6. ADRs

Three survive, each titled with its decision:
[0016](../adr/0016-a-capacity-refusal-requires-a-database-verdict.md), still `proposed` and carried
in arc42 §11.1 until a human rules it;
[0018](../adr/0018-lock-the-bay-and-the-technician-before-each-insert.md), **decided by the
architect**, unlike the others; and
[0019](../adr/0019-defer-a-control-only-to-the-slice-that-makes-it-cheaper-or-stronger.md). The
ownership disambiguation was a fourth candidate; it is §2. None was proposed for the retry loop,
which ADR-0004 had decided — E-02-1 was a scope conflict between two slice-file statements, which a
ruling settles.
