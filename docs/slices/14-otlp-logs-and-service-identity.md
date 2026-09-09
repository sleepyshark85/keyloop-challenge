---
id: "14"
title: The service names itself, and its logs reach the collector
status: ready
depends_on: ["09"]
arc42: ["§7.3", "§8.4", "§10.2", "§11.1"]
adr: [37]
quality_scenarios: [QS-13, QS-10]
loopbacks: 0
scope_ruled_at: 2026-09-09
scope_ruled_by: human
---

> **Started on a human scope ruling, 2026-09-09.** [`14-design.md`](14-design.md) declined to rule
> whether this slice should exist during phase 6 and put a binary to the human: build the pipeline
> arc42 §8.4 already claims, or amend §8.4 to retract the claim. The human ruled **build**, taking the
> architect's non-binding recommendation. The retraction sentence the design drafted is not used.

## Goal

arc42 §8.4 says log lines carry `trace_id`/`span_id` *"so Loki and Tempo join without a correlation id
of their own"*, and §7.3 calls its variable table *"the contract"*. Neither is true. `pino` writes to
stdout and nowhere else, so no log record has ever reached the collector; and because nothing sets a
resource `service.name`, every span and metric that does reach it lands under `unknown_service:node` —
unattributable in Grafana, and indistinguishable from any other unnamed Node process pointed at the
same endpoint. This slice makes both sentences true: the service names itself from its own artifact,
and each `pino` call writes to stdout **and** to the collector on the same call, carrying the active
span's context on the record rather than only in the line's text.

## Acceptance criteria

Verbatim from [`14-design.md`](14-design.md) §5; that file's reasoning is the design of record.

- **AC-1** — Given the service spawned with **no** `OTEL_SERVICE_NAME`, when the collector's exports are
  read, then the resource of the trace, metric **and** log exports each carries
  `service.name = keyloop-service-scheduler`, and none carries `unknown_service:node`.
- **AC-2** — Given the service spawned with `OTEL_SERVICE_NAME=probe-override`, then the resource carries
  `probe-override`. This is what makes §7.3's new row true rather than decorative.
- **AC-3** — Given a booking request, when the collector's **log records** are read, then at least one
  record corresponds to a line that request produced.
- **AC-4** — Given the same request, then that record's **own** `traceId` and `spanId` are non-empty and
  equal those of a span the same request produced. *The load-bearing criterion: what a worker-thread
  transport fails, and what §8.4's Loki/Tempo join rests on.*
- **AC-5** — Given a request producing a `warn` or `error` line, then the exported record's
  `severityNumber`/`severityText` match `pino`'s level rather than one hardcoded default.
- **AC-6** — Given a booking, then no exported record names a customer, a VIN or a vehicle description,
  and its attributes add no field the stdout line does not carry. *(§8.4's "identifiers only".)*
- **AC-7** — *(guard)* Given the same run, the process's **stdout** still carries the request's `pino`
  JSON line with `trace_id`/`span_id`, exactly as slice 09's AC-6 asserts today.
- **AC-8** — *(guard)* Given the service pointed at a port nothing is listening on, a booking still
  answers `201` and its stdout line is still written. *(§7.1.)*

**The red set is a property, not a count.** Every criterion **AC-1 to AC-6** must fail in the one red
commit — AC-1 on `unknown_service:node`, AC-2 to AC-6 on zero records at `/v1/logs`. **AC-7 and AC-8 are
the two named exceptions**: both pass today and exist to fail if this slice breaks them, which is a
guard rather than a criterion this slice earns.

## In scope

- `OTEL_SERVICE_NAME` read by `src/platform/config.ts`, default `keyloop-service-scheduler`, passed
  from `src/main.ts` to `startTelemetry(config)` — design option (D).
- An in-process `pino` destination bridging to `@opentelemetry/api-logs`, multiplexed with stdout;
  `BatchLogRecordProcessor`, never `Simple`.
- The three OTel logs packages promoted from transitive to direct, exact-pinned beside their siblings.
- One new dependency-cruiser rule, `otel-logs-api-only-in-platform`, arriving with its plant.

## Out of scope

- **OQ-14-1** — carrying `pino`'s `err` serialisation into `exception.*` attributes. The design names
  it as the first thing an operator will ask for; it is still not this slice. *(A DCR, not a drive-by.)*
- Shipping stdout to Loki by any external agent. The bridge is in-process, for AC-4's reason.

## Definition of done

Beyond the standing DoD in `CLAUDE.md` §10:

- The `otel-logs-api-only-in-platform` rule is planted — a fixture that fails if the rule is deleted,
  per §5.3's precedent from slice 09's `otel-sdk-only-in-platform`.
- ADR-0037 is written to `docs/adr/`, not left drafted inline in the design.

## Notes on the design's open items

- **A-14-1 is closed, before step 2.** The design recorded as unverified that `grafana/otel-lgtm`
  accepts OTLP/JSON logs on `4318/v1/logs`. The orchestrator probed the running image on 2026-09-09:
  a hand-built `resourceLogs` POST returned `200 {"partialSuccess":{}}`, and the record came back out
  of Loki through Grafana's datasource proxy with `trace_id`, `span_id`, `service_name`,
  `severity_text` and `severity_number` promoted to stream labels. The Tempo/Loki join §8.4 claims
  works on the wire once the bridge exists. This is evidence about the image, not about `src/`.
