import { createServer } from 'node:http';
import type { Server } from 'node:http';

/**
 * A throwaway OTLP/HTTP receiver — test-engineer's, slice 09 red commit (QS-13).
 *
 * `docs/slices/09-design.md` §8.4 fixes OpenTelemetry with an OTLP exporter; AC-1's Given
 * clause asks for "an in-memory OTel exporter". The spawned service is a SEPARATE process
 * (`tests/support/service.ts`'s own convention, kept here rather than importing `src/` to run
 * the server in-process — C1/black-box), so the only way this test can be "in-memory" is
 * that the RECEIVER, not the exporter, holds spans and metric points in memory instead of
 * writing them to Tempo/Prometheus: this file is that receiver, standing in for the
 * `grafana/otel-lgtm` stack `docker-compose.yml` names for the demo.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE WIRE CONTRACT THIS RELIES ON, MEASURED RATHER THAN ASSUMED.
 *
 * Built against `@opentelemetry/exporter-trace-otlp-http` and
 * `@opentelemetry/exporter-metrics-otlp-http` (the natural choice for TC-8's "OpenTelemetry
 * with pino", and the pair `docker-compose.yml`'s `otel-lgtm` OTLP/HTTP port `4318` implies).
 * Measured against `@opentelemetry/sdk-node@0.222.0` / exporters `0.222.0`:
 *
 *   - Pointing `OTEL_EXPORTER_OTLP_ENDPOINT` at a bare `http://host:port` makes both
 *     exporters POST to `${endpoint}/v1/traces` and `${endpoint}/v1/metrics` — the signal
 *     suffix is appended by the exporter, not supplied here.
 *   - Both exporters send `content-type: application/json` BY DEFAULT, with no
 *     `OTEL_EXPORTER_OTLP_PROTOCOL` set — this package's "http" exporter is JSON-only in the
 *     version pinned above; protobuf lives in the sibling `-otlp-proto` package. So this
 *     receiver decodes JSON only, and records what it saw when it did not get JSON, so a
 *     protocol mismatch is a diagnosable finding rather than a silent "nothing arrived".
 *   - `NodeSDK#shutdown()` flushes the batch span processor and the periodic metric reader
 *     before it resolves — confirmed by capturing a span and a counter increment in one
 *     short-lived probe process and observing both requests land before the process exited.
 *     `src/main.ts` is described as "starts and shuts the SDK down", so this file's helpers
 *     poll AFTER the caller stops the service (SIGTERM), which is where a graceful shutdown
 *     is expected to flush from.
 *
 * If the implementation instead uses gRPC, an explicit `http/protobuf` protocol, or a
 * different endpoint env var, every AC in `tests/integration/telemetry-booking.test.ts`
 * reports "0 requests received at all" — a real, diagnosable assertion failure (see
 * `describe()`), never a crash — which is the correct red-for-the-right-reason outcome for a
 * seam whose other side does not exist yet.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * SLICE 14 EXTENSION — `/v1/logs`, and `resource` on all three signals.
 *
 * `docs/slices/14-design.md` §4 names this file's gap exactly: spans and metric points were
 * decoded per-item, but `resourceSpans[].resource` / `resourceMetrics[].resource` were never
 * read, so `service.name` was invisible from outside the process even though the SDK always
 * sends one. Both interfaces below gain `resourceAttributes`, decoded with the same
 * `flattenAttributes` used for per-item attributes — additive, so nothing that already reads
 * `.attributes` off a `CollectedSpan`/`CollectedMetricPoint` changes shape.
 *
 * `/v1/logs` decodes the OTLP `resourceLogs -> scopeLogs -> logRecords` shape, on the SAME
 * measured wire contract as traces/metrics: `@opentelemetry/exporter-logs-otlp-http` is the
 * sibling of the trace/metric exporters already pinned, JSON body, protocol-suffixed path.
 * `traceId`/`spanId` on a `CollectedLogRecord` are read verbatim off the decoded JSON, the
 * same way `decodeTraces` already does for spans — measured there (slice 09) to arrive as
 * plain lower-case hex, never base64, on this exporter family's JSON serialiser.
 *
 * No import from `src/` — `outside-in-tests-do-not-import-src` covers `tests/support/`.
 */

export interface CollectedSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly startTimeUnixNano: bigint;
  readonly endTimeUnixNano: bigint;
  readonly attributes: Readonly<Record<string, unknown>>;
  /** `resourceSpans[].resource.attributes`, flattened — e.g. `service.name`. Slice 14. */
  readonly resourceAttributes: Readonly<Record<string, unknown>>;
  readonly statusCode?: number;
}

export interface CollectedMetricPoint {
  readonly metric: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  /** `resourceMetrics[].resource.attributes`, flattened — e.g. `service.name`. Slice 14. */
  readonly resourceAttributes: Readonly<Record<string, unknown>>;
  readonly value: number;
}

/** A decoded OTLP log record — slice 14, AC-1 through AC-6. */
export interface CollectedLogRecord {
  /** Empty string if the record carried none — never `undefined`, so equality checks are direct. */
  readonly traceId: string;
  readonly spanId: string;
  readonly severityNumber?: number;
  readonly severityText?: string;
  readonly body?: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  /** `resourceLogs[].resource.attributes`, flattened — e.g. `service.name`. */
  readonly resourceAttributes: Readonly<Record<string, unknown>>;
}

export interface OtelCollector {
  /** `OTEL_EXPORTER_OTLP_ENDPOINT` for the spawned process. */
  readonly endpoint: string;
  spans(): readonly CollectedSpan[];
  metricPoints(): readonly CollectedMetricPoint[];
  logRecords(): readonly CollectedLogRecord[];
  /** Every raw request this receiver could NOT decode as OTLP/JSON, for a failure message. */
  unrecognised(): readonly { readonly url: string; readonly contentType: string; readonly length: number }[];
  awaitSpans(
    predicate: (spans: readonly CollectedSpan[]) => boolean,
    timeoutMs?: number,
  ): Promise<readonly CollectedSpan[]>;
  awaitMetricPoints(
    predicate: (points: readonly CollectedMetricPoint[]) => boolean,
    timeoutMs?: number,
  ): Promise<readonly CollectedMetricPoint[]>;
  awaitLogRecords(
    predicate: (records: readonly CollectedLogRecord[]) => boolean,
    timeoutMs?: number,
  ): Promise<readonly CollectedLogRecord[]>;
  /** A one-line summary of everything collected, for a failure message. */
  describe(): string;
  stop(): Promise<void>;
}

interface OtlpAnyValue {
  readonly stringValue?: string;
  readonly intValue?: string | number;
  readonly doubleValue?: number;
  readonly boolValue?: boolean;
}
interface OtlpKeyValue {
  readonly key: string;
  readonly value?: OtlpAnyValue;
}

function flattenAttributes(attrs: readonly OtlpKeyValue[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const kv of attrs ?? []) {
    const v = kv.value;
    if (v === undefined) continue;
    if (v.stringValue !== undefined) out[kv.key] = v.stringValue;
    else if (v.intValue !== undefined) out[kv.key] = Number(v.intValue);
    else if (v.doubleValue !== undefined) out[kv.key] = v.doubleValue;
    else if (v.boolValue !== undefined) out[kv.key] = v.boolValue;
  }
  return out;
}

interface OtlpResource {
  readonly attributes?: readonly OtlpKeyValue[];
}

function decodeResource(resource: OtlpResource | undefined): Record<string, unknown> {
  return flattenAttributes(resource?.attributes);
}

interface OtlpSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly startTimeUnixNano: string | number;
  readonly endTimeUnixNano: string | number;
  readonly attributes?: readonly OtlpKeyValue[];
  readonly status?: { readonly code?: number };
}
interface OtlpTraceExportRequest {
  readonly resourceSpans?: ReadonlyArray<{
    readonly resource?: OtlpResource;
    readonly scopeSpans?: ReadonlyArray<{ readonly spans?: readonly OtlpSpan[] }>;
  }>;
}

interface OtlpNumberDataPoint {
  readonly attributes?: readonly OtlpKeyValue[];
  readonly asDouble?: number;
  readonly asInt?: string | number;
}
interface OtlpMetric {
  readonly name: string;
  readonly sum?: { readonly dataPoints?: readonly OtlpNumberDataPoint[] };
  readonly gauge?: { readonly dataPoints?: readonly OtlpNumberDataPoint[] };
}
interface OtlpMetricsExportRequest {
  readonly resourceMetrics?: ReadonlyArray<{
    readonly resource?: OtlpResource;
    readonly scopeMetrics?: ReadonlyArray<{ readonly metrics?: readonly OtlpMetric[] }>;
  }>;
}

interface OtlpLogRecord {
  readonly traceId?: string;
  readonly spanId?: string;
  readonly severityNumber?: number;
  readonly severityText?: string;
  readonly body?: OtlpAnyValue;
  readonly attributes?: readonly OtlpKeyValue[];
}
interface OtlpLogsExportRequest {
  readonly resourceLogs?: ReadonlyArray<{
    readonly resource?: OtlpResource;
    readonly scopeLogs?: ReadonlyArray<{ readonly logRecords?: readonly OtlpLogRecord[] }>;
  }>;
}

function decodeTraces(body: OtlpTraceExportRequest): CollectedSpan[] {
  const out: CollectedSpan[] = [];
  for (const rs of body.resourceSpans ?? []) {
    const resourceAttributes = decodeResource(rs.resource);
    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        out.push({
          traceId: span.traceId,
          spanId: span.spanId,
          parentSpanId: span.parentSpanId,
          name: span.name,
          startTimeUnixNano: BigInt(span.startTimeUnixNano),
          endTimeUnixNano: BigInt(span.endTimeUnixNano),
          attributes: flattenAttributes(span.attributes),
          resourceAttributes,
          statusCode: span.status?.code,
        });
      }
    }
  }
  return out;
}

function decodeMetrics(body: OtlpMetricsExportRequest): CollectedMetricPoint[] {
  const out: CollectedMetricPoint[] = [];
  for (const rm of body.resourceMetrics ?? []) {
    const resourceAttributes = decodeResource(rm.resource);
    for (const sm of rm.scopeMetrics ?? []) {
      for (const metric of sm.metrics ?? []) {
        const points = metric.sum?.dataPoints ?? metric.gauge?.dataPoints ?? [];
        for (const point of points) {
          const value = point.asDouble ?? (point.asInt === undefined ? undefined : Number(point.asInt));
          if (value === undefined) continue;
          out.push({
            metric: metric.name,
            attributes: flattenAttributes(point.attributes),
            resourceAttributes,
            value,
          });
        }
      }
    }
  }
  return out;
}

function decodeLogs(body: OtlpLogsExportRequest): CollectedLogRecord[] {
  const out: CollectedLogRecord[] = [];
  for (const rl of body.resourceLogs ?? []) {
    const resourceAttributes = decodeResource(rl.resource);
    for (const sl of rl.scopeLogs ?? []) {
      for (const record of sl.logRecords ?? []) {
        out.push({
          traceId: record.traceId ?? '',
          spanId: record.spanId ?? '',
          severityNumber: record.severityNumber,
          severityText: record.severityText,
          body: record.body?.stringValue,
          attributes: flattenAttributes(record.attributes),
          resourceAttributes,
        });
      }
    }
  }
  return out;
}

/** Ask the OS for a port nothing is listening on, then use it for the receiver itself. */
async function listenOnFreePort(server: Server): Promise<number> {
  return await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('otel collector: could not determine its own port'));
        return;
      }
      resolve(address.port);
    });
  });
}

export async function startOtelCollector(): Promise<OtelCollector> {
  const spans: CollectedSpan[] = [];
  const metricPoints: CollectedMetricPoint[] = [];
  const logRecords: CollectedLogRecord[] = [];
  const unrecognised: { url: string; contentType: string; length: number }[] = [];

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] ?? '(none)';
      const url = req.url ?? '(no url)';
      if (contentType.includes('json')) {
        try {
          const parsed: unknown = JSON.parse(raw.toString('utf8'));
          if (url.includes('/v1/traces')) spans.push(...decodeTraces(parsed as OtlpTraceExportRequest));
          else if (url.includes('/v1/metrics')) metricPoints.push(...decodeMetrics(parsed as OtlpMetricsExportRequest));
          else if (url.includes('/v1/logs')) logRecords.push(...decodeLogs(parsed as OtlpLogsExportRequest));
          else unrecognised.push({ url, contentType, length: raw.length });
        } catch {
          unrecognised.push({ url, contentType, length: raw.length });
        }
      } else {
        unrecognised.push({ url, contentType, length: raw.length });
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });

  const port = await listenOnFreePort(server);
  const endpoint = `http://127.0.0.1:${String(port)}`;

  async function pollUntil<T>(
    read: () => T,
    predicate: (value: T) => boolean,
    timeoutMs: number,
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const value = read();
      if (predicate(value) || Date.now() >= deadline) return value;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return {
    endpoint,
    spans: () => spans.slice(),
    metricPoints: () => metricPoints.slice(),
    logRecords: () => logRecords.slice(),
    unrecognised: () => unrecognised.slice(),
    awaitSpans: async (predicate, timeoutMs = 10_000) =>
      await pollUntil(() => spans.slice(), predicate, timeoutMs),
    awaitMetricPoints: async (predicate, timeoutMs = 10_000) =>
      await pollUntil(() => metricPoints.slice(), predicate, timeoutMs),
    awaitLogRecords: async (predicate, timeoutMs = 10_000) =>
      await pollUntil(() => logRecords.slice(), predicate, timeoutMs),
    describe: () =>
      [
        `  spans (${String(spans.length)})`,
        ...spans.map(
          (s) =>
            `      ${s.name} trace=${s.traceId} resource=${JSON.stringify(s.resourceAttributes)} attrs=${JSON.stringify(s.attributes)}`,
        ),
        `  metric points (${String(metricPoints.length)})`,
        ...metricPoints.map(
          (m) =>
            `      ${m.metric} resource=${JSON.stringify(m.resourceAttributes)} ${JSON.stringify(m.attributes)} = ${String(m.value)}`,
        ),
        `  log records (${String(logRecords.length)})`,
        ...logRecords.map(
          (r) =>
            `      severity=${String(r.severityText)}(${String(r.severityNumber)}) trace=${r.traceId} span=${r.spanId} ` +
            `resource=${JSON.stringify(r.resourceAttributes)} attrs=${JSON.stringify(r.attributes)} body=${String(r.body)}`,
        ),
        `  unrecognised requests (${String(unrecognised.length)}) — a protocol or endpoint mismatch, not absence`,
        ...unrecognised.map((u) => `      ${u.url} content-type=${u.contentType} bytes=${String(u.length)}`),
      ].join('\n'),
    stop: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
