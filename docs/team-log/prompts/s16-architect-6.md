# Prompt · slice 16 · architect · invocation 6

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Rule on R-16-1 remedy
- Sent: 2026-09-10T02:52:59.705Z

---

Slice **16**, step 5, PR #24. One MAJOR review finding is unresolved and I want your ruling before I touch anything, because the obvious remedy does not work and the reason is a consequence of your own AC-6.

## `R-16-1` as the reviewer raised it

CLAUDE.md §7: *"Every implementer commit is green — unit test and the code it drives, together."* The reviewer measured that neither implementer commit is:

- `2601410` — `tsc -p tsconfig.build.json` exits 2. `src/http/routes/availability.ts:172` still passes `fromMillis` and `:185` still switches on the deleted `malformed-window`. Since `pretest` is `build`, `npm test` never reaches a test.
- `7d572d8` — builds, but leaves `docs/api/openapi.json` stale; `docs:openapi -- --check` exits 1, which `tests/contract/openapi-document.test.ts:245` asserts must be 0.

Green first arrives at `b6c1eac`, a `docs(16):` commit. Slice 14's equivalent implementer commit typechecks clean, so this is a regression against the branch's own standard. The reviewer says the remedy is history-only on an unmerged branch, which is true as far as it goes.

## The wrinkle, which I do not think anyone spotted — including me

I was about to squash `2601410 + 7d572d8 + b6c1eac` into one green `feat(16)` commit. **It would not be green either**, and neither would any other arrangement of the implementer's work.

`npm test` runs the `perf` project. AC-6 requires arc42 §11 to state the measured p95. That figure could not exist until the code existed to be measured, and **only you may write it** — it landed at `8610d7c`, your commit. I verified this at the time: with all three implementer commits applied, `npm test` was exit 1 with `perf` exit 1, on AC-6's arc42 assertion alone.

So under a whole-suite reading of §7, **the implementer was structurally incapable of producing a green commit in this slice**, no matter how it sequenced its work. That is a property of AC-6's shape, not of the implementer's discipline.

## What I need you to rule

1. **What does §7's "green" bind?** The sentence is *"unit test and the code it drives, together"*, which reads to me as: the commit builds, typechecks, and its own unit tests pass — not that the entire outside-in suite is green at every implementer commit, since the outside-in suites are red by construction from the red commit until the last implementer commit lands. If that reading is right, `2601410` is still a clear violation (it does not compile) and `7d572d8`'s stale contract document is a second one, but AC-6's arc42 assertion is not the implementer's to satisfy and never was.
2. **Given your answer, what is the remedy?** My proposal, which I have not carried out: squash the three implementer commits into one `feat(16)` that builds, typechecks, passes `tests/unit/`, and carries a current `docs/api/openapi.json` — leaving your `8610d7c` arc42 commit where it is. That yields one green implementer commit under reading (1) and preserves who wrote what. If you prefer a different arrangement, say so.
3. **Does anything need recording?** If AC-6's shape can make an implementer commit unable to be green, that seems worth a §11.1 row or a note in the design — the next slice with a measured-figure criterion will hit exactly this. Your call whether that is real or whether reading (1) dissolves it entirely.

Do not rule (c) reflexively to be safe: the work is correct, the suite is green now, and I am asking about commit shape and a criterion's side effect, not about behaviour.

## State

All other findings are closed. `R-16-2` deleted (mutation re-scored **0.8478**, identical to before — the deleted test killed zero mutants, exactly as your ruling 8 predicted). `R-16-3` remedied by the test-engineer under your narrowed scope. `R-16-4` you corrected. `R-16-5` and `R-16-6` closed. `npm test` is exit 0 across all three projects at `a584836`.

One more thing to note rather than act on: the test-engineer reported a **transient `db` project failure** that did not reproduce on re-run, with each affected file passing in isolation. I have no evidence of what it was. In a repository whose central claim is adjudicated by the database, an unexplained intermittent failure in the `db` project is worth someone's attention even if it is environmental. Say whether you want it recorded.

Reply with your rulings. Edit nothing unless your ruling requires a design or arc42 change, in which case say so and I will send you back.
