# Prompt · slice 01 · test-engineer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 01 step 2 agree — test-engineer
- Sent: 2026-09-04T17:00:12.325Z

---

You are the test-engineer at **step 2 (Agree)** for **slice 01 — the domain policy core**. Branch `slice/01-domain-policy-core`, already checked out. Scope marker `{"slice":"01"}`.

**This is a review, not an implementation.** Write no tests. Create no files under `tests/`. Your output is a set of reasoned verdicts on the architect's design, returned in your report. You commit nothing except — if you want one — a note; prefer returning the argument in your report.

## Read

- `docs/slices/01-design.md` — the architect's design, 866 lines. §13 names three things it *wants* argued about; you are not limited to them.
- `docs/slices/01-domain-policy-core.md` — six acceptance criteria, the human's. Note the O-13 block after AC-6.
- `docs/adr/0013-outside-in-tests-exercise-the-built-artifact.md` — `status: proposed`. The seam ruling this slice rests on.
- `docs/arc42/10-quality-requirements.md` QS-9 and QS-12; `08-crosscutting-concepts.md` §8.3.
- `CLAUDE.md` §2, §5 (your ownership boundaries), §6 (how adjudication works).
- `docs/team-log/phase-4-retro.md`, especially *"The finding that is not a criterion"* and its rule: **for a discrimination claim, name the mutant; for a mechanism claim, name the call site.**

**Per §5 you must not read `src/`.** There is nothing in `src/domain/` yet but the boundary holds regardless.

## Already measured — do not re-litigate, and do not re-derive

Run by the orchestrator before you were dispatched. Treat as fact:

- **DA-3 is discharged.** A *computed* `pathToFileURL(resolve('dist/domain/_spike.js')).href` typechecks clean and Vitest **executes** it (2 tests passed under `--project nodb`, one asserting a missing dist module rejects at runtime). A *literal* specifier for a not-yet-existing module is `TS2307` and `npm run typecheck` exits 2. Control: clean once removed.
- **DA-1's ruleset half is measured.** `domain-is-pure` is `from: ^src/domain/` → `to: { pathNot: '^src/domain/' }`, so intra-domain imports do not fire it. The *reading of AC-6* is still open and is question 1 below.
- `fast-check@4.9.0` installed, verified to find counterexamples. Full ICU, 418 zones. `opening_hours` and `service_type.duration_minutes` already exist from slice 00; this slice has no migration.

## What you are being asked

Give a verdict — **AGREE** or **DISAGREE** — on each of the three questions the design raises, plus anything else you find. For each: state the reasoning, and where you disagree, say what you would do instead.

1. **DA-1 / AC-6.** AC-6 says `src/domain` "imports nothing at all — the `domain-is-pure` rule holds with no allowlist." The design reads intra-domain type imports as satisfying that, on the grounds that AC-5 (three named files) and a literal AC-6 are otherwise jointly unsatisfiable. Is that reading right? If you think AC-6 means *literally nothing*, say so — that is a DCR to the human, and it is far cheaper now than after three modules exist.

2. **ADR-0013 / the `dist/` seam.** The design rules that outside-in tests reach the pure domain by loading the built artifact under `dist/` rather than importing `src/`, because `outside-in-tests-do-not-import-src` forbids the latter and a literal specifier fails `red-proof`'s verify precondition anyway. The architect's own framing of the risk: is loading `dist/` a legitimate outside-in boundary, or is it importing `src/` with extra steps? **You own these test directories** — this is your call more than anyone's. The recorded costs are that the loaded module is typed `any` and `dependency-cruiser` cannot see a computed import. If you reject it, the design names deferring QS-9 as the next best option.

3. **§5.3's coverage assertions.** The design specifies an accumulate-and-assert mechanism so the property test can demonstrate it actually hit the DST boundaries, rather than passing because it never looked (uniform generation over a year hits a transition hour with probability ~0.0002). **The mechanism is explicitly negotiable and yours**; the requirement that a property test demonstrate what it examined is not. If you have a better mechanism, propose it.

Also judge, because they are yours and the design's claims about them are testable:

4. **§8.3's claim that the red is structurally an assertion failure**, not an import or collection error — C1's exact wording. The design gives three reasons. Are they sufficient? Is there a path by which this slice's red still arrives as a crash?
5. **§7's ambiguity-containment scan** (AC-5, QS-12). §7.3 has a corpus guard and §7.4 a planted-violation control. Is the scan discriminating, or can it report clean because its glob was wrong?
6. **§5.1's "the oracle must not be the implementation."** Does the design's oracle avoid restating the code under test?

## How to answer, per §6

- **One verdict per objection, with reasoning.** Where you agree, say why — a bare "agreed" is worth nothing to the record.
- **Disagreement is expected and is not failure.** You are not obliged to concede to keep the slice moving. §6 is explicit that a round which never produces a disagreement reads as deference, not consensus. Equally, do not manufacture an objection you do not hold — a reasoned agreement on a point that deserves it is a real answer.
- **Judge the finding and the remedy separately.** You may accept that a problem is real and reject the fix proposed alongside it, or accept a narrower one.
- You may raise and argue once. You do not decide — the architect rules, and acceptance criteria go to the human.

Return your verdicts in your report. Do not push. Do not write to `docs/team-log/`. Do not comment on the PR.
