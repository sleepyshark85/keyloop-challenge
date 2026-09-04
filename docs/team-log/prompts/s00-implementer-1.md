# Prompt · slice 00 · implementer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 00 step 2 agree
- Sent: 2026-09-04T08:16:50.581Z

---

You are the implementer at **step 2 (Agree)** for **slice 00 — the schema and the exclusion constraints**. Branch `slice/00-schema-and-constraints`. PR #6 is the venue.

**This is the phase-4 pilot slice**, and it lands the invariant the whole submission rests on. `CLAUDE.md` §2.1 makes the mechanism NON-NEGOTIABLE.

Review the design only. Write no code, no migrations, no tests. Your output is a judgement: **agree** or **object**, with reasons.

## Read

- `docs/slices/00-schema-and-exclusion-constraints.md` — nine ACs, the human's.
- `docs/slices/00-design.md` — what you are reviewing. **§11.1 carries nine measurements** the architect took against a real `postgres:16`; the orchestrator reproduced three independently — constraint evaluation order, AC-8's SQLSTATE, and adjacency.
- `docs/arc42/08-crosscutting-concepts.md` §8.1 — the schema verbatim, which you implement.
- ADR-0007 (`node-pg-migrate` running plain `.sql`), ADR-0006 (Kysely preserving `err.code`/`err.constraint`), ADR-0012 (`proposed`).
- `docs/slices/00a-design.md` §4 — the migration seam you plug into, which you built.
- `docs/DEFECTS.md` — 39 findings from 00a.

## The question you are answering

**Can you build exactly this, and would the migrations apply cleanly forward, down, and on re-run?**

Judge specifically:

1. **The three-file split** — `0001_extensions.sql`, `0002_reference_data.sql`, `0003_appointment.sql`. Right boundaries? `btree_gist` must exist before the exclusion constraints; `node-pg-migrate` runs in order. Anything that cannot be expressed as plain `.sql` under ADR-0007?
2. **§8.1's schema verbatim** — both exclusion constraints, four composite FKs, the enum, the CHECK. Is any of it wrong, unbuildable, or dependent on something the design does not state? You measured `node-pg-migrate`'s behaviour from source in 00a; apply that standard.
3. **All three migrations land in ONE commit**, because `0001`+`0002` without `0003` leaves the suite CI-red and §7 forbids a red implementer commit. Do you accept that, given it is one commit well past the ~150-line guidance?
4. **The measured `singleTransaction` divergence.** `npm run db:migrate` (CLI) defaults it true; `globalSetup`'s programmatic `runner()` does not — so a malformed `0003` leaves `0001`/`0002` committed where the CLI rolls back. The architect recorded it and deliberately did **not** fix it, because doing so edits `tests/setup/postgres.ts` and breaks 00a's seam promise on the slice where that promise makes a CI failure attributable. Sound?
5. **The step-4 hazard, which is yours.** Measured: a malformed migration makes `globalSetup` reject and the `db` project produce **no results at all**. Your inner loop is `npm run test:nodb` — which does not touch the database. So how do you get a fast, truthful signal while iterating on SQL? The architect rejected a `try`/`catch` around the runner as *"substituting an evidence chain for an observation."*
6. **Down-migrations and re-runs.** The design says the split applies cleanly forward, down and on re-run, measured. Verify that claim rather than accept it — 00a taught that a stated mechanism nobody ran is not a mechanism.
7. **Docker.** The architect's shell reaches a daemon, contradicting 00a §11.5's record that neither role could. **Check yours.** If you have Docker, your whole step-4 loop for a database-only slice changes, and the design should say so.

## Rules

- You may not edit the ACs, and you may not edit any test the test-engineer owns — including `tests/support/seed.ts`, which ADR-0012 assigns to it.
- Do not write to `docs/team-log/`, do not push, do not commit, do not comment on the PR.

## Report back

Lead with **AGREE** or **OBJECT**. Then per point, reporting what you *found* rather than whether the argument sounds plausible — for points 6 and 7 especially, that means running something. If you agree, list what you will create at step 4 in commit order.

You found the harness defect that made 00a's mutation score meaningless by checking a number instead of accepting it. **The same instinct is what this slice needs**, because the migrations either make overlap unrepresentable or they do not, and there is no test above them to catch it.
