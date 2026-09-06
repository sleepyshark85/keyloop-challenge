# Prompt · slice 06 · implementer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 06 step 4 green
- Sent: 2026-09-06T14:00:36.391Z

---

Slice 06 **step 4 — GREEN.** Branch `slice/06-reschedule-atomic-move`, PR #15. Pull first — the test-engineer's red is at `ec37a20` and is **observed red in CI**: run [34037559448](https://github.com/sleepyshark85/keyloop-challenge/actions/runs/34037559448), `test` FAIL, `red-proof` PASS naming exactly the five files it touched, no unit test failing. §2.4 is satisfied; now make it green.

**Read first.** `docs/slices/06-design.md` (amended, `64ab23c`), the slice file (**AC-1 gained a clause**, `fc4d1d1`), and ADR-**0025**, **0026**, **0027** (new, accepted), **0028** (new, proposed — do not build it). Your step-2 review stands; all six of your verdicts were upheld and your one objection was accepted.

**What changed because of you.**

- **I-06-1 accepted, and the architect found the root cause you could not.** `PROBLEM_TYPES` is `as const`; `@stryker-mutator/instrumenter`'s `syntax-helpers.js` lists `TSAsExpression` in `tsTypeAnnotationNodeTypes`, so the whole subtree is skipped. Your measurement was right and the corrected claim inverts the reason: `problem.ts` is **immune, not cushioned** — 9/12 = 75.00 before and after, no new mutants, **no new margin**. The `:799` set-equality extension from seven members to nine is still mandatory, but as a compiler-and-assertion fact rather than a kill.
- **F-06-2 followed from it:** because the taxonomy carries zero mutants, a *deleted* taxonomy row would score as no change. `tests/contract/error-taxonomy.test.ts` is the only thing guarding it. Do not treat the mutation score as evidence about the taxonomy.
- **I-06-2 accepted and it produced ADR-0027 — build the order you proposed.** A move attempts **the pair it already holds first**, then ADR-0009's seeded shuffle over the remainder, with Bound-2 pruning and the cap of 16 unchanged. The architect ruled your case stronger than you argued it: under a shuffle-from-first order **AC-1 could not fail**, because the self-overlap semantics are only exercised when the new version lands in the same bay with the same technician. AC-1 now asserts the bay and technician are unchanged.

**What to build.** `PATCH /appointments/{id}`, the reschedule use case, and the guarded `UPDATE`, per ADR-0025: **the read decides `404`, the guarded `UPDATE` decides `409`, and there is no follow-up read.** The domain rule runs before the status guard, so a cancelled appointment moved out of hours answers `400 /problems/outside-opening-hours` rather than `409` — the test-engineer asserts this. Plus **F-05-1 / ADR-0026**: `lockResources` returns a branded `ResourceLock` carrying its keys, which the write takes as a parameter. Plus **ADR-0024's handler**: `setNotFoundHandler`, the `/problems/route-not-found` row, and the corrected `server.ts` docblock — the taxonomy goes to **nine** rows in one change, and `tests/unit/http/appointments.test.ts:799`'s set-equality list must be extended or the unit test fails.

**The Stryker instrument, decided by the architect, written by you.** `// Stryker disable all : <reason>` … `// Stryker restore all` pairs around each `const unhandled: never` arm — **those arms only**, never the schema-options or description mutants, which are inert for reasons that change when Fastify's config or slice 09's OpenAPI assertion does. You said you would measure the ≈91.3 prediction for real rather than inherit it; do that and report what you actually get.

**Two open findings you should know about, neither of them yours to fix.** The architect is ruling both concurrently, in `docs/` only — do not wait on it and do not edit those files.
- **T-06-6** — AC-1's literal clock example (`[09:15,10:15)` then *extended* to `[09:15,11:15)`) requires a duration change `PATCH` cannot make. The test substituted a second self-overlapping target instead. This does not change what you build.
- **T-06-7** — the `affected = 0` statement-level discriminator has a documented residual against this slice's own AC-4. It is an assertion-strength question, not a production-code one.

**Non-negotiables.** §5: you own `tests/unit/` and `src/`, and you **must not** create, edit or delete anything under `tests/acceptance/ contract/ property/ concurrency/ architecture/ performance/` or the test-engineer's `tests/integration/` files — `reschedule-self-overlap.test.ts` and `reschedule-is-one-statement.test.ts` are **hers**. If you believe one is wrong, **raise a DCR**; do not edit it. §7: **every commit green** — a unit test and the code it drives, together — and small; past ~150 lines it should probably have been two. §2.1 is NON-NEGOTIABLE: attempt the write, map SQLSTATE `23P01` to `409`; no check-then-act. Keep `npm run lint:arch` clean.

**Report** the standard JSON with commits, files changed, unit tests added, `acceptance_passing`, the real `routes/appointments.ts` and `problem.ts` mutation scores you measured, and — separately — anything you had to work around, especially any place ADR-0025, ADR-0026 or ADR-0027 did not compose as specified once you wrote it.
