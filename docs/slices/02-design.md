# Slice 02 — design (as built)

> **Merged design, condensed at step 7**, which reconciled arc42 — the source of truth
> (`CLAUDE.md` §4). What survives is what a merged design keeps: decisions, measurements something
> else still cites, rulings, debt. The deliberation is in git history, in `events.jsonl` and on
> PR #12; the pre-condensation §13 booked this compression, and it is discharged here.

Slice file: [`02-book-and-read-an-appointment.md`](02-book-and-read-an-appointment.md) — 19
acceptance criteria: the booking path, the error taxonomy, two ratified domain remedies. The slice
where `CLAUDE.md` §2.1 became a running program.

## 1. What was decided, and where it lives now

| Decision | Home |
|---|---|
| Ten modules, four layers; no migration, **no data-model delta** | §5.2 |
| Use cases return discriminated unions, never exceptions — `BookOutcome`, `ReadOutcome`, `PgOutcome`, `AppointmentView` | §5.2 |
| A capacity refusal is constructible only from a value PostgreSQL produced | ADR-0016 |
| Two class-scoped advisory locks per attempt; `40P01` ⇒ `no-verdict` ⇒ `500`, never retried; one transaction per attempt, none around the loop | ADR-0018, §6.1 |
| Ownership is disambiguated **after** the composite FK fires, by one statement of **two** `EXISTS` | ADR-0017 |
| `candidateRepository` reads **reference data only** here — with no availability read in existence, check-then-act has no subject | §5.2 |
| Zero service bays is broken reference data ⇒ `500`; a *(dealership, service-type)* pair with no qualified technician is ordinary ⇒ `422 unknown-reference` | §8.6 |
| The problem `type` is a union of the taxonomy's literals behind a compile-time constructor; the `500` alone carries no response schema | §8.5, §8.6 |
| QS-12's `wall-clock-and-zone` marker splits by **concept** into `wall-clock-reasoning` and `zone-transport`, joined by two new markers | §10.2 |
| The constraint name AC-3, AC-4, QS-1 and QS-2 assert on is observable through one `booking.conflict` log line per `23P01`, until QS-13's span | §6.1 |
| `deriveInterval.ts` is the composition order literal AC-6 took from the types (**D-01-1**) — pure, over one `DealershipHours` pair | §5.2 |

Of the twenty-two measurements here, those still cited live in ADR-0016, ADR-0017, ADR-0018
and §8.5; two are recorded nowhere else, in §3.

## 2. Rulings

| Raised | Finding | Verdict, and by whom |
|---|---|---|
| **E-02-1** | AC-4 is unsatisfiable without ADR-0004's retry loop | **Human**: in scope. Without it the refusal names the *abundant* resource (F-02-1), breaking AC-11; with pruning, the emptied list |
| **E-02-2** | QS-12's marker becomes unsatisfiable here, and was also too loose — it missed two of three planted violations | **Human**: read it by concept, not by spelling |
| **E-02-3** | §8.5's serialiser table is incomplete, and its advice reverses once completed | **Human**: routed, being outside scope |
| **T-02-9** | A simultaneous loser is refused `40P01`, and this design called it a `500`. Reproduced worse than reported | **Architect, (c)**, naming AC-3, AC-4, QS-1, QS-2. First ruling under the 2026-09-06 amendment, **provisional until the gate**. ADR-0018 |
| **I-02-9** | Both concurrency tests assert `"1 confirmed / 19 refused"` against `"1 / 19"` — unsatisfiable, hidden behind a true red | **Architect, (a)**: the design is right, one artifact's expression of it is wrong. **No loopback** |
| **T-02-1** | "Prune the whole resource" does not produce AC-4 | **(a)**: prune per resource **value** |
| **T-02-2** | `appointment-table-access` reports zero and cannot say why | **(a) in part**: a corpus guard, two controls, a **positive** assertion. The offered remedy — redefining the concept — fixes E-02-2's marker, not this |
| **T-02-3 / I-02-7** | The `201`/`200` body is unspecified and `ReadOutcome` missing | **(a)**: both defined, so the `GET` route's `switch` is checked too |
| **T-02-4** | The unreachability claim conflates outcome with producer | **(a)**: the outcome is reachable and AC-12 satisfiable; one *producer* is not |
| **I-02-8 / T-02-7** | The empty-candidate case is annotated, not ruled | **(a) in part**: only the zero-bay half was mislabelled, and a new `/problems/service-not-offered` row was refused — no AC names it |
| **I-02-6** | The constraint name has no observer — not the response, not the database, and `src/` is closed to outside-in tests | **(a)**, blocking: the log line |
| **I-02-5** | A mistyped `type` renders `FST_ERR_FAILED_ERROR_SERIALIZATION` as `application/json` — the backstop becoming the defect | **(a)**: a compile-time constructor, no response schema on the `500` |
| **I-02-3** | Stryker does not reorder statements | **(a)**: mutation evidences branches, order needs precedence unit tests, and the claim is narrowed to that |
| **T-02-8** | The Definition of Done requires a seed that exists only from slice 04 | **(a)** + route: **F-02-7** |
| Step 4 ×4 | `deriveInterval`'s signature; a stale *no transaction anywhere* rule; `lockResources`' module; `classifyOwnership`'s third `EXISTS` | **AGREE ×4**, all corrections to the architect's own text; no new ADR |
| **R-02-1** | AC-5 reads as *a single statement*, which the locks now precede | Wording proposed to the orchestrator, not edited here |
| **R-02-2 / R-02-3** | The lock-drop control was named and never built; the `GET` response schema is unasserted | **Architect, (b) both**, absorbed by slice 05: ADR-0019 |

**Loopback ledger: 1 of 2.** Step 2 consumed none — nothing had been built. T-02-9 spent the one, at
the right price: a test-engineer ran the design against a real container after the red. Step 4
consumed none: (a) resumes from the raising step.

## 3. Measured here, and recorded nowhere else

- **F-02-1** — **which constraint PostgreSQL names under a double violation is index creation order,
  not a contract.** A doubly-violating insert reports `no_bay_overlap`; the same pair created in
  reverse reports the technician one, because `ExecInsertIndexTuples` walks indexes in OID order and
  `0003_appointment.sql` creates the bay constraint first. arc42 §11 R-3 calls the constraint *names*
  behaviour; it should also say the *choice between them* is not. **Routed, not landed.**
- **The `pg` column mappings** (`postgres:16-alpine`, `pg` 8.23): a `time` arrives as a **string**
  verbatim and `'24:00:00'` round-trips, so AC-19 is reachable with real reference data rather than
  only a fixture; a `timestamptz` arrives as a `Date`, rendered with `.toISOString()`.

## 4. Assumptions, open questions and findings

- **DA-02-1** — the appointment id is minted by the application (`crypto.randomUUID`), not
  `gen_random_uuid()`. A retried attempt **reuses** it: the failed attempt inserted nothing.
- **DA-02-2** — `AppointmentView` renders `startsAt`/`endsAt` as ISO-8601 UTC; local time would put
  zone reasoning in the HTTP layer, which QS-12 forbids.
- **OQ-02-1** — should the edge reject a calendar-invalid but pattern-valid date such as
  `2026-02-30`, which `Date.parse` silently moves to 2 March? Recommendation **no**: the fix is a
  second calendar implementation in `src/http`, which slice 01 ruled against. arc42 §11 R-7h.
- **OQ-02-2** — *closed*: broken dealership reference data is `500 /problems/internal` (§8.6).
- **F-02-6** — AC-5 has no runtime leg. A `pg_stat_statements` detector asserting **zero** `SELECT`s
  against `appointment` during an uncontended booking would give one. Deferred on scope, not cost.
- **F-02-7** — there is **no seed in slice 02**: candidate ordering is deterministic, so the
  Definition of Done's *"record ADR-0009's seed"* is met more strongly than a seed could meet it, the
  failure message carrying the candidate order and fixture ids.
- **F-02-8** — `hashtext` is undocumented and internal; any deterministic `int4` per id serves
  (arc42 §11).
- **F-02-9** — **every write path to `appointment` must take ADR-0018's two locks in its order**,
  inherited by slices 06 and 07. arc42 §8.2 and §11.
- **F-02-10** — `docs:adr-check` could not see an ADR absent from its baseline, so ADR-0018 landed
  unpinned while the guard reported seventeen checked. Fixed in tooling.
- **F-02-11** — **an instruction stated in prose creates no work item.** One control was written
  imperatively and built; one was written descriptively and dropped, unnoticed until review. A ruling
  that creates work needs a numbered item, not a sentence.

## 5. ADRs

Four, all `status: proposed`, carried in arc42 §11.1 until a human rules them —
[0016](../adr/0016-a-capacity-refusal-requires-a-database-verdict.md),
[0017](../adr/0017-the-composite-ownership-fk-is-disambiguated-after-it-fires.md),
[0018](../adr/0018-lock-the-bay-and-the-technician-before-each-insert.md) (**decided by the
architect**, unlike the others) and
[0019](../adr/0019-defer-a-control-only-to-the-slice-that-makes-it-cheaper-or-stronger.md); each
title states its decision. None was proposed for the retry loop: ADR-0004 had decided it, and E-02-1
was a scope conflict between two slice-file statements, which a ruling settles.
