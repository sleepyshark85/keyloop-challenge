# Prompt · slice 16 · architect · invocation 7

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Write D-16-4 debt row
- Sent: 2026-09-10T02:57:39.698Z

---

Slice **16**, step 5. Your `R-16-1` rulings are accepted in full and the remedy is carried out. Send-back authorised: **write the `D-16-4` row now**, before the gate, as you proposed.

## The remedy, done, with both evidence obligations discharged

History rewritten per your ruling — two commits, not a squash:

```
54d8d35 feat(16): regenerate the OpenAPI contract for the derived window   (retyped from docs(16))
8c688c1 feat(16): availability takes startsAt and derives its own window   (2601410 + 7d572d8 merged)
762f824 test(16): availability derives its own window (red)
```

- **`git diff backup-16-pre-rewrite HEAD` is empty** — only history changed, nothing else.
- **`build=0`, `unit(nodb)=0`, 714 tests passed at each of `8c688c1` and `54d8d35`** — your green standard, met at both.

Both go on the PR with the numbers.

## What to write

**`docs/arc42/11-risks-technical-debt.md` §11.1 — `D-16-4`.** Your own framing, which I am not going to improve on: `tests/performance/availability-budget.test.ts` is *"a documentation assertion wearing a performance test's clothes"* (slice 11's `d1de141`). AC-6's and AC-15's assertions grep Markdown, need no database, and live in `tests/performance/` only because §5 puts QS-14's threshold there. The consequence is that **`npm test`'s exit code — the coarsest signal in this repository — is coupled to prose in an architect-owned file.**

It has now bitten twice, neither time about performance, and both instances belong in the row because a debt item with two dated occurrences is a different argument from one with none:

- **slice 11** went red for several commits on a re-worded clause, when `\bdealership\b` stopped matching.
- **slice 16** produced `F-16-2` — a DCR that proposed outcome **(c)**, on the belief the slice could satisfy neither §10's Definition of Done nor §7's green-merge rule. It was wrong on the premise, but the DCR cost a full adjudication round, and the thing that made the wrong premise plausible is this coupling.

Say what would discharge it, so the row is actionable rather than a lament.

**`docs/slices/16-availability-derives-its-own-window.md`** — record the `R-16-1` ruling the way the gate reads it, including the part where you **rejected half the finding**: §7's "green" binds build plus the commit's own unit tests, because a whole-suite reading would put §7 in contradiction with §2.4 on every slice — §2.4 requires the outside-in suites to be red until implementation completes, so a rule demanding they be green at each implementer commit would forbid the evidence chain §2.4 mandates. Under that reading `2601410` breached it under any reading (it could not compile) and `7d572d8` did not (its failing contract test is named in the slice's own red set). Note that the reading is **provisional until step 6**, §7 being the human's text and not yours.

## Constraints

- The slice file is at **796/800**. §11.1 has the headroom (you measured 712 words); the slice file does not. If the `R-16-1` record cannot fit, say so rather than taking `--rebaseline`, and I will treat the ceiling as the blocker.
- Do not touch `src/`, `tests/`, `docs/team-log/`, or `docs/WALKTHROUGH.md`.
- ADR-0039 stays `proposed` until step 7. No new ADR — you already ruled this is debt plus an interpretation, not a decision with options.
- Run `docs:check`, `docs:refs`, `docs:adr-check`, `docs:budget:check`. Commit nothing.

## Also settled, for your record

The transient `db` failure goes to the event log and the PR under my writes, not to arc42 — your reasoning accepted: with no captured output it is not a structural fact, and a §11 row asserting something nobody can state is worse than no row. I am recording the request that the next occurrence capture the failing file and assertion.

Report what you wrote and the check results.
