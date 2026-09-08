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
import { checkDestinations as checkAdrDestinations } from '../docs/adr-destinations.mjs';
import { checkDestinations } from '../team-log/write.mjs';

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

// COUPLED TO FIXTURES, NOT TO THE LIVE PROJECT — and this suite learned that the hard way.
//
// Two assertions here used to read the real slice 06: that it declared every ref deferred to
// it, and that it had NOT yet discharged them. The second was true when written and FALSE
// four hours later, the moment the architect ruled the four inherited obligations — so a
// correct advance of the project turned CI red on a docs-only commit.
//
// A test that asserts a transient project state is not testing the tool; it is pinning the
// calendar. What must be verified is that the CHECK reports the two conditions, which the
// fixtures above already do in both directions. All that is kept from the live run is that
// the two criteria appear at all, which is a property of the tool and cannot go stale.
const real = run(['06']);
ok('READY reports the inherited obligations it found',
  /inherited obligations declared/.test(real), real.slice(0, 200));
ok('DONE reports whether they were discharged',
  /inherited obligations discharged/.test(real));

// --------------------------------------------- inherited scope traceable (O-41) --
console.log('\ninherited scope — the subset guard becomes bidirectional');
{
  const world = (inherits, body, design) => {
    const dir = mkdtempSync(join(tmpdir(), 'trace-'));
    mkdirSync(join(dir, 'docs', 'slices'), { recursive: true });
    if (design) writeFileSync(join(dir, 'docs', 'slices', '05-design.md'), design);
    writeFileSync(join(dir, 'docs', 'slices', '06-x.md'),
      `---\nid: "06"\nstatus: ready\narc42: ["§6.3"]\nquality_scenarios: [QS-6]\n`
      + `inherits: [${inherits.map((r) => `"${r}"`).join(', ')}]\n---\n\n`
      + '- **AC-1** — a thing.\n\n## Inherited scope\n\n' + body + '\n');
    writeFileSync(join(dir, 'log.jsonl'), JSON.stringify({
      ts: AFTER, event: 'finding.raised', source: 'reported', slice: '02', actor: 'architect',
      ref: 'F-02-9', severity: 'MAJOR', step: 1, claim: 'c', scenario: 's',
    }) + '\n' + JSON.stringify({
      ts: AFTER, event: 'finding.ruled', source: 'reported', slice: '02', actor: 'architect',
      ref: 'F-02-9', verdict: 'deferred', deferred_to: ['06'], rationale: 'r',
    }) + '\n');
    const r = spawnSync(process.execPath, [CHECK, '06', '--ready'],
      { encoding: 'utf8', cwd: dir, env: { ...process.env, TEAM_LOG: join(dir, 'log.jsonl') } });
    return strip(r.stdout);
  };
  const line = (out) => (out.split('\n').find((l) => /inherited scope is traceable/.test(l)) ?? '');

  ok('a bullet naming its ref passes',
    /PASS/.test(line(world(['F-02-9'], '- **F-02-9 — the lock order.** Body.'))));

  ok('a ref in `inherits:` named in no bullet fails',
    /FAIL/.test(line(world(['F-02-9'], '- **Something else entirely.** (no ref — a prediction)'))));

  ok('a bare bullet fails — nothing links it to a ruling',
    /FAIL/.test(line(world(['F-02-9'], '- **F-02-9 — ok.** x\n\n- **A bare bullet.** y'))));

  ok('...and the explicit escape passes, because slice 06 has a bullet with no ref to carry',
    /PASS/.test(line(world(['F-02-9'],
      '- **F-02-9 — ok.** x\n\n- **appointment.ts** (no ref — a retired §5.2 prediction) y'))));

  // THE CASE THAT MAKES THIS A LOG CHECK RATHER THAN A REGEX. Matching ref-shaped tokens
  // would accept both of these, and O-38 already caught one invented destination.
  ok('an AC or QS id is not a ref',
    /FAIL/.test(line(world(['F-02-9'], '- **AC-1 and QS-6 are cited here.** Body.'))));
  ok('an invented ref the log has never seen is not a ref',
    /FAIL/.test(line(world(['F-02-9'], '- **F-06-99 — invented.** Body.'))));

  // OQ-09-1. `D-` identifiers belong to the DEBT REGISTER, not the log — which is exactly
  // why O-39's ownership check excludes them. Reading only the log made a real obligation
  // uncitable: `D-07-1` is slice 09's, booked at slice 07 step 7, and a bullet naming it
  // failed while the honest escape `(no ref — …)` would have been a lie.
  const DESIGN = '## Debt\n\n**`D-05-1` — a saturated pool answers 500.** Booked at step 7.\n';
  ok('a `D-` ref DEFINED in a slice design is a ref, though the log never saw it',
    /PASS/.test(line(world(['F-02-9'],
      '- **F-02-9 — ok.** x\n\n- **`D-05-1` — the pool ceiling.** y', DESIGN))));

  // refs.mjs draws this line and slice:check must not redraw it: "appears in a design" and
  // "is defined in a design" are different facts, and collapsing them survives the mutant
  // that renames a definition.
  ok('...but a `D-` ref merely MENTIONED in a design is still not a ref',
    /FAIL/.test(line(world(['F-02-9'],
      '- **F-02-9 — ok.** x\n\n- **`D-05-9` — never defined anywhere.** y',
      DESIGN + '\nProse citing `D-05-9` in passing.\n'))));

  ok('a slice with no Inherited scope section is N/A, not a failure',
    /N\/A/.test((() => {
      const dir = mkdtempSync(join(tmpdir(), 'trace2-'));
      mkdirSync(join(dir, 'docs', 'slices'), { recursive: true });
      writeFileSync(join(dir, 'docs', 'slices', '06-x.md'),
        '---\nid: "06"\nstatus: ready\narc42: ["§6.3"]\nquality_scenarios: [QS-6]\n---\n\n- **AC-1** — a thing.\n');
      writeFileSync(join(dir, 'log.jsonl'), '');
      const r = spawnSync(process.execPath, [CHECK, '06', '--ready'],
        { encoding: 'utf8', cwd: dir, env: { ...process.env, TEAM_LOG: join(dir, 'log.jsonl') } });
      return strip(r.stdout).split('\n').find((l) => /inherited scope is traceable/.test(l)) ?? '';
    })()));
}

// ------------------------------------------------- destination liveness (O-42) --
console.log('\ndestinations must resolve to a live slice — the write path refuses a tombstone');
{
  const dir = mkdtempSync(join(tmpdir(), 'dest-'));
  mkdirSync(join(dir, 'slices'), { recursive: true });
  const w = (f, body) => writeFileSync(join(dir, 'slices', f), body);
  w('07-x.md', '---\nid: "07"\nstatus: ready\n---\n\nbody\n');
  w('09-x.md', '---\nid: "09"\nstatus: ready\n---\n\nbody\n');
  w('10-x.md', '---\nfolded_into: "09"\n---\n\nbody\n');
  w('88-x.md', '---\nfolded_into: "77"\n---\n\nbody\n');
  const sd = join(dir, 'slices');
  const errs = (to) => checkDestinations({ deferred_to: to }, sd);

  ok('a live slice passes', errs(['07']).length === 0);
  ok('a FOLDED slice is refused — the A-06-2 and OQ-05-2 defect', errs(['10']).length === 1);
  ok('...and the message names the surviving slice, not just the problem',
    /folded into 09/.test(errs(['10'])[0]), errs(['10'])[0]);
  ok('a fold to a slice that does not exist is refused', errs(['88']).length === 1);
  ok('a slice id that was never real is refused', errs(['77']).length === 1);
  ok('one bad destination among good ones is still caught', errs(['07', '10']).length === 1);
  ok('a non-slice destination is not checked for liveness', errs(['retro']).length === 0);
  ok('no destination, nothing to check', errs(undefined).length === 0);

  // MUST NOT FIRE: with no slice directory the guard says nothing rather than guessing —
  // otherwise every test fixture and every checkout without docs/slices fails to log.
  ok('an absent slice directory is silence, not a failure',
    checkDestinations({ deferred_to: ['07'] }, join(dir, 'nope')).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
