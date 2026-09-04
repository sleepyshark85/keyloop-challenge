import { describe, expect, it } from 'vitest';
import { ConfigError, LOG_LEVELS, loadConfig } from '../../../src/platform/config.js';

/**
 * `loadConfig` is the one place arc42 §7.3's "fails the process rather than surfacing as a
 * request error at 03:00" is made true, so what is asserted here is mostly the failures.
 *
 * `PORT` and `DATABASE_URL` are required rather than defaulted: a default connection string
 * points at the wrong database silently, which is the failure mode the rule exists to
 * prevent. `LOG_LEVEL` is defaulted because there is no wrong-but-plausible value for it.
 */
const VALID = {
  DATABASE_URL: 'postgresql://keyloop:keyloop@127.0.0.1:5432/keyloop',
  PORT: '3000',
  LOG_LEVEL: 'warn',
} satisfies NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('reads a well-formed environment', () => {
    expect(loadConfig(VALID)).toEqual({
      databaseUrl: 'postgresql://keyloop:keyloop@127.0.0.1:5432/keyloop',
      port: 3000,
      logLevel: 'warn',
    });
  });

  it('defaults LOG_LEVEL to info when it is absent', () => {
    const { LOG_LEVEL: _omitted, ...env } = VALID;
    expect(loadConfig(env).logLevel).toBe('info');
  });

  it.each(LOG_LEVELS)('accepts the pino level %s', (level) => {
    expect(loadConfig({ ...VALID, LOG_LEVEL: level }).logLevel).toBe(level);
  });

  it('rejects a LOG_LEVEL pino does not know, naming the legal values', () => {
    expect(() => loadConfig({ ...VALID, LOG_LEVEL: 'verbose' })).toThrowError(
      /LOG_LEVEL must be one of .*got "verbose"/,
    );
  });

  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL: _omitted, ...env } = VALID;
    expect(() => loadConfig(env)).toThrowError(/DATABASE_URL is required/);
  });

  it('rejects a blank DATABASE_URL, which an unset compose variable expands to', () => {
    expect(() => loadConfig({ ...VALID, DATABASE_URL: '   ' })).toThrowError(
      /DATABASE_URL is required/,
    );
  });

  it('rejects a missing PORT', () => {
    const { PORT: _omitted, ...env } = VALID;
    expect(() => loadConfig(env)).toThrowError(/PORT is required/);
  });

  it.each(['http', '80.5', '-1', '8080abc', ''])(
    'rejects PORT=%j as not an integer',
    (rawPort) => {
      expect(() => loadConfig({ ...VALID, PORT: rawPort })).toThrowError(/PORT/);
    },
  );

  it.each(['0', '65536'])('rejects PORT=%s as out of range', (rawPort) => {
    expect(() => loadConfig({ ...VALID, PORT: rawPort })).toThrowError(
      /PORT must be between 1 and 65535/,
    );
  });

  it('reports every problem at once rather than one restart at a time', () => {
    let thrown: unknown;
    try {
      loadConfig({ PORT: 'nope', LOG_LEVEL: 'chatty' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConfigError);
    expect((thrown as ConfigError).problems).toHaveLength(3);
    expect((thrown as ConfigError).message).toMatch(/DATABASE_URL/);
    expect((thrown as ConfigError).message).toMatch(/PORT/);
    expect((thrown as ConfigError).message).toMatch(/LOG_LEVEL/);
  });
});
