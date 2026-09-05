/**
 * Which slice or phase is this agent run part of?
 *
 * Both hooks used to read `docs/team-log/.scope` and trust it. That marker is a
 * gitignored file the orchestrator is expected to remember to update, and at slice 02
 * it was not: `.scope` still said `{"slice":"01"}` while the branch said
 * `slice/02-book-and-read-an-appointment`. Four agent runs — the step-1 design, both
 * step-2 AGREE reports and the step-2 adjudication — were logged as slice 01 and their
 * prompts and reports were filed as `s01-*`. The architect went looking for
 * `s02-*.report.md`, found nothing, and adjudicated eleven objections from a relay
 * rather than from what the roles actually wrote.
 *
 * Nothing reported a problem, because losing the distinction is silent: the marker was
 * present and parseable, so the "no scope marker" warning never fired. A guard that
 * only checks whether a fact is MISSING cannot see the fact being WRONG — which is the
 * same shape as `depcruise` exiting 0 having cruised nothing, `vitest` writing 0 tests
 * after an aborted `globalSetup`, and Stryker reporting survivors it never activated.
 *
 * So the branch is the authority. It cannot go stale, because it IS the slice: `§7`
 * requires one branch per slice, and the branch is created when the slice starts rather
 * than remembered afterwards. The marker remains the fallback for phase work and for
 * anything running on `main`, where there is no slice branch to read.
 *
 * A DISAGREEMENT IS REPORTED RATHER THAN SILENTLY RESOLVED. The branch wins, and the
 * note says so, because the next person to hit this needs to see which source was
 * believed and why — not to discover, four runs later, that a directory listing is the
 * only evidence anything went wrong.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

/** `slice/02-book-and-read-an-appointment` → `02`; `slice/00a-…` → `00a`. */
export function sliceFromBranch(cwd) {
  const r = spawnSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8' });
  if (r.status !== 0) return null;
  return r.stdout.trim().match(/^slice\/(\d+[a-z]?)-/)?.[1] ?? null;
}

/**
 * @param {string} cwd
 * @param {(msg: string) => void} note  where a disagreement or an absence is reported
 * @returns {{slice?: string} | {phase: string}}
 */
export function resolveScope(cwd, note) {
  let marker = null;
  const markerPath = join(cwd, 'docs/team-log/.scope');
  if (existsSync(markerPath)) {
    try {
      marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    } catch {
      note('unparseable scope marker');
    }
  }

  const branch = sliceFromBranch(cwd);
  if (branch) {
    if (marker?.slice && String(marker.slice) !== branch) {
      note(
        `scope marker says slice ${marker.slice} but the branch says slice ${branch} — `
        + 'using the branch. The marker is stale; update docs/team-log/.scope.',
      );
    }
    return { slice: branch };
  }

  if (marker && (marker.slice || marker.phase)) return marker;
  note('no scope marker and no slice branch; defaulted to phase 0');
  return { phase: '0' };
}
