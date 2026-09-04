import { describe, expect, it } from 'vitest';
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
