# 13. AI collaboration

> Owner: scribe · Outside the standard twelve arc42 sections · The brief's sixth Part 1 deliverable

Sourced from artifacts, never memory: `docs/team-log/events.jsonl` (1,249 lines), the 369-row register
in [`../DEFECTS.md`](../DEFECTS.md), 18 ADRs, 21 PRs, the prompts and reports under
`docs/team-log/prompts/`, and git. Project closed: 11 slices, backlog empty. The narrative is in
[`../../README.md`](../../README.md); this section is the evidence.

## 13.1 Team structure and bounded authority

| Role | Decides | Cannot |
|---|---|---|
| architect | interfaces, layering, data model; scope, AC and quality goals mid-slice (provisional until the gate); `docs/arc42/`, `docs/adr/` | rule and edit in one pass |
| test-engineer | how *done* is asserted; the outside-in suites | read `src/`; write `tests/unit/` |
| implementer | `src/`, `tests/unit/` | edit an acceptance test — it raises a design change request |
| reviewer | may block a merge, may raise a design change request | change the design or fix what it finds |
| scribe | this section, `README.md`, §12 | claim anything an artifact does not support |
| orchestrator | routing; sole writer of the event log | decide anything, or mark work done |
| human | overrides anyone, at the gate and by ruling | — |

The test-ownership bound carries the most weight — **the test-engineer defines *done* without seeing the
implementation, and the implementer cannot edit the test that judges it** — and is enforced by path, by
a `PreToolUse` hook and by `git commit --only <paths>`.

## 13.2 Verification — what it caught

The red commit is observed from CI, not asserted, and mutation is an audit rather than a target. At
slice 08 the test-engineer ran its own remedy's mutant 35 times rather than once, found 8 of 35 trials
survived, and then **refused to raise the run count or the generator weight to close the gap** —
*"choosing the number that makes its own test look like a gate is the choice it should not make
alone"* — so the architect took the fault onto its own specification instead. At slice 09 the
implementer built a live `@fastify/swagger` harness and disproved the architect's own projected mutant
count, because nobody had run it.

**One defect shape recurred and was named**: *a mechanism that reports success over work it never did.*
`depcruise` cruising nothing; Stryker scoring mutants never run; a collector reading one file's report
as the whole slice's; an aggregate mutation score hiding a failing member; a `loopbacks` field the
governor never read. Over twenty-five instances are on the register, several in the project's own
tooling. The rule that came out of it: **for a discrimination claim, name the mutant; for a mechanism
claim, name the call site.**

## 13.3 Where the human overrode the agents

- **ADR-0001** — the architect's recommendation overridden; a third option taken.
- **AC-6, slice 01** — ruled *literally* against the architect's preference, reshaping module signatures
  and booking four items of debt (§11.1 D-01-1 to D-01-4).
- **Slice 08's mutation gate** — merged at 71.43 % against the 0.75 bar: an override of the *metric*,
  not the evidence. Every survivor was documentation prose or an unreachable arm, and two roles had
  already refused to force the number green.
- **H-1** — the human, not a tool, audited arc42 and found *"service advisor"* named about 85 times
  while the brief says only *"a user"*: an invented actor, load-bearing because it put authentication
  out of scope. Ruled: unname the actor everywhere. **ADR-0034 supersedes ADR-0002**, this project's
  first supersession, keeping the argument — a stubbed client cannot verify a credential — and dropping
  the invented role.
- **H-2** — a superseded ADR still read `status: accepted`; the accepted count fell from 16 to 15, the
  tell that a withdrawn decision had counted as standing.
- **The ADR retirement** — the human, reading ADR-0032: *"it doesn't seem to be in the level of decision
  that require an ADR."* 33 ADRs → 16, folded into the slice designs that own them.
- **Slice 09's reopening of slice 10** — all three blocking findings landed on a half an earlier gate
  had folded in without review; the human agreed to reopen rather than ship without the brief's own
  named OpenAPI deliverable.

## 13.4 Design changes and the first design defect

Two loopbacks from **design defects** at slices 01 and 02, both ruled against the architect's own
design. **Slice 09 produced the first literal design-defect ruling**: of fifteen agreed findings, two
were defects rather than clarifications because two acceptance criteria and a quality scenario were
nameable — the OpenAPI document declared `application/problem+json` on 0 of 25 responses, and a
"trace-correlated" claim rested on one log line, the telemetry bootstrap having registered no
instrumentations at all. **Slice 10 then reproduced the shape it was convened to remove, twice**: the
architect found by measuring that TypeBox collapses a one-member `Type.Union` and silently substitutes a
wrong value, §8.5's own documented defect inside its own fix, and the reviewer later found the new
contract test could not fail on the collapse it guarded.

## 13.5 What the process cost

**Reconstructed from session transcripts, not a billing record.** 236 agent runs across the project;
232 of them (146.7 agent-hours) in the slice loop proper.

| | runs | agent-hours | billable tokens | architect share |
|---|---|---|---|---|
| 00a | 25 | 26.1 h | 23.90 M | 52 % |
| 00 | 17 | 30.7 h | 30.53 M | 68 % |
| 01–10 | 190 | 89.9 h | 110.37 M | 38 % |

**Was the ceremony worth it?** Slice 09 spent four adjudication rounds and fifteen findings on a
seventeen-criterion slice, and every blocking finding sat on a half an earlier gate had folded in
without review. Architect share fell from 68 % at slice 00 to 12 % by slice 10 as the work shifted from
adjudication to implementer-run measurement: cost moving from decision to verification.

## 13.6 What did not work

**The deferred-improvement rule has no terminal case on a final slice.** ADR-0035 was ruled correct
under the agreed design with a better idea available, and that outcome's remedy is a backlog slice.
There was none, so the ADR exits `proposed` permanently.

**The tooling caught its own author, repeatedly.** The orchestrator built a per-file mutation check
after an aggregate score hid a failing file, then wrote a false pass under that new check when a
file-scoped Stryker run overwrote its own report; it set `loopbacks: 1` in a slice file while the
governor that blocks a third loopback read zero, counting log events rather than frontmatter. Each was
caught by the same role minutes later, never by a different one. **Gates and governors are only as good
as what feeds them**, and two homes for one fact is a risk this project never closed.
