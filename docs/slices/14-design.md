# Slice 14 — design

**Not yet a slice.** There is no `14-*.md` slice file and no `id:`, so nothing counts or schedules on
this. It is step 1 produced ahead of the scope ruling in the last section, which is the human's.

Two completions of one claim. arc42 §8.4 says log lines carry `trace_id`/`span_id` *"so Loki and Tempo
join without a correlation id of their own"*, and §7.3 calls its variable table *"the contract"*. Neither
is true today: `pino` writes to stdout only, and every signal lands under `service.name =
unknown_service:node`. **So §8.4 is as-designed prose describing a pipeline that does not exist** — the
one thing phase 6's as-built pass exists to catch.

## Building blocks touched · data-model delta: none

`src/platform/config.ts` (one optional field, one default) · `src/platform/telemetry.ts` (a parameter,
a log processor) · `src/platform/logger.ts` (stream composition) · **new** `src/platform/otelLogStream.ts`
· `src/main.ts` (passes config to `startTelemetry`) · `package.json` (three transitive packages promoted
to direct, exact-pinned `0.222.0` beside their siblings) · `.dependency-cruiser.js` (**one new rule**, §3).
Layering direction unchanged; every new import is inside `src/platform`, which is already a leaf.

## 1 — The service names itself, and `OTEL_SERVICE_NAME` still wins

Four options, and the measurement decides between them. Measured on the pinned `sdk-node@0.222.0`, by
probe: the default resource is `unknown_service:node`; `OTEL_SERVICE_NAME` alone yields `from-env`; **with
both set, `new NodeSDK({ serviceName })` beats the environment** — `from-option` — confirming
`sdk.js:173-178` merges the option *after* `envDetector` runs.

- **(A) environment only** — a §7.3 row and nothing else. An operator who forgets is back to
  `unknown_service`, and worse, the criterion asserting it would set the variable and then assert the
  variable arrived: it tests the arrangement, not the service.
- **(B) `serviceName` hardcoded in `NodeSDK` options** — never regresses, but makes `OTEL_SERVICE_NAME`
  **inert**, measured. A §7.3 row for an ignored variable is a contract that lies.
- **(C) `telemetry.ts` reads `process.env.OTEL_SERVICE_NAME ?? '…'`** — cuts against that module's own
  stated invariant (`src/platform/telemetry.ts:10-11`, A-04-10).
- **(D, ruled) `config.ts` reads it with a default, `main.ts` passes it to `startTelemetry(config)`.**

**Ruling: (D).** `OTEL_SERVICE_NAME`, optional, defaulting to `keyloop-service-scheduler` — already
`INSTRUMENTATION_NAME` at `src/platform/telemetry.ts:47`, so resource and scope agree. It is the only
option that gets both halves the request weighed: the forgetful operator is still named, and the variable
still works. It also *narrows* §7.3's exception list rather than widening it — `config.ts` becomes the
reader again, and `OTEL_EXPORTER_OTLP_ENDPOINT` stays the single SDK-auto-configured name. `main.ts`
already calls `loadConfigOrExit()` before `startTelemetry()`, so nothing reorders. Neither `README.md:43`
nor `docker-compose.yml` needs the variable, because the default is in the artifact.

**No ADR**, and this line is the record that the bar was checked: (D) closes off no alternative anyone
takes twice, reverses in one line, and adds no second pattern — it restores §7.3's existing one.

## 2 — Logs cross into OTel **in-process**, on the emitting thread — ADR-0037

The two obvious routes are both closed, and the reasons are different.

`@opentelemetry/instrumentation-pino` patches through `require-in-the-middle`, which native ESM `import`
never invokes — `D-09-3` verbatim, the same measurement that left `http.Server.prototype.emit` unpatched
and produced the hand-written `serverFactory` span. A worker-thread transport
(`pino-opentelemetry-transport`) runs off the main thread, where `AsyncLocalStorage` does not reach: it
must **re-derive** trace context by parsing `trace_id` out of the line's own text, which is a correlation
id of its own — the exact thing §8.4 claims this design does not need.

**Ruling: an in-process `pino` destination that emits through the `@opentelemetry/api-logs` facade,
composed with stdout by `pino.multistream` — added alongside stdout, never replacing it.** Measured
end to end by probe: one `log.info()` inside an active span produced **one stdout line and one OTel
record**, and the record's own `spanContext` carried the live trace and span ids, read from the active
context rather than from the line.

Three details are load-bearing and each is measured, not assumed.

- **`logs.getLogger()` behaves like `Tracer`, not like `Meter`.** A logger obtained *before*
  `NodeSDK#start()` is a `ProxyLogger` that delegates per `emit()`; both an early- and a late-obtained
  logger exported correctly. **The lazy-meter hazard does not repeat**, and `telemetry.ts`'s
  `lazyCounter` dance must not be copied here. (`main.ts:58-59`'s ordering is correct anyway; this makes
  it belt-and-braces rather than the guarantee.)
- **The exporter must be named explicitly.** `NodeSDK` *already* configures a logger provider from the
  environment when none is given (`sdk.js:231-233`), defaulting to `otlp` over **`http/protobuf`**
  (`sdk.js:274`) — while the trace and metric exporters this project passes are the JSON `-otlp-http`
  pair. Left to the default, log records would speak a protocol `tests/support/otelCollector.ts` decodes
  as `unrecognised()`. Pass `OTLPLogExporter` from `@opentelemetry/exporter-logs-otlp-http`: measured, it
  POSTs `application/json` to `${endpoint}/v1/logs`, so all three signals share one protocol and one
  decoder.
- **`BatchLogRecordProcessor`, never `Simple`** (§7.1). The write must queue and return; an export
  failure is dropped by the SDK's own pipeline, and the bridge's `write()` must not throw — a throw
  inside a `multistream` write is on the request's stack. `NodeSDK#shutdown()` already flushes the
  logger provider (`sdk.js:250-252`), so `main.ts`'s shutdown needs no change.

### ADR-0037 (draft — **not yet written to `docs/adr/`**)

> **Title:** Log records cross into OpenTelemetry in-process, on the thread that emitted them.
> **Status:** proposed · **arc42:** §7.3, §8.4 · **proposed-by:** architect · **decided-by:** human.
> **Options:** (A) `@opentelemetry/instrumentation-pino`; (B) a `pino` worker-thread transport;
> (C) replace `pino` with the OTel Logs API; (D, chosen) an in-process `pino` stream bridging to the
> `api-logs` facade, multiplexed with stdout.
> **Why:** (A) cannot patch a native-ESM entry point (`D-09-3`, measured) and its documented fix is a
> process-launch flag no file under `src/` controls. (B) cannot read the active context across a thread
> boundary, so §8.4's "without a correlation id of their own" becomes false. (C) loses stdout and
> contradicts TC-8, and Fastify's own lifecycle lines share the instance.
> **Consequences:** the log record's trace context is the *real* one, so Grafana joins Loki to Tempo on
> it; stdout survives on its own stream; the bridge runs on the request's stack, so its cost is the
> request's — bounded by a batch processor and a non-throwing `write`. Bad: the pino-level → OTel
> `severityNumber` mapping is hand-written and lives in one file.

## 3 — `@opentelemetry/api-logs` is **confined**, not free

`otel-sdk-only-in-platform`'s pattern already matches `sdk-logs` and `exporter-logs-otlp-http`, so the
SDK half needs no change. `api-logs` is a facade and would inherit `@opentelemetry/api`'s freedom by
default (slice 09 decision 1) — **ruled otherwise.** `api` is free because §8.4 *wants* spans created
where the work happens; §8.4 wants log lines created exactly one way, and a module emitting a LogRecord
directly would put a line in Loki with no stdout twin. New rule **`otel-logs-api-only-in-platform`**,
`src/platform` only (not `main.ts`, which has no need), **and it arrives with its plant** in
`tests/architecture/layering.test.ts` — §5.3's rule, and QS-10's claim is that the rules fire.

## 4 — Ownership

| Artifact | Owner |
|---|---|
| `tests/integration/telemetry-logs.test.ts` (**new**, not grown onto slice 09's 700-line file), `tests/support/otelCollector.ts` (decode `/v1/logs`, and resource attributes on all three signals), `tests/support/service.ts` (one narrow `otelServiceName` option — the helper forwards no arbitrary environment, by design), `tests/architecture/layering.test.ts` | **test-engineer** |
| `src/platform/**`, `src/main.ts`, `package.json`, `.dependency-cruiser.js`, `tests/unit/platform/otelLogStream.test.ts` | **implementer** |
| `README.md`'s optional-variable sentence | **scribe** (§4) |
| arc42 §7.3, §8.4, §10.2, §11.1 · ADR-0037 | **architect**, step 7 |

## Acceptance criteria

- **AC-1** — Given the service spawned with **no** `OTEL_SERVICE_NAME`, when the collector's exports are
  read, then the resource of the trace, metric **and** log exports each carries
  `service.name = keyloop-service-scheduler`, and none carries `unknown_service:node`.
- **AC-2** — Given the service spawned with `OTEL_SERVICE_NAME=probe-override`, then the resource carries
  `probe-override`. This is what makes §7.3's new row true rather than decorative, and it is the
  criterion option (B) fails.
- **AC-3** — Given a booking request, when the collector's **log records** are read, then at least one
  record corresponds to a line that request produced.
- **AC-4** — Given the same request, then that record's **own** `traceId` and `spanId` are non-empty and
  equal those of a span the same request produced. *The load-bearing criterion: it is what a worker-thread
  transport fails and what §8.4's Loki/Tempo join rests on.*
- **AC-5** — Given a request producing a `warn` or `error` line, then the exported record's
  `severityNumber`/`severityText` match `pino`'s level rather than one hardcoded default.
- **AC-6** — Given a booking, then no exported record names a customer, a VIN or a vehicle description,
  and its attributes add no field the stdout line does not carry. *(§8.4's "identifiers only", which
  slice 09 asserted for stdout alone.)*
- **AC-7** — *(guard)* Given the same run, the process's **stdout** still carries the request's `pino`
  JSON line with `trace_id`/`span_id`, exactly as slice 09's AC-6 asserts today.
- **AC-8** — *(guard)* Given the service pointed at a port nothing is listening on, a booking still
  answers `201` and its stdout line is still written. *(§7.1.)*

**The red set is a property, not a count**, on slice 09's shape: every criterion **AC-1 to AC-6** must
fail in the one red commit — AC-1 on `unknown_service:node`, AC-2 to AC-6 on zero records at `/v1/logs`.
**AC-7 and AC-8 are the two named exceptions**: both pass today and exist to fail if this slice breaks
them, which is a guard and not a criterion this slice earns.

## What cannot fail — said now

- **AC-8's dead port** relies on a fast `ECONNREFUSED`. On a host that blackholes instead, the exporter's
  own 10 s timeout is what returns, and the criterion measures patience rather than isolation.
- **The severity mapping** is transcribed into AC-5's test; nothing ties it to the bridge's table.
- **`api-logs` confinement catches a mistake, not an adversary** — `src/platform` may still be imported
  by anyone, which is the point of a leaf.

## Proposed arc42 edits (step 7 applies them; nothing is applied here)

- **§7.3** — one table row: `OTEL_SERVICE_NAME` · *"Resource `service.name` for all three signals;
  optional, default `keyloop-service-scheduler`"*, and the sentence above the table gains it as a
  `config.ts`-read name, leaving `OTEL_EXPORTER_OTLP_ENDPOINT` as the sole SDK-auto-configured exception.
- **§8.4 Logs** — *"`pino` JSON to stdout"* becomes *"`pino` JSON to stdout **and, on the same call,
  to the collector over OTLP**"*, with the trace-context claim restated as a property of the record
  rather than of the line, and ADR-0037 cited for why not an instrumentation.
- **§10.2** — QS-13's scenario extended, or a QS-15 added, so the export is a scenario and not only a
  criterion; **ruled: extend QS-13**, since goal 4 is one goal and a second row would re-home it.
- **§11.1** — `D-09-3`'s entry gains the sentence that it also disqualified `instrumentation-pino`;
  the residuals above are booked.

## Assumptions and open questions

- **A-14-1** — `grafana/otel-lgtm` accepts OTLP/JSON logs on `4318/v1/logs` as it does traces and
  metrics. Unverified against the image; the test collector proves the wire, not Loki's ingestion.
- **OQ-14-1** — whether the bridge should also carry `pino`'s `err` serialisation into
  `exception.*` attributes. Out of scope as designed; it is the first thing an operator will ask for.

## Should this slice start at all? — **the human's ruling, not mine**

§8's WIP limit does not forbid it: nothing is open. But this is phase 6, whose job is to reconcile arc42
to as-built, and this slice adds three production dependencies and a forbidden rule during consolidation.

**The choice is binary, and that is the useful thing to say.** §8.4 currently claims a Loki/Tempo join
that no code performs. Either it is built — and §8.4 becomes true — or **phase 6 must amend §8.4 to
retract it**: *"`trace_id`/`span_id` are on every line and the OTLP log pipeline is not wired; a shipper
reading stdout would join on them."* I will not leave the claim standing unbuilt, and I would rather the
human pick the branch than have me pick it from the chair. My recommendation, non-binding: **build it** —
the retraction costs a sentence but leaves the assessment's own observability goal short of its
documented shape, and the mechanism is now measured end to end rather than hoped for.
