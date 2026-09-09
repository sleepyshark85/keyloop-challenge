import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { context, trace } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { logs } from '@opentelemetry/api-logs';
import { InMemoryLogRecordExporter, LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import pino from 'pino';
import { createLogger } from '../../../src/platform/logger.js';
import { LOG_LEVELS } from '../../../src/platform/config.js';

/**
 * This file exists because mutation testing found `logger.ts` had no test at all: its whole
 * body could be replaced with `{}` and nothing in the suite noticed. It looked covered
 * because `tests/unit/http/health.test.ts` calls `createLogger` — but it only ever passes
 * the result to Fastify, and Fastify accepts `undefined` as "no logger", so a `createLogger`
 * that returned nothing was indistinguishable from one that worked.
 *
 * What is asserted is the FILTERING, not the object. `LOG_LEVEL` exists so an operator can
 * turn the volume down in production and up while diagnosing, and `pino({})` — the mutant
 * that dropped the level — silently pins every deployment at `info`. That is the kind of
 * defect nobody reports as a bug; they just never see the debug lines they asked for.
 */
describe('createLogger', () => {
  it('returns a usable logger', () => {
    const logger = createLogger({ logLevel: 'info' });

    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it.each(LOG_LEVELS)('honours LOG_LEVEL=%s', (logLevel) => {
    expect(createLogger({ logLevel }).level).toBe(logLevel);
  });

  it('actually silences what the level excludes', () => {
    const logger = createLogger({ logLevel: 'warn' });

    expect(logger.isLevelEnabled('warn')).toBe(true);
    expect(logger.isLevelEnabled('error')).toBe(true);
    expect(
      logger.isLevelEnabled('info'),
      'LOG_LEVEL=warn still emits info; the level was dropped somewhere',
    ).toBe(false);
    expect(logger.isLevelEnabled('debug')).toBe(false);
  });

  it('emits nothing at all at LOG_LEVEL=silent, which the acceptance harness relies on', () => {
    const logger = createLogger({ logLevel: 'silent' });

    for (const level of ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const) {
      expect(logger.isLevelEnabled(level), `silent still emits ${level}`).toBe(false);
    }
  });

  it('does not default to info regardless of what it was given', () => {
    // The specific mutant: `pino({ level: config.logLevel })` → `pino({})`. pino's own
    // default is `info`, so only a NON-info level can tell the two apart.
    expect(createLogger({ logLevel: 'trace' }).level).not.toBe('info');
    expect(createLogger({ logLevel: 'fatal' }).level).not.toBe('info');
  });
});

/**
 * Slice 14 (design §2/ADR-0037): the DEFAULT path — no `destination` override, `src/main.ts`'s
 * only caller — composes real stdout with the OTel bridge via `pino.multistream`, "added
 * alongside stdout, never replacing it". A unit test cannot intercept fd 1 without monkeypatching
 * the process, so what is asserted here is that the composed stream construction and an actual
 * write through it do not throw — the exact property `write()` NEVER THROWS rests on (§7.1,
 * AC-8). `tests/integration/telemetry-logs.test.ts` (test-engineer's) is what proves the
 * composed stream actually reaches both stdout and the collector end to end.
 */
describe('createLogger — the default stream composition (no destination override)', () => {
  it('constructs and writes through stdout + the OTel bridge without throwing', () => {
    const logger = createLogger({ logLevel: 'info' });
    expect(() => logger.info({ probe: 'slice-14-default-stream' }, 'default stream composition')).not.toThrow();
  });

  it('builds the stdout destination on fd 1, asynchronously — the same shape pino\'s own unspecified-stream default uses', () => {
    const spy = vi.spyOn(pino, 'destination');
    try {
      createLogger({ logLevel: 'silent' });
      expect(spy).toHaveBeenCalledWith({ dest: 1, sync: false });
    } finally {
      spy.mockRestore();
    }
  });
});

/**
 * The property `pino.multistream([{ stream: stdoutDestination() }, { stream:
 * createOtelLogStream() }])` exists for: a line written through the DEFAULT path (no
 * `destination` override) must reach the OTel bridge, not only stdout. `destination !==
 * undefined` and `pino.multistream([...])` are both otherwise invisible to a test that only
 * checks `.info()` does not throw — either could be replaced with `true`/`[]` and the "does
 * not throw" test above would still pass, because a destination-less `pino(options,
 * undefined)` throws just as little as the real composition does. A real, in-memory
 * `LoggerProvider` (the same shape `otelLogStream.test.ts` uses) is what makes "the bridge
 * actually received this line" an observable fact rather than an assumption.
 */
describe('createLogger — the default path reaches the OTel bridge, not only stdout', () => {
  const logExporter = new InMemoryLogRecordExporter();
  const loggerProvider = new LoggerProvider({
    processors: [new SimpleLogRecordProcessor({ exporter: logExporter })],
  });

  beforeAll(() => {
    logs.setGlobalLoggerProvider(loggerProvider);
  });

  afterEach(() => {
    logExporter.reset();
  });

  afterAll(async () => {
    await loggerProvider.shutdown();
    logs.disable();
  });

  it('a line written with no destination override is exported through the OTel bridge', () => {
    const logger = createLogger({ logLevel: 'info' });

    logger.info('reaches the default-composed OTel bridge');

    const [record] = logExporter.getFinishedLogRecords();
    expect(
      record?.body,
      'the default stream composition must include the OTel bridge alongside stdout',
    ).toBe('reaches the default-composed OTel bridge');
  });

  it.each(['debug', 'trace'] as const)(
    'a LOG_LEVEL=%s line still reaches the OTel bridge (step 5 finding, MAJOR)',
    (logLevel) => {
      const logger = createLogger({ logLevel });

      logger[logLevel](`a ${logLevel} line`);

      const records = logExporter.getFinishedLogRecords();
      expect(
        records.map((r) => r.body),
        `LOG_LEVEL=${logLevel} must still reach the OTel bridge through the default composition, ` +
          `not only stdout — arc42 §7.3 calls the LOG_LEVEL table "the contract".`,
      ).toContain(`a ${logLevel} line`);
    },
  );
});

/**
 * The regression itself, reproduced directly against the stdout side: `pino.multistream`'s own
 * per-`StreamEntry` `level` defaults to `DEFAULT_INFO_LEVEL`
 * (`node_modules/pino/lib/multistream.js:123`) when omitted — a SECOND gate below the parent
 * `pino` instance's own `options.level`, which silently dropped every `debug`/`trace` line for
 * BOTH streams even though the parent had already decided to emit them. `pino.destination` is
 * spied and made to return a plain capturing object, the same technique the construction-args
 * test above uses, so "reached stdout" is observable without touching the real fd.
 */
describe('createLogger — a LOG_LEVEL below info still reaches stdout (step 5 finding, MAJOR)', () => {
  it.each(['debug', 'trace'] as const)('LOG_LEVEL=%s reaches the stdout destination', (logLevel) => {
    const written: string[] = [];
    const spy = vi.spyOn(pino, 'destination').mockReturnValue({
      write: (line: string): boolean => {
        written.push(line);
        return true;
      },
    } as ReturnType<typeof pino.destination>);
    try {
      const logger = createLogger({ logLevel });
      logger[logLevel](`a ${logLevel} line`);

      expect(
        written,
        `LOG_LEVEL=${logLevel} must still reach stdout through the default stream composition — ` +
          `plain pino(options), the pre-slice behaviour, wrote it; multistream must not filter ` +
          `it out a second time.`,
      ).toHaveLength(1);
      expect(JSON.parse(written[0] as string)).toMatchObject({ msg: `a ${logLevel} line` });
    } finally {
      spy.mockRestore();
    }
  });
});

/**
 * AC-6 / arc42 §8.4 — "each carrying `trace_id` and `span_id` from the active context". A fake
 * `Span` is enough: the mixin only ever calls `.spanContext()`, and `context.with` is what makes
 * it "active" without a real `NodeTracerProvider` — the same mechanism `AsyncLocalStorageContext
 * Manager` uses in production, just without the SDK this file must not import
 * (`otel-sdk-only-in-platform`, decision 1).
 */
describe('createLogger — trace_id/span_id from the active OTel context', () => {
  // `@opentelemetry/api`'s default context manager is a no-op: `context.with(ctx, fn)` runs
  // `fn` without actually making `ctx` "active", so `context.active()` would always report the
  // root context and this describe block would pass vacuously. Registering the SAME context
  // manager `src/platform/telemetry.ts` registers in production (decision 1's "note the Node
  // SDK's AsyncLocalStorageContextManager must be registered") is what makes `context.with`
  // load-bearing here — a test file, not `src/`, so `otel-sdk-only-in-platform` does not apply.
  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  });
  afterAll(() => {
    context.disable();
  });

  function fakeSpan(traceId: string, spanId: string): Span {
    return { spanContext: () => ({ traceId, spanId, traceFlags: 1 }) } as unknown as Span;
  }

  function logOneLine(): { logger: ReturnType<typeof createLogger>; lines: string[] } {
    const lines: string[] = [];
    const logger = createLogger({ logLevel: 'info' }, { write: (line: string): void => void lines.push(line) });
    return { logger, lines };
  }

  it('adds trace_id/span_id when a span is active', () => {
    const span = fakeSpan('0af7651916cd43dd8448eb211c80319c', 'b7ad6b7169203331');
    const { logger, lines } = logOneLine();

    context.with(trace.setSpan(context.active(), span), () => {
      logger.info('inside the span');
    });

    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0] as string) as Record<string, unknown>;
    expect(record['trace_id']).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(record['span_id']).toBe('b7ad6b7169203331');
  });

  it('omits both fields when no span is active', () => {
    const { logger, lines } = logOneLine();

    logger.info('outside any span');

    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0] as string) as Record<string, unknown>;
    expect(record['trace_id']).toBeUndefined();
    expect(record['span_id']).toBeUndefined();
  });
});
