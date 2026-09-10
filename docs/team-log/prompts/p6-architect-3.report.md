# Report · phase 6 · architect · invocation 3

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Document the booking decision in §4
- Returned: 2026-09-09T09:18:17.526Z
- Duration: 295s

---

Done. All three checks pass; `docs:build` was needed and run.

## The new structure

`docs/arc42/04-solution-strategy.md` — §4.1 is retitled **"How a booking is made"** and now carries the whole decision under six `###` headings in the order you specified:

1. **The problem** — the brief's own wording, the rejected `checkAvailability` snippet (kept verbatim), and why the window cannot be closed by care.
2. **Rejected, and why** — three bullets: check-then-act itself; a lock as the *correctness* mechanism (ADR-0004 Option D, argument unchanged); the `BookingRepository` port (ADR-0008), moved here out of the technology table.
3. **Chosen — overlap is made unrepresentable** — the two constraints and the four consequences, untouched. Still the centre.
4. **Determinate — two advisory locks, which decide nothing** — new, ADR-0018.
5. **On top — allocation and retry, which prevent a different failure** — moved out of §4.2, opening on the distinction rather than on the mechanism.
6. **And requirement 2's other half** — the composite FK, one clause, pointing at §8.1.

§4.2 keeps its four gate technology decisions and the shared-SQL-function rejection. §4.3 is unchanged.

**The count.** I removed the numeral rather than correcting it: the opening now enumerates — one decision (§4.1), four technology choices, one rejection belonging to neither — so the promise is checkable against the headings instead of being asserted. "Five decisions" and the stray "a fifth decision" are both gone.

**The distinction, kept sharp.** Section 5 opens: *"The constraints prevent double-booking, completely and alone. Retry and candidate ordering prevent spurious refusal"* — then QS-3, then *"Without retry the system would be correct and useless: no double-booking, and customers refused while bays stood empty,"* and an explicit note that §10's filing QS-3 under goal 1 is right proximity but not the same mechanism.

## How I paid

| | Words |
|---|---|
| Baseline | 1,216 |
| Ceiling `max(1500, 1216)` | 1,500 |
| Restructured, before trimming | 1,494 |
| **Final** | **1,478** — 22 under |

Baseline and budget both untouched; `docs:budget:check --ratchet` is green. The TypeScript snippet is free — the counter strips fenced code but charges for table cells.

Paid from §4.2: the ports-and-adapters cell reduced to a cross-reference (`"rejected in §4.1: the port is the loophole"`) since the argument now lives in §4.1; the §2.2 technology roll-call replaced by its categories, since §2.2 is that fact's home; Prisma and NestJS cells tightened. Plus one genuinely redundant line — a "read in this order: problem, rejected, chosen…" sentence that just restated the six headings printed beneath it.

## Claims added, and their source

Everything new traces to an artifact; nothing was decided here.

- Locks are `pg_advisory_xact_lock`, bay then technician, before the write — ADR-0018 Decision (option H).
- The `check_exclusion_constraint` insert-then-scan mechanism and the resulting cycle — ADR-0018 Context, restated from §6.1's own wording.
- "A deadlock carries no constraint, and so yields no verdict to render as `409`" — ADR-0018 Context (*"the error carries no `constraint` field"*).
- Both control measurements — ADR-0018's two-row control table (locks off + constraints: 1 row, 108 deadlocks; locks on + constraints dropped: 20 rows, 0 deadlocks), cited to `tests/integration/exclusion-constraint-adjudicates.test.ts`, which exists.
- QS-3's exact statement — §10 verbatim, including "over one interval".
- Pruning changes the bound from bays × technicians to bays + technicians; cap 16 — ADR-0009 Decision, and already in the old §4.2.
- The composite FK — §8.1's requirement-2 paragraph, condensed to one clause.

## On the lock position

**No conflict — a stale omission, exactly as you framed it, and I'd add that ADR-0018 anticipated the confusion.** §4's rejection is of a lock *as the correctness mechanism*, on the modifiability ground that correctness would depend on every write path remembering it. ADR-0018 adopts locks that read no table and decide nothing. Different claims about different objects; §4 was written before slice 02 and simply never updated.

One thing is worth flagging, though it is recorded rather than contradictory. ADR-0018's own Consequences book this as debt: *"Under a per-resource lock, a reintroduced check-then-act would be correct rather than merely harmless. The argument for making capacity refusals a database verdict gets weaker here, not stronger."* So the locks do partly erode §4.1's second rejection — not its conclusion, but one of its supports. ADR-0018 names what carries the weight instead (the branded type, the architecture test on table access, the two controls). I did not restate that in §4 — it is debt, and §11 is its home — but if you want §4 to be fully candid about the cost of the lock, that sentence is the one to consider promoting. That is a judgement call for you, not a defect I should have silently fixed.

Also worth noting: ADR-0018 lists `arc42: ["§5.2", "§6.1", "§8.2", "§8.6", "§11"]` — §4 is not in its scope declaration. The omission was systematic, not an oversight at reconciliation time.

## Constraints

Only `docs/arc42/04-solution-strategy.md` was edited. `docs/system-design.md` changed as the generated index (one line), per your instruction to run `docs:build`. No ADR, no other arc42 section, no `src/`, no `tests/`, no team-log write. Nothing committed — it is all in the working tree.

One incidental: the path guard blocked a `bash` heredoc because the prose contains `src/domain/interval.ts` and `src/persistence`; it reads those as writes to `src/`. I used the Write tool instead, and the citations are intact.

```json
{
  "role": "architect",
  "outcome": "reconciled",
  "arc42_sections_touched": ["§4.1", "§4.2"],
  "adrs": [],
  "quality_scenarios": ["QS-3", "QS-8"],
  "assumptions": [],
  "open_questions": [
    "ADR-0018's Consequences book as debt that a per-resource lock makes a reintroduced check-then-act *correct*, weakening §4.1's second rejection. §4 does not say so; §11 is the debt's home. Whether §4 should carry that cost explicitly is a call for the human."
  ],
  "dcr_ruling": null,
  "message": "§4.1 now carries the booking decision end to end in six signposted parts, including the ADR-0018 advisory locks §4 had never mentioned and the both-ways control measurement that proves lock and constraint do different jobs. The lock rejection and the lock adoption are not in conflict — §4 was simply written before slice 02 and never updated. Paid for at 1,478 of 1,500 words by compressing §4.2's table and cutting a navigation line the new headings made redundant; baseline and budget untouched."
}
```
