---
id: "18"
title: Dedupe CI check records on run and source
status: ready
depends_on: ["16"]
arc42: ["§11.1"]
adr: []
quality_scenarios: []
loopbacks: 0
deferred_from: "O-16-5"
---

## Goal

`tools/team-log/collect-ci.mjs` dedupes on `run_id` **alone**. At slice 16 the orchestrator hand-wrote
a `reported` record for run `34427199266` (`O-16-4`), so the collector skipped the very run it should
have derived — permanently, the log being append-only. The consequence is `O-16-5`: the real red proof
for slice 16's real red commit **cannot be collected**, and `slice:check` reports *test-first proven*
off a substitute record naming run `34426754954` at `fa4f765`, a run whose `red-proof` job failed and
whose sha is not in history.

## Why this is not slice 16's work

Ruled at Gate E. Changing a collector so that a failing check turns green, **inside the slice whose
check it turns green**, is the move the finding exists to warn about. The tool change and the evidence
it produces must be separable, or the fix is indistinguishable from the failure.

## Acceptance criteria

- **AC-1** — The dedupe key is `(run_id, source)`. A `derived` record for a run already present as
  `reported` is written, not skipped.
- **AC-2** — Where both tiers exist for one run, every consumer (`slice:check`, the board, `status`)
  reads the **derived** record. A `reported` record never satisfies a Definition-of-Done criterion.
- **AC-3** — Re-running the collector over slice 16's branch produces a derived record for run
  `34427199266` at `762f824`, and `slice:check 16` then cites **that** run rather than `34426754954`.
  This is the acceptance test: the finding is discharged by the evidence appearing, not by the code
  changing.

## In scope

- `tools/team-log/collect-ci.mjs`, its consumers, and their tests.

## Out of scope

- Withdrawing the hand-written record. The log is append-only; it is superseded, never removed.
- Preventing hand-authored `check.run` records — `O-16-4`'s own remedy, a separate question.

## Definition of done

Beyond `CLAUDE.md` §10: `docs/arc42/11-risks-technical-debt.md` `D-16-5` is updated to record that
slice 16's red proof is now derived, with the run id it resolved to.
