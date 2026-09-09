#!/usr/bin/env node
//
// Slice 15 — `docs/slices/15-design.md` §§2-3 · AC-1, AC-2, AC-3, AC-10. Supersedes slice 10's
// hard-coded version (`R-09-12`) without changing its contract: `npm run --silent
// harness:seed` still prints `export`-shaped lines on stdout and nothing else, so `eval
// "$(npm run --silent harness:seed)"` remains the whole setup a clean checkout requires, and
// `tests/acceptance/harness.test.ts` (slice 10's, byte-unchanged — AC-9) still drives BOTH of
// its cURL scripts from this command's own stdout alone.
//
// WHAT CHANGED: the reference data now lives in `harness/fixture.json` (overridable by
// `HARNESS_FIXTURE=<path>`), read and validated here rather than hard-coded. Two subtrees are
// seeded from it — a SCARCE one at the empty export prefix (today's shape, reproduced by
// construction: whichever subtree declares `exportPrefix: ""` is the one that exports the five
// unprefixed names, independent of its position in the array) and an ABUNDANT one under
// `CAPACITY_`, which `harness/spurious-refusal.sh` demonstrates QS-3 against.
//
// A PLAIN `.mjs`, not a TypeScript source under `src/`: `tsconfig.build.json` excludes
// `tests/support/`, so this file cannot import it even if it wanted to, and there is no
// `dist/` step in the terminal path this script stands in for. It is therefore still a
// SECOND, independent transcription of arc42 §8.1's reference-data shape, in raw SQL, exactly
// as `tests/support/seed.ts` is one (ADR-0038) — every `INSERT` below names its columns
// literally, and ids/VINs/the seeded instant are minted here, never read from the fixture, so
// a renamed or dropped column still fails loudly with PostgreSQL's own `42703` rather than
// silently vanishing from a generated statement.
//
// Both subtrees are seeded FRESH on every invocation (random ids via `crypto.randomUUID()`).
// The suite's `db` project shares one Testcontainer across every file with no truncation
// (`tests/setup/postgres.ts`), and this script is invoked more than once against it — fresh,
// unrelated ids on every run are what keep two invocations from colliding on `vehicle.vin`'s
// global UNIQUE.
//
// NO printing pre-hook (`preharness:seed`, the `pre<script>` convention this repository
// otherwise uses, e.g. `pretest`): measured, npm's own pre-hook stdout would interleave with —
// and be `eval`'d alongside — this script's own `export` lines. Validation therefore lives
// INSIDE `main()`, not in a separate hook, and writes only to stderr.
//
// ATOMICITY, restated from the design's step-2 amendment (25d6dde): validating the fixture to
// completion before touching the database bounds the failures the validator MODELS — the six
// AC-3 cases below, each a structural or cross-reference defect the JSON alone can express.
// It does not bound the rest, so the nine-plus `INSERT`s per subtree run inside ONE
// transaction (`BEGIN` / `COMMIT`, `ROLLBACK` on any error) — a partial seed into a shared,
// never-truncated container is worse than none, and three of the validator's rules
// (`opening_hours.day_of_week BETWEEN 0 AND 6`, `closes_at > opens_at`, `duration_minutes >
// 0`) are deliberately left to PostgreSQL's own CHECK constraints at
// `src/persistence/migrations/0002_reference_data.sql:21,25,31` for exactly this reason — the
// transaction is what makes leaving them to the database safe. D-15-3: the `ROLLBACK` path
// itself has no fixture that reaches it (every input a fixture could supply that the validator
// does not already model is minted by this script, never read from JSON), so it is exercised
// by construction here and by nothing in `tests/acceptance/harness-fixture.test.ts` — booked,
// not asserted.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl === '') {
  console.error('harness/seed.mjs: DATABASE_URL is required.');
  process.exit(1);
}

/**
 * Tomorrow, 09:00Z (`R-10-7`) — rolled forward from whatever day this script actually runs on,
 * shared by EVERY subtree the fixture declares. Opening hours are seeded 08:00-18:00 for every
 * day of the week (below), so which day "tomorrow" lands on never matters, and 09:00Z leaves
 * two hours' headroom either side for `book-read-reschedule-cancel.sh`'s reschedule-offset
 * convention (`+2 hours`) to stay inside that window by construction.
 */
const startsAt = new Date();
startsAt.setUTCDate(startsAt.getUTCDate() + 1);
startsAt.setUTCHours(9, 0, 0, 0);
const STARTS_AT = startsAt.toISOString();

/** Seventeen uppercase hex characters — `vehicle.vin`'s shape, without I/O/Q (hex has none). */
function randomVin() {
  return randomBytes(9).toString('hex').toUpperCase().slice(0, 17);
}

function fail(message) {
  process.stderr.write(`harness/seed.mjs: ${message}\n`);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────── validation ──
//
// Hand-written, no new dependency: the harness's independence from `src/`'s stack is the
// point, and half of what follows is cross-reference (`qualifiedFor` naming a DECLARED service
// type, `owner` naming a customer in the SAME subtree, exactly one empty `exportPrefix`) that a
// JSON Schema could not express without a custom-keyword library — itself an undeclared
// dependency. Every function below returns `null` (valid) or a string naming the offending
// JSON path, and the first non-null result wins: `validateFixture` stops at the first defect
// rather than collecting every one, because AC-3 asserts only that SOME diagnosable path is
// named on stderr, not an exhaustive report.

const PREFIX_PATTERN = /^[A-Z][A-Z0-9_]*_$/;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Rejects any key not in `allowed` — a `qualifiedfor` typo seeds a silently unqualified
 * technician otherwise, the "subtly wrong world" this check exists to prevent. */
function unknownKeyError(path, obj, allowed) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) return `${path}: unknown key "${key}"`;
  }
  return null;
}

/** Every entry a non-empty string, and no two entries equal — `bays`/`customers` are plain
 * key arrays; `technicians[].key`/`vehicles[].key` are checked here too, pre-extracted. */
function duplicateStringError(path, list) {
  const seen = new Set();
  for (let i = 0; i < list.length; i += 1) {
    const key = list[i];
    if (typeof key !== 'string' || key === '') return `${path}[${i}]: must be a non-empty string`;
    if (seen.has(key)) return `${path}[${i}]: duplicate key "${key}"`;
    seen.add(key);
  }
  return null;
}

/** A non-empty, duplicate-free array of strings, each naming a key in `allowedKeys`. Used for
 * `subtree.serviceTypes` (references into the global catalogue) and, inline, `qualifiedFor`. */
function validateKeyList(path, list, allowedKeys, thingName) {
  if (!Array.isArray(list) || list.length === 0) return `${path}: must be a non-empty array`;
  const seen = new Set();
  for (let i = 0; i < list.length; i += 1) {
    const ref = list[i];
    if (typeof ref !== 'string' || !allowedKeys.has(ref)) {
      return `${path}[${i}]: "${String(ref)}" does not name a declared ${thingName}`;
    }
    if (seen.has(ref)) return `${path}[${i}]: duplicate ${thingName} reference "${ref}"`;
    seen.add(ref);
  }
  return null;
}

/** Returns the offending JSON path + reason, or `null` if `fixture` is valid. */
function validateFixture(fixture) {
  if (!isPlainObject(fixture)) return 'fixture: must be a JSON object';
  const topError = unknownKeyError('fixture', fixture, ['serviceTypes', 'subtrees']);
  if (topError !== null) return topError;

  const serviceTypes = fixture['serviceTypes'];
  if (!Array.isArray(serviceTypes) || serviceTypes.length === 0) {
    return 'fixture.serviceTypes: must be a non-empty array';
  }
  const globalServiceTypeKeys = new Set();
  for (let i = 0; i < serviceTypes.length; i += 1) {
    const serviceType = serviceTypes[i];
    const path = `fixture.serviceTypes[${i}]`;
    if (!isPlainObject(serviceType)) return `${path}: must be an object`;
    const err = unknownKeyError(path, serviceType, ['key', 'name', 'durationMinutes']);
    if (err !== null) return err;
    const key = serviceType['key'];
    if (typeof key !== 'string' || key === '') return `${path}.key: must be a non-empty string`;
    if (globalServiceTypeKeys.has(key)) return `${path}.key: duplicate key "${key}"`;
    globalServiceTypeKeys.add(key);
  }

  const subtrees = fixture['subtrees'];
  if (!Array.isArray(subtrees) || subtrees.length === 0) {
    return 'fixture.subtrees: must be a non-empty array';
  }

  let emptyPrefixCount = 0;
  const seenPrefixes = new Set();
  const seenSubtreeKeys = new Set();

  for (let i = 0; i < subtrees.length; i += 1) {
    const subtree = subtrees[i];
    const path = `fixture.subtrees[${i}]`;
    if (!isPlainObject(subtree)) return `${path}: must be an object`;
    const subtreeErr = unknownKeyError(path, subtree, [
      'key',
      'purpose',
      'exportPrefix',
      'timeZone',
      'openingHours',
      'serviceTypes',
      'bays',
      'technicians',
      'customers',
      'vehicles',
    ]);
    if (subtreeErr !== null) return subtreeErr;

    const subtreeKey = subtree['key'];
    if (typeof subtreeKey !== 'string' || subtreeKey === '') return `${path}.key: must be a non-empty string`;
    if (seenSubtreeKeys.has(subtreeKey)) return `${path}.key: duplicate subtree key "${subtreeKey}"`;
    seenSubtreeKeys.add(subtreeKey);

    const purpose = subtree['purpose'];
    if (typeof purpose !== 'string' || purpose.trim() === '') return `${path}.purpose: must be a non-empty string`;

    const exportPrefix = subtree['exportPrefix'];
    if (typeof exportPrefix !== 'string') return `${path}.exportPrefix: must be a string`;
    if (exportPrefix === '') {
      emptyPrefixCount += 1;
    } else {
      if (!PREFIX_PATTERN.test(exportPrefix)) {
        return `${path}.exportPrefix: "${exportPrefix}" must match ${String(PREFIX_PATTERN)}`;
      }
      if (seenPrefixes.has(exportPrefix)) return `${path}.exportPrefix: duplicate prefix "${exportPrefix}"`;
      seenPrefixes.add(exportPrefix);
    }

    const openingHours = subtree['openingHours'];
    if (!isPlainObject(openingHours)) return `${path}.openingHours: must be an object`;
    const ohErr = unknownKeyError(`${path}.openingHours`, openingHours, ['days', 'opensAt', 'closesAt']);
    if (ohErr !== null) return ohErr;
    if (!Array.isArray(openingHours['days']) || openingHours['days'].length === 0) {
      return `${path}.openingHours.days: must be a non-empty array`;
    }
    // `days` VALUES, `opensAt < closesAt` and `durationMinutes > 0` are deliberately left to
    // PostgreSQL's own CHECK constraints inside the transaction below (design §3's amended
    // ruling) — this validator shapes the object enough to attempt the INSERT, no further.

    const subtreeServiceTypesErr = validateKeyList(
      `${path}.serviceTypes`,
      subtree['serviceTypes'],
      globalServiceTypeKeys,
      'service type',
    );
    if (subtreeServiceTypesErr !== null) return subtreeServiceTypesErr;

    const bays = subtree['bays'];
    if (!Array.isArray(bays) || bays.length === 0) return `${path}.bays: must be a non-empty array`;
    const bayErr = duplicateStringError(`${path}.bays`, bays);
    if (bayErr !== null) return bayErr;

    const technicians = subtree['technicians'];
    if (!Array.isArray(technicians) || technicians.length === 0) {
      return `${path}.technicians: must be a non-empty array`;
    }
    const technicianKeys = [];
    for (let j = 0; j < technicians.length; j += 1) {
      const technician = technicians[j];
      const tpath = `${path}.technicians[${j}]`;
      if (!isPlainObject(technician)) return `${tpath}: must be an object`;
      const tErr = unknownKeyError(tpath, technician, ['key', 'qualifiedFor']);
      if (tErr !== null) return tErr;
      const technicianKey = technician['key'];
      if (typeof technicianKey !== 'string' || technicianKey === '') {
        return `${tpath}.key: must be a non-empty string`;
      }
      technicianKeys.push(technicianKey);
      const qualifiedForErr = validateKeyList(
        `${tpath}.qualifiedFor`,
        technician['qualifiedFor'],
        globalServiceTypeKeys,
        'service type',
      );
      if (qualifiedForErr !== null) return qualifiedForErr;
    }
    const technicianDupErr = duplicateStringError(`${path}.technicians[].key`, technicianKeys);
    if (technicianDupErr !== null) return technicianDupErr;

    const customers = subtree['customers'];
    if (!Array.isArray(customers) || customers.length === 0) {
      return `${path}.customers: must be a non-empty array`;
    }
    const customerErr = duplicateStringError(`${path}.customers`, customers);
    if (customerErr !== null) return customerErr;
    const customerKeySet = new Set(customers);

    const vehicles = subtree['vehicles'];
    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      return `${path}.vehicles: must be a non-empty array`;
    }
    const vehicleKeys = [];
    for (let j = 0; j < vehicles.length; j += 1) {
      const vehicle = vehicles[j];
      const vpath = `${path}.vehicles[${j}]`;
      if (!isPlainObject(vehicle)) return `${vpath}: must be an object`;
      const vErr = unknownKeyError(vpath, vehicle, ['key', 'owner']);
      if (vErr !== null) return vErr;
      const vehicleKey = vehicle['key'];
      if (typeof vehicleKey !== 'string' || vehicleKey === '') return `${vpath}.key: must be a non-empty string`;
      vehicleKeys.push(vehicleKey);
      const owner = vehicle['owner'];
      if (typeof owner !== 'string' || !customerKeySet.has(owner)) {
        return `${vpath}.owner: "${String(owner)}" does not name a customer in this subtree`;
      }
    }
    const vehicleDupErr = duplicateStringError(`${path}.vehicles[].key`, vehicleKeys);
    if (vehicleDupErr !== null) return vehicleDupErr;
  }

  if (emptyPrefixCount === 0) {
    return 'fixture.subtrees: exactly one subtree must declare exportPrefix: "" (none does)';
  }
  if (emptyPrefixCount > 1) {
    return 'fixture.subtrees: exactly one subtree must declare exportPrefix: "" (more than one does)';
  }

  return null;
}

// ───────────────────────────────────────────────────────────────────────────── export lines ──

/** `${prefix}${name}` for the first entry, `${prefix}${name}_2`, `_3`, … after — the ONE place
 * "first is the exported one" (design §3) turns a list into an env vocabulary. */
function pushIndexedExports(lines, prefix, name, ids) {
  ids.forEach((id, index) => {
    const suffix = index === 0 ? '' : `_${String(index + 1)}`;
    lines.push(`export ${prefix}${name}${suffix}="${id}"`);
  });
}

function exportLinesForSubtree(seeded) {
  const prefix = seeded.exportPrefix;
  const lines = [
    `export ${prefix}DEALERSHIP_ID="${seeded.dealershipId}"`,
    `export ${prefix}STARTS_AT="${STARTS_AT}"`,
    `export ${prefix}BAY_COUNT="${String(seeded.bayCount)}"`,
    `export ${prefix}QUALIFIED_TECHNICIAN_COUNT="${String(seeded.qualifiedTechnicianCount)}"`,
  ];
  pushIndexedExports(lines, prefix, 'SERVICE_TYPE_ID', seeded.serviceTypeIds);
  pushIndexedExports(lines, prefix, 'CUSTOMER_ID', seeded.customerIds);
  pushIndexedExports(lines, prefix, 'VEHICLE_ID', seeded.vehicleIds);
  return lines;
}

// ──────────────────────────────────────────────────────────────────────────────────── main ──

async function main() {
  const fixturePath = process.env.HARNESS_FIXTURE ?? fileURLToPath(new URL('./fixture.json', import.meta.url));

  let raw;
  try {
    raw = readFileSync(fixturePath, 'utf8');
  } catch (error) {
    return fail(`could not read fixture ${fixturePath}: ${String(error)}`);
  }

  let fixture;
  try {
    fixture = JSON.parse(raw);
  } catch (error) {
    return fail(`${fixturePath} is not valid JSON: ${String(error)}`);
  }

  const invalid = validateFixture(fixture);
  if (invalid !== null) {
    return fail(`${fixturePath}: ${invalid}`);
  }

  // Validation passed; nothing above touched the database. From here, every statement runs
  // inside one transaction (see this file's header) so a failure PostgreSQL catches instead of
  // the validator still leaves no row behind.
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');

    const globalServiceTypeIds = new Map();
    for (const serviceType of fixture.serviceTypes) {
      const id = randomUUID();
      globalServiceTypeIds.set(serviceType.key, id);
      await client.query('insert into service_type (id, name, duration_minutes) values ($1, $2, $3)', [
        id,
        serviceType.name,
        serviceType.durationMinutes,
      ]);
    }

    const seededSubtrees = [];
    for (const subtree of fixture.subtrees) {
      const dealershipId = randomUUID();
      await client.query('insert into dealership (id, name, time_zone) values ($1, $2, $3)', [
        dealershipId,
        `harness ${subtree.key}`,
        subtree.timeZone,
      ]);

      for (const dayOfWeek of subtree.openingHours.days) {
        await client.query(
          'insert into opening_hours (dealership_id, day_of_week, opens_at, closes_at) values ($1, $2, $3, $4)',
          [dealershipId, dayOfWeek, subtree.openingHours.opensAt, subtree.openingHours.closesAt],
        );
      }

      const bayIds = [];
      for (const bayKey of subtree.bays) {
        const bayId = randomUUID();
        bayIds.push(bayId);
        await client.query('insert into service_bay (id, dealership_id, name) values ($1, $2, $3)', [
          bayId,
          dealershipId,
          bayKey,
        ]);
      }

      const technicianIdByKey = new Map();
      for (const technician of subtree.technicians) {
        const technicianId = randomUUID();
        technicianIdByKey.set(technician.key, technicianId);
        await client.query('insert into technician (id, dealership_id, name) values ($1, $2, $3)', [
          technicianId,
          dealershipId,
          technician.key,
        ]);
        for (const qualifiedForKey of technician.qualifiedFor) {
          await client.query(
            'insert into technician_qualification (technician_id, service_type_id) values ($1, $2)',
            [technicianId, globalServiceTypeIds.get(qualifiedForKey)],
          );
        }
      }

      const customerIdByKey = new Map();
      for (const customerKey of subtree.customers) {
        const customerId = randomUUID();
        customerIdByKey.set(customerKey, customerId);
        await client.query('insert into customer (id, name) values ($1, $2)', [customerId, customerKey]);
      }

      const vehicleIds = [];
      for (const vehicle of subtree.vehicles) {
        const vehicleId = randomUUID();
        vehicleIds.push(vehicleId);
        await client.query(
          'insert into vehicle (id, customer_id, vin, description) values ($1, $2, $3, $4)',
          [vehicleId, customerIdByKey.get(vehicle.owner), randomVin(), `harness vehicle ${vehicle.key}`],
        );
      }

      const firstServiceTypeKey = subtree.serviceTypes[0];
      const qualifiedTechnicianCount = subtree.technicians.filter((technician) =>
        technician.qualifiedFor.includes(firstServiceTypeKey),
      ).length;

      seededSubtrees.push({
        exportPrefix: subtree.exportPrefix,
        dealershipId,
        bayCount: bayIds.length,
        qualifiedTechnicianCount,
        serviceTypeIds: subtree.serviceTypes.map((key) => globalServiceTypeIds.get(key)),
        customerIds: subtree.customers.map((key) => customerIdByKey.get(key)),
        vehicleIds,
      });
    }

    await client.query('COMMIT');

    const lines = seededSubtrees.flatMap((seeded) => exportLinesForSubtree(seeded));
    for (const line of lines) {
      console.log(line);
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
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
