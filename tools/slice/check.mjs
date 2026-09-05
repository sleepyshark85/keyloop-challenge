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
import { spawnSync } from 'node:child_process';
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

  // O-14. Presence is not correspondence.
  //
  // Until slice 01 the check above was the whole of it: a non-empty list passed, and a
  // slice declaring ["§1"] while rewriting §5 and §9 passed too. R-01-7 is the first
  // recorded instance — slice 01 declared §5.2, §8.3 and §12 while the branch
  // hand-edited §10.2 — and it was found by a reviewer reading the diff, which is
  // exactly the labour the declaration exists to remove.
  //
  // Two things this must NOT do, both learnt the same day:
  //
  //   - GENERATED BLOCKS ARE NOT EDITS. `docs:build` writes §9's ADR index and §11's
  //     debt register into markers, so every slice that records an ADR "changes" §9.
  //     Counting those would make the declaration a record of what the build
  //     regenerated. A file whose diff lies entirely inside `<!-- generated:… -->`
  //     markers is skipped.
  //   - IT MUST SAY WHEN IT CANNOT TELL, and must distinguish that from having nothing
  //     to tell. No git, or a `head_sha` it cannot relate to anything, is UNVERIFIED —
  //     never PASS, because a gate reporting green because it could not look is the
  //     defect this whole file is built against. A slice with no commits of its own is
  //     N/A: there is nothing to correspond to yet, and blocking on that would put
  //     noise in front of the Done checks that already fail for the real reason.
  const arcCorrespondence = () => {
    if (!arc.length) return [UNVERIFIED, 'nothing declared to check against'];
    const g = (args) => {
      const r = spawnSync('git', args, { encoding: 'utf8' });
      return r.status === 0 ? r.stdout.trim() : null;
    };
    // The slice's OWN COMMITS, by Conventional Commit scope — not a branch diff.
    //
    // A branch diff answers "what is on this branch", which stops being answerable the
    // moment the branch merges: on `main` the merge-base is HEAD and the check would
    // report UNVERIFIED forever, and UNVERIFIED blocks Done, so every merged slice
    // would be trapped by the gate meant to protect it. Scope survives the merge.
    //
    // It also draws the right line rather than a convenient one. Step 7's as-built
    // commits are scoped `docs(arc42)`, not `(01)`, because §6 places them AFTER the
    // human gate — they are the architect reconciling arc42 to what merged, not slice
    // work, and the slice's declaration has no business governing them. R-01-7 was
    // about undeclared edits made DURING a slice, and that is exactly what this reads.
    const log = g(['log', '--format=%H %s', '--', '.']) ?? '';
    const shas = log.split('\n').filter(Boolean)
      .filter((l) => new RegExp(`^\\S+ [a-z]+\\(0*${String(id).replace(/^0+/, '')}\\)!?:`).test(l))
      .map((l) => l.split(' ')[0]);
    // N/A rather than UNVERIFIED: a slice with no commits of its own has not edited
    // arc42 undeclared, and it cannot — there is nothing to correspond to. UNVERIFIED
    // would block Done on a slice that the Done checks already block for having no red
    // commit and no CI run, which is noise standing in front of the real reason.
    if (!shas.length) return [NA, `no commits scoped (${id}) yet — nothing has been edited to declare`];
    const files = [...new Set(shas.flatMap((s) =>
      (g(['show', '--name-only', '--format=', s, '--', 'docs/arc42/']) ?? '').split('\n').filter(Boolean)))];
    if (!files.length) return [PASS, `no arc42 file changed by the ${shas.length} commit(s) scoped (${id})`];

    const declared = new Set(arc.map((s) => String(s).replace(/^§/, '')));

    // Was this commit's change to this file ENTIRELY inside generated markers?
    //
    // Compared AT THE COMMIT, both sides, which is the whole trick. The first version
    // of this tested the changed lines against the markers in the file as it stands
    // today and produced an immediate false positive: slice 01's commits added
    // ADR-0014 and ADR-0015 rows to §11's generated debt register, and those rows are
    // no longer in the current file — ratifying the two ADRs dropped them out of the
    // table, which is AB-01-7. So the lines were generated output that the current
    // file cannot vouch for, and the check accused the slice of a hand edit it had
    // not made. Strip both versions' generated blocks and compare what is left: if
    // the remainder is identical, the build wrote everything that moved.
    const stripGenerated = (t) =>
      t.replace(/<!-- generated:([^>]+) -->[\s\S]*?<!-- \/generated:\1 -->/g, '<!--G-->');
    const generatedOnly = (sha, file) => {
      const before = g(['show', `${sha}^:${file}`]);
      const after = g(['show', `${sha}:${file}`]);
      if (before === null || after === null) return false; // added or deleted — a hand edit
      return stripGenerated(before) === stripGenerated(after);
    };

    // A file is hand-edited if ANY of the slice's commits changed it outside the
    // markers. Deliberately not "the net diff", which would let an edit and its
    // revert cancel out and hide that the slice touched an undeclared section.
    const handEdited = files.filter((f) =>
      shas.some((s) => {
        const touched = (g(['show', '--name-only', '--format=', s, '--', f]) ?? '').trim();
        return touched && !generatedOnly(s, f);
      }));

    // Leading zeros are a FILENAME convention, not part of the section number: arc42
    // files are `01-introduction.md` while the declaration says `§1`. Comparing the
    // strings made every single-digit section read as undeclared, which the test caught
    // on the first run — and which would have failed exactly the slices that declare
    // their scope most narrowly.
    const num = (x) => String(x).replace(/^0+(?=\d)/, '');
    const undeclared = handEdited.filter((f) => {
      const n = f.match(/(\d+)[^/]*\.md$/)?.[1];
      if (!n) return true;
      // "§10" in the declaration covers "§10.2"; "§10.2" does not cover "§10.3".
      return ![...declared].some((d) => num(d) === num(n) || num(d).startsWith(`${num(n)}.`));
    });

    // The detail line names BOTH counts. "3 files changed, all declared" would be true
    // of a slice that hand-edited nothing and of one that hand-edited three declared
    // sections, and those are different facts about how much a reader should look.
    const gen = files.length - handEdited.length;
    return undeclared.length
      ? [FAIL, `hand-edited but not declared: ${undeclared.join(', ')} — declared ${arc.join(' ')}`]
      : [PASS, `${files.length} arc42 file(s) changed by commits scoped (${id}): `
          + `${handEdited.length} hand-edited, all within ${arc.join(' ')}`
          + `${gen ? `; ${gen} generated-block only` : ''}`];
  };
  const [arcVerdict, arcDetail] = arcCorrespondence();
  check('ready', 'arc42 edits match the declaration', arcVerdict, arcDetail);

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

  // O-17. The run has to COVER THE COMMIT BEING GATED, and until slice 01 nothing
  // checked that it did.
  //
  // Measured on slice 01's branch: after the whole AC-6 remedy landed across five
  // commits, this gate reported "tests green" citing a run five commits behind that
  // predated every part of the remedy it exists to approve — and the run for the real
  // HEAD had FAILED at that moment, invisibly, because a failing run nobody collected
  // is indistinguishable from a run that does not exist. It went green only because
  // the orchestrator then ran `collect-ci.mjs` by hand.
  //
  // Same family as O-6 (a CI run recorded out of order) and O-14 (a declaration read
  // for presence rather than correspondence): the predicate reads a record that
  // EXISTS rather than one that APPLIES.
  //
  // UNVERIFIED rather than FAIL when git cannot answer — no repository, a detached
  // or unknown SHA — per this tool's own three-verdict contract. "Cannot tell" is not
  // "wrong", and it is emphatically not "fine".
  const git = (args) => {
    const r = spawnSync('git', args, { encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  const head = git(['rev-parse', 'HEAD']);
  const runSha = lastRun?.checks?.head_sha;
  const coversHead = (() => {
    if (!head || !runSha) return null;
    if (runSha === head) return true;
    // A run on an ANCESTOR of HEAD is stale; a run on HEAD's own commit is current.
    // `merge-base --is-ancestor` exits 0 when the first is an ancestor of the second,
    // so this is "the run is behind us", which is exactly the failure being caught.
    const anc = spawnSync('git', ['merge-base', '--is-ancestor', runSha, head], { encoding: 'utf8' });
    if (anc.status === 0) return false;
    return null; // unrelated or unknown commit — cannot tell
  })();

  // ONE derivation, not two. The first version of this computed the verdict and the
  // detail as separate ternary chains over the same conditions, and the mutant that
  // deleted the `coversHead === false` arm proved what that costs: the gate reported
  // PASS while the line underneath it still read "the newest recorded run is an
  // ancestor of HEAD — it did not test this commit". A verdict and its own stated
  // reason that can disagree is the defect this file exists to catch, one level up,
  // and it was caught only because the mutant was run. Every branch below returns
  // BOTH, so they cannot drift apart.
  const testsGreen = () => {
    if (!hasTestScript) return [UNVERIFIED, 'no `npm test` script yet — nothing to run'];
    if (!lastRun) return [UNVERIFIED, 'no CI run recorded'];
    if (/FAIL/.test(JSON.stringify(lastRun.checks))) return [FAIL, JSON.stringify(lastRun.checks)];
    if (coversHead === false) {
      return [FAIL,
        `the newest recorded run is ${String(runSha).slice(0, 7)}, an ancestor of HEAD `
        + `${String(head).slice(0, 7)} — it did not test this commit. Run `
        + '`node tools/team-log/collect-ci.mjs --run <id> --slice <id>` for the current run.'];
    }
    if (coversHead === null) {
      return [UNVERIFIED,
        `cannot relate the run's head_sha (${String(runSha).slice(0, 7) || 'absent'}) to HEAD`];
    }
    return [PASS, JSON.stringify(lastRun.checks)];
  };
  check('done', 'tests green', ...testsGreen());

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

  // "Approved" is a MEANING, not a spelling.
  //
  // This read `gate.decision === 'approved'` by exact equality until slice 01, where
  // the human's decision was recorded as `approved-and-merged` and the gate reported
  // the slice NOT approved. Slice 00a hit the same wall and worked around it by
  // appending a SECOND `gate.decided` carrying the exact spelling — the same human
  // decision logged twice to satisfy a string compare. That is a workaround that puts
  // a duplicate in the permanent record rather than a fix, and it is the ninth
  // instance of a guard enforced by the orchestrator remembering something.
  //
  // Two further defects in reading "the last gate.decided of any kind":
  //
  //   - `gate.decided` also carries PROCESS rulings (`gate: "process"`). The schema
  //     rejects phase 5, so a cross-slice process decision is scoped to the slice it
  //     first affects — slice 02 carries two. Reading one of those as a Gate E would
  //     pass a slice on a decision about how it is going to be gated. Hence `gate: 'E'`.
  //   - a decision that is not an approval must FAIL rather than merely not-match, and
  //     be seen to. `changes-requested` and `approved-and-merged` are different answers
  //     and the detail line has to say which was read.
  const gateE = [...events].reverse().find((e) => e.event === 'gate.decided' && e.gate === 'E');
  const isApproval = (d) => typeof d === 'string' && /^approved(\b|-)/.test(d);

  // The light gate — the human's 2026-09-05 cost ruling. Slices 05, 08 and 09 declare
  // `gate: light` and auto-approve on a green Definition of Done; 02, 04, 06 and 07
  // keep the full human gate because they carry the booking path, candidate allocation
  // and the 06/07 seam Gate C defended by name.
  //
  // THE REVERSION IS THE WHOLE SAFETY OF THE ARRANGEMENT, so it lives in the predicate
  // and not in the orchestrator's memory: an OPEN MAJOR or BLOCKING finding revokes the
  // light gate and demands a human. Open means raised and neither ruled nor resolved —
  // not merely raised, since slice 01 raised three MAJORs and closed all three, and a
  // slice that found and fixed serious things is the opposite of one that needs
  // escalating.
  //
  // Auto-approval is not unconditional: this tool reports "all checks pass" only when
  // every other Done check passes, so a light gate cannot carry a slice over a red
  // suite, a stale CI run or an unreconciled arc42.
  const closed = new Set(events
    .filter((e) => e.event === 'finding.ruled' || e.event === 'finding.resolved'
      || e.event === 'review.response')
    .map((e) => e.ref ?? e.finding_ref));
  const openSerious = events.filter((e) => e.event === 'finding.raised'
    && ['MAJOR', 'BLOCKING'].includes(e.severity) && !closed.has(e.ref));
  const light = String(slice.gate ?? 'full') === 'light';

  check('done', 'human approved',
    gateE ? (isApproval(gateE.decision) ? PASS : FAIL)
      : light ? (openSerious.length ? FAIL : PASS)
      : FAIL,
    gateE ? `${gateE.decision} — ${gateE.rationale}`
      : light && !openSerious.length
        ? 'light gate (human ruling 2026-09-05): auto-approved — DoD green and no open MAJOR/BLOCKING'
      : light
        ? `light gate REVOKED — ${openSerious.length} open MAJOR/BLOCKING finding(s): `
          + `${openSerious.map((e) => e.ref).join(', ')}. This slice needs a human.`
      : 'no Gate E gate.decided event');

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
