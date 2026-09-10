# Prompt · slice 16 · architect · invocation 5

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 16 AC-3 wording
- Sent: 2026-09-10T02:40:32.170Z

---

Step 5 remediation, slice **16**, PR #24. The reviewer raised one MINOR finding that is a wording defect in your slice file, and one MAJOR that pressures a premise in your ruling 6. Rule and act.

## MINOR, yours to correct — AC-3 names four problem types; there are three

AC-3 as written requires the emitted operation to declare *"exactly the problem types it can produce: `/problems/malformed-request`, `/problems/outside-opening-hours`, `/problems/unknown-reference`, `/problems/internal`"* — four. But the emitted `docs/api/openapi.json` declares **three**, `tests/contract/openapi-document.test.ts:348` asserts three, and your own ruling 6 specified **no `500` entry** in `PROBLEM_RESPONSES`, matching `appointments.ts:149-150`. The reviewer confirmed `/problems/internal` is declared by **no operation repo-wide**.

So the criterion contradicts the design decision in the same document, and the tests follow the decision rather than the criterion. The reviewer is explicit that it is **not** asking for a `500` entry to be added — the code and contract are right, AC-3's sentence is wrong. This is outcome (a), your correction to make.

## MAJOR, for your information — ruling 6's premise is measurably false for the new site

The reviewer measured that deleting availability's `reference-data-invalid` arm leaves every test passing: the outcome falls to `default:`, throws, and `server.ts` renders the same status, `type` **and** `title`. `tests/contract/error-taxonomy.test.ts` has zero occurrences of "availability".

Your ruling 6 permitted `INTERNAL` to be rebuilt locally rather than shared **because** `/problems/internal` is "duplicated by construction site and held in agreement by the contract test". True of the two pre-existing sites; **not true of the third one this slice added**. The reviewer judged the remedy — add the missing contract-test row — to live inside your existing design and raised no DCR, and I have tasked the test-engineer with it.

I am not asking you to reopen ruling 6. I am telling you its premise was load-bearing and was not true when you made it, because you should decide whether anything in the design record needs to say so. If you think the ruling itself should change rather than the test set, that is a DCR and you should say so now rather than at step 7.

## Constraints

- `docs/slices/16-availability-derives-its-own-window.md` is at **796 of its 800-word ceiling** — your own `A-16-3`. Correcting AC-3 must not blow the ratchet, and `--rebaseline` is not available to you for the reason you already gave. If the correction genuinely cannot fit, say so and I will treat the budget as the blocker it is.
- Do not touch `src/`, `tests/`, or `docs/team-log/`. The implementer and test-engineer are working concurrently in `tests/unit/`, `tests/contract/` and `tests/property/`.
- ADR-0039 stays `proposed` until step 7.
- Run `docs:check`, `docs:refs`, `docs:adr-check`, `docs:budget:check` and report results.
- Commit nothing. I commit.

Report the correction, your position on ruling 6's premise, and the check results.
