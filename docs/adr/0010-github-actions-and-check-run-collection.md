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

There is no `.github/` directory, and that is not a convenience gap. The test-engineer commits a
failing acceptance test, and the slice may not leave `red` until that failure is **observed** off the
laptop of whoever wrote it. Nothing observes it, so no slice can lawfully advance past its red step:
the process this project runs on does not run.

CI is load-bearing in a dozen other places, each asking something specific of it:

| What the rules require | What that asks of CI |
|---|---|
| A layering violation **fails the build** | `dependency-cruiser` on every commit |
| The acceptance test is **observed failing** first | a recorded run of the red commit, from other than its author |
| Link integrity, ADR existence, quality-scenario-to-test mapping are *enforced* | tools running off the author's machine |
| The build record is `derived`, never self-asserted | a producer of that fact outside this repository |
| The layering ruleset must be shown to *fire*, not merely parse | its negative control executed in the pipeline |
| The performance budget is stated *"on the CI container"* | a named, stable runner class |

Four things are decided here; only the first is about a vendor.

## Considered options

- **Option A — GitHub Actions on GitHub-hosted `ubuntu-latest` runners.** **Chosen.**
  - Good, because `ubuntu-latest` ships Docker, which the real-PostgreSQL testing rule makes a
    **correctness** prerequisite.
  - Bad, because the YAML and the red-proof inversion are GitHub-specific.
  - Bad, because runner performance varies between runs, making the performance budget a noisier
    signal than it would be on fixed hardware.
- **Option B — GitHub Actions on a self-hosted runner** (the human's machine, or a VM).
  - Bad, because it re-introduces what CI was adopted to remove: **evidence produced on the
    assessed party's own machine**.
  - Bad, because it is a machine to maintain and secure, against a time box and one engineer.
  - Rejected: it costs more and buys less evidence.
- **Option C — CircleCI**, connected to the same GitHub repository.
  - Bad, because results arrive on the pull request through an integration rather than being part
    of it, on a host the assessor has no account on.
  - Bad, because it is a second account, a second set of credentials, and a second thing to
    explain.
- **Option D — GitLab CI**, with the repository mirrored or moved.
  - Bad, because the repository is on GitHub. Mirroring makes CI report on a copy; moving discards
    the pull-request history that *is* the gate record.
  - Rejected on the same ground as C, more strongly: the repository would have to move to suit the
    pipeline.
- **Option E — no CI; every check run locally before merge.** Free, and rejected by name:
  - **No CI, no recording of the red state, so no slice may leave `red`.** This is the one that
    stops work.
  - **Architecture conformance stops being enforced.** A locally-run `depcruise` is a reviewer's
    opinion that they ran it.
  - **Evidence must be derivable rather than narrated.** A test run on the author's laptop is a
    self-report by the assessed party.
  - Bad, because the build record could never carry the `derived` tier — the log's write path
    refuses it from the orchestrator — so the one trustworthy event type stays unavailable.
  - Rejected. It is the only option that breaks named, NON-NEGOTIABLE rules rather than being a
    weaker way of satisfying them.

## Decision

Chosen option: **Option A — GitHub Actions on GitHub-hosted `ubuntu-latest` runners**, because the
pull request is the gate artifact and Actions alone puts results *inside* it, and because —
decisively — **`ubuntu-latest` ships a working Docker daemon**. Substituting the database is
forbidden, so **the runner is a correctness prerequisite**: a Docker-less image changes the testing
rule, not this one.

### Decision 2 — the build record is **collected** from the API, not committed by the workflow

|  | B1 · workflow commits | **B2 · collector reads the API** | B3 · board queries GitHub |
|---|---|---|---|
| Log is complete offline | yes | **yes, once collected** | **no** |
| Branch stays the author's | **no** — a bot commit per run | yes | yes |
| Token scope needed | `contents: write`, graded history | none | none |
| Tier `derived` is honest | yes | yes | yes |
| Record exists the instant CI finishes | **yes** | no — at the next gate | n/a |

Chosen: **B2**. A collector reads finished runs from the GitHub API and appends the records with a
`derived` source, through the one write path reserved for it and refused to the
orchestrator's CLI.

**The property bought is durability; the price is immediacy.** The event log is read from a checkout
by an assessor with no network and no credentials, so a record resolving to `404` in six months is
not evidence — which rules out B3. The lag is acceptable because the log is
audited **at every gate**, and that audit reports an omission for any run with no matching record;
it would not be if the record were needed *between* gates. **The collector does not exist
yet**, so the build record stays unemitted; the workflow produces the other half today, a retained
run summary, backfillable from run #1.

### Decision 3 — the red proof: a run that is red **for the right reason**

The commit convention gives the marker: one red commit per slice, subject
`test(acceptance): … (red)`, applied by a **different agent** than the one that benefits. The
workflow treats a head commit matching `^test\(.+\): .*\(red\)$` as a **red-proof run** and asserts
its *shape*:

- the acceptance suite **must** exit non-zero, and
- every other check — install, typecheck, lint, `dependency-cruiser`, docs, tools, unit — **must**
  pass.

A run red because the branch does not compile is a **broken run, not a red proof**. The job's
conclusion is **success when the required failure was observed**, and the name `red-proof` makes
that inversion visible rather than hiding it in `continue-on-error`. It works **because acceptance
tests are black-box over HTTP**: a test importing `src/` would fail to *compile* before the
implementation existed, and a compile failure is indistinguishable from a broken branch — the
layering rule that exists for independence is what makes the red state legible.

**Retention, in decreasing durability, since the test is green a day later:** the red commit in git,
bound by SHA; the collected build record, which is *the* evidence; the raw reporter output as a
90-day artifact, corroboration only. `concurrency.cancel-in-progress` is therefore **false** —
cancelling a superseded run can destroy the only record of a red state.

### Decision 4 — what runs today, and what waits for phase 4

The architecture linter and the module graph fail today with *"Can't open 'src' for reading"*, and a
pipeline red by design teaches everyone to ignore it. So it is phased.

**Today — one job, `verify`, all of it independent of `src/`:**

| Step | Enforces |
|---|---|
| `npm ci --engine-strict` | the runtime pin, and the lockfile |
| `npm run docs:check` | the documentation's generated tier |
| `npm run test:tools` | the tools regression suite |
| every diagram `.html` has a committed `.svg`, and every `.svg` arc42 references exists | a reader on GitHub has no plugin |
| `docs/team-log/events.jsonl` gains lines and never loses or alters one | append-only |
| every log record validates against its schema | catches a hand edit |

**Phase 4**, when `src/` and the suite exist: `typecheck` · the architecture linter · the Vitest
suite on a Docker-enabled runner · `red-proof` · the run summary the collector consumes — present
as a commented block naming this ADR.

**Deliberately not in CI**, because claiming CI enforces something it does not is worse than an
admitted gap:

- **Stryker.** Mutation survivors are *the reviewer's findings* — a judgement to be read, not a
  threshold to pass.
- **The log audit.** It cannot run in CI at all: its ground truth is the agent transcripts on the
  human's machine, so on a fresh checkout every honest run reports `UNSUPPORTED` and exits 1.
- **The diagram self-check and geometry verifier.** The documentation rules say these run in CI;
  they cannot, living in a plugin cache outside the repository. The `.html`/`.svg` check is the
  honest subset; the rest is debt.
- **Link integrity, ADR existence, quality scenario → real test.** Claimed as *enforced*, and no
  tool implements any. Naming them is the point; they are debt.

### Decision 5 — the runtime pin becomes enforced, in CI only

Node and npm are pinned in `engines`, which is advisory; `npm ci --engine-strict` makes it a hard
failure with no new code. The runner is pinned to **Node 22.x** — the deployment runtime, not the
maintainer's local Node 24. The duplication is **checked**: raise the floor and the job fails.

**Recommended, not decided:** add `.npmrc` with `engine-strict=true`, making the same rule bite
locally. Left out because it changes local behaviour and the human has not ruled.

## Consequences

**Good**

- A slice can legally leave `red`, which it cannot today.
- The build record gets a mechanism with an honest `derived` tier: computed by a collector from
  GitHub's record, never asserted by the party recorded.
- The pull request stays the gate artifact: checks, review and the decision are one object with one
  URL.
- Three documentation claims move from written to enforced (assembly currency, diagram export,
  append-only log), and four claimed-but-unenforced ones are named.
- The runtime pin acquires the enforcement point it lacked.
- The workflow needs only `contents: read`. Nothing in CI can write to the repository whose history
  is under assessment.

**Bad, or deferred**

- **The build record is still not emitted.** This ADR decides the mechanism; the collector and the
  audit reconciliation are phase-4 work, and the log's one trustworthy event type waits on them.
- **The log lags CI between gates.** Accepted in Decision 2; the direct cost of durability.
- **The red proof depends on a commit-message convention.** NON-NEGOTIABLE, and applied by a
  different agent than the one it benefits, but a convention rather than a mechanism.
- **The performance budget is now tied to a runner class**: stated *"on the CI container"*, the
  numbers mean *on a standard GitHub-hosted `ubuntu-latest` runner*.
- **Docker-in-CI is unproven here.** Testcontainers on `ubuntu-latest` is well-trodden, but nothing
  here has exercised it; prove it in the walking skeleton.
- **Two checks live as inline shell and `node -e` in YAML** — untested code in a repository that
  tests its tools. If they grow they become `tools/` scripts.
- **Vendor coupling.** The red-proof mechanism, the artifact retention and the collector all speak
  GitHub. Moving platforms rewrites the pipeline, not `src/`.
