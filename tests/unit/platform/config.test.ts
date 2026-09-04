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

/**
 * The diagnosis is the behaviour here, not a detail of it.
 *
 * `loadConfig` runs once, at startup, before there is a logger — so the thrown error IS the
 * whole of what a person gets when a deployment is misconfigured at 03:00. A test that only
 * asserts "it threw" leaves every word of that message free to rot, and mutation testing
 * says so: blanking the heading, the bullet prefix or the list separator changed nothing
 * any test could see.
 */
describe('ConfigError', () => {
  const thrownBy = (env: NodeJS.ProcessEnv): ConfigError => {
    try {
      loadConfig(env);
    } catch (error) {
      return error as ConfigError;
    }
    throw new Error('loadConfig did not throw');
  };

  it('is identifiable by name, so a caller can tell it from any other Error', () => {
    expect(thrownBy({}).name).toBe('ConfigError');
  });

  it('reads as a heading and one bullet per problem', () => {
    const error = thrownBy({});
    const [heading, ...bullets] = error.message.split('\n');

    expect(heading).toBe('invalid configuration:');
    expect(bullets).toEqual(error.problems.map((problem) => `  - ${problem}`));
    expect(bullets).toHaveLength(2);
  });

  it('lists the legal log levels separated, not run together', () => {
    // `LOG_LEVELS.join(', ')` with a blank separator produces "fatalerrorwarn…", which is
    // still a message and still useless to the person reading it.
    expect(thrownBy({ ...VALID, LOG_LEVEL: 'verbose' }).message).toContain('fatal, error, warn');
  });
});

/**
 * Values arrive from a shell, a compose file or a CI secret, and every one of those can
 * deliver a value with whitespace around it. Trimming is what makes `PORT=" 3000 "` a port
 * rather than an error naming a string the operator cannot see the problem with.
 */
describe('surrounding whitespace', () => {
  it('accepts a padded PORT as the port it obviously is', () => {
    expect(loadConfig({ ...VALID, PORT: ' 3000 ' }).port).toBe(3000);
  });

  it('accepts a padded LOG_LEVEL', () => {
    expect(loadConfig({ ...VALID, LOG_LEVEL: '  warn\n' }).logLevel).toBe('warn');
  });

  it('accepts a padded DATABASE_URL and hands on the trimmed value', () => {
    expect(loadConfig({ ...VALID, DATABASE_URL: `  ${VALID.DATABASE_URL}\t` }).databaseUrl).toBe(
      VALID.DATABASE_URL,
    );
  });
});

/**
 * The ends of the range are the interesting part: 1 and 65535 are legal ports, and an
 * off-by-one here rejects a configuration that would have worked. Asserted from both
 * sides so that neither comparison can be loosened or tightened unobserved.
 */
describe('the PORT range', () => {
  it.each(['1', '80', '65535'])('accepts %s', (rawPort) => {
    expect(loadConfig({ ...VALID, PORT: rawPort }).port).toBe(Number(rawPort));
  });

  it.each(['0', '65536'])('rejects %s', (rawPort) => {
    expect(() => loadConfig({ ...VALID, PORT: rawPort })).toThrowError(
      `PORT must be between 1 and 65535, got ${rawPort}`,
    );
  });
});
