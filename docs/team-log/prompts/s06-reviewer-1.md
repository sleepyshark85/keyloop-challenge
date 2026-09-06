# Prompt · slice 06 · reviewer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 06 step 5 review
- Sent: 2026-09-06T15:35:31.541Z

---

Slice 06 **step 5 — REVIEW.** Branch `slice/06-reschedule-atomic-move`, PR #15. The diff is `git diff main...HEAD`. You may block a merge and raise a DCR; you may **not** change the design.

**Read:** `docs/slices/06-design.md`, `docs/slices/06-reschedule-atomic-move.md`, ADR-**0025** (existence is the read's, legality the statement's), **0026** (the lock is a value the write takes), **0027** (a move attempts the pair it already holds before it shuffles), **0028** (`proposed`, not built this slice).

**State.** Red at `ec37a20`, observed red in CI (run 34037559448: `test` FAIL, `red-proof` PASS). Green at `221ca66` (run 34040184785, all three jobs PASS). Five implementer commits `22ac211`..`d046670`. One test repair at `8bcf822`. Layering clean, typecheck clean. Zero loopbacks of a maximum two; one DCR ruled (a).

---

## Five things I am asking you to chase specifically. The last two are the ones nobody else can do.

**1. `src/application/rescheduleAppointment.ts` scores 0.70 with 36 survivors — below §10's 0.75 threshold — and it is the worst-scoring file in the repository.** It is 287 lines of new application code behind 340 lines of new unit test. Report at `reports/mutation/mutation.json` (Stryker 10.0.0, 18m12s, do **not** re-run it unless you need to). **Classify every one of the 36.** At slice 05 you found eighteen of nineteen survivors were inert by shape and that finding is what made the score readable — do that here. The question the gate needs answered is not "what is the number" but "which of these 36 are real gaps in the test suite".

**2. §10's clause decides this slice and it is ambiguous — I-06-5.** *"Mutation score above threshold **on changed files**"* reads two ways: as an **aggregate over changed files** it is 86.14 and passes; as **each changed file** it fails on the one file this slice exists to add. `tools/slice/check.mjs:417` reads a single number, and I recorded the aggregate for comparability with slice 05's 0.9122 — deliberately **not** choosing the reading that makes the gate green. Give your reading and your reasons. The architect or the human rules it; your classification in (1) is most of the evidence.

**3. I-06-3 — the implementer lost work and rebuilt it, and asked for exactly this check.** While splitting its diff into commits it reverted the http-layer files to `HEAD` and restored them afterward, **overwriting five modified files without saving them first**: `routes/appointments.ts`, `problem.ts`, `server.ts`, `main.ts` and their tests. It reconstructed them from edits recorded earlier in its transcript, re-verified `tsc`, the 549-test `nodb` suite and `lint:arch`, then committed. Its own words: *"a reviewer diffing `b7e121e`/`d046670` against what I described earlier in the transcript is a legitimate independent check I'd want someone to actually do, since I'm the one attesting the reconstruction is faithful."* The transcript is at `docs/team-log/prompts/s06-implementer-2.report.md` and its predecessors. **You are the only role that can discharge this.** Say plainly whether the merged code is complete and coherent, or whether something is missing.

**4. The implementer's own "look hardest at this".** In `rescheduleAppointment.ts`, zero rows from the guarded `UPDATE` is treated as `not-confirmed` at **every** attempt number, not only attempt 1. ADR-0025 decision 2's *"zero rows means exactly one thing"* has to hold **uniformly across the whole retry loop**, not just on the first try. Check it.

**5. AC-2, and this slice's Definition of Done names you by role.** *"The reviewer reads the generated SQL, not only the test result. AC-2 is the criterion most easily satisfied by a test that passes for the wrong reason."* Read the SQL `rescheduleAppointmentById` actually generates. Confirm it is **one** statement — no `DELETE`-then-`INSERT`, no cancel-then-book, no pre-read deciding legality.

---

## Also verify, as standing review duties

- **Commit discipline (§7).** Exactly one red commit, the test-engineer's, `(red)`-marked. Every implementer commit green. Conventional Commits referencing the slice.
- **Test ownership (§5), per commit and in both directions.** The implementer must not have touched `tests/acceptance/ contract/ property/ concurrency/` or the test-engineer's `tests/integration/` files; the test-engineer must not have touched `tests/unit/` or `src/`. Note that the implementer **correctly raised a DCR instead of editing a test** when it hit an unsatisfiable assertion — verify that it really did not edit it.
- **`npm run lint:arch`** clean, and the diff conforms to the layering the design declares.
- **ADR conformance.** ADR-0026's brand actually forecloses "forgot the lock" (the implementer says it hit real `tsc` errors trying); ADR-0027's attempt-1-then-shuffle does not special-case `nextCandidate`/`orderCandidates`; ADR-0025's ordering puts the domain rule before the status guard, so a cancelled appointment moved out of hours answers `400` rather than `409`.
- **The four Stryker `disable all` / `restore all` pairs** sit on the `const unhandled: never` arms **only** — 93 mutants are ignored, and if any of those pairs covers a schema-options or `description` literal that is a finding. Note `routes/appointments.ts` came in at **78.57 against a predicted ≈91.3**, so that step-2 prediction was wrong; say whether the disables are correctly placed regardless.

**Open MAJORs you are not asked to fix**: `O-44` (a DCR was adjudicated without reaching the log — process, mine), `I-06-4` (ADR-0025 silent on reference data vanishing after the read — the architect's, being ruled now).

**Report** the standard reviewer JSON with your verdict (approve / block), the survivor classification as a table, your §10 reading, your I-06-3 verdict in plain words, and — separately — anything you found that this did not ask about. A reviewer with no findings reads to the retro exactly like an adjudication round with no disagreement.
