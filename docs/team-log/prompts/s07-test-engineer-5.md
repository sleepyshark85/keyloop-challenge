# Prompt · slice 07 · test-engineer · invocation 5

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Fix AC-5 comparison in SQL
- Sent: 2026-09-07T00:41:51.989Z

---

Slice 07 — **AC-5's instrument, ruled (a).** Branch `slice/07-reschedule-under-contention`. Pull first.

**Your test found a real defect and it is in your own instrument, not in the build.** The implementer raised a DCR rather than editing your file, and routed it through me rather than dispatching anyone — O-44 working the first time it was tested.

**The mechanism**, verified by the implementer against a scratch `postgres:16-alpine`:

- `hashtext()` on P2's technician id returns a **negative int4**: `-211965710`.
- `pg_advisory_xact_lock` stores it in `pg_locks.objid`, whose type is **`oid` and therefore unsigned**, as its two's-complement form **`4083001586`**.
- **The granted-locks dump contains `classid=2, objid=4083001586`** — the transaction genuinely holds the lock ADR-0031 requires.
- Your `holds()` helper compares `objid` against the **raw signed value** your own `select hashtext($1::text)` returned, so `4083001586 === -211965710` is false.

Deterministic on your fixed namespace-derived UUIDs, and independent of build correctness. **ADR-0031 is satisfied; the assertion is wrong.**

**The architect ruled (a) clarification, resume from step 3, no ADR and no design change — and it does not cost the second loopback** (you stay at 1 of 2: the governor bounds *design* churn, nothing in the design or the build moves, and the failure *confirmed* the design rather than challenging it).

## The fix it ruled, which is neither of the two I proposed

I offered normalising `hashtext` to unsigned in the harness, or casting `objid` back to signed in the query. **Both were rejected, and the reasoning is the point:**

> Both fixes you offered are conversions, and the defect we just found *is* a conversion — adding a correct one leaves a second place the encoding can be wrong, and it puts a signed/unsigned fact in a JavaScript file where nothing will ever re-derive it.

**Do the comparison in SQL and let it return resource *ids*.** Join `pg_locks` against `hashtext(bay_id)` / `hashtext(technician_id)` **computed in the same statement**, and assert that the set of ids coming back equals the pair the row currently occupies. UUIDs cross the JS boundary unambiguously; `int4`-in-`oid` does not.

This **preserves the deterministic-witness property and strengthens it**: the assertion then reads the lock set in the terms ADR-0031 is actually written in — *which resources is this transaction holding* — rather than in the terms `pg_locks` happens to store. Keep the two-lock choreography, the park-probes and the loud ARRANGE failure exactly as they are; only the comparison moves.

AC-5's parenthetical in the slice file still says "`classid`/`objid` against `hashtext`", which now names the wrong mechanism. Its **substance is unchanged**, so the architect corrects that clause at step 7's as-built rather than reopening the design mid-slice. Leave it alone.

## Also retire a superseded explanation — A-07-4

Your file header explains the fixture's low rate by the extra round trip the forced attempt-1 failure adds. **Your own R-07-4 re-measurement falsified that**: bounded to the pool, the same unfixed build gives 1.87% (CI 1.38–2.35) against the unbounded 0.5% (CI 0.27–0.80) — **disjoint intervals** — and you said yourself you have no case left for it. The old shape was **under-racing**. Retire the explanation rather than leaving it standing beside the number that superseded it; a superseded account left in place is how a reader later re-derives the wrong cause.

The architect's words, which belong in your record: *"thank you for running the falsification rather than the confirmation — 1.87% against 0.5% with disjoint intervals and a 0/1000 positive control is a better result than the ruling deserved."*

**Constraints.** §5: your file only — no `src/`, no `tests/unit/`. §7: commit `test(07):`, **not** `(red)`. The two red commits stand as they are. Re-run AC-5 against the current tree — it must now **pass**, because ADR-0031 is built and the lock set is correct — and re-run the rest of `tests/concurrency/` to confirm nothing else moved. If AC-5 still fails after the SQL-side comparison, **stop and tell me** rather than adjusting until it goes green; that would mean the lock set is not what the dump says it is.

**Report** the standard JSON, what the SQL-side assertion now compares, confirmation that AC-5 passes and that the choreography and park-probes are intact, and anything the change turned up.
