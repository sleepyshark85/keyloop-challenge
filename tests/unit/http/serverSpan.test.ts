import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { tracing } from '@opentelemetry/sdk-node';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildServer } from '../../../src/http/server.js';
import type { HealthOutcome } from '../../../src/application/checkHealth.js';
import { createLogger } from '../../../src/platform/logger.js';

/**
 * `httpServerFactory` — step 5 finding 6's fallback, the server span `@opentelemetry/
 * instrumentation-http` cannot provide under this project's ESM entry point (see `server.ts`'s
 * own docblock for the measurement). `app.inject()` cannot reach it: `light-my-request` never
 * calls the `serverFactory`-built server's own request LISTENER, only Fastify's internal
 * dispatch (measured — `factoryCalled` true, `handlerInvoked` false), which is why every other
 * file in this directory uses `.inject()` and this one instead binds a REAL ephemeral port and
 * issues a REAL request, same-process, no subprocess and no `dist/` build (T-01-2's `nodb`
 * project stays Docker-less).
 */

const silentLogger = createLogger({ logLevel: 'silent' });

function unusedRouteDeps(): {
  bookAppointment: () => never;
  readAppointment: () => never;
  cancelAppointment: () => never;
  rescheduleAppointment: () => never;
  queryAvailability: () => never;
} {
  const unreachable = (name: string) => (): never => {
    throw new Error(`serverSpan.test.ts must not call ${name}`);
  };
  return {
    bookAppointment: unreachable('bookAppointment'),
    readAppointment: unreachable('readAppointment'),
    cancelAppointment: unreachable('cancelAppointment'),
    rescheduleAppointment: unreachable('rescheduleAppointment'),
    queryAvailability: unreachable('queryAvailability'),
  };
}

async function listenEphemeral(
  checkHealth: () => Promise<HealthOutcome>,
): Promise<{ readonly port: number; readonly close: () => Promise<void> }> {
  const app = buildServer({ logger: silentLogger, checkHealth, ...unusedRouteDeps() });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address() as AddressInfo;
  return { port: address.port, close: async () => app.close() };
}

function get(port: number, path: string): Promise<{ readonly statusCode: number }> {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path }, (response) => {
      response.resume();
      response.on('end', () => resolve({ statusCode: response.statusCode ?? 0 }));
    });
    request.on('error', reject);
  });
}

describe('httpServerFactory — §8.4\'s server span, over a REAL socket', () => {
  const spanExporter = new tracing.InMemorySpanExporter();
  const tracerProvider = new tracing.BasicTracerProvider({
    spanProcessors: [new tracing.SimpleSpanProcessor(spanExporter)],
  });

  beforeAll(() => {
    trace.setGlobalTracerProvider(tracerProvider);
  });

  afterEach(() => {
    spanExporter.reset();
  });

  afterAll(() => {
    trace.disable();
  });

  it('GET /health opens a span named "GET /health", with http.method/http.target/http.status_code and no ERROR status', async () => {
    const server = await listenEphemeral(async () => ({ kind: 'ok' }));
    try {
      const response = await get(server.port, '/health');
      expect(response.statusCode).toBe(200);

      const spans = spanExporter.getFinishedSpans();
      const serverSpan = spans.find((s) => s.name === 'GET /health');
      expect(serverSpan, `no server span among ${JSON.stringify(spans.map((s) => s.name))}`).toBeDefined();
      expect(serverSpan?.attributes['http.method']).toBe('GET');
      expect(serverSpan?.attributes['http.target']).toBe('/health');
      expect(serverSpan?.attributes['http.status_code']).toBe(200);
      expect(serverSpan?.status.code).toBe(SpanStatusCode.UNSET);
    } finally {
      await server.close();
    }
  });

  it('a querystring is stripped from the span NAME (low cardinality) but kept on http.target', async () => {
    const server = await listenEphemeral(async () => ({ kind: 'ok' }));
    try {
      await get(server.port, '/health?probe=1');

      const spans = spanExporter.getFinishedSpans();
      const serverSpan = spans.find((s) => s.name === 'GET /health');
      expect(serverSpan, 'the span name must not carry the querystring').toBeDefined();
      expect(serverSpan?.attributes['http.target']).toBe('/health?probe=1');
    } finally {
      await server.close();
    }
  });

  it('a 503 (degraded database) marks the span ERROR — the same 5xx rule the SDK\'s own semantics use', async () => {
    const server = await listenEphemeral(async () => ({ kind: 'degraded', reason: 'database-unreachable' }));
    try {
      const response = await get(server.port, '/health');
      expect(response.statusCode).toBe(503);

      const serverSpan = spanExporter.getFinishedSpans().find((s) => s.name === 'GET /health');
      expect(serverSpan?.attributes['http.status_code']).toBe(503);
      expect(serverSpan?.status.code).toBe(SpanStatusCode.ERROR);
    } finally {
      await server.close();
    }
  });

  it('exactly 500 marks the span ERROR too — the boundary `>= 500`, not `> 500`', async () => {
    const server = await listenEphemeral(async () => {
      throw new Error('boom');
    });
    try {
      const response = await get(server.port, '/health');
      expect(response.statusCode).toBe(500);

      const serverSpan = spanExporter.getFinishedSpans().find((s) => s.name === 'GET /health');
      expect(serverSpan?.attributes['http.status_code']).toBe(500);
      expect(serverSpan?.status.code).toBe(SpanStatusCode.ERROR);
    } finally {
      await server.close();
    }
  });

  it('a genuinely unmatched route still opens and ends its span (404, not a fault)', async () => {
    const server = await listenEphemeral(async () => ({ kind: 'ok' }));
    try {
      const response = await get(server.port, '/no-such-route');
      expect(response.statusCode).toBe(404);

      const serverSpan = spanExporter.getFinishedSpans().find((s) => s.name === 'GET /no-such-route');
      expect(serverSpan?.attributes['http.status_code']).toBe(404);
      expect(serverSpan?.status.code, 'a 404 is not a fault').toBe(SpanStatusCode.UNSET);
    } finally {
      await server.close();
    }
  });
});
