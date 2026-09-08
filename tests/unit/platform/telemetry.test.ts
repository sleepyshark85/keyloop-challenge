import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { metrics, trace } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { tracing } from '@opentelemetry/sdk-node';
import {
  appointmentsBookedTotal,
  appointmentsCancelledTotal,
  appointmentsRescheduledTotal,
  bookingAttempts,
  conflictCounter,
  tracer,
} from '../../../src/platform/telemetry.js';

/**
 * `src/platform/telemetry.ts`'s own docblock makes a MEASUREMENT, in prose: a `Meter` obtained
 * before a real `MeterProvider` is registered stays a no-op forever, so `lazyCounter`/
 * `lazyHistogram` defer both `metrics.getMeter(...)` and `.createCounter(...)`/
 * `.createHistogram(...)` to the first `.add()`/`.record()` call — always after
 * `startTelemetry()` has run in production. `D-08-1`'s own shape (routing a doc claim through a
 * unit test rather than trusting the prose) is what this file is for: register a REAL, in-memory
 * `MeterProvider`/`TracerProvider` before this suite's first measurement and read the five §8.4
 * metrics and the `tracer` back off them, which is the executable form of that claim.
 *
 * `docs/slices/09-design.md` step 5 finding 3: this is the file's `telemetry.ts` remedy — "a
 * unit test registering a real in-memory `MeterProvider` before the first `.add()`… kills ~25 of
 * 34" survivors. `startTelemetry()` itself stays untested here: it constructs a real `NodeSDK`
 * against a real (or absent) OTLP collector, which is `src/main.ts`'s concern and outside-in's
 * (ADR-0013), not a unit test's.
 */

const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 100_000,
});
const meterProvider = new MeterProvider({ readers: [metricReader] });

const spanExporter = new tracing.InMemorySpanExporter();
const tracerProvider = new tracing.BasicTracerProvider({
  spanProcessors: [new tracing.SimpleSpanProcessor(spanExporter)],
});

beforeAll(() => {
  // BEFORE any counter's first `.add()`/`.record()` in this whole suite — the module's own
  // instruments are created once, lazily, and once created stay bound to whatever was
  // registered at that moment (see the file docblock this test exists to make executable).
  metrics.setGlobalMeterProvider(meterProvider);
  trace.setGlobalTracerProvider(tracerProvider);
});

afterAll(async () => {
  await meterProvider.shutdown();
  trace.disable();
  metrics.disable();
});

interface DataPoint {
  readonly attributes: Record<string, unknown>;
  readonly value: number;
}

interface CollectedMetric {
  readonly name: string;
  readonly description: string;
  readonly unit: string;
  readonly scopeName: string;
  readonly dataPoints: readonly DataPoint[];
}

async function collect(): Promise<readonly CollectedMetric[]> {
  const { resourceMetrics } = await metricReader.collect();
  return resourceMetrics.scopeMetrics.flatMap((scope) =>
    scope.metrics.map((metric) => ({
      name: metric.descriptor.name,
      description: metric.descriptor.description,
      unit: metric.descriptor.unit,
      scopeName: scope.scope.name,
      dataPoints: metric.dataPoints as unknown as readonly DataPoint[],
    })),
  );
}

function metricNamed(collected: readonly CollectedMetric[], name: string): CollectedMetric | undefined {
  return collected.find((metric) => metric.name === name);
}

/**
 * A fresh, distinguishing attribute value per test — so a data point this test just wrote is
 * findable among whatever earlier tests in this file wrote to the SAME cumulative counter.
 */
let nextMark = 0;
function mark(): string {
  nextMark += 1;
  return `t${String(nextMark)}`;
}

describe('the five §8.4 metrics — real instruments, not the no-op the docblock warns about', () => {
  it('booking_conflicts_total (conflictCounter) is a real Counter, named and described', async () => {
    const dealership = mark();
    conflictCounter.add(1, { resource: 'bay', outcome: 'absorbed', dealership });

    const metric = metricNamed(await collect(), 'booking_conflicts_total');
    expect(metric, 'booking_conflicts_total was never created — the meter stayed a no-op').toBeDefined();
    expect(metric?.description).toContain('database-adjudicated conflict');
    expect(metric?.description).toContain('SQLSTATE 23P01');
    expect(metric?.description).toContain('which resource conflicted and how the attempt loop resolved it.');
    // `INSTRUMENTATION_NAME` — the one string every instrument is registered under, read back off
    // the OTel `InstrumentationScope` rather than off a second copy of the literal in this file.
    expect(metric?.scopeName).toBe('keyloop-service-scheduler');
    const point = metric?.dataPoints.find((p) => p.attributes['dealership'] === dealership);
    expect(point?.attributes).toEqual({ resource: 'bay', outcome: 'absorbed', dealership });
    expect(point?.value).toBe(1);
  });

  it('appointments_booked_total, by dealership', async () => {
    const dealership = mark();
    appointmentsBookedTotal.add(1, { dealership });

    const metric = metricNamed(await collect(), 'appointments_booked_total');
    expect(metric?.description).toBe('Appointments confirmed, by dealership.');
    const point = metric?.dataPoints.find((p) => p.attributes['dealership'] === dealership);
    expect(point?.value).toBe(1);
  });

  it('appointments_rescheduled_total, by outcome', async () => {
    const outcome = mark();
    appointmentsRescheduledTotal.add(1, { outcome });

    const metric = metricNamed(await collect(), 'appointments_rescheduled_total');
    expect(metric?.description).toContain("ADR-0003's second act");
    const point = metric?.dataPoints.find((p) => p.attributes['outcome'] === outcome);
    expect(point?.value).toBe(1);
  });

  it('appointments_cancelled_total, unlabelled', async () => {
    appointmentsCancelledTotal.add(1);

    const metric = metricNamed(await collect(), 'appointments_cancelled_total');
    expect(metric?.description).toBe('Cancellations.');
    expect(metric?.dataPoints.length).toBeGreaterThan(0);
  });

  it('booking_attempts is a real Histogram, recording a value rather than discarding it', async () => {
    bookingAttempts.record(3);

    const metric = metricNamed(await collect(), 'booking_attempts');
    expect(metric, 'booking_attempts was never created — the meter stayed a no-op').toBeDefined();
    expect(metric?.description).toContain("ADR-0009's ordering policy");
    // A histogram's data point carries a `count`/`sum`, not a bare `value` — asserting the
    // metric exists and its description is intact is what this file's own `D-08-1` needs;
    // `attemptLoop.test.ts` asserts the RECORDED value against `sum`/`count` directly.
    expect(metric?.dataPoints.length).toBeGreaterThan(0);
  });

  it('availability_query_duration_seconds is GONE (step 5 finding 9: measured by QS-14 instead, not duplicated here)', async () => {
    const metric = metricNamed(await collect(), 'availability_query_duration_seconds');
    expect(metric).toBeUndefined();
  });
});

describe('`tracer` — a `ProxyTracer` that defers to whatever is registered, per call', () => {
  it('a span started through the exported tracer reaches the registered provider', () => {
    tracer.startActiveSpan('telemetry.test.span', (span) => {
      span.setAttribute('probe', 'yes');
      span.end();
    });

    const found = spanExporter.getFinishedSpans().find((s) => s.name === 'telemetry.test.span');
    expect(found, 'the span never reached the in-memory exporter').toBeDefined();
    expect(found?.attributes['probe']).toBe('yes');
  });
});
