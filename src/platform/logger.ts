/**
 * The process's `pino` instance.
 *
 * `src/platform` is a leaf (`platform-is-a-leaf`): it imports nothing from `src/` other
 * than its own siblings, and in particular it must never name `fastify`. The logger is
 * handed to Fastify by `src/main.ts` as `loggerInstance`; `src/http` sees it only as
 * `FastifyBaseLogger` (docs/slices/00a-design.md §2(c)).
 *
 * ── AC-6 — `trace_id`/`span_id`, FROM THE ACTIVE CONTEXT, ON EVERY LINE ────────────────────────
 *
 * arc42 §8.4: "each carrying `trace_id` and `span_id` from the active context so Loki and Tempo
 * join without a correlation id of their own." A pino `mixin` runs on every log call — Fastify's
 * own request-lifecycle lines included, since they share this one instance — and reads whatever
 * span is active via `@opentelemetry/api`'s `trace.getSpan(context.active())`. `@opentelemetry/api`
 * is importable from anywhere (`docs/slices/09-design.md` decision 1); the SDK itself is not named
 * here, only the facade, so `platform-is-a-leaf` is untouched and `otel-sdk-only-in-platform` has
 * nothing to fire on. When nothing is active — no telemetry configured, or a line logged outside
 * any span — the mixin contributes nothing, so a call site's shape never has to know whether
 * tracing is on.
 */
import { pino } from 'pino';
import type { DestinationStream, Logger } from 'pino';
import { context, trace } from '@opentelemetry/api';
import type { Config } from './config.js';

export type { Logger };

/**
 * `destination` is a testability seam, the same shape `CreateDbOptions.pool` is
 * (`src/persistence/db.ts`): production (`src/main.ts`) never passes one, so `pino`'s own
 * default (stdout) is unchanged; a unit test passes a capturing `{ write }` object, the exact
 * shape `tests/unit/http/appointments.test.ts` already builds by hand, to read the mixin's
 * output back rather than asserting on stdout.
 */
export function createLogger(config: Pick<Config, 'logLevel'>, destination?: DestinationStream): Logger {
  const options = {
    level: config.logLevel,
    mixin(): Record<string, string> {
      const span = trace.getSpan(context.active());
      if (span === undefined) return {};
      const spanContext = span.spanContext();
      return { trace_id: spanContext.traceId, span_id: spanContext.spanId };
    },
  };
  return destination === undefined ? pino(options) : pino(options, destination);
}
