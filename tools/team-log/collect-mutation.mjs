#!/usr/bin/env node
/**
 * `check.run` collector for MUTATION SCORE, PER CHANGED FILE — O-64.
 *
 *   node tools/team-log/collect-mutation.mjs [--slice <id>] [--base <ref>]
 *                                            [--report <path>] [--dry-run]
 *
 * ── Why this exists, when a mutation record already did ─────────────────────────────────
 *
 * `CLAUDE.md` §10's clause is "mutation score above threshold ON CHANGED FILES", and
 * `slice:check` read ONE AGGREGATE NUMBER against it. At slice 08 that number was 85.71
 * over the changed set while `src/http/routes/availability.ts` sat at 71.43 — a file the
 * architect had ruled fails §10, booked into arc42 §11 as debt, and argued about across
 * three separate rulings. THE GATE WOULD HAVE REPORTED PASS ON IT.
 *
 * The per-file truth was not missing. It was in the `note` field of a hand-written record,
 * in prose, in capitals — "BELOW THE 0.75 THRESHOLD ON THE PER-FILE READING" — where no
 * check could reach it. That is the same defect as O-6 and the vacuous-score bug this very
 * criterion was already fixed for once: THE HONESTY SAT IN A FIELD THE GATE NEVER OPENED.
 * A number a human must read a paragraph to interpret is not evidence, it is a note.
 *
 * The reason it was prose is that no collector existed, so the orchestrator typed the
 * numbers, and `write.mjs` correctly refuses the `derived` tier to anything typed. Adding
 * a per-file FIELD without a collector would have moved the same hand-entered figures into
 * a place the gate trusts more, which is worse than leaving them in prose.
 *
 * ── It writes nothing it did not compute ────────────────────────────────────────────────
 *
 * Every number comes from Stryker's own `reports/mutation/mutation.json` and the changed
 * set from `git diff --name-only <base>...HEAD`. There is no `--score`, no `--per-file`,
 * no way to state an outcome on the command line. That is what earns
 * `appendRecords(…, { allowDerived: true })`, on the same reasoning as `collect-ci.mjs`.
 *
 * ── Two constraints imposed by the consumer, tools/slice/check.mjs ──────────────────────
 *
 *   1  NO `run_id`. `check.mjs` tells a CI record from a mutation record by that field
 *      alone (O-6, twice). A mutation record carrying one would satisfy "tests green"
 *      while reporting no test outcome at all.
 *   2  NO "FAIL" and no `N/` ratio strings anywhere under `checks`. `check.mjs` decides
 *      red-before-green by `/FAIL|\b0\//` over the stringified checks of CI records; the
 *      discriminator in 1 keeps this record out of that set, and staying clean of both
 *      patterns means a future widening of that predicate cannot silently mis-read it.
 *      Hence `below_threshold` is a list of PATHS and the scores are numbers.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { appendRecords } from './write.mjs';

export const DEFAULT_REPORT = 'reports/mutation/mutation.json';

/** A mutant counts against a file when its status is a verdict. Ignored/NoCoverage do not. */
const KILLING = new Set(['Killed', 'Timeout']);
const COUNTED = new Set(['Killed', 'Timeout', 'Survived']);

/**
 * Score one Stryker file entry, or `null` when it has no counted mutants.
 *
 * `Ignored` is excluded from the denominator DELIBERATELY and it is the whole reason a
 * disable directive can move a score: that is what the directives at slice 08 were ruled
 * to do, under a criterion the architect wrote to make the exclusion falsifiable. This
 * function does not judge whether an exclusion was earned; it reports what Stryker did.
 */
export function scoreFile(mutants) {
  const counted = mutants.filter((m) => COUNTED.has(m.status));
  if (!counted.length) return null;
  const killed = counted.filter((m) => KILLING.has(m.status)).length;
  return {
    score: Number(((killed / counted.length) * 100).toFixed(2)),
    killed,
    survived: counted.length - killed,
  };
}

/**
 * The pure half: a Stryker report plus a changed-file list becomes the record's `checks`.
 *
 * `changed` is matched against the report's keys by SUFFIX, because Stryker writes absolute
 * paths and git writes repository-relative ones. Suffix rather than basename: two files
 * named `health.ts` exist in this repository and matching on the basename would score one
 * as the other.
 */
export function toChecks(report, changed, { threshold = 0.75, tool } = {}) {
  const perFile = {};
  const measured = [];
  for (const [key, entry] of Object.entries(report.files ?? {})) {
    const hit = changed.find((c) => key === c || key.endsWith(`/${c}`));
    if (!hit) continue;
    const s = scoreFile(entry.mutants ?? []);
    if (!s) continue;
    perFile[hit] = s.score;
    measured.push({ file: hit, ...s });
  }

  const killed = measured.reduce((n, m) => n + m.killed, 0);
  const total = measured.reduce((n, m) => n + m.killed + m.survived, 0);
  const below = measured.filter((m) => m.score < threshold * 100).map((m) => m.file).sort();

  return {
    // The aggregate is KEPT, not replaced. It is a true fact and older records carry it,
    // so removing it would break every historical reading; what changes is that it is no
    // longer the field the threshold is applied to.
    mutation_score: total ? Number((killed / total).toFixed(4)) : null,
    mutation_per_file: perFile,
    mutation_below_threshold: below,
    mutation_files_measured: measured.length,
    mutation_measures_changed_files: measured.length > 0,
    mutants_total: Object.values(report.files ?? {})
      .reduce((n, f) => n + (f.mutants?.length ?? 0), 0),
    // The report's `schemaVersion` is the FORMAT's version, not Stryker's — reading it as
    // the tool version put `stryker@1.0` in a field whose whole purpose is reproducibility.
    tool: tool ?? 'stryker',
    runner: 'command',
  };
}

/** Changed source files, repository-relative, restricted to what Stryker can mutate. */
export function changedFiles(base, run = (a) => execFileSync('git', a).toString()) {
  return run(['diff', '--name-only', `${base}...HEAD`, '--', 'src/'])
    .trim().split('\n').filter((f) => f.endsWith('.ts'));
}

/** The installed Stryker's own version, or `unknown` — never invented. */
function strykerVersion() {
  try {
    return JSON.parse(readFileSync(
      resolve('node_modules/@stryker-mutator/core/package.json'), 'utf8')).version;
  } catch { return 'unknown'; }
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

function main() {
  const reportPath = resolve(arg('report', DEFAULT_REPORT));
  if (!existsSync(reportPath)) {
    console.error(`no mutation report at ${reportPath} — run \`npm run mutation\` first.`);
    console.error('nothing was appended.');
    process.exit(2);
  }

  const base = arg('base', 'main');
  const slice = arg('slice');
  const changed = changedFiles(base);
  if (!changed.length) {
    console.error(`no changed .ts under src/ against ${base} — nothing to score.`);
    console.error('nothing was appended.');
    process.exit(2);
  }

  const checks = toChecks(JSON.parse(readFileSync(reportPath, 'utf8')), changed, {
    tool: `stryker@${strykerVersion()}`,
  });

  /**
   * A PARTIAL REPORT MUST NOT PRODUCE AN EMPTY `below_threshold` — O-73.
   *
   * Stryker can be run file-scoped, and every run OVERWRITES this report. After the slice 09
   * remediation the implementer measured three files individually, correctly, as instructed;
   * the last run left a report containing ONE file. The collector then intersected it with
   * eleven changed files, found one, scored it 85.57, and recorded `below_threshold: []`.
   *
   * That empty array was TRUE OF THE REPORT AND FALSE OF THE SLICE, and it would have
   * satisfied the per-file criterion built days earlier under O-64 to stop this exact class
   * of error — while two remediated files went unmeasured.
   *
   * THE EVIDENCE WAS ALREADY IN THE RECORD AND NOTHING READ IT: `mutation_files_measured`
   * said 1 against 11 changed files. That is the third consecutive instance of this shape —
   * O-6, the vacuous SQL-only score, O-64's aggregate — and the first the orchestrator wrote
   * itself, having built the guard. So the check is no longer a field a reader must open.
   *
   * `--allow-partial` exists because measuring one file deliberately is legitimate; it
   * records the fact in the log so the gate sees a partial reading rather than inferring a
   * complete one.
   */
  const unmeasured = changed.filter((f) => checks.mutation_per_file[f] === undefined);
  if (unmeasured.length && !process.argv.includes('--allow-partial')) {
    console.error(`the report covers ${checks.mutation_files_measured} of ${changed.length} changed file(s).`);
    console.error(`unmeasured: ${unmeasured.join(', ')}`);
    console.error('A partial report cannot say a slice has no file below threshold — it can only');
    console.error('say the files it contains do not. Re-run `npm run mutation` over the whole');
    console.error('project, or pass --allow-partial to record this as a partial reading (O-73).');
    console.error('nothing was appended.');
    process.exit(2);
  }
  if (unmeasured.length) {
    checks.mutation_report_partial = true;
    checks.mutation_unmeasured = unmeasured;
  }
  const record = {
    slice,
    event: 'check.run',
    source: 'derived',
    outcome: checks.mutation_below_threshold.length ? 'below-threshold' : 'success',
    checks,
    message: `${DEFAULT_REPORT} · ${checks.mutation_files_measured} changed file(s) scored`,
  };

  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify(record, null, 2));
    console.log('--dry-run: NOT appended.');
    return;
  }

  for (const r of appendRecords([record], { allowDerived: true })) {
    console.log(`logged ${r.event} · slice ${r.slice ?? '-'} · ${r.span_id ?? ''}`);
  }
  for (const [f, s] of Object.entries(checks.mutation_per_file).sort()) {
    console.log(`  ${s < 75 ? 'below' : '  ok '}  ${String(s).padStart(6)}  ${f}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
