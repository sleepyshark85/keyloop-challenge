import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { cpus, totalmem, version as nodeVersion } from 'node:os';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import { startOtelCollector } from '../support/otelCollector.js';
import { getAvailability, postBooking, releaseFromBarrier, seedScenario } from '../support/booking.js';
import type { HttpAnswer } from '../support/booking.js';
import { seedPerfFixture } from '../support/perfFixture.js';
import type { PerfFixture } from '../support/perfFixture.js';

/**
 * QS-14 — `docs/slices/09-observability.md` AC-12 through AC-15 · `09-design.md` "What makes
 * QS-14 assertable rather than aspirational" · arc42 §11.
 *
 * `tests/performance/**` is its OWN vitest project (`T-09-3`) with its OWN `globalSetup`
 * container (`vitest.config.ts`), run alone by `tools/ci/run-tests.mjs` — so "uncontended"
 * describes the RUNNER as well as the request (§11's own protocol). This file follows every
 * clause of that protocol:
 *
 *   - Boundary: the HTTP request, end to end (not the use case — that hides pool
 *     acquisition, `D-07-1`'s subject).
 *   - Serially: one request in flight at a time for the timed samples.
 *   - Warm: a discarded warm-up count precedes every timed batch.
 *   - p95 is nearest-rank over 100 samples (the 95th smallest of 100 — index 94, 0-based).
 *   - A seeded fixture: `tests/support/perfFixture.ts`, fully deterministic (no RNG), whose
 *     shape is stated here rather than discovered.
 *   - The machine class is printed beside every measured figure (CPU count, total memory,
 *     Node version) — this file's own evidence; arc42 §11's PERMANENT record is the
 *     architect's as-built job at step 7 (`CLAUDE.md` §6 step 7), not this commit's.
 *
 * Timing (AC-12, AC-13's p95) and counting (AC-13's INSERT count, AC-14) are TWO SEPARATE
 * runs against two separate service instances, one with no telemetry configured and one
 * with a collector wired — design decision 3: "conflated, the budget measures its own
 * instrument."
 */

const WARMUP = 10;
const SAMPLES = 100;
const FIXTURE_CANDIDATE_COUNT = 5 * 20;

function p95NearestRank(samplesMs: readonly number[]): number {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const index = Math.ceil(0.95 * sorted.length) - 1; // nearest-rank, 0-based
  const value = sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  if (value === undefined) throw new Error('p95NearestRank: no samples');
  return value;
}

function machineClass(): string {
  const cores = cpus();
  return (
    `cpus=${String(cores.length)} model="${cores[0]?.model ?? 'unknown'}" ` +
    `totalMemMB=${String(Math.round(totalmem() / (1024 * 1024)))} node=${nodeVersion}`
  );
}

async function timeMs(action: () => Promise<HttpAnswer>): Promise<{ readonly ms: number; readonly answer: HttpAnswer }> {
  const start = performance.now();
  const answer = await action();
  const ms = performance.now() - start;
  return { ms, answer };
}

async function withService<T>(
  options: { readonly otelExporterEndpoint?: string },
  body: (service: StartedService) => Promise<T>,
): Promise<{ readonly failure?: string; readonly value?: T }> {
  const attempt = await startService({
    databaseUrl: inject('databaseUrl'),
    logLevel: 'silent',
    ...(options.otelExporterEndpoint === undefined ? {} : { otelExporterEndpoint: options.otelExporterEndpoint }),
  });
  if (attempt.service === undefined) return { failure: attempt.failure ?? 'the service did not start' };
  const service = attempt.service;
  try {
    return { value: await body(service) };
  } finally {
    await service.stop();
  }
}

describe('QS-14 — the availability and booking budgets, and the N+1/INSERT-count controls', () => {
  let client: Client;
  let fixture: PerfFixture;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
    fixture = await seedPerfFixture(client, 'qs14-perf-fixture');
    // eslint-disable-next-line no-console
    console.log(`[QS-14] machine class: ${machineClass()}`);
    // eslint-disable-next-line no-console
    console.log(
      `[QS-14] fixture: ${String(fixture.scenario.bayIds.length)} bays, ` +
        `${String(fixture.scenario.technicianIds.length)} technicians, 500 filler appointments, ` +
        `week starting ${fixture.weekStart.toISOString()} (deterministic, no RNG — no seed to record)`,
    );
  }, 120_000);

  afterAll(async () => {
    await client?.end();
  });

  describe('AC-12 — a one-day availability query, p95 under 200ms over 100 uncontended runs', () => {
    it('p95 < 200ms', async () => {
      const dayStart = fixture.weekStart;
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
      const query = {
        dealershipId: fixture.scenario.dealershipId,
        serviceTypeId: fixture.scenario.serviceTypeId,
        from: dayStart.toISOString(),
        to: dayEnd.toISOString(),
      };

      const { failure, value } = await withService({}, async (service) => {
        for (let i = 0; i < WARMUP; i += 1) await getAvailability(service, query);

        const samples: number[] = [];
        for (let i = 0; i < SAMPLES; i += 1) {
          const { ms, answer } = await timeMs(async () => await getAvailability(service, query));
          expect(answer.status, `availability query #${String(i)} did not answer 200: ${JSON.stringify(answer)}`).toBe(200);
          samples.push(ms);
        }
        return samples;
      });

      expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
      const samples = value as number[];
      const p95 = p95NearestRank(samples);
      // eslint-disable-next-line no-console
      console.log(`[QS-14][AC-12] ${machineClass()} p95=${p95.toFixed(2)}ms over ${String(SAMPLES)} samples (warmup=${String(WARMUP)})`);
      expect(p95, `AC-12 — p95 must be under 200ms; measured ${p95.toFixed(2)}ms. ${machineClass()}`).toBeLessThan(200);
    }, 120_000);
  });

  describe('AC-13 — an uncontended booking, p95 under 100ms, and exactly one INSERT', () => {
    it('the timing half: p95 < 100ms over 100 uncontended bookings', async () => {
      const { failure, value } = await withService({}, async (service) => {
        // Warm-up bookings consume real slots too — offset past them for the timed batch.
        for (let i = 0; i < WARMUP; i += 1) {
          await postBooking(service, {
            dealershipId: fixture.scenario.dealershipId,
            customerId: fixture.scenario.customers[0]?.customerId,
            vehicleId: fixture.scenario.customers[0]?.vehicleId,
            serviceTypeId: fixture.scenario.serviceTypeId,
            startsAt: fixture.timingBookingStartsAt(i).toISOString(),
          });
        }

        const samples: number[] = [];
        for (let i = 0; i < SAMPLES; i += 1) {
          const index = WARMUP + i;
          const { ms, answer } = await timeMs(
            async () =>
              await postBooking(service, {
                dealershipId: fixture.scenario.dealershipId,
                customerId: fixture.scenario.customers[0]?.customerId,
                vehicleId: fixture.scenario.customers[0]?.vehicleId,
                serviceTypeId: fixture.scenario.serviceTypeId,
                startsAt: fixture.timingBookingStartsAt(index).toISOString(),
              }),
          );
          expect(answer.status, `uncontended booking #${String(i)} did not answer 201: ${JSON.stringify(answer)}`).toBe(201);
          samples.push(ms);
        }
        return samples;
      });

      expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
      const samples = value as number[];
      const p95 = p95NearestRank(samples);
      // eslint-disable-next-line no-console
      console.log(`[QS-14][AC-13 timing] ${machineClass()} p95=${p95.toFixed(2)}ms over ${String(SAMPLES)} samples (warmup=${String(WARMUP)})`);
      expect(p95, `AC-13 — p95 must be under 100ms; measured ${p95.toFixed(2)}ms. ${machineClass()}`).toBeLessThan(100);
    }, 120_000);

    it('the counting half: exactly one appointment.insert span for one uncontended booking (instrumented run, timing not asserted here)', async () => {
      const collector = await startOtelCollector();
      const { failure, value } = await withService({ otelExporterEndpoint: collector.endpoint }, async (service) => {
        const answer = await postBooking(service, {
          dealershipId: fixture.scenario.dealershipId,
          customerId: fixture.scenario.customers[0]?.customerId,
          vehicleId: fixture.scenario.customers[0]?.vehicleId,
          serviceTypeId: fixture.scenario.serviceTypeId,
          startsAt: fixture.telemetryProbeStartsAt.toISOString(),
        });
        return answer;
      });
      try {
        expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
        const answer = value as HttpAnswer;
        expect(answer.status, `ARRANGE — the instrumented booking must be uncontended too: ${JSON.stringify(answer)}`).toBe(201);

        const inserts = await collector.awaitSpans((spans) => spans.filter((s) => s.name === 'appointment.insert').length >= 1);
        const insertSpans = inserts.filter((s) => s.name === 'appointment.insert');
        expect(
          insertSpans,
          `AC-13 — an uncontended booking must issue EXACTLY ONE INSERT (one appointment.insert span).\n${collector.describe()}`,
        ).toHaveLength(1);
      } finally {
        await collector.stop();
      }
    }, 30_000);
  });

  describe('AC-14 — candidate selection reads the candidate set once, not once per candidate', () => {
    it('the availability.candidates span does not contain a number of nested query spans proportional to bays x technicians', async () => {
      const collector = await startOtelCollector();
      const dayStart = fixture.weekStart;
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);

      const { failure, value } = await withService({ otelExporterEndpoint: collector.endpoint }, async (service) => {
        return await getAvailability(service, {
          dealershipId: fixture.scenario.dealershipId,
          serviceTypeId: fixture.scenario.serviceTypeId,
          from: dayStart.toISOString(),
          to: dayEnd.toISOString(),
        });
      });
      try {
        expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
        const answer = value as HttpAnswer;
        expect(answer.status, `ARRANGE — the availability query failed: ${JSON.stringify(answer)}`).toBe(200);

        const spans = await collector.awaitSpans((s) => s.some((span) => span.name === 'availability.candidates'));
        const candidatesSpan = spans.find((s) => s.name === 'availability.candidates');
        expect(candidatesSpan, `no availability.candidates span was emitted.\n${collector.describe()}`).toBeDefined();
        if (candidatesSpan === undefined) return;

        // Every OTHER span in the same trace whose interval falls within the candidates
        // span's own [start, end) window — a nesting proxy that needs no assumption about
        // exact span names or parent/child chains, only about TIME containment.
        const nested = spans.filter(
          (s) =>
            s !== candidatesSpan &&
            s.traceId === candidatesSpan.traceId &&
            s.startTimeUnixNano >= candidatesSpan.startTimeUnixNano &&
            s.endTimeUnixNano <= candidatesSpan.endTimeUnixNano,
        );

        // 5 bays x 20 technicians = 100 reachable candidate pairs. A per-candidate query
        // pattern would nest roughly that many statement spans; reading the candidate set
        // ONCE (or a small, fixed number of times) nests a HANDFUL. The bound below is
        // deliberately generous relative to "once" and deliberately far below "100", so it
        // discriminates the N+1 shape without pinning an exact query count no design here
        // commits to.
        const BOUND = 10;
        expect(
          nested.length,
          `AC-14 — expected at most ${String(BOUND)} nested spans inside availability.candidates ` +
            `(reading the candidate set once), found ${String(nested.length)} — consistent with a ` +
            `once-per-candidate (N+1) query pattern over ${String(FIXTURE_CANDIDATE_COUNT)} candidates.\n${collector.describe()}`,
        ).toBeLessThanOrEqual(BOUND);
      } finally {
        await collector.stop();
      }
    }, 30_000);
  });

  describe('AC-15 — the measured write throughput for one contended resource, and arc42 §11 stating it', () => {
    it('measures throughput under one-resource contention, and finds it recorded in arc42 §11 with the dealership scale it becomes binding at', async () => {
      // A SEPARATE, MINIMAL scenario — bays: 1, technicians: 1 — not the 5x20 QS-14 fixture.
      // "One contended resource" means racers have exactly ONE (bay, technician) pair to
      // contend over; against the perf fixture's full 5x20 candidate grid, 20 racers land on
      // up to 20 DIFFERENT free pairs at the same instant, which measures the dealership's
      // aggregate capacity rather than one resource's ceiling — deliberately the opposite of
      // AC-12/AC-13's uncontended, high-capacity fixture, and a different fixture SHAPE for a
      // different question, matching `tests/concurrency/no-spurious-refusal.test.ts`'s own
      // `bays: 1` shape for the same reason.
      const RACERS = 20;
      const contendedScenario = await seedScenario(client, 'ac15-write-throughput-contended', {
        bays: 1,
        technicians: 1,
      });
      const dealershipId = contendedScenario.dealershipId;
      const serviceTypeId = contendedScenario.serviceTypeId;
      const customerId = contendedScenario.customers[0]?.customerId;
      const vehicleId = contendedScenario.customers[0]?.vehicleId;
      const contendedStartsAt = new Date('2026-11-02T09:00:00.000Z');

      const { failure, value } = await withService({}, async (service) => {
        const start = performance.now();
        const answers = await releaseFromBarrier(RACERS, async () =>
          postBooking(service, {
            dealershipId,
            customerId,
            vehicleId,
            serviceTypeId,
            startsAt: contendedStartsAt.toISOString(),
          }),
        );
        const elapsedMs = performance.now() - start;
        return { answers, elapsedMs };
      });

      expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
      const { answers, elapsedMs } = value as { answers: readonly HttpAnswer[]; elapsedMs: number };

      const succeeded = answers.filter((a) => a.status === 201).length;
      expect(succeeded, 'exactly one racer must win the single contended slot').toBe(1);

      const throughputPerSecond = (RACERS / elapsedMs) * 1000;
      // eslint-disable-next-line no-console
      console.log(
        `[QS-14][AC-15] ${machineClass()} ${String(RACERS)} concurrent writes to one resource in ` +
          `${elapsedMs.toFixed(1)}ms -> ${throughputPerSecond.toFixed(2)} attempts/sec`,
      );

      const arc42Risks = readFileSync(resolve(process.cwd(), 'docs/arc42/11-risks-technical-debt.md'), 'utf8');
      // "write throughput" / "write-throughput" — the concept is two words; prose is free to
      // join them with a space or a hyphen (arc42 §11's heading does the latter) and the
      // assertion must not care which. It still pins the concept, not any figure anywhere in §11.
      const mentionsThroughputFigure = /\bwrite[\s-]+throughput\b[\s\S]{0,400}?\d+(\.\d+)?\s*(attempts|writes|requests|bookings)?\s*\/\s*s(ec|econd)?\b/i.test(
        arc42Risks,
      );
      const mentionsBindingScale = /\bdealership\b[\s\S]{0,200}?\bbinding\b|\bbinding\b[\s\S]{0,200}?\bdealership\b/i.test(
        arc42Risks,
      );

      expect(
        mentionsThroughputFigure,
        `AC-15 — arc42 §11 (docs/arc42/11-risks-technical-debt.md) does not yet state a measured ` +
          `write-throughput figure for one contended resource. Measured here: ${throughputPerSecond.toFixed(2)}/s.`,
      ).toBe(true);
      expect(
        mentionsBindingScale,
        'AC-15 — arc42 §11 does not yet state the dealership scale at which that figure becomes binding.',
      ).toBe(true);
    }, 60_000);
  });
});
