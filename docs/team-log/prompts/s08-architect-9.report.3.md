# Report · slice 08 · architect · invocation 9

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Rewrite 16 ADRs for readability
- Returned: 2026-09-07T12:39:54.394Z
- Duration: 3618s

---

Done. Branch `chore/adr-readability` at `7156927`, nine commits, pushed. No PR opened.

## ADR-0018 — final

**899 words**, against a contested ceiling of 1200. It went in at 849 on a 700 base budget.

Three parts, as ruled:

**The argument, restored at 66 words** — the argument, not the SQL. It sits in the Decision immediately under `Chosen option: **H.**`, where the base case belongs:

> Each attempt is its own transaction and takes both locks before its write. **They cannot deadlock against each other by construction**: bay and technician keys sit in **different lock classes**, so they never collide; *bay then technician* is a **total order no attempt can reverse**, so there is no sort to keep sorted; and both are **transaction-scoped**, released when the attempt ends, never held across candidates.

It also repairs a dangling *"then"*: the next paragraph opens *"A deadlock can **then** only mean some write path did not take these locks"*, which since the sample cut has had no antecedent to refer back to.

**The classification, stated so it can be falsified.** The frontmatter names what earns it rather than what it buys:

> `contested: true` on the criterion ADR-0016 states — the decision turns on measurements this record is the only home for. Four of them: 400 inserts across 20 trials, five retry configurations, the two lock-versus-constraint controls, and 56 locked races. Flagged 2026-09-07, during the readability pass rather than at the ruling; the flag postdates the record, which is the whole reason it was missing. Not claimed because the file needed room.

**The 16 words of trim, taken.** So the flag pays for the argument and not for prose: *"Most of them got"* → *"Most got"*, *"The system's branded"* → *"The branded"*, *"measured rather than asserted"* → *"measured not asserted"*, *"Recorded as debt"* → *"Debt"*, and four more of that kind. Every option, verdict, number, table and consequence is untouched.

**One thing I noticed and deliberately left alone.** The `ai-input` block closes with the implementer's `A-04-1`, which *"checked the deadlock-freedom argument against the code and found it holds for three independent reasons where this record gives one."* The record now gives three. I have not read `A-04-1`, so I cannot claim they are the same three, and provenance is out of bounds either way — but if they are, that line stopped being a criticism today and it would be worth someone confirming.

## Full branch state

| ADR | words | reference uses |
|---|---|---|
| 0001–0007, 0019, 0025 | at or below their pre-rewrite size | 0 |
| 0008 | 970 (ceiling) | 0 |
| 0009 | 699 | 0 |
| 0010 | 1652 (ceiling) | 0 |
| 0016 | 1001 → **1026** (contested, 1200) | 0 |
| 0018 | 849 → **899** (contested, 1200) | 0 |
| 0024 | 974 → **1039** (contested, 1200) | 0 |
| 0030 | 700 | 0 |

**190 cross-reference uses across the sixteen bodies, down to zero.** Frontmatter — `arc42:`, `proposed-by`, `decided-by`, `ai-input` — untouched throughout, so the counts exclude it.

`docs:refs`, `docs:adr-check`, `docs:check` and `docs:budget:check` green; `test:tools` **21 passed, 0 failed** now that your `npm run defects` has landed. `DEFECTS.md`, `STATUS.md` and `events.jsonl` are modified in the working tree and are yours — every commit on this branch used an explicit pathspec, so none of them was picked up.
