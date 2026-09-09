import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { startService } from '../support/service.js';
import { postBooking, describeAnswer, member } from '../support/booking.js';

/**
 * Slice 15 — `docs/slices/15-seed-fixtures-and-capacity-harness.md` AC-1 through AC-8, AC-10.
 * `docs/slices/15-design.md` is the design of record; the step-2 rulings folded into both
 * files at `25d6dde`/`1e8ba86` are restated here only where a case depends on the wording.
 *
 * A NEW file, not growth onto `tests/acceptance/harness.test.ts` (design §6): AC-9 — that file
 * and `harness/double-booking.sh` unchanged — is verified by the reviewer against
 * `git diff main --stat`, not by an assertion in here, because this file is itself the only
 * diff `harness.test.ts` could have taken.
 *
 * Schema knowledge below (`service_bay`, `technician`, `technician_qualification`,
 * `dealership`) comes from `harness/seed.mjs` (a harness file, not `src/`) and arc42 §8.1; the
 * `appointment` columns queried in `nonCancelledAt` are copied from the already-committed
 * `SELECT_APPOINTMENT` shape `tests/support/booking.ts` (`findStoredAppointment`,
 * `confirmedOverlapping`) already reads with, not re-derived from `src/`.
 *
 * D-15-3 (the seed's `BEGIN`/`COMMIT`/`ROLLBACK` path) has no case here, deliberately. Every
 * fixture-controllable input the validator's ten rules do not already cover — ids, VINs, the
 * seeded instant — is explicitly EXCLUDED from the fixture by design §2 (`seed.mjs` mints them
 * fresh, never from JSON), so no fixture built from this file's schema can be simultaneously
 * valid under all ten rules and certain to fail at `INSERT` with a distinct SQLSTATE. Any
 * fixture that could do that would be targeting an eleventh rule the validator can trivially
 * absorb — `R-10-5`'s vacuity pattern the architect named. Left unasserted, as booked.
 */

const REPO_ROOT = process.cwd();
const FIXTURE_PATH = resolve(REPO_ROOT, 'harness/fixture.json');
const SPURIOUS_SCRIPT = resolve(REPO_ROOT, 'harness/spurious-refusal.sh');
const REQUEST_COUNT = 10;

// ─────────────────────────────────────────────────────────── npm run harness:seed's output ──

/** `spawnSync` with `encoding: 'utf8'` still types `stdout`/`stderr` as `string | Buffer`. */
function text(value: string | Buffer | null | undefined): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : value.toString('utf8');
}

/** `export KEY=VALUE` (optionally quoted) lines — the only shape AC-1/AC-2 read. */
function parseExportedEnv(stdout: string | Buffer | null | undefined): Record<string, string> {
  const env: Record<string, string> = {};
  for (const rawLine of text(stdout).split('\n')) {
    const line = rawLine.trim();
    const match = /^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match === null) continue;
    const key = match[1];
    let value = match[2] ?? '';
    const quoted =
      (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) ||
      (value.length >= 2 && value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    if (key !== undefined) env[key] = value;
  }
  return env;
}

/** Non-blank lines that are not `export KEY=...` shaped — AC-1's "nothing that is not an export line". */
function nonExportLines(stdout: string | Buffer | null | undefined): string[] {
  return text(stdout)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^export\s+[A-Za-z_][A-Za-z0-9_]*=.*$/.test(l));
}

function runHarnessSeed(databaseUrl: string, fixturePath?: string): ReturnType<typeof spawnSync> {
  return spawnSync('npm', ['run', '--silent', 'harness:seed'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      ...(fixturePath === undefined ? {} : { HARNESS_FIXTURE: fixturePath }),
    },
  });
}

function runScript(scriptPath: string, env: NodeJS.ProcessEnv): ReturnType<typeof spawnSync> {
  return spawnSync('bash', [scriptPath], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env });
}

function outputOf(run: ReturnType<typeof spawnSync>): string {
  return `stdout:\n${run.stdout ?? ''}\nstderr:\n${run.stderr ?? ''}\nstatus: ${String(run.status)}`;
}

/**
 * Every non-cancelled `appointment` row for `dealershipId` at the exact instant `startsAtIso`.
 * Exact equality, not an overlap range: every racer in this file targets the identical
 * instant, so it isolates this run's own rows without needing the fixture's (unexported)
 * service duration. Column names match `tests/support/booking.ts`'s `SELECT_APPOINTMENT`.
 */
async function nonCancelledAt(
  client: Client,
  dealershipId: string,
  startsAtIso: string,
): Promise<readonly { readonly bayId: string; readonly technicianId: string }[]> {
  const { rows } = await client.query<{ bay_id: string; technician_id: string }>(
    `select bay_id, technician_id from appointment
      where dealership_id = $1 and starts_at = $2 and status <> 'cancelled'`,
    [dealershipId, startsAtIso],
  );
  return rows.map((r) => ({ bayId: r.bay_id, technicianId: r.technician_id }));
}

// ─────────────────────────────────────────────────────────────────── temp fixture files ──

const tmpDirs: string[] = [];

function writeFixture(fixture: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'harness-fixture-'));
  tmpDirs.push(dir);
  const path = join(dir, 'fixture.json');
  writeFileSync(path, JSON.stringify(fixture, null, 2));
  return path;
}

afterAll(() => {
  for (const dir of tmpDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup only — not itself an assertion
    }
  }
});

/** One subtree, empty export prefix, exactly one of everything — design §3's minimums. */
function baselineSubtree(): Record<string, unknown> {
  return {
    key: 'scarce',
    purpose: 'AC-3 baseline',
    exportPrefix: '',
    timeZone: 'Europe/London',
    openingHours: { days: [0, 1, 2, 3, 4, 5, 6], opensAt: '08:00', closesAt: '18:00' },
    serviceTypes: ['svc-1'],
    bays: ['bay-1'],
    technicians: [{ key: 'tech-1', qualifiedFor: ['svc-1'] }],
    customers: ['cust-1'],
    vehicles: [{ key: 'veh-1', owner: 'cust-1' }],
  };
}

const SERVICE_TYPES = [{ key: 'svc-1', name: 'ac3 service', durationMinutes: 60 }];

// ══════════════════════════════════════════════════ AC-1 — the scarce, unprefixed subtree ══

describe('AC-1 — npm run harness:seed reads harness/fixture.json', () => {
  it('prints five non-empty unprefixed export lines and nothing that is not an export line', () => {
    expect(
      existsSync(FIXTURE_PATH),
      'harness/fixture.json must exist — AC-1 requires npm run harness:seed to read it (design §3).',
    ).toBe(true);

    const run = runHarnessSeed(inject('databaseUrl'));
    expect(run.status, `npm run --silent harness:seed must exit 0.\n${outputOf(run)}`).toBe(0);

    const bad = nonExportLines(run.stdout);
    expect(bad, `AC-1 forbids stdout lines that are not export-shaped.\n${outputOf(run)}`).toEqual([]);

    const env = parseExportedEnv(run.stdout);
    for (const key of ['DEALERSHIP_ID', 'SERVICE_TYPE_ID', 'CUSTOMER_ID', 'VEHICLE_ID', 'STARTS_AT']) {
      expect(env[key], `AC-1 requires a non-empty unprefixed ${key}.\n${outputOf(run)}`).toBeTruthy();
    }
  });
});

// ══════════════════════════════════════ AC-2 — the abundant CAPACITY_ subtree, DB-checked ══

describe('AC-2 — the same run exports the abundant CAPACITY_ subtree, and the database agrees', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('exports seven CAPACITY_ keys with equal counts >= 2, matched by service_bay and qualified-technician rows', async () => {
    const run = runHarnessSeed(inject('databaseUrl'));
    expect(run.status, `npm run --silent harness:seed must exit 0.\n${outputOf(run)}`).toBe(0);
    const env = parseExportedEnv(run.stdout);

    const required = [
      'CAPACITY_DEALERSHIP_ID',
      'CAPACITY_SERVICE_TYPE_ID',
      'CAPACITY_CUSTOMER_ID',
      'CAPACITY_VEHICLE_ID',
      'CAPACITY_STARTS_AT',
      'CAPACITY_BAY_COUNT',
      'CAPACITY_QUALIFIED_TECHNICIAN_COUNT',
    ] as const;
    for (const key of required) {
      expect(env[key], `AC-2 requires a non-empty ${key} export.\n${outputOf(run)}`).toBeTruthy();
    }
    if (required.some((key) => env[key] === undefined || env[key] === '')) return;

    const bayCount = Number(env['CAPACITY_BAY_COUNT']);
    const techCount = Number(env['CAPACITY_QUALIFIED_TECHNICIAN_COUNT']);
    expect(
      Number.isInteger(bayCount) && bayCount >= 2,
      `CAPACITY_BAY_COUNT must be an integer >= 2, got ${String(env['CAPACITY_BAY_COUNT'])}.`,
    ).toBe(true);
    expect(
      techCount,
      'AC-2 requires CAPACITY_BAY_COUNT and CAPACITY_QUALIFIED_TECHNICIAN_COUNT to be equal.',
    ).toBe(bayCount);

    const bays = await client.query<{ n: number }>(
      'select count(*)::int as n from service_bay where dealership_id = $1',
      [env['CAPACITY_DEALERSHIP_ID']],
    );
    expect(
      Number(bays.rows[0]?.n),
      'AC-2: "the database agrees" — service_bay must hold exactly CAPACITY_BAY_COUNT rows for CAPACITY_DEALERSHIP_ID.',
    ).toBe(bayCount);

    const techs = await client.query<{ n: number }>(
      `select count(distinct t.id)::int as n
         from technician t
         join technician_qualification tq on tq.technician_id = t.id
        where t.dealership_id = $1 and tq.service_type_id = $2`,
      [env['CAPACITY_DEALERSHIP_ID'], env['CAPACITY_SERVICE_TYPE_ID']],
    );
    expect(
      Number(techs.rows[0]?.n),
      'AC-2: "the database agrees" — technicians qualified for CAPACITY_SERVICE_TYPE_ID at CAPACITY_DEALERSHIP_ID must number CAPACITY_QUALIFIED_TECHNICIAN_COUNT.',
    ).toBe(techCount);
  });
});

// ══════════════════════════════════════════════════════════ AC-3 — invalid fixtures ══

interface InvalidCase {
  readonly name: string;
  readonly build: () => Record<string, unknown>;
}

const INVALID_CASES: readonly InvalidCase[] = [
  {
    name: 'an unknown key',
    build: () => ({
      serviceTypes: SERVICE_TYPES,
      subtrees: [{ ...baselineSubtree(), notARealField: true }],
    }),
  },
  {
    name: 'qualifiedFor naming an undeclared service type',
    build: () => {
      const subtree = baselineSubtree();
      subtree['technicians'] = [{ key: 'tech-1', qualifiedFor: ['svc-does-not-exist'] }];
      return { serviceTypes: SERVICE_TYPES, subtrees: [subtree] };
    },
  },
  {
    name: 'vehicles[].owner naming an undeclared customer',
    build: () => {
      const subtree = baselineSubtree();
      subtree['vehicles'] = [{ key: 'veh-1', owner: 'cust-does-not-exist' }];
      return { serviceTypes: SERVICE_TYPES, subtrees: [subtree] };
    },
  },
  {
    name: 'a duplicate key within a collection',
    build: () => {
      const subtree = baselineSubtree();
      subtree['bays'] = ['bay-1', 'bay-1'];
      return { serviceTypes: SERVICE_TYPES, subtrees: [subtree] };
    },
  },
  {
    name: 'no subtree with an empty exportPrefix',
    build: () => {
      const subtree = { ...baselineSubtree(), exportPrefix: 'ONLY_' };
      return { serviceTypes: SERVICE_TYPES, subtrees: [subtree] };
    },
  },
  {
    name: 'a duplicate prefix',
    build: () => {
      const empty = baselineSubtree();
      const dupA = { ...baselineSubtree(), key: 'dup-a', exportPrefix: 'DUP_' };
      const dupB = { ...baselineSubtree(), key: 'dup-b', exportPrefix: 'DUP_' };
      return { serviceTypes: SERVICE_TYPES, subtrees: [empty, dupA, dupB] };
    },
  },
];

describe('AC-3 — an invalid fixture fails loudly and atomically', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it.each(INVALID_CASES)(
    '$name: exits non-zero, prints nothing on stdout, names the path on stderr, inserts no row',
    async ({ build }) => {
      const fixturePath = writeFixture(build());
      const before = await client.query<{ n: number }>('select count(*)::int as n from dealership');

      const run = runHarnessSeed(inject('databaseUrl'), fixturePath);

      expect(
        run.status,
        `AC-3 requires the seed to exit non-zero for an invalid fixture.\n${outputOf(run)}`,
      ).not.toBe(0);
      expect(
        text(run.stdout).trim(),
        `AC-3 requires nothing printed on stdout for an invalid fixture.\n${outputOf(run)}`,
      ).toBe('');
      expect(
        text(run.stderr).trim().length > 0,
        `AC-3 requires the offending JSON path named on stderr.\n${outputOf(run)}`,
      ).toBe(true);

      const after = await client.query<{ n: number }>('select count(*)::int as n from dealership');
      expect(
        Number(after.rows[0]?.n),
        `AC-3 requires an invalid fixture to insert no row (dealership count must not change).\n${outputOf(run)}`,
      ).toBe(Number(before.rows[0]?.n));
    },
  );
});

// ══════════════════════════════════════════ AC-4 / AC-5 — harness/spurious-refusal.sh ══

describe('AC-4 / AC-5 — harness/spurious-refusal.sh demonstrates min(N,M), distinctly', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('exits 0, prints one line per racer, sees exactly min(N,M) confirmed / refused, and the table agrees distinctly', async () => {
    expect(existsSync(SPURIOUS_SCRIPT), `${SPURIOUS_SCRIPT} does not exist yet.`).toBe(true);

    const seed = runHarnessSeed(inject('databaseUrl'));
    expect(seed.status, `npm run --silent harness:seed must exit 0.\n${outputOf(seed)}`).toBe(0);
    const env = parseExportedEnv(seed.stdout);
    const bayCount = Number(env['CAPACITY_BAY_COUNT']);
    const techCount = Number(env['CAPACITY_QUALIFIED_TECHNICIAN_COUNT']);
    const valid = Number.isInteger(bayCount) && bayCount === techCount && bayCount >= 2;
    expect(
      valid,
      `AC-4/AC-5 need a valid capacity subtree (equal counts >= 2); got CAPACITY_BAY_COUNT=${String(env['CAPACITY_BAY_COUNT'])}, CAPACITY_QUALIFIED_TECHNICIAN_COUNT=${String(env['CAPACITY_QUALIFIED_TECHNICIAN_COUNT'])}.\n${outputOf(seed)}`,
    ).toBe(true);
    if (!valid) return;
    const m = bayCount;

    const attempt = await startService({ databaseUrl: inject('databaseUrl'), logLevel: 'silent' });
    expect(attempt.service !== undefined, `the service did not start.\n${attempt.failure ?? ''}`).toBe(true);
    if (attempt.service === undefined) return;
    const service = attempt.service;

    try {
      const run = runScript(SPURIOUS_SCRIPT, {
        ...process.env,
        ...env,
        BASE_URL: service.baseUrl,
        REQUEST_COUNT: String(REQUEST_COUNT),
      });
      const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;

      expect(
        run.status,
        `the script must exit 0 when it saw exactly min(N,M) confirmed and the rest refused.\n${output}`,
      ).toBe(0);

      const racerLines = text(run.stdout).match(/^racer \d+: HTTP \d+$/gm) ?? [];
      expect(
        racerLines.length,
        `AC-4 requires one line per racer (REQUEST_COUNT=${String(REQUEST_COUNT)}).\n${output}`,
      ).toBe(REQUEST_COUNT);

      const confirmed = racerLines.filter((l) => / HTTP 201$/.test(l)).length;
      const refused = racerLines.filter((l) => / HTTP 409$/.test(l)).length;
      const expectedConfirmed = Math.min(REQUEST_COUNT, m);
      expect(
        `${String(confirmed)} confirmed / ${String(refused)} refused`,
        `AC-4 requires exactly min(N,M)=${String(expectedConfirmed)} confirmed and the rest refused.\n${output}`,
      ).toBe(`${String(expectedConfirmed)} confirmed / ${String(REQUEST_COUNT - expectedConfirmed)} refused`);

      const dealershipId = env['CAPACITY_DEALERSHIP_ID'];
      const startsAt = env['CAPACITY_STARTS_AT'];
      if (dealershipId === undefined || startsAt === undefined) return;
      const rows = await nonCancelledAt(client, dealershipId, startsAt);
      expect(
        rows.length,
        `AC-5 requires exactly min(N,M) non-cancelled appointments in the table.\n${output}`,
      ).toBe(expectedConfirmed);
      expect(
        new Set(rows.map((r) => r.bayId)).size,
        `AC-5 requires ${String(expectedConfirmed)} DISTINCT bay ids in the table.\n${output}`,
      ).toBe(expectedConfirmed);
      expect(
        new Set(rows.map((r) => r.technicianId)).size,
        `AC-5 requires ${String(expectedConfirmed)} DISTINCT technician ids in the table.\n${output}`,
      ).toBe(expectedConfirmed);
    } finally {
      await service.stop();
    }
  });
});

// ══════════════════════════════════ AC-6 — negative control: a wrong CAPACITY override ══

describe('AC-6 — negative control: CAPACITY overridden to a wrong value exits non-zero', () => {
  it('exits non-zero when CAPACITY does not match the true capacity', async () => {
    expect(existsSync(SPURIOUS_SCRIPT), `${SPURIOUS_SCRIPT} does not exist yet.`).toBe(true);

    const seed = runHarnessSeed(inject('databaseUrl'));
    expect(seed.status, `npm run --silent harness:seed must exit 0.\n${outputOf(seed)}`).toBe(0);
    const env = parseExportedEnv(seed.stdout);
    const trueCapacity = Number(env['CAPACITY_BAY_COUNT']);
    if (!Number.isInteger(trueCapacity) || trueCapacity < 2) return; // AC-2 already reports this

    const attempt = await startService({ databaseUrl: inject('databaseUrl'), logLevel: 'silent' });
    expect(attempt.service !== undefined, `the service did not start.\n${attempt.failure ?? ''}`).toBe(true);
    if (attempt.service === undefined) return;
    const service = attempt.service;

    try {
      // >= 2 and != the true capacity, so this exercises the COMPARISON (AC-6), never the
      // `CAPACITY < 2` guard (AC-8) — a distinct assertion this file makes elsewhere.
      const wrongCapacity = trueCapacity + 1;
      const run = runScript(SPURIOUS_SCRIPT, {
        ...process.env,
        ...env,
        BASE_URL: service.baseUrl,
        REQUEST_COUNT: String(REQUEST_COUNT),
        CAPACITY: String(wrongCapacity),
      });
      expect(
        run.status,
        `AC-6: overriding CAPACITY to ${String(wrongCapacity)} (true capacity ${String(trueCapacity)}) must make the script exit non-zero.\n${run.stdout ?? ''}\n${run.stderr ?? ''}`,
      ).not.toBe(0);
    } finally {
      await service.stop();
    }
  });
});

// ══════════════════════════ AC-7 — negative control: the interval already fully taken ══

describe('AC-7 — negative control: the interval already fully taken yields zero confirmations', () => {
  it('N racers see zero confirmations and the script exits non-zero', async () => {
    expect(existsSync(SPURIOUS_SCRIPT), `${SPURIOUS_SCRIPT} does not exist yet.`).toBe(true);

    const seed = runHarnessSeed(inject('databaseUrl'));
    expect(seed.status, `npm run --silent harness:seed must exit 0.\n${outputOf(seed)}`).toBe(0);
    const env = parseExportedEnv(seed.stdout);
    const m = Number(env['CAPACITY_BAY_COUNT']);
    if (!Number.isInteger(m) || m < 2 || env['CAPACITY_DEALERSHIP_ID'] === undefined) return;

    const attempt = await startService({ databaseUrl: inject('databaseUrl'), logLevel: 'silent' });
    expect(attempt.service !== undefined, `the service did not start.\n${attempt.failure ?? ''}`).toBe(true);
    if (attempt.service === undefined) return;
    const service = attempt.service;

    try {
      // Fill every bay/technician pair first — one customer may legitimately hold several
      // concurrent appointments; nothing in this system's invariants forbids that.
      for (let i = 0; i < m; i += 1) {
        const pre = await postBooking(service, {
          dealershipId: env['CAPACITY_DEALERSHIP_ID'],
          customerId: env['CAPACITY_CUSTOMER_ID'],
          vehicleId: env['CAPACITY_VEHICLE_ID'],
          serviceTypeId: env['CAPACITY_SERVICE_TYPE_ID'],
          startsAt: env['CAPACITY_STARTS_AT'],
        });
        expect(
          pre.status,
          `pre-booking slot ${String(i + 1)}/${String(m)} to fill the capacity subtree must itself succeed.\n${describeAnswer(pre)}`,
        ).toBe(201);
        if (pre.status !== 201) return;
      }

      const run = runScript(SPURIOUS_SCRIPT, {
        ...process.env,
        ...env,
        BASE_URL: service.baseUrl,
        REQUEST_COUNT: String(REQUEST_COUNT),
      });
      const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      expect(
        run.status,
        `AC-7 requires the script to exit non-zero when it sees zero confirmations.\n${output}`,
      ).not.toBe(0);

      const racerLines = text(run.stdout).match(/^racer \d+: HTTP \d+$/gm) ?? [];
      const confirmed = racerLines.filter((l) => / HTTP 201$/.test(l)).length;
      expect(confirmed, `AC-7 requires zero confirmations once the interval is fully taken.\n${output}`).toBe(0);
    } finally {
      await service.stop();
    }
  });
});

// ═══════════════════════════════════ AC-8 — guards fire before any request is fired ══

describe('AC-8 — guards fire before any request, each naming which guard fired', () => {
  it('REQUEST_COUNT < 2 exits 2 without firing a request', async () => {
    expect(existsSync(SPURIOUS_SCRIPT), `${SPURIOUS_SCRIPT} does not exist yet.`).toBe(true);
    const seed = runHarnessSeed(inject('databaseUrl'));
    expect(seed.status, `npm run --silent harness:seed must exit 0.\n${outputOf(seed)}`).toBe(0);
    const env = parseExportedEnv(seed.stdout);

    const attempt = await startService({ databaseUrl: inject('databaseUrl'), logLevel: 'silent' });
    expect(attempt.service !== undefined, `the service did not start.\n${attempt.failure ?? ''}`).toBe(true);
    if (attempt.service === undefined) return;
    const service = attempt.service;
    try {
      const run = runScript(SPURIOUS_SCRIPT, {
        ...process.env,
        ...env,
        BASE_URL: service.baseUrl,
        REQUEST_COUNT: '1',
      });
      const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      expect(run.status, `AC-8 requires REQUEST_COUNT < 2 to exit 2.\n${output}`).toBe(2);
      expect(
        /REQUEST_COUNT/.test(text(run.stderr)),
        `AC-8 requires the guard to name REQUEST_COUNT on stderr.\n${output}`,
      ).toBe(true);
      expect(
        text(run.stdout).match(/^racer /gm) ?? [],
        `AC-8 forbids firing any request before the guard.\n${output}`,
      ).toEqual([]);
    } finally {
      await service.stop();
    }
  });

  it('CAPACITY < 2 exits 2 without firing a request', async () => {
    expect(existsSync(SPURIOUS_SCRIPT), `${SPURIOUS_SCRIPT} does not exist yet.`).toBe(true);
    const seed = runHarnessSeed(inject('databaseUrl'));
    expect(seed.status, `npm run --silent harness:seed must exit 0.\n${outputOf(seed)}`).toBe(0);
    const env = parseExportedEnv(seed.stdout);

    const attempt = await startService({ databaseUrl: inject('databaseUrl'), logLevel: 'silent' });
    expect(attempt.service !== undefined, `the service did not start.\n${attempt.failure ?? ''}`).toBe(true);
    if (attempt.service === undefined) return;
    const service = attempt.service;
    try {
      const run = runScript(SPURIOUS_SCRIPT, {
        ...process.env,
        ...env,
        BASE_URL: service.baseUrl,
        REQUEST_COUNT: String(REQUEST_COUNT),
        CAPACITY: '1',
      });
      const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      expect(run.status, `AC-8 requires CAPACITY < 2 to exit 2.\n${output}`).toBe(2);
      expect(
        /CAPACITY/.test(text(run.stderr)),
        `AC-8 requires the guard to name CAPACITY on stderr.\n${output}`,
      ).toBe(true);
      expect(
        text(run.stdout).match(/^racer /gm) ?? [],
        `AC-8 forbids firing any request before the guard.\n${output}`,
      ).toEqual([]);
    } finally {
      await service.stop();
    }
  });

  it('BAY_COUNT != QUALIFIED_TECHNICIAN_COUNT exits 2 without firing a request', async () => {
    expect(existsSync(SPURIOUS_SCRIPT), `${SPURIOUS_SCRIPT} does not exist yet.`).toBe(true);
    const seed = runHarnessSeed(inject('databaseUrl'));
    expect(seed.status, `npm run --silent harness:seed must exit 0.\n${outputOf(seed)}`).toBe(0);
    const env = parseExportedEnv(seed.stdout);

    const attempt = await startService({ databaseUrl: inject('databaseUrl'), logLevel: 'silent' });
    expect(attempt.service !== undefined, `the service did not start.\n${attempt.failure ?? ''}`).toBe(true);
    if (attempt.service === undefined) return;
    const service = attempt.service;
    try {
      const trueBayCount = Number(env['CAPACITY_BAY_COUNT']);
      const mismatchedTechCount = Number.isInteger(trueBayCount) ? trueBayCount + 1 : 3;
      const run = runScript(SPURIOUS_SCRIPT, {
        ...process.env,
        ...env,
        BASE_URL: service.baseUrl,
        REQUEST_COUNT: String(REQUEST_COUNT),
        CAPACITY_QUALIFIED_TECHNICIAN_COUNT: String(mismatchedTechCount),
      });
      const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      expect(run.status, `AC-8 requires BAY_COUNT != QUALIFIED_TECHNICIAN_COUNT to exit 2.\n${output}`).toBe(2);
      expect(
        /BAY_COUNT|QUALIFIED_TECHNICIAN_COUNT/.test(text(run.stderr)),
        `AC-8 requires the guard to name BAY_COUNT or QUALIFIED_TECHNICIAN_COUNT on stderr.\n${output}`,
      ).toBe(true);
      expect(
        text(run.stdout).match(/^racer /gm) ?? [],
        `AC-8 forbids firing any request before the guard.\n${output}`,
      ).toEqual([]);
    } finally {
      await service.stop();
    }
  });
});

// ══════════════════ AC-10 — the default fixture is enough data for the important cases ══

describe('AC-10 — one seed run carries enough data for vehicle-not-owned and unknown-reference', () => {
  it('booking VEHICLE_ID_2 with CUSTOMER_ID answers 422 vehicle-not-owned', async () => {
    const seed = runHarnessSeed(inject('databaseUrl'));
    expect(seed.status, `npm run --silent harness:seed must exit 0.\n${outputOf(seed)}`).toBe(0);
    const env = parseExportedEnv(seed.stdout);
    expect(
      env['VEHICLE_ID_2'],
      `AC-10 requires a second vehicle, VEHICLE_ID_2, owned by a different customer.\n${outputOf(seed)}`,
    ).toBeTruthy();
    if (env['VEHICLE_ID_2'] === undefined) return;

    const attempt = await startService({ databaseUrl: inject('databaseUrl'), logLevel: 'silent' });
    expect(attempt.service !== undefined, `the service did not start.\n${attempt.failure ?? ''}`).toBe(true);
    if (attempt.service === undefined) return;
    const service = attempt.service;
    try {
      const answer = await postBooking(service, {
        dealershipId: env['DEALERSHIP_ID'],
        customerId: env['CUSTOMER_ID'],
        vehicleId: env['VEHICLE_ID_2'],
        serviceTypeId: env['SERVICE_TYPE_ID'],
        startsAt: env['STARTS_AT'],
      });
      expect(answer.status, `expected 422 vehicle-not-owned.\n${describeAnswer(answer)}`).toBe(422);
      expect(
        member(answer, 'type'),
        `expected /problems/vehicle-not-owned.\n${describeAnswer(answer)}`,
      ).toBe('/problems/vehicle-not-owned');
    } finally {
      await service.stop();
    }
  });

  it('booking SERVICE_TYPE_ID_2 at DEALERSHIP_ID answers 422 unknown-reference', async () => {
    const seed = runHarnessSeed(inject('databaseUrl'));
    expect(seed.status, `npm run --silent harness:seed must exit 0.\n${outputOf(seed)}`).toBe(0);
    const env = parseExportedEnv(seed.stdout);
    expect(
      env['SERVICE_TYPE_ID_2'],
      `AC-10 requires a second service type, SERVICE_TYPE_ID_2, unqualified at DEALERSHIP_ID.\n${outputOf(seed)}`,
    ).toBeTruthy();
    if (env['SERVICE_TYPE_ID_2'] === undefined) return;

    const attempt = await startService({ databaseUrl: inject('databaseUrl'), logLevel: 'silent' });
    expect(attempt.service !== undefined, `the service did not start.\n${attempt.failure ?? ''}`).toBe(true);
    if (attempt.service === undefined) return;
    const service = attempt.service;
    try {
      const answer = await postBooking(service, {
        dealershipId: env['DEALERSHIP_ID'],
        customerId: env['CUSTOMER_ID'],
        vehicleId: env['VEHICLE_ID'],
        serviceTypeId: env['SERVICE_TYPE_ID_2'],
        startsAt: env['STARTS_AT'],
      });
      expect(answer.status, `expected 422 unknown-reference.\n${describeAnswer(answer)}`).toBe(422);
      expect(
        member(answer, 'type'),
        `expected /problems/unknown-reference.\n${describeAnswer(answer)}`,
      ).toBe('/problems/unknown-reference');
    } finally {
      await service.stop();
    }
  });
});
