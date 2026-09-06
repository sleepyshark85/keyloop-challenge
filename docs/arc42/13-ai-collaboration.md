# 13. AI collaboration

> Owner: scribe · Outside the standard twelve arc42 sections

Sourced from artifacts, never memory: `docs/team-log/events.jsonl` (407 records), the 130-row
register in [`../DEFECTS.md`](../DEFECTS.md), the ADRs, PR threads, 130 files of prompts and
reports under `docs/team-log/prompts/`, and git.

## 13.1 Team structure and bounded authority

| Role | Decides | Cannot |
|---|---|---|
| architect | interfaces, layering, data model; `docs/arc42/`, `docs/adr/` | *(until 2026-09-06)* change scope, acceptance criteria or quality goals |
| test-engineer | how *done* is asserted; the outside-in suites | read `src/`; write `tests/unit/` |
| implementer | `src/`, `tests/unit/` | edit an acceptance test — it raises a DCR |
| reviewer | may block a merge, may raise a DCR | change the design or fix what it finds |
| scribe | this section, `README.md`, §12 | claim anything an artifact does not support |
| orchestrator | routing; sole writer of the event log | decide anything, or mark work done |
| human | overrides anyone | — |

§5's bound carries the most weight: the test-engineer defines *done* without having seen the
implementation, and the implementer cannot edit the test that judges it. Enforced by path, by a
`PreToolUse` hook, and by `git commit --only <paths>` — the last added after a bare commit took
another role's staged files and briefly recorded the architect committing `src/` (O-10).

## 13.2 Verification — what it caught

**The red commit is observed, not asserted.** Every slice has a collected failing run and a passing
one after it, collected from the GitHub API rather than the workflow:

| Slice | red | green | mutation as logged (§10 gates changed files, 0.75) |
|---|---|---|---|
| 00a | 33831214774 | 33844632820 | 0.9577 |
| 00 | 33856015886 | 33862313022 | ruled **N/A** — no mutable file changed |
| 01 | 33911942612 | 33913702060 | 0.9806 (155 mutants, 152 killed, 3 survivors) |
| 02 | 33984418682 | 33994990813 | 0.9595 (790 mutants, 747 killed, 11 timeout, 32 survived) |

`N/A`, and `depcruise`'s third value `not-run`, exist for one reason: an absent check must never
read as a pass.

**Mutation is an audit, not a target.** At slice 01 the implementer *reported* its three survivors
rather than writing tests shaped to kill them. At slice 02 the reviewer re-ran Stryker
independently, reproduced 747/11/32 with a **byte-identical survivor set**, and re-measured
ADR-0018's three cells on `postgres:16-alpine`, finding it honest.

**The register is generated from the log** and cannot drift: 130 findings — 10 blocking, 71 major,
49 minor — from test-engineer 32, reviewer 28, orchestrator 26, implementer 23, architect 19,
human 2. Mean escape distance 1.66 steps.

## 13.3 Where the human overrode the agents

Each ADR carries an `ai-input` provenance block. Of 21, one is **overridden** and one
**modified**; the rest were accepted as recommended or are still proposed.

- **ADR-0001** — the architect recommended *"time is unbounded"*. The human rejected the conclusion,
  kept the reasoning, and took a third option the architect had not separated out.
- **ADR-0003** — accepted in part and deliberately *expanded*: both cancellation and rescheduling.
- **AC-6, slice 01** — the architect proposed amending arc42 §5.2 to fit its design; the
  test-engineer objected (T-01-1) that a third path existed, so the reading was the human's. The
  human ruled the criterion **literally**, against the architect's preference:
  `appointmentInterval` and `withinOpeningHours` took raw millisecond parameters, the brands stopped
  crossing module boundaries, and four items of debt were booked rather than argued away. At the
  gate the human then ruled AC-6's **second clause unmet** (R-01-3) — the rule carried a standing
  exemption for exactly the imports the ruling forbade, so it held by implementer discipline
  alone.
- **Slice 00** — AC-10 added at step 5, recovering the UPDATE property ADR-0003 rests on, which
  arc42 named in three places and carried in none.
- **Gate D** — C6's remedy is a disjunction, *cut slices or reduce agent count*. The human ruled
  the first and **refused the second** on the record: the reviewer produced 17 of 56 findings, and
  the architect's runs were adjudication.
- **Concision** — overriding §4's ADR immutability *for length only*, on the argument that what
  immutability protects is the decision a later reader gets, which a meaning-preserving
  condensation does not touch.

## 13.4 Design changes, and the supersession chain that does not exist

Two loopbacks, each from a **(c) design defect** — and §6 requires naming the criterion that would
fail, which is what makes (c) unreachable on preference:

- **T-01-2** — the test-engineer measured that a Docker failure aborts the whole invocation and
  writes zero tests, so the red could still arrive as a crash. The architect ruled against **its own
  design**, naming §2.4: *"§8.3 reason 2 is not imprecise, it is false."* Remedy accepted and
  *extended*: merging two project results would let a run that never happened merge as zero
  failures. Result: `tools/ci/run-tests.mjs`.
- **T-02-9** — the architect re-ran the finding before ruling and it was **worse than reported**:
  285 of 400 losers deadlocked, not one race in three. It noted that had it ruled from the reported
  number, retry would have looked survivable — and retry livelocks, measured five ways. Result:
  ADR-0018.

The second DCR raised was ruled **(a) clarification**, consuming no loopback. The counterweight is
that (b) must be ruled when no criterion can be named, and the
architect did so explicitly against its own view: *"it is (b), and I would rule the same way if I
disliked the answer."*

**What is not here.** All 21 ADRs carry `supersedes: null`. §6 says a (c) ruling supersedes the
ADR; neither (c) did — T-01-2 had no ADR to supersede, and T-02-9 produced a new one. There is no
supersession chain to show, and that is recorded rather than dressed up as one.

## 13.5 What the process cost

**Reconstructed from session transcripts by the token collector, not a billing record.**

| | runs | summed agent duration | elapsed wall | billable tokens | architect share |
|---|---|---|---|---|---|
| 00a | 25 | 26.1 h | 12.1 h | 23.90 M | 52% |
| 00 | 17 | 30.7 h | 5.3 h | 30.53 M | 68% |
| 01 | 19 | 11.1 h | 15.3 h | 10.69 M | 72% |
| 02 | 23 | 10.2 h | 16.7 h | 16.35 M | 63% |

Neither time column is *the* cost. Summed duration overstates — 24 of the pilot's 42 runs carry
`duration_caveat: agent was resumed`, and a resumed span includes the idle gap — while elapsed
counts the gaps between dispatches. Billable excludes cache reads; with them the four slices are
606 M, 505 M, 223 M and 477 M.

**No dollar figure is computed.** The collector was itself untested — delete the accumulator and
all 216 assertions still passed (R-5) — so a cost derived from it would be the exact defect this
project spent two slices cataloguing. C6, *the budget is real*, **failed**: 45 minutes and $8 were
agreed in advance for slice 00; the most favourable honest reading gives 299 minutes.

The figures moved after the fact: the light-gate ruling read slice 01 at 9.5 h / 8.30 Mtok over 15
runs, and the log now reads 19 runs / 11.1 h / 10.69 Mtok, because a stale scope marker filed four
slice-02 runs under slice 01 (O-20).

## 13.6 What did not work

**One defect shape, twenty-five times: a mechanism that reports success over work it never did.**
The retro catalogued eight in the pilot. Since then, by reference: R-5, R-10, T-01-2, O-14,
O-17, O-19, O-20, O-24, O-25, O-27, O-31, O-32, O-33, R-02-1, AB-01-5, AB-01-7, and the ADR guard
that printed *"every considered option and chosen option survives"* over a decision record it had
never opened — and could not have read anyway, because its options were in the table form the
concision ruling encourages. The project's own counters say *five*, *seven*, *eight* and *nine*
across four files, each counting a different set — a disagreement left standing rather than
reconciled to a number nobody measured.

Not one was found by reading code; every one came from asking *what would happen if this were
removed?* Hence the rule, first written by the architect against its own work at slice 00 and now
binding on every role: **for a discrimination claim, name the mutant; for a mechanism claim, name
the call site.**

**Gates in the right place are not gates that are read.** Slice 00a merged without ever being set
`status: done`, so `slice:check` reported `FAIL dependencies merged` on every run for a whole slice
and nobody looked (R00-1). C5 failed, 7 interventions against a ceiling of 1 — every one a decision
§6 reserves to the human, so the *threshold* was wrong, and it is recorded as failed anyway:
redefining a criterion after seeing the result is forbidden.

**The tooling produced its own worst defects.** The word-budget meter watched 2,698 words of
overage become 18,607 in one slice and stopped nothing, having been kept out of CI on the sound
ground that a red guard commits a broken build (O-32). The stale scope marker cost more than
bookkeeping: the architect adjudicated eleven objections **without the reports**, said so, and
ruled from a relay. Both hooks warn when that marker is absent, never when it is wrong.

**Two things the record must not soften.** Slice 02's Gate E was taken by the **orchestrator, not
the human**, under explicit delegation, and is logged `actor: orchestrator` with decision
`approved-under-delegated-authority`: a gate the human did not see must never read later as one
they did. The orchestrator named the conflict itself — it routed that work and then gated it. And
**67 of 130 findings await a ruling** — the shape of a project logging more than it closes.
