# Prompt · slice 10 · implementer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 10 remediation — implementer
- Sent: 2026-09-08T09:11:29.812Z

---

# Slice 10 · step 5 remediation — two script changes

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/10-openapi-and-curl-harness`, PR #21. Pull first — the adjudication is at `a3e7d5f`, all eight reviewer findings upheld, **loopbacks stay 0 of 2**, no design change.

Both of yours are in `harness/`, which is now **guarded and yours** (`a1d1717`).

## 1. `R-10-5` — the vacuous exit code

`harness/double-booking.sh`'s invariant — exactly one `201` and `REQUEST_COUNT - 1` × `409` — is **trivially true at `REQUEST_COUNT=1` against a free slot**. One request, one `201`, zero `409`s expected, "PASS" printed, exit 0, **and no contention demonstrated at all**.

Add a **`REQUEST_COUNT >= 2` guard** that exits non-zero with a clear message.

**Why this must land together with the test-engineer's change, so you know what would break if it did not:** AC-5's negative control currently fires **one** request at an already-taken slot. With your guard alone, that control would exit non-zero **because of the guard rather than because of the contention** — a control passing for the wrong reason, which is this slice's entire subject. The architect refused the reviewer's bare guard for exactly that reason and ruled both change together. The test-engineer is moving the control to **two** racers at a taken slot in parallel.

## 2. `R-10-7` — `STARTS_AT` is a pinned literal

`harness/seed.mjs` pins `'2026-09-08T09:00:00.000Z'` — today's date — so the terminal demonstration books a **past instant from tomorrow onward**.

No failure today, and the reviewer checked why rather than assuming: there is no not-in-the-past rule in `src/domain` or `src/application`, and the seed writes opening hours 08:00–18:00 for all seven days. But `R-09-12` removed `date -u -d` in favour of a constant, and **`seed.mjs` is Node — the no-coreutils constraint never applied to it**, so the literal bought nothing.

The architect's ruling: **roll the date forward from today, keep `09:00Z`**. The `+2h` reschedule target then stays inside the seeded window **by construction** rather than by accident of the day the constant was written.

## Discipline

- `harness/` and `src/` are yours. **Do not touch** `tests/` — the test-engineer is working the assertion halves in parallel.
- **No new red commit.** Commit `fix(10):` or `feat(10):`, small, **explicit pathspecs**.
- Verify by running both scripts against a live service — the scribe confirmed the full path works from a fresh seed, so you have a known-good baseline. **Run `double-booking.sh` at `REQUEST_COUNT=1` and confirm it now exits non-zero for the right reason**, and at `>= 2` and confirm it still passes.
- No PR comment needed; I will fold this into the gate packet.

## Return

The structured report, and confirmation you actually ran both scripts rather than reasoning about them.
