# Prompt · slice 09 · reviewer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 09 step 5 review
- Sent: 2026-09-07T20:34:44.839Z

---

# Slice 09 · step 5 — REVIEW. The last slice, and the last review in the project.

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/09-observability`, **PR #20 open**. Pull first. Step 4 is green: seventeen criteria, both architecture controls, `npm test` clean across `nodb` (612), `db` (110) and `perf` (5).

Read `docs/slices/09-design.md` and `docs/slices/09-observability.md` as amended, then the diff `git diff main...HEAD`.

**This is the close-out slice. Nothing after it catches what you let through** — no later slice, no later review, and the human's gate is the only thing between this and done.

## What this slice claims

- **Telemetry** — the candidate read and the insert as separate spans; `booking_conflicts_total{resource}` with a **single increment site**, made countable by F-06-1's extraction into `src/application/attemptLoop.ts`; `trace_id`/`span_id` log correlation; the OTel SDK confined to `src/platform` by a new dependency-cruiser rule with a QS-10 plant.
- **The contract** — `buildOpenApiDocument()`, `npm run docs:openapi`, the committed `docs/api/openapi.json` diffed byte for byte by AC-7, and the cURL harness.
- **The budget** — QS-14 in a third `perf` vitest project with its own container, so it cannot be measured beside the twenty-racer concurrency suite.

## Where I would look hardest, and why

1. **The mutation number is the one this slice owes.** Slice 08 merged `src/http/routes/availability.ts` at **71.43 %** on a human override, explicitly on the understanding that slice 09 repays it. The implementer measured **37/42 = 88.10 %** file-scoped, with five predicted survivors. A full `npm run mutation` is running now and I will hand you the aggregate — **check the per-file figures yourself against §10's 0.75 rather than the aggregate**, because `slice:check` applying the threshold to an aggregate was O-64, found this week.

2. **`attemptLoop.ts` is the riskiest change in the diff.** It merges two write paths that ADR-0027 says behave differently — reschedule tries the incumbent pair first, booking shuffles immediately. A parameterised loop, not a lift. Does the extraction preserve both behaviours exactly? The concurrency suite is the evidence, and QS-1 through QS-5 are what this whole system exists to defend.

3. **The single-increment-site claim** is asserted by a QS-12 marker in `tests/architecture/ambiguity-containment.test.ts` by file-list equality. Does the marker actually constrain what it claims, or does it pass for a reason unrelated to the rule?

4. **AC-12 passes at red and always did** — ruled `T-09-4` (a). It is a **standing guard**, not a criterion this slice earns, and §11 records the *headroom* as the regression baseline. Is that reclassification honest in the test as written, or does the test still read as though the slice earned it?

5. **Two DCRs changed tests you should read as changed**: `I-09-2` fixed a fixture assuming an ordering `ORDER BY id` does not guarantee across namespaces; `I-09-3` **split** a contract case that pinned the exact `400` AC-6b supersedes. A split case is where a guarantee quietly goes missing.

6. **`ADR-0035` is `proposed` with no slice behind it** — §6(b) wants a backlog slice and there is no later slice. I have routed that to the gate; say whether you think the counter's semantics should be settled *before* merge instead.

## Your authority and its limits

You may **block a merge** and raise a DCR. You may **not** change the design — a design problem is a DCR, not an edit. Check the diff against the design and the criteria, dependency-cruiser, commit discipline (§7: exactly one red commit, every implementer commit green, ~150 lines), and test ownership (§5) — the implementer raised two DCRs rather than editing tests it does not own, and that is worth verifying rather than assuming.

**A review with no findings on a slice this size is not a clean bill of health; it is a review that did not look.** Equally, do not manufacture findings — say what you checked and found sound.

## Land it

Post one PR comment on #20, `**reviewer · step 5 — REVIEW**`. **~150 words, short AND self-contained**: one italic framing line, a gloss inline at every reference, the findings ranked, and your merge verdict. Cut narration; cite `file:line` and shas.

Return the structured report with every finding, its severity, and whether you block.
