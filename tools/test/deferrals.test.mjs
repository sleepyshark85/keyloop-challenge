#!/usr/bin/env node
/**
 * The A-05-5 enforcement chain: `deferred_to` on a deferral, `inherits:` on the receiving
 * slice, `slice:check` failing in both directions, and `docs:adr-check` refusing a
 * destination no tool can follow.
 *
 * WHY THESE CASES AND NOT OTHERS. The mechanism this enforces failed four times (R-05-2
 * twice, A-05-5, O-37) and every one of those failures had the same shape: something NAMED a
 * destination and nothing CHECKED it. A test suite for it that only asserted the happy path
 * would be the fifth instance — so every case here is written in the direction that can
 * fail, and the two that matter most are the ones where the check must NOT fire:
 *
 *   - a deferral ruled BEFORE the rule existed (the log is append-only; convicting history
 *     of breaking a later rule is how you get a project that rewrites its own record), and
 *   - an ADR naming a slice that is already `done`, which is a citation, not a routing.
 *
 * A guard that fires on those two would be worse than no guard, because the only way past it
 * is to falsify a record.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validate } from '../team-log/schema.mjs';
import { refsDeferredTo, deferralMap, destinations, isDestination } from '../lib/deferrals.mjs';
import { checkDestinations } from '../docs/adr-destinations.mjs';

const CHECK = fileURLToPath(new URL('../slice/check.mjs', import.meta.url));
let pass = 0; let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const AFTER = '2026-09-07T00:00:00.000Z';   // after the rule took effect
const BEFORE = '2026-09-01T00:00:00.000Z';  // before it existed
const ruled = (extra) => validate({
  ts: AFTER, event: 'finding.ruled', source: 'reported', slice: '06',
  actor: 'architect', ref: 'X-1', verdict: 'deferred', rationale: 'because', ...extra,
});

// ---------------------------------------------------------------- the schema rule --
console.log('\nschema — a deferral must say where it went');

ok('a deferral with no destination is rejected', !ruled({}).ok);
ok('the rejection explains the honest alternatives',
  /retro|backlog/.test(ruled({}).errors.join(' ')));
ok('a slice id is a destination', ruled({ deferred_to: '07' }).ok);
ok('a two-digit-plus-letter slice id is a destination', ruled({ deferred_to: '00a' }).ok);
ok('an array of destinations is accepted — F-02-9 is owed by two slices',
  ruled({ deferred_to: ['06', '07'] }).ok);
ok('"retro" is a destination — I-05-8 has no cheaper-or-stronger slice',
  ruled({ deferred_to: 'retro' }).ok);
ok('an arbitrary string is not a destination', !ruled({ deferred_to: 'later' }).ok);
ok('one bad entry in an array is caught', !ruled({ deferred_to: ['06', 'soon'] }).ok);

// THE CASE THAT MUST NOT FIRE. Eighteen rulings predate the rule.
ok('a deferral ruled before the rule existed is NOT convicted by it',
  ruled({ ts: BEFORE }).ok);

// A verdict that is not `deferred` routes nothing and is not asked to.
ok('an accepted verdict needs no destination',
  validate({ ts: AFTER, event: 'finding.ruled', source: 'reported', slice: '06',
    actor: 'architect', ref: 'X-2', verdict: 'accepted', rationale: 'r' }).ok);

console.log('\nschema — the historical backfill carries the same vocabulary');
const routedEvent = (extra) => validate({
  ts: AFTER, event: 'finding.routed', source: 'reported', slice: '05', actor: 'orchestrator',
  ref: 'F-05-1', deferred_to: '06', quote: 'ROUTED: F-05-1 to slice 06', rationale: 'backfill',
  ...extra,
});
ok('a routing is a valid record', routedEvent({}).ok);
ok('a routing without a quote is refused — the claim is about what a ruling SAYS',
  !routedEvent({ quote: undefined }).ok);
ok('a routing cannot invent a destination vocabulary',
  !routedEvent({ deferred_to: 'somewhere' }).ok);

// ------------------------------------------------------------------- resolution --
console.log('\nresolution — who owes what');
const log = [
  { event: 'finding.ruled', verdict: 'deferred', ref: 'A', deferred_to: ['06', '07'], slice: '02', ts: AFTER },
  { event: 'finding.routed', ref: 'B', deferred_to: '06', slice: '05', ts: AFTER },
  { event: 'finding.ruled', verdict: 'deferred', ref: 'C', deferred_to: 'retro', slice: '05', ts: AFTER },
  { event: 'finding.ruled', verdict: 'accepted', ref: 'D', slice: '05', ts: AFTER },
];
ok('both destinations of a two-slice deferral are owed',
  JSON.stringify(refsDeferredTo(log, '06')) === '["A","B"]'
  && JSON.stringify(refsDeferredTo(log, '07')) === '["A"]');
ok('a non-slice destination binds no slice', refsDeferredTo(log, '05').length === 0);
ok('an unpadded id resolves — "6" and "06" are the same slice',
  refsDeferredTo(log, '6').length === 2);
ok('a ruling outranks a routing for the same ref',
  deferralMap([...log,
    { event: 'finding.routed', ref: 'A', deferred_to: '09', slice: '05', ts: BEFORE },
  ]).get('A').via === 'ruled');
ok('destinations() reads a bare string as one', destinations('06').length === 1);
ok('isDestination rejects a near-miss slice id', !isDestination('6') && isDestination('06'));

// ------------------------------------------------------------------ slice:check --
console.log('\nslice:check — READY admits the debt, DONE discharges it');

// `check.mjs` writes ANSI directly and honours no NO_COLOR, so the verdict and its label are
// separated by escape sequences in the raw output. Stripping them is not cosmetic: matching
// /PASS\s+inherited/ against the coloured stream silently never matches, which would make
// every assertion below vacuous — the failure mode this whole suite is about.
const strip = (t) => t.replace(/\u001b\[[0-9;]*m/g, '');
const run = (args) => strip(spawnSync(process.execPath, [CHECK, ...args], { encoding: 'utf8' }).stdout);

const real = run(['06']);
ok('READY reports the inherited obligations it found',
  /inherited obligations declared/.test(real), real.slice(0, 200));
ok('DONE reports whether they were discharged',
  /inherited obligations discharged/.test(real));
ok('slice 06 declares every ref deferred to it',
  /PASS\s+inherited obligations declared/.test(real), real);
ok('slice 06 has not discharged them yet, and the check says so',
  /FAIL\s+inherited obligations discharged/.test(real));

// ------------------------------------------------------------- adr destinations --
console.log('\ndocs:adr-check — a destination must be real and recorded elsewhere');

const adrWorld = (decision, sliceFiles) => {
  const dir = mkdtempSync(join(tmpdir(), 'adrdest-'));
  mkdirSync(join(dir, 'adr'), { recursive: true });
  mkdirSync(join(dir, 'slices'), { recursive: true });
  writeFileSync(join(dir, 'adr', '0001-a.md'),
    `---\nid: "0001"\n---\n\n## Context\n\nSlice 99 is mentioned here and must be ignored.\n\n`
    + `## Decision\n\n${decision}\n\n## Consequences\n\nnone\n`);
  for (const [f, body] of Object.entries(sliceFiles)) writeFileSync(join(dir, 'slices', f), body);
  return dir;
};
const live = (id, status) => `---\nid: "${id}"\nstatus: ${status}\n---\n\nbody\n`;
const tomb = (into) => `---\nfolded_into: "${into}"\n---\n\nbody\n`;
const deferralTo = (id) => [{ event: 'finding.ruled', verdict: 'deferred', ref: 'A', deferred_to: id, slice: '02', ts: AFTER }];

let d = adrWorld('The handler lands at slice 06.', { '06-x.md': live('06', 'ready') });
ok('an ADR routing to a live slice with no deferral logged is refused',
  checkDestinations(join(d, 'adr'), join(d, 'slices'), []).some((p) => p.kind === 'destination-unrecorded'));
ok('...and passes once the log records the routing',
  checkDestinations(join(d, 'adr'), join(d, 'slices'), deferralTo('06')).length === 0);

d = adrWorld('This was settled at slice 02.', { '02-x.md': live('02', 'done') });
ok('an ADR citing a DONE slice is history, not a routing',
  checkDestinations(join(d, 'adr'), join(d, 'slices'), []).length === 0);

d = adrWorld('It is added at slice 10.',
  { '10-x.md': tomb('09'), '09-x.md': live('09', 'ready') });
ok('a fold is followed rather than failed — §4 forbids editing an accepted ADR',
  checkDestinations(join(d, 'adr'), join(d, 'slices'), deferralTo('09')).length === 0);
ok('...and the successor is the slice actually checked',
  checkDestinations(join(d, 'adr'), join(d, 'slices'), deferralTo('10'))
    .some((p) => /slice 09/.test(p.detail)));

d = adrWorld('It is added at slice 10.', { '10-x.md': tomb('88') });
ok('a redirect that leads nowhere is still a failure',
  checkDestinations(join(d, 'adr'), join(d, 'slices'), []).some((p) => p.kind === 'destination-unknown'));

d = adrWorld('It is added at slice 77.', {});
ok('a slice id that was never real is a failure — the OQ-05-2 defect',
  checkDestinations(join(d, 'adr'), join(d, 'slices'), []).some((p) => p.kind === 'destination-unknown'));

d = adrWorld('It is added at slice 10.', { '10-x.md': tomb('11'), '11-x.md': tomb('10') });
ok('a fold cycle resolves nowhere rather than hanging',
  checkDestinations(join(d, 'adr'), join(d, 'slices'), []).some((p) => p.kind === 'destination-unknown'));

d = adrWorld('nothing here', { '99-x.md': live('99', 'ready') });
ok('a slice named only in Context is not a destination',
  checkDestinations(join(d, 'adr'), join(d, 'slices'), []).length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
