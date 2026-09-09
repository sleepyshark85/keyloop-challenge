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
import pino from 'pino';
import type { DestinationStream, Logger } from 'pino';
import { context, trace } from '@opentelemetry/api';
import type { Config } from './config.js';
import { createOtelLogStream } from './otelLogStream.js';

export type { Logger };

/**
 * ── SLICE 14 — STDOUT, PLUS THE OTEL BRIDGE, NEVER ONE INSTEAD OF THE OTHER ────────────────────
 *
 * `docs/slices/14-design.md` §2 (ADR-0037): every `pino` call must still reach stdout (AC-7,
 * AC-8) AND, on the same call, reach the collector over OTLP (AC-3 through AC-6). `destination`
 * is a testability seam (see below) and takes priority when given, unchanged from before this
 * slice; the DEFAULT path — production, `src/main.ts`'s only caller — composes the real stdout
 * destination with {@link createOtelLogStream}'s bridge via `pino.multistream`, which is what
 * makes "alongside, never replacing" true for the one caller that matters.
 *
 * `pino.destination({ dest: 1, sync: false })` rather than leaving the stream unspecified: it
 * is what `pino()` itself falls back to when writing to `process.stdout.fd`, named explicitly
 * so it composes into an array; `sync: false` keeps the SAME asynchronous, non-blocking write
 * behaviour `pino`'s own default uses (never one that could block the event loop under load).
 */
function stdoutDestination(): DestinationStream {
  return pino.destination({ dest: 1, sync: false });
}

/**
 * `destination` is a testability seam, the same shape `CreateDbOptions.pool` is
 * (`src/persistence/db.ts`): production (`src/main.ts`) never passes one, so the default
 * (stdout, plus the OTel bridge) is what runs; a unit test passes a capturing `{ write }`
 * object, the exact shape `tests/unit/http/appointments.test.ts` already builds by hand, to
 * read the mixin's output back rather than asserting on stdout — and to do so without also
 * standing up the OTel bridge, which a test that only wants the mixin's own fields has no need
 * of.
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
  if (destination !== undefined) return pino(options, destination);
  const streams = pino.multistream([{ stream: stdoutDestination() }, { stream: createOtelLogStream() }]);
  return pino(options, streams);
}
