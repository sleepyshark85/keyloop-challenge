# Report · slice 07 · test-engineer · invocation 4

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 07 loopback red
- Returned: 2026-09-07T00:21:03.986Z
- Duration: 1832s

---

1. **The re-measured rate rose — the architect's reading is confirmed, not falsified.** At the bounded shape (`RACE_COUNT = 5`, `TRIAL_COUNT = 100`, a 10-wide barrier per trial, never exceeding the pool), three throwaway runs against the same unfixed build (`783f323`) gave 20, 23, 13 `40P01` per 1000 attempts — 56/3000 ≈ **1.87%** (95% CI ≈1.38%–2.35%), against the unbounded shape's previously-measured 41/7800 ≈ 0.5% (CI ≈0.27%–0.80%). The intervals don't overlap; the rate rose roughly 2×–4×. A positive control — the same bounded shape against the current ADR-0030-fixed build — measured 0/1000, so the harness discriminates rather than always firing. I don't have a case left for the extra-round-trip explanation I originally gave; queue-serialisation is the better account of why the unbounded shape under-measured.

2. **Yes, deterministic in practice, not just in principle.** It's choreographed with two ordinary PostgreSQL locks — a `SELECT … FOR UPDATE` holder that relocates the row while holding it, then an uncommitted blocker occupying attempt-1's target — never a timing race, with explicit park-probes that fail the ARRANGE step loudly (not silently pass) if the intended interleaving is ever missed. I ran it five times total across separate invocations (three standalone, once inside the full `tests/concurrency/` suite, once inside the full `db` project) and got the identical failure every time — same message, same lock set (P1 held, P2 absent). No timing tolerance anywhere in it; the ordering is enforced by lock acquisition, not by waiting long enough.

3. **I think the second red is right, and I'd rather it be visible than avoided.** §7's "exactly one red commit" reads to me as written for the case where step-1 design and step-3 tests are settled together; a loopback that reopens steps 1–4 over a design defect — not the implementer's build — is a case the rule doesn't contemplate, and the alternative (amending the first red commit's tests in place) would erase the record that AC-4's original shape was measured, superseded, and why. That erasure costs more than the rule's letter is worth here: the same standard that makes ADR-0030 and ADR-0031 supersede rather than edit their predecessors should apply to the test-side evidence trail too. If I were amending §7, I'd word it "exactly one red commit per *design*" rather than per slice, so a loopback is expected to cost a second one rather than reading as a violation each time it happens.
