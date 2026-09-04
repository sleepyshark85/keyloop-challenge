/**
 * The process's `pino` instance.
 *
 * `src/platform` is a leaf (`platform-is-a-leaf`): it imports nothing from `src/` other
 * than its own siblings, and in particular it must never name `fastify`. The logger is
 * handed to Fastify by `src/main.ts` as `loggerInstance`; `src/http` sees it only as
 * `FastifyBaseLogger` (docs/slices/00a-design.md §2(c)).
 */
import { pino } from 'pino';
import type { Logger } from 'pino';
import type { Config } from './config.js';

export type { Logger };

export function createLogger(config: Pick<Config, 'logLevel'>): Logger {
  return pino({ level: config.logLevel });
}
