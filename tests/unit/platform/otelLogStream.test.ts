import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { context, trace } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { InMemoryLogRecordExporter, LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { createOtelLogStream } from '../../../src/platform/otelLogStream.js';

/**
 * `docs/slices/14-design.md` §2/§4: the bridge is the one file the design calls out by name
 * for "where survivors hide" — a severity mapping and an attribute allowlist, both easy to get
 * half right without a test noticing. This file registers a REAL, in-memory `LoggerProvider`
 * (`SimpleLogRecordProcessor` — synchronous, so a written record is exported before the next
 * assertion runs, unlike `telemetry.ts`'s `Batch...`) and reads records back off it, on the
 * shape `tests/unit/platform/telemetry.test.ts` already uses for the SDK's other two signals.
 *
 * `otel-sdk-only-in-platform`/`otel-logs-api-only-in-platform` restrict `src/`, not
 * `tests/unit/` — this file is free to import the SDK and the facade directly.
 */

const logExporter = new InMemoryLogRecordExporter();
const loggerProvider = new LoggerProvider({
  processors: [new SimpleLogRecordProcessor({ exporter: logExporter })],
});

beforeAll(() => {
  logs.setGlobalLoggerProvider(loggerProvider);
  // Same idiom as `logger.test.ts`'s own active-context block: `@opentelemetry/api`'s default
  // context manager is a no-op, so `context.with` would never make anything "active" without
  // registering the same manager `telemetry.ts` registers in production.
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
});

afterEach(() => {
  logExporter.reset();
});

afterAll(async () => {
  await loggerProvider.shutdown();
  logs.disable();
  context.disable();
});

function fakeSpan(traceId: string, spanId: string): Span {
  return { spanContext: () => ({ traceId, spanId, traceFlags: 1 }) } as unknown as Span;
}

/** Writes `line` (an object) as one pino NDJSON write, inside the given span if any. */
function writeLine(line: Record<string, unknown>, span?: Span): void {
  const stream = createOtelLogStream();
  const data = `${JSON.stringify(line)}\n`;
  if (span === undefined) {
    stream.write(data);
  } else {
    context.with(trace.setSpan(context.active(), span), () => {
      stream.write(data);
    });
  }
}

function exported(): readonly ReadableLogRecord[] {
  return logExporter.getFinishedLogRecords();
}

describe('createOtelLogStream — severity mapping (AC-5)', () => {
  it.each([
    [10, SeverityNumber.TRACE, 'TRACE'],
    [20, SeverityNumber.DEBUG, 'DEBUG'],
    [30, SeverityNumber.INFO, 'INFO'],
    [40, SeverityNumber.WARN, 'WARN'],
    [50, SeverityNumber.ERROR, 'ERROR'],
    [60, SeverityNumber.FATAL, 'FATAL'],
  ])('pino level %i -> severityNumber %i (%s)', (level, expectedNumber, expectedText) => {
    writeLine({ level, time: 1, msg: 'm', pid: 1, hostname: 'h' });

    const [record] = exported();
    expect(record?.severityNumber).toBe(expectedNumber);
    expect(record?.severityText).toBe(expectedText);
  });

  it('a level between two standard levels buckets DOWN to the lower named severity', () => {
    writeLine({ level: 35, time: 1, msg: 'm', pid: 1, hostname: 'h' });

    const [record] = exported();
    expect(record?.severityNumber).toBe(SeverityNumber.INFO);
    expect(record?.severityText).toBe('INFO');
  });

  it('a non-numeric or absent level leaves severity unset rather than a hardcoded default', () => {
    writeLine({ time: 1, msg: 'm', pid: 1, hostname: 'h' });

    // Guarded first (step 5 finding 2): `severity?.number`/`severity?.text` mutated to
    // `severity.number`/`severity.text` throws inside the bridge's own try/catch when
    // `severity` is `undefined`, which is swallowed and exports NO record at all — leaving
    // this test's two `toBeUndefined()` checks true VACUOUSLY, over an empty export, exactly
    // the absence-vacuity shape DCR-14-1 was raised about. A record must exist before its
    // fields are asserted absent.
    const records = exported();
    expect(records, 'expected exactly one exported record to examine — this assertion would be vacuous over zero').toHaveLength(1);
    const [record] = records;
    expect(record?.severityNumber).toBeUndefined();
    expect(record?.severityText).toBeUndefined();
  });
});

describe('createOtelLogStream — body (AC-3)', () => {
  it('carries pino\'s msg as the record body', () => {
    writeLine({ level: 30, time: 1, msg: 'hello from a request', pid: 1, hostname: 'h' });

    const [record] = exported();
    expect(record?.body).toBe('hello from a request');
  });

  it('leaves body undefined when msg is absent, rather than throwing', () => {
    expect(() => writeLine({ level: 30, time: 1, pid: 1, hostname: 'h' })).not.toThrow();

    const records = exported();
    expect(records, 'expected exactly one exported record — this assertion would be vacuous over zero').toHaveLength(1);
    expect(records[0]?.body).toBeUndefined();
  });

  it('leaves body undefined — not the raw value — when msg is present but not a string', () => {
    // step 5 finding 3: `typeof msg === 'string' ? msg : undefined` mutated to `true ? msg :
    // undefined` exports `body: 42` instead of `body: undefined`; only a non-string msg
    // distinguishes the two, since `msg` absent (above) is `undefined` either way.
    writeLine({ level: 30, time: 1, msg: 42, pid: 1, hostname: 'h' });

    const records = exported();
    expect(records, 'expected exactly one exported record — this assertion would be vacuous over zero').toHaveLength(1);
    expect(records[0]?.body).toBeUndefined();
  });
});

describe('createOtelLogStream — attributes (AC-6)', () => {
  it('carries a non-structural field as an attribute', () => {
    writeLine({ level: 30, time: 1, msg: 'm', pid: 1, hostname: 'h', dealershipId: 'd-1' });

    const [record] = exported();
    expect(record?.attributes).toEqual({ dealershipId: 'd-1' });
  });

  it('excludes every pino-structural field: level, time, pid, hostname, msg, trace_id, span_id, v, reqId', () => {
    writeLine({
      level: 30,
      time: 1,
      msg: 'm',
      pid: 1,
      hostname: 'h',
      trace_id: '0af7651916cd43dd8448eb211c80319c',
      span_id: 'b7ad6b7169203331',
      v: 1,
      reqId: 'req-1',
      resourceId: 'bay-1',
    });

    const [record] = exported();
    expect(record?.attributes).toEqual({ resourceId: 'bay-1' });
  });

  it('preserves a structured (nested) field as-is, e.g. a serialised err', () => {
    writeLine({ level: 50, time: 1, msg: 'boom', pid: 1, hostname: 'h', err: { type: 'Error', message: 'boom' } });

    const [record] = exported();
    expect(record?.attributes['err']).toEqual({ type: 'Error', message: 'boom' });
  });
});

describe('createOtelLogStream — trace correlation, from the ACTIVE context (AC-4)', () => {
  it('carries the active span\'s traceId/spanId on the record itself, not parsed from the line', () => {
    const span = fakeSpan('0af7651916cd43dd8448eb211c80319c', 'b7ad6b7169203331');

    // The line's OWN trace_id/span_id text disagrees with the active span on purpose: if the
    // bridge ever regressed to parsing them out of the JSON instead of reading the active
    // context, this is what would catch it.
    writeLine(
      { level: 30, time: 1, msg: 'm', pid: 1, hostname: 'h', trace_id: 'ffffffffffffffffffffffffffffffff', span_id: 'ffffffffffffffff' },
      span,
    );

    const [record] = exported();
    expect(record?.spanContext?.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(record?.spanContext?.spanId).toBe('b7ad6b7169203331');
  });

  it('carries no span context when nothing is active', () => {
    writeLine({ level: 30, time: 1, msg: 'm', pid: 1, hostname: 'h' });

    const [record] = exported();
    expect(record?.spanContext).toBeUndefined();
  });
});

describe('createOtelLogStream — write() never throws (§7.1, AC-8)', () => {
  it.each(['not json', '{"unterminated', '[]', 'null', '"a string"', '42', ''])(
    'swallows malformed or non-object input: %j',
    (raw) => {
      const stream = createOtelLogStream();
      expect(() => stream.write(raw)).not.toThrow();
      expect(exported()).toEqual([]);
    },
  );
});
