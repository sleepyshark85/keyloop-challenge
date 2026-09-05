# Prompt · slice 02 · implementer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 02 step 4 GREEN
- Sent: 2026-09-05T19:18:31.066Z

---

Slice 02, **step 4 — GREEN**. You are the implementer, on `slice/02-book-and-read-an-appointment` at `d5622f3`. The red is committed at `34b057b` and observed failing in CI: 27 failing assertions, zero non-assertion failures, zero under `tests/unit/`.

**Re-read `docs/slices/02-design.md` — it has changed substantially since your step-2 review**, including one thing that did not exist then.

## What changed since you reviewed it

**ADR-0018 is new and it changes your write path.** A DCR at step 3 was ruled **(c)** — the first loopback of two. The test-engineer measured that under N simultaneous inserts against one exclusion range, PostgreSQL refuses the losers with **`40P01` deadlock_detected, not `23P01`** — the architect re-measured it at **285 of 400 losers**. Retry livelocks in all five configurations measured, because every aborted racer re-inserts its index tuple.

The remedy is **two class-scoped transaction advisory locks per attempt** — class 1 on the bay, class 2 on the technician — making bay-then-technician a total order by construction. Measured: 56 races at N=20 and N=40, **0 deadlocks, 0 retries, every racer a verdict**, +0.4 ms uncontended.

**Read ADR-0018's two controls before you write the lock**, because they define what the lock may and may not do: drop the *constraints* and the lock lets 20 overlapping rows through — it prevents nothing; drop the *lock* and there is still exactly one row — it decides nothing. **The lock is for liveness. The constraint is the correctness.** If your implementation ever makes the lock load-bearing for correctness, you have broken §2.1 and the controls will say so.

`40P01` is **not** a `409`. It means a write path skipped ADR-0018's locks, so it is `500 /problems/internal`, **not retried**, and §8.6 gains no row.

Your other step-2 objections all landed:

- **I-02-6 (yours, and it was blocking)** — `BookDeps` gains a logger; the refusal path logs `{ constraint, resource, attempts }`. That is the test-engineer's observer for AC-3 and AC-4.
- **I-02-5** — the union of literals stays AND a compile-time `ProblemType` constructor is added; `setErrorHandler` must use that same builder, or the taxonomy exits through `FST_ERR_FAILED_ERROR_SERIALIZATION`.
- **I-02-3** — §2.5's mutation claim is narrowed as you argued. You committed to writing precedence unit tests for the composition order; Stryker cannot generate that mutant.
- **I-02-8 / T-02-7** — half accepted. Zero bays is broken reference data ⇒ `500`; "no qualified technician here" stays `unknown-reference: service-type`.
- **T-02-1** — pruning is per **value**, not per resource. Under "prune the whole resource" AC-4 still fails.
- **AC-5's wording changed** — one transaction, exactly one `INSERT`, preceded only by the two lock acquisitions, which read no table and decide nothing.

## Two measured traps, so you do not rediscover them

- **The retry loop must not run inside `db.transaction()`.** A second attempt after a `23P01` inside an explicit transaction fails `25P02`. Measured at step 2.
- The **advisory locks are transaction-scoped** (`pg_advisory_xact_lock`), so each attempt is its own transaction. That is compatible with the point above; make sure your structure actually is.

## The job

Make all 19 acceptance criteria green, and nothing else. Your own step-2 estimate was **~1,800–2,200 lines and 12–15 commits**, sequenced:

1. AC-13–16 (`interval.ts`, `openingHours.ts` step 1) · 2. AC-17–19 (step 4) · 3. `schema.ts` + `pgError.ts` · 4. three repositories · 5. `deriveInterval.ts` · 6. `bookAppointment.ts` + `readAppointment.ts` · 7. `problem.ts` + routes + `server.ts` + `main.ts`

**You said steps 1–2 can land first regardless of anything else. They now can — nothing is queued.** §7 holds: every commit green, unit test and the code it drives together, ~150 lines.

## Constraints

Yours: `src/` and `tests/unit/`. You **must not** create, edit or delete anything under `tests/{acceptance,contract,property,concurrency,architecture,performance}/` or `tests/integration/`'s database-invariant tests — read them freely, but if one is wrong, raise a DCR. **One loopback remains of two**, so a second (c) is the last available.

Run `npm test`, `npm run lint:arch` and `npm run test:tools` before each commit. Commit by explicit pathspec. Trailers:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```

## What I will check myself

The human is asleep and has delegated the gate to me, against a mechanical bar: `slice:check` all green with nothing UNVERIFIED, CI green on a run covering the slice's own last commit, mutation over threshold on changed files, no open MAJOR or BLOCKING, and **discrimination claims re-run by me rather than accepted from a report**. So when you claim a test kills something, name the mutant — I will run it.

Report the commit sequence, which AC each covers, the mutation score on changed files with surviving mutants named, and anything in the design you could not implement as specified.
