import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import { postBooking, describeAnswer } from '../support/booking.js';

/**
 * Slice 10 — `docs/slices/10-openapi-and-curl-harness.md` AC-4, AC-5, AC-6.
 * `docs/slices/10-design.md` §4 (`R-09-12`), "Negative controls, because 'always exits 0' is
 * this slice's whole subject" · arc42 §3.1's "the harness as the stubbed client".
 *
 * Slice 09's AC-10/AC-11 (this file's own prior content) are SUPERSEDED here, not merely
 * amended: their central defect is what this slice exists to fix (design's own framing —
 * "three green tests asserted the wrong thing"). Concretely:
 *
 *   AC-6  BOTH scripts are now driven from `npm run harness:seed`'s OWN stdout, never from
 *         `seedScenario` — the fixture helper every other file in this suite uses. Today
 *         `harness/seed.mjs` and the `harness:seed` script do not exist, so every case below
 *         fails on that fact first, which is the correct red at this commit (C1: a real,
 *         diagnosable "Missing script" or non-zero exit, never a thrown exception).
 *   AC-4  the happy-path script must exit non-zero the moment read, reschedule or cancel
 *         answers a status other than the one that step must answer — "unchecked today" per
 *         the slice file, and confirmed by reading `harness/book-read-reschedule-cancel.sh` as
 *         it stands: only `book`'s status gates an `exit 1`. The negative control below FORCES
 *         reschedule to answer something other than 200, by pre-booking its own known target
 *         slot — `STARTS_AT + 2 hours`, the script's OWN stated convention ("Two hours later —
 *         well inside the fixture's opening hours"), lifted here into an explicit interface
 *         commitment (see "PINNING THE RESCHEDULE OFFSET" below) rather than left implicit.
 *   AC-5  the double-booking script must exit non-zero when it does not see exactly one `201`
 *         among its racers. The EXIT CODE is the signal under test, never a count this file
 *         takes on the script's behalf (that pattern — the test asserting the invariant "on the
 *         script's behalf" — is exactly what design calls out as the defect). The negative
 *         control: `REQUEST_COUNT=1` against an already-taken slot must yield zero `201`s and a
 *         non-zero exit.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * PINNING THE RESCHEDULE OFFSET IS A DELIBERATE INTERFACE COMMITMENT, NOT AN IMPLEMENTATION
 * PEEK. `harness/*.sh` is not `src/` (independence forbids reading THAT, never this), and this
 * offset is EXISTING, already-merged surface from slice 09 — not the unwritten part of THIS
 * slice's diff. Re-asserting it here is the same move slice 00a's own header comment made for
 * `BASE_URL`/`DEALERSHIP_ID` etc.: "the harness's interface is defined here, not observed." If
 * AC-6's `date -u -d` → `node -e` rewrite changes the offset, the collision below stops landing
 * on the reschedule target and this test's OWN assertion (not the invariant it exists to prove)
 * goes red for a diagnosable reason — a legitimate step-4/5 finding, not silently masked.
 *
 * NOTHING HERE THROWS ON A FAILURE OF THE SYSTEM UNDER TEST (C1, as slice 00a fixed it): every
 * helper below returns a `failure` string instead of rejecting.
 */

const REPO_ROOT = process.cwd();
const HAPPY_PATH_SCRIPT = resolve(REPO_ROOT, 'harness/book-read-reschedule-cancel.sh');
const DOUBLE_BOOKING_SCRIPT = resolve(REPO_ROOT, 'harness/double-booking.sh');
const REQUEST_COUNT = 10;
const RESCHEDULE_OFFSET_MS = 2 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────── npm run harness:seed's output ──

/** `export KEY=VALUE` (optionally quoted) lines — the only shape this file will read. */
function parseExportedEnv(stdout: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const rawLine of stdout.split('\n')) {
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

interface HarnessSeed {
  readonly env: Record<string, string>;
}

const REQUIRED_SEED_KEYS = ['DEALERSHIP_ID', 'SERVICE_TYPE_ID', 'CUSTOMER_ID', 'VEHICLE_ID', 'STARTS_AT'] as const;

/**
 * Runs `npm run --silent harness:seed`, DATABASE_URL pointed at this suite's own Testcontainer,
 * and parses its stdout. AC-6's whole claim: this is the ONLY source of ids/`STARTS_AT` any
 * case below uses — never `seedScenario`.
 */
function seedFromHarness(databaseUrl: string): { failure?: string; seed?: HarnessSeed } {
  const run = spawnSync('npm', ['run', '--silent', 'harness:seed'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  if (run.error !== undefined) {
    return { failure: `npm run harness:seed did not spawn: ${String(run.error)}` };
  }
  if (run.status !== 0) {
    return {
      failure:
        `npm run harness:seed exited ${String(run.status)} — AC-6 requires this script to exist ` +
        `and print the harness's environment.\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`,
    };
  }

  const env = parseExportedEnv(run.stdout ?? '');
  const missing = REQUIRED_SEED_KEYS.filter((key) => env[key] === undefined || env[key] === '');
  if (missing.length > 0) {
    return {
      failure:
        `npm run harness:seed's stdout did not print export-shaped lines for: ${missing.join(', ')}. ` +
        `AC-6 requires the WHOLE environment the two scripts need to come from this command's own ` +
        `output.\nstdout:\n${run.stdout}`,
    };
  }
  return { seed: { env } };
}

// ───────────────────────────────────────────────────────────────────────────── service ──

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

interface ScriptRunOutcome {
  readonly seedFailure?: string;
  readonly run?: ReturnType<typeof spawnSync>;
  readonly dealershipId?: string;
}

function runScript(scriptPath: string, env: NodeJS.ProcessEnv): ReturnType<typeof spawnSync> {
  return spawnSync('bash', [scriptPath], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env,
  });
}

function outputOf(run: ReturnType<typeof spawnSync>): string {
  return `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
}

// ───────────────────────────────────────────────────────────── AC-6, second half: no GNU ──

/**
 * `R-09-12`'s first half: no GNU-only coreutils, so the harness runs "from a terminal" on any
 * POSIX host (`CLAUDE.md` §1's stubbed-client boundary, arc42 §3.1). A denylist, named as one
 * (design §4): it proves the NAMED hazards are absent, never POSIX purity in general.
 * `date -u -d` is today's OWN offender, read directly off `book-read-reschedule-cancel.sh` —
 * confirmed here rather than assumed, so this case is red for a fact, not a guess.
 *
 * `date`'s own check walks the FLAG TOKENS immediately following the WORD `date`, rather than
 * one flat regex: the actual offending line is `"$(date -u -d "..." +"%Y-%m-%dT...")"`, with
 * `-u` and `-d` as SEPARATE tokens, `date` itself glued to a leading `$(` with no space (so
 * `\bdate\b` — a WORD boundary, not a whitespace split — is what finds it), and a
 * `+"%Y-%m-%dT..."` FORMAT argument on the same line that legitimately contains a bare `d` a
 * looser pattern would mistake for the flag; capturing only the RUN of `-...`-shaped tokens
 * right after `date` and stopping at the first non-flag token keeps the format string out.
 */
function dateUsesGnuDFlag(content: string): boolean {
  const pattern = /\bdate\b((?:\s+-[A-Za-z=-]+)*)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const flags = (match[1] ?? '').trim().split(/\s+/).filter(Boolean);
    for (const flag of flags) {
      if (flag === '--date' || flag.startsWith('--date=')) return true;
      if (/^-[a-zA-Z]*d[a-zA-Z]*$/.test(flag)) return true;
    }
  }
  return false;
}

const GNU_ONLY_PATTERNS: ReadonlyArray<readonly [string, (content: string) => boolean]> = [
  ['date -d / date --date (GNU date; BSD/macOS date has no such flag)', dateUsesGnuDFlag],
  ['readlink -f', (c) => /\breadlink\s+(?:-[a-zA-Z]*f\b|--canonicalize\b)/.test(c)],
  ['sed -i (without a required BSD backup-suffix argument)', (c) => /\bsed\s+-i(?!\S)/.test(c)],
  ['grep -P / --perl-regexp', (c) => /\bgrep\s+(?:-[a-zA-Z]*P\b|--perl-regexp\b)/.test(c)],
  ['stat -c / --format', (c) => /\bstat\s+(?:-[a-zA-Z]*c\b|--format\b)/.test(c)],
];

describe('AC-6 — no GNU-only coreutils: harness/*.sh needs nothing beyond POSIX', () => {
  it.each([HAPPY_PATH_SCRIPT, DOUBLE_BOOKING_SCRIPT])('%s uses no GNU-only utility', (scriptPath) => {
    expect(existsSync(scriptPath), `${scriptPath} does not exist`).toBe(true);
    if (!existsSync(scriptPath)) return;
    const content = readFileSync(scriptPath, 'utf8');
    const offenders = GNU_ONLY_PATTERNS.filter(([, test]) => test(content)).map(([name]) => name);
    expect(
      offenders,
      `${scriptPath} still uses: ${offenders.join(', ')} — R-09-12 wants 'node -e' in place of ` +
        `GNU date arithmetic, and the POSIX equivalents of the others`,
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────── AC-4 / AC-6 ──

describe('AC-4 / AC-6 — the happy-path harness, driven ONLY from npm run harness:seed\'s output', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('books, reads, reschedules and cancels, exiting 0 only when every step answers correctly', async () => {
    expect(
      existsSync(HAPPY_PATH_SCRIPT),
      `${HAPPY_PATH_SCRIPT} does not exist — see this file's header for the interface it implements.`,
    ).toBe(true);

    const { failure, value } = await withService(async (service): Promise<ScriptRunOutcome> => {
      const seeded = seedFromHarness(inject('databaseUrl'));
      if (seeded.seed === undefined) return { seedFailure: seeded.failure };
      const run = runScript(HAPPY_PATH_SCRIPT, {
        ...process.env,
        ...seeded.seed.env,
        BASE_URL: service.baseUrl,
      });
      return { run };
    });

    expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
    const outcome = value as ScriptRunOutcome;
    expect(outcome.seedFailure, outcome.seedFailure).toBeUndefined();
    if (outcome.run === undefined) return;

    const output = outputOf(outcome.run);
    expect(outcome.run.status, `the harness must exit 0 when every step answers correctly.\n${output}`).toBe(0);

    // Informational — the exit code above is the primary signal (AC-4's own point); these are
    // a sanity check that the four requests actually ran, not a substitute for it.
    expect(output, `expected the booking's 201 printed.\n${output}`).toMatch(/201/);
    const twoHundreds = output.match(/\b200\b/g) ?? [];
    expect(twoHundreds.length, `expected THREE 200s — read, reschedule, cancel.\n${output}`).toBeGreaterThanOrEqual(3);
  });

  it('AC-4 negative control — a reschedule collision makes one of the three previously-unchecked steps fail, and the script must exit non-zero', async () => {
    expect(existsSync(HAPPY_PATH_SCRIPT), `${HAPPY_PATH_SCRIPT} does not exist`).toBe(true);

    const { failure, value } = await withService(async (service): Promise<ScriptRunOutcome> => {
      const seeded = seedFromHarness(inject('databaseUrl'));
      if (seeded.seed === undefined) return { seedFailure: seeded.failure };
      const env = seeded.seed.env;
      const startsAt = env['STARTS_AT'];
      if (startsAt === undefined) return { seedFailure: 'STARTS_AT missing from harness:seed output' };

      const rescheduleTarget = new Date(new Date(startsAt).getTime() + RESCHEDULE_OFFSET_MS).toISOString();

      // Pre-book the EXACT slot the script will try to reschedule into (see "PINNING THE
      // RESCHEDULE OFFSET" above) — the sole bay/technician the seed created is then taken
      // there, so the script's own reschedule request must answer 409, not 200.
      const collision = await postBooking(service, {
        dealershipId: env['DEALERSHIP_ID'],
        customerId: env['CUSTOMER_ID'],
        vehicleId: env['VEHICLE_ID'],
        serviceTypeId: env['SERVICE_TYPE_ID'],
        startsAt: rescheduleTarget,
      });
      if (collision.status !== 201) {
        return {
          seedFailure:
            `pre-booking the reschedule target (${rescheduleTarget}) to force the collision did not ` +
            `itself succeed: ${describeAnswer(collision)}`,
        };
      }

      const run = runScript(HAPPY_PATH_SCRIPT, { ...process.env, ...env, BASE_URL: service.baseUrl });
      return { run };
    });

    expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
    const outcome = value as ScriptRunOutcome;
    expect(outcome.seedFailure, outcome.seedFailure).toBeUndefined();
    if (outcome.run === undefined) return;

    const output = outputOf(outcome.run);
    expect(
      outcome.run.status,
      `reschedule's target slot is already taken, so it must answer something other than 200 — ` +
        `and the script must detect that and exit non-zero, rather than always exiting 0 (today's ` +
        `defect: only 'book' is checked).\n${output}`,
    ).not.toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────── AC-5 / AC-6 ──

describe('AC-5 / AC-6 — the double-booking harness, driven ONLY from npm run harness:seed\'s output', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('concurrent requests for one slot: the script exits 0, and the database agrees exactly one confirmed appointment exists', async () => {
    expect(existsSync(DOUBLE_BOOKING_SCRIPT), `${DOUBLE_BOOKING_SCRIPT} does not exist`).toBe(true);

    const { failure, value } = await withService(async (service): Promise<ScriptRunOutcome> => {
      const seeded = seedFromHarness(inject('databaseUrl'));
      if (seeded.seed === undefined) return { seedFailure: seeded.failure };
      const env = seeded.seed.env;
      const run = runScript(DOUBLE_BOOKING_SCRIPT, {
        ...process.env,
        ...env,
        BASE_URL: service.baseUrl,
        REQUEST_COUNT: String(REQUEST_COUNT),
      });
      return { run, dealershipId: env['DEALERSHIP_ID'] };
    });

    expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
    const outcome = value as ScriptRunOutcome;
    expect(outcome.seedFailure, outcome.seedFailure).toBeUndefined();
    if (outcome.run === undefined || outcome.dealershipId === undefined) return;

    const output = outputOf(outcome.run);
    expect(
      outcome.run.status,
      `the script must exit 0 exactly when exactly one 201 and the rest 409 were seen.\n${output}`,
    ).toBe(0);

    // The invariant demonstrated end to end: the DATABASE agrees with the script's exit code —
    // never a count of '201'/'409' occurrences this file takes on the script's own behalf.
    const row = await client.query(
      "select count(*)::int as n from appointment where dealership_id = $1 and status <> 'cancelled'",
      [outcome.dealershipId],
    );
    expect(row.rows[0]?.n, 'exactly one confirmed appointment must have been persisted').toBe(1);
  });

  it('AC-5 negative control — REQUEST_COUNT=1 against an already-taken slot yields zero 201s, and the script must exit non-zero', async () => {
    expect(existsSync(DOUBLE_BOOKING_SCRIPT), `${DOUBLE_BOOKING_SCRIPT} does not exist`).toBe(true);

    const { failure, value } = await withService(async (service): Promise<ScriptRunOutcome> => {
      const seeded = seedFromHarness(inject('databaseUrl'));
      if (seeded.seed === undefined) return { seedFailure: seeded.failure };
      const env = seeded.seed.env;

      const collision = await postBooking(service, {
        dealershipId: env['DEALERSHIP_ID'],
        customerId: env['CUSTOMER_ID'],
        vehicleId: env['VEHICLE_ID'],
        serviceTypeId: env['SERVICE_TYPE_ID'],
        startsAt: env['STARTS_AT'],
      });
      if (collision.status !== 201) {
        return {
          seedFailure: `pre-booking the slot to make it already-taken did not itself succeed: ${describeAnswer(collision)}`,
        };
      }

      const run = runScript(DOUBLE_BOOKING_SCRIPT, {
        ...process.env,
        ...env,
        BASE_URL: service.baseUrl,
        REQUEST_COUNT: '1',
      });
      return { run };
    });

    expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
    const outcome = value as ScriptRunOutcome;
    expect(outcome.seedFailure, outcome.seedFailure).toBeUndefined();
    if (outcome.run === undefined) return;

    const output = outputOf(outcome.run);
    const twoOhOnes = output.match(/\b201\b/g) ?? [];
    expect(twoOhOnes.length, `the sole slot was already taken, so no racer should see 201.\n${output}`).toBe(0);
    expect(
      outcome.run.status,
      `zero 201s among the requests fired must make the script exit non-zero — today it always ` +
        `exits 0 regardless of what it saw.\n${output}`,
    ).not.toBe(0);
  });
});
