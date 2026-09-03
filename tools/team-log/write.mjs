/**
 * The single write path into the event log.
 *
 * `derived` is the trust tier that claims a fact came from tooling and therefore
 * could not have been fabricated. That claim is worthless if anything can simply
 * assert it — so this module refuses `source: "derived"` unless the caller is a
 * collector that computed the fact itself.
 *
 * Collectors import `appendRecords(..., { allowDerived: true })`. The CLI
 * (append.mjs), which is what the orchestrator uses, does not pass that flag —
 * so the orchestrator can record what it observed, but cannot dress an
 * observation up as a measurement.
 */
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validate, normalize, serialize } from './schema.mjs';

export const LOG_PATH = () => resolve(process.env.TEAM_LOG ?? 'docs/team-log/events.jsonl');

export function loadLog(path = LOG_PATH()) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean)
    .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

/**
 * Validate and append. Throws on the first invalid record and writes nothing —
 * partial writes would leave the log in a state no one had checked.
 */
export function appendRecords(input, { allowDerived = false, path = LOG_PATH() } = {}) {
  const events = Array.isArray(input) ? input : [input];
  const prior = loadLog(path);
  const accepted = [];

  for (const [i, e] of events.entries()) {
    const record = normalize(e, [...prior, ...accepted]);

    if (record.source === 'derived' && !allowDerived) {
      throw new Error(
        `event[${i}] claims source "derived", which asserts the fact came from tooling and ` +
        'could not have been fabricated. That tier is reserved for collectors that compute ' +
        'the fact themselves (tools/team-log/collect-*.mjs). Use "reported" for something an ' +
        'agent told you, or "narrated" for your own account.',
      );
    }

    const { ok, errors } = validate(record);
    if (!ok) {
      throw new Error(`event[${i}] rejected:\n  - ${errors.join('\n  - ')}`);
    }
    accepted.push(record);
  }

  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, accepted.map(serialize).join('\n') + '\n', 'utf8');
  return accepted;
}
