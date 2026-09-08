# Report · slice 10 · architect · invocation 4

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Rewrite the slice docs for readability
- Returned: 2026-09-08T15:51:44.976Z
- Duration: 3214s

---

Done and pushed to `main` (`e143432..c91eb5a`, ten commits).

## Words and reference-uses, per file

`before → after`. "Refs" counts every `§n`, `ADR-nnnn`, `AC-n`, `QS-n` and finding/debt id.

| File | Words | Refs |
|---|---|---|
| `09-observability.md` | 1537 → 1469 | **111 → 63** |
| `02-design.md` | 1198 → 1200 | 92 → 75 |
| `08-design.md` | 1351 → 1345 | 83 → 80 |
| `09-design.md` | 1182 → 1197 | 83 → 80 |
| `05-design.md` | 1200 → 1200 | 79 → 72 |
| `00-design.md` | 1200 → 1200 | **74 → 47** |
| `10-openapi-and-curl-harness.md` | 1229 → 1203 | **74 → 44** |
| `06-reschedule-atomic-move.md` | 1244 → 1094 | **72 → 34** |
| `06-design.md` | 1199 → 1200 | 68 → 63 |
| `07-design.md` | 1385 → 1385 | 67 → 60 |
| `02-book-and-read-an-appointment.md` | 1272 → 1333 | 66 → 49 |
| `04-design.md` | 1200 → 1200 | 65 → 56 |
| `08-availability-query.md` | 1366 → 1323 | **61 → 25** |
| `05-cancellation.md` | 994 → 858 | **60 → 26** |
| `01-design.md` | 1198 → 1200 | 56 → 38 |
| `07-reschedule-under-contention.md` | 1304 → 1260 | 56 → 34 |
| `10-design.md` | 1193 → 1192 | 55 → 53 |
| `04-candidate-allocation-and-retry.md` | 995 → 1016 | **45 → 18** |
| `00a-design.md` | 1211 → 1222 | **37 → 14** |
| `00-schema-and-exclusion-constraints.md` | 787 → 704 | 34 → 18 |
| `01-domain-policy-core.md` | 552 → 466 | 25 → 15 |
| `00a-walking-skeleton.md` | 467 → 467 | 23 → 16 |
| `12-domain-input-bounds.md` | 407 → 380 | 12 → 3 |
| `03-error-taxonomy.md` | 270 → 263 | 6 → 2 |
| `13-interval-…-midnight.md` | 408 → 405 | 6 → 3 |
| `11-performance-budget.md` | 256 → 247 | 5 → 3 |
| `_template.md` | 130 → 172 | 4 → 4 |
| **TOTAL** | **26 735 → 26 201** | **1 419 → 995** |

**5.3 → 3.8 identifiers per 100 words.** By kind: `§n` 418→283, `ADR-nnnn` 118→60, finding/debt ids 366→262, bare `O-nn`/`R-nn` 79→33, `QS-n` 123→93, `AC-n` 310→260.

Verification: `docs:refs` (100 citations, all resolve), `docs:check`, `docs:budget:check --ratchet`, `docs:adr-check`, `defects:check`, `npm run test:tools` (exit 0), and `slice:check --ready` PASS on all eleven live slices with criterion counts unchanged (10, 6, 6, 19, 5, 5, 5, 5, 6, 14, 7). The only `FAIL` anywhere is `tests green` on slices 09 and 10 — a stale CI record, present before I started and untouched by docs.

## What I could not neutralise

- **~100 definition labels in the designs.** `docs:refs` forbids deleting a definition while arc42, an ADR or the append-only log cites it — and the log can never be repaired. So `D-09-1`, `OQ-05-2`, `A-06-4` and their kin survive as bullet and table-row labels. Treatment: the label stays, and the fact follows it immediately rather than the reader having to fetch it.
- **`slice:check`'s inherited-scope rule.** Every bullet under `## Inherited scope` must name a ref the log knows, or carry `(no ref — reason)`. Slices 06–10 therefore keep 4–6 refs by construction.
- **`AC-n` and `(QS-n)` tags.** These are the criterion numbering `slice:check` counts and the §10 traceability link the methodology requires. Dropping them would delete traceability, not reference load.
- **The designs' "where it lives now" tables** are pointer tables *by design* — after step 7 that is their entire content. Restating the arc42 section inline is the cross-artifact duplication the budget exists to prevent.
- One structural detour: slice 06's `## Inherited scope` preamble had to move into the heading, because `slice:check` treats any prose before the first bullet as a bullet and demands a ref in it.

## What the rewrite revealed

**1. The most useful rule of the pass came out of the budget, not the prose.** Every design file sat at exactly its 1,200-word ceiling, so each clarification had to be paid for. My first pass glossed *everything* — `globalSetup, one container per run, no withReuse()` became readable English and cost 130 words in `00a-design.md` alone — and the files came out both longer and vaguer. The distinction that fixed it: **a SQLSTATE, a constraint name, a symbol, a rendered `pg_get_constraintdef` literal is a fact, and is shorter and more precise than any paraphrase; a section number or a finding id is a pointer, and should become the fact it points at.** Restoring `23503` where I had written "a foreign-key violation" made the text shorter *and* better. That rule is worth carrying into the next pass over any document here.

**2. A claim that only held because a reference was doing the work — slice 00's AC-10.** The criterion read *"Given confirmed appointments A and B on the same bay…"* and then carried a trailing italic clarification recording that the original wording (`the same bay and technician`) had been corrected because it would make both constraints violable. Read literally, **the criterion never states that B is on a different technician** — which is precisely the fixture condition that makes `no_bay_overlap` the only violable constraint, and therefore makes the reported constraint name evidence rather than a coin flip. The clarification note was carrying the requirement. I moved it into the criterion (*"on the same bay but **different technicians**"*) and stated why in the criterion's own reasoning. **This tightens what the criterion says, though not what it required** — flagging it explicitly rather than burying it.

**3. One place I deliberately left a disagreement standing.** `00-design.md`'s *Ambiguity flagged rather than resolved* section records that AC-7 names no constraint where AC-5 and AC-6 do, and that it was fixed at `appointment_bay_in_dealership`. I drafted that name into AC-7, then reverted: writing it into the criterion would move the fact out of the ambiguity register and empty the register's own entry. The slice file and its design still differ in emphasis there, and that is the honest state.

**4. Duplication across the tombstones.** `03-error-taxonomy.md` and `11-performance-budget.md` carried three identical boilerplate paragraphs about the phase-4 gate. Each file has to stand alone, so both keep a short form rather than one pointing at the other.

Files: everything under `/home/agentadmin/sources/keyloop-challenge/docs/slices/`.
