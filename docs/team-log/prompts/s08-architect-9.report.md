# Report · slice 08 · architect · invocation 9

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Rewrite 16 ADRs for readability
- Returned: 2026-09-07T12:30:32.968Z
- Duration: 3057s

---

Done. Branch `chore/adr-readability` is pushed at `7c27fcb`, seven commits, no PR opened. `docs:refs`, `docs:adr-check`, `docs:check`, `docs:budget:check` and all 21 tool suites are green.

## Per ADR

Words are `docs:budget`'s count (authored prose, frontmatter and fences excluded — the number CI ratchets). Reference uses are body-only, so the untouched `arc42:` and `ai-input` frontmatter is excluded; that is why my before-counts for 0018 (19) and 0010 (32) are lower than the 29 and 42 in your brief.

| ADR | words | reference uses / distinct ids |
|---|---|---|
| 0001 | 694 → 693 | 9 / 6 → 0 |
| 0002 | 700 → 695 | 7 / 5 → 0 |
| 0003 | 699 → 698 | 5 / 5 → 0 |
| 0004 | 699 → 697 | 4 / 4 → 0 |
| 0005 | 699 → 699 | 14 / 9 → 0 |
| 0006 | 698 → 692 | 14 / 8 → 0 |
| 0007 | 700 → 692 | 6 / 1 → 0 |
| 0008 | 970 → 970 | 20 / 15 → 0 |
| 0009 | 699 → 699 | 4 / 1 → 0 |
| 0010 | 1652 → 1652 | 32 / 14 → 0 |
| 0016 | 1001 → 1017 | 11 / 9 → 0 |
| 0018 | 849 → 849 | 19 / 7 → 0 |
| 0019 | 700 → 698 | 11 / 7 → 0 |
| 0024 | 974 → 1039 | 15 / 8 → 0 |
| 0025 | 698 → 700 | 7 / 5 → 0 |
| 0030 | 700 → 700 | 12 / 8 → 0 |
| **total** | **13,132 → 13,190 (+58)** | **190 → 0** |

**The set did not shrink, and I should say so plainly.** Replacing a pointer with a fact costs words — `A-6, A-7` becomes "seeded reference data that no endpoint can create or edit" — so the saving from cutting implementation detail and tightening prose was spent buying the substitutions back. The word budget was the binding constraint on almost every file: the ratchet ceiling is `max(budget, current size)`, so eleven of the sixteen had between 0 and 6 words of headroom, and 0008, 0010, 0018, 0025 and 0030 landed on their ceiling exactly. The only two with real slack are the contested pair, and 0024 kept +65 of it, which is the cost of its new opening.

Nothing survives outside the boundary: zero `§`, `ADR-NNNN`, `AC-n`, `QS-n`, `TC-n`, `OC-n`, `A-n` or design-local id in any of the sixteen bodies. What does survive is references whose referent is the fact — slice numbers (`slice 05`, `slice 06`), a commit sha (`4d172cc`), and test and source filenames.

## Passages I could not rewrite without deciding what they meant

**Four, and I left all four alone rather than guessing.**

- **`/home/agentadmin/sources/keyloop-challenge/docs/adr/0010-github-actions-and-check-run-collection.md`** says *"Four things are decided here; only the first is about a vendor"* and then carries Decisions 2, 3, 4 and 5 — five, counting the vendor. Correcting the count would be deciding whether the author meant to exclude one. Kept verbatim.
- **0024's Option A** could not be restated. `docs:adr-check` pins the chosen phrasing *"A — keep the catch-all, and close T-05-7 as misframed"* by prefix, so any rewording of that clause fails the guard. I truncated the bullet to `**A — keep the catch-all**` — still a prefix, so the pin holds — and moved *"the objection closes as misframed"* into A's pros-and-cons entry, where it reads as what it is.
- **0019's frontmatter** still says `R-02-2` and `R-02-3` while the body now calls them the missing cell and the surviving mutant. Provenance is out of bounds, so the two vocabularies now sit in one file. Deliberate, and worth knowing.
- **0016's Option D** named the type `PgOutcome`. That is implementation detail by the rule, but dropping the name was a judgement rather than a substitution, so: it is now "the classifier's verdict". If you would rather have the type name back, it is a one-word edit.

## Two content changes you should rule on

**0018 lost an argument, and it was the sample that lost it.** The original Decision explained *why* two class-scoped locks cannot deadlock among themselves: class `1` is bays and class `2` technicians, the key spaces are disjoint by construction, and bay-then-technician is a total order no attempt can take in reverse. That sat in the paragraph around the SQL, and the approved sample replaced the whole Decision with *"Chosen option: H, as shown above."* The options table still says "two class-scoped advisory locks", so the mechanism survives; the deadlock-freedom argument does not. It matters because ADR-0030 leans on exactly that reasoning — *"ordered by `(class, hashtext(key))`, a total order over a shared key space, so the enlarged lock set cannot itself cycle"* — and the record it is extending no longer makes the base case. I applied the sample as instructed. Restoring one sentence would close it, at a cost of ~25 words against a ceiling 0018 is sitting on.

**0016's TypeScript block was already false, which is your rule proving itself.** It declared `PgOutcome` with three variants. ADR-0018 added a fourth, `no-verdict`, and being immutable 0016 could not be corrected. So an accepted decision record had been shipping a wrong type declaration for a day, exactly the failure mode you named when you cut the "What changes in the application" section. I removed the block and stated the constraint in prose. The chosen-option line, the `tsc` measurement table and the escape-hatch row are untouched.

## What the rewrite revealed

**ADR-0010 is the record most likely to become false, for the same reason.** Its Decision 4 is an inventory — *"what runs today"* as a table, plus a phase-4 list, plus four things deliberately not in CI. That is a status snapshot inside an immutable document, and it is already partly expired. Decisions 2 and 3 (collect the build record from the API; assert the red proof's *shape*) are genuinely load-bearing and worth the file. I would not retire it, but if you ever do a second pass, Decision 4 is the part that belongs in the slice design.

**No survivor reads as thin.** The closest is `/home/agentadmin/sources/keyloop-challenge/docs/adr/0007-node-pg-migrate-with-sql-files.md`, which weighs six alternatives for a migration runner in a four-endpoint system and whose own provenance admits the conflict it was written around "turned out not to exist". It is well argued; it is just the one where the option count most exceeds the decision's stakes. **ADR-0019** decides a process rule rather than an architecture one, but it earns its place: its four-cell matrix is the only home for a measurement two roles ran, and *"it has caught its own author"* is real evidence. Both stay, in my judgement.

**One stale line I cannot repair.** `docs/team-log/events.jsonl:1011` says `docs/adr/_sample-0032-rewrite.md` "stays put by instruction". This run deleted it under a later instruction. The log is append-only and I never write to it; if you want that reconciled, it needs an appended line from the orchestrator.

## `CLAUDE.md` §4 — proposed wording, not applied

Yes, it should be amended, and it is further out of date than this session. `tools/docs/adr-invariants.mjs` and `tools/docs/budget.mjs` both already carry headers stating that you overrode §4 on 2026-09-05 "for length only" — two tools are built on a rule the constitution never records. This session widens that from *shortened* to *shortened and reworded*.

Replacing the current sentence (26 words):

> **ADRs are immutable.** Never edit an accepted ADR — supersede it with a new one that references it. The history of how thinking changed is the point.

**Long form (~75 words, +49):**

> **An ADR's decision is immutable; its prose is not.** Never change what an accepted ADR decided — the chosen option, the option set, a verdict, a consequence, a measurement. A decision that has changed is superseded by a new ADR referencing the old one; the history of how thinking changed is the point. The words may be improved at any time: clearer framing, a cross-reference replaced by the fact it points at, implementation detail removed. `npm run docs:adr-check` pins the option set and the chosen option, and a prose pass that turns it red has changed a decision.

**Short form (~41 words, +15):**

> **An ADR's decision is immutable; its prose is not.** Never change what an accepted ADR decided — chosen option, option set, verdict, consequence, measurement — supersede it instead. Wording may be improved at any time; `docs:adr-check` is the check that the boundary held.

**Either costs words you do not have.** `CLAUDE.md` is 1,536 against a 1,500 budget, so its ceiling is 1,536 with zero slack and any amendment must be paid for by a cut elsewhere in the file. The short form needs 15 words found; the long form 49.
