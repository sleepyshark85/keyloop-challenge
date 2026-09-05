# Agent Team Methodology

**Project:** Keyloop Technical Assessment — Scenario A, Unified Service Scheduler (backend, TypeScript/Node/PostgreSQL)
**Status:** Agreed, pre-implementation · **Audience:** humans. Three things in `.claude/agents/` are generated from it; the rest is related by citation — §12.

How a team of AI agents and one human engineer build software together: who decides what, in what
order, under what evidence requirements, and how it is observed.

**[`CLAUDE.md`](../CLAUDE.md) is the normative home of the operative rules.** Rules stated there are
**cited by section number** here, never restated: two wordings of one rule give an agent no way to
know which wins. What is left is the part no rule can carry — the role model, the phase model, the
principles, and the reasoning, including the near-misses that shaped each rule.

Designed against two failure modes. **Unowned generation**: accepting plausible AI output because it
looks plausible, so every claim here must be checkable by something other than an agent's assertion.
**Methodology theater**: ceremony that signals rigor without producing it, so §11 measures whether
each rule earned its cost.

---

## 0. Prerequisites

Node + npm, pinned at Gate B. **Docker**, for Testcontainers and the local `grafana/otel-lgtm` stack —
tests will not run without it. Python ≥ 3.10 and the third-party `diagram-design` plugin, for authoring
presentation diagrams only: both `.html` and `.svg` are committed, so neither is needed to *read* the
design. Build and run instructions become the README's at phase 6.

---

## 1. Principles

Everything below derives from these. Resolve uncovered situations by returning to them.

| | Principle | Consequence |
|---|---|---|
| **P1** | Human attention is the bottleneck, not agent capacity | Kanban with WIP 1; gates only where the human's answer changes the outcome. A rubber-stamped gate is worse than none |
| **P2** | One source of truth per concern | Second views are *generated*, never maintained alongside |
| **P3** | Executable beats asserted | Constraints in the DB, layering in CI, test quality via mutation score, "done" via a script |
| **P4** | Independence where it counts | Spent at the boundary that defines *done*; deliberately **not** on unit tests, which are a design tool |
| **P5** | Evidence over narration | Anything derivable is derived; narration is attributed and visually marked |
| **P6** | Flow over perfection | Correct-under-the-agreed-design ships; improvements become debt. Only incorrectness stops the line |

---

## 2. Roles

Defined by what they may **decide**, not what they produce. Authority and the one-round resolution
rule are `CLAUDE.md` §6.

| Role | Decides | Never | Model |
|---|---|---|---|
| **Human** | Scope, acceptance criteria, quality goals, all trade-offs; overrides anyone | — | — |
| **Orchestrator** | Sequencing, slicing, who convenes. Sole writer of board and event log | Decide architecture; write code | — |
| **Architect** | Interfaces, layering, data model, patterns, open tech choices; adjudicates DCRs; rules mid-slice on scope, AC and QS, provisionally until the gate | Write code or tests; overturn a gate ruling | Opus |
| **Test-engineer** | How *done* is asserted: acceptance, contract, property, concurrency tests | Write unit tests; see the implementation first | Sonnet |
| **Implementer** | Internal design within the architect's constraints | Edit acceptance/contract/property tests; edit arc42 | Sonnet |
| **Reviewer** | Whether a diff conforms; may block a merge | Change the design — may only raise a DCR | Opus |
| **Scribe** | Nothing; records | Claim anything not supported by an artifact | Sonnet |

*Generator source (§12): these cells are written into `.claude/agents/*.md`.* Deliberately absent: an
analyst, since requirements and design are one conversation at this size, and a product owner, since
that is the human.

---

## 3. Phases

```
0 FOUNDATION ─▶ 1 REQUIREMENTS ─A─▶ 2 ARCHITECTURE ─B─▶ 3 BACKLOG ─C─▶
   4 PILOT + RETRO ─D─▶ 5 SLICE LOOP ×n ─E each─▶ 6 CONSOLIDATION ─F─▶ 7 VIDEO
```

| Phase | Who | Produces | Gate |
|---|---|---|---|
| **0 Foundation** | human + orchestrator | Scaffold, constitution, agent definitions, hooks, event log, board | Human reviews the instrument |
| **1 Requirements** | architect | arc42 §1–§3, assumptions, open questions | **A** — ambiguity resolved; answers become ADRs |
| **2 Architecture** | architect | arc42 §4–§8, §10, §11; founding ADRs; `.dependency-cruiser.js` | **B** — stack confirmed |
| **3 Backlog** | orchestrator + human | 12–14 slice files | **C** — scope and ordering |
| **4 Pilot** | all | Slice 00 end-to-end, then a retro against pre-registered criteria | **D** — tune, or proceed |
| **5 Slice loop** | all | The system, one slice at a time (§6) | **E** — every slice |
| **6 Consolidation** | architect + scribe | As-built arc42, diagrams, `system-design.md`, README, the as-designed/as-built delta | **F** — final read |
| **7 Video** | scribe + human | Shot list, from real artifacts | — |

Phase 0 is instrumentation-first because observability added later never gets added and an unobserved
pilot is worthless. Phase 4 exists because the methodology is itself untested: running the pipeline on
a trivial slice against **criteria written beforehand** beats discovering at slice 9 that it does not
work.

---

## 4. Documentation

Homes and owners are `CLAUDE.md` §4, plus two nothing else writes: `docs/STATUS.md`, the generated
resume point, and `CLAUDE.md` itself. arc42 keeps all twelve sections for recognisability, several
deliberately thin and saying so — which reads as judgement where invented detail reads as padding —
plus one honestly numbered outside the standard twelve, **§13 AI Collaboration**. It is written
as-designed at Gate B and corrected at each merge, and that delta is kept: where the plan was wrong is
stronger evidence than a plan pretending it never was.

**Traceability**, walkable both ways — `arc42 §10 quality scenario → slice acceptance criterion → test
name → CI result` — because a quality attribute not traceable to a test is aspiration, and a test not
traceable to a scenario is unexplained.

**Three tiers of trust.** *Generated*, cannot drift: module graph, OpenAPI, §11's debt register,
`system-design.md`. *Enforced* in CI: the assembly matches its sections, diagrams have their exports
and links resolve, the log is append-only and schema-valid, citations resolve, budgets hold. `QS-*` →
test is claimed and **not yet enforced** (arc42 R-8). *Written*, therefore drifting — so keep it small
and about **why**.

**ADRs.** Immutability is `CLAUDE.md` §4. MADR, extended with `proposed-by` / `decided-by` /
`ai-input` as direct evidence for the AI-verification criterion. *Considered Options* must be
populated honestly — one option considered is a note, not a decision record.

**Diagrams** are refreshed once at phase 6, not per slice: SVG is not cheaply diffable and each
drawing costs several hundred lines of mandatory reference reading. Both the `.html` and the exported
`.svg` are committed, because an evaluator reading this on GitHub has no plugin installed and would
otherwise find the §6 runtime view invisible. CI checks existence and linkage but **not layout** — the
validators live outside the repository, so layout is *reported*, not proven (R-8).

*Rejected: a second specification framework.* Spec-Kit and BMAD overlap arc42, so either would create
two answers to "what is a task" and a pipeline to sync them. What is lost, Spec-Kit's `/clarify` and
`/analyze`, is reproduced as Gate A and the reviewer.

---

## 5. Work management

Kanban, not Scrum: fixed iterations batch human coordination and there is no team to coordinate (P1).
WIP limit 1 (`CLAUDE.md` §8). Board columns are the TDD cycle, so the board *displays* that a failing
test preceded implementation:

```
ready · speccing · red · green · review · done          (blocked is orthogonal)
```

**One writer:** the orchestrator owns every transition. No agent marks its own work done.

```yaml
---
id: 03
status: ready
depends_on: [01, 02]
arc42: ["§5.2", "§8.3"]           # sections this slice may touch — nothing else may move
adr: [0002]
quality_scenarios: [QS-3, QS-4]
---
## Goal · Acceptance criteria (Given/When/Then → test names) · In/Out of scope · DoD
```

The `arc42:` field is what prevents slice work from silently rewriting architecture.

---

## 6. The slice loop

![The slice loop](diagrams/slice-loop.svg)

*Source: [`diagrams/slice-loop.html`](diagrams/slice-loop.html) · `npm run diagram:export`*

The seven steps, the DCR outcomes and the loopback governor are `CLAUDE.md` §6. Three things about the
loop's shape are not rules. **Architecture governs; it is not discovered** — step 1 precedes all
downstream work, and a no-impact slice says so in three lines, but one later generating design churn
signals the backlog was sliced badly. **Step 2 interrupts the human only** on disagreement or a new
ADR; otherwise thirteen slices becomes twenty-six interruptions and the gates stop meaning anything
(P1). **A DCR puts the whole team on one slice** because WIP is 1 — what the limit buys, not a side
effect. And ruling **(b)** can become a dumping ground, so the deferred count is on the board and
triaged at every gate: three items read as judgement, fifteen as avoidance.

### Where defects live

*Added 2026-09-04, after slice 00a produced ~25 findings that existed only in PR prose.*

`review.finding` is the reviewer's, at step 5; a **DCR** blocks the slice. Neither fits the ordinary
case — a finding one role raises about another's work at step 2, 3 or 4, argued and resolved without
blocking anything. Those had no home, `log:audit` could not see them, and **defect-escape distance,
the shift-left measure §11 names, had no data at all.** They are now `finding.raised` /
`finding.ruled` events, and [`DEFECTS.md`](DEFECTS.md) is generated from them, so the register cannot
drift from the record: it *is* the record.

Recorded: anything crossing a role boundary, including a role's finding against its own earlier work.
An *in-flight self-correction* is not a defect — recording those would make a careful role look worse
than a careless one. Severity `BLOCKING` · `MAJOR` · `MINOR`; verdict `accepted` · `narrowed` ·
`rejected` · `deferred` · `escalated`. **Rejected findings stay, with their ruling**: one argued down
on reasoning is evidence the adjudication worked.

**`narrowed` is the load-bearing verdict**, and it exists because of one case: slice 00a's most
valuable finding had a *correct measurement* and a *remedy that would have broken the following
slice*. Accept-or-reject forces that into one bucket and loses the distinction the DCR rules exist to
produce. **The finding and the remedy are separate verdicts.**

Escape distance is `step_found − step_introduced`, and zero is the target. It is the one number saying
whether steps 2 and 5 earn their cost.

---

## 7. Tests

Ownership by path, and the reasoning for it: `CLAUDE.md` §5. Four things it does not say.

**Double-loop TDD.** Outer: the test-engineer's failing acceptance test, committed red. Inner: the
implementer's red→green→refactor until the outer test passes on its own — the division real teams use,
where the tester's assertions define *done* and the developer's define *how*.

**The test-engineer never reads `src/`.** Independence is a read restriction, not just a write one:
tests derived from an implementation restate it rather than check it. It works from the slice file,
arc42 and the ADRs only, and the rule holds on loopbacks, when an implementation does exist.

**The paths are machine-enforced** by a `PreToolUse` hook — `agent_id` reaches the payload only for
subagents, which is what makes per-role file permissions enforceable at all.

**Who checks the tests.** "The AI wrote tests and they passed" is worth nothing alone. Mutation testing
is the **reviewer's**, so test quality is audited by a role that wrote neither tests nor code, and
survivors are findings. The **human keeps exploratory testing** at every gate, because scripted tests
assert only what someone already thought of — exactly where agents are weakest, and what the human
breaks becomes a new acceptance test attributed to them.

---

## 8. Commits

Commit and branch discipline — one red commit per slice, every implementer commit green, the
~150-line ceiling — is `CLAUDE.md` §7. What that leaves open:

**Everything from phase 1 onward goes through a PR** — one per phase, one per slice in phase 5 —
because **the PR is the gate artifact**: the decision and its rationale become the record rather than
something the orchestrator reports. Phase 0 went direct to `main`, having no agent, no acceptance test
and no gate; a PR with no reviewer is ceremony.

The single red commit resolves what would otherwise conflict — auditable TDD needs a visible red
state, "every commit deliverable" forbids one. It is authored by a **different agent** than the
implementer, so the evidence beats a self-reported cycle and mainline discipline is intact.

Two repository settings follow, and neither is a style preference. **Merge commits only**, because
squashing collapses the red and green commits into one and rebasing rewrites the SHAs the log records
in `git.commits` — either destroys the trail C1 and C2 are measured from. **Zero required approvals**,
because nobody may approve their own PR on GitHub and requiring one would hard-block every merge on a
single account; the gate artifact is instead the **merge plus a comment carrying the human's
rationale**, timestamped against the diff.

<!-- agents:committing -->
**Commit by explicit pathspec: `git commit --only <paths> -F <message-file>`.** Never a bare
`git commit`, never `git add -A`, never `git commit -a`.

The git index is shared by every agent in this worktree, and roles run concurrently whenever their
files are disjoint — but the index is not a file. A bare commit takes the index as it finds it, so
another role's staged work lands in your commit under your name. That happened at slice 00 and would
have recorded an authority violation in git history, which is what criterion C2 is measured from.

`guard-paths.mjs` cannot help here: it denies you a `Write` outside your paths and cannot deny you a
`git add` of the same path. Pathspec-pinning is the only thing that closes it.
<!-- /agents:committing -->

*Generator source (§12): copied verbatim into all five agent definitions — reword it here and it
reaches every role, or nowhere.*

### Attribution in PR threads

Agents have no identity, so every comment posts under the repository owner's account — which left
alone makes the thread unreadable as evidence, the reviewer's findings and the human's judgement
looking like one person talking to themselves. Every comment made **on behalf of an agent** therefore
opens with an attribution line, and **a comment with no attribution line is the human's** — an
asymmetry chosen because the human types comments by hand and should not have to remember a
convention.

```
**reviewer** · `.claude/agents/reviewer.md@6f70521` · MAJOR
src/domain/availability.ts:44
claim:     a slot ending exactly at another slot's start is treated as overlapping
scenario:  bay 7 booked 09:00–10:00; a request for 10:00–11:00 is refused, but tstzrange is half-open
```

Naming the **agent definition and its commit SHA** beats a bot identity, because it says which
*version* of the reviewer produced a finding — so tightening a role's prompt mid-project leaves
before-and-after distinguishable rather than smeared together. Honest limit: the header is
self-asserted and only partly corroborated by `log:audit`, which puts it on the footing of `handoff`
in §9's coverage table rather than `agent.finish`.

### What the PR thread must carry

The prompt library records what each agent was *asked* and what it *returned*, not what the team
**decided between those two points** — and that reasoning is a graded artifact, since the brief asks
for the process of guiding and verifying AI output, not only its results. The thread is the one place
a decision sits beside the diff it applies to, with its own timestamp. So every slice PR opens as a
**draft at step 1**, when the design is committed: opened after the work it is a publication, opened
before it a venue. The orchestrator posts every row but the gate, on a role's behalf.

| Step | Carries |
|---|---|
| 1 Design | Key decisions, ambiguities flagged, and what the architect expects to be argued |
| 2 **Agree** | An explicit **agree** or **object** per role; an objection names the AC or design statement it disputes. Silence is not agreement and may not be recorded as one |
| 3 Red | The red commit SHA and the CI run that observed it failing, assertion quoted — evidence for C1. The PR leaves draft here |
| 5 Review | Findings in `claim:` / `scenario:` form, plus surviving mutants. A no-findings review must still report a mutation score |
| 6 Gate | The human's ruling and rationale, unattributed. That comment plus the merge *is* the gate artifact |
| DCR | The mismatch, the round of discussion, and the ruling with its outcome letter |

Step 2 is the easiest to skip, and skipping it is measured: `process-criteria.md` C3 treats a reviewer
who produces no substance as a failure, and by the same reasoning **an agree step that has never
produced an objection is rubber-stamping**.

### Answering an objection

The rule is `CLAUDE.md` §6, NON-NEGOTIABLE. *It was added on 2026-09-04, after the first real use of
step 2 produced five objections and the adjudicating prompt asked the architect to rule and amend in
one run* — a defect in the process, not in the architect: an adjudicator drafting the amendment while
deciding whether it is warranted has already conceded.

Why the extra round earns its cost: the brief grades *the process for verifying and refining* AI
output, and a design argued into shape with the losing arguments preserved is stronger evidence than
the same design reached by an agent agreeing with whoever spoke last. **A vote is also the only
mechanism here that lets a role be outnumbered rather than overruled**, which keeps the architect's
authority from collapsing into the last reviewer's preference.

---

## 9. Observability

The team is a distributed system too, so it is instrumented like one: **a slice is a trace, an agent
invocation is a span, handoffs are links, gates are events.** The application plane — the OTel/`pino`
contract, the domain metrics, the probes — is arc42 §8. One choice there is methodology rather than
architecture: the availability check and the insert get *separate* spans, so if check-then-act ever
reappears, the window `CLAUDE.md` §2.1 forbids is visible in a waterfall.

**Team plane:** append-only `docs/team-log/events.jsonl`, trace-shaped so it renders as a waterfall now
and exports to OTLP later. The record shape and event vocabulary are executable, in
`tools/team-log/schema.mjs`; re-listing them here would drift, and did. Three of its rules are
methodology rather than plumbing. **Every record is scoped to a `slice` or a `phase`** and one that is
neither is rejected, so phases 1–3 — no slice, but carrying the requirements and architecture
reasoning — are logged as `phase-N` traces. **A `dcr.resolved` ruling `(c)` must name a
`failing_criterion`**, so §6's forcing function is enforced by the log rather than the architect's
restraint. And **phase 0 is not backfilled**: events written after the fact for work predating the log
would be narration dressed as history, the fabrication the trust model exists to prevent. Its evidence
is its git history, which is derived and therefore better.

**Trust (P5).** The log is the orchestrator's, so on its own it would depend on the orchestrator's
diligence — and a record depending on the diligence of the thing recorded is not evidence. Three
mechanisms close that. **`derived` cannot be asserted**: the tier claiming a fact came from tooling is
refused from the orchestrator's write path, and only collectors that compute a fact may claim it. **A
`SubagentStop` hook records every role-agent run automatically**, outside the model's context, whether
or not the orchestrator remembers or wants it to. **`log:audit` reconciles the log against artifacts
the orchestrator does not author** — transcripts and git history — reporting `OMISSION`, `UNSUPPORTED`
and `MISMATCH`: omissions catch forgetting, unsupported records catch invention. Agent reports are
schema-validated or the slice cannot advance, and only `message` is narration.

![What the record can be trusted for](diagrams/logging-trust.svg)

### Coverage — what is logged, and how far it can be trusted

`Writer`: **H** hook · **T** tooling · **O** orchestrator. *Corroborated* means an independent
artifact could contradict a false record.

| Event | Tier | Writer | Corroborated by | Residual risk |
|---|---|---|---|---|
| `agent.finish` | derived | **H** | its own transcript | **none** — automatic |
| `check.run` | derived | **T** | the GitHub API | **none** — collected, not typed |
| `agent.start` | reported | O | transcript first-timestamp | low — audit could check, doesn't yet |
| `handoff` | reported | O | — | **omittable, unverifiable** |
| `board.move` | reported | O | — | **omittable, unverifiable** |
| `slice.ready` `slice.done` | reported | O | slice-file `status` | low |
| `git` on other events | reported | O | `git log` | low — audit reports unreferenced commits |
| `review.*` `finding.*` | reported | O | PR threads | low once PRs are live |
| `gate.opened` `gate.decided` | reported | O | PR merge + rationale comment | low |
| `dcr.resolved` `loopback` | reported | O | superseding ADR | medium — a (c) needs `failing_criterion` (enforced) |
| `adr.recorded` `arc42.updated` | reported | O | the files themselves | low — audit could check, doesn't yet |
| `dcr.raised` `escalation` | reported | O | — | **omittable** |

Read honestly: **two** event types are fully derived; **four** are omittable and unverifiable, so if
they go unwritten nothing notices — that is the residual trust surface; and **three** have ground
truth on disk that `log:audit` does not yet read.

### Commands

`package.json` is the index; four of them are process obligations rather than conveniences.

| | |
|---|---|
| `npm run status` | **regenerate `docs/STATUS.md`, the committed resume point — before ending a session** |
| `npm run log:audit` | **reconcile the log against reality — at every gate** |
| `npm run slice:check 03` | the Ready / Done gate; `UNVERIFIED` blocks Done |
| `npm run board` | four panels — board, waterfall (loopback rewinds visible), thread, metrics. Gitignored |

**Prompts, tokens, cost.** Prompts are written **before** invocation to
`docs/team-log/prompts/`, with the report beside them, so the record cannot drift from what ran; the
prompt library is the primary evidence for *strategy for directing AI*. *Corrected 2026-09-04:* that
rule was enforced by the orchestrator's discipline and the discipline failed — phases 2 and 3 ran with
no prompt files at all. Both halves are now hooks, writing the prompt as sent and extracting the
report from the agent's own transcript, so neither is typed by hand. **P3 applies to this methodology
as much as to the system it builds: a rule whose only enforcement is discipline records nothing on the
day it matters.**

Token attribution is mechanical, from each subagent's own transcript; cost is tokens × pricing with
the cache breakdown kept — a faithful reconstruction, not a billing record, labelled as such. It
answers a question worth putting in the video: *what did the quality process actually cost?*

---

## 10. Ready / Done

Both definitions are `CLAUDE.md` §10, and `npm run slice:check <id>` returns pass/fail against them.
A slice does not reach `done` because an agent says so.

---

## 11. Measuring the team

The methodology is a hypothesis, measured like one. Pass/fail criteria for phase 4 are written to
`docs/team-log/process-criteria.md` and approved **before** the pilot, so a poor run cannot be
rationalised afterwards.

| Metric | Reads as |
|---|---|
| **ADR churn** (superseded within *n* slices ÷ total) | High: the architect produces weak designs |
| **DCR outcome mix** | Mostly (b) is healthy. Many (c): weak architect or oversized slices. Many (a): ambiguous writing |
| **Defect escape distance** (steps between origin and detection) | Shift-left made measurable. Step 2 catching nothing = rubber-stamping |
| **Loopbacks per slice** | Consistently high: phase 3 sliced badly |
| **Deferred-improvement count** | Rising without triage: (b) is avoidance |
| **Human interventions outside gates** | Gates are misplaced |
| **Mutation score trend** | Test quality improving, or coverage being gamed |
| **Cost per role** | Whether the quality process is worth what it costs |

The retro **acts**: tighten a prompt, upgrade a role's model, or re-slice.

---

## 12. How this instructs agents

It does not — directly. This is a human artifact carrying rationale, and agents need short,
imperative, role-scoped instructions: one given rules *plus the arguments for them* follows them less
reliably than one given the rules alone, and pays for the tokens on every call.

**Exactly three things are generated** from this file by `tools/agents/generate.mjs`
(`npm run agents:build`, checked in CI): each role's `model:` frontmatter and its Decides / Never
constraints from §2's table, and the committing rule marked in §8. The narrowness is the point, and it
is measured — `generate.mjs`'s header carries the count and the reasoning. This section once claimed
more than any tool did, at a time when there was no tool at all, so its "regenerate" instruction named
a process that did not exist while the files drifted. **A generated block that claims less than it
does is worth more than a header that claims more.**

Everything else machine-facing is hand-maintained and related by citation, not derivation: `CLAUDE.md`
is the human's and normative; `.claude/settings.json` and its hooks are the enforcement §7 and §9
describe; the slice and ADR templates are the work-item and decision contracts.

---

## Glossary

**Slice** vertical unit of work — one branch, one PR, one gate · **DCR** a raised design/reality
mismatch · **Loopback** returning a blocked slice to step 1 after a (c); prior work is revised, never
deleted · **Gate** a point where the human decides and it is recorded · **QS-n** an arc42 §10 quality
scenario, traceable to a test · **Escape distance** steps between where a defect originated and where
it was caught · **Red commit** the single failing-test commit per slice, proving test-first.

*Domain vocabulary is arc42 §12. arc42 used under CC BY-SA.*
