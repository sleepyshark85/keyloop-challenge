import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { context, trace } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
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
