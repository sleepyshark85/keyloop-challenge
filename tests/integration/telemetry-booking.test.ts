import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import { startOtelCollector } from '../support/otelCollector.js';
import type { CollectedSpan, OtelCollector } from '../support/otelCollector.js';
import { vinFor } from '../support/ids.js';
import {
  at,
  blockPairs,
  bookingBody,
  describeAnswer,
  describeScenario,
  member,
  occupy,
  postBooking,
  postCancellation,
  postReschedule,
  seedScenario,
  uuidNamespaceOf,
} from '../support/booking.js';
import type { HttpAnswer, Scenario } from '../support/booking.js';

/**
 * Slice 09 — QS-13, AC-1 through AC-6, over the running service's emitted telemetry.
 *
 * `docs/slices/09-observability.md` · `docs/slices/09-design.md` §8.4, decisions 1-3 ·
 * arc42 §8.4, §8.5.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE IS `tests/integration/` AND NOT `tests/acceptance/`.
 *
 * The design's own step-2 ruling places it here (the five files decision 1-2 commit), and
 * `CLAUDE.md` §5 makes `tests/integration/` shared with DB-invariant assertions the
 * test-engineer's. This file asserts a PROCESS invariant rather than a database one — the
 * span ordering and the counter's single increment site are properties of the running
 * artifact, not of a row — but it sits beside the other process-level integration tests
 * (`reschedule-is-one-statement.test.ts`) for the same reason: it needs the real compiled
 * service and real PostgreSQL together, never a stub of either (`CLAUDE.md` §2.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * "AN IN-MEMORY OTEL EXPORTER" (AC-1's Given), AND WHAT THAT CAN MEAN FROM OUTSIDE THE PROCESS.
 *
 * The service under test is a SEPARATE, spawned process (`tests/support/service.ts`'s
 * standing convention — never import `src/` to run the server in-process, C1/black-box).
 * Spans and metric points created inside that process cannot be read by literally sharing
 * memory with this test. What CAN be in-memory is the RECEIVER: `otelCollector.ts` is a
 * throwaway OTLP/HTTP endpoint this test owns, standing in for the `grafana/otel-lgtm` stack
 * `docker-compose.yml` names for the demo — it holds what it received in a plain array,
 * never on disk, and it is thrown away with the process at the end of each `it`.
 *
 * The wire contract this rests on — bare `OTEL_EXPORTER_OTLP_ENDPOINT`, JSON body, the
 * `/v1/traces` and `/v1/metrics` suffixes appended by the exporter — is measured against
 * `@opentelemetry/exporter-trace-otlp-http` / `-metrics-otlp-http` `0.222.0` and documented
 * in `otelCollector.ts`'s own header, per that file's own "verify before relying on it"
 * standard (`tests/setup/postgres.ts`'s precedent). **If the implementation exports over
 * gRPC, over `http/protobuf`, or reads a different endpoint variable, every case below fails
 * with zero requests received** (`collector.describe()` renders that plainly) rather than
 * with a crash — a real, diagnosable red for a seam whose other side does not exist yet.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * QS-13 IS THREE FIXTURES, NOT ONE — `I-19-2` RULED (a), AC-8 (`docs/slices/19-design.md`
 * ruling 15). CITE [arc42 §10 QS-13](../../docs/arc42/10-quality-requirements.md), REWRITTEN;
 * THE SLICE-09 AC-1/AC-2/AC-3 LABELS BELOW NAME PROVENANCE ONLY.
 *
 * Slice 19's free-first ordering (ADR-0040) shares `busyResources`' range predicate,
 * dealership scope and `status <> 'cancelled'` filter with the exclusion constraint itself,
 * and `A-4` makes the two intervals identical — so whenever a free bay and a free technician
 * both exist, free-first heads both candidate lists with them and attempt 1 succeeds. **No
 * single-threaded interleaving on the BOOKING path yields a conflict while capacity
 * remains** — the mechanism working, not a defect; a snapshot disagreeing with its own
 * adjudicator would be the defect. `seedRetryOnceFixture` below, which used to retry once
 * then succeed under ADR-0009's blind shuffle, now confirms on attempt 1, and its own
 * docblock predicted exactly this: "it would stop transferring only if candidate ordering
 * itself changed, which is exactly the kind of regression a fixed seed is supposed to catch."
 *
 * What was one shared fixture for slice 09's AC-1/AC-2/AC-3 is now re-sourced onto three:
 *
 *   (i)   THE WINDOW    — stays on `seedRetryOnceFixture`, which now confirms on attempt 1;
 *                          `BOOKING_SEED` is no longer pinned because free-first makes the
 *                          outcome independent of it — one busy bay, one free bay, and the
 *                          free one always heads the list regardless of the shuffle within it.
 *   (ii)  THE WATERFALL — moves to the fully-blocked fixture this file's QS-13(ii) describe
 *                          block already seeded for slice 09's AC-4 (2 bays, 2 technicians,
 *                          both pairs blocked): every draw meets a busy bay, so it is
 *                          permutation-safe and needs no seed either.
 *   (iii) THE ABSORBED   — moves to a RESCHEDULE: arc42 §6.3 tries the incumbent pair (the
 *         CONFLICT         row's own bay/technician) FIRST, before ADR-0040's shuffle opens,
 *                          and ruling 5 leaves that shuffle `EMPTY_OCCUPANCY` (still ADR-0009's
 *                          blind shuffle), so an incumbent-pair conflict is the one conflict
 *                          still constructible single-threaded, per `attemptLoop.ts`'s shared
 *                          increment site (`F-06-1`).
 */

const TRACE_ID_HEX32 = /^[0-9a-f]{32}$/;
const SPAN_ID_HEX16 = /^[0-9a-f]{16}$/;

/**
 * R-09-6 (`docs/slices/09-design.md` step-5 finding 6) — AC-6 says "given any request", and
 * the reviewer's falsification was concrete: `booking.conflict`, `booking.refused`, and
 * Fastify's own request/response lines all carried no `trace_id` while exactly one
 * application line did. "At least one correlated line" certifies one line out of a request;
 * this is the assertion that reads every line instead.
 *
 * A record counts as CORRELATED, not merely present, when its `trace_id`/`span_id` are
 * well-formed AND name a trace this run's collector actually received — a fabricated or
 * stale id must not pass. Returns the offending records themselves (not a count), so a
 * failing message shows exactly which lines still lack it.
 */
function uncorrelatedRequestLogLines(
  records: readonly Record<string, unknown>[],
  spanTraceIds: ReadonlySet<string>,
): readonly Record<string, unknown>[] {
  return records.filter((r) => {
    const traceId = r['trace_id'];
    const spanId = r['span_id'];
    return !(
      typeof traceId === 'string' &&
      TRACE_ID_HEX32.test(traceId) &&
      typeof spanId === 'string' &&
      SPAN_ID_HEX16.test(spanId) &&
      spanTraceIds.has(traceId)
    );
  });
}

/**
 * `CollectedSpan` carries `startTimeUnixNano`/`endTimeUnixNano` as `BigInt`, which
 * `JSON.stringify` refuses outright — a failure MESSAGE must not itself throw and hide the
 * assertion that produced it.
 */
function describeSpanForFailure(span: CollectedSpan | undefined): string {
  if (span === undefined) return '(no span)';
  return JSON.stringify({
    name: span.name,
    traceId: span.traceId,
    attributes: span.attributes,
    statusCode: span.statusCode,
  });
}

async function seedRetryOnceFixture(client: Client, namespace: string): Promise<Scenario> {
  const scenario = await seedScenario(client, namespace, { bays: 2, technicians: 2 });

  // I-09-2: technicians are read `ORDER BY id`, so which one the blocker (technicianIds[1])
  // sorts to is a per-namespace coin-flip — `SHARED_SEED = 7` was measured against a shuffle
  // whose technician list did NOT contain the blocker as a live candidate. The architect's
  // remedy is to remove the blocker's qualification for the scenario's own service type so it
  // is never drawn at all, leaving the technician list going into the shuffle as the single
  // remaining qualified technician (I-04-10's permutation-safe singleton), so only the bay
  // draw decides.
  //
  // ADAPTED (still the same remedy, worked around a schema constraint the design didn't
  // name): `appointment_technician_qualified` is a FOREIGN KEY from
  // `appointment (technician_id, service_type_id)` to `technician_qualification` (arc42 §8),
  // with no `ON DELETE CASCADE`. Seeding the blocker's own appointment against
  // `scenario.serviceTypeId` FIRST and then deleting that same pair's qualification trips
  // exactly that FK (measured: `update or delete on table "technician_qualification"
  // violates foreign key constraint "appointment_technician_qualified"`) — the row can't be
  // removed while the blocker's own appointment still references it. So the qualification is
  // deleted BEFORE any appointment exists to reference it, and the blocker technician is
  // re-qualified under a throwaway service type instead, and its occupying appointment is
  // booked against THAT service type. `no_bay_overlap` and the technician equivalent are
  // keyed on `bay_id`/`technician_id` and the time range only — never on `service_type_id` —
  // so this occupies bay 0 and busies `technicianIds[1]` for exactly the same window as
  // before; only the qualification bookkeeping moved. Net effect unchanged from the ruling:
  // `technicianIds[0]` is the only technician qualified for the scenario's own service type,
  // stays free throughout, and only the bay draw decides — `SHARED_SEED = 7` holds.
  const blockerServiceTypeId = uuidNamespaceOf(scenario, 'service_type/blocker');
  await client.query('insert into service_type (id, name, duration_minutes) values ($1, $2, $3)', [
    blockerServiceTypeId,
    `${namespace} blocker service`,
    scenario.durationMinutes,
  ]);
  await client.query(
    'insert into technician_qualification (technician_id, service_type_id) values ($1, $2)',
    [scenario.technicianIds[1], blockerServiceTypeId],
  );
  await client.query(
    'delete from technician_qualification where technician_id = $1 and service_type_id = $2',
    [scenario.technicianIds[1], scenario.serviceTypeId],
  );

  const customer = scenario.customers[0];
  if (customer === undefined) throw new Error('seedRetryOnceFixture needs at least one seeded customer');
  await client.query(
    `insert into appointment
       (id, dealership_id, customer_id, vehicle_id, service_type_id, technician_id, bay_id, starts_at, ends_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      uuidNamespaceOf(scenario, 'occupied/blocker'),
      scenario.dealershipId,
      customer.customerId,
      customer.vehicleId,
      blockerServiceTypeId,
      scenario.technicianIds[1],
      scenario.bayIds[0],
      at(0).toISOString(),
      at(60).toISOString(),
    ],
  );

  return scenario;
}

/**
 * How many minutes past `ANCHOR` the reschedule below moves its appointment TO. Disjoint
 * from `seedRescheduleAbsorbedFixture`'s origin interval `[at(0), at(60))`, and inside the
 * default 08:00–18:00 opening hours (ANCHOR renders 10:00 BST, so +120..+180 is 12:00–13:00).
 */
const RESCHEDULE_TARGET_MINUTES = 120;

/**
 * AC-8 leg (iii) (`docs/slices/19-design.md` ruling 15) — a RESCHEDULE whose INCUMBENT pair
 * conflicts, then succeeds. arc42 §6.3: "attempt 1 is the pair the row already holds" —
 * before ADR-0040's shuffle ever opens — so the conflict this fixture needs must be built
 * into the incumbent pair itself, never into what a later, still-blind (ruling 5) shuffle
 * draws.
 *
 * Two bays, and only ONE technician qualified for the scenario's own service type:
 * `technicianIds[1]` is de-qualified from it and re-qualified under a throwaway service type
 * instead — `seedRetryOnceFixture`'s own `I-09-2` remedy, reused verbatim — so it is never a
 * live candidate for the real service type and the technician list going into ANY draw,
 * blind or free-first, stays the single remaining qualified technician (I-04-10's
 * permutation-safe singleton). Only the BAY draw can matter, so no `BOOKING_SEED` is needed.
 *
 * The moved appointment is seeded directly at `bayIds[0]`/`technicianIds[0]` for the ORIGIN
 * interval (`occupy()` — arrangement, not the conflict under test: the reschedule PATCH
 * itself is the one genuine `23P01` this fixture produces). The de-qualified technician then
 * occupies `bayIds[0]` for the TARGET interval, so the incumbent pair
 * (`bayIds[0]`/`technicianIds[0]`) collides there on `no_bay_overlap` the instant the
 * reschedule tries it — never on the technician, which is free throughout and not the
 * blocker's identity. `no_bay_overlap` prunes `bayIds[0]`; the sole remaining pair,
 * `bayIds[1]`/`technicianIds[0]`, is free at the target interval and confirms.
 */
async function seedRescheduleAbsorbedFixture(
  client: Client,
  namespace: string,
): Promise<{ readonly scenario: Scenario; readonly movedAppointmentId: string }> {
  const scenario = await seedScenario(client, namespace, { bays: 2, technicians: 2 });

  const blockerServiceTypeId = uuidNamespaceOf(scenario, 'service_type/blocker');
  await client.query('insert into service_type (id, name, duration_minutes) values ($1, $2, $3)', [
    blockerServiceTypeId,
    `${namespace} blocker service`,
    scenario.durationMinutes,
  ]);
  await client.query(
    'insert into technician_qualification (technician_id, service_type_id) values ($1, $2)',
    [scenario.technicianIds[1], blockerServiceTypeId],
  );
  await client.query(
    'delete from technician_qualification where technician_id = $1 and service_type_id = $2',
    [scenario.technicianIds[1], scenario.serviceTypeId],
  );

  const bay0 = scenario.bayIds[0];
  const technician0 = scenario.technicianIds[0];
  const technician1 = scenario.technicianIds[1];
  const customer = scenario.customers[0];
  if (bay0 === undefined || technician0 === undefined || technician1 === undefined || customer === undefined) {
    throw new Error('seedRescheduleAbsorbedFixture needs 2 bays, 2 technicians and a seeded customer');
  }

  // The appointment under test: bayIds[0] / technicianIds[0], at the ORIGIN interval.
  const movedAppointmentId = await occupy(client, scenario, {
    label: 'moved',
    bayId: bay0,
    technicianId: technician0,
    startsAt: at(0),
    endsAt: at(60),
  });

  // The blocker: bayIds[0], held by the de-qualified technician, at the TARGET interval — so
  // the incumbent pair (bayIds[0]/technicianIds[0]) conflicts there on no_bay_overlap before
  // ADR-0040's shuffle ever opens (ruling 5 leaves reschedule's shuffle EMPTY_OCCUPANCY).
  await client.query(
    `insert into appointment
       (id, dealership_id, customer_id, vehicle_id, service_type_id, technician_id, bay_id, starts_at, ends_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      uuidNamespaceOf(scenario, 'occupied/blocker'),
      scenario.dealershipId,
      customer.customerId,
      customer.vehicleId,
      blockerServiceTypeId,
      technician1,
      bay0,
      at(RESCHEDULE_TARGET_MINUTES).toISOString(),
      at(RESCHEDULE_TARGET_MINUTES + scenario.durationMinutes).toISOString(),
    ],
  );

  return { scenario, movedAppointmentId };
}

interface TelemetryRun {
  readonly answer: HttpAnswer;
  readonly service: StartedService;
  readonly collector: OtelCollector;
  /**
   * R-09-6: every `pino` line the child wrote from the moment `action` was invoked to the
   * moment it resolved (plus a short flush grace period) — Fastify's own request/response
   * lines and every application line alike. Captured BEFORE `service.stop()` runs, so
   * shutdown's own lines are excluded, and after the pre-request snapshot, so boot lines are
   * excluded too: this is "the request's" logs, not "the process's".
   */
  readonly requestLogRecords: readonly Record<string, unknown>[];
}

/**
 * How long to wait, after `action` resolves, before snapshotting `requestLogRecords` — pino's
 * stream can flush a beat after the HTTP response is written. Bounded and unconditional
 * rather than a poll for a specific line: the claim under test is that EVERY line in the
 * window correlates, so waiting for a line this test would already recognise begs the
 * question it exists to answer.
 */
const LOG_FLUSH_GRACE_MS = 300;

/**
 * Start a collector and a service pointed at it, run `action`, stop the SERVICE (which is
 * what flushes a graceful `NodeSDK#shutdown()`, per `otelCollector.ts`'s header), then hand
 * back the collector for assertions. The COLLECTOR is stopped by the caller, in a `finally`,
 * once every assertion in the `it`/`describe` has read it.
 */
async function runWithTelemetry(
  options: { readonly bookingSeed?: number },
  action: (service: StartedService) => Promise<HttpAnswer>,
): Promise<{ readonly failure?: string; readonly run?: TelemetryRun }> {
  const collector = await startOtelCollector();
  const attempt = await startService({
    databaseUrl: inject('databaseUrl'),
    logLevel: 'trace',
    otelExporterEndpoint: collector.endpoint,
    ...(options.bookingSeed === undefined ? {} : { bookingSeed: options.bookingSeed }),
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

describe('QS-13(i) / AC-8 leg (i) — the window, on the two-bay fixture that now confirms on attempt 1 (I-19-2)', () => {
  let client: Client;
  let scenario: Scenario;
  let run: TelemetryRun | undefined;
  let startFailure: string | undefined;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
    scenario = await seedRetryOnceFixture(client, 'ac8i-telemetry-window');

    // No BOOKING_SEED pinned (unlike slice 09's original fixture): free-first ordering
    // (ADR-0040) makes the outcome independent of the shuffle — one busy bay, one free bay,
    // and the free one always heads the list regardless of how the singleton free/busy
    // groups are individually permuted.
    const { failure, run: started } = await runWithTelemetry({}, async (service) =>
      postBooking(service, bookingBody(scenario)),
    );
    startFailure = failure;
    run = started;

    if (run !== undefined) {
      // No `awaitMetricPoints` here: this fixture never conflicts (I-19-2), so a predicate
      // waiting for `booking_conflicts_total` to appear would never resolve and would just
      // burn its timeout for nothing. `run.service.stop()` inside `runWithTelemetry` sends
      // SIGTERM, which flushes the metrics reader on shutdown (`otelCollector.ts`'s own
      // header) — whatever WOULD have exported already has by the time `run` is populated.
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

  it('the service started and the booking succeeded (201) on attempt 1 — free-first draws the free bay (I-19-2)', () => {
    expect(startFailure ?? 'started', `ARRANGE failed.${where()}`).toBe('started');
    expect(
      run?.answer.status,
      `ARRANGE — free-first ordering (ADR-0040) should draw the FREE bay first, confirming on attempt 1.${where()}`,
    ).toBe(201);
  });

  it('QS-13(i) — an `availability.candidates` span ends before the (single) `appointment.insert` span begins, which does not carry ERROR', () => {
    if (run === undefined) return;
    const spans = run.collector.spans();
    const candidates = spans.filter((s) => s.name === 'availability.candidates');
    const inserts = spans.filter((s) => s.name === 'appointment.insert');

    expect(candidates.length, `expected an availability.candidates span.${where()}`).toBeGreaterThanOrEqual(1);
    // I-19-2: free-first makes a single-threaded conflict unconstructible on this fixture
    // while capacity remains, so it now confirms in exactly ONE attempt — not "at least one".
    // A count that drifted back to two would mean ordering regressed to ADR-0009's blind
    // shuffle, which QS-13(ii)'s fixture below exists to catch, not this one's to absorb.
    expect(inserts.length, `expected exactly one appointment.insert span (I-19-2).${where()}`).toBe(1);

    const insert = inserts[0];
    const endsBeforeInsert = candidates.some((c) => c.endTimeUnixNano <= (insert?.startTimeUnixNano ?? 0n));
    expect(
      endsBeforeInsert,
      `expected an availability.candidates span to END before the appointment.insert span ` +
        `BEGINS — the window check-then-act would have raced in (§8.4).${where()}`,
    ).toBe(true);
    expect(
      insert?.statusCode,
      `the single, succeeding attempt must not carry OTel ERROR status: ${describeSpanForFailure(insert)}${where()}`,
    ).not.toBe(2);
    // R-19-4: the old file asserted this against the collector (old L328-329, L345-358) —
    // the export path, not just the in-process counting rule at attemptLoop.test.ts:183-187.
    // A change that stamped db.sqlstate onto a SUCCEEDING insert span must fail here.
    expect(
      insert?.attributes['db.sqlstate'],
      `a succeeding attempt span must carry no db.sqlstate at all: ${JSON.stringify(insert?.attributes)}${where()}`,
    ).toBeUndefined();
    expect(
      insert?.attributes['booking.attempt'],
      `booking.attempt missing on the succeeding appointment.insert span: ${JSON.stringify(insert?.attributes)}${where()}`,
    ).not.toBeUndefined();
    expect(
      insert?.attributes['bay.id'],
      `bay.id missing on the succeeding appointment.insert span: ${JSON.stringify(insert?.attributes)}${where()}`,
    ).not.toBeUndefined();
    expect(
      insert?.attributes['technician.id'],
      `technician.id missing on the succeeding appointment.insert span: ${JSON.stringify(insert?.attributes)}${where()}`,
    ).not.toBeUndefined();
  });

  it('QS-13(i) — no booking_conflicts_total point of any outcome — nothing conflicted', () => {
    if (run === undefined) return;
    // R-19-7: GUARD FIRST, same discipline as the AC-5 absence claim below (L756-760) — a
    // metric pipeline that exported nothing at all would pass "zero booking_conflicts_total
    // points" vacuously. The insert span asserted above proves telemetry arrived this run.
    expect(
      run.collector.spans().length,
      `no telemetry arrived at all in this run — the claim below would be vacuously true ` +
        `rather than evidence that this specific metric did not fire.${where()}`,
    ).toBeGreaterThan(0);

    const points = run.collector.metricPoints().filter((p) => p.metric === 'booking_conflicts_total');
    expect(
      points,
      `attempt 1 confirmed, so neither outcome=absorbed nor outcome=refused should increment.${where()}`,
    ).toHaveLength(0);
  });
});

describe('QS-13(ii) / AC-8 leg (ii) — a booking refused after exhausting candidates: the waterfall', () => {
  let client: Client;
  let scenario: Scenario;
  let run: TelemetryRun | undefined;
  let startFailure: string | undefined;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
    // Both bays blocked (candidate-retry.test.ts's AC-3a/AC-4 shape): permutation-safe —
    // every draw meets a busy bay so every draw conflicts on `no_bay_overlap`, hence no
    // `BOOKING_SEED` is needed here. This is now QS-13(ii)'s fixture too (I-19-2, AC-8): with
    // both bays occupied, free-first's free partition is empty for the bay list, so it
    // degrades to today's shuffle over the whole (busy) list — the waterfall free-first
    // makes unreachable on the two-bay fixture above is still reachable here.
    scenario = await seedScenario(client, 'ac4-telemetry-exhausted', { bays: 2, technicians: 2 });
    await blockPairs(client, scenario, 2, at(0), at(60));

    const { failure, run: started } = await runWithTelemetry({}, async (service) =>
      postBooking(service, bookingBody(scenario)),
    );
    startFailure = failure;
    run = started;
    if (run !== undefined) {
      await run.collector.awaitSpans((spans) => spans.filter((s) => s.name === 'appointment.insert').length >= 2);
      await run.collector.awaitMetricPoints((points) => points.some((p) => p.metric === 'booking_conflicts_total'));
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

  it('AC-4 — outcome=refused increments and outcome=absorbed does not', () => {
    expect(startFailure ?? 'started', `ARRANGE failed.${where()}`).toBe('started');
    expect(run?.answer.status, `ARRANGE — expected the fully-blocked fixture to be refused.${where()}`).toBe(409);
    if (run === undefined) return;

    const points = run.collector.metricPoints().filter((p) => p.metric === 'booking_conflicts_total');
    const refused = points.filter((p) => p.attributes['resource'] === 'bay' && p.attributes['outcome'] === 'refused');
    const absorbed = points.filter((p) => p.attributes['outcome'] === 'absorbed');

    expect(refused.length, `expected a booking_conflicts_total{resource=bay,outcome=refused} point.${where()}`).toBeGreaterThanOrEqual(1);
    expect(absorbed, `outcome=absorbed must not increment when every candidate is exhausted.${where()}`).toHaveLength(0);
  });

  it('QS-13(ii) — one appointment.insert span per attempt, each with a distinct booking.attempt, bay.id, technician.id, db.sqlstate=23P01, a db.constraint in the exclusion pair, and OTel ERROR', () => {
    if (run === undefined) return;
    const inserts = run.collector.spans().filter((s) => s.name === 'appointment.insert');
    // ADR-0009's Bound-2 prunes the WHOLE bay a failed attempt names, unchanged by ADR-0040
    // (§5 "the cap does not change; the insert still adjudicates") — both bays are occupied
    // for the whole run, so attempt 1 conflicts and prunes one bay, attempt 2 conflicts and
    // prunes the other, and the bay list is then empty: the THIRD candidate draw returns
    // `null` and refuses without ever issuing an INSERT. Exactly two spans, deterministically.
    expect(inserts.map((s) => s.attributes), `expected exactly two appointment.insert spans.${where()}`).toHaveLength(2);

    for (const span of inserts) {
      expect(span.attributes['db.sqlstate'], `db.sqlstate missing on a failed attempt span: ${JSON.stringify(span.attributes)}${where()}`).toBe('23P01');
      // R-09-5: §8.4's own claim that `db.sqlstate=23P01` labels an EXCLUSION conflict — a
      // correctness claim, not a name — so any span carrying it must name one of the two
      // exclusion constraints, never (say) a foreign-key constraint mislabelled as a conflict.
      expect(
        ['no_bay_overlap', 'no_technician_overlap'],
        `a span carrying db.sqlstate=23P01 named a constraint outside the exclusion pair: ${String(span.attributes['db.constraint'])}${where()}`,
      ).toContain(span.attributes['db.constraint']);
      // R-09-5: §1.2 goal 4 / the retry-waterfall screenshot reads bars by WHICH bay and
      // WHICH attempt each one was — blank these and the chart loses its own subject while
      // every status-code-only test stays green.
      expect(span.attributes['booking.attempt'], `booking.attempt missing on an appointment.insert span: ${JSON.stringify(span.attributes)}${where()}`).not.toBeUndefined();
      expect(span.attributes['bay.id'], `bay.id missing on an appointment.insert span: ${JSON.stringify(span.attributes)}${where()}`).not.toBeUndefined();
      expect(span.attributes['technician.id'], `technician.id missing on an appointment.insert span: ${JSON.stringify(span.attributes)}${where()}`).not.toBeUndefined();
      // R-09-5: a failed attempt that never sets its OWN span's status renders identically
      // to a slow success on any dashboard reading spans by OTel status — 2 = ERROR. Every
      // span in THIS fixture is a failed attempt — the request is refused overall.
      expect(span.statusCode, `a failed attempt's span must carry OTel's ERROR status (2): ${describeSpanForFailure(span)}${where()}`).toBe(2);
    }

    const attemptNumbers = inserts.map((s) => s.attributes['booking.attempt']);
    expect(
      new Set(attemptNumbers).size,
      `every attempt must carry a DISTINCT booking.attempt — a constant value would still ` +
        `pass an "attribute present" check while erasing the waterfall: ${JSON.stringify(attemptNumbers)}${where()}`,
    ).toBe(inserts.length);
  });

  it('AC-6 — the exhausted refusal produces a booking.refused line, and it too is trace-correlated', () => {
    if (run === undefined) return;
    // R-09-6's own falsification named `booking.refused` as a line that carried no trace_id.
    // Guard first: if the loop never actually refused, the assertion below would be vacuous.
    const refusals = run.requestLogRecords.filter(
      (r) => r['event'] === 'booking.refused' || r['msg'] === 'booking.refused',
    );
    expect(
      refusals.length,
      `expected a booking.refused line in this request's window — the fully-blocked ` +
        `fixture's own arrangement.${where()}\n  window:\n${JSON.stringify(run.requestLogRecords, null, 2)}`,
    ).toBeGreaterThanOrEqual(1);

    const spanTraceIds = new Set<string>(run.collector.spans().map((s: CollectedSpan) => s.traceId));
    const uncorrelated = uncorrelatedRequestLogLines(refusals, spanTraceIds);
    expect(
      uncorrelated,
      `the booking.refused line(s) below carry no correlated trace_id/span_id:\n${JSON.stringify(uncorrelated, null, 2)}${where()}`,
    ).toHaveLength(0);
  });
});

describe('QS-13(iii) / AC-8 leg (iii) — a reschedule whose incumbent pair conflicts, then succeeds', () => {
  let client: Client;
  let scenario: Scenario;
  let movedAppointmentId: string;
  let run: TelemetryRun | undefined;
  let startFailure: string | undefined;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
    const fixture = await seedRescheduleAbsorbedFixture(client, 'ac8iii-telemetry-reschedule-absorbed');
    scenario = fixture.scenario;
    movedAppointmentId = fixture.movedAppointmentId;

    const { failure, run: started } = await runWithTelemetry({}, async (service) =>
      postReschedule(service, movedAppointmentId, at(RESCHEDULE_TARGET_MINUTES).toISOString()),
    );
    startFailure = failure;
    run = started;
    if (run !== undefined) {
      await run.collector.awaitMetricPoints((points) => points.some((p) => p.metric === 'booking_conflicts_total'));
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
    return `\n${fixture}\n  moved appointment: ${movedAppointmentId}\n  HTTP answer: ${answer}\n${telemetry}`;
  }

  it('the arrangement: the incumbent pair conflicts on bayIds[0], and the move still succeeds (200)', () => {
    expect(startFailure ?? 'started', `ARRANGE failed.${where()}`).toBe('started');
    expect(
      run?.answer.status,
      `ARRANGE — the incumbent pair (bayIds[0]/technicianIds[0]) should conflict with the ` +
        `blocker on no_bay_overlap, be pruned, and the sole remaining pair should confirm.${where()}`,
    ).toBe(200);
  });

  it('QS-13(iii) — booking_conflicts_total{resource=bay,outcome=absorbed} increments by exactly 1, with no outcome=refused', () => {
    if (run === undefined) return;
    const points = run.collector.metricPoints().filter((p) => p.metric === 'booking_conflicts_total');
    const absorbed = points.filter((p) => p.attributes['resource'] === 'bay' && p.attributes['outcome'] === 'absorbed');
    const refused = points.filter((p) => p.attributes['outcome'] === 'refused');

    expect(absorbed.length, `expected a booking_conflicts_total{resource=bay,outcome=absorbed} point.${where()}`).toBeGreaterThanOrEqual(1);
    // Cumulative temporality may export the same point more than once across periodic
    // exports; every exported value for THIS attribute set must read exactly 1, never more.
    expect(absorbed.every((p) => p.value === 1), `every absorbed export must read exactly 1.${where()}`).toBe(true);
    expect(refused, `no outcome=refused increment is expected in this run.${where()}`).toHaveLength(0);
  });

  it('QS-13(iii) — the move produces a booking.conflict line, and it too is trace-correlated', () => {
    if (run === undefined) return;
    // This fixture's whole point is that the INCUMBENT pair conflicts before ADR-0040's
    // shuffle ever opens (arc42 §6.3, ruling 5). Guard first: if the move never actually
    // conflicted, the assertion below would be vacuous rather than evidence.
    const conflicts = run.requestLogRecords.filter(
      (r) => r['event'] === 'booking.conflict' || r['msg'] === 'booking.conflict',
    );
    expect(
      conflicts.length,
      `expected a booking.conflict line in this request's window — the fixture's own ` +
        `arrangement.${where()}\n  window:\n${JSON.stringify(run.requestLogRecords, null, 2)}`,
    ).toBeGreaterThanOrEqual(1);

    const spanTraceIds = new Set<string>(run.collector.spans().map((s: CollectedSpan) => s.traceId));
    const uncorrelated = uncorrelatedRequestLogLines(conflicts, spanTraceIds);
    expect(
      uncorrelated,
      `the booking.conflict line(s) below carry no correlated trace_id/span_id:\n${JSON.stringify(uncorrelated, null, 2)}${where()}`,
    ).toHaveLength(0);
  });
});

describe('QS-13 / AC-6 — an internal fault (500) still correlates every log line to the trace', () => {
  let client: Client;
  let scenario: Scenario;
  let run: TelemetryRun | undefined;
  let startFailure: string | undefined;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
    // `tests/contract/error-taxonomy.test.ts`'s own measured route to a GENUINE 500: a
    // dealership whose IANA zone Node cannot resolve is a SYSTEM fault, not a caller mistake
    // — `/problems/internal`, not a 4xx (design §2.7, OQ-02-2 closed; the row is `500` in
    // that file's own closed-set table). This is the only reachable black-box route to
    // `server.ts`'s `request.failed` line this suite exercises — see this slice's own report
    // on why a genuine ADR-0018 deadlock is not reproduced here.
    scenario = await seedScenario(client, 'ac6-telemetry-internal-fault', {
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
    return `\n${fixture}\n  HTTP answer: ${answer}`;
  }

  it('AC-6 — the arrangement: a broken time zone answers 500 /problems/internal', () => {
    expect(startFailure ?? 'started', `ARRANGE failed.${where()}`).toBe('started');
    if (run === undefined) return;
    expect(run.answer.status, `ARRANGE — expected the broken-zone fixture to fault.${where()}`).toBe(500);
  });

  it("AC-6 — every log line the 500 produced, including server.ts's own request.failed line, is trace-correlated", () => {
    if (run === undefined) return;
    const records = run.requestLogRecords;
    expect(
      records.length,
      `expected more than one log line in the request's window.${where()}\n  window:\n${JSON.stringify(records, null, 2)}`,
    ).toBeGreaterThan(1);

    const spanTraceIds = new Set<string>(run.collector.spans().map((s: CollectedSpan) => s.traceId));
    const uncorrelated = uncorrelatedRequestLogLines(records, spanTraceIds);
    expect(
      uncorrelated,
      `these log lines from the 500 carry no correlated trace_id/span_id:\n${JSON.stringify(uncorrelated, null, 2)}${where()}`,
    ).toHaveLength(0);
  });
});

describe('QS-13 / AC-5 — a 409 from moving a CANCELLED appointment does not touch booking_conflicts_total', () => {
  let client: Client;
  let scenario: Scenario;
  let run: TelemetryRun | undefined;
  let startFailure: string | undefined;
  let bookAnswer: HttpAnswer | undefined;
  let cancelAnswer: HttpAnswer | undefined;
  let rescheduleAnswer: HttpAnswer | undefined;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
    scenario = await seedScenario(client, 'ac5-telemetry-not-confirmed', { bays: 1, technicians: 1 });

    const { failure, run: started } = await runWithTelemetry({}, async (service) => {
      bookAnswer = await postBooking(service, bookingBody(scenario));
      const id = member(bookAnswer, 'id');
      cancelAnswer = await postCancellation(service, String(id));
      rescheduleAnswer = await postReschedule(service, String(id), new Date(at(120).getTime()).toISOString());
      return rescheduleAnswer;
    });
    startFailure = failure;
    run = started;
    if (run !== undefined) {
      // There is nothing to wait FOR here — the claim is absence — so this only waits long
      // enough that an eventual, wrongly-fired increment would have arrived.
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  });

  afterAll(async () => {
    await run?.collector.stop();
    await client?.end();
  });

  function where(): string {
    const fixture = describeScenario(scenario);
    return (
      `\n${fixture}` +
      `\n  book:       ${bookAnswer === undefined ? '(none)' : describeAnswer(bookAnswer)}` +
      `\n  cancel:     ${cancelAnswer === undefined ? '(none)' : describeAnswer(cancelAnswer)}` +
      `\n  reschedule: ${rescheduleAnswer === undefined ? '(none)' : describeAnswer(rescheduleAnswer)}` +
      `\n${run === undefined ? '(no collector)' : run.collector.describe()}`
    );
  }

  it('AC-5 — the arrangement: booked, cancelled, then a 409 appointment-not-confirmed on reschedule', () => {
    expect(startFailure ?? 'started', `ARRANGE failed.${where()}`).toBe('started');
    expect(bookAnswer?.status, `ARRANGE — booking failed.${where()}`).toBe(201);
    expect(cancelAnswer?.status, `ARRANGE — cancellation failed.${where()}`).toBe(200);
    expect(rescheduleAnswer?.status, `ARRANGE — expected 409 appointment-not-confirmed.${where()}`).toBe(409);
    expect(member(rescheduleAnswer as HttpAnswer, 'type')).toBe('/problems/appointment-not-confirmed');
  });

  it('AC-5 — booking_conflicts_total did not increment: this is a state conflict, never a 23P01', () => {
    if (run === undefined) return;
    // GUARD FIRST: "zero points" is vacuous if telemetry never arrived at all — the same
    // discipline `guardTheCruiseHappened` applies in tests/architecture/layering.test.ts.
    // The booking half of this arrangement is a real, uncontended write, so at least one
    // span (e.g. appointment.insert) must exist before the ABSENCE claim below means anything.
    expect(
      run.collector.spans().length,
      `no telemetry arrived at all in this run — the claim below would be vacuously true ` +
        `rather than evidence that a state conflict specifically is not counted.${where()}`,
    ).toBeGreaterThan(0);

    const points = run.collector.metricPoints().filter((p) => p.metric === 'booking_conflicts_total');
    expect(
      points,
      `a 409 from an application-guarded UPDATE (zero rows, ADR-0025) is not contention — ` +
        `§8.4 counts SQLSTATE 23P01 and nothing else.${where()}`,
    ).toHaveLength(0);
  });
});

describe('QS-13 / AC-6 — structured, trace-correlated logs carry no customer name, VIN or vehicle description', () => {
  let client: Client;
  let scenario: Scenario;
  let run: TelemetryRun | undefined;
  let startFailure: string | undefined;

  const NAMESPACE = 'ac6-telemetry-log-pii';
  // Mirrors seedScenario's OWN naming exactly (tests/support/booking.ts), so this test
  // asserts against the actual seeded values without needing seedScenario to expose them.
  const CUSTOMER_NAME = `${NAMESPACE} customer 000`;
  const VEHICLE_DESCRIPTION = 'vehicle 000';
  const VEHICLE_VIN = vinFor(NAMESPACE, 'vehicle/000');

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
    const output = run === undefined ? '(service did not start)' : run.service.output().stdout;
    return `\n${fixture}\n  stdout:\n${output}`;
  }

  it('AC-6 — the request succeeded, so its logs exist to be examined', () => {
    expect(startFailure ?? 'started', `ARRANGE failed.${where()}`).toBe('started');
    expect(run?.answer.status, `ARRANGE — booking failed.${where()}`).toBe(201);
  });

  it('AC-6 — given this request, EVERY log line it produced is trace-correlated, not just one', () => {
    if (run === undefined) return;
    const records = run.requestLogRecords;
    // GUARD FIRST (the same discipline `guardTheCruiseHappened` / AC-5's zero-points case
    // apply): "zero uncorrelated lines" is vacuous if the window is empty or a singleton —
    // a real HTTP request through Fastify produces its OWN request/response lines on top of
    // whatever the application logs, so more than one line is the arrangement, not the claim.
    expect(
      records.length,
      `expected more than one log line in the request's window (Fastify's own request/` +
        `response lines plus at least one application line) — a window this thin cannot ` +
        `tell "every line" from "the one line an application happened to instrument".` +
        `${where()}\n  window (${String(records.length)}):\n${JSON.stringify(records, null, 2)}`,
    ).toBeGreaterThan(1);

    const spanTraceIds = new Set<string>(run.collector.spans().map((s: CollectedSpan) => s.traceId));
    const uncorrelated = uncorrelatedRequestLogLines(records, spanTraceIds);
    expect(
      uncorrelated,
      `AC-6 says "given any request", not "at least one line" — these ${String(uncorrelated.length)} ` +
        `of ${String(records.length)} log lines from the request carry no correlated ` +
        `trace_id/span_id:\n${JSON.stringify(uncorrelated, null, 2)}${where()}`,
    ).toHaveLength(0);
  });

  it('AC-6 — no log line names the customer, the VIN, or the vehicle description', () => {
    if (run === undefined) return;
    const stdout = run.service.output().stdout;
    expect(stdout.includes(CUSTOMER_NAME), `the customer's name leaked into the logs.${where()}`).toBe(false);
    expect(stdout.includes(VEHICLE_VIN), `the vehicle's VIN leaked into the logs.${where()}`).toBe(false);
    expect(stdout.includes(VEHICLE_DESCRIPTION), `the vehicle's description leaked into the logs.${where()}`).toBe(false);
  });
});
