import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SpanStatusCode, metrics, trace } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { tracing } from '@opentelemetry/sdk-node';
import { runAttemptLoop } from '../../../src/application/attemptLoop.js';
import type { AttemptLoopParams } from '../../../src/application/attemptLoop.js';
import { orderCandidates } from '../../../src/domain/candidates.js';
import type { Db } from '../../../src/persistence/db.js';
import type { Logger } from '../../../src/platform/logger.js';

/**
 * `runAttemptLoop` directly — no `bookAppointment`/`rescheduleAppointment` around it, and no
 * database: `db.transaction().execute(cb)` just runs `cb`, and `runAttempt` below is what
 * decides success or which SQLSTATE-shaped error comes back. That is deliberate (design step 5
 * findings 3-5): what is under test here is the SPAN this file opens per attempt, the
 * `booking_conflicts_total`/`booking_attempts` instruments it writes, and the classification
 * branch that chooses a span's attributes — none of which is a claim about PostgreSQL.
 *
 * A REAL, in-memory `MeterProvider`/`TracerProvider` is registered before this suite's first
 * measurement, for the same reason `telemetry.test.ts` registers one: `lazyCounter`/
 * `lazyHistogram` bind to whatever is registered at the moment of the FIRST `.add()`/`.record()`
 * (`src/platform/telemetry.ts`'s own docblock), and this file's counter/histogram calls are the
 * first in the process if this file runs before `telemetry.test.ts` — Vitest gives each test
 * FILE its own module registry, so the two suites cannot rely on each other's ordering and each
 * registers its own providers.
 */

const metricExporter = new InMemoryMetricExporter(AggregationTemporality.DELTA);
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
  metrics.setGlobalMeterProvider(meterProvider);
  trace.setGlobalTracerProvider(tracerProvider);
});

afterEach(async () => {
  spanExporter.reset();
  // Drain any DELTA the test did not itself `collect()` — e.g. an "absorbed" success in the
  // SPAN tests above still increments the conflict counter, and an uncollected DELTA would
  // otherwise surface in whichever metrics test collects next, unrelated to what IT did.
  await metricReader.collect();
});

afterAll(async () => {
  await meterProvider.shutdown();
  trace.disable();
  metrics.disable();
});

interface HistogramValue {
  readonly sum: number;
  readonly count: number;
}

async function conflictCounterDataPoints(): Promise<
  ReadonlyArray<{ readonly attributes: Record<string, unknown>; readonly value: number }>
> {
  const { resourceMetrics } = await metricReader.collect();
  const metric = resourceMetrics.scopeMetrics
    .flatMap((s) => s.metrics)
    .find((m) => m.descriptor.name === 'booking_conflicts_total');
  return (metric?.dataPoints ?? []).map((point) => ({
    attributes: point.attributes,
    value: point.value as unknown as number,
  }));
}

async function bookingAttemptsDataPoints(): Promise<ReadonlyArray<{ readonly value: HistogramValue }>> {
  const { resourceMetrics } = await metricReader.collect();
  const metric = resourceMetrics.scopeMetrics
    .flatMap((s) => s.metrics)
    .find((m) => m.descriptor.name === 'booking_attempts');
  return (metric?.dataPoints ?? []).map((point) => ({
    value: point.value as unknown as HistogramValue,
  }));
}

function fakeDb(): Db {
  const db = {
    transaction: () => ({
      execute: async <T>(fn: (trx: Db) => Promise<T>): Promise<T> => fn(db as unknown as Db),
    }),
  };
  return db as unknown as Db;
}

interface LogLine {
  readonly level: string;
  readonly record: Record<string, unknown>;
}

function collectingLogger(): { readonly logger: Logger; readonly lines: LogLine[] } {
  const lines: LogLine[] = [];
  const record =
    (level: string) =>
    (obj: unknown): void => {
      lines.push({ level, record: obj as Record<string, unknown> });
    };
  const logger = {
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    debug: record('debug'),
    trace: record('trace'),
    fatal: record('fatal'),
  } as unknown as Logger;
  return { logger, lines };
}

function pgError(code: string, constraint?: string): unknown {
  return Object.assign(new Error(`SQLSTATE ${code}`), {
    code,
    ...(constraint === undefined ? {} : { constraint }),
  });
}

const ATTEMPT_CAP = 16;

interface Row {
  readonly bayId: string;
  readonly technicianId: string;
}

/** The parts every test shares; each overrides only what it is testing. */
function baseParams(
  overrides: Partial<AttemptLoopParams<Row, string>> & {
    readonly bays: readonly string[];
    readonly technicians: readonly string[];
  },
): AttemptLoopParams<Row, string> {
  const { bays, technicians, ...rest } = overrides;
  const order = orderCandidates(bays, technicians, 1);
  if (order === null) throw new Error('fixture has no candidates');
  const { logger } = collectingLogger();
  return {
    db: fakeDb(),
    logger,
    attemptCap: ATTEMPT_CAP,
    candidates: { bays, technicians },
    strategy: { kind: 'shuffled', seed: 1, order },
    spanName: 'appointment.insert',
    deadlockEvent: 'test.deadlock',
    successEvent: 'test.success',
    runAttempt: async (_trx, bayId, technicianId) => ({ bayId, technicianId }),
    onBadReference: async (constraint) => `aborted:${constraint}`,
    ...rest,
  };
}

function insertSpans(): readonly ReturnType<typeof spanExporter.getFinishedSpans>[number][] {
  return spanExporter.getFinishedSpans().filter((s) => s.name === 'appointment.insert');
}

describe('runAttemptLoop — one span per attempt (arc42 §8.4)', () => {
  it('a first-attempt success opens exactly one span, with no db.sqlstate and no ERROR status, and logs successEvent', async () => {
    const { logger, lines } = collectingLogger();
    const params = baseParams({
      bays: ['bay-0'],
      technicians: ['tech-0'],
      logger,
      runAttempt: async (_trx, bayId, technicianId) => ({ bayId, technicianId }),
    });

    const outcome = await runAttemptLoop(params);
    expect(outcome).toEqual({ kind: 'success', row: { bayId: 'bay-0', technicianId: 'tech-0' } });

    const spans = insertSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.attributes).toMatchObject({
      'booking.attempt': 1,
      'bay.id': 'bay-0',
      'technician.id': 'tech-0',
    });
    expect(spans[0]?.attributes['db.sqlstate']).toBeUndefined();
    expect(spans[0]?.status.code).toBe(SpanStatusCode.UNSET);

    // The one line AC-6 needs correlated to the span — `logger.info` is called only when
    // `row !== null`, carrying the event name and which attempt confirmed.
    expect(lines).toEqual([{ level: 'info', record: { event: 'test.success', attempt: 1 } }]);
  });

  it('a conflict then success: the FIRST span carries db.sqlstate/db.constraint and ERROR, the second does not', async () => {
    let attemptCount = 0;
    const params = baseParams({
      bays: ['bay-0', 'bay-1'],
      technicians: ['tech-0'],
      runAttempt: async (_trx, bayId, technicianId) => {
        attemptCount += 1;
        if (attemptCount === 1) throw pgError('23P01', 'no_bay_overlap');
        return { bayId, technicianId };
      },
    });

    const outcome = await runAttemptLoop(params);
    expect(outcome.kind).toBe('success');

    const spans = insertSpans();
    expect(spans).toHaveLength(2);
    expect(spans[0]?.attributes['db.sqlstate']).toBe('23P01');
    expect(spans[0]?.attributes['db.constraint']).toBe('no_bay_overlap');
    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[1]?.attributes['db.sqlstate']).toBeUndefined();
    expect(spans[1]?.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('a bad-reference (23503) span carries FOREIGN_KEY_VIOLATION, never the conflict SQLSTATE', async () => {
    const params = baseParams({
      bays: ['bay-0'],
      technicians: ['tech-0'],
      runAttempt: async () => {
        throw pgError('23503', 'appointment_vehicle_owned_by_customer');
      },
    });

    const outcome = await runAttemptLoop(params);
    expect(outcome).toEqual({ kind: 'aborted', value: 'aborted:appointment_vehicle_owned_by_customer' });

    const spans = insertSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.attributes['db.sqlstate']).toBe('23503');
    expect(spans[0]?.attributes['db.constraint']).toBe('appointment_vehicle_owned_by_customer');
    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('a deadlock (40P01) span carries DEADLOCK_DETECTED and no db.constraint (a deadlock names none)', async () => {
    const params = baseParams({
      bays: ['bay-0'],
      technicians: ['tech-0'],
      runAttempt: async () => {
        throw pgError('40P01');
      },
    });

    const outcome = await runAttemptLoop(params);
    expect(outcome).toEqual({ kind: 'no-verdict' });

    const spans = insertSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.attributes['db.sqlstate']).toBe('40P01');
    expect(spans[0]?.attributes['db.constraint']).toBeUndefined();
    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('span.end() runs even when the loop rethrows an unclassified error', async () => {
    const fault = new Error('driver exploded');
    const params = baseParams({
      bays: ['bay-0'],
      technicians: ['tech-0'],
      runAttempt: async () => {
        throw fault;
      },
    });

    await expect(runAttemptLoop(params)).rejects.toBe(fault);

    // Only an ENDED span reaches an exporter — if `span.end()` in the `finally` were removed,
    // this span would never appear here at all.
    const spans = insertSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
    // An `'other'`-classified error (`classify`'s catch-all) sets none of the three
    // `db.sqlstate` values — it is a fault, not a refusal, and must not be mislabelled as a
    // deadlock just because it fell through the two named arms above it.
    expect(spans[0]?.attributes['db.sqlstate']).toBeUndefined();
  });

  it('a not-found row logs no successEvent, and takes reschedule\'s not-confirmed exit', async () => {
    const { logger, lines } = collectingLogger();
    const params = baseParams({
      bays: ['bay-0'],
      technicians: ['tech-0'],
      logger,
      runAttempt: async () => null,
    });

    const outcome = await runAttemptLoop(params);
    expect(outcome).toEqual({ kind: 'not-confirmed' });
    expect(lines.some((l) => l.record['event'] === 'test.success')).toBe(false);
  });
});

describe('runAttemptLoop — booking_conflicts_total (design decision 2, restated)', () => {
  it('a plain success records NOTHING on the conflict counter', async () => {
    const params = baseParams({ bays: ['bay-0'], technicians: ['tech-0'] });
    await runAttemptLoop(params);
    expect(await conflictCounterDataPoints()).toEqual([]);
  });

  it('exhausted: {resource, outcome: "refused"} — the whole bay list emptied', async () => {
    const params = baseParams({
      bays: ['bay-0'],
      technicians: ['tech-0'],
      runAttempt: async () => {
        throw pgError('23P01', 'no_bay_overlap');
      },
    });

    const outcome = await runAttemptLoop(params);
    expect(outcome).toEqual({ kind: 'no-capacity', resource: 'bay', attempts: 1, exit: 'exhausted' });

    const points = await conflictCounterDataPoints();
    expect(points).toEqual([{ attributes: { resource: 'bay', outcome: 'refused' }, value: 1 }]);
  });

  it('capped: {resource, outcome: "capped"} — a low attemptCap stops the loop with candidates left (finding 4: no fixture widened, DEFAULT_ATTEMPT_CAP untouched)', async () => {
    const params = baseParams({
      bays: ['bay-0', 'bay-1'],
      technicians: ['tech-0'],
      attemptCap: 1,
      runAttempt: async () => {
        throw pgError('23P01', 'no_bay_overlap');
      },
    });

    const outcome = await runAttemptLoop(params);
    expect(outcome).toEqual({ kind: 'no-capacity', resource: 'bay', attempts: 1, exit: 'capped' });

    const points = await conflictCounterDataPoints();
    expect(points).toEqual([{ attributes: { resource: 'bay', outcome: 'capped' }, value: 1 }]);
  });

  it('absorbed: a conflict followed by success on a LATER attempt', async () => {
    let attemptCount = 0;
    const params = baseParams({
      bays: ['bay-0', 'bay-1'],
      technicians: ['tech-0'],
      runAttempt: async (_trx, bayId, technicianId) => {
        attemptCount += 1;
        if (attemptCount === 1) throw pgError('23P01', 'no_bay_overlap');
        return { bayId, technicianId };
      },
    });

    await runAttemptLoop(params);

    const points = await conflictCounterDataPoints();
    expect(points).toEqual([{ attributes: { resource: 'bay', outcome: 'absorbed' }, value: 1 }]);
  });

  it('a bad-reference abort increments NOTHING — never retried, never a capacity refusal', async () => {
    const params = baseParams({
      bays: ['bay-0'],
      technicians: ['tech-0'],
      runAttempt: async () => {
        throw pgError('23503', 'appointment_vehicle_owned_by_customer');
      },
    });

    await runAttemptLoop(params);
    expect(await conflictCounterDataPoints()).toEqual([]);
  });

  it('a deadlock increments NOTHING — ADR-0016: no verdict, no capacity refusal to count', async () => {
    const params = baseParams({
      bays: ['bay-0'],
      technicians: ['tech-0'],
      runAttempt: async () => {
        throw pgError('40P01');
      },
    });

    await runAttemptLoop(params);
    expect(await conflictCounterDataPoints()).toEqual([]);
  });
});

describe('runAttemptLoop — booking_attempts, recorded once at exit whatever the outcome (§8.4)', () => {
  it('records 1 on a first-attempt success', async () => {
    const params = baseParams({ bays: ['bay-0'], technicians: ['tech-0'] });
    await runAttemptLoop(params);

    const points = await bookingAttemptsDataPoints();
    expect(points).toEqual([{ value: expect.objectContaining({ sum: 1, count: 1 }) }]);
  });

  it('records the number of attempts actually made on an absorbed success', async () => {
    let attemptCount = 0;
    const params = baseParams({
      bays: ['bay-0', 'bay-1'],
      technicians: ['tech-0'],
      runAttempt: async (_trx, bayId, technicianId) => {
        attemptCount += 1;
        if (attemptCount === 1) throw pgError('23P01', 'no_bay_overlap');
        return { bayId, technicianId };
      },
    });

    await runAttemptLoop(params);

    const points = await bookingAttemptsDataPoints();
    expect(points).toEqual([{ value: expect.objectContaining({ sum: 2, count: 1 }) }]);
  });

  it('records even when the loop rethrows — "working or not" (§8.4) means every exit, not only the clean ones', async () => {
    const fault = new Error('driver exploded');
    const params = baseParams({
      bays: ['bay-0'],
      technicians: ['tech-0'],
      runAttempt: async () => {
        throw fault;
      },
    });

    await expect(runAttemptLoop(params)).rejects.toBe(fault);

    const points = await bookingAttemptsDataPoints();
    expect(points).toEqual([{ value: expect.objectContaining({ sum: 1, count: 1 }) }]);
  });
});
