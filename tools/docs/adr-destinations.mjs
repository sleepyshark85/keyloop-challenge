#!/usr/bin/env node
/**
 * A DESTINATION AN ADR NAMES MUST BE REAL, AND MUST BE RECORDED SOMEWHERE ELSE — A-05-5.
 *
 * Split out of `adr-invariants.mjs` rather than living beside the option-set guard, for a
 * reason worth stating: that file is a CLI whose module body runs and exits, so nothing in
 * it can be imported by a test. Its own guard is exercised only by spawning a process, and
 * the cases below — a fold cycle, a redirect to a slice that never existed — are far easier
 * to state as function calls than as directory fixtures. A check nobody can unit-test is how
 * this project got `lint:arch` passing over an unexamined `src/`.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { frontmatter } from '../lib/frontmatter.mjs';
import { destinationSlices } from '../lib/deferrals.mjs';

/**
 * "AN ADR MAY NEVER BE THE ONLY PLACE A DESTINATION IS RECORDED." The reasoning is the
 * whole R-05-2 family: a decision record said work lands at slice N, no tool read it, and
 * the obligation survived only as long as someone remembered it. Two failures follow, and
 * both have actually happened here rather than being imagined:
 *
 *   TOMBSTONE  — OQ-05-2 was routed to slice 10, which Gate D had folded into 09 two days
 *                before the design named it. A destination that no longer exists reads
 *                exactly like one that does.
 *   UNRECORDED — a routing that exists only in an ADR is invisible to `slice:check`, so the
 *                receiving slice can reach Ready and Done without ever admitting it.
 *
 * ONLY FORWARD REFERENCES ARE DESTINATIONS. An ADR naming a slice that is already `done` is
 * citing history — ADR-0016 on slice 00a, ADR-0017 on slices 01 and 02 — and demanding a
 * deferral record for those would be nonsense. The rule is therefore mechanical rather than
 * a guess at what a sentence means: a slice named in a Decision that is NOT done is being
 * pointed at, and must be a live slice with a matching deferral in the log.
 */
export function checkDestinations(adrDir, sliceDir, events) {
  const problems = [];
  if (!existsSync(adrDir) || !existsSync(sliceDir)) return problems;

  const slices = new Map();
  for (const f of readdirSync(sliceDir).filter((x) => x.endsWith('.md') && !x.startsWith('_'))) {
    const fm = frontmatter(readFileSync(join(sliceDir, f), 'utf8'));
    if (fm.id) slices.set(String(fm.id).padStart(2, '0'), { ...fm, file: f });
    else if (fm.folded_into) {
      const m = f.match(/^(\d{2}[a-z]?)-/);
      if (m) slices.set(m[1], { folded_into: String(fm.folded_into).padStart(2, '0'), file: f });
    }
  }

  const routed = destinationSlices(events);

  for (const file of readdirSync(adrDir).filter((x) => /^\d{4}-.*\.md$/.test(x))) {
    const text = readFileSync(join(adrDir, file), 'utf8');
    // The Decision section only: an ADR's Context and Consequences discuss slices freely,
    // and it is the DECISION that routes work.
    const m = text.match(/^##\s+Decision[\s\S]*?(?=^##\s|\Z)/m);
    if (!m) continue;

    for (const id of new Set([...m[0].matchAll(/slices?\s+(\d{2}[a-z]?)/gi)].map((x) => x[1]))) {
      // A FOLD IS A REDIRECT, NOT A DANGLING POINTER.
      //
      // This failed ADR-0011 on its first run — its Decision names slice 10, which Gate D
      // folded into 09 — and that was the wrong verdict twice over. §4 makes an accepted
      // ADR immutable, so a hard failure here demands an edit the constitution forbids and
      // leaves the only lawful remedy as superseding a decision that has not changed. And
      // it misreads the tombstone: `folded_into` exists precisely so that references do not
      // dangle, and a reader following ADR-0011 to slice 10 is TOLD where the work went.
      //
      // So the fold is followed and the surviving slice is checked. What still fails is a
      // pointer that resolves to nothing — a fold with no successor, or a slice id that was
      // never real, which is the OQ-05-2 defect in its original form.
      const seen = [];
      let target = slices.get(id);
      let resolved = id;
      while (target?.folded_into) {
        if (seen.includes(resolved)) { target = null; break; }   // a fold cycle resolves nowhere
        seen.push(resolved);
        resolved = target.folded_into;
        target = slices.get(resolved);
      }

      if (!target) {
        problems.push({ file, kind: 'destination-unknown',
          detail: seen.length
            ? `Decision names slice ${id}, folded to ${resolved}, which does not exist — `
              + 'the redirect leads nowhere'
            : `Decision names slice ${id}; no such slice in ${sliceDir}` });
        continue;
      }
      if (target.status === 'done') continue; // history, not a destination
      if (!routed.has(resolved)) {
        problems.push({ file, kind: 'destination-unrecorded',
          detail: `Decision routes work to slice ${resolved}`
            + (resolved === id ? '' : ` (named as ${id}, folded)`)
            + ' and no deferral in the log names it. An ADR may never be the only place a '
            + 'destination is recorded — log the ruling with `deferred_to`, or a '
            + '`finding.routed` quoting the ruling that already named it.\n    '
            + 'RESIDUE: this verifies the slice is live and receiving deferrals, not that '
            + "THIS ADR's obligation is one of them — there is no ADR-to-ref link to check "
            + 'against, and inventing one from prose is the guess this tool refuses to make.' });
      }
    }
  }
  return problems;
}
