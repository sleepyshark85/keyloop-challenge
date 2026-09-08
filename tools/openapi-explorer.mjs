#!/usr/bin/env node
/**
 * A BROWSABLE, TRY-IT-OUT PAGE FOR THE COMMITTED CONTRACT — development only.
 *
 *   npm run openapi:explorer            # then open http://localhost:3010
 *   PORT=4000 API=http://localhost:3000 npm run openapi:explorer
 *
 * ── Why this is a side tool and not a route on the service ──────────────────────────────
 *
 * `@fastify/swagger-ui` would serve this from the app itself and would be nicer to use. It
 * was not taken, for two reasons that are worth stating rather than discovering later:
 *
 *   1. AC-1 asserts each operation's `(status, type)` pairs BY EQUALITY, and slice 10's
 *      contract test asserts `EXPECTED_PAIRS`' key set equals the `(method, path)` set in
 *      the emitted document. A documentation route is a new path, so it would turn the
 *      contract suite red until §8.6's operations column and that map both learned about
 *      it — for a page that serves developers rather than the domain.
 *   2. It is an unauthenticated public route on a service whose entire security posture is
 *      ADR-0034's "authentication is out of scope BECAUSE THE CLIENT IS STUBBED". Adding a
 *      surface the brief did not ask for is a decision, not a convenience.
 *
 * So nothing under `src/` changes and the merged contract is untouched. This reads the same
 * `docs/api/openapi.json` that AC-7 diffs byte for byte, which means THE PAGE CANNOT DRIFT
 * FROM THE CONTRACT: if the document is stale, `npm run docs:openapi -- --check` fails in CI
 * and this renders the same stale thing rather than a prettier version of it.
 *
 * ── Why it proxies ─────────────────────────────────────────────────────────────────────
 *
 * The service registers no CORS handling (`@fastify/cors` is not a dependency), so a page
 * on any other origin can render the document but cannot exercise it — the browser blocks
 * the request before the service ever sees it. Rather than add CORS to the application for
 * a dev tool, this server IS the origin: it serves the page, serves the document with
 * `servers: [{ url: '/' }]`, and forwards every other path to the API. Same origin, no
 * preflight, and the service stays exactly as it shipped.
 *
 * The document's five paths — `/health`, `/appointments`, `/appointments/{id}`,
 * `/appointments/{id}/cancellation`, `/availability` — collide with neither route this
 * server owns (`/` and `/openapi.json`), so the split is unambiguous.
 */

import { createServer, request as httpRequest } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = Number(process.env.PORT ?? 3010);
const API = new URL(process.env.API ?? 'http://localhost:3000');
const DOC = resolve('docs/api/openapi.json');

/** The paths this server answers itself; everything else is the API's. */
const OWN = new Set(['/', '/index.html', '/openapi.json']);

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Keyloop Unified Service Scheduler — API explorer</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui.min.css">
<style>
  body { margin: 0; font-family: system-ui, sans-serif; }
  .banner { padding: .6rem 1rem; background: #1b1b1f; color: #e7e7ea; font-size: .85rem; line-height: 1.5; }
  .banner code { background: #2e2e35; padding: .1rem .35rem; border-radius: 3px; }
  .banner a { color: #8ab4f8; }
</style>
</head>
<body>
<div class="banner">
  Development explorer — serves <code>docs/api/openapi.json</code> and proxies requests to
  <code>${API.origin}</code>. Not part of the service: the app itself exposes no documentation route.
  Seed ids first with <code>npm run harness:seed</code>; re-seed before a scenario that needs a free slot.
</div>
<div id="ui"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-bundle.min.js"></script>
<script>
  window.ui = SwaggerUIBundle({
    url: '/openapi.json',
    dom_id: '#ui',
    deepLinking: true,
    tryItOutEnabled: true,
    displayRequestDuration: true,
  });
</script>
</body>
</html>
`;

/**
 * The document as served: identical to the committed file except that `servers` points at
 * THIS origin, so Try-it-out goes through the proxy below rather than cross-origin.
 * Nothing else is rewritten — a page that edited the contract to make itself work would be
 * showing you something other than what shipped.
 */
function documentFor() {
  const doc = JSON.parse(readFileSync(DOC, 'utf8'));
  return JSON.stringify({ ...doc, servers: [{ url: '/', description: 'via the explorer proxy' }] }, null, 2);
}

const send = (res, status, type, body) => {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
};

const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];

  if (OWN.has(path)) {
    if (path === '/openapi.json') {
      if (!existsSync(DOC)) {
        return send(res, 503, 'application/json',
          JSON.stringify({ error: 'docs/api/openapi.json is missing — run `npm run docs:openapi`.' }));
      }
      return send(res, 200, 'application/json', documentFor());
    }
    return send(res, 200, 'text/html; charset=utf-8', PAGE);
  }

  // Everything else belongs to the service. Headers pass through unchanged so the problem
  // documents arrive as `application/problem+json` — the thing slice 10 exists to make true
  // is the thing you should be able to see in the browser's network tab.
  const upstream = httpRequest(
    { hostname: API.hostname, port: API.port, path: req.url, method: req.method, headers: { ...req.headers, host: API.host } },
    (up) => { res.writeHead(up.statusCode ?? 502, up.headers); up.pipe(res); },
  );
  upstream.on('error', (err) => send(res, 502, 'application/json',
    JSON.stringify({ error: `cannot reach the service at ${API.origin}`, detail: err.message })));
  req.pipe(upstream);
});

// A dev tool that dies with an unhandled 'error' event and a Node stack trace has told you
// nothing. The failure that actually happens is a port already in use — 3001 was taken on the
// first machine this ran on — so name it, and name the way out.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`port ${PORT} is already in use. Pick another: PORT=4000 npm run openapi:explorer`);
    process.exit(2);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`explorer   http://localhost:${PORT}`);
  console.log(`document   ${DOC}`);
  console.log(`proxying   ${API.origin}`);
});
