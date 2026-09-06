# Prompt · slice 06 · test-engineer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 06 step 3 red commit
- Sent: 2026-09-06T13:34:09.159Z

---

Slice 06 **step 3 — RED.** Branch `slice/06-reschedule-atomic-move`, pushed, PR #15 open. Write the failing tests and commit them red.

**Read first, because the design changed under you at step 2.** `docs/slices/06-design.md` (amended, `64ab23c`), `docs/slices/06-reschedule-atomic-move.md` (**AC-1 gained a clause**, `fc4d1d1`), and ADR-**0025**, **0026**, **0027** (new, accepted), **0028** (new, proposed). You still do not read `src/`.

**Your three additions were all accepted. Two were narrowed, and the narrowings matter more than the acceptances.**

1. **T-06-1 — accepted, remedy narrowed, and the narrowing is a correctness fix to your proposal.** Your finding stands in full: the architect's own §2.1 sentence claimed AC-5's amendment was *"observable by AC-2's instrument"* and it is not. I verified your mechanism against PostgreSQL 17 — zero-row `UPDATE` fires statement-level once and row-level not at all; no `UPDATE` fires neither.
   **But "zero statement-level firings" is unsound against this harness.** `vitest.config.ts`'s `db` project runs `tests/acceptance`, `tests/contract`, `tests/integration`, `tests/property/*.db`, `tests/concurrency` and `tests/performance` against **one** container with **one** `databaseUrl`, and sets no `fileParallelism: false`. Statement-level `TG_OP` gives no `NEW`, so the firing cannot be filtered by appointment id, and any concurrent file's `UPDATE` on `appointment` counts as a firing — flaky in the direction that produces **false failures**.
   **Build instead:** `AFTER UPDATE ... REFERENCING NEW TABLE AS changed ... FOR EACH STATEMENT`, recording `TG_LEVEL`, `txid_current()`, `statement_timestamp()` and `(SELECT count(*) FROM changed)` into the scratch table, which gains `level` and `affected` columns. **The discriminator is a statement-level row with `affected = 0`**, not any firing — rejected Option A leaves one, chosen Option C leaves none, and a concurrent file's `UPDATE` matches rows and is excluded. AC-5's case asserts `404` **and no statement-level row with `affected = 0`**.
   If you judge `REFERENCING NEW TABLE` too much machinery, the architect's stated fallback is marking the file serial — but it prefers the `affected = 0` predicate because it does not slow the suite. Your call on mechanism; the predicate is ruled.

2. **T-06-2 — accepted, remedy tightened, and as you framed it the control would have been false.** Under ADR-0004's retry, a move onto a bay held by another confirmed appointment does **not** produce a `409` — it produces a **successful move to a different bay**. A control expecting a refusal would fail, or worse pass for the wrong reason.
   **Build instead:** two controls, each asserting the **`23P01` and its constraint name on the `booking.conflict` log line** (QS-1's observer), *not* the response status. Bay control: the appointment's own bay held by a different confirmed appointment over the target interval, its technician free — the conflict fires and names `no_bay_overlap`, and the request may then succeed by re-allocation, which is **correct, not a failure of the control**. Technician control: the mirror image, naming `no_technician_overlap`. A single-bay single-technician fixture to also pin the `409` is optional; the constraint-name observation is the load-bearing half.

3. **T-06-3 — accepted, and it reuses T-06-2's bay-control fixture verbatim.** Marginal cost one query and one assertion. Note it is **only constructible at all under ADR-0027**.

**ADR-0027 is new and it changes what AC-1 means.** A move attempts **the pair it already holds first**, then ADR-0009's seeded shuffle over the remainder. This was the implementer's finding: under a shuffle-from-first order, `[09:00,10:00) → [09:15,10:15)` could be satisfied by allocating bay 2, the self-overlap semantics would never be exercised, and **AC-1 could not fail**. AC-1 now reads *"…the id is unchanged, **the bay and technician are unchanged** (asserted on the response body, which carries both), and no `23P01` is raised"*. Assert the new clause — it is what makes AC-1 pin QS-6.

**ADR-0024's warning 1 is yours and lands in this same red commit.** Registering `setNotFoundHandler` breaks the media-type half of AC-4's vacuity guard at `tests/contract/cancel-appointment.test.ts:247`. Re-derive that case **in this commit**, so no merged test is ever degraded by a later fix: the `type` member survives as the discriminator, plus a negative control (`POST /appointments/{id}/nonsense` → `/problems/route-not-found`) proving the route genuinely exists. Extend `tests/contract/error-taxonomy.test.ts`'s closed list to **nine** rows — `appointment-not-confirmed` and `route-not-found` land **together**, one taxonomy change.

**Two consequences, ruled, so you do not chase them.** A cancelled appointment moved out of hours answers **`400 /problems/outside-opening-hours`, not `409`** — the status guard lives only in the statement, so the domain rule is evaluated first. And **AC-4's metric half is not asserted here**: `booking_conflicts_total` does not exist until slice 09.

**F-06-2, which the architect raised off the implementer's objection, raises the stakes on your corpus.** `PROBLEM_TYPES` is `as const`, and Stryker skips `TSAsExpression` subtrees entirely — so the taxonomy carries **zero mutants** and a deleted row would score as no change. `tests/contract/error-taxonomy.test.ts` asserted ∀responses ∃row is *the only thing* guarding it. Write it knowing it is the sole control.

**Non-negotiables for this step.** §2.4 and §7: **exactly one red commit**, yours, `test(acceptance): … (red)`, and the red must be **observed in CI** — push it and let the pipeline classify it; an evidence chain is not a substitute. §2.2: real PostgreSQL via Testcontainers. §5: you own `tests/acceptance/ contract/ property/ concurrency/ integration/(db-invariant)`; you **must not** touch `tests/unit/` or `src/`. The `red-proof` job classifies the red — make sure the commit fails for the reason it is supposed to, not because something does not compile in a file you were not asked to change.

**Report** the standard JSON with `red_commit` and `ci_failure_confirmed`, the CI run URL, which ACs each new test covers, and — separately — anything you hit that the design did not anticipate, especially if the `affected = 0` predicate or the constraint-name observation turned out not to work as specified.
