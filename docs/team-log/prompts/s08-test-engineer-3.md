# Prompt · slice 08 · test-engineer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Add status to QS-8 generator
- Sent: 2026-09-07T07:27:58.629Z

---

Slice 08 — **R-08-1 remediation, one line's worth of change in your own file.** Branch `slice/08-availability-query`, PR #17. Pull first.

**The reviewer found QS-8 blind to a third of the predicate it verifies, and it proved it rather than arguing it.** It mutated the built artifact in a throwaway worktree (it cannot touch `src/` — the path guard refuses a reviewer, and `dist/` is more faithful anyway since ADR-0013 makes the outside-in suites run it):

| mutant | QS-8 |
|---|---|
| `[)` → `[]` both sides | **killed**, run 3, direction B named, pair shrunk |
| over-report (empty bay set) | **killed**, run 1, direction A |
| **delete `status <> 'cancelled'`** | **survives 30 runs** |

Your generator writes every schedule row at the `confirmed` column default and **never cancels one**, so no run can distinguish the two spellings. The concrete failure is anticipated by the migration's own docblock: add `no_show` to `appointment_status`, write the **allowlist** form `status = 'confirmed'` — which that docblock warns is *"a double-booking nobody wrote"* — and a `no_show` row occupies its slot under the constraint's denylist while your query reports it free. Direction-A disagreement, the exact failure QS-8 exists to catch, and **QS-8 stays green**.

Your step-3 sentence — *"a bug would need a shared code path between the query and the probe's own range expression, and ADR-0032 keeps them in two files with none"* — was ruled **true as stated and incomplete as a claim of coverage**: a bug does not need a shared path, it only needs to lie in **a dimension the generator never varies**. Two of your three mutants died exactly as you predicted, including the boundary-bias one; `status` was a third class the enumeration missed.

**The architect ruled it (b), and put the home HERE rather than deferring it** — ADR-0019 finds no live slice that makes a one-line generator change cheaper or stronger, so a deferral could not name one and **would itself be an omission** by that ADR's own criterion. **Mechanic 6 is now in AC-1**, which I have landed.

## The change, stated by the architect and unmade

In `tests/property/availability-agrees-with-constraint.db.test.ts`:

- `ScheduleItemSpec` gains a **`status`**.
- `scheduleItemArbitrary` draws it `confirmed`:`cancelled` at weight **4:1** — roughly one item in five cancelled.
- `probeInsertCommitted` **writes the column** instead of taking its default.

**No expectation is recomputed. The probe is the oracle** — that is the whole point of the design, and it is why this is a one-line-shaped change rather than a rewrite.

**Verify it actually bites.** Re-run the reviewer's third mutant against your amended property: delete `.where('status','<>',CANCELLED)` from the built artifact in a throwaway worktree and confirm QS-8 now **fails**, naming the direction. If it does not, stop and tell me — that would mean the 4:1 weight is too thin to reach the case within the run count, and the fix is the weight, not the assertion.

**Constraints.** §5: your file only — no `src/`, no `tests/unit/`. §7: commit `test(08):`, **not** `(red)`; the one red commit is `0c4ad4e`. Re-run the property and the acceptance suite against the current green tree.

**Post to PR #17** — short **and** self-contained, per the generated block your definition now carries.

**Report** the standard JSON, the mutant-kill confirmation with the direction it named, the observed cancelled-item frequency, and anything the change turned up.
