# Prompt · slice 05 · implementer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 05 step 4 GREEN
- Sent: 2026-09-06T09:39:59.507Z

---

Slice 05 step 4 — GREEN. Branch `slice/05-cancellation`, PR **#14**. Read the amended `docs/slices/05-design.md` (commit `2901fb7`), the narrowed **ADR-0023**, and the five red test files before writing anything.

The red is `1e9e06c`, CI run 34025120072. **I verified it from the artifact myself: 540 tests, 10 failed, all 10 `AssertionError`, zero collection errors, zero failures under `tests/unit/`**, spread across exactly the five files claimed.

**All three of your objections were upheld.**

- **I-05-1 → AC-5, ruled before step 3 as you asked.** Both `FST_ERR_CTP_EMPTY_JSON_BODY` and `FST_ERR_CTP_INVALID_JSON_BODY` render `400 /problems/malformed-request`. The architect re-measured independently and extended your finding: the invalid-JSON case fires on the **existing booking route**, live today. Implement it **named by code**, not by a `statusCode < 500` disjunction — `server.ts` already records why the broader form was deleted after mutation testing, and the architect cited that reason back. The residue you flagged (400 is correct, 200 would be friendlier on a bodyless route) is **OQ-05-2**, deferred to slice 10.
- **I-05-2 upheld on both findings** — the ADR's self-contradiction, and that the QS-12 marker route is genuinely closed by `PERMITTED_FILE`'s exactly-one-file assertion. **Narrower remedy: `ResourceLock` is ruled as F-05-1's remedy but owned by slice 06**, under ADR-0019, because at slice 05 its only consumer is a call site already written and already correct. **Do not build the brand now.** Write the exempt function so the next slice can add it cheaply.
- **I-05-3 upheld**, and the architect recorded that it lands hardest because it is its own §4 argument turned on the `CASE`. AC-3's no-column-changes half is now asserted with the test-engineer's `to_jsonb(appointment)` form rather than a fixed projection.

**Four things the test-engineer measured that constrain you, all in the test file headers:**

1. **AC-1 is an allocator test.** Drop `status <> 'cancelled'` from `freeResources`'s overlap predicate and free bays after cancellation go 1 → 0; driven through AC-1's three requests, the shipped build gives 409 / 200 / **201** and the mutant gives 409 / 200 / **409**. The refusal and the cancellation are identical under both — the final assertion is the only thing separating them. §6.5 already records that this predicate and the constraint's predicate live in two files with nothing forcing them to agree.
2. **The concurrency file discriminates ADR-0023's rejected Option A**, measured: your bare `UPDATE` answers in 3 ms under a held bay advisory lock; the Option A mutant blocks and dies at `57014` after 5 s. If you take the locks on the cancel path for uniformity, that file goes red at step 1.
3. **AC-5 is red on the CTP path, not on routing** — Fastify consults the content-type parser *before* the router, so both halves fail at `500`, neither at `404`. The test-engineer's first draft predicted routing, measured it, and corrected its own comment rather than leaving the prediction standing.
4. **`postCancellation` sends no `content-type` and no body**, deliberately, because with AC-5 in place a reflexive `application/json` would be answered `400` under OQ-05-2.

**What I will ask you for, and what earns the report.** Slice 04's most valuable output from you was the section on where the design did not survive contact with the code — it produced three findings, one of which changed an ADR. Same section here. Also: you predicted your own mutation survivors at slice 04 and two of the eight were exactly what you said; do that again.

**Constraints.** `tests/unit/` is yours; the outside-in directories are NOT — §5, symmetric, NON-NEGOTIABLE. If a red test is wrong, raise a DCR; do not edit it. Every commit green **and typechecking** — you found at slice 04 that vitest transpiles without typechecking, so a green unit run is not a green commit; run `tsc --noEmit` before each. `feat(05):` / `refactor(05):`, ~150 lines.

**Report** the standard JSON plus the final CI run with all three jobs green, your predicted survivors, and the design-versus-code section.
