# Prompt · slice 08 · test-engineer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 08 step 2 test-engineer
- Sent: 2026-09-07T04:23:05.168Z

---

Slice 08 step 2 — AGREE. Branch `slice/08-availability-query`, PR **#17**. Read `docs/slices/08-design.md` (step 1, `15949a2`), the slice file (**seven ACs now** — AC-1, AC-5, AC-6 amended, AC-7 new), **ADR-0032** (`accepted`) and **ADR-0033** (`proposed`, not built here). You do not read `src/`.

**This slice is where a wrong answer is refused by nothing.** Availability is advisory by contract — there is no constraint to adjudicate it, so a wrong answer is not rejected, it is simply wrong and nothing downstream notices.

**Step 1 applied slice 07's countermeasure to documents rather than values, and arc42 disagreed with itself twice.**

- **F-08-1** — §6.5 has specified `candidateRepository.freeResources` since phase 2. By set equality that **is** the `appointment-table-access` marker, and `tests/architecture/ambiguity-containment.test.ts:742` plants that exact form as a control **expecting a violation**. Six slices. No tool could have caught it: `docs:refs` checks that links resolve, not that sections agree. **AC-7 is new and is the criterion that catches it.**
- **F-08-2** — QS-8 is **false as written** in §10.2: over *"every (bay, technician) pair"*, an unqualified technician is `23503`, not `23P01`. AC-1's universe is now the **candidate set**.

**Four things land on you, and the first is the one to attack.**

1. **Stale vs wrong, and the quiescence witness.** *Stale* is true of some state at or after the query's snapshot; *wrong* is true of none. **No isolation level collapses them** — an exclusion check deliberately ignores the transaction snapshot, or two `REPEATABLE READ` writers would both succeed — so the read and the constraint run on two clocks no `BEGIN` aligns. Quiescence must therefore be **witnessed, not declared**: re-run the query after the probes, assert a byte-identical answer and unchanged `count(*)`/`max(updated_at)`. **A run failing the witness is *invalid*, not a QS-8 failure.** Can you build that distinction so it actually holds — and is there any way an invalid run could be mistaken for a pass?

2. **AC-1's five mechanics, each closing one way the property passes while wrong**: rolled-back `SAVEPOINT` probes; the verdict read as SQLSTATE `23P01` **exactly**; both directions counted separately; a generator **biased to the `[)` boundary**; and the witness. Check the boundary bias in particular — QS-8 lives or dies on half-open interval arithmetic.

3. **AC-6 flipped to `to <= from`, and the reason is worth your attention.** `from == to` is an empty `tstzrange`, which overlaps nothing, so the query would report **everything** free — vacuously true — and a probe of that window is refused by `23514`, not `23P01`, putting it outside QS-8's universe entirely.

4. **AC-7** — the marker resolves to exactly `src/persistence/appointmentRepository.ts`, unchanged. This re-derives slice 05's AC-1 attribution **structurally** rather than by argument.

**§6 asks for verdicts, not sign-off.** Where a finding is real but its remedy wrong or too broad, say exactly that.

**Standing constraints.** §2.2 Testcontainers. §2.4 / §7: **one red commit**, `test(acceptance): … (red)`, observed red in CI. §5: your directories only. **Do not write tests yet.**

**Post your reasoning to PR #17** per §6 — and **keep it short: ~100–150 words.** Leading bold `**test-engineer** · …` per §9. Keep the two or three things that mattered and the artifact citations; cut narration and anything explaining the *significance* of a fact rather than stating it. Cite the fact and stop.

**Report** the standard JSON, AGREE/DISAGREE per item with reasoning, whether the quiescence witness is buildable as specified, and anything you found that this did not ask about.
