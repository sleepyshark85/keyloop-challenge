# Prompt · slice 14 · reviewer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 14 step 5: review the diff
- Sent: 2026-09-09T14:29:39.908Z

---

Slice 14, step 5 (REVIEW). Review the slice's diff against its design and acceptance criteria, per CLAUDE.md §6.5. You may block a merge and raise a DCR; you may **not** change the design, and you may not fix what you find — a design problem is a DCR, not a commit.

Branch `slice/14-otlp-logs-and-service-identity`, PR [#22](https://github.com/sleepyshark85/keyloop-challenge/pull/22), head `c061dc6`. The diff to review is `3364cc0..c061dc6`.

Read first: `docs/slices/14-otlp-logs-and-service-identity.md` (the slice, AC-1 to AC-8) and `docs/slices/14-design.md` (the design of record, including its §2 ADR-0037 inline draft, its "what cannot fail" list, and the **DCR-14-1 ruling** appended at commit `78be828`).

**History you need, because it bears on what to look at hardest:**

- Red commit `fe574ea` (test-engineer), observed red in CI run 34359143223 — `suite (Testcontainers)` failed, `red-proof` passed. AC-1 to AC-6 red, AC-7/AC-8 green as guards. §2.4 satisfied and that commit stands untouched.
- Six implementer commits `7f5752d`→`fa2eff9`: deps + the `otel-logs-api-only-in-platform` rule, `config.ts`, `telemetry.ts`, the new `src/platform/otelLogStream.ts`, `logger.ts` composition.
- **DCR-14-1**, raised by the implementer mid step 4 against two red assertions in the test-engineer's file, ruled **(a)** by an architect: the bridge was correct, the test's correlation selector was wrong. The slice returned to step 3; the test-engineer corrected its own file at `c061dc6` under four binding constraints, the sharpest being **an uncorrelatable record must fail, not be skipped**.

**Where the risk actually is — verify these rather than take my word, and dismiss any that I have wrong:**

1. **The non-throwing contract.** `pino.multistream`'s `write()` calls `stream.write(data)` with no try/catch, so a throwing sink propagates onto the request's stack. §7.1 and AC-8 rest **entirely** on `otelLogStream.ts`'s `write()` never throwing — its `JSON.parse` and its `emit()` both. Check that this holds for malformed input, not only for a dead collector.
2. **The DCR correction is the place a loosening would hide.** The test-engineer says it verified constraint 3 by injecting a synthetic unmatchable record and confirming the test failed and named it, then reverted the probe. Check the committed helper actually behaves that way — that `lineMatchesRecord` cannot return a vacuous pass, that AC-5 asserts *every* warn/error line has a record rather than at least one, and that AC-4's trace/span equality was preserved as an **additional** constraint and not relaxed to make matching easier. AC-6 had already passed vacuously once in this slice and was caught; that is the failure mode with form here.
3. **Test ownership (§5), symmetrically.** Confirm no implementer commit touched `tests/integration/`, `tests/architecture/`, `tests/support/` or any other outside-in directory, and that the test-engineer's `c061dc6` touched only its own file and nothing under `src/`, `tests/unit/`, `package.json` or `.dependency-cruiser.js`.
4. **Commit discipline (§7).** Exactly one red commit, test-engineer's. Every implementer commit green on its own. Conventional Commits referencing the slice. Anything over ~150 lines that should have been two.
5. **The plant.** The slice's DoD requires `otel-logs-api-only-in-platform` to arrive with a plant that fails if the rule is deleted. The test-engineer wrote the plant, the implementer wrote the rule — check they actually meet, including that the rule denies `src/main.ts` (the architect ruled `api-logs` gets **no** composition-root exemption, unlike the SDK).
6. **Mutation survivors on changed files**, per §6.5 and §10. `otelLogStream.ts` is new code carrying a severity mapping and an attribute allowlist — exactly where survivors hide. Run Stryker on the changed files and audit what survives.
7. **Dependency-cruiser clean** (`npm run lint:arch`).

Two open items already known, which you should judge rather than rediscover: the design's prose calls AC-2 "the criterion option (B) fails", which is imprecise — AC-2's trace/metric halves pass with zero implementation because `NodeSDK`'s `envDetector` reads `OTEL_SERVICE_NAME` regardless of application code, so **AC-1** is the discriminating criterion. And **ADR-0037 is still an inline draft in the design, not a file in `docs/adr/`**, which the slice's own DoD requires before done. Both are architect work at step 7; say whether either should block the gate.

Report your findings with severity, each naming the AC, QS or §2 invariant at stake where you would block. Per §6, disagreement is expected and a reviewer with no findings reads the same way a consensus round with no objections does — but do not manufacture findings either; if the work is sound, say so and say what you checked to establish it.
