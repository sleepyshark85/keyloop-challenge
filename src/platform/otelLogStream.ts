/**
 * The in-process bridge from `pino` to `@opentelemetry/api-logs` — ADR-0037, `docs/slices/
 * 14-design.md` §2. A `DestinationStream` `pino.multistream` writes ALONGSIDE stdout, never
 * instead of it: `src/platform/logger.ts` composes this stream with the process's real stdout,
 * so every `pino` call still produces the JSON line slice 09's AC-6 already asserts, and now
 * ALSO an OTel `LogRecord` carrying the same trace context.
 *
 * `@opentelemetry/api-logs` is confined to `src/platform` by `otel-logs-api-only-in-platform`
 * (`.dependency-cruiser.js`) — this is that rule's one permitted home, and the reason a log
 * line is created exactly ONE way in this codebase rather than at whatever call site feels like
 * reaching for the facade directly.
 *
 * ── WHY `write()` MUST NEVER THROW ──────────────────────────────────────────────────────────
 *
 * `pino.multistream`'s own `write()` (`node_modules/pino/lib/multistream.js`) loops calling
 * `stream.write(data)` on every registered stream with NO try/catch of its own — a throw here
 * propagates onto the request's stack, which is exactly what §7.1 ("a collector outage must
 * never propagate to a request") and AC-8 forbid. So `JSON.parse` and the OTel `emit()` call
 * are both inside the one `try` below; nothing after that point is allowed to escape it.
 *
 * ── WHY THE TRACE CONTEXT IS READ, NOT PARSED ───────────────────────────────────────────────
 *
 * `logger.ts`'s own `mixin` already put `trace_id`/`span_id` INTO the line's JSON text, by
 * reading `trace.getSpan(context.active())` at the moment the line was built. This bridge does
 * NOT re-parse those two fields back out of the text — that is the "correlation id of its own"
 * design decision 2 rejects for a worker-thread transport. Instead `logs.getLogger(...).emit()`
 * is called with NO explicit `context`, so `@opentelemetry/sdk-logs`'s own `Logger#emit`
 * defaults to `context.active()` (`node_modules/@opentelemetry/sdk-logs/build/src/Logger.js`).
 * That is correct here specifically because `pino.multistream`'s `write()` loop above is
 * SYNCHRONOUS — no `await`, no `process.nextTick` — so this function still runs on the exact
 * call stack the log call itself was made on, inside whatever span `AsyncLocalStorageContext
 * Manager` made active for that stack.
 *
 * ── `logs.getLogger()` IS CALLED ONCE, EAGERLY, AT MODULE EVALUATION ────────────────────────
 *
 * Unlike `telemetry.ts`'s `lazyCounter`/`lazyMeter` — `logs.getLogger()` returns a
 * `ProxyLogger` that delegates PER `emit()` call, the same shape `@opentelemetry/api`'s
 * `ProxyTracer` has and NOT the shape `Meter` has (measured at slice 09, restated at slice 14
 * step 2). A logger obtained before `NodeSDK#start()` registers the real `LoggerProvider` still
 * exports correctly once it does. The lazy-meter hazard does not repeat here, and copying that
 * deferral in would be cargo — there is nothing it protects against.
 */
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import type { AnyValue, LogAttributes } from '@opentelemetry/api-logs';
import type { DestinationStream } from 'pino';
import { INSTRUMENTATION_NAME } from './telemetry.js';

/**
 * Fields `pino` itself puts on every line — never forwarded as an OTel attribute, because an
 * attribute here would be a field the correlated stdout line does NOT carry as data (AC-6's
 * second half). `level`/`time`/`msg` are pino's own defaults; `pid`/`hostname` are pino's
 * `base` default; `trace_id`/`span_id` are `logger.ts`'s own mixin, carried on the OTel record
 * through `severityNumber`/`spanContext` instead; `v`/`reqId` are pino/Fastify's own structural
 * fields, present on some lines even when this module never emits them itself.
 */
const PINO_STRUCTURAL_FIELDS: ReadonlySet<string> = new Set([
  'level',
  'time',
  'pid',
  'hostname',
  'msg',
  'trace_id',
  'span_id',
  'v',
  'reqId',
]);

/**
 * `pino`'s six standard numeric levels, mapped onto the OpenTelemetry Logs Data Model's
 * `SeverityNumber` short names (AC-5). Threshold-based rather than a lookup table, so a custom
 * pino level (this project defines none, but the mapping should not silently drop one) still
 * gets a defensible bucket instead of an `undefined` severity.
 */
function severityFor(level: number): { readonly number: SeverityNumber; readonly text: string } {
  if (level >= 60) return { number: SeverityNumber.FATAL, text: 'FATAL' };
  if (level >= 50) return { number: SeverityNumber.ERROR, text: 'ERROR' };
  if (level >= 40) return { number: SeverityNumber.WARN, text: 'WARN' };
  if (level >= 30) return { number: SeverityNumber.INFO, text: 'INFO' };
  if (level >= 20) return { number: SeverityNumber.DEBUG, text: 'DEBUG' };
  return { number: SeverityNumber.TRACE, text: 'TRACE' };
}

/**
 * A `pino` `DestinationStream` bridging every line to an OTel `LogRecord`. `main.ts` never
 * calls this directly — `logger.ts` is the one caller, composing it with stdout via
 * `pino.multistream`.
 */
export function createOtelLogStream(): DestinationStream {
  const otelLogger = logs.getLogger(INSTRUMENTATION_NAME);

  return {
    write(data: string): void {
      try {
        const parsed: unknown = JSON.parse(data);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return;
        const line = parsed as Record<string, unknown>;

        const level = line['level'];
        const severity = typeof level === 'number' ? severityFor(level) : undefined;

        const msg = line['msg'];
        const body = typeof msg === 'string' ? msg : undefined;

        const attributes: LogAttributes = {};
        for (const [key, value] of Object.entries(line)) {
          if (!PINO_STRUCTURAL_FIELDS.has(key)) attributes[key] = value as AnyValue;
        }

        // No `context` passed: `Logger#emit` defaults to `context.active()` — see the file
        // docblock's "WHY THE TRACE CONTEXT IS READ, NOT PARSED".
        otelLogger.emit({
          body,
          severityNumber: severity?.number,
          severityText: severity?.text,
          attributes,
        });
      } catch {
        // Never throw from a multistream write — see the file docblock's "WHY `write()` MUST
        // NEVER THROW". A line this bridge cannot parse or emit is simply not exported; it is
        // still on stdout, on its own stream, unaffected.
      }
    },
  };
}
