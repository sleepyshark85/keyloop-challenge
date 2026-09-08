# Prompt · slice 10 · scribe · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: README harness section
- Sent: 2026-09-08T08:48:04.801Z

---

# AC-6's README half — the reviewer's BLOCKING finding, and it is yours

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/10-openapi-and-curl-harness`, PR #21. Pull first.

The reviewer blocked slice 10 on **`R-10-1`**: AC-6's README half is simply not in the tree. `README.md` names no harness script, no `npm run harness:seed`, no `eval "$(npm run --silent harness:seed)"`, and no `BASE_URL` / `DEALERSHIP_ID`. A reader following the README's install-run-call section on a clean checkout **ends at `npm start` with no path to either script or the ids they need**.

AC-6's own wording: *"`npm run harness:seed` with the ids it prints are in `package.json` and the README"*. The slice's Definition of Done adds: *"the harness run by hand on a clean checkout, from the README, before it is claimed."* `README.md` is yours under §4.

## What exists to document

- **`npm run harness:seed`** — `harness/seed.mjs` prints `export`-shaped lines for five ids plus `STARTS_AT`, so `eval "$(npm run --silent harness:seed)"` sets the whole environment in one step. It was measured that `npm run --silent` emits nothing but the script's own stdout; a printing `pre` hook would corrupt it, which is why the script has none.
- **`harness/book-read-reschedule-cancel.sh`** — the happy path: book, read, reschedule, cancel. Every step checks its own status and drives the exit code.
- **`harness/double-booking.sh`** — fires `REQUEST_COUNT` concurrent bookings at one slot and asserts exactly one `201` and the rest `409`, driving its own exit code.
- Both were rewritten this slice to need **no GNU coreutils** — they run on macOS as well as Linux, which `R-09-12` was raised about.

## What the section must achieve

**A reader on a clean checkout must be able to get from the README to a working demonstration without opening the test suite.** That is the criterion's actual content — *"without the test suite"* is AC-11's wording, and reaching into `seedScenario` for ids is precisely what it forbids.

Read the scripts and `harness/seed.mjs` before writing. **Every claim you make must be true of what is there** — you record what happened rather than describing what was intended, and this section is a set of instructions someone will follow literally. If a step does not work as you describe it, that is a finding to report, not prose to smooth over.

## Constraints

- `README.md` is yours. **Do not touch** `harness/` (guarded, implementer's), `tests/`, `src/` or `docs/slices/`.
- The README has a **word budget** — `npm run docs:budget:check` must stay green. If the section cannot fit, say so rather than raising a ceiling.
- Keep it short and operational. This is a run section, not an essay: the commands, what each does, what success looks like.
- Commit `docs(10):`, **explicit pathspec on `README.md`**, push. No PR comment needed — I will fold this into the gate packet.

## Return

The structured report, plus: whether you actually verified the commands you documented, and anything you found that does not work as the slice claims.
