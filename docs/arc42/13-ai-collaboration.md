# 13. AI collaboration

> Owner: scribe · Outside the standard twelve arc42 sections

Sourced from artifacts, never memory: `docs/team-log/events.jsonl` (1,249 lines), the 369-row
register in [`../DEFECTS.md`](../DEFECTS.md), 18 ADRs, 21 PRs, prompts and reports under
`docs/team-log/prompts/`, and git. Project closed: 11 built slices, backlog empty.

## 13.1 Team structure and bounded authority

| Role | Decides | Cannot |
|---|---|---|
| architect | interfaces, layering, data model; scope, AC, quality goals mid-slice (provisional until gate); `docs/arc42/`, `docs/adr/` | rule and edit in one pass; rule on a dispatch it did not log |
| test-engineer | how *done* is asserted; outside-in suites | read `src/`; write `tests/unit/` |
| implementer | `src/`, `tests/unit/` | edit an acceptance test — it raises a DCR |
| reviewer | may block a merge, may raise a DCR | change the design or fix what it finds |
| scribe | this section, `README.md`, §12 | claim anything an artifact does not support |
| orchestrator | routing; sole writer of the event log | decide anything, or mark work done |
| human | overrides anyone, at the gate and by ruling | — |

§5's bound carries the most weight: the test-engineer defines *done* without seeing the
implementation, and the implementer cannot edit the test that judges it. Enforced by path, a
`PreToolUse` hook, and `git commit --only <paths>` — added after a bare commit recorded the
architect committing `src/` (O-10).

## 13.2 Verification — what it caught

The red commit is observed from CI, not asserted. Mutation is an audit, not a target — at slice 02 the reviewer reproduced a
byte-identical survivor set independently; at slice 08 the test-engineer ran its own remedy's
mutant 35 times rather than once and found 8 of 35 trials survived, then refused to raise
`numRuns` or the generator weight to close the gap because "choosing the number that makes its own
test look like a gate is the choice it should not make alone" (`T-08-7`) — the architect took the
fault onto its own specification instead. At slice 09 the implementer
built a live `@fastify/swagger` harness and disproved the architect's own projected 37-of-42 mutant
count — the true mechanism reached 34, not 37, because nobody had run it (`I-09-1`).

**One defect shape recurred and was named**: *a mechanism that reports success over work it never
did.* `depcruise` cruising nothing; Stryker scoring mutants never run; a collector reading one
file's report as the whole slice's (`O-73`); an aggregate mutation score hiding a failing member
(`O-64`); a `loopbacks` field the governor that blocks a third loopback never read (`O-74`). Over twenty-five instances are on the register, several in the project's own tooling. The rule: **for a discrimination claim, name the mutant; for a mechanism
claim, name the call site.**

## 13.3 Where the human overrode the agents

- **ADR-0001** — the architect's recommendation overridden; a third option taken.
- **AC-6, slice 01** — ruled *literally* against the architect's preference, reshaping module
  signatures and booking four items of debt.
- **Slice 08's mutation gate** — the human merged at 71.43% against §10's 0.75, the override of the
  *metric*, not the evidence: every survivor was documentation prose or an unreachable arm, and two
  roles had already refused to force the number green.
- **H-1** — the human, not a tool, audited arc42 and found "service advisor" named about 85 times
  while the brief says only *"a user"* — an invented actor, load-bearing because it put
  authentication out of scope. Ruled: unname the actor everywhere. **ADR-0034 supersedes ADR-0002**
  — this project's first ADR supersession — keeping the argument
  (a stubbed client cannot verify a credential) and dropping the invented role.
- **H-2** — a superseded ADR still read `status: accepted`; the human asked whether it was still
  valid and the file said two different things. Fixed to `superseded`; `STATUS.md`'s accepted count
  fell from 16 to 15 — the tell a withdrawn decision had counted as standing.
- **The ADR retirement** — the human, reading ADR-0032: *"it doesn't seem to be in the level of
  decision that require an ADR."* 33 ADRs → 16, folded into the slice designs that own them; then all 16 were rewritten so every cross-reference became the fact it pointed at.
- **Slice 09's reopening of slice 10** — the architect argued at Gate D's fold-in step 1 that the
  contract seam was *falser* than the cut assumed; at slice 09's review all three BLOCKING findings
  landed on exactly that folded-in half, and it reversed on the evidence, recommending the human
  un-fold it. The human agreed, naming the cost of the alternative: shipping without the
  brief's own named OpenAPI deliverable.

## 13.4 Design changes and the first (c)

Two loopbacks from **(c) design defects** at slices 01 and 02 (`T-01-2`, `T-02-9`), both ruled
against the architect's own design — T-01-2 naming §2.4 directly, T-02-9 on a re-measured deadlock rate. **Slice 09 step 5 produced this project's first
literal `(c)` ruling** (`docs/slices/09-observability.md`): fifteen findings, all agreed —
but two got (c) rather than the softer (a), naming **AC-9** and **QS-11**
(the OpenAPI document declared `application/problem+json` on 0 of 25 responses) and **AC-6** (a
"trace-correlated" claim certified by one log line, because `telemetry.ts` registered no
instrumentations at all) — because §6 requires exactly that naming to block, and both were
nameable. Loopback 1 of 2 spent; a second red commit followed only because of it.

**Slice 10 reproduced the shape it was convened to remove — twice.** First, in design: measuring
rather than reading, the architect found TypeBox collapses a one-member `Type.Union` to a bare
literal and silently *substitutes* a wrong value — §8.5's documented defect, reproduced **inside its
own fix**, reachable through eight narrowed response cells (`I-10-1`/M2). Caught before code existed
by refusing to decide by reading. Second, past the fix: the reviewer re-measured
rather than trusting the new contract test, and found *that very test* could not fail on the
collapse it was written to guard — `fast-json-stringify` passes an `enum` value through rather than
substituting it, so the probe stayed green regardless (`R-10-2`) — caught only by a
reviewer who ran the falsification rather than trusting the guard.

**Dispatches contradicted role definitions by silence, at least four times in one remediation
round**: an ownership table assigned an outside-in half to the implementer alone and the
test-engineer built it anyway (`T-09-5`); a dispatch named the wrong file and omitted
an item it had ruled implementer-owned (`O-72`, two instances); the PR-posting obligation was
missing from three dispatches in one session until the human — not a check — noticed no implementer
comment on PR 21 (`O-76`). Each time, work survived because a role read past its instructions. That
is not a mechanism, and the orchestrator said so on the record.

## 13.5 What the process cost

**Reconstructed from session transcripts, not a billing record.** 236 agent runs across the whole
project; 232 of them (146.7 agent-hours) in the slice loop proper.

| | runs | agent-hours | billable | architect share |
|---|---|---|---|---|
| 00a | 25 | 26.1 h | 23.90 M | 52% |
| 00 | 17 | 30.7 h | 30.53 M | 68% |
| 01–10 | 190 | 89.9 h | 110.37 M | 38% |

**Was the ceremony worth it?** Slice 09 spent four adjudication rounds and fifteen findings on a
seventeen-criterion slice — and every BLOCKING finding sat on the half Gate D had folded in without
review of its own. That is the ceremony finding the seam the cut missed, not spending for
nothing. Architect share fell from 68% at slice 00 to 12% by slice 10, as the work shifted from
adjudication to implementer-run measurement (`I-09-1`, `I-10-1`) — cost moving from decision to
verification. C6's ceiling (10 h / $100 over 13 slices) failed at the
pilot and was never re-met: 146.7 agent-hours in under 5 calendar days, 11 slices. No dollar figure
is computed — METHODOLOGY prices tokens rather than storing a figure, and R-5 found the collector
itself untested until fixed.

## 13.6 What did not work

**§6(b) has no terminal case on a final slice.** `ADR-0035`'s counter semantics were ruled *correct
under the agreed design, a better idea available* — textbook (b) — and (b)'s remedy is a backlog
slice. There was none: slice 09 was last. The ADR exits `proposed` permanently — the rule
assumes a project that keeps running.

**The tooling caught its own author, repeatedly.** The orchestrator built the per-file mutation
check (`O-64`) after an aggregate score hid a failing file, then wrote a false pass under its own
new check when a file-scoped Stryker run overwrote its own report (`O-73`) — caught
by the same orchestrator re-reading its own record. It set `loopbacks: 1` in a slice
file and the governor that blocks a third loopback went on reading zero, because the governor counts
log events, not frontmatter (`O-74`). None were caught by a different role — each was the same one, minutes
later, testing its own new check.

**Gates and governors are only as good as what feeds them**, true past the pilot too:
a criterion can pass on a number that answers a different question (`O-6`, `O-64`,
`O-73`), and a machine-readable field can silently disagree with the human-readable one it mirrors
(`O-74`, and slice 02's `loopbacks: 0` against a log recording one). Two homes for one fact is a
standing risk this project never fully closed.

**A stale fixture outlived its own instruction — and this section's reach.**
`docs/slices/99-availability.md` said *"delete once slice 00 has run"*; slice 00 ran nine slices
ago. The scribe's write guard denies `docs/slices/`, so this is the flag, not the fix.
