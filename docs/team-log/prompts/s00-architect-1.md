# Prompt · slice 00 · architect · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 00 design, step 1
- Sent: 2026-09-04T07:51:21.068Z

---

You are the architect at **step 1 (Design)** for **slice 00 — the schema, the exclusion constraints, and seed data**. Branch `slice/00-schema-and-constraints`; scope marker `{"slice":"00"}`.

**This is the phase-4 pilot slice.** It runs the full loop against the criteria pre-registered in `docs/team-log/process-criteria.md`, and it lands the single artifact the whole submission rests on: the invariant that makes double-booking unrepresentable.

This is a **design**, not an implementation. No SQL files, no tests, no code.

## Read

- `docs/slices/00-schema-and-exclusion-constraints.md` — nine acceptance criteria, the human's, unchangeable by you.
- `docs/arc42/08-crosscutting-concepts.md` §8.1 — the schema you specified at Gate B, verbatim, including both exclusion constraints and every composite foreign key.
- `CLAUDE.md` §2.1 and §2.2 — NON-NEGOTIABLE. Overlap is unrepresentable by constraint; tests run against real PostgreSQL.
- ADR-0001 (opening hours, dealership IANA zone), ADR-0003 (cancellation and the atomic move), ADR-0007 (`node-pg-migrate` running plain `.sql`), and §1.4's assumptions A-1 through A-10 — especially **A-4** (no buffer; the appointment interval *is* the occupancy interval) and **A-6** (nothing created implicitly).
- **`docs/slices/00a-design.md`** — the walking skeleton you designed. §4's migration seam is the thing this slice plugs into: `globalSetup` already calls `node-pg-migrate` unconditionally against `src/persistence/migrations/`, applying zero files. Slice 00 adds `0001_*.sql` and changes nothing else.
- **`docs/DEFECTS.md`** — 39 findings from 00a, 11 open. Read it. Several are yours, and the rules they produced apply to this design.
- `docs/arc42/05-building-blocks.md` §5.2 as-built, and `docs/arc42/07-deployment-view.md` §7.2.

## What 00a established that this design must inherit

Two rules came out of the walking skeleton, both now in the design record, and both apply here:

1. **A green thing says nothing about what it examined.** Every assertion about a result must be preceded by an assertion about coverage.
2. **A stated mechanism nobody ran is not a mechanism.** Four of your own causal sentences were wrong in 00a — confident, and never executed. Where this design asserts *because X, Y*, either name the test that would fail, or label it *assumed, not measured*.

Apply both to yourself as you write.

## What the design must settle

Write it to **`docs/slices/00-design.md`**.

1. **The migrations, as files.** How §8.1's schema splits across `0001_extensions.sql`, `0002_reference_data.sql`, `0003_appointment.sql` — and whether that split is right, given `node-pg-migrate` runs them in order and `btree_gist` must exist before the exclusion constraints. Say what happens on a re-run, and whether anything is needed for down-migrations.
2. **The exclusion constraints, verbatim**, and the reasoning for every part of them: `WHERE (status <> 'cancelled')`, `tstzrange` half-open semantics, why `btree_gist` is required for `uuid WITH =` alongside `range WITH &&`.
3. **Seed fixtures.** AC-9 requires them loadable into an empty database and deterministic. Decide the mechanism — SQL, a loader module, or `node-pg-migrate` — and who owns it. Note that 00a's harness gives every test a database via `provide`/`inject`; say how a test gets a *clean* one, since AC-1 through AC-8 each need a known starting state and the container is one per run.
4. **`tests/integration/exclusion-constraints.test.ts`** — the test-engineer's, per `CLAUDE.md` §5's database-invariant clause and 00a's §8.5 boundary rule (*a `tests/integration/` file that reaches the database only through a connection string is the test-engineer's*). Specify what it must establish for each of AC-1 to AC-8, not its code. **AC-3 is the one to be most careful about**: adjacency is not overlap, and a test that passes because nothing was inserted proves nothing.
5. **How a SQLSTATE assertion is made without trusting the driver's message text.** AC-1, AC-2, AC-5, AC-6, AC-7 all assert a specific error. ADR-0006 chose Kysely over `pg` partly because it preserves `err.code` and `err.constraint`; say exactly what is asserted and what is not.
6. **Data-model delta** — this slice is nothing but data model, so this is the substantial section.
7. **The §10 scenarios**: QS-1, QS-2 and QS-11 are linked. QS-1 and QS-2 are *concurrency* scenarios whose full enforcement lands at slice 02. State precisely what this slice makes true for each, and what it deliberately does not.
8. **Proposed arc42 edits** for step 7, and any ADR needed.

## The bootstrap questions, which are real this time

00a could not satisfy C1 or AC-6's own red proof. **Slice 00 can.** Say explicitly what the pilot now measures that 00a could not, and what the red commit will look like — this slice's tests assert against a schema that does not exist, so the red is a migration failure or a missing table. **Make sure that red is an assertion failure and not a setup crash**, because 00a's §4 has `globalSetup` call the migration runner before any test: if `0001_*.sql` is malformed the whole run aborts and the red proves nothing. That is the single most likely way this slice's red goes wrong, and it is yours to design around.

## Rules

- You may not change the acceptance criteria. If one is wrong, that is a DCR.
- Do not write to `docs/team-log/`, do not move the board, do not push, do not comment on the PR.
- Commit as `docs(00): slice design`, ending with:

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WsmVKqwdSeBsLAv6qMduLw

## Report back

Key decisions; anything the ACs leave genuinely ambiguous, flagged now while it is cheap; any ADR raised; what the test-engineer and implementer are most likely to object to at step 2; and — given 39 findings came out of a slice with no domain logic — where you think this design is most likely to be wrong.
