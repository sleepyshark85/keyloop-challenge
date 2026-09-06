# Prompt · slice 06 · implementer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 06 step 2 implementer review
- Sent: 2026-09-06T12:50:00.122Z

---

Slice 06 step 2 — AGREE. Branch `slice/06-reschedule-atomic-move`, checked out. Read `docs/slices/06-design.md` (step 1, committed `c410577`), then `docs/slices/06-reschedule-atomic-move.md`, then **ADR-0025** (`docs/adr/0025-existence-is-the-reads-legality-is-the-statements.md`) and **ADR-0026** (`docs/adr/0026-the-lock-is-a-value-the-write-takes-and-it-carries-its-keys.md`). Both are accepted.

**This is the cheap moment.** CLAUDE.md §6: an objection here costs a comment; the same ambiguity found at step 5 costs a full cycle plus a loopback. §6's adjudication clause is explicit that a round which has never produced a disagreement is not consensus, it is deference, and the retro reads it that way. You are not being asked to sign off — you are being asked for a verdict per item, with reasoning. You may argue once; you do not decide.

**Six things the design decided that land on you.**

1. **ADR-0025 — the read decides `404`, the guarded `UPDATE` decides `409`, and there is no follow-up read.** AC-5 as originally written (`404` decided by zero rows, not by a preceding read) was ruled *unimplementable*: a move cannot be constructed without reading its own row, because the new interval derives from the row's service-type duration and its dealership's opening hours. The architect found this by trying to write the statement. **You are the one who has to write it — check that the shape actually composes**, including the ruled consequence that a *cancelled* appointment moved out of hours answers `400 /problems/outside-opening-hours` rather than `409`, because the status guard lives only in the statement and the domain rule is evaluated first.

2. **On §2.1, which is NON-NEGOTIABLE — the reason, not the conclusion.** The design argues the read is not check-then-act because §2.1 forbids a read whose answer *authorises* a write that its own staleness could invalidate. This read touches one row by primary key, can never answer *"is that bay free"*, and its `absent` answer cannot go stale; its `confirmed` answer **can**, and is re-adjudicated atomically by the statement's own `status = 'confirmed'` guard. If you think that reasoning launders a check-then-act, say so plainly — §2.1 is the invariant this whole project is built on, and you are the role that would be writing the violation.

3. **ADR-0026 — `lockResources` returns a branded `ResourceLock` that the write takes as a parameter, and it carries its keys.** This is F-05-1, inherited, and slice 06 is its destination *because it writes `rescheduleAppointment`, a newly written locking path* — the first moment "forgot the lock" is a live mistake rather than a historical one. Type-only, erased, one minting cast: forgetting the lock becomes a compile error, and ADR-0023's correctly-exempt cancel path becomes a signature that does not ask for one. ADR-0026 strengthens it to carry the keys. **Does the branded shape actually catch the mistake it claims to, and does carrying the keys buy what the ADR says it buys?**

4. **The Stryker instrument in the slice file was wrong and has been corrected — check the correction.** `// Stryker disable next-line` cannot cover an exhaustiveness arm: the three survivors per arm sit on two lines (`default: {` carries a `ConditionalExpression` and a `BlockStatement`; the `throw` carries the template literal). The instrument is a `// Stryker disable all : <reason>` … `// Stryker restore all` pair per arm, on the `const unhandled: never` arms **only** — not the schema-options or description mutants, which are inert for reasons that change when Fastify's config or slice 09's OpenAPI assertion does, so disabling those would hide a mutant at the moment it becomes killable. The *decision* is the architect's; the *edit* is yours. Claimed effect: `routes/appointments.ts` 83.93 → ≈91.3.

5. **`src/http/problem.ts` is pinned at exactly the 0.75 threshold and the design claims the margin is already prevented.** Measured from `reports/mutation/mutation.json`: 75.00, 9/12, all three survivors on line 78. The two new taxonomy rows add two `StringLiteral` mutants, both killed by a set-equality assertion already committed at `tests/unit/http/appointments.test.ts:799` — extending that list is not optional, so the kill is self-enforcing. Claimed result **11/14 = 78.57**. That is a prediction about a file you will change; if you think it is wrong, now is when it is cheap.

6. **You are building a duplicated candidate loop on purpose.** ADR-0003 requires a move needing a different bay or technician to re-run ADR-0004's candidate loop. Ruling re-allocation out was considered and rejected, because it would make `PATCH` refuse while capacity exists — the one behaviour this system is about. The duplication is **F-06-1**, extraction deferred to slice 09, which must instrument both loops anyway. If you think the duplication is the wrong trade, or that extraction is cheaper now than the ADR assumes, that is a legitimate objection.

**Standing constraints.** §5: you own `tests/unit/` and nothing else — you **must not** create, edit or delete anything under `tests/acceptance/ contract/ property/ concurrency/ architecture/ performance/`, and the database-invariant half of `tests/integration/` is the test-engineer's. If you believe an acceptance test is wrong you **raise a DCR**; you do not edit it. §7: every commit of yours is green — a unit test and the code it drives, together — and small; over ~150 lines it should probably have been two. §2.1 remains NON-NEGOTIABLE: the insert/update is attempted and SQLSTATE `23P01` maps to `409`.

**Do not write code yet.** This step is the review. Step 4 is where you go green, and the test-engineer's red must exist and have been observed red in CI first.

**Report** your standard JSON plus, for each of the six items above, **AGREE or DISAGREE with reasoning** — and where you agree a problem is real but think the proposed remedy is wrong or too broad, say exactly that, because the finding and the remedy are separate verdicts. Then, separately, anything you found that this did not ask about — in particular anything in ADR-0025 or ADR-0026 that you do not think you can build as specified.
