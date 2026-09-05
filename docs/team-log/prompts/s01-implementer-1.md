# Prompt · slice 01 · implementer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 01 step 2 agree — implementer
- Sent: 2026-09-04T17:00:35.127Z

---

You are the implementer at **step 2 (Agree)** for **slice 01 — the domain policy core**. Branch `slice/01-domain-policy-core`, already checked out. Scope marker `{"slice":"01"}`.

**This is a review, not an implementation.** Write no production code. Create nothing under `src/` or `tests/unit/`. Your output is a set of reasoned verdicts on the architect's design, returned in your report.

## Read

- `docs/slices/01-design.md` — the architect's design, 866 lines. §13 names three things it *wants* argued about; you are not limited to them. §2 is the module interfaces, §10 is addressed to you.
- `docs/slices/01-domain-policy-core.md` — six acceptance criteria, the human's. Note the O-13 block after AC-6.
- `docs/adr/0013-outside-in-tests-exercise-the-built-artifact.md` — `status: proposed`.
- `.dependency-cruiser.js`, the `domain-is-pure` rule.
- `stryker.config.mjs` and `vitest.mutation.config.ts` — **slice 01 is the first slice in this project whose mutation score is a real number rather than N/A.** Threshold 0.75, command runner, mutates `src/**/*.ts`, runs `tests/unit/**` only.
- `CLAUDE.md` §2, §5 (your ownership boundaries — you must never create or edit acceptance, contract, property, concurrency or architecture tests), §6, §7 (every implementer commit is green).
- `docs/team-log/phase-4-retro.md`, especially *"The finding that is not a criterion"* and its rule: **for a discrimination claim, name the mutant; for a mechanism claim, name the call site.**

## Already measured — do not re-litigate, and do not re-derive

Run by the orchestrator before you were dispatched. Treat as fact:

- **DA-3 is discharged.** A *computed* `pathToFileURL(...).href` of a `dist/` module typechecks clean and Vitest executes it; a *literal* specifier for a not-yet-existing module is `TS2307` and `npm run typecheck` exits 2. Control: clean once removed.
- **DA-1's ruleset half is measured.** `domain-is-pure` is `from: ^src/domain/` → `to: { pathNot: '^src/domain/' }`, so intra-domain imports do not fire it. The *reading of AC-6* is still open and is question 1 below.
- Full ICU, 418 zones, node v24.18.0. `opening_hours` and `service_type.duration_minutes` already exist from slice 00; **this slice has no migration**.

## What you are being asked

Give a verdict — **AGREE** or **DISAGREE** — on each, with reasoning, and where you disagree say what you would do instead.

1. **DA-1 / AC-6.** AC-6 says `src/domain` "imports nothing at all — the `domain-is-pure` rule holds with no allowlist." The design reads intra-domain type imports as satisfying that, since AC-5 (three named files) and a literal AC-6 are otherwise jointly unsatisfiable. **You are the one who would have to write three modules under the literal reading.** Is it satisfiable at all? If not, say so concretely — that is a DCR to the human and it is far cheaper now than after three modules exist.

2. **The interfaces in §2.** Two smart constructors (`instant()`, `serviceDuration()`) returning `T | null`, then total functions above them. Are they implementable as specified, and are the types right? In particular: is `T | null` the right failure channel, or does it push a burden onto every call site that a discriminated result type would carry better?

3. **`withinOpeningHours` returning a six-variant verdict union rather than a boolean.** The design gives three reasons, the third being mutation: a boolean lets a mutant return the right refusal for the wrong reason and survive. **This is the first design decision in this project made because of how it will be mutation-tested** — judge it on its merits. Six variants is also six things to construct and six to keep in sync. Is the trade right?

4. **The mutation score, which is yours to hit.** Small pure functions are densely mutable and the threshold is 0.75 on changed files. Reading §2's interfaces and §10's notes: is 0.75 achievable here without writing tests that exist only to kill mutants? Name any construct in the design you expect to generate survivors you could not honestly kill — boundary comparisons and the `time` parser are the places to look.

5. **§3's opening-hours parameter shape** — a 7-slot tuple indexed by `DayOfWeek = 0..6`, `null` the only representation of a closed day, absence unrepresentable. The domain receives raw `time` strings and parses them itself, because parsing is wall-clock reasoning and AC-5 confines that to one file. Is that the right seam, and is DA-2 (PostgreSQL `time` admits `24:00:00`) a real case you must handle or a phantom?

6. **§4's DST decision procedure.** Render both endpoints, compare wall clock, never local→instant. Does the fixed order in §4.2 actually produce AC-3's answer (00:30 local + 60 min = 02:30 local on spring-forward night), and does it handle the fall-back case where a local time occurs twice?

## How to answer, per §6

- **One verdict per objection, with reasoning.** Where you agree, say why — a bare "agreed" is worth nothing to the record.
- **Disagreement is expected and is not failure.** You are not obliged to concede to keep the slice moving. §6 is explicit that a round which never produces a disagreement reads as deference, not consensus. Equally, do not manufacture an objection you do not hold.
- **Judge the finding and the remedy separately.** You may accept a problem is real and reject the fix proposed alongside it.
- You may raise and argue once. You do not decide — the architect rules, and acceptance criteria go to the human.

Return your verdicts in your report. Do not push. Do not write to `docs/team-log/`. Do not comment on the PR.
