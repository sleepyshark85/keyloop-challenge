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
import { readFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validate, normalize, serialize } from './schema.mjs';
import { frontmatter } from '../lib/frontmatter.mjs';
import { destinations, isSliceId, sliceIndex, resolveSlice } from '../lib/deferrals.mjs';

export const LOG_PATH = () => resolve(process.env.TEAM_LOG ?? 'docs/team-log/events.jsonl');
export const SLICE_DIR = () => resolve(process.env.SLICE_DIR ?? 'docs/slices');

/**
 * A DESTINATION MUST RESOLVE TO A SLICE THAT STILL EXISTS.
 *
 * The schema can say `deferred_to` is SHAPED like a slice id; only the filesystem can say
 * the slice is real and was not folded into another at Gate D. This project has now routed
 * work to the tombstoned slice 10 twice — OQ-05-2, which is the origin of R-05-2, and then
 * A-06-2 at slice 06's own adjudication, in the same run that ruled a design finding must
 * also be a logged finding. Both times the reasoning was right and the label was stale.
 *
 * It runs on the WRITE PATH deliberately. `tools/team-log/check.mjs` carries the docblock
 * about what this project already learned: a guard that only fires after the push costs a
 * round trip every time, and the round trip is the whole of its cost. A ruling naming a dead
 * slice is refused here, before it is a record anyone has to un-say.
 *
 * A fold is FOLLOWED, not failed — that is what `folded_into` is for — but the record must
 * then name the surviving slice, because `inherits:` is declared on the slice that does the
 * work and nothing declares it on a tombstone.
 */
export function checkDestinations(record, sliceDir = SLICE_DIR()) {
  const to = destinations(record.deferred_to).filter(isSliceId);
  if (!to.length) return [];
  const index = sliceIndex(sliceDir, { readFileSync, readdirSync, existsSync }, frontmatter);
  if (!index.size) return [];   // no slice directory to check against; say nothing rather than guess
  const errors = [];
  for (const id of to) {
    const r = resolveSlice(index, id);
    if (!r.ok) {
      errors.push(`deferred_to names slice ${id}, which cannot be resolved — ${r.reason}`);
    } else if (r.resolved !== id) {
      errors.push(
        `deferred_to names slice ${id}, folded into ${r.resolved} (${r.slice.file}). `
        + `Name ${r.resolved}: \`inherits:\` is declared by the slice that does the work, and `
        + 'nothing declares it on a tombstone. The reasoning is probably right and only the '
        + 'label is stale, which is what this has been every time.',
      );
    }
  }
  return errors;
}

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
    const destErrors = checkDestinations(record);
    if (!ok || destErrors.length) {
      throw new Error(`event[${i}] rejected:\n  - ${[...errors, ...destErrors].join('\n  - ')}`);
    }
    accepted.push(record);
  }

  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, accepted.map(serialize).join('\n') + '\n', 'utf8');
  return accepted;
}
