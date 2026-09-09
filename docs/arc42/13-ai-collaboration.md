# 13. AI collaboration

> Owner: scribe · Outside the standard twelve arc42 sections · The brief's sixth Part 1 deliverable

Sourced from artifacts, never memory: `docs/team-log/events.jsonl` (1,269 lines, read with
`tools/team-log/query.mjs`), the 374-row register in [`../DEFECTS.md`](../DEFECTS.md), 18 ADR files,
`docs/team-log/phase-4-retro.md`, `docs/slices/`, and git. Project closed: 11 slices done, backlog
empty. The narrative is in [`../../README.md`](../../README.md); this section is the evidence.

## 13.1 From `Requirements.md` to a team

The starting material was one page. Everything else — the team, its rules, its guards — is
constructed, and the log shows the construction rather than a finished org chart.

**Phase 1 produced requirements *and* the ambiguities**, which is the interesting output: the
brief was under-specified and the team's first deliverable was a list of what it could not decide
alone. Gate A ruled four open questions, each ADR recording a `provenance`: **OQ-1** opening hours
as request validation (ADR-0001, `overridden` — the architect's preferred option lost); **OQ-2** a
service advisor actor, no authentication (ADR-0002, `accepted`, later superseded — §13.3); **OQ-3**
both cancellation and rescheduling in scope (ADR-0003, `modified`), *expanding* on the architect's
own recommendation; **OQ-4** retry remaining candidates then refuse (ADR-0004, `accepted`).

**Phase 2 turned constraints into ADRs 0005–0010** — Fastify+TypeBox, Kysely with no ORM,
`node-pg-migrate` over `.sql` files, five layered modules, seeded-shuffle candidates, GitHub Actions
with `check.run` collected via API. Gate B accepted all six unmodified and added three rulings of
its own: `tests/architecture/` and `tests/performance/` move to the test-engineer, on the same
reasoning as the other outside-in directories; slice 00 splits into 00a so the pilot measures the
loop rather than scaffolding friction; TC-10 bites locally via `.npmrc engine-strict=true`.

**Phase 3 produced thirteen slices**, every §10 quality scenario QS-1…QS-14 claimed by the slice
that makes it executable, ordered by what must exist before the invariant is testable rather than by
feature value — Gate C's three named seams (00a/00, 02/04, 06/07) are that rule applied.

The through-line: **the rules and the guards are themselves outputs of the process, not givens.**
CLAUDE.md §5's test-ownership split reached its current form only after Gate B; `.dependency-cruiser.js`
and `.claude/hooks/guard-paths.mjs` exist because something needed them, and both grew mid-project in
response to a finding (§13.3).

## 13.2 The loop as it was run — agreement and disagreement

CLAUDE.md §6 states the risk directly: *"an adjudication round that has never produced a
disagreement is not consensus, it is deference."* The honest question is whether this team
disagreed or deferred, and the log answers it both ways.

**The raw ratio looks like deference.** 374 `finding.raised` against 226 `finding.ruled` and 119
`finding.resolved` — most findings closed as `accepted` (129 of 374 per the register, plus 20
narrowed, 29 deferred, 3 escalated, 3 rejected; 190 of 374 without a final verdict in the register's
own count). Reviewer output is thinner still: 23 `review.finding` against 8 `review.response`.

**Where it did disagree, it is on record.** Six DCRs were raised (test-engineer ×1, implementer ×4,
reviewer ×1), all resolved by the architect, and the outcomes vary rather than cluster: slice 02's
`T-02-9` was ruled **(c) design defect** — a simultaneous loser refused as `500` where the design
called for `40P01`, naming AC-3, AC-4, QS-1, QS-2, and spending the project's first loopback; slice
04's was ruled **(a)**, no loopback, ordering and design both correct; slice 05's reviewer DCR was
ruled **(d)**, landing as ADR-0024; slice 07's `AC-5` DCR was ruled **(a)**. Four loopbacks total —
slices 01, 02, 07, 09 — against a two-per-slice cap, none reaching three.

**Slice 09 is the sharpest case.** Four adjudication rounds, fifteen agreed findings, eight
objections, **one logged DISAGREE** (`I-09-4`) ruled **(b)** — correct under the agreed design, the
better idea booked as ADR-0035 rather than conceded — and two findings ruled **(c)** in one round:
AC-9 and QS-11 against a document declaring `application/problem+json` on zero of 25 responses, and
AC-6 against a "trace-correlated" claim resting on one log line inside an uninstrumented span.

**The vote mechanism was never exercised.** §6 lets the architect "call a vote" — a third role
adjudicating a deadlock. Added at commit `084a34b` (2026-09-04); no finding, DCR or slice record in
this project ever invokes it. The one place it was live for the taking, a reviewer conceded outright
instead: *"NO VOTE REQUESTED"* (slice 08 `review.response`). The honest read is mixed: disagreement
is real where it happened, but the mechanism built for the hardest case sat unused — the team never
reached a genuine three-way deadlock, not that the mechanism failed.

## 13.3 Self-correction

**Decisions are superseded, never rewritten.** 17 `adr.retired` events against 23 `adr.recorded`,
holding CLAUDE.md §4's rule that "an ADR's decision is immutable; its prose is not." Clearest
instance: ADR-0034 supersedes ADR-0002, dropping the invented "service advisor" role the human found
named roughly 85 times in arc42 while the brief says only "a user" (`H-1`, §13.4) — ADR-0002 keeps
its filename and status; only `superseded_by` changes.

**The constitution corrected itself after a §2 breach.** At slice 00a, `S-1` — self-raised by the
architect — found the design had worked around §2.4 (test-first, observed in CI) and substituted
four other evidence items for the missing red-in-CI proof; green either way, so no AC or QS could
name it. Ruled **(c)** on §2's own authority. CLAUDE.md §6 was then amended (`ae26cf5`, 2026-09-04)
to let a **(c)** ruling name a standing invariant, not only an AC or QS — the clause now reading *"a
design once worked around §2.4 and substituted an evidence chain for it... the gravest defect was
the one the rule could not reach."*

**The adjudication rule exists because ruling and amending in one pass favours agreement.** Step 2's
first real use produced five objections under a single prompt asking the architect to both rule and
redraft; commit `084a34b` (same day) split "reply" from "edit" and made it NON-NEGOTIABLE — added
mid-project, in direct response, not designed in advance.

**The word-budget ratchet caught its own author.** `tools/docs/budget.mjs`'s own comment records
`02-design.md` falling 13,566 → 1,200 words while the stored ceiling still read 13,566 — "it could
have grown back twelvefold with the check green the whole way. Found by the architect immediately
after making it." The ratchet now tightens on every reduction.

**The retro changed its own thresholds rather than the results.** `phase-4-retro.md` scored eight
criteria; two failed (C5 gates-in-the-right-place, C6 time budget) and both were kept rather than
argued away — *"a threshold turning out to be wrong is changed for future slices, and the pilot is
still recorded as having failed it."*

**A recurring defect shape was named and turned into a rule.** The same shape recurs across the
register — depcruise cruising nothing, Stryker scoring unrun mutants, a collector reading one file
as the whole slice's — producing: *"for a discrimination claim, name the mutant; for a mechanism
claim, name the call site."*

## 13.4 Results

**11 of 13 planned slices shipped** (00a, 00, 01, 02, 04, 05, 06, 07, 08, 09, 10); three are
tombstoned, not outstanding — slice 11 folded into 09's observability work, 12 and 13 folded into
02's domain layer, each kept in `docs/slices/` "because the backlog's shape is part of the record."
Backlog is empty at close.

**18 ADR files stand**: 15 `accepted`, 1 `superseded` (0002 → 0034), 2 `proposed` with no receiving
slice — ADR-0016 and ADR-0035, the deferred-improvement rule's uncovered case: rule (b) books a
backlog slice as remedy, and a **(b)** ruling on the last slice has none to book. 17 of a peak 33
ADRs were retired at a 2026-09-08 human ruling — *"it doesn't seem to be in the level of decision
that requires an ADR"* — folded into the slice designs that own them.

**829 tests across 59 files, all passing**, pinned to commit `c91eb5a` (`docs/TEST-REPORT.md`).
**Mutation: 92.00% aggregate (1,392 of 1,513 killed, 26 files); every mutated file now clears the
0.75 per-file gate**, including `src/http/problem.ts`, which missed by seven-tenths of a point at
slice 10 and was fixed rather than argued down — the one prior exception, slice 08's 71.43% merge,
is a recorded human override on the metric, not the evidence. `npm run lint:arch`: clean, 130
modules cruised, every root covered, zero violations.

**The defect register closes at 374 findings**: 14 blocking, 181 major, 179 minor; verdicts 20
narrowed, 129 accepted, 29 deferred, 3 escalated, 3 rejected, 190 without a final verdict recorded in
the register itself. Raised by architect 80, test-engineer 75, orchestrator 75, reviewer 66,
implementer 61, scribe 12, human 5. Mean escape distance 1.46 steps.

**Cost, reconstructed from the log's own token counts, not billed.** 247 `agent.finish` runs — 4 in
phases 1–2, 42 in the 00a/00 pilot (architect 10/25, 9/17), 201 across slices 01–10 (architect 86 of
201, 43%). 4.52M output tokens, 173.4M cache-write tokens. Agent-hours are not reported: summing
`duration_ms` overstates, since 24 of the pilot's 42 runs carry `duration_caveat: agent was resumed`
— an unmeasured idle gap (`phase-4-retro.md`); the token collector behind any dollar figure is itself
untested (`R-5`).

**What is not finished.** ADR-0016 and ADR-0035 remain `proposed` with no slice to build them.
`R-4` (an absolute path bypasses the Bash write guard) and `O-9`/`O-10` (`guard-paths.mjs` cannot see
`tests/integration/` writes or `git` operations) are open in the register — `O-10`'s remedy landed as
`git commit --only`; the other two have not. The `R-5` token accumulator stays unverified.
