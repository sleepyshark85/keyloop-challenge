#!/usr/bin/env node
/**
 * Definition of Ready / Definition of Done gate.  METHODOLOGY.md §10.
 *
 *   npm run slice:check 03            # both
 *   npm run slice:check 03 -- --ready
 *   npm run slice:check 03 -- --done
 *
 * Three verdicts, and the third is the point of this tool:
 *
 *   PASS        verified from an artifact
 *   FAIL        verified to be wrong
 *   UNVERIFIED  no evidence exists either way
 *
 * UNVERIFIED blocks Done. A check that cannot see its evidence must not report
 * green — that is precisely the failure this whole methodology is built against.
 * Early in the project most DoD checks are UNVERIFIED because the toolchain they
 * read does not exist yet; that is honest, and it resolves as slices land.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { frontmatter, body } from '../lib/frontmatter.mjs';

const SLICE_DIR = resolve('docs/slices');
const LOG = resolve(process.env.TEAM_LOG ?? 'docs/team-log/events.jsonl');
const MUTATION_THRESHOLD = 0.75;

const argv = process.argv.slice(2);
const id = (argv.find((a) => !a.startsWith('--')) ?? '').padStart(2, '0');
const onlyReady = argv.includes('--ready');
const onlyDone = argv.includes('--done');

if (!id.trim() || id === '00'.slice(0, 0)) {
  console.error('usage: npm run slice:check <id> [-- --ready|--done]');
  process.exit(2);
}

// ------------------------------------------------------------------ inputs --
const files = existsSync(SLICE_DIR) ? readdirSync(SLICE_DIR).filter((f) => f.endsWith('.md') && !f.startsWith('_')) : [];
const slices = files.map((f) => {
  const raw = readFileSync(join(SLICE_DIR, f), 'utf8');
  return { file: f, raw, ...frontmatter(raw), text: body(raw) };
}).filter((s) => s.id);

const slice = slices.find((s) => String(s.id).padStart(2, '0') === id);
if (!slice) {
  console.error(`no slice with id ${id} in docs/slices/`);
  process.exit(2);
}

const events = existsSync(LOG)
  ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean)
      .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } })
      .filter((e) => e.slice === id)
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
  : [];

// ------------------------------------------------------------------ checks --
const results = [];
const check = (phase, name, verdict, detail) => results.push({ phase, name, verdict, detail });
const PASS = 'PASS', FAIL = 'FAIL', UNVERIFIED = 'UNVERIFIED';
/**
 * "We cannot know" and "there is nothing to know" are different facts, and
 * collapsing them cost this gate its meaning in both directions at once.
 *
 * Reading a vacuous mutation score as PASS let a slice clear §10's "on changed
 * files" clause on a number measuring the slice before it. Reading it as
 * UNVERIFIED — the reviewer's remedy, and right as far as it went — blocked a
 * slice that changes only SQL from ever reaching done, because no mutation score
 * about it can exist. NOT-APPLICABLE is the third fact: the criterion does not
 * apply to this slice's diff, which is a conclusion rather than an absence.
 *
 * It does NOT block Done. UNVERIFIED still does — a slice that changed mutable
 * files and has no score is missing evidence, not exempt from it.
 */
const NA = 'N/A';

// --- Definition of Ready ---
if (!onlyDone) {
  const acs = [...slice.text.matchAll(/^\s*[-*]\s*\*\*AC-\d+\*\*/gm)];
  check('ready', 'acceptance criteria present', acs.length ? PASS : FAIL,
    acs.length ? `${acs.length} criteria` : 'no **AC-n** entries found in the body');

  const deps = slice.depends_on ?? [];
  if (!deps.length) {
    check('ready', 'dependencies merged', PASS, 'none declared');
  } else {
    const unmet = deps.filter((d) => {
      const dep = slices.find((s) => String(s.id).padStart(2, '0') === String(d).padStart(2, '0'));
      return !dep || dep.status !== 'done';
    });
    check('ready', 'dependencies merged', unmet.length ? FAIL : PASS,
      unmet.length ? `not done: ${unmet.join(', ')}` : deps.join(', '));
  }

  const arc = slice.arc42 ?? [];
  check('ready', 'arc42 scope declared', arc.length ? PASS : FAIL,
    arc.length ? arc.join(' ') : 'declare the sections this slice may touch, or ["none"]');

  const qs = slice.quality_scenarios ?? [];
  check('ready', 'quality scenarios linked', qs.length ? PASS : FAIL,
    qs.length ? qs.join(' ') : 'no QS-* link — the traceability chain would be broken');

  const raised = events.filter((e) => e.event === 'dcr.raised').length;
  const resolved = events.filter((e) => e.event === 'dcr.resolved').length;
  check('ready', 'no open clarifications', raised > resolved ? FAIL : PASS,
    raised > resolved ? `${raised - resolved} DCR(s) unresolved` : 'none open');
}

// --- Definition of Done ---
if (!onlyReady) {
  // The red-commit trail: a failing acceptance run must precede any passing one.
  //
  // `check.run` carries more than one kind of record — a CI run, and a mutation
  // score. Only a CI run reports whether tests ran, and it is the one that carries
  // `run_id`. Reading them alike made a mutation record — which contains no test
  // outcome at all — satisfy both "tests green" and the green half of red-before-
  // green. Recorded as O-6 at slice 00a and deferred with a sequencing workaround;
  // it recurred immediately at slice 00 because the workaround was "append the CI
  // run last", which depends on the orchestrator remembering it every time. A
  // guard whose only enforcement is discipline is the failure this project has now
  // catalogued eight times, so the discriminator is in the predicate instead.
  const allRuns = events.filter((e) => e.event === 'check.run');
  const runs = allRuns.filter((e) => e.checks?.run_id !== undefined);
  const failing = runs.find((e) => /FAIL|\b0\//.test(JSON.stringify(e.checks ?? {})));
  const passingAfter = failing && runs.find((e) =>
    Date.parse(e.ts) > Date.parse(failing.ts) && !/FAIL|\b0\//.test(JSON.stringify(e.checks ?? {})));
  check('done', 'test-first proven (red before green)',
    !runs.length ? UNVERIFIED : failing && passingAfter ? PASS : FAIL,
    !runs.length ? 'no check.run events — CI has recorded nothing'
      : failing && passingAfter ? `red at ${failing.ts.slice(11, 16)}, green after`
      : 'no recorded failing acceptance run preceding a passing one');

  const hasTestScript = (() => {
    try { return Boolean(JSON.parse(readFileSync(resolve('package.json'), 'utf8')).scripts?.test); }
    catch { return false; }
  })();
  // Newest CI run by completion time, not by log position: a backfill may append
  // an older run after a newer one (§7's ordering obligation exists for the same
  // reason, and asking two mechanisms to agree is how they drift apart).
  const lastRun = [...runs].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)).at(-1);
  check('done', 'tests green',
    !hasTestScript ? UNVERIFIED : !lastRun ? UNVERIFIED
      : /FAIL/.test(JSON.stringify(lastRun.checks)) ? FAIL : PASS,
    !hasTestScript ? 'no `npm test` script yet — nothing to run'
      : !lastRun ? 'no CI run recorded' : JSON.stringify(lastRun.checks));

  // CLAUDE.md §10's clause is "mutation score above threshold ON CHANGED FILES".
  // Reading only the number answered a different question: slice 00 changed three
  // .sql files and no TypeScript, so Stryker instrumented the identical 142 mutants
  // as the slice before it and this gate reported PASS on a measurement that could
  // not have failed. The record itself was honest — its `note` said "vacuously so" —
  // but the honesty sat in a field the gate never opened.
  //
  // Reviewer, slice 00, finding 2. It is O-6's shape one turn on: `c7a716d` taught
  // the two predicates above that a mutation record is not a CI run, and left this
  // one reading a number with no way to say the number is about nothing.
  //
  // A slice that changed no mutable file gets UNVERIFIED, not PASS. That is the
  // same answer `slice:check` already gives for every other absent evidence: the
  // gate says what it does not know rather than passing on what it cannot see.
  const mut = [...events].reverse().find((e) => e.checks?.mutation_score !== undefined);
  const vacuous = mut?.checks?.mutation_measures_changed_files === false;
  check('done', `mutation score ≥ ${MUTATION_THRESHOLD}`,
    !mut ? UNVERIFIED
      : vacuous ? NA
      : mut.checks.mutation_score >= MUTATION_THRESHOLD ? PASS : FAIL,
    !mut ? 'Stryker has not run for this slice'
      : vacuous ? `this slice changed no mutable file — ${mut.checks.mutation_score} measures the slice before it`
      : `${mut.checks.mutation_score}`);

  const depcruiseConfigured = ['.dependency-cruiser.js', '.dependency-cruiser.cjs', '.dependency-cruiser.json']
    .some((f) => existsSync(resolve(f)));
  const dc = [...events].reverse().find((e) => e.checks?.depcruise !== undefined);
  check('done', 'layering clean',
    !depcruiseConfigured ? UNVERIFIED : !dc ? UNVERIFIED : dc.checks.depcruise === 'pass' ? PASS : FAIL,
    !depcruiseConfigured ? 'no .dependency-cruiser config — the architect authors it at Gate B'
      : !dc ? 'not recorded for this slice' : dc.checks.depcruise);

  const arcUpdated = events.some((e) => e.event === 'arc42.updated');
  check('done', 'arc42 reconciled to as-built', arcUpdated ? PASS : FAIL,
    arcUpdated ? 'recorded' : 'the architect has not run step 7');

  const gate = [...events].reverse().find((e) => e.event === 'gate.decided');
  check('done', 'human approved', gate ? (gate.decision === 'approved' ? PASS : FAIL) : FAIL,
    gate ? `${gate.decision} — ${gate.rationale}` : 'no gate.decided event');

  const loops = events.filter((e) => e.event === 'loopback').length;
  check('done', 'loopbacks within governor', loops <= 2 ? PASS : FAIL,
    `${loops} of max 2${loops > 2 ? ' — should have been split, not ground through' : ''}`);
}

// ------------------------------------------------------------------ report --
const C = { PASS: '\x1b[32m', FAIL: '\x1b[31m', UNVERIFIED: '\x1b[33m', 'N/A': '\x1b[2m' };
const R = '\x1b[0m';
const dim = (s) => `\x1b[2m${s}${R}`;

console.log(`\nslice ${id} · ${slice.title}   ${dim(`status: ${slice.status}`)}`);
let phase = '';
for (const r of results) {
  if (r.phase !== phase) { phase = r.phase; console.log(dim(`\n  ${phase === 'ready' ? 'DEFINITION OF READY' : 'DEFINITION OF DONE'}`)); }
  console.log(`  ${C[r.verdict]}${r.verdict.padEnd(10)}${R} ${r.name.padEnd(34)} ${dim(r.detail)}`);
}

const failed = results.filter((r) => r.verdict === FAIL);
const unverified = results.filter((r) => r.verdict === UNVERIFIED);
const notApplicable = results.filter((r) => r.verdict === NA);

console.log();
if (failed.length) console.log(`  ${C.FAIL}${failed.length} failing${R}`);
if (unverified.length) {
  console.log(`  ${C.UNVERIFIED}${unverified.length} unverified${R} ${dim('— no evidence exists; this blocks Done by design')}`);
}
if (notApplicable.length) {
  console.log(`  ${dim(`${notApplicable.length} not applicable — the criterion does not reach this slice's diff`)}`);
}
if (!failed.length && !unverified.length) console.log(`  ${C.PASS}all checks pass${R}`);

process.exit(failed.length || unverified.length ? 1 : 0);
