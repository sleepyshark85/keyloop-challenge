import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import { isoAt, seedScenario } from '../support/booking.js';
import type { Scenario } from '../support/booking.js';

/**
 * Slice 09 — the cURL harness, `docs/slices/09-observability.md` AC-10, AC-11 (carried from
 * the slice-10 tombstone). arc42 §3.1 (the harness as the stubbed client), `CLAUDE.md` §1.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE HARNESS'S INTERFACE IS DEFINED HERE, NOT OBSERVED. `harness/` does not exist at this
 * commit — there is nothing to read it off. Two scripts, and an environment-variable
 * contract chosen for consistency with how every other spawned-process test in this suite
 * configures its subject (`tests/support/service.ts`'s own `DATABASE_URL`/`PORT` convention),
 * documented here so the implementer has a fixed target rather than a guess:
 *
 *   harness/book-read-reschedule-cancel.sh
 *     env: BASE_URL, DEALERSHIP_ID, SERVICE_TYPE_ID, CUSTOMER_ID, VEHICLE_ID, STARTS_AT
 *     Exits 0. Prints, for EACH of book/read/reschedule/cancel, a line containing that
 *     request's HTTP status and (for the 201/200 bodies that carry one) its `type`-bearing
 *     shape — AC-10's "printing the status and type of each response".
 *
 *   harness/double-booking.sh
 *     env: BASE_URL, DEALERSHIP_ID, SERVICE_TYPE_ID, CUSTOMER_ID, VEHICLE_ID, STARTS_AT,
 *          REQUEST_COUNT (how many concurrent requests to fire; this file passes 10)
 *     Exits 0. Fires REQUEST_COUNT concurrent `POST /appointments` at the SAME slot and
 *     prints one line per response containing its HTTP status.
 *
 * If the implementer names or shapes these differently, both cases below fail with "the
 * script does not exist" or a non-zero exit — a real, diagnosable answer, never a crash,
 * for a criterion whose mechanism is not built yet (C1).
 */

const REPO_ROOT = process.cwd();
const HAPPY_PATH_SCRIPT = resolve(REPO_ROOT, 'harness/book-read-reschedule-cancel.sh');
const DOUBLE_BOOKING_SCRIPT = resolve(REPO_ROOT, 'harness/double-booking.sh');
const REQUEST_COUNT = 10;

describe('AC-10, AC-11 — the cURL harness, exercised end to end against the running service', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  async function withService<T>(body: (service: StartedService) => Promise<T>): Promise<{ failure?: string; value?: T }> {
    const attempt = await startService({ databaseUrl: inject('databaseUrl'), logLevel: 'silent' });
    if (attempt.service === undefined) return { failure: attempt.failure ?? 'the service did not start' };
    const service = attempt.service;
    try {
      return { value: await body(service) };
    } finally {
      await service.stop();
    }
  }

  it('AC-10 — the harness books, reads, reschedules and cancels, printing the status and type of each response', async () => {
    const scenario: Scenario = await seedScenario(client, 'ac10-harness-happy-path', { bays: 1, technicians: 1 });

    expect(
      existsSync(HAPPY_PATH_SCRIPT),
      `${HAPPY_PATH_SCRIPT} does not exist yet — see this file's header for the interface it must implement.`,
    ).toBe(true);

    const { failure, value } = await withService(async (service) => {
      const run = spawnSync('bash', [HAPPY_PATH_SCRIPT], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        env: {
          ...process.env,
          BASE_URL: service.baseUrl,
          DEALERSHIP_ID: scenario.dealershipId,
          SERVICE_TYPE_ID: scenario.serviceTypeId,
          CUSTOMER_ID: scenario.customers[0]?.customerId ?? '',
          VEHICLE_ID: scenario.customers[0]?.vehicleId ?? '',
          STARTS_AT: isoAt(0),
        },
      });
      return run;
    });

    expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
    const run = value as ReturnType<typeof spawnSync>;
    const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;

    expect(run.status, `the harness must exit 0.\n${output}`).toBe(0);

    // "printing the status and type of each response" — four requests, four visible status
    // codes: 201 (book), 200 (read), 200 (reschedule), 200 (cancel).
    expect(output, `expected the booking's 201 printed.\n${output}`).toMatch(/201/);
    const twoHundreds = output.match(/\b200\b/g) ?? [];
    expect(
      twoHundreds.length,
      `expected THREE 200s printed — read, reschedule and cancel each answer 200.\n${output}`,
    ).toBeGreaterThanOrEqual(3);
  });

  it('AC-11 — concurrent requests for one slot show exactly one 201 and the rest 409, demonstrated from a terminal', async () => {
    const scenario: Scenario = await seedScenario(client, 'ac11-harness-double-booking', { bays: 1, technicians: 1 });

    expect(
      existsSync(DOUBLE_BOOKING_SCRIPT),
      `${DOUBLE_BOOKING_SCRIPT} does not exist yet — see this file's header for the interface it must implement.`,
    ).toBe(true);

    const { failure, value } = await withService(async (service) => {
      const run = spawnSync('bash', [DOUBLE_BOOKING_SCRIPT], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        env: {
          ...process.env,
          BASE_URL: service.baseUrl,
          DEALERSHIP_ID: scenario.dealershipId,
          SERVICE_TYPE_ID: scenario.serviceTypeId,
          CUSTOMER_ID: scenario.customers[0]?.customerId ?? '',
          VEHICLE_ID: scenario.customers[0]?.vehicleId ?? '',
          STARTS_AT: isoAt(0),
          REQUEST_COUNT: String(REQUEST_COUNT),
        },
      });
      return run;
    });

    expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
    const run = value as ReturnType<typeof spawnSync>;
    const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;

    expect(run.status, `the double-booking script must exit 0.\n${output}`).toBe(0);

    const twoOhOnes = output.match(/\b201\b/g) ?? [];
    const fourOhNines = output.match(/\b409\b/g) ?? [];
    expect(twoOhOnes.length, `expected EXACTLY ONE 201 among ${String(REQUEST_COUNT)} concurrent requests.\n${output}`).toBe(1);
    expect(
      fourOhNines.length,
      `expected the remaining ${String(REQUEST_COUNT - 1)} requests to answer 409.\n${output}`,
    ).toBe(REQUEST_COUNT - 1);

    // The invariant demonstrated end to end: the database agrees with the terminal.
    const row = await client.query(
      "select count(*)::int as n from appointment where dealership_id = $1 and status <> 'cancelled'",
      [scenario.dealershipId],
    );
    expect(row.rows[0]?.n, 'exactly one confirmed appointment must have been persisted').toBe(1);
  });
});
