/**
 * Environment configuration — read once, validated once, at startup.
 *
 * arc42 §7.3: "Environment variables only, read once in `src/platform/config.ts` and
 * validated at startup — a missing or malformed value fails the process rather than
 * surfacing as a request error at 03:00."
 *
 * The validation is HAND-ROLLED on purpose. The obvious move is a TypeBox schema, and it
 * is a build failure: `http-framework-only-in-the-edge` confines `@sinclair/typebox` to
 * `src/http` and `src/main.ts`, so a schema here would fail `npm run lint:arch`
 * (docs/slices/00a-design.md §1). Twenty lines of `if` cost less than an exemption.
 *
 * Every problem is collected before throwing, rather than failing on the first. Someone
 * bringing the service up for the first time should learn about all three variables at
 * once, not one restart at a time.
 */

/** `pino`'s levels, plus `silent`. The acceptance harness starts the service at `silent`. */
export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Config {
  /** PostgreSQL connection string. Required: a default here would point at the wrong database quietly. */
  readonly databaseUrl: string;
  /** The HTTP listener's port. */
  readonly port: number;
  /** `pino` level; defaults to `info`. */
  readonly logLevel: LogLevel;
}

/** Thrown by {@link loadConfig}. Names every problem it found, not just the first. */
export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

const DEFAULT_LOG_LEVEL: LogLevel = 'info';

function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}

/**
 * @throws {ConfigError} if any variable is missing or malformed.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const problems: string[] = [];

  const databaseUrl = (env['DATABASE_URL'] ?? '').trim();
  if (databaseUrl === '') {
    problems.push('DATABASE_URL is required (a PostgreSQL connection string)');
  }

  const rawPort = (env['PORT'] ?? '').trim();
  let port = 0;
  if (rawPort === '') {
    problems.push('PORT is required (the HTTP listener port)');
  } else if (!/^\d+$/.test(rawPort)) {
    problems.push(`PORT must be an integer, got ${JSON.stringify(rawPort)}`);
  } else {
    port = Number(rawPort);
    if (port < 1 || port > 65535) {
      problems.push(`PORT must be between 1 and 65535, got ${rawPort}`);
    }
  }

  const rawLogLevel = (env['LOG_LEVEL'] ?? '').trim();
  let logLevel: LogLevel = DEFAULT_LOG_LEVEL;
  if (rawLogLevel !== '') {
    if (isLogLevel(rawLogLevel)) {
      logLevel = rawLogLevel;
    } else {
      problems.push(
        `LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, got ${JSON.stringify(rawLogLevel)}`,
      );
    }
  }

  if (problems.length > 0) throw new ConfigError(problems);

  return { databaseUrl, port, logLevel };
}
