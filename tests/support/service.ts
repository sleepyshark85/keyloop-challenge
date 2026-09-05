import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The acceptance harness — test-engineer's, slice 00a red commit
 * (docs/slices/00a-design.md §4 "Directory ownership", §7, §11.3).
 *
 * It spawns the COMPILED artifact, `node dist/main.js`. There is no TypeScript loader in
 * this project: `tsx` is named in no ADR, and Node's --experimental-strip-types does not
 * remap `./x.js` specifiers onto `x.ts`, which is how every import here is written. So the
 * acceptance tests drive the artifact a deployment would actually run, which is a better
 * answer to AC-2 than a loader can give — a loader-only project has never proved it emits.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS NEVER THROWS
 *
 * `CLAUDE.md` §2.4 wants the red observed, and process criterion C1 distinguishes "a real
 * assertion failure" from "a missing import". At the red commit there is no `dist/main.js`
 * and no `src/` — so if this helper threw at module load, or from a `beforeAll`, the Vitest
 * JSON would carry a collection error and the observation would prove nothing about the
 * acceptance criteria.
 *
 * Instead every failure is returned as a `failure` STRING naming what was tried: the exact
 * argv, the cwd, the port, the DATABASE_URL, the child's exit status, and whatever it wrote
 * to stdout/stderr. The test asserts on that value inside its own body, so the artifact
 * shows a failed assertion in a collected file.
 *
 * This file may not import src/ — `outside-in-tests-do-not-import-src` covers tests/support/
 * exactly so a shared helper cannot hand an implementation detail to a test that may not
 * see one. It reaches the service the way a client does: over HTTP, on a port.
 */

/** How long to wait for `GET /health` to answer at all before giving up. */
const READY_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 100;

/** The compiled entrypoint. `npm run build` (implementer, green commit) produces it. */
export const ENTRYPOINT = 'dist/main.js';

/**
 * A DATABASE_URL that is well-formed and certain not to answer. Port 1 is reserved and
 * nothing listens on it, so `connect()` fails immediately with ECONNREFUSED rather than
 * hanging — AC-2's second case needs the 503 to be produced by a bounded failure, not by a
 * test timeout.
 */
export const UNREACHABLE_DATABASE_URL =
  'postgresql://keyloop:keyloop@127.0.0.1:1/keyloop_unreachable';

export interface StartedService {
  readonly baseUrl: string;
  readonly port: number;
  stop(): Promise<void>;
  /**
   * Everything the child has written so far, verbatim. Slice 02, I-02-6.
   *
   * AC-3 and AC-4 require the test to observe THE NAME OF THE CONSTRAINT PostgreSQL
   * reported, and an outside-in test can observe exactly three things: the HTTP response,
   * the database, and the process's stdout. The constraint name is in neither of the first
   * two — ADR-0016 Option D deliberately declines to carry it on `BookOutcome`, and the
   * problem schema has no member for it — so `docs/slices/02-design.md` §2.6 puts one
   * structured `pino` line per `23P01` on stdout and this is how the harness reads it.
   *
   * The alternative the implementer rejected at step 2, recorded here so it is not
   * reintroduced: having the test reproduce the conflict with its OWN SQL lets it choose
   * the probe row's bay, so it can make either constraint appear at will — the assertion
   * goes vacuous while staying green.
   */
  output(): { readonly stdout: string; readonly stderr: string };
  /**
   * stdout parsed as `pino` NDJSON, one object per line. Lines that are not JSON are
   * skipped rather than thrown on — a crash banner on stdout must not turn an assertion
   * failure into an exception (see WHY THIS NEVER THROWS, above).
   */
  logRecords(): readonly Record<string, unknown>[];
  /**
   * Poll `logRecords()` until `predicate` holds or the bound elapses, then return whatever
   * was there. NEVER throws and never rejects: a timeout returns the records collected so
   * far so the test asserts on them and reports what it actually saw.
   *
   * It exists because a child's stdout reaches the parent asynchronously: a booking that
   * has already answered `409` on the socket may not yet have had its conflict line
   * delivered to this process.
   */
  awaitLogRecords(
    predicate: (records: readonly Record<string, unknown>[]) => boolean,
    timeoutMs?: number,
  ): Promise<readonly Record<string, unknown>[]>;
}

export interface StartAttempt {
  /** Present iff the service answered on its port. */
  readonly service?: StartedService;
  /** Present iff it did not. A multi-line diagnosis naming everything that was tried. */
  readonly failure?: string;
}

/** Ask the OS for a port nothing is listening on, then release it. */
async function freePort(): Promise<number> {
  return await new Promise((resolvePort, rejectPort) => {
    const probe = createServer();
    probe.on('error', rejectPort);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        probe.close(() => rejectPort(new Error('could not determine a free port')));
        return;
      }
      const { port } = address;
      probe.close(() => resolvePort(port));
    });
  });
}

/**
 * Start the service and wait, with a bound, for `GET /health` to answer.
 *
 * Never throws and never rejects: on any failure it resolves with `failure` set.
 */
export async function startService(options: {
  databaseUrl: string;
  logLevel?: string;
}): Promise<StartAttempt> {
  const cwd = process.cwd();
  const entrypoint = resolve(cwd, ENTRYPOINT);
  const port = await freePort();
  const argv = ['node', ENTRYPOINT];

  const attempted = [
    `  command      ${argv.join(' ')}`,
    `  cwd          ${cwd}`,
    `  PORT         ${port}`,
    `  DATABASE_URL ${options.databaseUrl}`,
    `  entrypoint   ${entrypoint} (${existsSync(entrypoint) ? 'exists' : 'DOES NOT EXIST'})`,
  ].join('\n');

  // The type is the one the `stdio: ['ignore', 'pipe', 'pipe']` overload of `spawn`
  // actually returns: stdin is ignored, so it is `null`, and only stdout and stderr are
  // streams. It is written out rather than asserted so that changing the tuple below is a
  // compile error here instead of a lie the compiler was told to believe.
  let child: ChildProcessByStdio<null, Readable, Readable>;
  try {
    child = spawn(argv[0] as string, argv.slice(1), {
      cwd,
      env: {
        ...process.env,
        DATABASE_URL: options.databaseUrl,
        PORT: String(port),
        LOG_LEVEL: options.logLevel ?? 'silent',
        NODE_ENV: 'test',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    return {
      failure:
        `the service could not be spawned.\n${attempted}\n  spawn error  ${String(error)}`,
    };
  }

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });

  let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  child.on('exit', (code, signal) => {
    exit = { code, signal };
  });
  // A spawn of a non-existent binary emits 'error' asynchronously; without a listener it
  // becomes an unhandled exception and takes the worker down instead of failing the test.
  let spawnError: Error | undefined;
  child.on('error', (error) => {
    spawnError = error;
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  const output = (): { readonly stdout: string; readonly stderr: string } => ({ stdout, stderr });

  const logRecords = (): readonly Record<string, unknown>[] => {
    const records: Record<string, unknown>[] = [];
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '' || !trimmed.startsWith('{')) continue;
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          records.push(parsed as Record<string, unknown>);
        }
      } catch {
        // Not a JSON line. Skipped on purpose — `output()` still carries it verbatim, so a
        // test that wanted it can assert on the raw text.
      }
    }
    return records;
  };

  const awaitLogRecords = async (
    predicate: (records: readonly Record<string, unknown>[]) => boolean,
    timeoutMs = 5_000,
  ): Promise<readonly Record<string, unknown>[]> => {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const records = logRecords();
      let satisfied = false;
      try {
        satisfied = predicate(records);
      } catch {
        // A predicate that throws is treated as "not yet satisfied": the test's own
        // assertion, not this helper, is what must report the failure.
        satisfied = false;
      }
      if (satisfied || Date.now() >= until) return records;
      await new Promise((tick) => setTimeout(tick, 25));
    }
  };

  const stop = async (): Promise<void> => {
    if (exit !== undefined) return;
    child.kill('SIGTERM');
    await new Promise<void>((done) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        done();
      }, 5_000);
      child.once('exit', () => {
        clearTimeout(timer);
        done();
      });
    });
  };

  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    if (exit !== undefined || spawnError !== undefined) {
      return {
        failure: [
          'the service exited before it answered on its port.',
          attempted,
          `  exit         code=${String(exit?.code)} signal=${String(exit?.signal)}`,
          spawnError === undefined ? undefined : `  spawn error  ${spawnError.message}`,
          `  stdout       ${stdout.trim() === '' ? '(empty)' : `\n${indent(stdout)}`}`,
          `  stderr       ${stderr.trim() === '' ? '(empty)' : `\n${indent(stderr)}`}`,
        ]
          .filter((line): line is string => line !== undefined)
          .join('\n'),
      };
    }

    try {
      await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2_000) });
      return { service: { baseUrl, port, stop, output, logRecords, awaitLogRecords } };
    } catch {
      // Not listening yet. Fall through to the bound.
    }

    if (Date.now() >= deadline) {
      await stop();
      return {
        failure: [
          `the service did not answer GET ${baseUrl}/health within ${READY_TIMEOUT_MS} ms.`,
          attempted,
          `  stdout       ${stdout.trim() === '' ? '(empty)' : `\n${indent(stdout)}`}`,
          `  stderr       ${stderr.trim() === '' ? '(empty)' : `\n${indent(stderr)}`}`,
        ].join('\n'),
      };
    }

    await new Promise((tick) => setTimeout(tick, POLL_INTERVAL_MS));
  }
}

function indent(text: string): string {
  return text
    .trimEnd()
    .split('\n')
    .map((line) => `               ${line}`)
    .join('\n');
}
