# Prompt · slice 01 · architect · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 01 design, step 1
- Sent: 2026-09-04T16:37:38.578Z

---

You are the architect at **step 1 (Design)** for **slice 01 — the domain policy core: duration, occupancy interval, and opening hours**. Branch `slice/01-domain-policy-core` (already created and checked out); scope marker `{"slice":"01"}`.

This is the **first slice of phase 5** — the first business-implementation slice, and the first slice in the project that produces mutable `src/` files. Slice 00a was scaffolding and slice 00 was pure SQL.

This is a **design**, not an implementation. No TypeScript, no tests, no code.

## Read

- `docs/slices/01-domain-policy-core.md` — six acceptance criteria, the human's, unchangeable by you. **Note the block after AC-6**: AC-2's worked pair was amended by human ruling O-13 at step 1, before you were dispatched, because as written it described Europe/London at UTC−1. Design against the amended pair.
- `docs/arc42/05-building-blocks.md` §5.2, `08-crosscutting-concepts.md` §8.3 (time and DST), and §12 (glossary — this slice must add to it).
- `ADR-0001` (opening hours as request validation, dealership IANA zone), and §1.4 assumptions **A-1** (duration derives the interval) and **A-4** (no buffer; the appointment interval *is* the occupancy interval).
- `.dependency-cruiser.js`, the `domain-is-pure` rule — deliberately absolute, no allowlist.
- `CLAUDE.md` §2 (NON-NEGOTIABLE) and §5 (test ownership by path).
- `docs/DEFECTS.md` — 59 findings, 21 open. Several are yours. Read O-13, the one raised against this slice.
- `docs/team-log/phase-4-retro.md` — in particular **"The finding that is not a criterion"**. Its operational rule is binding on this design: **for a discrimination claim, name the mutant; for a mechanism claim, name the call site.**
- `docs/slices/00-design.md` and `00a-design.md` for the two standing rules: *a green thing says nothing about what it examined*, and *a stated mechanism nobody ran is not a mechanism*.

## Ground truth already established, which you must design onto

Verified by the orchestrator before dispatch — treat as measured, not assumed:

- `opening_hours(dealership_id, day_of_week, opens_at, closes_at)` and `service_type.duration_minutes` **already exist**, from slice 00's `0002_reference_data.sql`. A day with no row is a closed day, by the table's own comment. **This slice has no migration and no data-model delta** — say so explicitly rather than leaving the section blank.
- `src/domain/` exists and is empty but for `.gitkeep`.
- Full ICU is present (node v24.18.0, 418 zones). `2026-03-29T01:30Z` renders `02:30` Europe/London; the spring-forward discontinuity `00:59 → 02:01` across `01:00Z` is real.
- `fast-check@4.9.0` is installed and verified to find counterexamples.
- Stryker mutates `src/**/*.ts` via the **command runner** and runs `tests/unit/**` only. Threshold 0.75. **This is the first slice whose mutation score will be a real number rather than N/A**, and small pure functions are densely mutable.

## What the design must settle

Write it to **`docs/slices/01-design.md`**.

1. **The three modules and their exact interfaces** — `duration.ts`, `interval.ts`, `openingHours.ts`. `domain-is-pure` forbids importing *anything*: no `src/` module, no npm package, no `node:` builtin. Note that `Intl.DateTimeFormat` is a **global, not an import**, and say plainly whether that satisfies the rule in letter and in spirit, because AC-5 requires its `timeZone` use to be confined to `openingHours.ts` and AC-6 requires `depcruise` to see no imports at all.

2. **How opening hours reach a pure core.** AC-4 says a missing row is a closed day. The domain imports nothing and cannot query — so the hours must be passed in. Specify the parameter shape, who assembles it, and what the domain does with a day that has no entry. Be precise about whether "no row" is represented as absence, as `null`, or as an explicit closed marker; the three fail differently.

3. **The DST design, which is the substance of this slice.** AC-2 (accept iff the *local* rendering lies in the window, both sides of both transitions) and AC-3 (duration added on the **absolute** timeline, so 00:30 local + 60min = 02:30 local on spring-forward night). State the rule once, in one place, and name which module owns it. Address the fall-back transition too — AC-2 says *both* transitions, and an ambiguous local time that occurs twice is the case most likely to be got wrong.

4. **`tests/property/opening-hours-dst.test.ts`** — the test-engineer's. Specify the *property*, not its code: what must hold for all generated instants, and what generators make the DST boundaries actually get hit rather than merely being possible in principle. A property test that generates uniformly over a year will hit a transition hour with probability ~0.0002; say how the design avoids a property that passes because it never looked.

5. **A seam you must rule on.** `vitest.config.ts` puts `tests/property/**` in the **`db` project**, which has `globalSetup: tests/setup/postgres.ts` — so this pure-domain property test would spin up PostgreSQL to test functions that import nothing. Later property tests (about the constraint) genuinely will need a database. Rule: does `tests/property/` split by whether the property needs a database, does this test live elsewhere, or does it pay the container cost? Note `vitest.config.ts` is **the test-engineer's file** — you specify the intent, not the edit.

6. **`tests/architecture/ambiguity-containment.test.ts`** (AC-5, QS-12) — the test-engineer's. Specify what it must establish. This is a *source scan*, and the retro's rule bites hardest here: a scan that finds nothing because its glob was wrong reports the same green as a scan that finds nothing because the code is clean. Say what makes it discriminating.

7. **The red, and how it stays an assertion failure.** Slice 00's design had to ensure its red was not a `globalSetup` crash. The analogous trap here: the test-engineer's tests import `src/domain/*` modules **that do not exist yet**, so the red is a module-resolution error, not an assertion failure — and C1 requires *"a real assertion failure rather than a missing import"*, in those words. This is yours to design around. Say exactly what the red commit looks like and what makes it satisfy C1.

8. **The §10 scenarios** — QS-9 and QS-12. State precisely what this slice makes true for each, and what it deliberately does not.

9. **Proposed arc42 edits** for step 7, including the §12 glossary entries the Definition of Done requires, and any ADR needed.

## Rules

- You may not change the acceptance criteria. If one is wrong, that is a DCR — O-13 is the precedent and it went to the human.
- Do not write to `docs/team-log/`, do not move the board, do not push, do not comment on the PR.
- Apply the two standing rules to your own prose. Where the design asserts *because X, Y*, either name the test that would fail or label it *assumed, not measured*.
- Commit as `docs(01): slice design`, ending with:

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
