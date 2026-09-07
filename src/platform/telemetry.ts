/**
 * The OTel SDK, its exporters and §8.4's instruments — a leaf, as `platform-is-a-leaf` requires,
 * and the only home (besides `src/main.ts`) the `otel-sdk-only-in-platform` rule permits for the
 * SDK itself (`docs/slices/09-design.md` decision 1). `@opentelemetry/api` is importable from
 * anywhere — `src/application` and `src/persistence` both create spans through the `tracer`
 * exported below — but `NodeSDK`, its exporters and its metric reader are named ONLY here.
 *
 * ── WHAT arc42 §7.3 ALREADY DECIDED ────────────────────────────────────────────────────────────
 *
 * `OTEL_EXPORTER_OTLP_ENDPOINT` is read by the OpenTelemetry SDK itself (A-04-10); this module
 * never reads `process.env` for it. Unset, both exporters fall back to their own default
 * (`http://localhost:4318`) and a collector outage is logged and dropped by the SDK's own export
 * pipeline — never propagated to a request (arc42 §7.1).
 *
 * ── `AsyncLocalStorageContextManager`, REGISTERED HERE ─────────────────────────────────────────
 *
 * `NodeSDK` does not default to it, and it is what makes a span started in one `await` continue
 * to be the ACTIVE span after the next one resolves — which is what lets `src/platform/logger.ts`
 * read "the current span" via `trace.getSpan(context.active())` from inside a handler several
 * `await`s downstream of where the span was started, with no context object threaded by hand.
 *
 * ── ONE TRACER, LAZY METER INSTRUMENTS — MEASURED, NOT ASSUMED ─────────────────────────────────
 *
 * `src/main.ts` imports this module TRANSITIVELY (via `bookAppointment.js` -> `attemptLoop.js`)
 * at the top of the file, ahead of its own `startTelemetry()` call — ESM hoists every static
 * import above a module's own top-level statements, so this module evaluates before `NodeSDK` has
 * started no matter where `import { startTelemetry }` appears in `main.ts`'s source.
 *
 * Measured on the pinned `@opentelemetry/api@1.9.1`/`sdk-metrics@2.11.0`: `trace.getTracer(...)`
 * called at THIS eval time still exports correctly once `NodeSDK#start()` runs later —
 * `ProxyTracer` defers to the registered delegate per call, not once at construction. `metrics
 * .getMeter(...)` does NOT: a `Meter` obtained before a real `MeterProvider` is registered stays a
 * no-op forever, and every instrument created from it — `meter.createCounter(...)` — inherits
 * that, silently. A probe confirmed the exact boundary: `getMeter()` and `createCounter()` both
 * called only after `sdk.start()` exports; either one called before it does not, regardless of
 * when `.add()` is called. `lazyMeter`/`lazyCounter`/`lazyHistogram` below defer BOTH calls to the
 * first actual measurement, which happens per request — always after `startTelemetry()` has run.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { metrics, trace } from '@opentelemetry/api';
import type { Counter, Histogram, Meter, MetricOptions } from '@opentelemetry/api';

const INSTRUMENTATION_NAME = 'keyloop-service-scheduler';

/** §8.4's spans: created wherever the work happens (decision 1), always through this tracer. */
export const tracer = trace.getTracer(INSTRUMENTATION_NAME);

/** `getMeter()` itself, deferred — see the file docblock's measurement. Called at most once. */
let cachedMeter: Meter | undefined;
function meter(): Meter {
  cachedMeter ??= metrics.getMeter(INSTRUMENTATION_NAME);
  return cachedMeter;
}

/**
 * A `Counter`/`Histogram` handle whose UNDERLYING instrument is not created until the first
 * `.add()`/`.record()` — which is always at request-handling time, after `startTelemetry()` has
 * registered the real `MeterProvider` (see the file docblock).
 */
function lazyCounter(name: string, options: MetricOptions): Counter {
  let real: Counter | undefined;
  return {
    add: (value, attributes, context): void => {
      real ??= meter().createCounter(name, options);
      real.add(value, attributes, context);
    },
  };
}

function lazyHistogram(name: string, options: MetricOptions): Histogram {
  let real: Histogram | undefined;
  return {
    record: (value, attributes, context): void => {
      real ??= meter().createHistogram(name, options);
      real.record(value, attributes, context);
    },
  };
}

/**
 * arc42 §8.4's metrics table, verbatim — five rows, every one emitted somewhere under `src/`
 * (`R-09-9`: a table row with no emitter is a panel with an empty series and no error).
 * `booking_conflicts_total` is the one this slice's ACs read; the other four are emitted from
 * the use cases and the shared attempt loop (`appointmentsBookedTotal`/
 * `appointmentsRescheduledTotal`/`appointmentsCancelledTotal` from their own use case,
 * `bookingAttempts` from `attemptLoop.ts`'s exit), even though no acceptance criterion reads
 * any of the five back off a collector.
 *
 * `booking_conflicts_total` is exported as `conflictCounter`, not `bookingConflictsTotal` (the
 * other four rows' own `<metricName>Total`/`<metricName>` convention) — `R-09-11`, step 5
 * finding 11. `tests/architecture/ambiguity-containment.test.ts`'s `conflict-counter-increment`
 * marker anchors decision 2's cardinality claim on THIS BINDING'S NAME, imported from this
 * module, so the identifier is load-bearing rather than cosmetic: a rename here is a rename the
 * marker must be told about, which is the point of anchoring on identity instead of on a label
 * spelling `.add(...)`'s arguments might not carry (the reviewer's own falsification).
 */
export const conflictCounter: Counter = lazyCounter('booking_conflicts_total', {
  description:
    'Bookings and reschedules that met a database-adjudicated conflict (SQLSTATE 23P01), by ' +
    'which resource conflicted and how the attempt loop resolved it.',
});
export const appointmentsBookedTotal: Counter = lazyCounter('appointments_booked_total', {
  description: 'Appointments confirmed, by dealership.',
});
export const appointmentsRescheduledTotal: Counter = lazyCounter('appointments_rescheduled_total', {
  description: "ADR-0003's second act: moves, by outcome.",
});
export const appointmentsCancelledTotal: Counter = lazyCounter('appointments_cancelled_total', {
  description: 'Cancellations.',
});
export const bookingAttempts: Histogram = lazyHistogram('booking_attempts', {
  description: "Attempts per booking or reschedule request — ADR-0009's ordering policy, working or not.",
});

/**
 * Started once, from `src/main.ts` only — the composition root is the one module the design
 * names as allowed to see the SDK besides this file.
 *
 * `instrumentations: []`, MEASURED rather than left over — step 5 finding 6. `@opentelemetry/
 * instrumentation-http` was tried first: registered here, it produced NO server span and left
 * `http.Server.prototype.emit` unpatched, because this project's entry point is ESM
 * (`package.json`'s `"type": "module"`) and `@opentelemetry/instrumentation`'s patching runs
 * through `require-in-the-middle`, which native ESM `import` never invokes. The documented fix
 * is a Node process-launch flag (`--import` registering `@opentelemetry/instrumentation/
 * hook.mjs`) — outside what this file, or any file under `src/`, controls. That is the
 * "dependency surface proves unacceptable" branch the finding named in advance, so the fallback
 * it also named is what shipped: `src/http/server.ts`'s hand-written `serverFactory` span, which
 * reaches the same lines this instrumentation would have and needs nothing at the process's
 * command line.
 */
export function startTelemetry(): NodeSDK {
  const sdk = new NodeSDK({
    contextManager: new AsyncLocalStorageContextManager(),
    traceExporter: new OTLPTraceExporter(),
    // Plural, not the deprecated singular `metricReader` — the SAME instance either way, but the
    // singular form logs a deprecation warning on every start.
    metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() })],
    instrumentations: [],
  });
  sdk.start();
  return sdk;
}
