---
id: "0037"
title: Bridge pino to OpenTelemetry in-process, on the thread that emitted the line
status: accepted
date: 2026-09-09
supersedes: null
superseded_by: null
arc42: ["§7.3", "§8.4", "§10.2", "§11.1"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  The agent proposed the option set and the ruling at slice 14 step 1, drafted inline in
  `docs/slices/14-design.md` §2. Two of the four options were refused by MEASUREMENT rather
  than by reading documentation — a probe on the pinned `sdk-node@0.222.0`, and slice 09's
  `D-09-3` finding reused — and the chosen option was probed end to end before it was ruled:
  one `log.info()` inside an active span produced one stdout line and one OTel record whose
  own `spanContext` carried the live ids.

  THE HUMAN DECIDED THE PRIOR QUESTION, WHICH WAS THE HARDER ONE. The design declined to rule
  whether this slice should exist during phase 6 and put a binary: build the pipeline §8.4
  already claimed, or amend §8.4 to retract the claim. The human ruled BUILD, taking the
  agent's non-binding recommendation, and approved at the gate on 2026-09-09 after observing
  the joined trace and log in Grafana — the half of this decision no acceptance criterion
  reads, since every AC asserts against a test collector and none of them opens Grafana.

  WRITTEN AT STEP 7, NOT AT STEP 1, and that is a weakness worth stating: the draft was cited
  as settled reasoning by the implementer's PR comment while it was still a draft, which is
  why this file exists as a file. Nothing in the option set moved between the draft and here.
  The draft's `status: proposed` did move, to `accepted`: it was written before the gate that
  accepted it, and a `proposed` status would have booked a shipped decision as debt in §11.1.
---

## Context and problem statement

arc42 §8.4 promised a join it did not have. Every `pino` line already carries `trace_id` and
`span_id`, injected by a mixin over the active span — but `pino` wrote to stdout and nowhere else,
so no log record ever reached the collector, and *"Loki and Tempo join without a correlation id of
their own"* described a pipeline no code performed.

So the question is not whether to export logs. It is **where the trace context comes from at the
moment a line becomes a record**: read from the span active on the emitting stack, or re-derived
elsewhere from the line's own text. A record that parses `trace_id` back out of the text *has* a
correlation id of its own, which is the thing §8.4 says this design does not need.

## Considered options

| | Option | Good, because | Rejected, because |
|---|---|---|---|
| **A** | **`@opentelemetry/instrumentation-pino`** | The supported route: no bridge to own, and the severity and attribute mapping stay upstream | It patches through `require-in-the-middle`, which a native ESM `import` never invokes — the same mechanism, measured, that left `http.Server.prototype.emit` unpatched at slice 09 (§11.1 `D-09-3`). Its documented fix is a process-launch flag no file under `src/` controls, so the artifact would depend on how it was started |
| **B** | **A `pino` worker-thread transport** (`pino-opentelemetry-transport`) | Export runs off the request's stack, so its cost is never the response's; the idiomatic `pino` shape | The worker cannot reach `AsyncLocalStorage`, so the active span is not visible to it. It must re-derive the context by parsing the line — a correlation id of its own, which falsifies §8.4. AC-4 asserts the record's **own** `traceId`/`spanId`; a transport can imitate that, not satisfy it |
| **C** | **Drop `pino`; emit through the OTel Logs API directly** | One signal path, no bridge, no hand-written severity table | It loses stdout, which AC-7 and AC-8 require to survive a dead collector, and contradicts TC-8, which fixes `pino` as the logging tool. Fastify's own lifecycle lines share the instance and would go with it |
| **D** | **An in-process `pino` destination emitting through `@opentelemetry/api-logs`, composed with stdout by `pino.multistream`** | Below | **Chosen** |

## Decision

Chosen option: **D — a `DestinationStream` that emits an OTel `LogRecord` on the same call, added
alongside stdout and never instead of it.**

`pino.multistream`'s write loop is **synchronous**, so the bridge still runs on the exact stack the
log call was made on; `Logger#emit` is called with no explicit context and defaults to
`context.active()`. The record therefore carries the *real* span — read, never parsed.

Three details are load-bearing. **`BatchLogRecordProcessor`, never `Simple`**, and the bridge's
`write()` swallows its own failures: `multistream` wraps no stream's `write` in a `try`, so a throw
would land on the request's stack (§7.1). **The OTLP exporter is named explicitly** — left to
`NodeSDK`'s own default the logs signal speaks `http/protobuf` while traces and metrics go as JSON.
And **`logs.getLogger()` may be called eagerly**: it returns a proxy that delegates per `emit()`, so
`telemetry.ts`'s lazy-meter dance must not be copied here.

## Consequences

**Good**

- **The join is real.** Grafana pivots from a Loki line to its Tempo trace on the record's own
  `traceId`, measured end to end rather than claimed.
- **stdout survives on its own stream**, so a collector outage is invisible to a booking (AC-8).
- **A log line is created exactly one way.** `@opentelemetry/api-logs` is confined to `src/platform`
  by `otel-logs-api-only-in-platform`, which arrives with its plant (QS-10), so no module can put a
  record in Loki with no stdout twin.

**Bad, or deferred**

- **The pino-level → `SeverityNumber` mapping is hand-written and lives in one file**, and AC-5
  transcribes it, so nothing ties the assertion to the table it asserts.
- **Export cost is on the request's stack**, bounded only by the batch processor's queue.
- **The record carries no `exception.*` attributes** from `pino`'s `err` serialisation (`OQ-14-1`,
  §11.1 `D-14-2`) — the first thing an operator will ask for.
- **`multistream` gates each entry at its own `level`**, independently of the parent logger: a
  second gate the composition must keep in sync, which it did not at first (§11.1 `D-14-1`).
