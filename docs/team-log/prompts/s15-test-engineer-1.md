# Prompt · slice 15 · test-engineer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 15 step 2: agree or object
- Sent: 2026-09-09T16:43:26.710Z

---

Slice 15, step 2 (AGREE). Review the design and either agree or object, per CLAUDE.md §6 step 2. **Do not write or edit any file, including tests.** Verdicts and reasoning only; the red commit is step 3.

Read `docs/slices/15-design.md` (design of record, `633737b`) and `docs/slices/15-seed-fixtures-and-capacity-harness.md` (`d79679b`). Branch `slice/15-seed-fixtures-and-capacity-harness`, cut from `main` at `e63fe17`.

Your role bars you from reading `src/`. Nothing here needs it — this slice touches `harness/**` and one new acceptance test. Review whether AC-1 to AC-10 are **assertable**, whether the red set is red for the reason claimed, and whether the artifacts assigned to you can carry the criteria.

**Why this slice exists:** `tests/concurrency/no-spurious-refusal.test.ts` proves `min(N,M)` across four `(N,M)` pairs, but nothing runnable from a terminal can demonstrate it, because `harness/seed.mjs` hard-codes one bay and one technician. The design's ruling preserves slice 10's exported names **by construction** — a scarce subtree at the empty export prefix — so `harness/double-booking.sh` and your own `tests/acceptance/harness.test.ts` are untouched.

**The architect flagged one assumption explicitly for you to confirm at this step, and it is the one that decides whether this slice demonstrates anything at all:**

- **A-15-1 — do *N* concurrent `curl` processes actually contend?** If they serialise (process spawn cost, connection setup, the shell's own scheduling), AC-4 still passes while demonstrating nothing, and only AC-5's distinctness assertion would notice. `harness/double-booking.sh` already fires `REQUEST_COUNT` racers in a background loop, so there is existing evidence about whether that shape contends — go and look at what it actually achieves rather than reasoning about it.

**Others worth your scepticism, and dismiss any I have wrong:**

- **AC-6 is offered as the control that makes AC-4 an assertion.** But overriding `CAPACITY` to a wrong value tests the *script's own arithmetic*, not the service. Is that a real control, or does it prove only that the script compares two numbers? What would a control that could actually fail on a broken service look like, and is it available without injecting a fault?
- **AC-2 asserts the database agrees** with the exported counts, on the ground that "a count asserted from stdout alone is a claim about a `console.log`". Confirm you can actually make that query from where your test runs, against the container the harness seeds.
- **AC-3 requires an invalid fixture to insert no row.** Validation runs to completion before the first `INSERT` — but is "validate first" genuinely equivalent to atomicity here, or is there a class of failure (a constraint the validator does not model, a mid-INSERT database error) where a partial world lands in a container that is never truncated?
- **AC-8's third guard refuses `BAY_COUNT ≠ QUALIFIED_TECHNICIAN_COUNT`** because outside *B = T* the attainable number is a maximum matching rather than `min`. That reasoning looks right to me — but the test suite's own `(8,20)` pair has *B ≠ T*, so the harness refuses a shape the test exercises. Is that inconsistency defensible?
- **The design says the red set is AC-1 to AC-8 and AC-10, with AC-9 the named exception** that must pass today. A guard that is red is a guard written wrong.

Per §6: **disagreement is expected and is not failure.** An adjudication round that has never produced a disagreement is deference, not consensus. State finding and remedy **separately** — a correct measurement does not make the remedy proposed alongside it correct. One verdict (AGREE or OBJECT) per point, with reasoning.
