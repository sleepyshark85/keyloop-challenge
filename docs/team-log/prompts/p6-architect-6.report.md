# Report · phase 6 · architect · invocation 6

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 14 design: OTLP logs + service name
- Returned: 2026-09-09T12:41:57.039Z
- Duration: 510s

---

Design written and committed: `/home/agentadmin/sources/keyloop-challenge/docs/slices/14-design.md` (1,994 words, under the 3,000 in-flight budget; `docs:budget:check`, `docs:refs`, `docs:check` all green). Commit `e4a6fa9`, pathspec-pinned — the orchestrator's dirty `events.jsonl` was untouched. No PR exists for this slice, so there is no PR comment to post.

## Four measurements, all run before ruling

1. **`serviceName` beats the environment**, confirming your read of `sdk.js:173-178`. Probe: default resource `unknown_service:node`; `OTEL_SERVICE_NAME=from-env` alone → `from-env`; both set → `from-option`.
2. **`logs.getLogger()` behaves like `Tracer`, not `Meter`.** A logger obtained before `NodeSDK#start()` is a `ProxyLogger` that delegates per `emit()`; early- and late-obtained loggers both exported. **The lazy-meter hazard does not repeat** — `telemetry.ts`'s `lazyCounter` dance must not be copied.
3. **`NodeSDK` already configures a logger provider from env when none is passed** (`sdk.js:231-233`), defaulting to `otlp` over **`http/protobuf`** (`sdk.js:274`) — while this project's trace/metric exporters are the JSON `-otlp-http` pair. Left to the default, log records reach `tests/support/otelCollector.ts` as `unrecognised()`. Measured: `OTLPLogExporter` from `@opentelemetry/exporter-logs-otlp-http` POSTs `application/json` to `${endpoint}/v1/logs`.
4. **The whole mechanism, end to end.** One `log.info()` inside an active span through `pino.multistream([stdout, bridge])` produced one stdout line and one OTel record whose own `spanContext` carried the live trace and span ids — read from the active context, not parsed out of the line.

## Rulings

- **Service name: option (D)** — `config.ts` reads `OTEL_SERVICE_NAME`, default `keyloop-service-scheduler`, `main.ts` passes it to `startTelemetry(config)`. I declined your non-binding suggestion (env-only). It fails on the ground you yourself raised, plus one you did not: the AC would set the variable and then assert the variable arrived — it tests the arrangement, not the service. (D) *narrows* §7.3's exception list rather than widening it, keeps `telemetry.ts`'s no-`process.env` invariant, and needs no change to `README.md:43` or `docker-compose.yml` because the default is in the artifact.
- **Log transport: in-process pino destination → `@opentelemetry/api-logs`, multiplexed with stdout.** `BatchLogRecordProcessor`, never `Simple`; the bridge's `write()` must not throw.
- **`@opentelemetry/api-logs` is confined to `src/platform`, not free.** New rule `otel-logs-api-only-in-platform`, arriving with its plant per §5.3. The principled line: `@opentelemetry/api` is free because §8.4 wants spans where the work happens; §8.4 wants log lines made exactly one way, and a module emitting a LogRecord directly puts a line in Loki with no stdout twin. The SDK half needs no change — the existing pattern already matches `sdk-logs` and `exporter-logs-otlp-http`.

## ADR

**One: ADR-0037, drafted inline in §2 of the design, not written to `docs/adr/`.** Four options (instrumentation-pino / worker transport / replace pino / in-process bridge), the first two refused on measurement. The service-name ruling gets **no ADR**, and the design says so explicitly as the record that the bar was checked — it closes off no alternative and restores an existing pattern rather than adding one.

## Acceptance criteria

AC-1 service names itself with no env · AC-2 `OTEL_SERVICE_NAME` still wins (the criterion option B fails) · AC-3 a record arrives · **AC-4 the record's own `traceId`/`spanId` match a span from the same request** — load-bearing, and what a worker transport fails · AC-5 severity survives · AC-6 no PII, no added fields · **AC-7/AC-8 guards** (stdout survives; a dead collector still answers `201`), named as the two exceptions to the red-set property on slice 09's precedent. AC-1 to AC-6 all go red in one commit. New test file `tests/integration/telemetry-logs.test.ts`, test-engineer's; the collector and spawn-helper extensions are also test-engineer's; a bridge unit test is the implementer's.

## One correction to your brief

Slice 09's ACs **do** read metrics off the collector — AC-3 and AC-4 assert `booking_conflicts_total` from `run.collector.metricPoints()` at `tests/integration/telemetry-booking.test.ts:379` and `:457`. The comment at `telemetry.ts:85-95` says only that *the other four* metrics have no AC reading them back. This is load-bearing rather than pedantic: the shape you thought was unavailable is the established one, so the log ACs need no invention — only `/v1/logs` decoding and resource attributes added to `tests/support/otelCollector.ts`, which today decodes span and data-point attributes but drops the resource entirely.

## What I am refusing

**I am not starting the slice, and I decline to rule that it should start.** §8's WIP limit does not forbid it — nothing is open — but this is phase 6, and the decision adds three production dependencies and a forbidden rule during consolidation. That is scope, and the last section of the design puts it to you as a binary rather than leaving it: §8.4 today claims a Loki/Tempo join no code performs, so either it is built and §8.4 becomes true, or **phase 6 must amend §8.4 to retract the claim** — and I have written the retraction sentence there so the "don't build it" branch is costed too. I will not leave the claim standing unbuilt either way. Non-binding recommendation: build it; the mechanism is now measured end to end rather than hoped for.

```json
{
  "role": "architect",
  "outcome": "designed",
  "arc42_sections_touched": [],
  "adrs": [{"id": "0037", "status": "drafted-not-written", "supersedes": null}],
  "quality_scenarios": ["QS-13", "QS-10"],
  "assumptions": ["A-14-1 grafana/otel-lgtm accepts OTLP/JSON on 4318/v1/logs — unverified against the image"],
  "open_questions": ["OQ-14-1 whether the bridge carries pino's err serialisation into exception.* attributes"],
  "dcr_ruling": null,
  "message": "Step-1 design for slice 14 written and committed; four probes decided it, including that logs.getLogger() does NOT repeat the lazy-meter hazard and that NodeSDK's env-default log exporter is protobuf where this project's siblings are JSON. Whether the slice starts is left to the human as a binary: build it, or phase 6 retracts arc42 §8.4's Loki/Tempo claim."
}
```
