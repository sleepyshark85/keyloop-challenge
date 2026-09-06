# Prompt · slice 05 · test-engineer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 05 step 2 AGREE
- Sent: 2026-09-06T08:50:19.068Z

---

Slice 05 step 2 — AGREE. Branch `slice/05-cancellation`. Read `docs/slices/05-design.md` (commit `707815e`), `docs/slices/05-cancellation.md`, and the new **ADR-0023**. The implementer is reviewing the same design in parallel; you will not see its objections and it will not see yours.

Agree or object, per objection, with reasoning. §6.3: an adjudication round that has never produced a disagreement is deference, not consensus — but manufactured objections are worse than none. Object where you have a measurement or a named failure.

**Five places I would look, chosen because they are where the design is making a claim rather than a choice:**

1. **"Only AC-1 dies if the predicate is dropped."** The architect says AC-2, AC-3 and AC-4 all still pass if `WHERE (status <> 'cancelled')` is silently removed, and that the mutant lives in a `.sql` file Stryker cannot reach. Its argument that AC-1 suffices is that an `INSERT` is checked against *every* exclusion constraint, so one `201` after cancellation proves both predicates live at once and kills the drop-one variants. **Verify that argument or break it.** If AC-1 is the sole guard for half of §2.1, its own red has to be worth that weight, and you are the one who will owe it.
2. **The AC-1 trap and the fixture.** The design closes it with a 1×1 fixture — one bay, one technician, so slice 04's shuffle has exactly one permutation — and forbids pinning `BOOKING_SEED`, on the grounds that pinning it is ADR-0021's Order-A and makes the test depend on a knob rather than on the fixture. Say whether the 1×1 fixture genuinely removes the degree of freedom, and whether "one `const` body posted twice" is enough to make it *the same booking*.
3. **AC-2 needs zero production lines**, because slice 02 already returns `found` for a cancelled row and typed `AppointmentBody.status` as a union specifically so this slice's test could fail. The design says it is *still honestly red at step 3 because no cancelled row can exist*. That is a claim about your red. Check it against slice 02's code and say whether it holds — a test that is green at red is something you have flagged unprompted twice now.
4. **The new concurrency file.** The architect added `tests/concurrency/cancellation-takes-no-lock.test.ts` as a provisional scope ruling, because ADR-0018 set the house standard that lock claims are measured, and an ADR exempting a write path on an unmeasured claim is what a reviewer should flag. That file is yours to write. Say whether it is the right assertion and what it would actually have to observe to be evidence rather than decoration — "no deadlock occurred" is not obviously distinguishable from "the race did not happen".
5. **ADR-0023's measurements.** Three are cited: an inserter waits on an uncommitted cancel and then returns `201`; the cancel completes in 2 ms with a conflicting insert in flight; 20 cancels racing 20 inserts on one bay give zero `40P01` with no lock. Judge whether those three establish the *iff* the ADR states, or only the easy direction of it.

**Constraints.** Do not write tests yet — this is step 2. Do not read `src/`. Do not edit the design. Report objections; the architect replies before it edits, per §6.

Report the standard JSON with an `objections` array. For each: what fails, the AC/QS/§2 clause at stake, and the remedy you would accept — including a narrower one than you would prefer. Add, separately, anything the design does not mention that you will have to invent at step 3, because that is where the last three slices' ambiguities actually surfaced.
