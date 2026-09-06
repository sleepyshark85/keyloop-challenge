# Report · slice 02 · architect · invocation 12

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Pay down the concision debt
- Returned: 2026-09-06T02:59:47.705Z
- Duration: 1049s

---

Done. Committed as `c854bab` on `main`.

## Before / after

| File | Before | After | Budget |
|---|---|---|---|
| `/home/agentadmin/sources/keyloop-challenge/docs/slices/02-design.md` | 13,566 | **1,200** | 1,200 ✅ |
| `/home/agentadmin/sources/keyloop-challenge/docs/adr/0016-a-capacity-refusal-requires-a-database-verdict.md` | 1,709 | **1,001** | 1,200 (contested) ✅ |
| `/home/agentadmin/sources/keyloop-challenge/docs/adr/0017-the-composite-ownership-fk-is-disambiguated-after-it-fires.md` | 1,984 | **1,200** | 1,200 (contested) ✅ |
| `/home/agentadmin/sources/keyloop-challenge/docs/adr/0018-lock-the-bay-and-the-technician-before-each-insert.md` | 913 | **849** | 700 ⚠️ refused |

Corpus 65,643 → 51,815; over-budget count 14 → 11; words-to-cut 18,607 → 3,884. `docs:budget:check`, `docs:refs`, `docs:adr-check`, `lint:arch`, `test:tools`, `npm test` all green.

## What I cut, and where it already lives

**02-design** kept: the decision table with each decision's arc42 home; the full ruling ledger (17 rows, each with verdict *and* ruler); the loopback ledger; every `DA-`/`OQ-`/`F-` definition; the ADR list. Cut: §2's module-by-module specification (arc42 §5.2), §2.6's booking trace and lock discipline (§6.1), §2.7's status map and taxonomy arguments (§8.5, §8.6), §4's whole check-then-act argument (ADR-0016, ADR-0018, §11), §5.1–5.3 (ADR-0017), §6's mutant table (merged and green), §8's measurement table (the four records that use them), §10's proposed arc42 edits (step 7 made them), and §12–13's deliberation (event log, PR #12).

**§13 check, as asked.** Nothing in it was sole-source: R-02-2 and R-02-3 are carried in full by ADR-0019 including the four-cell matrix; the AC-6 correction is in arc42 §8.5; the `openingHours.ts:256` equivalent-by-implication survivor is in the mutation record. The compression obligation itself is restated in the new header so it reads as discharged rather than dropped.

## What I refused to cut

- **ADR-0018 at 849, not 700.** Enumerated: Context 137 (the `40P01` mechanism, 285 of 400 losers, why a `409` is unconstructible) · Considered options 322 (eight options plus five measured livelocking retry configurations) · Decision 114 · the two drop-one controls 127 (the matrix ADR-0019 cites, 56 races, the 0.4 ms uncontended cost) · Consequences 149 (F-02-9's inherited obligation, and the admission that ADR-0016's argument is weaker after this). Reaching 700 deletes one of those, and each is a measured number or an obligation another document cites. It shrank, so the ratchet passes. **The escape hatch is yours to grant; I did not take it here.**
- **F-02-1 in `02-design` §3** — which constraint PostgreSQL names under a double violation is index creation order. Routed to arc42 §11 R-3 at step 7 and never landed; this is its only home.
- **The `pg` column mappings** — `time` arrives as a verbatim string and `'24:00:00'` round-trips, which is what makes AC-19 reachable with real reference data. Not in arc42 §8.3.
- **DA-02-1** (application-minted id, reused across retries) — nowhere in arc42.

## `contested: true`, two uses

ADR-0016 and ADR-0017 only, each justified in its own frontmatter, not just the commit message. 0016 is the sole home of the two measurements the decision turns on (the planted mutant failing `TS2322`, and the same mutant with a cast compiling clean) and the claim was narrowed to fit them. 0017 is the sole home of the five inserts and of `23P01` beating `23503`, which is what forces AC-9's and AC-10's fixtures to be uncontended. `budget.mjs`'s own header names 0013, 0016 and 0017 as the shape the hatch exists for.

## One meaning change, declared

ADR-0017 said `classifyOwnership` is **three** `EXISTS`. It is two — the third asked what the composite FK had just answered, so its only reachable value was `false`. Ruled at step 4, as-built in arc42 §5.2. The ADR is `status: proposed`, and reproducing a known-false count while condensing seemed worse than correcting it. Stated in the text, not smuggled. Say the word and I'll revert it.

## Three things for you, none of them mine to fix

1. **arc42 §8.3 is stale.** Line 300 still says ADR-0015 is *"Accepted, and not yet written; §11.1 carries it as agreed and unbuilt"*. It shipped in slice 02 (AC-17–19, `06d5894`/`278f198`). Step 7's declared scope was `["§5.2","§6.1","§8.6","§10.2"]`, so §8.3 was never corrected.
2. **arc42 §11 reuses `R-02-2`.** Under *The cost of ADR-0018's locks* it labels the weakened-ADR-0016 argument `R-02-2` — but `R-02-2` is the reviewer's finding *"the lock-drop control is not in the suite"*, which ADR-0019 adjudicates. Two different things, one id; a reader following the citation from ADR-0019 lands on the wrong row.
3. **The ratchet's ceiling is now far above these files.** `tools/docs/budget-baseline.json` still records 13,566 for `02-design`, so it could grow all the way back without `docs:budget:check` noticing. A `--rebaseline` would lock in today's reduction, but `tools/` is not mine.
