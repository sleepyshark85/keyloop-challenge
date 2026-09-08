/**
 * The composition root — the only module that sees every layer, and the only one permitted
 * to hold a `Db` value and a Fastify instance at the same time.
 *
 * Read top to bottom it is the whole architecture in eight lines: config, logger, database
 * handle, use cases bound to that handle, server, listen. Everything below it is arranged
 * so that no other file can do this.
 *
 * Two things here are load-bearing rather than boilerplate.
 *
 * NOTHING VERIFIES CONNECTIVITY AT STARTUP. `pg.Pool` is lazy and stays lazy: a service
 * pointed at a dead database must still START, or AC-2's 503 case would be asserting
 * against a process that had already exited. Configuration fails fast; connectivity is
 * only ever probed by `GET /health` (design §3).
 *
 * SIGTERM AND SIGINT CLOSE THE POOL. The acceptance harness spawns and kills this process
 * repeatedly, and a process that leaks a pool on signal turns one unrelated test failure
 * into a hung suite.
 *
 * THE SDK STARTS BEFORE ANYTHING THAT COULD EMIT A SPAN, AND STOPS ON THE SAME SIGNALS THE POOL
 * DOES. `docs/slices/09-design.md` decision 1: `src/main.ts` is the only module besides
 * `src/platform` the `otel-sdk-only-in-platform` rule permits to see `NodeSDK` — the composition
 * root starts it and shuts it down, never anything in between. `NodeSDK#shutdown()` flushes the
 * batch span processor and the periodic metric reader before it resolves
 * (`tests/support/otelCollector.ts`'s own measured header), which is why it runs ALONGSIDE
 * `closeDb`, on the same signals, rather than being left to the process's exit.
 */
import { bookAppointment } from './application/bookAppointment.js';
import { cancelAppointment } from './application/cancelAppointment.js';
import { checkHealth } from './application/checkHealth.js';
import { queryAvailability } from './application/queryAvailability.js';
import { readAppointment } from './application/readAppointment.js';
import { rescheduleAppointment } from './application/rescheduleAppointment.js';
import { buildServer } from './http/server.js';
import { closeDb, createDb } from './persistence/db.js';
import { ConfigError, configWarnings, loadConfig } from './platform/config.js';
import { createLogger } from './platform/logger.js';
import { startTelemetry } from './platform/telemetry.js';

function loadConfigOrExit(): ReturnType<typeof loadConfig> {
  try {
    return loadConfig(process.env);
  } catch (error) {
    // Before this point there is no logger, and a stack trace is the wrong thing to hand
    // someone whose PORT is a typo. arc42 §7.3: fail the process, name the variable.
    process.stderr.write(
      `${error instanceof ConfigError ? error.message : String(error)}\n` +
        'See arc42 §7.3 for the environment variables this service reads.\n',
    );
    process.exit(1);
  }
}

const config = loadConfigOrExit();
// Before the logger and before the db handle: both can emit a span (the logger reads the active
// one; the first query the pool ever runs is inside one), and starting the SDK after either
// existed would risk a span or a log line the SDK's global providers were not yet registered for.
const telemetry = startTelemetry();
const logger = createLogger(config);
// ADR-0021's announcement, at the first moment there is anything to announce it with. The
// wording lives beside the field in `config.ts`; emitting it is the composition root's job.
for (const warning of configWarnings(config)) logger.warn({ event: 'config.warning' }, warning);
const db = createDb(config, { logger });
// PARTIAL APPLICATION, per 00a's shape: `buildServer` receives already-bound use cases and never
// the handle, because `http-must-not-reach-persistence` forbids the edge from even NAMING the
// handle's type. `crypto` is a Node global, so injecting `newId` gives `src/application` no
// import and leaves `no-dev-dep-in-src` and the layering rules untouched (DA-02-1).
const bookDeps = {
  newId: (): string => crypto.randomUUID(),
  // ADR-0009's seed, drawn per request from the GLOBAL `crypto` for the same reason `newId`
  // takes it (I-04-8): `node:crypto`'s `randomInt` would be an import in a file that composes
  // every layer, and the global costs nothing. `?? 0` is `noUncheckedIndexedAccess` on a
  // one-element array — `getRandomValues` fills it or throws, so the fallback is unreachable and
  // a zero seed would be a perfectly ordinary seed anyway.
  // ADR-0021: `BOOKING_SEED`, when set, IS the seed for every request. Unset — the default and
  // the only production setting — each request draws its own.
  seed: (): number => config.bookingSeed ?? crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
  attemptCap: config.attemptCap,
  logger,
};
const app = buildServer({
  logger,
  checkHealth: async () => checkHealth(db),
  bookAppointment: async (command) => bookAppointment(db, bookDeps, command),
  readAppointment: async (id) => readAppointment(db, id),
  // Slice 05. EXCLUDED FROM MUTATION with the rest of this file (`stryker.config.mjs`), so it is
  // worth saying what does guard it: ADR-0013 spawns `dist/main.js`, so an unwired route 404s and
  // AC-1, AC-3 and AC-4 all fail at their arrange step. That is a real guard, and it is the only
  // one — the score cannot tell this line from `main.ts:46`, which had none.
  cancelAppointment: async (id) => cancelAppointment(db, id),
  // Slice 06. The SAME seed and attempt-cap policy booking uses (ADR-0009), and the same
  // reasoning for why both are drawn/read here rather than in the use case (I-04-8).
  rescheduleAppointment: async (command) =>
    rescheduleAppointment(db, { seed: bookDeps.seed, attemptCap: bookDeps.attemptCap, logger }, command),
  // Slice 08. Advisory only — no locks, no lookahead, nothing shared with the booking path
  // beyond the same `db` handle every use case above already takes.
  queryAvailability: async (query) => queryAvailability(db, query),
});

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'shutting down');
  try {
    await app.close();
    await closeDb(db);
    await telemetry.shutdown();
  } catch (error) {
    logger.error({ err: error }, 'shutdown did not complete cleanly');
    process.exit(1);
  }
  process.exit(0);
}

process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
} catch (error) {
  logger.error({ err: error }, 'the server could not listen');
  await closeDb(db);
  await telemetry.shutdown();
  process.exit(1);
}
