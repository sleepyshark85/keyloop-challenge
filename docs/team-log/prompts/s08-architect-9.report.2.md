# Report · slice 08 · architect · invocation 9

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Rewrite 16 ADRs for readability
- Returned: 2026-09-07T12:36:58.642Z
- Duration: 3442s

---

Both smaller items are settled. The main one is blocked, and I stopped rather than force it.

## ADR-0016 — `PgOutcome` restored, done

Committed `d6166d1`. You were right and I was wrong: the name of the type a decision creates is part of the decision, and it is the token a reader searches for. It is back in Option D's label, in Option D's partial-adoption clause, and in the first row of the `tsc` table (*"a use case refusing from a `PgOutcome`"*, as before). The Decision gains one clause saying where the brand is minted — on the `PgOutcome` the SQLSTATE classifier returns, and nowhere else — which is the constraint the deleted code block carried, in a form that cannot go stale the way the block did.

**1017 → 1026 words**, against a contested ceiling of 1200.

## ADR-0010 — left exactly as it was

No change.

## ADR-0018 — the honest cut is not available, by 50 words

I measured it rather than judged it.

**The argument costs 66 words** in the tightest complete form I can write. All three reasons, no SQL:

> Each attempt is its own transaction and takes both locks before its write. **They cannot deadlock against each other by construction**: bay and technician keys sit in **different lock classes**, so they never collide; *bay then technician* is a **total order no attempt can reverse**, so there is no sort to keep sorted; and both are **transaction-scoped**, released when the attempt ends, never held across candidates.

**The honest cut is 16 words.** I ran a full wording pass on a scratch copy — eight substitutions, every one pure phrasing: *"Most of them got"* → *"Most got"*, *"The system's branded"* → *"The branded"*, *"measured rather than asserted"* → *"measured not asserted"*, *"Recorded as debt"* → *"Debt"*, and four of that kind. Measured with `tools/docs/budget.mjs`'s own `countWords`:

| | words |
|---|---|
| committed today | 849 |
| after every honest wording trim | **833** |
| trims + the restored argument | **899** |
| ceiling | 849 |

**Nothing else in the file is wording.** What remains is three measurement tables (400 inserts across 20 trials, five retry configurations, the two controls), the 56-race summary with its two latency numbers, eight options with their verdicts, and seven consequences. Cutting into any of those is cutting the argument to fit the ceiling, which is what you told me not to do. I could restore the total-order clause alone in 18 words and drop the other two reasons, but two thirds of an argument that *looks* complete is worse than the gap — a reader would take it as the whole case.

So the file is unchanged and the finding is yours to rule on.

**The finding, and the one lawful remedy I can see.** 0018's ceiling is 849 only because that is what it happened to weigh before this pass; its base budget is 700. The escape the tool itself offers is `contested: true`, which moves an ADR from 700 to 1200 — and 0018 meets that bar better than either record that currently claims it. ADR-0016's own frontmatter states the criterion it used: *"`contested: true` because the decision turns on two measurements this record is the only home for."* 0016 has one measurement table and sits at 1026 of 1200. ADR-0024 has one quoted pair and sits at 1039 of 1200. **0018 has three tables, a 56-race summary, a DCR that inverted the architect's own first draft, and is the most-cited record in the log — and it is not flagged.** That looks like an accident of which records were written after the flag existed, not a judgement about which decisions are contested.

I have not taken it. You said pay by cutting, not by raising, and declaring `contested` is raising. But if the ruling is that a record resting on three measurements is contested by definition, then the flag plus the 16 words of trim leaves 0018 at 899 against 1200, the argument goes back in full, and the ceiling stops being the thing that decides what a decision record may argue. Say the word and it is one commit.

## Checks

`docs:refs`, `docs:adr-check`, `docs:check` and `docs:budget:check` are all green.

**`test:tools` is red, for a reason outside my change and outside my authority.** It fails at `defects:check`: *"docs/DEFECTS.md is stale — run `npm run defects`."* While I was working, the orchestrator appended two lines to `/home/agentadmin/sources/keyloop-challenge/docs/team-log/events.jsonl` — an `agent.finish` and `finding.raised` `O-67`, which is my report's point about the stale sample-file line being logged. `DEFECTS.md` is generated from that log, so the append made it stale. Both files belong to the orchestrator; `guard-paths` blocked me from even touching the log to test the theory, which is the guard working. `npm run defects`, run by the orchestrator, clears it. Nothing in the sixteen ADRs is implicated: `defects:check` was green on every run before that append.

Branch is at `d6166d1`, pushed, no PR opened.
