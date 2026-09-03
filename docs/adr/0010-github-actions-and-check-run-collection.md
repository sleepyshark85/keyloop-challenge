---
id: "0010"
title: Run CI on GitHub Actions, and collect check.run from the API rather than commit it from the workflow
status: accepted
date: 2026-09-04
supersedes: null
superseded_by: null
arc42: ["§2.2", "§7.4", "§11.2"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  ACCEPTED as recommended at Gate B on 2026-09-04, unmodified.
  Raised by the orchestrator on the Gate B pull request as a gap with no phase and no ADR, with
  GitHub Actions recommended; the human ruled that CI is required and asked for the decision record
  before merge, then accepted this ADR at Gate B. The architect wrote this ADR, and the platform choice was the easy part of it. The
  three sub-decisions below — how `check.run` is emitted, how a deliberately-red run is told apart
  from a broken one, and what is deliberately *not* wired in yet — are the architect's, and the
  first of them reverses the obvious answer: the workflow does not write to the event log.
---

## Context and problem statement

There is no `.github/` directory in this repository, and CI is named as load-bearing in about a
dozen places:

| Rule | What it requires of CI |
|---|---|
| `CLAUDE.md` §2.3 | `dependency-cruiser` runs in CI; a layering violation **fails the build** rather than being a reviewer's opinion |
| `CLAUDE.md` §2.4, §6 step 3 | The acceptance test is **observed failing in CI** before implementation exists |
| METHODOLOGY §7 (§261) | *"the board cannot leave `red` until CI has recorded the acceptance test failing"* |
| METHODOLOGY §4 | Link integrity, ADR existence and `QS-*` → real test are the **enforced** documentation tier — enforced by CI |
| METHODOLOGY §9 (§400) | `check.run` is the one event with tier `derived` and writer **T** (tooling), and is marked **NOT EMITTED YET**; phase-4 criterion **C1** is unpassable until it exists |
| arc42 §10, QS-10 | The ruleset must be shown to *fire*, not merely to parse |
| arc42 §10, QS-14 | A latency budget stated *"on the CI container"* — the runner class is part of the scenario |

So the absence of CI is not a missing convenience. Under METHODOLOGY §261 it makes the slice loop
**unable to legally advance past step 3**: with no CI there is no recording of the red state, and the
board cannot leave `red`. The first slice would be blocked at its third step.

Four things have to be decided, and only the first is about a vendor.

1. **Which platform**, and on whose machines.
2. **How `check.run` reaches `docs/team-log/events.jsonl`.** This is the load-bearing one. §400 reads
   honestly as: one event type is fully trustworthy in principle and is not emitted at all. Closing
   that gap is most of the value of having CI, because it is the only path by which a *fact about a
   test run* enters the record without an agent asserting it.
3. **How the red proof is captured**, given that a run which fails is normally a blocked pull
   request, and given that the test it proves will be green a day later.
4. **What runs today**, given that `lint:arch` and `graph:modules` currently fail for the honest
   reason that `src/` does not exist.

## Considered options

- **Option A — GitHub Actions on GitHub-hosted `ubuntu-latest` runners.**
- **Option B — GitHub Actions on a self-hosted runner** (the human's machine, or a VM).
- **Option C — CircleCI**, connected to the same GitHub repository.
- **Option D — GitLab CI**, with the repository mirrored or moved.
- **Option E — no CI; every check run locally before merge.** The status quo.

## Decision

Chosen option: **Option A — GitHub Actions on GitHub-hosted `ubuntu-latest` runners**, because
`origin` is already `git@github.com:sleepyshark85/keyloop-challenge.git`, because METHODOLOGY §8
makes **the pull request the gate artifact** and Actions is the only option whose results are part of
that artifact rather than linked from it, and because — the decisive reason —
**`ubuntu-latest` ships a working Docker daemon**, which TC-9 requires.

TC-9 is worth restating, because it changes what kind of choice this is: *"the test suite is not
runnable in a Docker-less CI runner."* §2.2 forbids substituting the database, and the invariant this
whole system exists to hold lives in that database. A runner without Docker therefore cannot run the
tests that prove the system correct — it can only run the ones that would pass anyway. **The runner
choice is a correctness prerequisite, not a convenience**, and any future move to a platform or
runner image without Docker is a change to §2.2, not to CI.

Rejecting Option E deserves more than a shrug, because it is the status quo and it is free. It is
rejected because it breaks three rules by name, not because it is untidy:

- **METHODOLOGY §261** — no CI, no recording of the red state, so no slice may leave `red`. This is
  the one that actually stops work.
- **`CLAUDE.md` §2.3** — *"Violations fail the build. Architecture conformance is not a matter of
  reviewer opinion."* Locally-run `depcruise` is a reviewer's opinion that they ran it.
- **OC-2 / METHODOLOGY §9** — evidence must be **derivable** rather than narrated. A test run on the
  author's laptop is a self-report by the party being assessed, which is precisely the class of
  evidence the three-tier trust model was built to refuse. There is no version of Option E in which
  `check.run` can carry tier `derived`.

### Decision 2 — `check.run` is **collected** from the API, not committed by the workflow

The obvious implementation is a workflow step that appends a record to
`docs/team-log/events.jsonl` and pushes the commit. It is rejected.

| | B1 · workflow commits to the branch | **B2 · collector reads the API at each gate** | B3 · no record; the board queries GitHub when rendered |
|---|---|---|---|
| Log is complete offline | yes | **yes, once collected** | **no** |
| Branch stays the author's | **no** — a bot commit per run, which re-triggers runs and rewrites what the reviewer is reading | yes | yes |
| Token scope needed | `contents: write` on a repo whose history is a graded artifact | none — `contents: read` | none |
| Tier `derived` is honest | yes | yes — the collector computes the fact from GitHub's record | yes |
| Record exists the instant CI finishes | **yes** | no — it lands at the next gate | n/a |

Chosen: **B2**. A collector, `tools/team-log/collect-ci.mjs`, reads finished runs for the branch
(`gh run view --json`), and appends `check.run` records with `source: "derived"` through
`appendRecords(..., { allowDerived: true })` — the flag `tools/team-log/write.mjs` already reserves
for exactly this and refuses to the orchestrator's CLI. Each record carries the run id, the head SHA,
the per-step conclusions and a link to the run.

**The property being bought is durability, and what is paid for it is immediacy.** The event log is a
submission artifact: it is read from a git checkout, by an assessor who may have no network and
certainly has no credentials on this repository. A record that resolves to a `404` in six months is
not evidence, so `check.run` must be *on disk, in git, in the log*, like every other event — which
rules out B3, whose only real merit is that it cannot go stale. What B2 gives up is that the log
lags CI: between a run finishing and the next gate, the log is silent about it. That is acceptable
because METHODOLOGY §9 already instructs `log:audit` to be run **at every gate**, so the collection
point is one the process visits anyway; it would not be acceptable if `check.run` were needed
*between* gates.

B1 was the near miss. It buys immediacy at three prices, and the third is the one that decides it:
a bot commit on every run; a push that re-triggers the very workflow that pushed it (soluble, but
with `[skip ci]` conventions that are themselves easy to get wrong); and a `contents: write` token on
a repository **whose git history is itself under assessment** (OC-7). Handing write access to the
artifact being graded, in order to record that the artifact was checked, is a poor trade.

The **omission surface** B2 creates — nobody runs the collector, and nothing notices — is closed the
same way §9 closes it elsewhere: `log:audit` gains a check that lists the branch's runs and reports
`OMISSION` for any run with no matching `check.run`. That check is network-dependent and is skipped,
with a printed note, when offline. **Note honestly that the collector does not exist yet**; this ADR
decides the mechanism, and until the collector is written `check.run` remains unemitted and C1
remains unpassable. What the workflow does today is produce the other half — a machine-readable
run summary as a retained artifact — so that the evidence exists from run #1 and can be backfilled.

### Decision 3 — the red proof: a run that is red **for the right reason**

`CLAUDE.md` §7 already makes the marker reliable: **exactly one red commit per slice**, authored by
the test-engineer, subject `test(acceptance): … (red)`. That convention is NON-NEGOTIABLE and — the
part that matters — the marker is applied by a **different agent** than the one that benefits from
it, so it cannot be self-awarded by the implementer.

The workflow therefore treats a head commit whose subject matches `^test\(.+\): .*\(red\)$` as a
**red-proof run** and asserts its *shape*:

- the acceptance suite **must** exit non-zero, and
- every other check — install, typecheck, lint, `dependency-cruiser`, docs, tools, unit — **must**
  pass.

A run that is red because the branch does not compile, or because lint failed, is a **broken run,
not a red proof**, and the job fails saying which. This is the whole discrimination mechanism, and
it is stronger than "the run was red": it asserts *what* was red.

The job's own conclusion is therefore **success when the required failure was observed** — so a
correctly-red slice does not sit behind a spuriously blocked pull request, and the check's name,
`red-proof`, makes the inversion unmistakable rather than hidden inside a `continue-on-error`. On any
other commit there is no inversion at all: a failing acceptance test is a failing build.

This works **because acceptance tests are black-box over HTTP** (TC-5, ADR-0005, and the
`outside-in-tests-do-not-import-src` rule in §5.3). A test that imported `src/` would fail to
*compile* before the implementation existed, and a compile failure is indistinguishable from a broken
branch — the red proof would be unable to tell its two cases apart. The layering rule that exists for
independence turns out to be what makes the red state legible.

**Retention**, in decreasing durability, since the test is green a day later:

1. **The red commit itself**, in git, permanent. The run is bound to it by SHA.
2. **The `check.run` record** in `events.jsonl` — run id, head SHA, conclusion, and the ids of the
   tests that failed. In git, permanent, readable offline. This is the evidence.
3. **The raw reporter output**, as a workflow artifact, retained 90 days. Corroboration only, and it
   expires; nothing is allowed to depend on it.

`concurrency.cancel-in-progress` is therefore **false**. Cancelling a superseded run is normally
free; here it can destroy the only record of a red state, and runs on this repository are cheap.

### Decision 4 — what runs today, and what waits for phase 4

`npm run lint:arch` and `npm run graph:modules` fail right now with *"Can't open 'src' for reading"*.
Wiring them in today would ship a red workflow, and a pipeline that is red by design teaches everyone
to ignore it. The workflow is phased.

**Today** — one job, `verify`, all of it independent of `src/`:

| Step | Enforces |
|---|---|
| `npm ci --engine-strict` | TC-10 (Decision 5), and that `package-lock.json` agrees with `package.json` |
| `npm run docs:check` | METHODOLOGY §4 *generated* tier: `system-design.md` cannot drift from its sections |
| `npm run test:tools` | The tools regression suite, including the docs builder |
| every `docs/diagrams/*.html` has a committed `.svg`, and every `.svg` referenced from arc42 exists | METHODOLOGY §4: *"an evaluator reading the repository on GitHub has no plugin installed"* |
| `docs/team-log/events.jsonl` gains lines and never loses or alters one | Append-only, mechanically, rather than by the orchestrator's discipline |
| every record in the log validates against `tools/team-log/schema.mjs` | Catches a hand-edited line, which is the only way to bypass the validating write path |

**Phase 4**, when `src/` and the suite exist: `typecheck` · `lint:arch` (QS-10) · the Vitest suite on
a Docker-enabled runner (TC-9, §2.2) · the `red-proof` job · the run-summary artifact that Decision 2's
collector consumes. These are listed in the workflow as a commented block naming this ADR, so the
next author finds them where they will be needed rather than in a document.

**Deliberately not in CI, with reasons**, because a claim that CI enforces something it does not is
worse than an admitted gap:

- **Stryker.** METHODOLOGY §7 makes mutation survivors *the reviewer's findings*. Mutation testing is
  slow and its output is a judgement to be read, not a threshold to be passed; it stays a
  reviewer-invoked command until there is evidence a gate wants it.
- **`npm run log:audit`.** It cannot run in CI at all. Its ground truth is
  `~/.claude/projects/**/subagents/*.jsonl` on the human's machine; run on a fresh checkout it reports
  every honest agent run as `UNSUPPORTED` and exits 1. Verified. It is a **gate-time local command**,
  which is exactly how §9 already describes it, and CI substitutes the two structural log checks
  above.
- **`self_check.py` / `verify-geometry.py`.** METHODOLOGY §4 states these run in CI. They currently
  cannot: they live in a `diagram-design` plugin cache outside the repository, and nothing vendors
  them. The `.html`/`.svg` pairing check is the honest subset that runs today; §11 carries the rest.
- **Link integrity, ADR existence, `QS-*` → real test.** METHODOLOGY §4 puts these in the *enforced*
  tier. No tool implements any of them. Naming them here is the point: three of §4's enforced-tier
  claims are, today, aspirations, and §11 carries them.

`npm run status` is not a CI step: it regenerates a resume point that changes with every commit, so
checking it would fail on every pull request for no reason.

### Decision 5 — TC-10's pin becomes enforced, in CI only

TC-10 records that Node and npm are *pinned*; §7.1 pins them in `package.json` `engines`
(`node >=22.11.0 <25`, `npm >=10.9.0`). Nothing enforces it — `engines` is advisory by default.
`npm ci --engine-strict` makes it a hard failure, with no new code and no new file.

The runner is pinned to **Node 22.x**, which is §7.1's deployment runtime, *not* the maintainer's
local Node 24. CI should agree with what runs in production rather than with a laptop. The two pins
are duplicated — `22.x` in the workflow, the range in `engines` — but the duplication is **checked**
rather than silent: raise the floor above 22 and `--engine-strict` fails the job.

**Recommended, not decided:** add `.npmrc` with `engine-strict=true`, which makes the same rule bite
on the maintainer's machine and not only in CI. It is left out of this ADR's decision because it
changes local behaviour for everyone and the human has not ruled on it; the CI-only form gets the
enforcement point TC-10 was missing without that side effect.

## Consequences

**Good**

- METHODOLOGY §261 becomes satisfiable: a slice can legally leave `red`, which it cannot today.
- `check.run` gets a mechanism with an honest `derived` tier — the fact is computed by a collector
  from GitHub's own record, never asserted by the party being recorded.
- The pull request stays the gate artifact (METHODOLOGY §8): checks, review and the human's decision
  are one object with one URL.
- Three documentation claims move from written to enforced (assembly currency, diagram export,
  append-only log), and four claimed-but-unenforced ones are named rather than left to be discovered.
- TC-10 acquires the enforcement point it was recorded as lacking.
- The workflow needs only `contents: read`. Nothing in CI can write to the repository whose history
  is under assessment.

**Bad, or deferred**

- **`check.run` is still not emitted.** This ADR decides the mechanism; `collect-ci.mjs` and the
  `log:audit` reconciliation are phase-4 work, and C1 stays unpassable until they land. §11.
- **The log lags CI between gates.** Accepted in Decision 2, and the direct cost of durability.
- **The red proof depends on a commit-message convention.** It is NON-NEGOTIABLE (`CLAUDE.md` §7) and
  applied by a different agent than the one it benefits, but it is a convention, not a mechanism.
- **QS-14's budget is now tied to a runner class.** It is stated *"on the CI container"*, so the
  numbers mean *on a standard GitHub-hosted `ubuntu-latest` runner*. Changing runner class silently
  changes what QS-14 asserts, and the scenario should say so when it is wired in.
- **Docker-in-CI is unproven here.** Testcontainers on `ubuntu-latest` is well-trodden, but nothing
  in this repository has exercised it. It is the largest single unknown in the phase-4 wiring and
  should be proven by the walking skeleton, not discovered inside a slice.
- **Two checks live as inline shell and `node -e` in YAML**, which is untested code in a repository
  that tests its tools. Acceptable at ten lines; if they grow, they become `tools/` scripts with
  tests in `tools/test/`.
- **Vendor coupling.** The red-proof mechanism, the artifact retention and the collector all speak
  GitHub. Moving platforms costs a rewrite of the pipeline, though not of anything in `src/`.

## Pros and cons of the options

### Option A — GitHub Actions, GitHub-hosted runners

- Good, because `ubuntu-latest` ships Docker, which TC-9 makes a **correctness** prerequisite.
- Good, because the checks live on the pull request, which METHODOLOGY §8 already designates as the
  gate artifact — no second identity, no second URL, nothing for an assessor to be granted access to.
- Good, because `GITHUB_TOKEN` is scoped per run and needs no secret to be created or rotated.
- Good, because the run history is queryable by `gh` with the credentials the human already has,
  which is what makes Decision 2's collector cheap.
- Bad, because the YAML and the red-proof inversion are GitHub-specific.
- Bad, because runner performance varies between runs, which makes QS-14 a noisier signal than it
  would be on fixed hardware.

### Option B — GitHub Actions, self-hosted runner

- Good, because hardware is fixed, which is worth something to QS-14, and Docker is whatever the
  human installs.
- Bad, because it re-introduces exactly what CI was adopted to remove: **evidence produced on the
  assessed party's own machine**. A run an assessor cannot see the provenance of is weaker evidence
  than one on a hosted runner, not stronger.
- Bad, because it is a machine to maintain and secure, against OC-1's time box and OC-3's single
  engineer.
- Rejected: it costs more and buys less evidence.

### Option C — CircleCI

- Good, because remote Docker support is mature and configuration is compact.
- Bad, because results arrive on the pull request through an integration rather than being part of
  it, and the run detail lives on a host the assessor has no reason to have an account on. For a
  submission graded from a repository, evidence co-located with the code is worth more than marginal
  Docker ergonomics.
- Bad, because it is a second account, a second set of credentials, and a second thing to explain in
  the video (OC-1).

### Option D — GitLab CI

- Good, because the YAML is arguably cleaner and services are first-class.
- Bad, because the repository is on GitHub. Mirroring makes CI report on a copy; moving discards the
  pull-request history that METHODOLOGY §8 makes the gate record. Either way the cost is paid in the
  artifact under assessment.
- Rejected on the same ground as C, more strongly: the repository would have to move to suit the
  pipeline.

### Option E — no CI; run everything locally

- Good, because it is free, has no latency and no vendor.
- Bad, because METHODOLOGY §261 then permits no slice to leave `red`. The loop stops at step 3.
- Bad, because `CLAUDE.md` §2.3 requires layering violations to fail *the build*; locally that is a
  reviewer's word.
- Bad, because `check.run` could never carry tier `derived` (`write.mjs` refuses it from the
  orchestrator's write path, correctly), so §400's one trustworthy event type stays permanently
  unavailable and C1 permanently unpassable.
- Bad, because OC-2 makes verifiability a graded quality goal. "I ran the tests" is the self-report
  this process exists to not rely on.
- Rejected. It is the only option that breaks named, NON-NEGOTIABLE rules rather than being a
  weaker way of satisfying them.
