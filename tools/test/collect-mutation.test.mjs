#!/usr/bin/env node
/**
 * `collect-mutation.mjs` earns the `derived` tier, so its arithmetic is the thing standing
 * between the gate and a number nobody checked. These cases are the ones that would have
 * let O-64 through again in a different disguise.
 */
import { scoreFile, toChecks, changedFiles } from '../team-log/collect-mutation.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { failed++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
};

const m = (status, n = 1) => Array.from({ length: n }, () => ({ status }));

// --- scoreFile --------------------------------------------------------------
{
  ok('killed and survived make the ratio',
    scoreFile([...m('Killed', 3), ...m('Survived', 1)]).score === 75);

  // The directives ruled at slice 08 work by moving mutants OUT of the denominator. If
  // Ignored counted, every disable would look like a survivor and the criterion the
  // architect wrote to make exclusions falsifiable could never be satisfied.
  const withIgnored = scoreFile([...m('Killed', 3), ...m('Survived', 1), ...m('Ignored', 5)]);
  ok('Ignored leaves the denominator, which is what a disable directive DOES',
    withIgnored.score === 75 && withIgnored.killed === 3 && withIgnored.survived === 1,
    JSON.stringify(withIgnored));

  ok('a Timeout counts as killed, because the mutant did not survive',
    scoreFile([...m('Timeout', 1), ...m('Survived', 1)]).score === 50);

  // A file whose every mutant is Ignored has no score, and reporting 100 for it would be
  // the vacuous-score bug wearing the per-file field.
  ok('a file with nothing counted scores null rather than 100',
    scoreFile(m('Ignored', 4)) === null);
  ok('no mutants at all is null, not a division by zero', scoreFile([]) === null);
}

// --- toChecks ---------------------------------------------------------------
{
  const report = {
    files: {
      '/abs/repo/src/http/routes/availability.ts': { mutants: [...m('Killed', 30), ...m('Survived', 12), ...m('Ignored', 7)] },
      '/abs/repo/src/persistence/appointmentRepository.ts': { mutants: m('Killed', 105) },
      '/abs/repo/src/untouched.ts': { mutants: m('Survived', 99) },
    },
  };
  const changed = ['src/http/routes/availability.ts', 'src/persistence/appointmentRepository.ts'];
  const c = toChecks(report, changed);

  ok('scores only the changed files, ignoring the rest of the report',
    c.mutation_files_measured === 2 && c.mutation_per_file['src/untouched.ts'] === undefined,
    JSON.stringify(c.mutation_per_file));

  ok('the per-file score is the real one, to two places',
    c.mutation_per_file['src/http/routes/availability.ts'] === 71.43,
    String(c.mutation_per_file['src/http/routes/availability.ts']));

  // THE WHOLE POINT OF O-64: this aggregate passes while a member fails.
  ok('the aggregate can pass while a file is below threshold — both are reported',
    c.mutation_score > 0.75 && c.mutation_below_threshold.length === 1,
    `${c.mutation_score} / ${JSON.stringify(c.mutation_below_threshold)}`);

  ok('...and below_threshold names the failing file',
    c.mutation_below_threshold[0] === 'src/http/routes/availability.ts');

  ok('an unchanged file cannot drag the score down',
    !JSON.stringify(c).includes('untouched'));

  ok('a report with nothing changed measures nothing, and says so',
    toChecks(report, []).mutation_measures_changed_files === false);

  // Constraint 1 and 2 from the collector's own docblock, asserted rather than trusted:
  // `check.mjs` tells a CI record from a mutation record by `run_id`, and reads red/green
  // off `/FAIL|\b0\//` over the stringified checks.
  ok('carries no run_id, so it cannot be read as a CI run', c.run_id === undefined);
  ok('stringifies without FAIL or a ratio, so no CI predicate can mis-read it',
    !/FAIL|\b0\//.test(JSON.stringify(c)), JSON.stringify(c).slice(0, 120));

  ok('the tool version is never invented when not supplied',
    toChecks(report, changed).tool === 'stryker');
}

// --- changedFiles -----------------------------------------------------------
{
  const files = changedFiles('main', () => 'src/a.ts\nsrc/b.sql\nsrc/c.ts\n');
  ok('only .ts files are scored — a SQL-only diff mutates nothing',
    files.length === 2 && !files.includes('src/b.sql'), files.join(','));

  ok('the diff is three-dot against the base, not two',
    changedFiles('main', (a) => { ok('...args carry main...HEAD', a.includes('main...HEAD'), a.join(' ')); return ''; }) !== undefined);
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
