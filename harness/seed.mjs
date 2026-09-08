#!/usr/bin/env node
//
// AC-6 / `R-09-12` (`docs/slices/10-design.md` §4) — the seed the terminal path needs, printed
// as `export`-shaped lines so `eval "$(npm run --silent harness:seed)"` is the whole setup a
// clean checkout requires. `tests/acceptance/harness.test.ts` (AC-4, AC-5, AC-6) drives BOTH
// cURL scripts from this command's own stdout alone — never from `tests/support/seedScenario` —
// which is the property this file exists to make true rather than merely convenient.
//
// A PLAIN `.mjs`, not a TypeScript source under `src/`: `tsconfig.build.json` excludes
// `tests/support/`, so this file cannot import it even if it wanted to (the design's own note),
// and there is no `dist/` step in the terminal path this script stands in for — `npm run
// harness:seed` runs this file directly. It is therefore a SECOND, independent transcription of
// arc42 §8.1's reference-data shape, in raw SQL, exactly as `tests/support/seed.ts` is one — a
// renamed or dropped column fails loudly with PostgreSQL's own `42703`, not silently.
//
// One dealership subtree, seeded FRESH on every invocation (random ids via `crypto.randomUUID()`
// — the harness's own `deps.newId()` equivalent, not `src/main.ts`'s: `tests/architecture/
// uuid-mint.test.ts`'s AC-3b marker scopes to `src/**` only). The suite's `db` project shares one
// Testcontainer across every file with no truncation (`tests/setup/postgres.ts`), and this script
// is invoked more than once against it (once per acceptance-test case) — fresh, unrelated ids on
// every run is what keeps two invocations from colliding on `vehicle.vin`'s global UNIQUE.
//
// NO printing pre-hook (`pre<script>` conventions this repository otherwise uses, e.g.
// `pretest`): measured, npm's own `pre`-hook stdout is interleaved with — and would be `eval`'d
// alongside — this script's own `export` lines, corrupting the one shape AC-6 relies on. This
// file has no `preharness:seed` counterpart in `package.json` for that reason.
import { randomBytes, randomUUID } from 'node:crypto';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl === '') {
  console.error('harness/seed.mjs: DATABASE_URL is required.');
  process.exit(1);
}

/**
 * A Tuesday, 10:00 `Europe/London` (BST, +01:00) — well inside the 08:00-18:00 opening hours
 * this script seeds for every day of the week, and with two hours' headroom either side for
 * `book-read-reschedule-cancel.sh`'s own reschedule-offset convention (`+2 hours`, pinned in
 * `tests/acceptance/harness.test.ts`'s `RESCHEDULE_OFFSET_MS`).
 */
const STARTS_AT = '2026-09-08T09:00:00.000Z';

/** Seventeen uppercase hex characters — `vehicle.vin`'s shape, without I/O/Q (hex has none). */
function randomVin() {
  return randomBytes(9).toString('hex').toUpperCase().slice(0, 17);
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const dealershipId = randomUUID();
    const serviceTypeId = randomUUID();
    const bayId = randomUUID();
    const technicianId = randomUUID();
    const customerId = randomUUID();
    const vehicleId = randomUUID();

    await client.query('insert into dealership (id, name, time_zone) values ($1, $2, $3)', [
      dealershipId,
      'harness motors',
      'Europe/London',
    ]);

    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
      await client.query(
        'insert into opening_hours (dealership_id, day_of_week, opens_at, closes_at) values ($1, $2, $3, $4)',
        [dealershipId, dayOfWeek, '08:00', '18:00'],
      );
    }

    await client.query(
      'insert into service_type (id, name, duration_minutes) values ($1, $2, $3)',
      [serviceTypeId, 'harness-service', 60],
    );

    await client.query('insert into service_bay (id, dealership_id, name) values ($1, $2, $3)', [
      bayId,
      dealershipId,
      'harness-bay',
    ]);

    await client.query('insert into technician (id, dealership_id, name) values ($1, $2, $3)', [
      technicianId,
      dealershipId,
      'harness-technician',
    ]);

    await client.query(
      'insert into technician_qualification (technician_id, service_type_id) values ($1, $2)',
      [technicianId, serviceTypeId],
    );

    await client.query('insert into customer (id, name) values ($1, $2)', [
      customerId,
      'harness-customer',
    ]);

    await client.query(
      'insert into vehicle (id, customer_id, vin, description) values ($1, $2, $3, $4)',
      [vehicleId, customerId, randomVin(), 'harness vehicle'],
    );

    console.log(`export DEALERSHIP_ID="${dealershipId}"`);
    console.log(`export SERVICE_TYPE_ID="${serviceTypeId}"`);
    console.log(`export CUSTOMER_ID="${customerId}"`);
    console.log(`export VEHICLE_ID="${vehicleId}"`);
    console.log(`export STARTS_AT="${STARTS_AT}"`);
  } finally {
    await client.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(`harness/seed.mjs: seeding failed: ${String(error)}`);
  process.exit(1);
}
