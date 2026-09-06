# Report · slice 04 · architect · invocation 4

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: F1 — undeclared arc42 scope
- Returned: 2026-09-06T08:00:09.474Z
- Duration: 450s

---

Definition of Ready is fully green. Three commits, 64 lines, `tests/` untouched.

## The remedy

`317d401`, `062844a`, `b7c13e4` on `slice/04-candidate-allocation-and-retry`.

**F1 is upheld and it was wider than the reviewer found.** Two arc42 sections moved on this branch undeclared, not one. `9dfde0d` took §7.3; **`4d172cc` took §13** — scoped `chore(04)`, +139 lines, 38 minutes *earlier*, and its subject line names nothing. Both are now in the frontmatter: `["§6.2", "§5.2", "§7.3", "§11", "§13"]`. §13 is scribe-owned prose, and I declared it rather than exempting it, because the declaration governs the branch and not the author — I-04-12 already ruled that nobody silences a guard by writing a name into it. Ruled **(a)**: both edits' content is correct and only the declaration was missing, so no AC, QS or §2 clause fails either way. No loopback (0 of 2).

One consequence for the record: the reviewer graded F1 MAJOR-not-BLOCKING because `9dfde0d`'s subject names §7.3. By that same criterion `4d172cc` is silent, so the correct grade for the pair was BLOCKING. The card was applied correctly to the instance it had.

## The declaration mechanism — neither of your two options; it is already built and already fired

**`npm run slice:check 04` has been printing this since 13:15, 98 minutes before step 5:**

```
FAIL  arc42 edits match the declaration
      hand-edited but not declared: docs/arc42/07-deployment-view.md,
      docs/arc42/13-ai-collaboration.md — declared §6.2 §5.2 §11
```

R-01-7 asked for exactly this derivation at slice 01; O-14 built it in `tools/slice/check.mjs`. It is branch-selected precisely so a subject line cannot hide a mid-slice edit, it strips generated markers so §9/§11 regeneration is not counted, and it reports UNVERIFIED rather than PASS when it cannot resolve a base. It works. The reviewer re-derived it by hand and found one of the two files; **the tool had both.**

So: nothing to schedule on the derivation, and amend-the-declaration is the right remedy per instance but is not the answer to your question — the field was amended once already this slice (`04b7879` added §11) and still missed twice afterwards. **The gap is the reading, not the derivation.** `check.run` events carry CI job outcomes only (`{"jobs":{"test":"PASS","verify":"PASS","red-proof":"PASS"}}`), so the `slice:check` Ready/Done grid is computed on demand, displayed to a terminal, and persisted nowhere. A red line that no artifact carries is a red line nobody is accountable for.

**What to schedule:** `check.run` should carry the `slice:check` grid alongside the CI jobs. Then a FAIL is in the log, in `DEFECTS.md`'s inputs, and on the board, instead of waiting for someone to type the command. That is `tools/` and orchestrator, not mine — the fourth slice running in which I name a `tools/` remedy I may not build (F-02-10, F-04-1, A-04-4).

## Stryker — the exclusion survives, the justification does not

`vitest.mutation.config.ts` includes `tests/unit/**` and nothing else, and `src/main.ts` is unimportable by a unit test *by construction* — it awaits `app.listen()` and calls `process.exit` at module scope. Mutating it produces a full set of uncovered survivors: the score falls by exactly the mutant count and says nothing whatever about the tests.

So the old comment was not merely overstated, it was **inverted** — it claimed coverage where the truth is unreachability. The exclusion is right; the reason given for it was not. Rejected alongside it: pointing the mutant command at the outside-in suites, which do exercise the file but run the built artifact (ADR-0013) — a `tsc` plus a Testcontainers PostgreSQL per mutant turns ~33 seconds into hours, and Stryker would still be scoring an uninstrumented child process.

The comment now states the true reason **and the cost**: every line of `main.ts` is guarded by an outside-in assertion or by nothing, and the mutation score cannot tell which. The remedy is the test-engineer's assertion, already in flight.

**Ownership.** `guard-paths` denies `stryker.config.mjs` to nobody. I split it by what the line asserts: the `mutate` list is a Definition-of-Done statement under §10 and is **the architect's**; the runner, thresholds and reporters are the reviewer's instrument and I left them untouched. The file now says so, so the next role does not have to guess.

## §6.2 — yes, and it changes the reading of the cap

Taken into §6.2 as a stated invariant, word-neutral (1447 before and after, nothing owed to the ratchet). ADR-0020 cited, not edited.

It earns its place because it is a *different claim* from "the tail is unreachable", with two consequences the old text did not support:

- **`<=` is now recorded as deliberate rather than harmless.** If the bound is exact, `<=` and `<` admit the identical execution set — which invites a reader to delete the dead iteration. That would be wrong: under `<`, a future `PgOutcome` variant that retried *without* pruning would leave the loop quietly at `|B|+|T|-1` instead of meeting the throw. The one attempt of slack **is** ADR-0020 row F's fault detector. Nothing said that before.
- **D-04-1 becomes computable.** §6.2 said only that 16 "sits BELOW the bound at §1.1 scale". With the bound exact, `capped` is reachable **iff `|bays| + |technicians| >= 18`** — the deepest attempt must exceed the cap with both lists still non-empty, and the `exhausted` tie-break eats the `= 17` case.

I re-derived the proof rather than taking it: each conflict prunes exactly one id while both lists are non-empty, so attempt *k* needs `|B|+|T|-(k-1) >= 2`, giving `k <= S-1`; and an adversary attains it for every `B,T >= 1` by draining bays to one, then technicians. Supremum, and attained — I stated it that way deliberately, because "always exactly `S-1`" would read as *every* run taking that many attempts, which is false and would have been a worse defect than the one being fixed.

## Found without being asked

**arc42 §13 asserts a property that §13 itself does not have, and it went stale inside the slice that wrote it.** Line 46 reads *"**The register is generated from the log** and cannot drift: 130 findings — 10 blocking, 71 major, 49 minor … Mean escape distance 1.66 steps."* Written at 13:15 on `4d172cc`. Measured now:

| §13 claims | Actual |
|---|---|
| 407 log records | 474 |
| 130-row register | 160 |
| 10 blocking · 71 major · 49 minor | 10 · 86 · 64 |
| 130 prompt files | 146 |
| mean escape 1.66 | 1.76 |
| "67 of 130 await a ruling" (line 156) | 84 of 160 |

Every cited number is wrong, and they were wrong within two hours — before the reviewer even opened the branch. The register genuinely cannot drift; the *sentence saying so* is hand-copied prose and had already drifted, under a header that reads *"Sourced from artifacts, never memory"*. Same defect shape as the Stryker comment and as the twenty-odd before it: a claim of a guarantee, made in the one form that does not carry it.

This is fixable with a mechanism that already exists and is already used twice — `tools/docs/build.mjs` has a general `replaceBlock(marker)`, and §9 (`generated:adr-index`) and §11 (`generated:debt-register`) both consume it. §13 has zero generated markers. A `generated:team-stats` block would make these numbers regenerate with `docs:build` and, better, would make `docs:check` **fail** when they go stale — which is what caught this class everywhere else. §13 is scribe-owned and `tools/` is not mine, so I did not touch either; routing it is yours.

Two smaller notes. The reviewer's `docs/team-log/prompts/s04-reviewer-1.report.md` is still untracked — its own finding record is not yet in git. And the test-engineer's in-flight edits to `tests/acceptance/candidate-retry.test.ts` and `tests/support/service.ts` were unstaged throughout; all three of my commits were pathspec-pinned and none of that leaked in.

```json
{
  "role": "architect",
  "outcome": "adjudicated",
  "arc42_sections_touched": ["§6.2"],
  "adrs": [],
  "quality_scenarios": ["QS-3"],
  "assumptions": [
    "The reviewer's exhaustive search over (B,T) in 1..9^2 x 8 seeds is taken as corroboration; the |B|+|T|-1 bound and its attainment were re-derived independently before being frozen into arc42."
  ],
  "open_questions": [
    "check.run should carry the slice:check Ready/Done grid so a red declaration line is an artifact rather than a terminal line — tools/, orchestrator.",
    "arc42 §13's derived counts should become a generated:team-stats block in tools/docs/build.mjs — every one of them is already stale — scribe plus tools/."
  ],
  "dcr_ruling": "(a)",
  "message": "F1 upheld and wider than found: §13 was taken undeclared 38 minutes before §7.3, by a chore(04) commit whose subject names nothing, so both are now declared. The derivation the finding asks for is already built — slice:check has been printing FAIL on both files since 13:15, and the reviewer's hand-read found one of the two; what is missing is that check.run persists CI jobs only, so no artifact carries the verdict. The Stryker exclusion survives with its justification inverted rather than trimmed: main.ts is excluded because a unit-only runner cannot reach it, not because AC-2 asserts it, and the cost is now stated. §6.2 takes the exact bound, which makes `<=` deliberate — the slack is ADR-0020 F's fault detector — and makes `capped` reachable iff |bays|+|technicians| >= 18."
}
```
