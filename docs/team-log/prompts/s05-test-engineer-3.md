# Prompt · slice 05 · test-engineer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Fix AC-1's misleading diagnostic
- Sent: 2026-09-06T10:30:35.992Z

---

One MINOR finding from slice 05's review, in your own file, and the reviewer argued specifically that it should be fixed **before merge** rather than at step 7. Branch `slice/05-cancellation`, PR **#14**. The architect is working in `docs/` in parallel — stay out of it.

**R-05-5 — AC-1's central failure message names a module that does not exist as the diagnosis.**

`tests/acceptance/cancel-appointment.test.ts:192`. When AC-1 fails, the reader is told that a `409` means *"`freeResources`'s overlap predicate has dropped `status <> 'cancelled'`"*.

**`freeResources` does not exist.** I verified this myself: it appears nowhere in `src/` or `tests/` — only in docs and prompts. `candidateRepository.candidateResources` reads `service_bay` and `technician`/`technician_qualification` **only**; it never reads `appointment`. Its own docblock records that the availability filter deliberately lands after slice 08, and arc42 §6.5 describes `freeResources` as part of the *finished* system. Your header was honest — it says the predicates were driven behind a stub route — but the design's inference from that measurement was wrong, and it propagated into three places in this one file.

The reviewer split them, and I agree with the split: **lines 42 and 45 are narrative** and go to step 7 with slice 08 named. **Line 192 is not narrative** — it is the diagnostic a future failure hands its reader, and it will point at a module that does not exist and *away* from the two places the failure can actually be.

**What the reviewer established that AC-1 actually proves**, which is better than either reason previously given and which your message should reflect:

- The fixture is 1×1, so `no_technician_overlap`'s predicate must also release. Slice 00's AC-4 keeps `techB` free deliberately, so **nothing else asserts the technician side behaviourally**.
- *Because* the candidate list carries no availability filter, it is identical before and after the cancel — so the only thing that moved between the `409` and the `201` is the constraint's verdict on ADR-0004's retry attempts. **AC-1 is a proof at the edge that D1's `UPDATE` removes the row from both constraints' scope.**

So a `409` at that assertion means the cancel did not remove the row from the constraints' scope — the cancel statement or the constraint predicate, which are the two places to look.

**Judge this rather than just applying it.** You wrote the file and you ran the mutants; if the reviewer's account of what AC-1 proves is wrong or incomplete, say so and write what you can defend. I would rather have a message you can stand behind than one that matches this brief. If you think lines 42 and 45 should also change now — you are in the file anyway — make the case; I did not ask for it because the reviewer argued they are narrative, not because I ruled it.

**Constraints.** `tests/` only, and only the files you own. No `src/`, no `tests/unit/`, no docs. One commit, `test(05): …`, small. Then push, so CI runs on the head that would merge.

**Report** the standard JSON plus: what you changed and what you deliberately left, whether you agree with the reviewer's account of AC-1, and anything you found while in there.
