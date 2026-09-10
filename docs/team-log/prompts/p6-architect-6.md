# Prompt · phase 6 · architect · invocation 6

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 14 design: OTLP logs + service name
- Sent: 2026-09-09T12:33:24.924Z

---

Slice 14, step 1 (DESIGN). The human has asked for two related observability completions. Produce the step-1 design per CLAUDE.md §6.1 — building blocks touched, interfaces, data-model delta, applicable §10 quality scenarios, proposed arc42 edits, and an ADR if a decision is needed. Do not implement; this is a design.

## What the human asked for

1. **The service is unattributable in Grafana.** Every span and metric currently lands under `service.name = unknown_service:node`. Nothing in the repo sets `OTEL_SERVICE_NAME`, and arc42 §7.3's env table — which the section itself calls "the contract" — has no row for it.

2. **Logs must reach Grafana too.** Today `pino` writes to stdout only (`src/platform/logger.ts`). There is no OTLP log exporter and no Loki shipper. arc42 §8.4 says lines carry `trace_id`/`span_id` "so Loki and Tempo join without a correlation id of their own" — the fields are there, the pipeline is not. The human wants logs actually exported.

## Facts I measured, so you are not designing on assumption

**On the service name — a hardcoded default would silently break the env var.** `NodeSDK` merges its `serviceName` option AFTER the resource detectors run, at `node_modules/@opentelemetry/sdk-node/build/src/sdk.js:173-178` (`this._resource = this._serviceName === undefined ? this._resource : this._resource.merge(resourceFromAttributes({[ATTR_SERVICE_NAME]: this._serviceName}))`), and `envDetector` — which reads `OTEL_SERVICE_NAME` — is in the detector list at sdk.js:115. So `new NodeSDK({ serviceName: 'keyloop-service-scheduler' })` makes `OTEL_SERVICE_NAME` inert. Reading `process.env` inside `telemetry.ts` to guard that would cut against that module's own stated invariant ("this module never reads `process.env` for it", `src/platform/telemetry.ts:10-11`, citing A-04-10).

My non-binding suggestion, which you should rule on rather than accept: treat `OTEL_SERVICE_NAME` exactly as §7.3 already treats `OTEL_EXPORTER_OTLP_ENDPOINT` — an SDK-auto-configured variable that `config.ts` deliberately does not read — giving it a §7.3 row plus the run commands at `README.md:43` and `docker-compose.yml:14`. `keyloop-service-scheduler` is already `INSTRUMENTATION_NAME` at `src/platform/telemetry.ts:47`, so resource and scope names would agree. The counter-argument is that an operator who forgets the variable is back to `unknown_service`, and you may weigh that differently.

**On log export — the packages are already present.** `@opentelemetry/sdk-logs`, `@opentelemetry/exporter-logs-otlp-http` and `@opentelemetry/api-logs` are all already in `node_modules` transitively via `sdk-node`; they would need promoting to direct, exact-pinned dependencies per this repo's convention. `NodeSDK` accepts `logRecordProcessors` (`sdk-node/build/src/types.d.ts:16`) and registers a global `LoggerProvider` from it (`sdk.js:231-242`).

**The transport route is closed, for the reason D-09-3 already records.** `@opentelemetry/instrumentation-pino` patches through `require-in-the-middle`, which native ESM `import` never invokes — the same measurement that killed `instrumentation-http` in slice 09 and produced the hand-written `serverFactory` span. Separately, a pino worker-thread transport (e.g. `pino-opentelemetry-transport`) runs off the main thread and so cannot see the active span context that `logger.ts`'s `mixin` reads. That points at an in-process pino destination emitting through the `@opentelemetry/api-logs` facade, alongside stdout rather than replacing it — but that is a design call, not mine.

## Constraints and hazards the design must address

- **`platform-is-a-leaf` and `otel-sdk-only-in-platform`.** `@opentelemetry/api-logs` is a facade like `@opentelemetry/api`; whether it inherits the facade's "importable anywhere" freedom (slice 09 decision 1) is yours to rule, and dependency-cruiser must be updated to whatever you rule.
- **The lazy-meter hazard, which may repeat.** `telemetry.ts:29-37` records a measurement: a `Meter` obtained before `NodeSDK#start()` is a permanent no-op, while a `Tracer` is not. Whether `logs.getLogger()` behaves like the tracer or like the meter must be MEASURED, not assumed — `main.ts:58-59` constructs the logger after `startTelemetry()`, which may or may not make it moot.
- **arc42 §7.1.** A collector outage must never propagate into a request. A log line that fails to export must not fail the request that produced it, and must not deadlock or drop the stdout line.
- **stdout must survive.** The terminal is the documented way to read logs today (README, WALKTHROUGH); losing it would be a regression.
- **§2.4 and §5.** The slice needs a failing acceptance/integration test committed red by the test-engineer before implementation. Say in the design which directory each new test belongs to under §5's ownership split, and what the acceptance criteria are — an AC that asserts a log record actually arrived at a collector needs a way to observe that, and slice 09's ACs deliberately never read a metric back off a collector (`telemetry.ts:85-95`). If that shape is not available to you, say so and design the AC you can actually assert.
- Note we are on branch `docs/condense` in phase 6 with slices 00a-13 merged; §8's WIP limit and whether this slice should start at all is a scope question. If you believe it should be ruled by the human at a gate rather than started now, say that plainly in your report — I would rather you refuse the slice than design one that should not exist.

Write the slice design to `docs/slices/14-design.md` following the conventions of the existing `NN-design.md` files, and propose (do not yet apply) the arc42 §7.3 / §8.4 edits and any ADR. Report back with your rulings, the ADR you would raise, the acceptance criteria, and anything you are refusing and why.
