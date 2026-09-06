# Prompt · slice 07 · test-engineer · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 07 loopback red
- Sent: 2026-09-06T23:50:29.499Z

---

Slice 07 — **the loopback's red.** Branch `slice/07-reschedule-under-contention`. Pull first.

**The architect declared a loopback against its own design, unprompted.** `loopbacks: 1 of max 2`. R-07-1 is upheld and it is **against the design, not the build**: `07-design.md` §3 specified the stale pre-loop read that the implementer faithfully built, so what departed from ADR-0030 is the design. It named this the **third occurrence of one shape** — the slice-06 discharge ruling, ADR-0030's symmetry claim, and this — each stating something true *within* one transaction as though it were true *across* them.

**ADR-0031** is the fix: a move reads the pair it leaves **inside its own transaction**, under the row's own `FOR UPDATE` lock. Not built yet. That is what your red must catch.

**Your four step-5 fixes are all accepted** (`6d1db61`, `02a5d9b`), including the drain floor you caught yourself and corrected from `× 2` to `× 4`. I have not logged that as a defect — the register exempts in-flight self-correction — but it is noted in the resolution as the same self-check discipline that produced T-07-5.

**Two criteria to write. I have already landed both in the slice file; `slice:check` reports five criteria.**

**AC-5 (new) — and the architect was explicit that it must NOT be a race.** *"The lock set is derived from state the transaction itself observed."* Given a confirmed appointment at pair *P*, when a move is in flight between `lockResources` and its `UPDATE`, the transaction holds advisory locks on ***P* as the row currently stands** — never on a pair read before the transaction opened. Assert it **deterministically off `pg_locks`** (`classid`/`objid` against `hashtext`), *not* by racing four movers into the stale interleaving: **a probabilistic witness for a rule is the thing ADR-0030 exists to replace**, and ADR-0031's claim is about *where a value is read*, which `pg_locks` reads directly. Its mutant control: restore the pre-loop read and relocate the row between it and the attempt — the transaction then holds the **old** pair's keys, which the same assertion reads.

**AC-4 amended (R-07-4) — and the re-aiming matters more than the fix.** The bound is **≥ 1000 contended attempts with no more requests in flight at once than the pool can serve**. This is **not a flake dodge**. 40 racers against a 10-client pool does two things and the second is worse: it **serialises the very simultaneity AC-4 measures** — a pair's two movers can be queued apart and never race — as well as manufacturing the codeless `500` your `badAnswers` blames on a deadlock.

**So the architect's prediction is that bounding concurrency makes your mutant control *stronger*, and it explicitly asked to be contradicted if not.** Its reading is that queue-serialisation, not your extra-round-trip explanation, is why this fixture measured 0.5% against ADR-0030's 117/1000. **Re-measure the unfixed-build rate at the new shape. If it does not rise, say so plainly — that falsifies the architect's reading and the low rate needs another explanation.** That measurement is the most valuable thing you will produce this round.

**Non-negotiables, and one genuine tension I want you to name rather than resolve silently.** §7 says *exactly one red commit per slice* and this slice already has one at `e030f52`. A declared loopback reopens steps 1–4, so this is a **second** red. I am recording it as such and flagging that §7 does not contemplate a loopback — **say in your report whether you think a second red is right here**, because that question is going to the retro either way. Commit it `test(07): … (red)` and push so `red-proof` classifies it; it must fail because ADR-0031 is unbuilt, not because something does not compile.

§2.2 Testcontainers. §5: your directories only — no `src/`, no `tests/unit/`.

**Report** the standard JSON with `red_commit`, `ci_failure_confirmed` and the run URL, the re-measured unfixed-build deadlock rate at the bounded shape **against the 0.5% you measured before**, whether AC-5's `pg_locks` witness is deterministic in practice as well as in principle, your view on the second-red question, and anything else you hit.
