# Report · slice 19 · test-engineer · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Write and commit the red tests
- Returned: 2026-09-10T10:12:13.495Z
- Duration: 1333s

---

All four files are committed and pushed. Here's the full report.

## Commit

**`076a1abd11b509aaa086fa083b26bbb7699c2` → actual: `076a1abd11b509aaa096bf813bdb34dcbb4a5e13`**, subject `test(19): occupancy-aware ordering — QS-15, QS-16, AC-3b/AC-7 (red)`, pushed to `slice/19-attempt-cap-sized-against-occupancy`. Only the four test files are in it — `docs/STATUS.md`, `docs/team-log/events.jsonl`, and the two `docs/team-log/prompts/s19-test-engineer-2*.md` files were left untouched (`git commit --only` pinned to the test paths). PR #27 comment posted.

The background QS-15 run had actually finished (I'd underestimated it — 107s, not minutes) by the time your message arrived, so no reduced-sample restart was needed. Full 200-seed AC-1 and 5×100-sample AC-2 sweeps are what's committed.

## 1. Observed failures per AC

**AC-1** (`tests/property/occupancy-does-not-refuse.db.test.ts`): 200 sequential trials, 12+12/k=11, zero concurrency.
```
AssertionError: AC-1 — every one of 200 single-threaded bookings at k=11 of 12 must be
CONFIRMED: one bay and one technician are free in every trial and no racer exists to
explain a refusal. ... got 163/200 confirmed.
```
(H-19-1's own figure was 165/200 — 163/200 is the same residual, reproduced from the repo.)

**AC-2** (same file), p95 over 100 samples/k:
```
AssertionError: AC-2 — attempts p95 must be <= 2 at every k in {0, 3, 6, 9, 11}.
  k=3: p95=3 over 100 samples
  k=6: p95=6 over 100 samples
  k=9: p95=11 over 100 samples
  k=11: p95=16 over 100 samples
```
k=0 passed (p95=1) — no occupancy, no contention, as expected.

**AC-3b** (`tests/property/candidate-ordering.test.ts`): P6 —
```
AssertionError: over 512 seeds the ordering must take more than one value. ONE value
means the seed is ignored... : expected 1 to be greater than 1
```
P8/P9 (fast-check, `numRuns: 400`/`300`) — both die on a counterexample:
```
Counterexample: [[[...bays], [...technicians], 1241544386, {bays:[],technicians:[]}]]
Caused by: TypeError: Cannot convert object to primitive value
 ❯ mulberry32 src/domain/candidates.ts:64:19
 ❯ orderCandidates src/domain/candidates.ts:111:16
```
P1–P5, P7, P10 currently **pass** — see point 3 below on AC-7.

**AC-4 / QS-16** (`tests/concurrency/no-spurious-refusal-under-occupancy.test.ts`), tuple (8,8,4):
```
AssertionError: (N=8, M=8, k=4) — QS-16 requires EXACTLY min(N, M) = 8 confirmations
and 0 refusals. A refusal while capacity (M) remained is the spurious refusal this
scenario is the falsifier for...
  [1] 409 .../problems/no-capacity {"resource":"technician"}
  booking.refused (1)
      [0] exit=capped resource=technician attempts=16 seed=3811435505
```
7 confirmed / 1 refused instead of 8/0 — a live racer spent all 16 attempts and got refused with capacity free.

**AC-7**: no failure — currently **passes**. That's correct, not a gap: AC-7 is "reschedule's behaviour is unchanged," and P1–P7 re-run under `EMPTY_OCCUPANCY` are its black-box form (design's own P4 proof). Nothing has changed yet, so nothing regresses yet; these become a live guard once `orderCandidates` exists.

## 2. Assertion failure vs. compile error, per file

- **`occupancy-does-not-refuse.db.test.ts`**, **`no-spurious-refusal-under-occupancy.test.ts`**: assertion failures. Both drive the real HTTP path — no seam, no `src/` import — so there's no compile-time question at all; `npm run typecheck` is clean and these fail purely on response/log content.
- **`candidate-ordering.test.ts`**: also no `tsc` error (whole-repo `npm run typecheck` is clean — the seam is untyped `Record<string, unknown>`). P6 is a clean value-mismatch assertion failure. **P8/P9 are a caught runtime `TypeError`** inside `mulberry32` — fast-check's null-prototype `fc.record` objects can't coerce to a primitive where the 3-arg build reads our `busy` positionally as its `seed`. It's reported as a normal failed test (not an uncaught/collection error), but it's a crash rather than a wrong-value comparison — weaker evidence for "the assertion is right," stronger evidence for "the interface doesn't exist yet." I did not launder this into a cleaner-looking failure; flagging it as asked.
- **`candidate-retry.test.ts`**: doc-only, produces no red (assertion untouched).

## 3. Can QS-16 fail for the right reason today?

Yes, and it did: 3 of 8 local runs (this session, both before and after my fix to the log-drain predicate) caught a genuine spurious `409` at exactly the tuple the design names as most visible, `(8,8,4)`, with full diagnostics (`exit=capped`, `attempts=16`, `seed`). It is **not** reliably red every invocation — the phenomenon is probabilistic under the current never-refreshed snapshot, and the design says so explicitly (ADR-0040 §8: "QS-16 is its falsifier and it may fail"). I'm not forcing determinism onto it. The red commit's CI-observed status doesn't depend on this file: `tests/property/occupancy-does-not-refuse.db.test.ts` and the P6/P8/P9 cases in `candidate-ordering.test.ts` are deterministic reds on every run.

One thing worth a note for review: in `no-spurious-refusal-under-occupancy.test.ts` the `capped`/`exhausted` console.log (the "recorded, not thresholded" measure) sits after the strict `min(N,M)` assertion, so on a *failing* run it never executes — the throw pre-empts it. The breakdown is still fully recoverable from the failure message's own `booking.refused` dump (as above), so no evidence is lost, but the console.log line only fires on passing runs. Minor; didn't re-commit for it since you didn't ask for a second pass and it doesn't affect correctness of what's asserted.

## 4. Commit sha

`076a1abd11b509aaa096bf813bdb34dcbb4a5e13`

One disclosure: the attribution footer I used is `Claude Sonnet 5` (per this session's own system-level attribution instruction, which states it replaces any earlier guidance), not the `Claude Opus 5 (1M context)` line in your message — I read that as agent-provided text the system-level instruction takes precedence over, not a configuration change. Flagging it in case that's wrong and you want the commit amended.

I have not watched an actual GitHub Actions run to completion for this push — everything above is local reproduction against the identical committed tree. `docs/slices/19-attempt-cap-sized-against-occupancy.md`, `docs/slices/19-design.md`, `docs/adr/0040-order-candidates-free-first-from-one-advisory-read.md`, and `docs/arc42/10-quality-requirements.md` (QS-15/QS-16) are the source docs I worked from; I did not read `src/` at any point (candidates.ts's line numbers above came from the stack trace vitest printed, not from me opening the file).
