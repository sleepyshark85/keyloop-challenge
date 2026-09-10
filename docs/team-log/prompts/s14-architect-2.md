# Prompt · slice 14 · architect · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 14 step 7: as-built reconciliation
- Sent: 2026-09-09T15:40:31.413Z

---

Slice 14, step 7 (AS-BUILT). The human approved at Gate E on 2026-09-09 after running the exploratory pass and observing the traces in Grafana. Reconcile arc42 to what is actually merging, and write the ADR. Nothing has merged yet — you are working on the slice branch, before the merge, so `main` receives a coherent slice rather than a slice plus a follow-up.

Branch `slice/14-otlp-logs-and-service-identity`, PR [#22](https://github.com/sleepyshark85/keyloop-challenge/pull/22), head `67622ea`. CI green on `710e1f6`; `slice:check 14` is down to three failures, of which yours are "arc42 reconciled to as-built".

Read `docs/slices/14-otlp-logs-and-service-identity.md`, `docs/slices/14-design.md` (its §2 holds ADR-0037's inline draft, and the DCR-14-1 ruling is appended at `78be828`), the four PR comments, and the diff `3364cc0..67622ea`.

**Four obligations. The first is load-bearing in a way it was not when the design was written.**

1. **ADR-0037 must become a file in `docs/adr/`.** It is drafted inline in design §2 with four options, two refused on measurement (`@opentelemetry/instrumentation-pino` never patches under native ESM because `require-in-the-middle` is not invoked — the same finding as D-09-3; and a worker-thread transport cannot see the active span context, which is what AC-4 asserts). **The implementer's PR comment now cites ADR-0037 as settled reasoning**, so leaving it a draft leaves a dangling citation on the graded artifact. It is also an explicit item in the slice's own Definition of Done.

2. **arc42 §7.3 needs the `OTEL_SERVICE_NAME` row.** This is the omission the reviewer caught and the one I would not let slip: §7.3 calls its table "the contract", the slice's goal statement quotes that phrase, and AC-2's own wording calls it "§7.3's new row" — while `docs/arc42/07-deployment-view.md:68` has no such row. The sentence above the table also needs amending: `config.ts` now reads `OTEL_SERVICE_NAME`, leaving `OTEL_EXPORTER_OTLP_ENDPOINT` as the sole SDK-auto-configured exception.

3. **§8.4, §10.2, §11.1** as the design proposed: the Logs row becomes stdout **and** OTLP on the same call with the trace-context claim restated as a property of the record rather than of the line; QS-13 extended (you ruled extend rather than add a QS-15); `D-09-3`'s §11.1 entry gains that it also disqualified `instrumentation-pino`.

4. **`docs/WALKTHROUGH.md` — one new scenario, and this is new scope the human explicitly asked for.** Nothing in that file became false: its Scenario 2 prints a `booking.conflict` stdout line that is still written exactly as shown, guarded by AC-7. The gap is that the document's premise is "run it, then make it do every thing it claims", and the system now claims something no scenario verifies — that a log line's `trace_id` joins it to its trace in Tempo, and that all three signals are attributable to `keyloop-service-scheduler` rather than `unknown_service:node`. Scenario 2 is the natural anchor since it already prints a line the reader can now go and find. **`README.md` and `docs/WALKTHROUGH.md` are the scribe's under §4** — do NOT edit them; a scribe is being dispatched after you for both, and it needs your §7.3 row to exist first so it can cite it. Say in your report what you want the scribe to say, and leave it.

**Constraints:**

- **§4: an ADR's decision is immutable, its prose is not.** ADR-0037 is new, so this is a first writing, not an amendment — but check `docs:adr-check` passes and that you have not silently altered anything ADR-0010 (otel-lgtm as the destination) or ADR-0035 decided.
- Record what actually merged, not what was designed. Two things diverge from the design and both belong in the record: the design's rationale calling **AC-2 "the criterion option (B) fails"** is imprecise — AC-2's trace and metric halves pass with zero implementation because `NodeSDK`'s `envDetector` reads the variable regardless of application code, so **AC-1** is the discriminating criterion; and **DCR-14-1** happened, was ruled (a), and cost a return to step 3 with no implementation change.
- Book the residuals honestly: the reviewer's open MINOR (the seam `StreamEntry`'s `level` is asserted by no test and is invisible to Stryker, whose ObjectLiteral mutator only replaces the whole entry), `OQ-14-1` (deferred to backlog — the bridge carries no `exception.*` attributes from pino's `err` serialisation), and `telemetry.ts`'s 77.78% mutation with its 8 survivors that only the Testcontainers suite kills.
- One item is a **tooling defect worth recording rather than working around**: `tools/slice/check.mjs` baselines "arc42 edits match the declaration" on `merge-base(main, HEAD)` instead of the slice's start commit, so it attributes 14 pre-slice phase-6 commits' arc42 work to slice 14 and names nine files this diff does not touch. Decide whether that is a §11.1 residual, a backlog slice, or neither — but do not let it be silently absorbed, because the next slice inherits it.

Commit your own files only (`docs/arc42/**`, `docs/adr/**`, and the slice file if it needs the as-built row), `docs(14): …`, and push. Do not merge and do not touch `README.md`, `docs/WALKTHROUGH.md`, `src/` or `tests/`.

Report what you changed, the ADR's number and status, what you booked as residual, and your ruling on the `check.mjs` baselining defect.
