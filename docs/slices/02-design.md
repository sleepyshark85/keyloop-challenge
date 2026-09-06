# Slice 02 — design (as built)

> **Merged design, condensed at step 7.** Step 7 reconciled arc42, which is the source of truth
> (`CLAUDE.md` §4), so this file keeps only what a merged design keeps: what was decided, what was
> measured that something else still cites, what was ruled and by whom, and what debt was booked.
> The deliberation is in this file's git history, in `docs/team-log/events.jsonl` and on PR #12.
> The pre-condensation §13 recorded this compression as an obligation; it is discharged here.

Slice file: [`02-book-and-read-an-appointment.md`](02-book-and-read-an-appointment.md) — 19
acceptance criteria, the booking path, the whole error taxonomy, two ratified domain remedies. The
slice where `CLAUDE.md` §2.1 became a running program.

## 1. What was decided, and where it lives now

| Decision | Home |
|---|---|
| Ten modules over four layers; no migration and **no data-model delta** | arc42 §5.2 |
| Use cases return discriminated unions, never exceptions — `BookOutcome`, `ReadOutcome`, `PgOutcome`, and `AppointmentView` as the one body the `201` and the `200` share | §5.2 |
| A capacity refusal is constructible only from a value PostgreSQL produced | ADR-0016, §5.2 |
| Two class-scoped advisory locks per attempt; `40P01` ⇒ `no-verdict` ⇒ `500`, never retried; each attempt is exactly one transaction and the loop is not wrapped in one | ADR-0018, §6.1 |
| Ownership is disambiguated **after** the composite FK fires, by one statement of **two** `EXISTS` with no `'ok'` member — a type that cannot express permission | ADR-0017, §6.6, §8.6 |
| `candidateRepository` reads **reference data only** here: with no availability read in existence, check-then-act has no subject. The advisory read arrives at slice 04, beside ADR-0009's ordering and QS-3 | §5.2 |
| Zero service bays is broken reference data ⇒ `500`; a *(dealership, service-type)* pair with no qualified technician is an ordinary state ⇒ `422 /problems/unknown-reference` | §8.6 |
| The problem `type` is a union of the taxonomy's literals behind a compile-time constructor, and the `500` alone carries no response schema | §8.5, §8.6 |
| QS-12's `wall-clock-and-zone` marker splits by **concept** into `wall-clock-reasoning` and `zone-transport`, joined by `appointment-table-access` and `contended-resource-cast` | §10.2 |
| The constraint name AC-3, AC-4, QS-1 and QS-2 assert on is observable through one `booking.conflict` log line per `23P01`, until QS-13's span carries `db.constraint` at slice 09 | §6.1 |
| `deriveInterval.ts` is the composition order the literal AC-6 ruling took from the types (**D-01-1**), pure, taking one `DealershipHours` pair | §5.2 |

Twenty-two measurements backed this design. Those still cited live in the records that use them:
ADR-0016 (the `tsc` mutant, and the cast that defeats it), ADR-0017 (the five inserts, and `23P01`
beating `23503`), ADR-0018 (the seven behind the locks), §8.5 (the three response-schema forms).
Two are recorded nowhere else and are kept in §3.

## 2. Rulings

| Raised | Finding | Verdict, and by whom |
|---|---|---|
| **E-02-1** | AC-4 is unsatisfiable without ADR-0004's retry loop | **Human**: in scope. Without it the refusal names whichever index was created first — systematically the *abundant* resource, breaking AC-11 and poisoning `booking_conflicts_total{resource}`. With pruning, the constraint reported at refusal is the one whose list emptied |
| **E-02-2** | QS-12's marker becomes unsatisfiable here, and was also too loose — it missed `toLocaleString` in a route and `getHours` in a use case | **Human**: read the marker by concept, not by spelling |
| **E-02-3** | §8.5's serialiser table is incomplete, and its advice reverses once completed | **Human**: routed; §8.5 was outside this slice's scope |
| **T-02-9** | A simultaneous loser is refused `40P01`, and this design called that a `500`. Reproduced worse than reported — 285 of 400 losers, one row surviving every trial | **Architect, (c)**, naming AC-3, AC-4, QS-1, QS-2. First ruling under the human's 2026-09-06 amendment, **provisional until the gate**. ADR-0018 |
| **I-02-9** | Both concurrency tests assert `"1 confirmed / 19 refused"` against `"1 / 19"` — unsatisfiable by any implementation, hidden behind a true red | **Architect, (a)**: the design is right, one artifact's expression of it is wrong. **No loopback** |
| **T-02-1** | "Prune the whole resource" does not produce AC-4 | **(a)**: pruning is per resource **value**, bounding the loop at `\|bays\| + \|technicians\| − 1` |
| **T-02-2** | `appointment-table-access` reports zero and cannot say why | **(a) in part**: the marker gains a corpus guard, planted and conforming controls, and a **positive** assertion. The offered remedy — redefine the concept — was refused: it fixes E-02-2's marker, not this one |
| **T-02-3 / I-02-7** | The `201`/`200` body is unspecified and `ReadOutcome` is missing | **(a)**: both defined, so the `GET` route's `switch` is exhaustiveness-checked like the `POST` route's |
| **T-02-4** | The unreachability claim conflates outcome with producer | **(a)**: the `reference-data-invalid` *outcome* is reachable over HTTP and AC-12 fully satisfiable; one *producer* of it is not |
| **I-02-8 / T-02-7** | The empty-candidate case is annotated, not ruled | **(a) in part**: only the zero-bay half was mislabelled. A new `/problems/service-not-offered` row was refused — no AC names it |
| **I-02-6** | The constraint name has no observer: not in the response, not in the database, and `src/` is closed to outside-in tests | **(a)**, blocking: one structured log line per `23P01`. Letting the test reproduce the conflict with its own SQL would let it choose which constraint fired |
| **I-02-5** | A mistyped `type` renders `FST_ERR_FAILED_ERROR_SERIALIZATION` as `application/json`, so the taxonomy's backstop could become the defect | **(a)**: a compile-time constructor, and no response schema on the `500` |
| **I-02-3** | Stryker does not reorder statements | **(a)**: mutation evidences branches; statement order needs explicit precedence unit tests, and the claim is narrowed to that |
| **T-02-8** | The Definition of Done requires a seed that does not exist until slice 04 | **(a)** + route — **F-02-7** |
| Step 4 ×4 | `deriveInterval`'s signature; a stale *no transaction anywhere* rule; where `lockResources` lives; `classifyOwnership`'s third `EXISTS` | **AGREE ×4**, all corrections to the architect's own text. No new ADR — ADR-0008 owns decomposition, ADR-0018 owns the transaction |
| **R-02-1** | AC-5 reads as *a single statement*, which the locks now precede | Wording proposed to the orchestrator, not edited here |
| **R-02-2 / R-02-3** | The lock-drop control was named and never built; the `GET` response schema is unasserted | **Architect, (b) both**, absorbed by slice 05 — ADR-0019 |

**Loopback ledger: 1 of 2.** Step 2's objections consumed none — nothing had been built. T-02-9 spent
the one, and at the right price: found by a test-engineer running the design against a real container
after the red was committed. I-02-9 and the four step-4 corrections consumed none, because (a)
resumes from the raising step and the governor counts design changes.

## 3. Measured here, and recorded nowhere else

- **F-02-1** — **which constraint PostgreSQL names under a double violation is index creation order,
  not a contract.** A doubly-violating insert reports `no_bay_overlap`; the same constraints created
  in reverse report the technician one. `ExecInsertIndexTuples` walks indexes in OID order and
  `0003_appointment.sql` creates the bay constraint first. arc42 §11 R-3 says the constraint *names*
  are behaviour; it should also say the *choice between them* is not. **Routed, not landed.**
- **The `pg` column mappings** (`postgres:16-alpine`, `pg` 8.23): a `time` column arrives as a
  **string** verbatim and `'24:00:00'` round-trips, so AC-19 is reachable with real reference data
  rather than only a hand-built fixture; a `timestamptz` arrives as a `Date`, rendered by the row
  mapper with `.toISOString()`.

## 4. Assumptions, open questions and findings

- **DA-02-1** — the appointment id is minted by the application (`crypto.randomUUID`), not by
  `gen_random_uuid()`. A retried attempt **reuses** it, because the failed attempt inserted nothing.
- **DA-02-2** — `AppointmentView` renders `startsAt`/`endsAt` as ISO-8601 UTC. Local time would put
  zone reasoning in the HTTP layer, which QS-12 forbids.
- **OQ-02-1** — should the edge reject a calendar-invalid but pattern-valid date? `Date.parse` turns
  `2026-02-30T10:00:00Z` into 2 March, so a client can book a date it did not name. Recommendation
  **no**: the fix is a leap-year calculation in `src/http`, the second calendar implementation slice
  01 ruled against. arc42 §11 R-7h carries it.
- **OQ-02-2** — *closed*: broken dealership reference data is `500 /problems/internal` (§8.6).
- **F-02-6** — AC-5 has no runtime leg. A `pg_stat_statements` detector asserting **zero** `SELECT`s
  against `appointment` during an uncontended booking would give one. Deferred for scope, not cost.
- **F-02-7** — there is **no seed in slice 02**. Candidate ordering is deterministic, so the
  Definition of Done's *"record ADR-0009's seed"* is satisfied more strongly than by a seed; the
  failure message carries the candidate order and the fixture ids instead.
- **F-02-8** — `hashtext` is an undocumented internal function; any deterministic `int4` per id
  serves. arc42 §11.
- **F-02-9** — **every write path to `appointment` must take ADR-0018's two locks in its order.**
  Slice 06's reschedule `UPDATE` and slice 07 inherit it. arc42 §8.2 and §11.
- **F-02-10** — `docs:adr-check` could not see an ADR its baseline had never been told about, so
  ADR-0018 landed unpinned while the guard reported seventeen records checked. Fixed in tooling.
- **F-02-11** — **an instruction stated in prose creates no work item.** §4.4's control was written
  imperatively and was built; §4.5's was written descriptively and was dropped, unnoticed until
  review. A ruling that creates work needs a numbered item, not a sentence in a paragraph.

## 5. ADRs

Four, all `status: proposed`, carried in arc42 §11.1 until a human rules them.
[ADR-0016](../adr/0016-a-capacity-refusal-requires-a-database-verdict.md) (a capacity refusal
requires a database verdict) ·
[ADR-0017](../adr/0017-the-composite-ownership-fk-is-disambiguated-after-it-fires.md) (the ownership
FK is disambiguated after it fires) ·
[ADR-0018](../adr/0018-lock-the-bay-and-the-technician-before-each-insert.md) (lock both resources
before each insert) — **decided by the architect**, unlike the others ·
[ADR-0019](../adr/0019-defer-a-control-only-to-the-slice-that-makes-it-cheaper-or-stronger.md)
(defer a control only to the slice that makes it cheaper or stronger).

No ADR was proposed for the retry loop: ADR-0004 already decided it, and E-02-1 was a scope conflict
between two statements in a slice file, which a ruling settles.
