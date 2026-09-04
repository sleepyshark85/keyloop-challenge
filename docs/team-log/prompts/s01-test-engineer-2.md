# Prompt · slice 01 · test-engineer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 01 step 3 — the red commit
- Sent: 2026-09-04T19:05:51.300Z

---

You are the test-engineer at **step 3 (Red)** for **slice 01 — the domain policy core**. Branch `slice/01-domain-policy-core`, checked out, PR #10 open. Scope marker `{"slice":"01"}`.

You reviewed this design at step 2. Your two objections were both upheld and one of them changed the project's CI. Read the amended design before you write anything — it is materially different from what you reviewed.

## What changed since your step-2 review

- **The human ruled AC-6 LITERALLY.** `src/domain` imports nothing at all, intra-domain included. **Your third-path argument is why that ruling was available** — the architect conceded its "jointly unsatisfiable" claim was overstated and sided with you against the implementer. Signatures are now `appointmentInterval(startsAt, durationMillis)` and `withinOpeningHours(startsAtMillis, endsAtMillis, ianaZone, weekly)`, with composition in `src/application`.
- **arc42 §5.2 line 40 stands unamended** — the amendment is withdrawn, not deferred. That is your objection landing.
- **A new branch exists because of the ruling:** `malformed-interval`, §4.2's new step 1, with its own property **P7** and mutant row. It exists only because the `Interval` type can no longer carry "ordered, and from the same interval" across a boundary.
- **T-01-2 was ruled (c) design defect** — your finding, naming §2.4. The remedy landed as `c328d84` and **is already proven in CI on the commit you are branching from**: `npm test` is now `tools/ci/run-tests.mjs`, which runs the two projects as separate invocations, merges into the one `test-results.json` `red-proof` reads, and makes a project that did not run a loud exit-2 failure rather than an empty contribution. CI on this branch just recorded `nodb ran, 7 file(s)` and `db ran, 3 file(s)`.
- `pretest:nodb` and `pretest:db` now exist, so the Docker-free path builds `dist/` rather than running against nothing.

## Read

- `docs/slices/01-design.md` **as amended** (`143b500`, `fb3ff83`) — especially §4.2 (decision procedure, new step 1), §5 (the property and generators), §6.2/§6.3 (the `dist/` seam and the project split), §7 (the containment scan), §8 (the red).
- `docs/adr/0013-outside-in-tests-exercise-the-built-artifact.md`, revised in place pre-ratification.
- `docs/slices/01-domain-policy-core.md` — six ACs, the human's, with the O-13 block.
- `CLAUDE.md` §2.4, §5, §7. `docs/arc42/10-quality-requirements.md` QS-9 and QS-12 (both now corrected).

**Per §5 you must not read `src/`.** Nothing is there yet; the boundary holds anyway.

## What you are building

**Exactly one red commit**, subject matching `^test\(.+\): .*\(red\)$`, per §7. Everything below in that one commit.

1. **`tests/property/opening-hours-dst.test.ts`** — QS-9. The properties in design §5.2 including **P7**, the oracle per §5.1 (independent of the implementation — plain `getUTC*` arithmetic, no `Intl` anywhere in the oracle, and say so in a comment so a reviewer sees the independence rather than infers it).

2. **`tests/architecture/ambiguity-containment.test.ts`** — AC-5, QS-12. The corpus guard, the planted-violation control and the positive assertions per design §7.

3. **`vitest.config.ts` is yours to edit**, and it needs editing: `tests/property/**` is currently in the **`db`** project. Design §6.3 splits it on `*.db.test.ts` so a Docker failure cannot crash this slice's evidence. Make that split. This slice's property test is Docker-free and belongs in `nodb`.

4. **The three refinements you committed to at step 2 — they were adopted, and two were recorded as defects in the design rather than as your polish.** Apply them:
   - **minimum counts sized so a broken stratum fails reliably**, not a `> 0` floor; your ~29% figure is now cited in the design.
   - **word-boundary matching** on the `60_000` / `60000` marker — a substring match false-positives on an ordinary `600000` timeout.
   - **your self-owned scan** for a computed dynamic-import specifier resolving under `src/` rather than `dist/`. ADR-0013's consequences were narrowed on the strength of you owning it, so it needs to exist.

## The red must be observed, and it must be unambiguous

C1's wording is *"a real assertion failure rather than a missing import"*. Design §8.3 sets out how that is achieved structurally — nothing statically imported from `src/`, the module load inside a `try` in a test body, the property test outside the `db` project. **Verify it locally before you commit**, do not assume it:

- `npm run test:nodb` must produce **`AssertionError`s inside collected test bodies** — no import error, no collection error, no hook error.
- The failures must be the ones design §8.3 predicts, and the passing half must pass for the reasons §8.2 gives. A red that fails for an unintended reason is not this slice's red.
- Report the exact failure output in your report. I will collect the CI verdict separately; the claim that it is red must be yours and measured, not narrated.

## Rules

- You own these files. **You must not create or edit anything under `src/` or `tests/unit/`.**
- You may not change an acceptance criterion. If one is wrong, raise a DCR — O-13 is the precedent and it went to the human.
- Do not write to `docs/team-log/`. Do not run `npm run defects` or `npm run status`. Do not push — I will. Do not comment on the PR.
- Commit message: `test(01): <what fails and why> (red)`, ending with:

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW

One last thing, and I want your judgement rather than compliance. The design's §5.3 coverage mechanism is *yours* — it was specified because a property test that cannot demonstrate what it examined is not evidence. If, while writing it, accumulate-and-assert turns out to be the wrong mechanism, say so and use a better one. The requirement is non-negotiable; the mechanism never was.
