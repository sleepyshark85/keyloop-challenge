# Prompt · slice 08 · reviewer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 08 step 5 review
- Sent: 2026-09-07T05:57:10.961Z

---

Slice 08 **step 5 — REVIEW.** Branch `slice/08-availability-query`, PR **#17**. The diff is `git diff main...HEAD`. You may block a merge and raise a DCR; you may not change the design.

**Read:** `docs/slices/08-design.md`, the slice file (**six ACs**), **ADR-0032** (`accepted`) and **ADR-0033** (`proposed`, not built).

I am running Stryker now and will bring you the numbers — **do not run it.**

**State.** Red `0c4ad4e` observed red in CI (run 34087142178). Green at `193db2d` (run 34088540920, all three jobs PASS). Four implementer commits, 25 unit tests, 11 files. Zero loopbacks. No DCR.

**What this slice is, and why it is unlike the others.** Availability is **advisory by contract — nothing in the database refuses a wrong answer.** There is no constraint adjudicating this endpoint. Step 1 found that **arc42 §6.5 has specified, since phase 2, the very implementation an architecture test is built to reject**: it names `candidateRepository`, and `ambiguity-containment.test.ts` plants exactly that shape as a control **expecting a violation**. ADR-0032 chose Option D — `busyResources` in `appointmentRepository.ts`, subtracted in the use case — because it is the only option leaving the permitted-file list at one file.

## Six things to chase

**1. QS-8 is the only thing between a wrong answer and a green build.** Read `tests/property/availability-agrees-with-constraint.db.test.ts` against its five required mechanics: `SAVEPOINT` probes rolled back; the verdict read as SQLSTATE `23P01` **exactly**, with `23503`/`23514`/`40P01` failing **distinctly**; both directions counted apart; the generator **biased to the `[)` boundary**; and the **per-dealership quiescence witness**. The test-engineer says it found no further way for the property to pass while wrong — *"a bug would need a shared code path between the query and the probe's own range expression, and ADR-0032 keeps them in two files with none."* **Test that claim.** It is the load-bearing sentence of the slice.

**2. Read the generated SQL for `busyResources`.** It restates `0003_appointment.sql`'s `EXCLUDE` predicate as a plain `SELECT`. **The two must agree, and nothing enforces that they do** — that is exactly the boundary A-07-3 warns about, a claim true in one representation and unchecked in the other. Overlap semantics, `status <> 'cancelled'`, dealership scoping, and half-open `[from, to)` arithmetic.

**3. The marker.** `appointment-table-access` must still resolve to exactly `src/persistence/appointmentRepository.ts`. AC-7 was **withdrawn** at step 2 on the grounds that `ambiguity-containment.test.ts:507-524` already asserts this continuously in CI — so confirm it does, and that the slice did not quietly widen the list.

**4. Two choices the implementer made unasked; judge both.**
- **I-08-5** — `advisory`/`disclaimer` are `Type.Boolean()`/`Type.String()`, deliberately **not** `Type.Literal`, so the AC-5 assertion **can actually fail** against a broken implementation. It cites `problem.ts`'s measured warning (F-06-2: an `as const` taxonomy carries zero mutants and is invisible to the score). Is the reasoning right, and does the schema still constrain what it should?
- **I-08-4** — the two reads compose **sequentially**, not concurrently as ADR-0032's sketch implies, because concurrent execution makes statement order an artifact of event-loop interleaving. Disclosed. Fair, or is a round trip being paid for test determinism?

**5. AC-5 is half unassertable and I want your reading.** It requires the response **and** the OpenAPI description to carry two facts. The response half is tested. The OpenAPI half is **not** — there is no `docs:openapi` script and no emitted document, the same reason QS-11's OpenAPI half is unasserted. Is AC-5 therefore half a criterion until slice 09, and does a partly-unassertable criterion belong in a Definition of Done?

**6. arc42 §10.2 names an evidence path that cannot run.** The property test ships as `…-agrees-with-constraint.db.test.ts` because the `nodb`/`db` split gives no `globalSetup` to a plain `.test.ts` under `tests/property/`. Forced by the harness, flagged for as-built. Confirm the file actually runs in the `db` project and is not silently skipped — a property test that never executes is the worst outcome available here.

## Standing duties

Commit discipline (§7) — exactly one `(red)` commit, every implementer commit green. Test ownership (§5), both directions, per commit. `lint:arch`. Whether any survivor sits on a line this slice changed.

**Post your verdict to PR #17.** Your agent definition now carries the rule as a generated block: short **and** self-contained, one italic framing line, gloss each reference as you use it.

**Report** the standard JSON with your verdict, your reading on AC-5, the result of testing the "no shared code path" claim, and — separately — anything this did not ask about.
