# Prompt · slice 04 · architect · invocation 5

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 04 step 7 as-built
- Sent: 2026-09-06T08:09:06.205Z

---

Slice 04 step 7 — AS-BUILT. Branch `slice/04-candidate-allocation-and-retry`, PR **#13**, CI green on `86af39b` (all three jobs). Nobody else is working in the tree.

Reconcile arc42 to what actually merged. §6 puts this after the gate; under the standing delegation the gate is mine to hold and I am holding it open until this is done, because `slice:check 04` reports **"arc42 reconciled to as-built — the architect has not run step 7"** and that is one of four remaining FAILs.

**What shipped that the design did not describe.** These are recorded findings, not discoveries you need to make — reconcile them, do not re-litigate:

- **I-04-11** — you ruled this an as-built correction rather than a supersession. `loadConfig` does *not* emit ADR-0021's startup `warn`; it cannot, because the logger is built from its return value. It ships as `configWarnings(config)`, a pure function returning strings, called from `src/main.ts`. §5.2 is the instrument, it is in the declared scope, and you said the as-built shape is *better* than the ADR's stated one because a pure function is assertable where a `logger.warn` inside `loadConfig` would have been observable only through a stream. Record it that way.
- **I-04-13** — §3's carrier needed **two** brand casts, not the three the design predicted, and no index assertion at all; the guard and the cast collapsed into one reachable branch. The shuffle ships in Fisher–Yates *selection* form, not the in-place swap, because the swap would need the two `noUncheckedIndexedAccess` assertions the tuple carrier was chosen to remove. Distribution measured uniform to ±1.7% across 8 bays over 100,000 seeds.
- **T-04-8** — `src/main.ts:46` is now guarded by an outside-in assertion; the general claim in `stryker.config.mjs`'s comment (every line of `main.ts` is guarded by an outside-in assertion or by nothing, and the score cannot tell which) is still undischarged for every other line.
- The test-engineer added a **`logLevel: null` seam** to `tests/support/service.ts` so one assertion runs the artifact at its own default log level rather than at `trace`. That is a deployment-observable property of the warning and may belong in §7.3 next to `BOOKING_SEED`; your call.

**Also close A-04-10**, which is yours and which you raised: §7.3's preamble claims environment is "read once in `src/platform/config.ts`" while listing `OTEL_EXPORTER_OTLP_ENDPOINT`, which that file does not read.

**Two things I want you to be honest about rather than tidy.**

1. **Where the design was wrong, say the design was wrong.** Three of the items above are places the step-1 design predicted something the code refused. arc42 is the as-built record; a §5.2 that reads as though the design had been right all along is worth less than one that says what changed and why the code won.
2. **The slice design shrinks at step 7** — 3,000 in-flight to 1,200 merged, enforced by the ratchet. Anything in `docs/slices/04-*.md` that is still load-bearing must be *moved*, not compressed away. You already lost one record this way and caught it: ADR-0019's breach was recorded only in a slice design and you moved it into the ADR before it evaporated. Do that pass again, deliberately, and tell me what you moved and what you let go.

**Constraints.** Word budgets enforced; `npm run docs:budget -- --check --ratchet`, `docs:refs`, `docs:adr-check`, `docs:check` and `npm run test:tools` all stay green. No `src/`, no `tests/`, no `tools/`. Accepted ADRs are immutable. Commit `docs(arc42):` / `docs(04):`, ~150 lines each.

**Report:** what you reconciled, what you moved out of the slice design and what you let go, and — separately — anything you found that this did not ask about. Also give me your one-paragraph read on whether slice 04 is fit to merge, since I hold the gate.
