# Report · slice 00 · architect · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 00 design, step 1
- Returned: 2026-09-04T11:23:17.913Z
- Duration: 12713s

---

Step 7 done — `b5a5ac7`, four files, pathspec-pinned, not pushed. `docs:check`, `defects:check` and `test:tools` all pass.

## Sections touched

**§8.2 consequence 4 — the substantive one.** Rewritten to name the mechanism. The wording:

> **An `UPDATE` is checked against other rows, not against the version it replaces — and it is the *index* that never sees the superseded version, not a rule anyone wrote.**

Then a two-row table contrasting how each mechanism obtains the property: the exclusion constraint gets it **structurally** (an `UPDATE` writes a new tuple and marks the old dead; the index compares against *live* entries, and the superseded version is not one — nobody had to think of it and nobody can forget it) versus a trigger, which gets it **by memory** and is correct only if someone wrote `WHERE o.id <> NEW.id`. The test-engineer's mutant result is stated as measurement: the naive trigger fails AC-10, **the patched trigger passes all three steps.** The closing sentence is the one I would defend:

> The consequence ADR-0003 rests on is not *"a row does not conflict with its own prior version"*. It is *"the mechanism cannot be made to conflict with it, because it never sees it."*

And the observation that ADR-0003 could prohibit delete-then-insert without also prohibiting a trigger only because it did not anticipate that a trigger satisfying the outcome would be available.

**Slice 06's obligation** is a blockquote inside that same consequence — the place slice 06's step 1 must read, since §8.2 governs the constraint. It states that AC-10 fixes single-threaded semantics *and deliberately nothing more*; that ADR-0003's claim about racing reschedules is asserted by nothing; that QS-4/QS-5/QS-6 each cover something adjacent and none covers the mirror of QS-1 on the `UPDATE` path; and that the patched trigger is the proof the gap is real. With the reason it is written down now: the last obligation left to be noticed was AC-10 itself.

**§8.1** — as-built note: the schema merged statement for statement, ten criteria, and five reader questions settled (transitive coverage of the three unreferenced columns; three of four composite keys unreachable from the API, which is *why* this was the only slice that could prove them; no default on `id`; `updated_at` untriggered; nothing cascades). Plus R00-5's four unasserted constraints.

**§7.2** — case 0's migration-name assertion as a property of the **seam**, and why it sits in the per-slice file rather than the harness.

**§11** — new **R-11** ("assertions that would survive their own subject being deleted") covering R00-5 and R00-3, and **R-7g** for the `contype` denylist. R-9a/R-9b re-verified as unchanged: `package.json:18` is still the CLI, and `dist/persistence/` contains `db.js`, `health.js`, `schema.js` and **no `migrations/`**, so the built artifact still cannot migrate itself.

**Design §4.6 / §0** — R00-4's false reason corrected rather than deleted, and the step-5 ruling table added.

## What I found reconciling that nobody caught

**R00-5 and R00-3 are the same defect, and treating them as two would have produced two wrong-sized remedies.** Both are *"the specification exists, the thing works, nothing would notice if it stopped"* — so I put them under one heading. That framing immediately showed the remedy must be **asymmetric**: `appointment`'s constraints earn case 0's full name-set-plus-definition treatment because every case writes to that table, but the reference-table constraints should be asserted **where slice 01's code comes to rely on them**, not by extending case 0 across nine tables. Extending case 0 is the first step back toward the whole-schema snapshot slice 00 rejected — and I would have walked into it if I had answered R00-5 on its own.

Second, smaller: **R-11a and R-11b are exposed for a reason that is itself structural.** Every *other* reference-table constraint is self-enforcing because the `UNIQUE (id, dealership_id)` pairs and the qualification primary key are foreign-key targets — drop one and migration `0003` fails. Exactly four have no such backstop, which is why exactly four are droppable with the suite green. That is not a list of oversights, it is the complement of a set, and stating it that way tells the next reader where to look rather than what to remember.

## The one sentence for the human

**Slice 00 established that the invariant is enforced by a mechanism that cannot be talked out of it — and, at step 5, that saying so in terms of the *outcome* rather than the *mechanism* would have let a future slice replace it with a trigger, pass every test, and lose the guarantee.**

```json
{
  "role": "architect",
  "outcome": "reconciled",
  "arc42_sections_touched": ["§7.2", "§8.1", "§8.2", "§11.2"],
  "adrs": [{"id": "0012", "status": "proposed", "supersedes": null}],
  "quality_scenarios": ["QS-1", "QS-2", "QS-11"],
  "assumptions": [
    "§11.2 A-1 unchanged; A-2 now load-bearing twice (T-4, T-9); A-3, A-5 unchanged; A-4, A-6, A-7 closed"
  ],
  "open_questions": [
    "Slice 06 owes a racing-reschedule concurrency test — recorded in §8.2 consequence 4 as an inherited obligation",
    "R-7g: case 0's contype denylist should become an allowlist before any PostgreSQL bump",
    "R-11a/R-11b: four reference constraints and the unfired seventh appointment constraint",
    "R-9a: conform db:migrate to ADR-0007 rather than supersede it — the human's",
    "O-9: guard-paths does not enforce §5's shared tests/integration boundary"
  ],
  "dcr_ruling": "Step-5 findings ruled (a) Clarification: R00-3, R00-4, R00-5 accepted with R00-5's remedy deliberately narrower than proposed. R00-1 and R00-2 are process findings, not the architect's. T-9 was the human's.",
  "message": "arc42 is reconciled to what merged across §7.2, §8.1, §8.2 and §11. The substantive change is consequence 4, which now names the mechanism rather than the outcome, because the test-engineer proved by mutant that a patched check-then-act trigger satisfies the outcome, passes AC-10, and loses the concurrency guarantee — so ADR-0003 rests on the index never seeing the superseded tuple, not on the observable result. Slice 06's racing-reschedule obligation is recorded inside that consequence where its step 1 will meet it, and reconciling R00-3 and R00-5 together showed they are one defect whose correct remedy is asymmetric."
}
```
