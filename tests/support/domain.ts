/**
 * The ADR-0013 seam, shared by slice 02's domain-facing property tests.
 *
 * `docs/adr/0013-outside-in-tests-exercise-the-built-artifact.md` §6.2 · `CLAUDE.md` §5.
 *
 * `src/domain` imports nothing, exposes no HTTP route and no SQL, and
 * `outside-in-tests-do-not-import-src` forbids `tests/property/` from importing `src/` at
 * all — literal or computed. So these tests load the COMPILED artifact, `dist/domain/*.js`,
 * the same way `npm start` loads `dist/main.js`, through a dynamic import whose specifier is
 * COMPUTED from a `URL` rather than written as a literal: a literal reference to a module
 * that does not exist yet fails `tsc`, which fails `verify`, which is the job `red-proof`
 * gates the red commit on.
 *
 * NOTHING HERE THROWS. A module that will not load is returned as `null` and the caller
 * asserts on it inside its own test body — process criterion C1. The load must happen inside
 * a test body and never in a hook, for the same reason.
 *
 * `tests/property/opening-hours-dst.test.ts` (slice 01) carries its own copy of this loader.
 * It is deliberately not refactored onto this one: that file is merged, its copy is correct,
 * and rewriting a passing test's seam to share three lines is a diff a reviewer has to read
 * for no gain.
 */

export type DomainModule = Record<string, unknown> | null;

export async function loadDomainModule(name: string): Promise<DomainModule> {
  const specifier = new URL(`../../dist/domain/${name}.js`, import.meta.url).href;
  try {
    return (await import(specifier)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The named export, or `undefined` if the module did not load or does not have it. The
 * caller asserts `typeof … === 'function'` with a message naming both causes — the runtime
 * shape check ADR-0013 requires in place of the compile-time contract this seam gives up.
 */
export function exported(mod: DomainModule, name: string): unknown {
  return mod === null ? undefined : mod[name];
}

/** `dist/domain/<module>.js did not load, or does not export <name>` — one diagnosable sentence. */
export function missingExport(moduleName: string, exportName: string): string {
  return `dist/domain/${moduleName}.js did not load, or does not export ${exportName}`;
}

/** ADR-0014's bound: the largest epoch-millisecond value `new Date(...).toISOString()` renders. */
export const MAX_RENDERABLE_EPOCH_MILLIS = 8_640_000_000_000_000;

/** One day's opening hours as the domain takes them — raw `time` strings, parsed by the domain. */
export interface DayHours {
  readonly opensAt: string;
  readonly closesAt: string;
}

export type WeeklyOpeningHours = readonly (DayHours | null)[];

/** Seven identical days. Every claim below is then free of the `day_of_week` numbering question. */
export function everyDay(hours: DayHours | null): WeeklyOpeningHours {
  return Array.from({ length: 7 }, () => hours);
}
