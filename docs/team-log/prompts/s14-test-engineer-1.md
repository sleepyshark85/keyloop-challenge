# Prompt · slice 14 · test-engineer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 14 step 2: agree or object
- Sent: 2026-09-09T12:49:09.157Z

---

Slice 14, step 2 (AGREE). Review the design and either agree or object, per CLAUDE.md §6 step 2. **Do not write or edit any file, including tests.** This step produces verdicts and reasoning only; the red commit is step 3 and comes after this.

Read `docs/slices/14-design.md` (the design of record, committed at `e4a6fa9`) and `docs/slices/14-otlp-logs-and-service-identity.md` (the slice file, `3364cc0`). Branch `slice/14-otlp-logs-and-service-identity`.

Your role bars you from reading `src/`. Review what you own: whether AC-1 to AC-8 are **assertable**, whether the red set is genuinely red for the reason claimed, and whether the test artifacts assigned to you in the design's §4 ownership table can actually carry the criteria.

Context you need that is not in the design:

- **The human ruled the slice starts** (2026-09-09, logged as `gate.decided` / scope / build). The design had refused to rule its own scope. Nothing else in the design was overridden.
- **A-14-1 is closed.** The orchestrator probed the running `grafana/otel-lgtm`: a hand-built `resourceLogs` POST to `4318/v1/logs` returned `200 {"partialSuccess":{}}`, and the record came back out of Loki via Grafana's datasource proxy with `trace_id`, `span_id`, `service_name`, `severity_text` and `severity_number` as stream labels. That is evidence about the image on the wire; it says nothing about `src/`, and it is not a substitute for any AC.
- The architect corrected an error of mine that bears on your work: slice 09's ACs **do** read metrics back off the collector (`tests/integration/telemetry-booking.test.ts:379` and `:457`, via `run.collector.metricPoints()`). So the shape you need is established, and the design says `tests/support/otelCollector.ts` needs `/v1/logs` decoding plus resource attributes on all three signals — it decodes span and data-point attributes today but drops the resource entirely.

Things worth your scepticism, named so you can dismiss them if I am wrong rather than treat them as a checklist:

- **AC-4 is the load-bearing criterion.** It asserts the exported record's own `traceId`/`spanId` equal those of a span from the same request. Can your test actually establish "the same request" on both sides, or does it need a correlation the design has not given you?
- **AC-8's dead port** is the design's own named weakness: it relies on a fast `ECONNREFUSED`, and on a host that blackholes instead, the exporter's 10 s timeout is what returns, so the criterion measures patience rather than isolation. Is that acceptable to you as written?
- **AC-5's severity mapping** is transcribed into the test, with nothing tying it to the bridge's table — the design admits this. Is a transcribed table a test or a duplicate?
- **AC-6** asserts a negative ("no exported record names a customer, a VIN or a vehicle description"). Negatives are easy to write and easy to pass vacuously.
- The design gives you a **new** `tests/integration/telemetry-logs.test.ts` rather than growing slice 09's 700-line file, and one narrow `otelServiceName` option on `tests/support/service.ts` (the helper forwards no arbitrary environment, by design). AC-2 needs a *different* value of that variable in the same suite — check that the spawn helper's shape supports it.

Per §6's adjudication rules: **disagreement is expected and is not failure.** An adjudication round that has never produced a disagreement is deference, not consensus. Where you object, state the finding and your proposed remedy **separately** — a correct measurement does not make the remedy proposed alongside it correct, and the architect may accept one and refuse the other. Give one verdict (AGREE or OBJECT) per point, with reasoning. Return your findings in your structured report; the orchestrator routes them to the architect.
