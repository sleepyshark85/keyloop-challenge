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
import { refsDeferredTo, deferralMap } from '../lib/deferrals.mjs';

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

const allEvents = existsSync(LOG)
  ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean)
      .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } })
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
  : [];

// Deferrals are the one thing this tool must read ACROSS slices. Everything else about a
// slice is answered from its own span; an inherited obligation is by definition a ruling
// made somewhere else, and reading only `events` is why the destination lived in prose for
// five slices — the receiving slice's own record never mentioned it.
const events = allEvents.filter((e) => e.slice === id);

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
  // `AC-5a` is a criterion. The pattern demanded digits followed immediately by `**`, so when
  // R-08-2 split AC-5 into an assertable half and one deferred to the slice that can fail it,
  // slice:check reported five criteria where there were six — a counter that stops counting the
  // moment a criterion is split is a counter that discourages splitting.
  const acs = [...slice.text.matchAll(/^\s*[-*]\s*\*\*AC-\d+[a-z]?\*\*/gm)];
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

  // INHERITED OBLIGATIONS — A-05-5, and the fourth attempt at the same defect.
  //
  // The mechanism failed identically four times: a ruling said "routed to slice 06", the
  // receiving slice's file said nothing, and the only thing joining them was memory. R-05-2
  // twice, A-05-5, then O-37 — which named a destination file that did not have the
  // structure the dispatch described, because nothing had ever checked that a named
  // destination was real. The architect ruled the criterion SOUND and the ENFORCEMENT
  // MISSING, and said in the same ruling that the honest alternative to building this check
  // is an ADR superseding ADR-0019 rather than a fifth repetition.
  //
  // READY fails when a ref deferred here is missing from `inherits:`. The direction matters:
  // the subset runs deferrals -> inherits, so a slice cannot become Ready by simply not
  // mentioning what was sent to it. Extra entries in `inherits:` are NOT an error — a slice
  // may take on an obligation nobody deferred to it, and forbidding that would punish the
  // one behaviour this whole mechanism is trying to encourage.
  // O-41 — THE SUBSET GUARD BECOMES BIDIRECTIONAL.
  //
  // The check below asks whether `inherits:` covers everything deferred here. It cannot ask
  // the other question: whether the slice's PROSE still describes what `inherits:` claims.
  // Measured on slice 06 — `F-02-9`, `R-05-7` and `R-05-9` appeared in the front matter and
  // NOWHERE ELSE IN THE FILE. The substance was all present in the bullets; nothing linked a
  // bullet to the ruling that put it there, so a silent drop would have stayed green.
  //
  // A REF IS A REF BECAUSE THE LOG KNOWS IT, not because it matches a pattern. Matching by
  // shape would accept `AC-1` and `QS-6`, which are not findings, and would accept an invented
  // `F-06-x` — which is the failure O-38 already caught once, a false destination manufactured
  // to satisfy a rule that exists to stop false destinations. Checking against the log's own
  // refs enforces O-39 in the same stroke: a bullet may only cite a finding that was actually
  // raised.
  //
  // THE ESCAPE IS DELIBERATE AND VISIBLE. The architect's first version of this rule was
  // "every bullet carries a ref", and it is false against slice 06's own file: the
  // `src/domain/appointment.ts` bullet is a retired §5.2 prediction that was never a logged
  // finding and has no ref to carry. A rule demanding one would invent it. So a bullet may say
  // `(no ref — <reason>)` instead; bare bullets fail, escaped bullets pass and can be counted.
  const inheritedScope = (() => {
    // NOT a lookahead for `\Z`: JavaScript has no such escape, and `(?=^##\s|\Z)` silently
    // becomes "or a literal Z", so the section never matched and every slice reported N/A —
    // a guard that could only ever say "nothing to check". Caught by this check's own tests
    // on their first run, which is the argument for writing them.
    const m = slice.text.match(/^##\s+Inherited scope[^\n]*\n([\s\S]*)$/m);
    if (!m) return null;
    const next = m[1].search(/^##\s/m);
    return next === -1 ? m[1] : m[1].slice(0, next);
  })();

  if (inheritedScope === null) {
    check('ready', 'inherited scope is traceable', NA,
      'this slice declares no `## Inherited scope` section');
  } else {
    const knownRefs = new Set(allEvents
      .filter((e) => ['finding.raised', 'finding.ruled', 'finding.routed', 'finding.resolved'].includes(e.event))
      .map((e) => e.ref).filter(Boolean));

    // Top-level bullets only: a nested list belongs to the bullet above it.
    const bullets = inheritedScope.split(/\n(?=- )/).map((b) => b.trim()).filter(Boolean);
    const refsIn = (b) => [...knownRefs].filter((r) => new RegExp(`\\b${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(b));
    const escaped = (b) => /\(no ref\s*[—-]\s*[^)]+\)/.test(b);

    const bare = bullets.filter((b) => !refsIn(b).length && !escaped(b));
    const cited = new Set(bullets.flatMap(refsIn));
    const uncited = (slice.inherits ?? []).filter((r) => !cited.has(r));

    const problems = [
      ...bare.map((b) => `a bullet cites no ref and carries no escape: "${b.slice(0, 60).replace(/\s+/g, ' ')}…"`),
      ...(uncited.length ? [`declared in \`inherits:\` but named in no bullet — ${uncited.join(', ')}`] : []),
    ];
    check('ready', 'inherited scope is traceable', problems.length ? FAIL : PASS,
      problems.length
        ? `${problems.join('; ')}. A ref must be one the log knows; use \`(no ref — reason)\` when there `
          + 'genuinely is none.'
        : `${bullets.length} bullet(s), every ref in \`inherits:\` named in one`);
  }

  const owed = refsDeferredTo(allEvents, id);
  const inherits = slice.inherits ?? [];
  const missing = owed.filter((r) => !inherits.includes(r));
  check('ready', 'inherited obligations declared',
    owed.length === 0 ? PASS : missing.length ? FAIL : PASS,
    owed.length === 0
      ? 'nothing was deferred to this slice'
      : missing.length
        ? `deferred here but absent from \`inherits:\` — ${missing.join(', ')}. `
          + 'A slice does not stop owing an obligation by not listing it.'
        : `${owed.join(' ')} — all declared`);

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
    // GATE-RELATIVE, NOT MESSAGE-RELATIVE — R-02-1.
    //
    // This selected the slice's commits by Conventional Commit scope, exempting anything
    // not scoped `(NN)` on the stated ground that step 7's `docs(arc42)` commits are
    // post-gate and the slice's declaration has no business governing them. The exemption
    // was deliberate and tested. The assumption underneath it — that `docs(arc42)` appears
    // only after the gate — is what slice 02 broke: `dd9bd44` hand-edited §10's QS-12
    // wording at STEP 2, scoped `docs(arc42)`, and this check reported "0 hand-edited, all
    // within §5.2 §6.1 §8.6" over a file it never opened. The edit was legitimate — it
    // implements the human's E-02-2 ruling — but the gate line was not evidence.
    //
    // A commit message cannot separate a mid-slice `docs(arc42)` from a post-gate one. The
    // BRANCH can: while the slice is in flight everything on its branch is its work,
    // whatever the subject line says, and step 7 runs on `main` after the merge, so its
    // commits are not on the branch to be caught. Once merged there is no branch left, and
    // scope is the only selector that still resolves — so it stays as the fallback, and the
    // detail line says which was used, because the two answer subtly different questions.
    const base = g(['merge-base', 'origin/main', 'HEAD']) ?? g(['merge-base', 'main', 'HEAD']);
    const headSha = g(['rev-parse', 'HEAD']);
    const onBranch = Boolean(base && headSha && base !== headSha);
    const scoped = (g(['log', '--format=%H %s', '--', '.']) ?? '').split('\n').filter(Boolean)
      .filter((l) => new RegExp(`^\\S+ [a-z]+\\(0*${String(id).replace(/^0+/, '')}\\)!?:`).test(l))
      .map((l) => l.split(' ')[0]);
    const shas = onBranch
      ? (g(['rev-list', `${base}..HEAD`]) ?? '').split('\n').filter(Boolean)
      : scoped;
    const selector = onBranch ? 'on this branch' : `scoped (${id})`;
    if (!shas.length) return [NA, `no commits ${selector} yet — nothing has been edited to declare`];
    const files = [...new Set(shas.flatMap((s) =>
      (g(['show', '--name-only', '--format=', s, '--', 'docs/arc42/']) ?? '').split('\n').filter(Boolean)))];
    if (!files.length) return [PASS, `no arc42 file changed by the ${shas.length} commit(s) ${selector}`];

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
      : [PASS, `${files.length} arc42 file(s) changed by commits ${selector}: `
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
  // THE TARGET IS THE SLICE'S OWN LAST COMMIT, not today's HEAD.
  //
  // Pinning to HEAD was the first version and it is wrong in the direction that
  // matters: `main` keeps moving after a slice merges, so every later commit would
  // retroactively invalidate the gate of every slice already done, and `slice:check 01`
  // would go red for work that was correctly approved. The question this gate asks is
  // "did CI pass on the work being approved", and that work stopped changing when the
  // slice's last commit landed.
  //
  // So: FAIL when the recorded run is a STRICT ANCESTOR of the slice's newest scoped
  // commit — the run happened before the work finished. A run at or after it is fine,
  // which covers the ordinary case where the gate's CI run is on a later log commit.
  // With no scoped commits yet, HEAD is the only target available.
  const sliceHead = (() => {
    const log = git(['log', '--format=%H %s', '--', '.']) ?? '';
    const scoped = log.split('\n').filter(Boolean)
      .filter((l) => new RegExp(`^\\S+ [a-z]+\\(0*${String(id).replace(/^0+/, '')}\\)!?:`).test(l))
      .map((l) => l.split(' ')[0]);
    return scoped[0] ?? null;
  })();
  const head = sliceHead ?? git(['rev-parse', 'HEAD']);
  const runSha = lastRun?.checks?.head_sha;
  // BOTH SIDES RESOLVED TO FULL SHAs BEFORE ANYTHING IS COMPARED.
  //
  // The equality guard below was a string comparison, and `check.run` records do not all
  // carry the same SHA width — most are full, some abbreviated. An abbreviated record for
  // the very commit under test therefore failed `===`, fell through to `merge-base
  // --is-ancestor`, and a commit IS an ancestor of itself, so the gate reported the run as
  // behind the work with the self-refuting detail "the newest recorded run is 86af39b, an
  // ancestor of this slice's last commit 86af39b".
  //
  // The check was right about the rule and wrong about the identity of two names for one
  // commit — the same spelling-versus-concept error this project has now found in six
  // markers, this time in the tool that grades the others.
  const fullSha = (sha) => (sha ? git(["rev-parse", `${sha}^{commit}`]) : null);
  const coversHead = (() => {
    const h = fullSha(head);
    const r = fullSha(runSha);
    if (!h || !r) return null;
    if (r === h) return true;
    // `merge-base --is-ancestor` exits 0 when the first is an ancestor of the second,
    // so this reads "the run is behind the slice's last commit" — exactly the failure
    // being caught, and nothing more.
    const isAncestor = (a, b) =>
      spawnSync('git', ['merge-base', '--is-ancestor', a, b], { encoding: 'utf8' }).status === 0;
    if (isAncestor(r, h)) return false;     // the run is BEHIND the work
    if (isAncestor(h, r)) return true;      // the run is at or AFTER it
    return null;                                    // unrelated or unknown — cannot tell
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
        `the newest recorded run is ${String(runSha).slice(0, 7)}, an ancestor of this `
        + `slice's last commit ${String(head).slice(0, 7)} — it ran before the work `
        + 'finished. Run '
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
  // O-64, and it is this criterion's THIRD reading of a number that answered a different
  // question. §10's clause is "on changed fileS", and the aggregate over that set is not
  // the same claim as the threshold holding for each of them. At slice 08 the changed set
  // scored 85.71 while `routes/availability.ts` sat at 71.43 — a file the architect had
  // ruled fails §10 across three rulings and booked into arc42 §11 as debt. THIS GATE
  // WOULD HAVE SAID PASS. The per-file truth existed the whole time, in prose, in the
  // `note` of a hand-written record: the honesty in a field the gate never opened, exactly
  // as in the vacuous-score bug above.
  //
  // `mutation_per_file` comes from `collect-mutation.mjs`, which computes it from
  // Stryker's own report — so the threshold is applied to a fact no one typed. A record
  // without that field is OLDER than the collector, and is read the way it always was
  // rather than retroactively failed: the aggregate, with the reading named in the detail
  // so nobody mistakes it for the per-file one.
  const mut = [...events].reverse().find((e) => e.checks?.mutation_score !== undefined);
  const vacuous = mut?.checks?.mutation_measures_changed_files === false;
  const below = mut?.checks?.mutation_below_threshold;
  const perFile = mut?.checks?.mutation_per_file;
  const worst = perFile && Object.entries(perFile).sort((a, b) => a[1] - b[1])[0];
  check('done', `mutation score ≥ ${MUTATION_THRESHOLD}`,
    !mut ? UNVERIFIED
      : vacuous ? NA
      : below ? (below.length ? FAIL : PASS)
        : mut.checks.mutation_score >= MUTATION_THRESHOLD ? PASS : FAIL,
    !mut ? 'Stryker has not run for this slice'
      : vacuous ? `this slice changed no mutable file — ${mut.checks.mutation_score} measures the slice before it`
      : below?.length
        ? `${below.join(', ')} below ${MUTATION_THRESHOLD} — worst ${worst[1]}; `
          + `the changed set aggregates to ${mut.checks.mutation_score} and §10 is per file`
        : below
          ? `every changed file at or above ${MUTATION_THRESHOLD} — worst ${worst ? `${worst[0]} ${worst[1]}` : 'none measured'}`
          : `${mut.checks.mutation_score} — AGGREGATE, recorded before per-file collection`);

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


  // WHO approved is part of the verdict, not a detail of it.
  //
  // Under the human's 2026-09-06 delegation the orchestrator may take the gate while they
  // are away, and slice 02 was gated that way. A line reading "PASS  human approved" over
  // an orchestrator decision is precisely the misreport this check exists to prevent, one
  // level up — so the label names the actor, and a delegated gate is visibly not a human
  // one at a glance rather than eleven words into the rationale.
  const gateActor = gateE?.actor ?? (light ? 'light gate' : null);
  const approvedBy = gateActor === 'human' ? 'human approved'
    : gateActor === 'light gate' ? 'gate approved (light)'
    : gateActor ? `gate approved (${gateActor})`
    : 'human approved';
  check('done', approvedBy,
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

  // FINDINGS THE GATE HAS TO SEE — O-30.
  //
  // At slice 02's gate seven MAJOR findings read as open and SIX were fixed: each fix had
  // been written into the prose of the `finding.raised` record that reported it, and never
  // logged as an event. A human reading the log would have said the work was done; every
  // mechanism that reads the log said it was open. The orchestrator only noticed by
  // hand-writing a query, which is the discipline this file exists to replace — so the
  // gate asks the question itself now.
  //
  // Closed means RULED or RESOLVED or answered by a `review.response`. Prose inside the
  // raise does not count and must not: that is precisely the confusion being removed, and
  // a text heuristic over a rationale would guess at what a sentence means. Severity is
  // the filter because a MINOR left open is a backlog item, while a MAJOR left open is
  // either unfinished work or an unrecorded ruling — and both need the gate to say so.
  const closedRefs = new Set(events
    .filter((e) => ['finding.ruled', 'finding.resolved', 'review.response'].includes(e.event))
    .map((e) => e.ref ?? e.finding_ref)
    .filter(Boolean));
  const openSerious2 = events.filter((e) => e.event === 'finding.raised'
    && ['MAJOR', 'BLOCKING'].includes(e.severity) && !closedRefs.has(e.ref));
  check('done', 'findings ruled or resolved', openSerious2.length ? FAIL : PASS,
    openSerious2.length
      ? `${openSerious2.length} open MAJOR/BLOCKING: ${openSerious2.map((e) => e.ref).join(', ')}`
      : `every MAJOR/BLOCKING finding is ruled or resolved`);

  // The other half of A-05-5. READY asks whether the slice ADMITTED what it owes; DONE asks
  // whether it did anything about it. An `inherits:` list with no ruling behind it at the end
  // of the slice is the same omission one step later, and a slice that discharges an
  // obligation by copying it into the next file is exactly what R-05-2 kept catching.
  //
  // "Did something about it" is deliberately broad: ruled, resolved, or re-deferred with a
  // destination. Re-deferring COUNTS — an honest onward routing is a legitimate outcome and
  // the register carries it — but it must be a logged ruling in this slice's own span, which
  // is the thing prose in a design document is not.
  const ruledHere = new Set(events
    .filter((e) => ['finding.ruled', 'finding.resolved', 'finding.routed'].includes(e.event))
    .map((e) => e.ref).filter(Boolean));
  const inheritedRefs = slice.inherits ?? [];
  const undischarged = inheritedRefs.filter((r) => !ruledHere.has(r));
  check('done', 'inherited obligations discharged',
    inheritedRefs.length === 0 ? NA : undischarged.length ? FAIL : PASS,
    inheritedRefs.length === 0
      ? 'this slice inherited nothing'
      : undischarged.length
        ? `no ruling in this slice's span for ${undischarged.join(', ')} — `
          + 'rule it, resolve it, or re-defer it with a destination; carrying it silently '
          + 'into the next slice is the defect this check exists for'
        : `${inheritedRefs.join(' ')} — each ruled, resolved or re-routed here`);

  // O-44 — THE LOG MUST ACCOUNT FOR EVERY CAPTURED PROMPT.
  //
  // At slice 06 the implementer hit an unsatisfiable assertion, correctly refused to edit a
  // test-engineer file, correctly raised a DCR — and then DISPATCHED THE ARCHITECT ITSELF.
  // The architect ruled and committed. No `dcr.raised`, no `dcr.resolved`, no board move: the
  // orchestrator found out by noticing a prompt file it had not written.
  //
  // The substance was handled well and fast, and the architect's ruling was that forbidding
  // the dispatch is the wrong remedy — it puts the orchestrator on the critical path of every
  // unblock, and the measured cost of this one was seven minutes saved. THE DANGEROUS CASE IS
  // NARROWER: the ruling happened to be (a). Had it been (c), a loopback would have been due
  // and the max-2 governor would not have counted it, because the governor is worth exactly
  // what the log is.
  //
  // A reporting duty enforced only by the report is defeated by the omission it exists to
  // catch — O-39's own words about a control defeated by the thing it was built to stop. So
  // this reconciles two records that ALREADY EXIST: `capture-prompt.mjs` fires on every
  // invocation regardless of who initiates it, which is the only reason slice 06 was
  // recoverable at all. An unaccounted capture fails the slice whether or not anyone reports
  // it.
  //
  // ONE DIRECTION ONLY, and the asymmetry is not laziness. Every capture needs an event;
  // events without captures are legitimate and common — `SendMessage` resumes an agent from
  // its transcript and produces an `agent.finish` with no new prompt, which is how slice 06
  // has eighteen events against fourteen captures. Failing those would punish the cheap way
  // to continue an agent.
  const captures = (() => {
    const dir = resolve('docs/team-log/prompts');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md') && !f.includes('.report.'))
      .map((f) => f.match(/^s([0-9]{2}[a-z]?)-(.+)-(\d+)\.md$/))
      .filter((m) => m && m[1] === id)
      .map((m) => ({ file: `s${m[1]}-${m[2]}-${m[3]}.md`, role: m[2], n: m[3] }));
  })();

  const accounted = new Set(events
    .filter((e) => String(e.event).startsWith('agent.'))
    .map((e) => `${e.actor}-${String(e.span_id ?? '').match(/-(\d+)$/)?.[1]}`));
  const unaccounted = captures.filter((c) => !accounted.has(`${c.role}-${c.n}`));

  check('done', 'every dispatch reached the log', captures.length === 0 ? NA
    : unaccounted.length ? FAIL : PASS,
    captures.length === 0
      ? 'no prompt captures for this slice'
      : unaccounted.length
        ? `captured but no agent event — ${unaccounted.map((c) => c.file).join(', ')}. `
          + 'A role dispatched a role without the orchestrator seeing it; if any ruling in that '
          + 'run was (c), the loopback governor is owed one it did not count.'
        : `${captures.length} capture(s), each with an agent event`);

  // O-55 — THE REASONING HAS TO BE ON THE PR, AND FOR SIX SLICES IT WAS NOT.
  //
  // §6: "Every reply, disagreement and vote goes on the PR under §9's attribution
  // convention, because THE REASONING IS THE GRADED ARTIFACT — the record of *how* a design
  // was argued into shape is worth more than the amended design alone."
  //
  // Measured when the human noticed: PR #6 (slice 00) had 4 comments, PR #10 (slice 01) had
  // 3, and slices 02, 04, 05, 06 and 07 had ZERO. The orchestrator had been putting all of it
  // in the event log and in commit messages, which keeps the CONTENT and loses the PLACE the
  // constitution names. Every role read those PRs at review and at as-built; none remarked
  // they were empty. A rule every role can satisfy itself is being obeyed by nobody is worse
  // evidence about the process than one role forgetting it.
  //
  // No check existed because `slice:check` reads the log and CI and never the PR. This is
  // that check. It compares against the log rather than a fixed list: the roles that OWE a
  // comment are exactly the roles that produced an agent event for this slice, so a slice
  // that never ran a scribe is not failed for a scribe's silence.
  //
  // IT SAYS WHEN IT CANNOT LOOK. No `gh`, no network, or no PR for this branch is
  // UNVERIFIED — never PASS. A gate reporting green because it could not see is the defect
  // this whole file is built against, and a check that needs the network must be able to
  // admit the network was not there.
  const prComments = (() => {
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (!branch || branch === 'HEAD') return { known: false, why: 'no branch' };
    const gh = spawnSync('gh', ['pr', 'list', '--head', branch, '--state', 'all',
      '--json', 'number', '--jq', '.[0].number'], { encoding: 'utf8' });
    if (gh.status !== 0) return { known: false, why: 'gh unavailable' };
    const num = gh.stdout.trim();
    if (!num) return { known: false, why: `no PR for ${branch}` };
    const body = spawnSync('gh', ['pr', 'view', num, '--json', 'comments',
      '--jq', '.comments[].body'], { encoding: 'utf8' });
    if (body.status !== 0) return { known: false, why: `PR #${num} unreadable` };
    return { known: true, num, bodies: body.stdout.split('\n').filter(Boolean) };
  })();

  const rolesThatRan = [...new Set(events
    .filter((e) => String(e.event).startsWith('agent.') && e.actor)
    .map((e) => e.actor))].sort();

  if (!rolesThatRan.length) {
    check('done', 'reasoning is on the PR', NA, 'no role produced an agent event for this slice');
  } else if (!prComments.known) {
    check('done', 'reasoning is on the PR', UNVERIFIED,
      `${prComments.why} — cannot read the PR, and §6 puts the reasoning there`);
  } else {
    // The attribution convention is a LEADING bold role. It is deliberately not an exact
    // `**role**`: the convention as practised is `**architect · step 1 — DESIGN**`, one bold
    // span carrying the role and its context, and the first version of this check demanded
    // the bare form and failed a genuine, correctly attributed comment on its first run.
    //
    // What it must still refuse is a role NAMED IN PROSE — "the architect ruled …" — because
    // counting that would let a mention stand in for a report, which is the whole distinction
    // §9's convention exists to draw. So: bold, at the start of a line, opening with the role.
    const spoke = new Set(rolesThatRan.filter((r) =>
      prComments.bodies.some((b) => new RegExp(`^\\s*\\*\\*${r}\\b`, 'm').test(b))));
    const silent = rolesThatRan.filter((r) => !spoke.has(r));
    check('done', 'reasoning is on the PR', silent.length ? FAIL : PASS,
      silent.length
        ? `PR #${prComments.num}: no attributed comment from ${silent.join(', ')} — `
          + '§6 puts the reasoning on the PR because it is the graded artifact'
        : `PR #${prComments.num}: every role that ran is attributed`);
  }

  // O-39 — A DESIGN DOCUMENT MAY NOT BE A FINDING'S ONLY HOME.
  //
  // Ruled at slice 06: a finding existing only as a bullet cannot appear in the register, cannot
  // have an escape distance computed, and — measurably — would have let A-05-5's own check pass
  // slice 06 while dropping F-05-1. The architect stated the structural cause: §9 has the
  // orchestrator write the log from STRUCTURED REPORTS, so a finding written into a design file
  // under "assumptions and open questions" passes through no report field and is BORN UNLOGGED.
  //
  // THE RULING SAID `slice:check` SHOULD ENFORCE IT AND I DID NOT BUILD IT. Slice 08 then declared
  // eight — F-08-1..4, A-08-1..3, OQ-08-1 — and logged none, and I found that only because
  // `docs:refs` happened to fire on the one of the eight I had cited myself.
  //
  // THE TEST IS OWNERSHIP BY NUMBER, not position on the page. A ref whose slice segment matches
  // this slice is one this slice MINTED, wherever it sits — a bullet, a table cell, or mid-sentence
  // in bold. Matching on "looks like a definition" would have missed `A-08-3`, whose only
  // introduction is inside a heading that starts with other words. Refs from other slices are
  // citations and are already logged where they were raised.
  const mintedInDesign = (() => {
    const design = resolve(SLICE_DIR, `${id}-design.md`);
    if (!existsSync(design)) return null;
    const text = readFileSync(design, 'utf8');
    // `D-` is excluded, and the exclusion is the point rather than a convenience. A `D-` id is a
    // DEBT-REGISTER entry whose home is arc42 §11, which `docs:refs` already checks resolves to a
    // design definition — so it has the two homes O-39 asks for. Demanding a `finding.raised` for
    // one would be demanding that the debt register be a defect register, which it is not.
    const own = new RegExp(`\\b(?:[A-CE-Z][A-Z]?|OQ)-${id}-\\d+\\b`, 'g');
    return [...new Set(text.match(own) ?? [])].sort();
  })();

  if (mintedInDesign === null) {
    check('done', 'design findings reached the log', NA, `no ${id}-design.md`);
  } else if (!mintedInDesign.length) {
    check('done', 'design findings reached the log', NA, 'the design mints no refs of its own');
  } else {
    // ANY event carrying the ref counts, not only `finding.raised`. `R-06-1` was a DCR and
    // `OQ-07-1` an open question resolved directly; both reached the log through a different
    // event, and both are in the register. The rule is that the log knows the ref, not that it
    // learned it by one route.
    const raised = new Set(allEvents.filter((e) => e.ref).map((e) => e.ref));
    const unlogged = mintedInDesign.filter((r) => !raised.has(r));
    check('done', 'design findings reached the log', unlogged.length ? FAIL : PASS,
      unlogged.length
        ? `minted in the design and never raised — ${unlogged.join(', ')}. A finding whose only `
          + 'home is a document cannot be in the register and has no escape distance (O-39).'
        : `${mintedInDesign.length} ref(s) minted, each with a finding.raised`);
  }

  const loops = events.filter((e) => e.event === 'loopback').length;
  check('done', 'loopbacks within governor', loops <= 2 ? PASS : FAIL,
    `${loops} of max 2${loops > 2 ? ' — should have been split, not ground through' : ''}`);
}

/**
 * RULED IN THE HUMAN'S ABSENCE.
 *
 * The human delegated mid-slice authority to the architect on 2026-09-06 — scope,
 * acceptance criteria and quality goals included — with nothing escalating between steps 1
 * and 5. CLAUDE.md §6 promises in return that the gate is SHOWN what moved rather than
 * asked to notice, and a promise in a constitution with no mechanism behind it is the
 * defect this project has catalogued six times. This is the mechanism.
 *
 * It lists EVERY architect ruling in the slice, not only those that touched a criterion.
 * Filtering by keyword would be a guess about what a rationale says, and the asymmetry is
 * stark: over-listing costs the human seconds of reading, while under-listing hides the
 * exact class of change they gave up seeing in advance.
 */
const architectRulings = events.filter((e) =>
  e.actor === 'architect' && ['finding.ruled', 'dcr.resolved'].includes(e.event));

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

if (architectRulings.length) {
  console.log(dim(`\n  RULED BY THE ARCHITECT IN YOUR ABSENCE (${architectRulings.length}) — CLAUDE.md §6`));
  for (const r of architectRulings) {
    const what = r.ref ?? r.ruling ?? r.span_id ?? '—';
    const verdict = r.verdict ?? (r.ruling ? `(${r.ruling})` : '');
    const why = (r.rationale ?? r.message ?? '').replace(/\s+/g, ' ').slice(0, 132);
    console.log(`  ${String(what).padEnd(12)} ${String(verdict).padEnd(10)} ${dim(why)}`);
  }
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
