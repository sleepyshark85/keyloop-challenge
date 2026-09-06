# Prompt · slice 04 · architect · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Rule the slice-02 flake DCR
- Sent: 2026-09-06T07:16:11.430Z

---

A DCR, raised by the implementer at slice 04 step 4 (green, all 16 red assertions now pass, CI run 34018397845: `suite` success, `red-proof` success). Rule it. The human is asleep; you rule under the standing delegation and it is provisional until the gate. This blocks step 5, so be quick and be decisive.

**The claim.** `tests/concurrency/no-technician-overlap.test.ts` — slice 02, QS-2 — states in its own header that *"Candidate ordering is deterministic, so every racer attempts the same pair first"*, and closes at line 208 with an assertion that the refusal path shows **at least 2 attempts**, commented *"the first attempt fails on the bay, the second on the technician."*

ADR-0009's Order-C removes exactly that premise. The implementer's analysis: with 24 bays and 1 technician, a loser whose first draw is not the winner's bay conflicts on the **technician** at attempt 1 and refuses correctly, wasting no attempt. Only a loser that happens to draw the winner's bay produces a second attempt — `1 − (23/24)¹⁹ ≈ 56%`. **Measured: 3 failures in 5 local runs of that file. It passed in CI.**

So a slice-02 test is now a coin flip, and it is green in the run you would otherwise merge on.

**What to rule, and the three things that make it non-obvious:**

1. **Is this (a), (b) or (c)?** To rule (c) you must name the AC, §10 quality scenario or §2 invariant that would fail — CLAUDE.md §6, and preference is not a blocker. Note what is genuinely at stake: the assertion is not merely stale, it is *flaky in the passing direction*, and QS-2 is what it claims to assert. A test that passes 44% of the time is not evidence of anything, and §2.4's principle — "a test that has never failed is not evidence" — has an obvious dual that this project has not yet had to state.
2. **The remedy is the test-engineer's to write, not yours and not the implementer's** (§5, NON-NEGOTIABLE, symmetric). The implementer correctly raised rather than touched it. Say precisely what must hold; do not write the assertion, and do not let your ruling smuggle in the test text.
3. **The implementer proposes a terminal-state claim in place of the two-attempt claim** — the same move that narrowed ADR-0021 an hour ago. Judge the finding and the remedy separately (§6): the measurement can be right and that remedy still wrong, or right but narrower than offered.

**Also decide the blast radius, because this is the part a per-test fix would miss.** Order-C is now live for every racer in the system. Any other test, in any slice, whose reasoning depends on "every racer attempts the same pair first" has the same defect and is equally green today. Go and look — `tests/concurrency/`, `tests/acceptance/`, `tests/integration/` — and say what you found, including *nothing else* if that is the answer. A finding you checked and withdrew is worth as much as one you kept; you demonstrated that with the lock-obligation guard.

**Three more items from the implementer's report, for you rather than the reviewer:**

- **ADR-0021 and slice-04 design §4 both say `loadConfig` emits the startup `warn`. That sentence is false as built** — the logger is constructed *from* `loadConfig`'s return value, so there is no logger at the moment `BOOKING_SEED` is read. It ships as `configWarnings(config)` in `src/platform/config.ts`, emitted through pino in `src/main.ts`. 0021 is now **accepted and therefore immutable**, so decide what the correct instrument is: a superseding ADR, an arc42 as-built correction at step 7, or something else. Do not edit an accepted ADR.
- **ADR-0022's proposed guard would not pass today**: `config.ts` reads five env vars, §7.3 lists six. `OTEL_EXPORTER_OTLP_ENDPOINT` is read by no code — the OTel SDK auto-configures from it at slice 09. The set-equality check needs an exemption for variables a *library* reads. You recommended that guard; say whether it survives.
- The implementer reports it nearly got the carrier wrong one level below the design: `tests/unit/domain/candidates.test.ts` compiled and passed under vitest while `tsc` rejected three lines, because vitest transpiles without typechecking. **A green unit run is not a green commit.** It amended rather than leaving the commit. Worth an arc42 §11 row or not — your call.

**Report:** the ruling with its outcome letter and named criterion, the blast-radius result, the three decisions above, the commits, and separately anything you found that none of this asked about.
