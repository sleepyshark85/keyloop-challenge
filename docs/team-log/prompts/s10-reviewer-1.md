# Prompt · slice 10 · reviewer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 10 step 5 review
- Sent: 2026-09-08T08:33:43.983Z

---

# Slice 10 · step 5 — REVIEW. The last review of the project.

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/10-openapi-and-curl-harness`, **PR #21 open**. Pull first. Read `docs/slices/10-design.md`, the slice file, then `git diff main...HEAD`.

**Nothing comes after this.** No later slice, no later review; the only thing between this and done is a gate the human has delegated to the architect and me, conditional on our agreeing.

## What this slice exists to correct

Slice 09's three BLOCKING findings were all **green tests asserting the wrong thing**: AC-9's collected `/problems/*` type strings and never read `content[…]`; `A-06-2` was "discharged" by an assertion containing zero occurrences of `requestBody`, `parameters` or `appointmentId`; the double-booking script counted nothing and always exited 0. **Your first job is to check that this slice did not produce three more of those.**

## State

- CI green on `afea055`; red at `3c08f15` observed red on assertions (`db` exit 1, `nodb`/`perf` exit 0, red-proof green).
- **Mutation, full-project run, all four changed files clear §10 with no override**: `problem.ts` **100.00** (was 74.29), `availability.ts` 88.37, `server.ts` 79.05, `appointments.ts` 76.13. Check the per-file figures yourself — reading an aggregate was `O-64`, and collecting from a partial report was `O-73`, both found this week.
- 45 tests in the red commit: 6 acceptance, 27 contract, 12 architecture.

## Where I would look hardest

1. **`problem.ts` went 74.29 → 100 by removing duplication**, not by adding assertions — `ProblemSchema` now shares `narrowedProblemSchema`'s construction (`ca72cbf`). That is the better kind of fix *if the sharing is sound*. Does the shared construction actually produce the same schema for both callers, or has a narrowing rule leaked into the general one?

2. **`I-10-1`/M2 is the slice's central risk.** A one-member `Type.Union` collapses to a Literal and **silently substitutes** — §8.5's defect. **Eight cells** collapse under AC-1's narrowing (read 400/404, cancel 400/404, availability 400/422, book 409, reschedule 404). The fix is a hand-built `Type.Unsafe<T>({ anyOf: [{ const: x, type: 'string' }] })`. **Verify the rejection behaviour yourself on at least one cell** rather than trusting the report — this is the mechanism that would reintroduce the exact defect the slice corrects, inside the fix for it.

3. **`A-06-2` is on its third discharge attempt.** Twice it was declared discharged on assertions that did not make it. AC-3b is a `tests/architecture/` marker anchored on `randomUUID`'s identity. **Does it constrain what it claims?** The QS-12 counter marker's first version matched a label spelling rather than the counter; the same failure is available here.

4. **The harness scripts now drive their own exit codes** and the acceptance test counts database rows rather than `201`/`409` occurrences in stdout. Falsify it: can you make a script pass while doing the wrong thing?

5. **`I-10-4`** — `internal` needed a second unreferenced `components.responses` entry because narrowing made it homeless, which the design did not anticipate. Is two the right answer, or a sign the narrowing needs a third?

6. **AC-2 and AC-6's README half are gate-verified, not mechanical** — the design says so and the test-engineer built no assertion for them. Confirm that is honest rather than convenient.

## Your authority

You may **block**. You may not change the design — a design problem is a DCR. Check commit discipline (§7: one red commit; `(c)` licensed a second in slice 09 and no `(c)` has been ruled here), test ownership (§5, and `harness/` is now guarded), and dependency-cruiser.

**A review with no findings on the last slice of the project is not a clean bill of health.** Equally, do not manufacture findings — say what you checked and found sound.

## Land it

One PR comment on #21, `**reviewer · step 5 — REVIEW**`, ~150 words, short and self-contained, findings ranked, merge verdict explicit.

## Return

The structured report with every finding, its severity, whether you block, and — since the gate is delegated to the architect and me — **your recommendation on whether this should merge**, stated plainly.
