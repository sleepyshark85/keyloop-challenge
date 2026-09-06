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
  /**
   * ADR-0009's attempt cap, from `BOOKING_ATTEMPT_CAP` (ADR-0022 fixes the name; §5.2 and §7.3
   * had said two different things). Defaults to {@link DEFAULT_ATTEMPT_CAP}.
   */
  readonly attemptCap: number;
  /**
   * ADR-0021's `BOOKING_SEED`. **Unset by default, and unset in production** — every request
   * draws its own seed, which is ADR-0009's Order-C. Set, every request in the process uses this
   * one, which IS Order-A: one permutation for every caller, contention concentrated on
   * whichever resource that permutation puts first, and retry work quadratic under a burst.
   *
   * It exists because a test needs a handle rather than a label (T-04-1), and the knob is
   * announced at startup rather than hidden: {@link configWarnings}. ADR-0021 rejected gating it
   * on `NODE_ENV` for a reason that outranks the discomfort — ADR-0013 has the outside-in tests
   * exercise the BUILT artifact, and a test-only branch makes the tested artifact a different
   * program from the shipped one.
   */
  readonly bookingSeed?: number;
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

/**
 * ADR-0009's cap: sixteen attempts, after which a booking is refused exactly as if its candidate
 * list had emptied. It lives here because ADR-0009 put it here.
 *
 * D-04-1, recorded rather than fixed: sixteen sits BELOW the additive bound Bound-2 computes at
 * §1.1 scale (`|bays| + |technicians| - 1`, roughly forty), so a `capped` refusal is expected
 * today rather than the signal ADR-0009 intended by "a non-zero cap-exceeded counter means the
 * cap is wrong". The remedies are the advisory pre-filter after slice 08, or a larger cap; the
 * value is human-decided and is flagged at the gate rather than changed here.
 */
export const DEFAULT_ATTEMPT_CAP = 16;

/**
 * The cap's legal range. **The lower bound of 1 is load-bearing rather than taste** (I-04-7):
 * ADR-0020 puts the cap's test INSIDE the `23P01` arm, so it is reached only after a
 * classification and there is no refusal exit before the first attempt. `BOOKING_ATTEMPT_CAP=0`
 * would therefore behave exactly as 1 — one attempt, then refuse — and an operator who set it to
 * zero meaning "make no attempt" would get the opposite of what they asked for, silently. It is
 * refused at startup instead.
 *
 * The upper bound is a sanity rail on a latency guard: at three round trips per attempt (ADR-0018)
 * a cap of a thousand is already far past any interactive budget, and past it the value is more
 * likely a typo than an intention.
 */
const MIN_ATTEMPT_CAP = 1;
const MAX_ATTEMPT_CAP = 1_000;

/** The largest value `crypto.getRandomValues(new Uint32Array(1))` can produce. */
const MAX_SEED = 0xffff_ffff;

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

  // ADR-0009's cap, ADR-0022's name. Absent means the default, which is the shipped behaviour
  // AC-4 asserts — the knob exists because ADR-0009 put it in `platform/config.ts`, not because
  // anything in the suite turns it.
  const rawCap = (env['BOOKING_ATTEMPT_CAP'] ?? '').trim();
  let attemptCap = DEFAULT_ATTEMPT_CAP;
  if (rawCap !== '') {
    if (!/^\d+$/.test(rawCap)) {
      problems.push(
        `BOOKING_ATTEMPT_CAP must be an integer, got ${JSON.stringify(rawCap)}`,
      );
    } else {
      const parsed = Number(rawCap);
      if (parsed < MIN_ATTEMPT_CAP || parsed > MAX_ATTEMPT_CAP) {
        problems.push(
          `BOOKING_ATTEMPT_CAP must be between ${String(MIN_ATTEMPT_CAP)} and ` +
            `${String(MAX_ATTEMPT_CAP)}, got ${rawCap}`,
        );
      } else {
        attemptCap = parsed;
      }
    }
  }

  // ADR-0021. Absent is the default and the only production setting, so an EMPTY or unset value
  // is not a problem — it is the normal case. A malformed one is: silently ignoring
  // `BOOKING_SEED=banana` would leave an operator believing the order is pinned when it is not,
  // and this file's whole contract is that a bad value fails the process at startup rather than
  // surfacing later as behaviour nobody can explain.
  const rawSeed = (env['BOOKING_SEED'] ?? '').trim();
  let bookingSeed: number | undefined;
  if (rawSeed !== '') {
    if (!/^\d+$/.test(rawSeed)) {
      problems.push(
        `BOOKING_SEED must be a non-negative integer, got ${JSON.stringify(rawSeed)}`,
      );
    } else if (Number(rawSeed) > MAX_SEED) {
      problems.push(`BOOKING_SEED must be at most ${String(MAX_SEED)}, got ${rawSeed}`);
    } else {
      bookingSeed = Number(rawSeed);
    }
  }

  if (problems.length > 0) throw new ConfigError(problems);

  // Spread rather than `bookingSeed: undefined`, so "unset" is genuinely an absent property and
  // a reader cannot tell the two apart by accident.
  return {
    databaseUrl,
    port,
    logLevel,
    attemptCap,
    ...(bookingSeed === undefined ? {} : { bookingSeed }),
  };
}

/**
 * What an operator must be told about the configuration they have, at startup, once.
 *
 * WHY THIS IS A FUNCTION AND NOT A `logger.warn` INSIDE `loadConfig`. ADR-0021 asks for one
 * startup `warn` naming the consequence, and `loadConfig` cannot emit one: the logger is BUILT
 * FROM ITS RETURN VALUE, so at the moment the seed is read there is no logger, and
 * `platform-is-a-leaf` plus the leaf's own no-behaviour rule make writing to a stream from here
 * the wrong kind of fix. So this file keeps the WORDING — the consequence is a configuration
 * fact and belongs beside the field it is about — and `main.ts` emits it through `pino` as soon
 * as there is a logger. One line, at startup, at `warn`, exactly as the ADR requires.
 */
export function configWarnings(config: Config): readonly string[] {
  if (config.bookingSeed === undefined) return [];
  return [
    `BOOKING_SEED=${String(config.bookingSeed)} is set: EVERY booking request will use this one ` +
      `seed, so every request draws candidates in the same order. That is ADR-0009's rejected ` +
      `Order-A — contention concentrates on one bay and one technician and retry work grows ` +
      `quadratically under a burst. It is for reproducing a run, never for production.`,
  ];
}
