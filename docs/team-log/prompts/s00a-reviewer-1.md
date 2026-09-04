# Prompt · slice 00a · reviewer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 00a step 5 review
- Sent: 2026-09-04T06:05:47.359Z

---

You are the reviewer at **step 5** of the slice loop for **slice 00a — the walking skeleton**. Branch `slice/00a-walking-skeleton`, 44 commits ahead of `main`. PR #4 is the venue.

You may **block a merge** and you may **raise a DCR**. You may not change the design and you may not author production code or tests — a design problem is raised, not fixed.

## Read

- `docs/slices/00a-walking-skeleton.md` — the six acceptance criteria, the human's.
- `docs/slices/00a-design.md` — **read §0 first**. It is the audit trail: every objection, its ruling letter, and the reasoning. The design has been amended four times.
- `docs/DEFECTS.md` — **24 findings are already recorded with their verdicts.** Check against them; do not spend the review rediscovering them. What is *not* there is what you are for.
- `docs/team-log/process-criteria.md` — C1–C8, pre-registered.
- `git log main..HEAD`, and the diff.

## The question the architect asked me to put to you first

> **Which committed, wired-in test would fail if this rule were deleted?**

Every one of this slice's most serious findings was found by asking it, and never by reading code. Six instances so far — an inert cruise, a guard blind to an unexamined root, a tool test nobody wired in, fixture paths that never left the local cwd, a wrapper whose exit-code rule was untested, and a mutation runner that scored 142 mutants it never activated.

Apply it to the diff. `tools/ci/`, `tools/team-log/collect-ci.mjs` and the hooks are where the density is.

## Run these, and report what they say

- `npm run mutation` — **95.77**, 136 killed, 6 survived. Every survivor is claimed provably equivalent, with a measurement behind it. **Audit those six claims**; an equivalent-mutant argument is exactly where a weak test hides. The claim about the four handler string literals is a design observation as much as a test one — `Type.Literal('ok')` makes the schema emit the constant, so the handler's literals are decorative. Say whether that should be in arc42 rather than a commit message.
- `npm run lint:arch` · `npm run typecheck` · `npm test` (91) · `npm run test:tools` (198 across seven) · `npm run defects:check` · `npm run slice:check 00a`.
- `npm run log:audit` reports **12 discrepancies**. They are known and recorded as **O-3**: the audit pairs one `agent.finish` to one transcript, and a resumed agent writes one record per resume. Confirm that diagnosis rather than assuming it — if the audit is hiding a real discrepancy behind the false ones, that is a finding.

## Verify the discipline, from git rather than from narration

- **Exactly one red commit**, authored by the test-engineer, matching `^test\(.+\): .*\(red\)$`. It is `a483d09`.
- **CI observed it red**: run 33831214774, `suite (Testcontainers)` failure, `verify` success. That pair was *predicted in the design before the tests existed* — check the prediction against the run.
- **No implementer commit touching** `tests/acceptance|contract|property|concurrency|architecture|performance|integration|setup|support/` or `vitest.config.ts`. C2 is fatal and measured from git.
- **Every implementer commit green.** Note that the database path cannot be verified locally without Docker; the design defines what "green" means here.
- Commit sizes against the ~150-line guidance, and whether the exceptions are argued.

## Things the roles flagged for you rather than leaving you to find

The implementer named three that read as carelessness in a diff and are deliberate: `judgeCruiseResult` accepting either a full cruise result or a bare summary; `lint-arch.mjs` discarding `depcruise`'s exit code (because `--output-type json` exits 0 *with* violations present); and one commit adding a tool without wiring its test, explained in that commit's message.

It also disclosed appending one record to `docs/team-log/events.jsonl` during a probe and removing it. I verified the log — 38 records at the time, zero `check.run`. Confirm independently if you want it in your report.

## What I want in your report

Findings in §290's format — `claim:` and `scenario:` lines, with severity. A finding without a concrete failure scenario is not a finding.

**An explicit no-findings review must report the mutation score**, per `process-criteria.md` C3 — and note that C3 judges whether *you* produced substance. The mutation weakness in this slice was surfaced by me provisioning the tool, not by a reviewer, so C3 must be judged on what you find **beyond** the 24 recorded findings.

Also give me your read on:

- **Whether the acceptance criteria are actually met** — AC-1 to AC-6, each traced to the test that asserts it.
- **Whether this slice should merge**, and if not, what blocks it.
- **C1–C8**, as evidence for the phase-4 retro. C1's `check.run` records do not exist yet — I backfill them at the gate — so say what you can see and mark the rest.
- The one thing you would tell the human to look at during exploratory testing.

Do not push, do not comment on the PR, do not commit, do not write to `docs/team-log/`. Return the report; I post it under your attribution.
