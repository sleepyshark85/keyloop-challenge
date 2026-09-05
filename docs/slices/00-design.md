# Slice 00 — design

> **Merged.** The phase-4 pilot. Reconciled at step 7 into arc42 **§8.1 · §8.2 · §7.2 · §11**, a scope
> the human widened from §8.1 · §8.2 on 2026-09-04. **QS-1, QS-2, QS-11**; ADR-0012 raised here.
>
> Condensed 2026-09-05 under the concision ruling; the deliberation is on the PR and in
> `docs/team-log/`, the pilot's findings in `phase-4-retro.md`.

## Decided

- **Three migrations.** `0001_extensions.sql` carries `CREATE EXTENSION IF NOT EXISTS btree_gist`
  alone — the only statement that can fail for an *environment* reason, so alone in a file that
  failure names itself. `0002_reference_data.sql` holds the eight tables the API never writes,
  `0003_appointment.sql` the one it does. Filename order is the only thing putting the extension
  before the exclusion constraints.
- **No `IF NOT EXISTS`** on tables, types, constraints or indexes: idempotence is the runner's job,
  and an `IF NOT EXISTS` turns *"this database is not in the expected state"* into a silent pass. The
  `CREATE EXTENSION` line is the exception, verbatim from §2.1.
- **`-- Up Migration` is the first line of every file.** Everything above the marker is sliced off
  and never sent to PostgreSQL — harmless for a comment, silent data loss for a statement. All three
  carry `-- Down Migration` too, or the runner sets `down: false`.
- **Seed fixtures — ADR-0012.** What the ADR leaves open: **`techB` is qualified for `quick` and not
  `standard`** — AC-5's whole fixture, and the only way to isolate it; the second bay and
  technician let AC-1 free the technician and AC-2 the bay; all seven opening-hours days are seeded,
  so no claim about a weekday goes stale; and the loader returns an **anchor instant**.
- **Case 0 asserts the schema *is* §8.1's, before any AC case is evidence.** In order: the three
  `pgmigrations` names (§7.2), `btree_gist`, the nine relations, and a non-primary-key
  constraint set on `appointment` that is **exactly** the seven, each compared by **equality** on
  `pg_get_constraintdef` against a literal transcribed from arc42 by hand — never captured from the
  database under test. The filter is an **allowlist**, `contype IN ('c','f','u','x')`.
- **The isolation rule.** Each negative case makes exactly **one** constraint violable; every
  assertion names the constraint, not the SQLSTATE alone (`23503` has four producers here); and each
  carries a **positive control**, the same row with its one defect repaired, asserted to succeed.
  **The negative case runs first**, or in a disjoint interval: a control run first occupies the slot,
  so the negative insert hits `23P01` instead of the `23503` it exists to assert.
- **Errors are read from `pg`'s `DatabaseError`:** `code`, `constraint` and `table` asserted;
  `message`, `detail`, `hint` and `severity` never — localised, and reworded between majors. Each case
  captures the thrown value and asserts a truthy `code` first, so a helper's `TypeError` cannot
  satisfy `rejects.toThrow()`.
- **`beforeAll` may only connect**, so every failure is an assertion in a collected body rather than
  a hook error whose JSON shape nothing here has measured (A-1).
- **Adjacency proves the range is *not closed*, and can prove no more.** Given
  `ends_at > starts_at`, `[)` and `(]` overlap on identical conditions, so no reachable case
  distinguishes them and AC-3's message must not claim otherwise.

## Ruled

Twelve findings — **T** test-engineer, **I** implementer, **R00** reviewer — all ruled
**(a) Clarification**: the substance held; the specification or the stated reason did not.
`loopbacks: 0`.

| # | Finding | Remedy |
|---|---|---|
| **T-4** | case 0 asserted names and types, not *columns*: a `no_bay_overlap` keyed on `dealership_id` survives AC-3 | equality on `pg_get_constraintdef` |
| **T-5** | the one-violable-constraint discipline rested on FK trigger order, i.e. declaration order | positive controls, and the ordering rule |
| **T-6** | AC-3's step 5 is redundant and its reason false | kept, demoted to coverage; no mutant separates it |
| **T-7** | `postgres-harness.test.ts:50` asserts `pgmigrations` is empty, so the slice cannot go green | §7.2 |
| **T-8** | case 0's limit leaves an added singleton FK undetected | the architect's own limit narrowed; set equality on names |
| **T-9** | AC-10's fixture clause contradicts its assertion clause | the human's |
| **I-8** | the fallback mitigation is false: the harness silences the logger it needs | replaced; M-10 |
| **I-9** | the `singleTransaction` divergence is ADR-0007 drift, not two defaults | §7.2, §11 R-9 |
| **R00-3** | `appointment_technician_in_dealership` is proven to exist, never to fire | §11.2 R-11b |
| **R00-4** | AC-1 and AC-2 have no positive control, and the exemption's reason is false | controls |
| **R00-5** | four reference-table constraints are asserted by nothing | §8.1, §11.2 R-11a |
| **R00-1/2** | process findings | not the architect's; R00-2 produced the human's third gate state `N/A` |

**O-9.** T-7's remedy went to a second test-engineer commit rather than to the implementer, because
`tests/integration/` is not in `guard-paths.mjs`'s `TEST_OWNED`: the alternative would have had the
implementer edit a test-engineer-owned assertion to green its own commit.

## Measured — 2026-09-04, `postgres:16`, `pg@8.23.0`, `node-pg-migrate@9.0.0`

With `psql` and a `pg.Client`: they establish what PostgreSQL does, not that the harness reaches it.

| # | Result |
|---|---|
| **M-1** | `CHECK` fires before everything: equal, inverted, and inverted-plus-unqualified endpoints all report `23514` / `appointment_interval_ordered`, never `22000` |
| **M-2** | Exclusions pre-empt the FK triggers; with both violable, `no_bay_overlap` was reported. AC-5, AC-6 and AC-7's fixtures each report their intended `23503` |
| **M-3** | `btree_gist` 1.7. `pg_get_constraintdef` re-renders the predicate as `WHERE ((status <> 'cancelled'::appointment_status))`; an un-normalised literal fails on a correct schema |
| **M-4, M-5** | A malformed `0003` diverges across the two entry points on `--single-transaction` (§7.2) |
| **M-6, M-7** | They apply in filename order; a re-run applies `[]`; the three downs reverse cleanly (R-7d) |
| **M-8** | `code`, `constraint`, `table`, `schema` populated on all three SQLSTATEs |
| **M-10** | The failing migration's **name** is the last `### MIGRATION <name> (UP) ###` header the CLI prints, above `Error executing:`; the error line names nothing. Under `globalSetup`'s `log: () => {}` the `DatabaseError` carries **no filename in any field** |
| **M-11** | Clean on 16.15 and 17.11; PostgreSQL 18 emits `contype = 'n'` rows, so a denylist fails on invented names (R-7g) |

**Assumed, not measured.** `A-1`…`A-7` are *this design's*, distinct from arc42 §1.4's Gate A
assumptions of the same names, and cited by number from the event log, so they are not renamed:

| # | Assumption |
|---|---|
| **A-1** | How Vitest represents a `beforeAll` failure. Nothing depends on it |
| **A-2** | Which exclusion constraint is reported when both are violable. Observed once; PostgreSQL guarantees nothing — hence case 0's equality assertion |
| **A-3** | That two literal VINs would collide. Deduced; derived VINs moot it |
| ~~**A-4**~~ | ~~That neither role can reach a Docker daemon.~~ **Closed:** all three can, falsifying 00a's *"no container runtime"* |
| **A-5** | That the planner *chooses* the partial GiST indexes — QS-14's |
| ~~**A-6**~~ | ~~That `db:migrate` names the failing file.~~ **Closed by M-10**, but not where a reader looks |
| ~~**A-7**~~ | ~~That no later major surfaces `NOT NULL` as `pg_constraint` rows.~~ **Closed by M-11 — wrong** |

## Debt booked

Five live in arc42 §11 — **R-9a/R-9b** (the ADR-0007 drift, coupled to an unpopulated
`dist/persistence/`), **R-10**, **R-7d**, **R-6**. Two are recorded only here:

| Item | Why not here |
|---|---|
| **Replace `log: () => {}` in `tests/setup/postgres.ts`**, so a failed migration names its file | The seam promise holds for this file in this slice; M-10 is a working fallback |
| **`guard-paths.mjs` does not enforce the shared-`tests/integration/` boundary — O-9** | An implementer `Write` there is ALLOWed, verified. A blanket deny contradicts `CLAUDE.md` §5; the enforceable form — deny a write to an *existing* file there not importing `src/` — needs the hook to read contents |

## Ambiguity flagged rather than resolved

**AC-7 names no constraint** where AC-5 and AC-6 do; fixed at `appointment_bay_in_dealership`, since
*"rejected"* is satisfiable by four. **AC-9's "deterministically"** reads as *a pure function of the
case*, not *literal ids*; its **"every reference table"**, as all eight non-`appointment` relations.
**AC-4's "status is set to `cancelled`"** is a direct `UPDATE`; no application code exists here.
