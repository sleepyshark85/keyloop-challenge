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
 * ── ONE TRACER, ONE METER, NAMED ONCE ──────────────────────────────────────────────────────────
 *
 * `tracer` and the six instruments below are created against the GLOBAL providers `NodeSDK#start()`
 * registers, so importing them before `startTelemetry()` runs still works — `@opentelemetry/api`'s
 * proxy objects forward to whatever provider is registered by the time a span or a measurement is
 * actually taken, never by the time the module is imported.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { metrics, trace } from '@opentelemetry/api';
import type { Counter, Histogram } from '@opentelemetry/api';

const INSTRUMENTATION_NAME = 'keyloop-service-scheduler';

/** §8.4's spans: created wherever the work happens (decision 1), always through this tracer. */
export const tracer = trace.getTracer(INSTRUMENTATION_NAME);

const meter = metrics.getMeter(INSTRUMENTATION_NAME);

/**
 * arc42 §8.4's metrics table, verbatim. `booking_conflicts_total` is the one this slice's ACs
 * read; the other five complete the table `docs/slices/09-observability.md` puts in scope, even
 * though no acceptance criterion reads them back off a collector.
 */
export const bookingConflictsTotal: Counter = meter.createCounter('booking_conflicts_total', {
  description:
    'Bookings and reschedules that met a database-adjudicated conflict (SQLSTATE 23P01), by ' +
    'which resource conflicted and how the attempt loop resolved it.',
});
export const appointmentsBookedTotal: Counter = meter.createCounter('appointments_booked_total', {
  description: 'Appointments confirmed, by dealership.',
});
export const appointmentsRescheduledTotal: Counter = meter.createCounter(
  'appointments_rescheduled_total',
  { description: "ADR-0003's second act: moves, by outcome." },
);
export const appointmentsCancelledTotal: Counter = meter.createCounter(
  'appointments_cancelled_total',
  { description: 'Cancellations.' },
);
export const bookingAttempts: Histogram = meter.createHistogram('booking_attempts', {
  description: "Attempts per booking or reschedule request — ADR-0009's ordering policy, working or not.",
});
export const availabilityQueryDurationSeconds: Histogram = meter.createHistogram(
  'availability_query_duration_seconds',
  { description: "Goal 5's budget (QS-14), measured in production as well as in the suite.", unit: 's' },
);

/**
 * Started once, from `src/main.ts` only — the composition root is the one module the design
 * names as allowed to see the SDK besides this file.
 */
export function startTelemetry(): NodeSDK {
  const sdk = new NodeSDK({
    contextManager: new AsyncLocalStorageContextManager(),
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() }),
    instrumentations: [],
  });
  sdk.start();
  return sdk;
}
