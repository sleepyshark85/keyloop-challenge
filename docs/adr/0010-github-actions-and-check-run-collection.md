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

There is no `.github/` directory, and CI is load-bearing in about a dozen places:

| Rule | What it requires of CI |
|---|---|
| `CLAUDE.md` §2.3 | a layering violation **fails the build** |
| `CLAUDE.md` §2.4, §6 step 3 | the acceptance test is **observed failing in CI** |
| METHODOLOGY §7 (§261) | the board cannot leave `red` until CI records the failure |
| METHODOLOGY §4 | link integrity, ADR existence, `QS-*` → test — the **enforced** tier |
| METHODOLOGY §9 (§400) | `check.run` is tier `derived`, writer **T**, **not emitted**; C1 unpassable |
| arc42 §10, QS-10 | the ruleset must be shown to *fire*, not merely to parse |
| arc42 §10, QS-14 | a budget *"on the CI container"* — the runner class is in scope |

So CI's absence is not a convenience gap: it makes the slice loop
**unable to legally advance past step 3**: with no CI there is no recording of the red state, and the
board cannot leave `red`. Four things are decided here; only the first is about a vendor.

## Considered options

- **Option A — GitHub Actions on GitHub-hosted `ubuntu-latest` runners.** **Chosen.**
  - Good, because `ubuntu-latest` ships Docker, which TC-9 makes a **correctness** prerequisite.
  - Bad, because the YAML and the red-proof inversion are GitHub-specific.
  - Bad, because runner performance varies between runs, which makes QS-14 a noisier signal than
    it would be on fixed hardware.
- **Option B — GitHub Actions on a self-hosted runner** (the human's machine, or a VM).
  - Bad, because it re-introduces exactly what CI was adopted to remove: **evidence produced on
    the assessed party's own machine**.
  - Bad, because it is a machine to maintain and secure, against OC-1's time box and OC-3's single
    engineer.
  - Rejected: it costs more and buys less evidence.
- **Option C — CircleCI**, connected to the same GitHub repository.
  - Bad, because results arrive on the pull request through an integration rather than being part
    of it, on a host the assessor has no account on.
  - Bad, because it is a second account, a second set of credentials, and a second thing to explain
    in the video (OC-1).
- **Option D — GitLab CI**, with the repository mirrored or moved.
  - Bad, because the repository is on GitHub. Mirroring makes CI report on a copy; moving discards
    the pull-request history METHODOLOGY §8 makes the gate record.
  - Rejected on the same ground as C, more strongly: the repository would have to move to suit the
    pipeline.
- **Option E — no CI; every check run locally before merge.** Free, and rejected by name:
  - **METHODOLOGY §261 — no CI, no recording of the red state, so no slice may leave `red`.** This
    is the one that stops work.
  - **`CLAUDE.md` §2.3** — *"Violations fail the build. Architecture conformance is not a matter of
    reviewer opinion."* Locally-run `depcruise` is a reviewer's opinion that they ran it.
  - **OC-2 / METHODOLOGY §9** — evidence must be *derivable* rather than narrated. A test run on the
    author's laptop is a self-report by the assessed party.
  - Bad, because `check.run` could never carry tier `derived` (`write.mjs` refuses it from the
    orchestrator's write path), so §400's one trustworthy event type stays unavailable.
  - Rejected. It is the only option that breaks named, NON-NEGOTIABLE rules rather than being a
    weaker way of satisfying them.

## Decision

Chosen option: **Option A — GitHub Actions on GitHub-hosted `ubuntu-latest` runners**, because
METHODOLOGY §8 makes the pull request the gate artifact and Actions alone puts results *inside* it,
and because — decisively —
**`ubuntu-latest` ships a working Docker daemon, which TC-9 requires.** §2.2 forbids substituting the
database, so **the runner is a correctness prerequisite**: a Docker-less image changes §2.2, not CI.

### Decision 2 — `check.run` is **collected** from the API, not committed by the workflow

|  | B1 · workflow commits | **B2 · collector reads the API** | B3 · board queries GitHub |
|---|---|---|---|
| Log is complete offline | yes | **yes, once collected** | **no** |
| Branch stays the author's | **no** — a bot commit per run | yes | yes |
| Token scope needed | `contents: write`, graded history | none | none |
| Tier `derived` is honest | yes | yes | yes |
| Record exists the instant CI finishes | **yes** | no — at the next gate | n/a |

Chosen: **B2**. `tools/team-log/collect-ci.mjs` reads finished runs (`gh run view --json`) and appends
`check.run` records with `source: "derived"` through `appendRecords(..., { allowDerived: true })` —
the flag `write.mjs` reserves for this and refuses to the orchestrator's CLI.

**The property being bought is durability, and what is paid for it is immediacy.** The event log is
read from a checkout by an assessor with no network and no credentials, so a record resolving to
`404` in six months is not evidence — which rules out B3. The lag is acceptable because §9 runs
`log:audit` **at every gate**; it would not be if `check.run` were needed
*between* gates. `log:audit` also reports `OMISSION` for a run with no matching record. **The
collector does not exist yet**, so `check.run` stays unemitted and C1 unpassable; the workflow
produces the other half today, a retained run summary, backfillable from run #1.

### Decision 3 — the red proof: a run that is red **for the right reason**

`CLAUDE.md` §7 gives the marker: one red commit per slice, subject `test(acceptance): … (red)`,
applied by a **different agent** than the one that benefits. The workflow treats a head commit
matching `^test\(.+\): .*\(red\)$` as a
**red-proof run** and asserts its *shape*:

- the acceptance suite **must** exit non-zero, and
- every other check — install, typecheck, lint, `dependency-cruiser`, docs, tools, unit — **must**
  pass.

A run red because the branch does not compile is a **broken run, not a red proof**. The job's
conclusion is **success when the required failure was observed**, and the name `red-proof` makes that
inversion visible rather than hiding it in `continue-on-error`. It works **because acceptance tests
are black-box over HTTP**: a test importing `src/` would fail to
*compile* before the implementation existed, and a compile failure is indistinguishable from a broken
branch — the layering rule that exists for independence is what makes the red state legible.

**Retention, in decreasing durability, since the test is green a day later:** the red commit in git,
bound by SHA; the `check.run` record, which is *the* evidence; the raw reporter output as a 90-day
artifact, corroboration only. `concurrency.cancel-in-progress` is therefore **false** — cancelling a
superseded run can destroy the only record of a red state.

### Decision 4 — what runs today, and what waits for phase 4

`lint:arch` and `graph:modules` fail today with *"Can't open 'src' for reading"*, and a pipeline red
by design teaches everyone to ignore it. So it is phased.

**Today — one job, `verify`, all of it independent of `src/`:**

| Step | Enforces |
|---|---|
| `npm ci --engine-strict` | TC-10, and lockfile agreement |
| `npm run docs:check` | §4's *generated* tier |
| `npm run test:tools` | the tools regression suite |
| every `docs/diagrams/*.html` has a committed `.svg`, and every `.svg` referenced from arc42 exists | §4: no plugin on GitHub |
| `docs/team-log/events.jsonl` gains lines and never loses or alters one | append-only |
| every record in the log validates against `tools/team-log/schema.mjs` | catches a hand edit |

**Phase 4**, when `src/` and the suite exist: `typecheck` · `lint:arch` (QS-10) · the Vitest suite on
a Docker-enabled runner (TC-9, §2.2) · `red-proof` · the run summary the collector consumes — present
as a commented block naming this ADR.

**Deliberately not in CI, with reasons**, because a claim that CI enforces something it does not is
worse than an admitted gap:

- **Stryker.** METHODOLOGY §7 makes mutation survivors *the reviewer's findings*. Mutation testing
  is a judgement to be read, not a threshold to pass.
- **`npm run log:audit`.** It cannot run in CI at all. Its ground truth is
  `~/.claude/projects/**/subagents/*.jsonl` on the human's machine; on a fresh checkout every
  honest agent run reports `UNSUPPORTED` and it exits 1. Verified.
- **`self_check.py` / `verify-geometry.py`.** METHODOLOGY §4 states these run in CI. They currently
  cannot: they live in a plugin cache outside the repository. The `.html`/`.svg` check is the
  honest subset; §11 carries the rest.
- **Link integrity, ADR existence, `QS-*` → real test.** METHODOLOGY §4 puts these in the *enforced*
  tier and no tool implements any. Naming them is the point; §11 carries them.

### Decision 5 — TC-10's pin becomes enforced, in CI only

§7.1 pins Node and npm in `engines`, which is advisory; `npm ci --engine-strict` makes it a hard
failure with no new code. The runner is pinned to **Node 22.x** — §7.1's deployment runtime, not the
maintainer's local Node 24. The duplication is **checked**: raise the floor and the job fails.

**Recommended, not decided:** add `.npmrc` with `engine-strict=true`, which makes the same rule bite
locally too. Left out because it changes local behaviour and the human has not ruled.

## Consequences

**Good**

- METHODOLOGY §261 becomes satisfiable: a slice can legally leave `red`, which it cannot today.
- `check.run` gets a mechanism with an honest `derived` tier — the fact is computed by a collector
  from GitHub's record, never asserted by the party being recorded.
- The pull request stays the gate artifact (METHODOLOGY §8): checks, review and the human's
  decision are one object with one URL.
- Three documentation claims move from written to enforced (assembly currency, diagram export,
  append-only log), and four claimed-but-unenforced ones are named.
- TC-10 acquires the enforcement point it was recorded as lacking.
- The workflow needs only `contents: read`. Nothing in CI can write to the repository whose history
  is under assessment.

**Bad, or deferred**

- **`check.run` is still not emitted.** This ADR decides the mechanism; `collect-ci.mjs` and the
  `log:audit` reconciliation are phase-4 work; C1 stays unpassable until they land. §11.
- **The log lags CI between gates.** Accepted in Decision 2, and the direct cost of durability.
- **The red proof depends on a commit-message convention.** It is NON-NEGOTIABLE (`CLAUDE.md` §7)
  and applied by a different agent than the one it benefits, but a convention, not a mechanism.
- **QS-14's budget is now tied to a runner class.** It is stated *"on the CI container"*, so the
  numbers mean *on a standard GitHub-hosted `ubuntu-latest` runner*.
- **Docker-in-CI is unproven here.** Testcontainers on `ubuntu-latest` is well-trodden, but nothing
  here has exercised it; prove it in the walking skeleton.
- **Two checks live as inline shell and `node -e` in YAML**, which is untested code in a repository
  that tests its tools. If they grow they become `tools/` scripts.
- **Vendor coupling.** The red-proof mechanism, the artifact retention and the collector all speak
  GitHub. Moving platforms rewrites the pipeline, not `src/`.
