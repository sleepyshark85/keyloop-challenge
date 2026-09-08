#!/usr/bin/env node
/**
 * `T-09-1` / ADR-0005 — the OpenAPI document, generated from `buildOpenApiDocument()`
 * (`src/http/server.ts`), never hand-authored.
 *
 *   npm run docs:openapi              # writes docs/api/openapi.json
 *   npm run docs:openapi -- --check   # AC-7: exit 0 iff the committed file matches byte for byte
 *
 * `tests/contract/openapi-document.test.ts` (AC-7) assumes this exact flag shape — the
 * `docs:check`/`defects:check`/`docs:budget:check` convention this repository already uses for
 * "report drift, write nothing, exit non-zero".
 *
 * Imports the COMPILED artifact (`dist/http/server.js`), ADR-0013's own convention: the built
 * artifact is what deploys and what `npm run build` (this script's own `pretest`/`predocs:openapi`
 * step) already produces, so no TypeScript loader is added for one script.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');

const REPO_ROOT = process.cwd();
const ENTRY = resolve(REPO_ROOT, 'dist/http/server.js');
const DOCUMENT_PATH = resolve(REPO_ROOT, 'docs/api/openapi.json');

if (!existsSync(ENTRY)) {
  console.error(`${ENTRY} does not exist. Run \`npm run build\` first (T-09-1).`);
  process.exit(1);
}

/** @type {{ buildOpenApiDocument: () => Promise<object> }} */
const { buildOpenApiDocument } = await import(pathToFileURL(ENTRY).href);
const document = await buildOpenApiDocument();
// Trailing newline: git's own convention for a text file, and what keeps `--check` a true
// byte-for-byte comparison rather than one that always disagrees on EOF.
const rendered = `${JSON.stringify(document, null, 2)}\n`;

if (CHECK) {
  if (!existsSync(DOCUMENT_PATH)) {
    console.error(`${DOCUMENT_PATH} does not exist. Run \`npm run docs:openapi\` and commit it.`);
    process.exit(1);
  }
  const committed = readFileSync(DOCUMENT_PATH, 'utf8');
  if (committed !== rendered) {
    console.error(
      `${DOCUMENT_PATH} does not match buildOpenApiDocument(). Run \`npm run docs:openapi\` and commit the result.`,
    );
    process.exit(1);
  }
  console.log(`${DOCUMENT_PATH} matches buildOpenApiDocument() byte for byte.`);
  process.exit(0);
}

writeFileSync(DOCUMENT_PATH, rendered);
console.log(`wrote ${DOCUMENT_PATH}`);
