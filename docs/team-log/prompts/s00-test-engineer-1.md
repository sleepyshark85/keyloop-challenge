# Prompt · slice 00 · test-engineer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 00 step 2 agree
- Sent: 2026-09-04T08:16:32.180Z

---

You are the test-engineer at **step 2 (Agree)** for **slice 00 — the schema and the exclusion constraints**. Branch `slice/00-schema-and-constraints`. PR #6 is the venue.

**This is the phase-4 pilot slice**, and it lands the invariant the whole submission rests on.

Review the design only. Write no tests, no code, no migrations. Your output is a judgement: **agree** or **object**, with reasons.

## Read

- `docs/slices/00-schema-and-exclusion-constraints.md` — nine ACs, the human's.
- `docs/slices/00-design.md` — what you are reviewing. **§11.1 carries nine measurements** the architect took against a real `postgres:16` rather than asserting; the orchestrator independently reproduced three of them.
- `docs/adr/0012-seed-fixtures-are-a-test-owned-loader.md` — `proposed`, and it assigns you a file.
- `docs/arc42/08-crosscutting-concepts.md` §8.1 (the schema) and §8.5 as-built.
- `CLAUDE.md` §2.1, §2.2, §5.
- `docs/DEFECTS.md` — 39 findings from 00a. You raised many of them; the disciplines they produced apply here.
- `docs/slices/00a-design.md` §4 — the migration seam this slice plugs into.

## The question you are answering

**Can you write a failing test for every AC from this design, and would each fail for the reason it names?**

Judge specifically:

1. **AC-1 to AC-9, each.** Name any you cannot assert from this design.
2. **The architect says §4's AC-3 specification is where the design is most likely wrong** — *"the case with the most ways to pass while proving nothing"*, with four assertions it *"reasoned into place rather than saw fail"*, and it does not know which is redundant or missing. That is a direct invitation. You have spent a slice mutant-checking assertions against the implementation they exist to reject. **Do that here, on paper, before either of us writes it.**
3. **The one-violable-constraint discipline.** Because evaluation order is CHECK → exclusion → FK, every negative case must make exactly one constraint violable, and *nothing enforces this*. The architect names it as the second most likely thing to be wrong. Is a hand-maintained discipline good enough, or is there a shape that makes a drifting fixture fail loudly?
4. **`beforeAll` may only connect** — no DDL, no DML, no seeding — so the red is assertion-shaped rather than a `globalSetup` crash. Workable for you? It is the rule protecting this slice's central evidence.
5. **ADR-0012 and `tests/support/seed.ts`.** Derived ids over `randomUUID()`; the architect pre-conceded this is legibility, not correctness, and expects you to object. One dealership subtree per case. Does that give you a clean starting state for each of AC-1 to AC-8, given the container is one per run and the suite is parallel?
6. **`service_type`, `customer` and `vehicle` are not dealership-scoped**, so isolate-by-data is partial from its first use. Does that break any case you would write?
7. **The measured `singleTransaction` divergence** — the CLI rolls back a malformed migration set, `globalSetup` does not — recorded and deliberately not fixed here. Do you accept that, given it would edit your `tests/setup/postgres.ts`?

## Rules

- Do not read or write `src/`. The hook denies both.
- You may not edit the ACs. If one is wrong, that is a DCR.
- Do not write to `docs/team-log/`, do not push, do not commit, do not comment on the PR.

## Report back

Lead with **AGREE** or **OBJECT**. Then per point. Objections name the AC or the design statement disputed and the change that resolves it. If you agree, say what you will write at step 3 and in which files.

The architect handed you two things it believes are wrong and could not resolve. **Finding one of them is worth more than agreeing with the other eleven points.**
