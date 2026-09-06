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
 */
import { bookAppointment } from './application/bookAppointment.js';
import { checkHealth } from './application/checkHealth.js';
import { readAppointment } from './application/readAppointment.js';
import { buildServer } from './http/server.js';
import { closeDb, createDb } from './persistence/db.js';
import { ConfigError, DEFAULT_ATTEMPT_CAP, loadConfig } from './platform/config.js';
import { createLogger } from './platform/logger.js';

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
const logger = createLogger(config);
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
  seed: (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
  attemptCap: DEFAULT_ATTEMPT_CAP,
  logger,
};
const app = buildServer({
  logger,
  checkHealth: async () => checkHealth(db),
  bookAppointment: async (command) => bookAppointment(db, bookDeps, command),
  readAppointment: async (id) => readAppointment(db, id),
});

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'shutting down');
  try {
    await app.close();
    await closeDb(db);
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
  process.exit(1);
}
