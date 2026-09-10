# Report · phase 6 · architect · invocation 5

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Amend ADR-0036 option set
- Returned: 2026-09-09T10:09:57.696Z
- Duration: 620s

---

The amendment is in the working tree, uncommitted, at exactly 700/700 words with all four checks green.

## Final option list, one line of rejection each

| | Option | Rejected because |
|---|---|---|
| **A** | Check-then-act as the brief words it (now absorbing the old **D**, an overlap trigger) | Every variant keeps the shape — shorter window, re-check, version column, or a trigger that merely moves the read inside the database where two concurrent triggers both see "free"; each fails under some interleaving or is B in disguise |
| **B** | Per-dealership advisory lock, or `SERIALIZABLE` | Honestly correct, but correctness becomes a *discipline* every present and future write path must remember, and nothing fails when one forgets until two cars arrive for the same ramp (ADR-0004 Option D) |
| **F** | **Slot materialisation** (new) | The grid: a 50-minute service on a 15-minute grid wastes ten minutes of a bay every time, A-1's durations become multiples of the slot, and claiming N rows is all-or-nothing — restoring the partial-failure handling one `INSERT` removes. TC-3 already commits to PostgreSQL, where E gives arbitrary starts and exact durations free |
| **G** | **External coordination** (new, grouped: Redlock, single-writer log, Temporal, CRDTs, Spanner) | Each moves correctness out of the data and back into code, so a `psql` session or a second writer double-books anyway. Individually: Redlock lies after a pause; the log costs the synchronous `201`; Temporal solves sagas; CRDTs have no merge for mutual exclusion; Spanner expresses overlap in code anyway, at greater cost |
| **E** | PostgreSQL exclusion constraints | **Chosen** — unchanged |

The old **C** (`UNIQUE` index) is gone as an option and lives as a clause inside F's *Good* cell — F is the only construction that makes a `UNIQUE` index apply at all, so that is where a reader asking "why not just a unique constraint?" now finds the equivalence-relation answer. The old **D** is a clause in A. Letters were not reused; the table reads A, B, F, G, E.

## The `ai-input` text I added

Paragraph 3 changed by four words only — "C and D are rejected here on reasoning" became "the rest are rejected here on reasoning", since C and D no longer exist as letters. The original "RECONSTRUCTED, not minuted" admission is intact. Then a new paragraph:

> A SECOND WEAKNESS, and it is the reason this paragraph exists: THE OPTION SET WAS AMENDED AFTER DRAFTING, hours later, on the human's instruction of the same day. F (slot materialisation) and G (external coordination — Redlock, a single-writer log, Temporal, CRDTs, Spanner, grouped because one ground rejects them all) were ADDED because the first draft never weighed them. Neither was recalled: both are REASONED HERE, by the agent, after the fact, so they are weaker evidence than A, B and E and should be read that way. The same instruction permitted deleting options judged trivial, and TWO WERE DELETED to pay for the additions inside a 700-word budget: the old C (a `UNIQUE` index) survives as a clause in F, which is the only construction that makes a `UNIQUE` index apply at all, and the old D (an overlap trigger) survives as a clause in A, whose defect it shares. No rejection ground was dropped, but two options stopped being options, which is exactly what `docs:adr-check` exists to catch — it did catch both, and the baseline was re-pinned with `--pin` so the growth and the two deletions appear in a diff instead of in silence. Letters were not reused, so the table now reads A, B, F, G, E: an option set that both grows and shrinks after the fact can make a deliberation look more thorough than it was, and a renumbering would have hidden the shrinking half from the guard.
>
> The Decision, its verdict and its consequences did not move. One cross-reference in the Decision's last sentence was corrected to name the options that now exist.

That last sentence covers the only edit inside Decision: "what A, B and D each fail to be" → "what A, B and G each fail to be". Consequences is byte-identical.

## Word arithmetic

| Section | Before | After |
|---|---|---|
| Context | 139 | 98 |
| Considered options | 229 | 305 |
| Decision | 104 | 104 |
| Consequences | 193 | 193 |
| **Total** | **665** | **700** (budget 700) |

Rows now: A 51, B 52, F 106, G 83, E 6. Frontmatter is not charged, so the provenance paragraph was free.

What paid for +76 words of options: 41 from Context (the race narration compressed, the brief quote kept verbatim), and 35 of headroom. Inside the table, A fell 62→51 while *gaining* the trigger clause, B 70→52, and C (55) and D (55) were deleted outright — about 110 words recovered from the five original options, all of it spent on F and G. I attempted the seven-option version first: it came to 924, then 887, then 798, then 753 across four compression passes. It does not fit at 700 with F and G at any weight worth having, which is what turned the coordinator's relaxation into the actual mechanism.

What I judged not worth its words, and you should know I cut it: G's per-mechanism clauses are one sentence each rather than the fuller treatment you specified — Temporal's "genuinely useful later if booking grows to span payment or parts, and orthogonal to this decision" is reduced to "Temporal solves sagas", and CRDTs' "any convergence rule still picks a loser, just later and in front of the customer" is reduced to "CRDTs have no merge for mutual exclusion". The disqualifying ground survives for all five; the colour does not.

## Should you look again rather than take a rejection on trust

**Yes, for F — and only F.** Not because the rejection is wrong, but because its load-bearing premise is a constraint rather than an argument: TC-3 commits to PostgreSQL, and everything F offers that E does not (portability off PostgreSQL, no `btree_gist`, a `23505` any database raises) is worth nothing while TC-3 holds and worth a great deal the day it does not. The record now says that plainly, which means F is the one option in this ADR that a change of constraint would reopen. The grid cost is real and is the honest reason to prefer E even without TC-3 — but it is a product decision (does this dealership book on a grid?) dressed as a technical one, and it is the sort of thing the brief's A-1 per-service-type durations settle only by assumption.

A, B and G I would take on trust. B's rejection is the modifiability argument this whole system is built on, and G's is the ADR's central claim restated — if you disagree with either, the disagreement is with the decision, not with the record of it.

**Files:** `/home/agentadmin/sources/keyloop-challenge/docs/adr/0036-overlap-is-unrepresentable-the-database-adjudicates.md` and `/home/agentadmin/sources/keyloop-challenge/tools/docs/adr-baseline.json` (4 lines changed by `--pin`; `--rebaseline` not run). Nothing committed. `docs:adr-check` before re-pinning reported exactly the two deletions — `options-dropped: Option C … · Option D …` — which is the evidence that the guard caught the shrinking half.

```json
{
  "role": "architect",
  "outcome": "designed",
  "arc42_sections_touched": [],
  "adrs": [{"id": "0036", "status": "accepted", "supersedes": null}],
  "quality_scenarios": [],
  "assumptions": ["F's rejection holds only while TC-3 commits the system to PostgreSQL"],
  "open_questions": ["Whether A-1's per-service-type durations are a product commitment to arbitrary durations or an unexamined default — F is only rejected if they are the former"],
  "dcr_ruling": null,
  "message": "ADR-0036's option set amended on the human's instruction: slot materialisation and grouped external coordination added at full weight, the UNIQUE index and overlap trigger deleted as options and folded into F and A to pay for them within 700 words. The decision, verdict and consequences are untouched; ai-input records the growth, the two deletions and that both additions were reasoned rather than deliberated. Re-pinned with --pin; all four checks green."
}
```
