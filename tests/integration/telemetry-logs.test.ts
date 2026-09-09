import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import { startOtelCollector } from '../support/otelCollector.js';
import type { CollectedLogRecord, CollectedSpan, OtelCollector } from '../support/otelCollector.js';
import { vinFor } from '../support/ids.js';
import { bookingBody, describeAnswer, describeScenario, postBooking, seedScenario } from '../support/booking.js';
import type { HttpAnswer, Scenario } from '../support/booking.js';

/**
 * Slice 14 — AC-1 through AC-8, over the running service's emitted telemetry.
 *
 * `docs/slices/14-otlp-logs-and-service-identity.md` · `docs/slices/14-design.md` · arc42
 * §7.1, §7.3, §8.4 · `CLAUDE.md` §2.2, §5.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * A NEW FILE, NOT SLICE 09's — the design's own step-2 ruling (§4 ownership table): slice
 * 09's `telemetry-booking.test.ts` is 700 lines and already closed over its own five ACs;
 * growing it further would mix two slices' red evidence in one file. Nothing here imports
 * from that file — this file is self-contained and repeats the small amount of arrangement
 * machinery it needs (`runWithTelemetry`, a plain and a broken-zone fixture), on the same
 * conventions.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT "AT LEAST ONE RECORD CORRESPONDS TO A LINE" (AC-3) MEANS HERE, AND HOW IT DIFFERS
 * FROM AC-4.
 *
 * AC-3 is the weaker, existence-shaped claim and AC-4 is the load-bearing one; they must
 * stay operationally distinct or AC-3 adds nothing AC-4 doesn't already cover. AC-3 is
 * read here as CONTENT correspondence: some exported record's `body` matches the `msg` of a
 * `pino` line this request's own window produced (both sides observable independently — the
 * window from `StartedService#logRecords()`, the export from the collector). AC-4 is read as
 * IDENTITY correspondence: some record's own `traceId`/`spanId` pair equals some span's.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * AC-5's SEVERITY MAPPING, GROUNDED OUTSIDE THIS DESIGN — the design names as a risk that a
 * mapping "transcribed" from the bridge would be a duplicate, not a test.
 * `PINO_TO_OTEL_SEVERITY` below is built from two PUBLIC, EXTERNAL specifications instead:
 * pino's own six standard levels (10/20/30/40/50/60 — https://getpino.io "Level"), mapped
 * onto the OpenTelemetry Logs Data Model's `SeverityNumber` short-name values (TRACE=1,
 * DEBUG=5, INFO=9, WARN=13, ERROR=17, FATAL=21 — the OTel specification's own table).
 * Neither side of this table was read off `14-design.md`'s prose or off any `src/` file.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * AC-6's NEGATIVE IS NOT VACUOUS, on slice 09's own idiom (`telemetry-booking.test.ts`'s own
 * AC-6 block): the customer name / VIN / vehicle description asserted absent are UNIQUE to
 * this file's own seeded namespace (`seedScenario`'s own naming convention), so an accidental
 * leak has a concrete string to be caught by, and existence is guarded before absence is
 * asserted (a request that produced no records makes "no leak" vacuously true).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * AC-8's DEAD PORT: `http://127.0.0.1:1` — the SAME idiom `tests/support/service.ts`'s own
 * `UNREACHABLE_DATABASE_URL` already uses (port 1 is reserved; loopback with no listener
 * refuses the connection immediately via the kernel, never routed and so never blackholed).
 *
 * No import from `src/` — `outside-in-tests-do-not-import-src` covers `tests/integration/`
 * only for its DATABASE-INVARIANT tests, and this file asserts a PROCESS invariant instead,
 * exactly as `telemetry-booking.test.ts`'s own header explains for the same reason.
 */

const TRACE_ID_HEX32 = /^[0-9a-f]{32}$/;
const SPAN_ID_HEX16 = /^[0-9a-f]{16}$/;

/** See the header note above. */
const PINO_TO_OTEL_SEVERITY: Readonly<Record<number, { readonly number: number; readonly text: string }>> = {
  10: { number: 1, text: 'TRACE' },
  20: { number: 5, text: 'DEBUG' },
  30: { number: 9, text: 'INFO' },
  40: { number: 13, text: 'WARN' },
  50: { number: 17, text: 'ERROR' },
  60: { number: 21, text: 'FATAL' },
};

/** Fields that are structural on a pino line and never belong in an OTLP LogRecord's own `attributes`. */
const PINO_STRUCTURAL_FIELDS = new Set(['level', 'time', 'pid', 'hostname', 'msg', 'trace_id', 'span_id', 'v', 'reqId']);

interface LogsRun {
  readonly answer: HttpAnswer;
  readonly service: StartedService;
  readonly collector: OtelCollector;
  /** Every `pino` line the child wrote from `action`'s start to just after it resolved. */
  readonly requestLogRecords: readonly Record<string, unknown>[];
}

/** Beat pino's stream needs to flush after the HTTP response — see `telemetry-booking.test.ts`. */
const LOG_FLUSH_GRACE_MS = 300;
/** Bound for polling the collector for records this slice may not yet produce (still red). */
const AWAIT_LOGS_MS = 5_000;

async function runWithTelemetry(
  options: { readonly bookingSeed?: number; readonly otelServiceName?: string; readonly otelExporterEndpoint?: string },
  action: (service: StartedService) => Promise<HttpAnswer>,
): Promise<{ readonly failure?: string; readonly run?: LogsRun }> {
  const collector = await startOtelCollector();
  const attempt = await startService({
    databaseUrl: inject('databaseUrl'),
    logLevel: 'trace',
    otelExporterEndpoint: options.otelExporterEndpoint ?? collector.endpoint,
    ...(options.bookingSeed === undefined ? {} : { bookingSeed: options.bookingSeed }),
    ...(options.otelServiceName === undefined ? {} : { otelServiceName: options.otelServiceName }),
  });
  if (attempt.service === undefined) {
    await collector.stop();
    return { failure: attempt.failure ?? 'the service did not start' };
  }
  const service = attempt.service;
  const logsBeforeRequest = service.logRecords().length;
  const answer = await action(service);
  await new Promise((resolve) => setTimeout(resolve, LOG_FLUSH_GRACE_MS));
  const requestLogRecords = service.logRecords().slice(logsBeforeRequest);
  // Flush: SIGTERM, and `main.ts` is described as "starts and shuts the SDK down".
  await service.stop();
  return { run: { answer, service, collector, requestLogRecords } };
}

/** Every well-formed, trace-correlated `(traceId, spanId)` pair a stdout window's own lines carry. */
function stdoutTraceSpanPairs(records: readonly Record<string, unknown>[]): ReadonlySet<string> {
  const pairs = new Set<string>();
  for (const r of records) {
    const traceId = r['trace_id'];
    const spanId = r['span_id'];
    if (typeof traceId === 'string' && TRACE_ID_HEX32.test(traceId) && typeof spanId === 'string' && SPAN_ID_HEX16.test(spanId)) {
      pairs.add(`${traceId}:${spanId}`);
    }
  }
  return pairs;
}

/** Every stdout line sharing a record's exact `(traceId, spanId)` pair — see AC-6's attribute check. */
function stdoutLinesFor(record: CollectedLogRecord, requestLogRecords: readonly Record<string, unknown>[]): readonly Record<string, unknown>[] {
  return requestLogRecords.filter((r) => r['trace_id'] === record.traceId && r['span_id'] === record.spanId);
}

describe('slice 14 / AC-1 — no OTEL_SERVICE_NAME: every exported resource names the artifact, not unknown_service:node', () => {
  let client: Client;
  let scenario: Scenario;
  let run: LogsRun | undefined;
  let startFailure: string | undefined;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
    scenario = await seedScenario(client, 'l14-ac1-default-service-name', { bays: 1, technicians: 1 });

    const { failure, run: started } = await runWithTelemetry({}, async (service) =>
      postBooking(service, bookingBody(scenario)),
    );
    startFailure = failure;
    run = started;

    if (run !== undefined) {
      await run.collector.awaitSpans((spans) => spans.some((s) => s.name === 'appointment.insert'));
      await run.collector.awaitMetricPoints((points) => points.some((p) => p.metric === 'appointments_booked_total'));
    }
  });

  afterAll(async () => {
    await run?.collector.stop();
    await client?.end();
  });

  function where(): string {
    const fixture = describeScenario(scenario);
    const answer = run === undefined ? '(service did not start)' : describeAnswer(run.answer);
    const telemetry = run === undefined ? '(no collector)' : run.collector.describe();
    return `\n${fixture}\n  HTTP answer: ${answer}\n${telemetry}`;
  }

  it('the service started and an uncontended booking succeeded (201) — the shared arrangement for this block', () => {
    expect(startFailure ?? 'started', `ARRANGE failed.${where()}`).toBe('started');
    expect(run?.answer.status, `ARRANGE — expected an uncontended booking to succeed.${where()}`).toBe(201);
  });

  it("AC-1 — the trace export's resource carries service.name=keyloop-service-scheduler, never unknown_service:node", () => {
    if (run === undefined) return;
    const spans = run.collector.spans();
    expect(spans.length, `expected at least one exported span.${where()}`).toBeGreaterThan(0);
    const names = [...new Set(spans.map((s) => s.resourceAttributes['service.name']))];
    expect(names, `every span's resource must carry the one service name.${where()}`).toEqual([
      'keyloop-service-scheduler',
    ]);
  });

  it("AC-1 — the metric export's resource carries service.name=keyloop-service-scheduler, never unknown_service:node", () => {
    if (run === undefined) return;
    const points = run.collector.metricPoints();
    expect(points.length, `expected at least one exported metric point.${where()}`).toBeGreaterThan(0);
    const names = [...new Set(points.map((p) => p.resourceAttributes['service.name']))];
    expect(names, `every metric point's resource must carry the one service name.${where()}`).toEqual([
      'keyloop-service-scheduler',
    ]);
  });

  it("AC-1 — the log export's resource carries service.name=keyloop-service-scheduler, never unknown_service:node", async () => {
    if (run === undefined) return;
    const records = await run.collector.awaitLogRecords((r) => r.length > 0, AWAIT_LOGS_MS);
    expect(
      records.length,
      `expected at least one exported log record — the pipeline this slice builds.${where()}`,
    ).toBeGreaterThan(0);
    const names = [...new Set(records.map((r) => r.resourceAttributes['service.name']))];
    expect(names, `every log record's resource must carry the one service name.${where()}`).toEqual([
      'keyloop-service-scheduler',
    ]);
  });
});

describe('slice 14 / AC-2 — OTEL_SERVICE_NAME=probe-override: every exported resource carries the override', () => {
  let client: Client;
  let scenario: Scenario;
  let run: LogsRun | undefined;
  let startFailure: string | undefined;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
    scenario = await seedScenario(client, 'l14-ac2-override-service-name', { bays: 1, technicians: 1 });

    const { failure, run: started } = await runWithTelemetry({ otelServiceName: 'probe-override' }, async (service) =>
      postBooking(service, bookingBody(scenario)),
    );
    startFailure = failure;
    run = started;

    if (run !== undefined) {
      await run.collector.awaitSpans((spans) => spans.some((s) => s.name === 'appointment.insert'));
      await run.collector.awaitMetricPoints((points) => points.some((p) => p.metric === 'appointments_booked_total'));
    }
  });

  afterAll(async () => {
    await run?.collector.stop();
    await client?.end();
  });

  function where(): string {
    const fixture = describeScenario(scenario);
    const answer = run === undefined ? '(service did not start)' : describeAnswer(run.answer);
    const telemetry = run === undefined ? '(no collector)' : run.collector.describe();
    return `\n${fixture}\n  HTTP answer: ${answer}\n${telemetry}`;
  }

  it('the service started and an uncontended booking succeeded (201) — the shared arrangement for this block', () => {
    expect(startFailure ?? 'started', `ARRANGE failed.${where()}`).toBe('started');
    expect(run?.answer.status, `ARRANGE — expected an uncontended booking to succeed.${where()}`).toBe(201);
  });

  it('AC-2 — the trace export\'s resource carries the override, proving OTEL_SERVICE_NAME is not inert (option B)', () => {
    if (run === undefined) return;
    const spans = run.collector.spans();
    expect(spans.length, `expected at least one exported span.${where()}`).toBeGreaterThan(0);
    const names = [...new Set(spans.map((s) => s.resourceAttributes['service.name']))];
    expect(names, `every span's resource must carry the override.${where()}`).toEqual(['probe-override']);
  });

  it('AC-2 — the metric export\'s resource carries the override', () => {
    if (run === undefined) return;
    const points = run.collector.metricPoints();
    expect(points.length, `expected at least one exported metric point.${where()}`).toBeGreaterThan(0);
    const names = [...new Set(points.map((p) => p.resourceAttributes['service.name']))];
    expect(names, `every metric point's resource must carry the override.${where()}`).toEqual(['probe-override']);
  });

  it('AC-2 — the log export\'s resource carries the override', async () => {
    if (run === undefined) return;
    const records = await run.collector.awaitLogRecords((r) => r.length > 0, AWAIT_LOGS_MS);
    expect(records.length, `expected at least one exported log record.${where()}`).toBeGreaterThan(0);
    const names = [...new Set(records.map((r) => r.resourceAttributes['service.name']))];
    expect(names, `every log record's resource must carry the override.${where()}`).toEqual(['probe-override']);
  });
});

describe('slice 14 / AC-3, AC-4, AC-6 — one booking, read off its exported log records', () => {
  const NAMESPACE = 'l14-ac346-correlation-and-pii';
  const CUSTOMER_NAME = `${NAMESPACE} customer 000`;
  const VEHICLE_DESCRIPTION = 'vehicle 000';
  const VEHICLE_VIN = vinFor(NAMESPACE, 'vehicle/000');

  let client: Client;
  let scenario: Scenario;
  let run: LogsRun | undefined;
  let startFailure: string | undefined;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
    scenario = await seedScenario(client, NAMESPACE, { bays: 1, technicians: 1 });

    const { failure, run: started } = await runWithTelemetry({}, async (service) =>
      postBooking(service, bookingBody(scenario)),
    );
    startFailure = failure;
    run = started;

    if (run !== undefined) {
      await run.collector.awaitSpans((spans) => spans.some((s) => s.name === 'appointment.insert'));
    }
  });

  afterAll(async () => {
    await run?.collector.stop();
    await client?.end();
  });

  function where(): string {
    const fixture = describeScenario(scenario);
    const answer = run === undefined ? '(service did not start)' : describeAnswer(run.answer);
    const telemetry = run === undefined ? '(no collector)' : run.collector.describe();
    return `\n${fixture}\n  HTTP answer: ${answer}\n${telemetry}`;
  }

  it('the service started and the booking succeeded (201) — the shared arrangement for this block', () => {
    expect(startFailure ?? 'started', `ARRANGE failed.${where()}`).toBe('started');
    expect(run?.answer.status, `ARRANGE — expected an uncontended booking to succeed.${where()}`).toBe(201);
  });

  it('AC-3 — at least one exported log record corresponds to a line this request produced', async () => {
    if (run === undefined) return;
    const records = await run.collector.awaitLogRecords((r) => r.length > 0, AWAIT_LOGS_MS);
    const requestMessages = new Set(
      run.requestLogRecords.map((r) => r['msg']).filter((msg): msg is string => typeof msg === 'string'),
    );
    const corresponding = records.filter((r) => r.body !== undefined && requestMessages.has(r.body));
    expect(
      corresponding.length,
      `expected at least one exported record whose body matches a line this request wrote to stdout.\n` +
        `  stdout messages: ${JSON.stringify([...requestMessages])}\n` +
        `  exported bodies: ${JSON.stringify(records.map((r) => r.body))}${where()}`,
    ).toBeGreaterThan(0);
  });

  it("AC-4 — the load-bearing criterion: some exported record's OWN traceId/spanId equal a span's, non-empty", async () => {
    if (run === undefined) return;
    const records = await run.collector.awaitLogRecords((r) => r.length > 0, AWAIT_LOGS_MS);
    const spanPairs = new Set(run.collector.spans().map((s: CollectedSpan) => `${s.traceId}:${s.spanId}`));
    const correlated = records.filter(
      (r) =>
        r.traceId !== '' &&
        r.spanId !== '' &&
        TRACE_ID_HEX32.test(r.traceId) &&
        SPAN_ID_HEX16.test(r.spanId) &&
        spanPairs.has(`${r.traceId}:${r.spanId}`),
    );
    expect(
      correlated.length,
      `expected at least one exported record whose OWN traceId/spanId equal a real span's from this request — ` +
        `not merely well-formed.\n  span pairs: ${JSON.stringify([...spanPairs])}\n` +
        `  record pairs: ${JSON.stringify(records.map((r) => `${r.traceId}:${r.spanId}`))}${where()}`,
    ).toBeGreaterThan(0);
  });

  it('AC-6 — the request succeeded, so its exported logs exist to be examined', async () => {
    if (run === undefined) return;
    const records = await run.collector.awaitLogRecords((r) => r.length > 0, AWAIT_LOGS_MS);
    expect(records.length, `expected exported log records to examine for AC-6.${where()}`).toBeGreaterThan(0);
  });

  it('AC-6 — no exported record names the customer, the VIN, or the vehicle description', () => {
    if (run === undefined) return;
    const records = run.collector.logRecords();
    // Guarded first, same as the sibling "exist to be examined" case above but IN THIS `it`
    // too — each assertion here must stand on its own rather than borrow a sibling's guard,
    // because "no record leaks the VIN" is vacuously true of an empty array and this is
    // exactly the trap AC-6 exists to avoid (step 2 review).
    expect(records.length, `no exported records exist to examine — this assertion would be vacuous.${where()}`).toBeGreaterThan(0);
    const leaking = records.filter((r) => {
      const rendered = `${String(r.body)} ${JSON.stringify(r.attributes)}`;
      return rendered.includes(CUSTOMER_NAME) || rendered.includes(VEHICLE_VIN) || rendered.includes(VEHICLE_DESCRIPTION);
    });
    expect(
      leaking.map((r) => ({ body: r.body, attributes: r.attributes })),
      `these exported records leaked identifying data (§8.4's "identifiers only").${where()}`,
    ).toEqual([]);
  });

  it("AC-6 — no exported record's attributes add a field the correlated stdout line does not carry", () => {
    if (run === undefined) return;
    const records = run.collector.logRecords();
    // Same guard, same reason: vacuous over an empty array.
    expect(records.length, `no exported records exist to examine — this assertion would be vacuous.${where()}`).toBeGreaterThan(0);
    const offending: { readonly record: CollectedLogRecord; readonly extraKeys: readonly string[] }[] = [];
    for (const record of records) {
      const correlatedLines = stdoutLinesFor(record, run.requestLogRecords);
      const allowedKeys = new Set<string>();
      for (const line of correlatedLines) {
        for (const key of Object.keys(line)) if (!PINO_STRUCTURAL_FIELDS.has(key)) allowedKeys.add(key);
      }
      const extraKeys = Object.keys(record.attributes).filter((key) => !allowedKeys.has(key));
      if (extraKeys.length > 0) offending.push({ record, extraKeys });
    }
    expect(
      offending.map((o) => ({ traceId: o.record.traceId, spanId: o.record.spanId, extraKeys: o.extraKeys })),
      `an exported record carried an attribute key the correlated stdout line(s) did not.${where()}`,
    ).toEqual([]);
  });
});

describe('slice 14 / AC-5 — a request producing an error line: the exported severity matches pino\'s level', () => {
  let client: Client;
  let scenario: Scenario;
  let run: LogsRun | undefined;
  let startFailure: string | undefined;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
    // Measured route to a genuine `error`-level line (`docs/slices/14-design.md` review,
    // reused from `telemetry-booking.test.ts`'s AC-6 500 fixture): a dealership whose IANA
    // zone Node cannot resolve is a SYSTEM fault, and the reference-data check logs it at
    // pino level 50 before the route answers 500 /problems/internal.
    scenario = await seedScenario(client, 'l14-ac5-severity-mapping', {
      bays: 1,
      technicians: 1,
      timeZone: 'Not/AZone',
    });

    const { failure, run: started } = await runWithTelemetry({}, async (service) =>
      postBooking(service, bookingBody(scenario)),
    );
    startFailure = failure;
    run = started;
  });

  afterAll(async () => {
    await run?.collector.stop();
    await client?.end();
  });

  function where(): string {
    const fixture = describeScenario(scenario);
    const answer = run === undefined ? '(service did not start)' : describeAnswer(run.answer);
    const telemetry = run === undefined ? '(no collector)' : run.collector.describe();
    return `\n${fixture}\n  HTTP answer: ${answer}\n${telemetry}`;
  }

  it('the arrangement: a broken time zone answers 500 /problems/internal', () => {
    expect(startFailure ?? 'started', `ARRANGE failed.${where()}`).toBe('started');
    expect(run?.answer.status, `ARRANGE — expected the broken-zone fixture to fault.${where()}`).toBe(500);
  });

  it('AC-5 — the arrangement produced a warn-or-error stdout line (level >= 40), not merely info', () => {
    if (run === undefined) return;
    const atOrAboveWarn = run.requestLogRecords.filter((r) => typeof r['level'] === 'number' && r['level'] >= 40);
    expect(
      atOrAboveWarn.length,
      `ARRANGE — expected at least one warn-or-error stdout line in this request's window.\n` +
        `${JSON.stringify(run.requestLogRecords, null, 2)}${where()}`,
    ).toBeGreaterThan(0);
  });

  it("AC-5 — the correlated exported record's severityNumber/severityText match pino's level, not a hardcoded default", async () => {
    if (run === undefined) return;
    const atOrAboveWarn = run.requestLogRecords.filter((r) => typeof r['level'] === 'number' && r['level'] >= 40);
    const records = await run.collector.awaitLogRecords((r) => r.length > 0, AWAIT_LOGS_MS);

    const matches: { readonly line: Record<string, unknown>; readonly record: CollectedLogRecord }[] = [];
    for (const line of atOrAboveWarn) {
      const record = records.find((r) => r.traceId === line['trace_id'] && r.spanId === line['span_id']);
      if (record !== undefined) matches.push({ line, record });
    }
    expect(
      matches.length,
      `expected at least one warn-or-error stdout line to have a correlated exported record.\n` +
        `  stdout warn/error lines: ${JSON.stringify(atOrAboveWarn, null, 2)}\n` +
        `  exported records: ${JSON.stringify(records, null, 2)}${where()}`,
    ).toBeGreaterThan(0);

    for (const { line, record } of matches) {
      const level = line['level'] as number;
      const expected = PINO_TO_OTEL_SEVERITY[level];
      expect(expected, `pino level ${String(level)} has no entry in the public OTel severity table`).toBeDefined();
      expect(
        record.severityNumber,
        `severityNumber for pino level ${String(level)} (${expected?.text}) must be ${String(expected?.number)}, ` +
          `never a hardcoded default.\n  record: ${JSON.stringify(record)}${where()}`,
      ).toBe(expected?.number);
      expect(
        record.severityText,
        `severityText for pino level ${String(level)} must be "${String(expected?.text)}", never a hardcoded default.\n` +
          `  record: ${JSON.stringify(record)}${where()}`,
      ).toBe(expected?.text);
    }
  });
});

describe('slice 14 / AC-7 — guard: stdout still carries the request\'s trace-correlated pino line', () => {
  let client: Client;
  let scenario: Scenario;
  let run: LogsRun | undefined;
  let startFailure: string | undefined;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
    scenario = await seedScenario(client, 'l14-ac7-stdout-guard', { bays: 1, technicians: 1 });

    const { failure, run: started } = await runWithTelemetry({}, async (service) =>
      postBooking(service, bookingBody(scenario)),
    );
    startFailure = failure;
    run = started;
  });

  afterAll(async () => {
    await run?.collector.stop();
    await client?.end();
  });

  function where(): string {
    const fixture = describeScenario(scenario);
    const answer = run === undefined ? '(service did not start)' : describeAnswer(run.answer);
    return `\n${fixture}\n  HTTP answer: ${answer}`;
  }

  it('AC-7 (guard) — the booking succeeded and stdout carries a well-formed, correlated trace_id/span_id line', () => {
    expect(startFailure ?? 'started', `ARRANGE failed.${where()}`).toBe('started');
    expect(run?.answer.status, `ARRANGE — expected an uncontended booking to succeed.${where()}`).toBe(201);
    if (run === undefined) return;

    const pairs = stdoutTraceSpanPairs(run.requestLogRecords);
    expect(
      pairs.size,
      `expected stdout to carry at least one well-formed, correlated trace_id/span_id pair — ` +
        `exactly what slice 09's own AC-6 already asserts.\n${JSON.stringify(run.requestLogRecords, null, 2)}${where()}`,
    ).toBeGreaterThan(0);
  });
});

describe('slice 14 / AC-8 — guard: a booking still answers 201 with a dead OTLP endpoint', () => {
  let client: Client;
  let scenario: Scenario;
  let service: StartedService | undefined;
  let startFailure: string | undefined;
  let answer: HttpAnswer | undefined;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
    scenario = await seedScenario(client, 'l14-ac8-dead-endpoint-guard', { bays: 1, technicians: 1 });

    // The `UNREACHABLE_DATABASE_URL` idiom (`tests/support/service.ts`), applied to the OTLP
    // endpoint instead of the database: port 1 is reserved, so loopback refuses the
    // connection immediately via the kernel — never routed, so never blackholed (§6 review).
    const attempt = await startService({
      databaseUrl: inject('databaseUrl'),
      logLevel: 'trace',
      otelExporterEndpoint: 'http://127.0.0.1:1',
    });
    startFailure = attempt.failure;
    service = attempt.service;
    if (service !== undefined) {
      answer = await postBooking(service, bookingBody(scenario));
      await new Promise((resolve) => setTimeout(resolve, LOG_FLUSH_GRACE_MS));
    }
  });

  afterAll(async () => {
    await service?.stop();
    await client?.end();
  });

  function where(): string {
    const fixture = describeScenario(scenario);
    const rendered = answer === undefined ? '(no answer)' : describeAnswer(answer);
    const stdout = service === undefined ? '(service did not start)' : JSON.stringify(service.output().stdout);
    return `\n${fixture}\n  HTTP answer: ${rendered}\n  stdout: ${stdout}`;
  }

  it('AC-8 (guard) — the service started despite the dead OTLP endpoint', () => {
    expect(startFailure ?? 'started', `ARRANGE failed.${where()}`).toBe('started');
  });

  it('AC-8 (guard) — the booking still answers 201', () => {
    if (service === undefined) return;
    expect(answer?.status, `expected a booking to succeed even with the collector unreachable (arc42 §7.1).${where()}`).toBe(
      201,
    );
  });

  it('AC-8 (guard) — the stdout line is still written', () => {
    if (service === undefined) return;
    const pairs = stdoutTraceSpanPairs(service.logRecords());
    expect(
      pairs.size,
      `expected stdout to still carry a well-formed, correlated trace_id/span_id line even with the ` +
        `collector unreachable.${where()}`,
    ).toBeGreaterThan(0);
  });
});
