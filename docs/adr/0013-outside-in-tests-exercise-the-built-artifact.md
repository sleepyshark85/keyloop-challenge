---
id: "0013"
title: Outside-in tests reach a pure module through the built artifact, and the test run is split so no project's results can be silently lost
status: proposed
date: 2026-09-04
supersedes: null
superseded_by: null
arc42: ["§5.2", "§8.5", "§10"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  Raised by the architect at step 1 of slice 01, on finding that two phase-2 artifacts of its own
  contradict each other: `.dependency-cruiser.js`'s `outside-in-tests-do-not-import-src` forbids
  `tests/property/` from importing `src/`, while arc42 §10 maps QS-9 to a property test whose subject
  is three pure functions with no HTTP or SQL boundary. A second, harder constraint was then MEASURED
  rather than reasoned about: a literal dynamic-import specifier for a module that does not exist yet
  fails `tsc`, which fails the `verify` job, which makes `red-proof` reject the red commit — so the
  obvious remedy (widen the rule) does not even work. Recommended as written below. AWAITING the
  human's ruling at slice 01's gate. Testability is architecture and this is within the architect's
  authority under CLAUDE.md §6, but it changes what *outside-in* means operationally for every later
  property test, and the ownership of the test directories was itself a human ruling at Gate B — so it
  is put to the gate rather than taken unilaterally.

  REVISED IN PLACE 2026-09-05, before ratification, after the test-engineer measured that the second
  clause as first written did not do what it claimed. See "Revision before ratification" below. The
  human was told this is how it is being handled and can overrule it.
---

## Revision before ratification — 2026-09-05

This ADR was revised in place at slice 01's step-2 loopback rather than superseded. `CLAUDE.md` §4
says *"Never edit an **accepted** ADR"*; this one is `status: proposed` and has never been ratified,
so the rule does not bind — and superseding a decision nobody has taken manufactures a history of a
decision that did not happen, which inverts the reason ADRs are immutable. The orchestrator confirmed
the reading rather than overruling it.

**What changed.** The second clause originally said that splitting `tests/property/` between the `db`
and `nodb` *projects* keeps a container failure from destroying a slice's red evidence. Measured with
`DOCKER_HOST` pointed at nothing, that is false: `npx vitest run` aborts in
`TestProject._initializeGlobalSetup` and writes a `test-results.json` with **0 test files and 0
tests**, discarding the `nodb` project's results, while `npx vitest run --project nodb` alone passes 94
tests across 7 files. `red-proof --results` reads the combined file, so the red could arrive as an
empty results file and `CLAUDE.md` §2.4's *"observed red in CI"* would not be met.

The project split was necessary and never sufficient. A third clause — the invocation split — is added
below, and the *Bad, or deferred* list is narrowed where the test-engineer closed a hole it named.
Nothing in the Decision was reversed; one clause was found to be doing less than it claimed.

## Context and problem statement

Slice 01 builds `src/domain`: three pure modules that import nothing outside themselves and expose no
HTTP route and no SQL. arc42 §10 maps **QS-9** — opening hours across a DST transition — to
`tests/property/opening-hours-dst.test.ts`, a file the test-engineer owns.

Two things stand in the way, and they were established in different ways.

**Found by reading.** `.dependency-cruiser.js` forbids every test-engineer-owned directory, property
included, from importing `src/`:

```js
name: 'outside-in-tests-do-not-import-src',
from: { path: '^tests/(acceptance|architecture|concurrency|contract|performance|property|setup|support)/' },
to:   { path: '^src/' },
```

Its stated reason is that those tests *"reach the system the way a client does — over HTTP, and over
SQL against the real database."* That sentence assumes every property is expressible at a boundary.
QS-9's is not: the subject is a function, and in slice 01 there is no route, no repository and no
query. The rule and the scenario are both phase-2 artifacts of the architect's, and slice 01 is the
first slice at which they meet.

**Found by measuring.** The remedy that suggests itself — widen the rule for `tests/property/ →
src/domain/` — does not work, for a reason that has nothing to do with layering. `tools/ci/red-proof.mjs`
refuses a red commit whose `verify` job did not conclude `success`, and `verify` runs
`npm run typecheck` over `tsconfig.json`, whose `include` is `["src", "tests"]`. Measured with the
project's own `typescript@6.0.3` and the project's `compilerOptions`:

```
await import('./definitely-missing.js')                                → TS2307, exit 2
const s = new URL('../../dist/domain/x.js', import.meta.url).href;
await import(s)                                                        → exit 0
```

At the red commit `src/domain/*.ts` does not exist, because the implementer has not run. So **any
static or literal-dynamic reference to it fails the criterion the red commit exists to satisfy** — C1's
*"a real assertion failure rather than a missing import"*, and `red-proof`'s first precondition. The
question is therefore not only *may* an outside-in test import `src/`, but *how can it refer to code
that does not yet exist and still produce an assertion failure*.

A second, smaller seam sits underneath the same file. `vitest.config.ts` puts `tests/property/**` in
the `db` project, behind `globalSetup: tests/setup/postgres.ts`. A pure-domain property test would
start PostgreSQL to exercise functions that import nothing — and, more seriously, a container failure
would convert this slice's red evidence from assertion failures into a `globalSetup` crash. That is
precisely the trap slice 00's design was built to avoid, and it is the same criterion at risk.

## Considered options

- **Option A — Widen `outside-in-tests-do-not-import-src`** to allow `tests/property/ → src/domain/`,
  and import the modules statically.
- **Option B — Computed dynamic import of `src/domain/*.ts`**, so `tsc` cannot resolve the specifier
  and `dependency-cruiser` cannot extract the edge. Leave the ruleset untouched.
- **Option C — Load the built artifact `dist/domain/*.js`** through a computed dynamic import, guarded
  so a missing module becomes an assertion. Leave the ruleset untouched.
- **Option D — Move the test to `tests/unit/`**, the implementer's directory, and drop QS-9's
  outside-in status.
- **Option E — Defer QS-9** to an HTTP-level property at the slice that adds the booking route.

And, orthogonally, for the container seam: **keep `tests/property/**` in the `db` project**, or **split
it** by whether the property needs a database.

And, once the project split was measured insufficient: **keep one `vitest run` over both projects** and
accept that a `globalSetup` abort discards everything, or **split the invocation** so each project's
results survive the other's failure.

## Decision

Chosen option: **C — outside-in tests reach a pure module through the built artifact** — together with
**splitting `tests/property/` by database need**, on the naming convention `*.db.test.ts` for the
tests that need a container and the `nodb` project for everything else under that directory, **and
splitting the test run itself so that no project's results can be discarded by another project's
failure**.

`.dependency-cruiser.js` is **not amended.** `outside-in-tests-do-not-import-src` stays absolute, and
so does `domain-is-pure`.

The load-bearing part is that Option C is not an evasion invented for this slice; it is the convention
this project already has, applied to a different shape of module:

> `npm start` is `node dist/main.js`, and slice 00a's acceptance harness *"spawns the artifact a
> deployment would actually run"*. The client of a service is a process that starts it; the client of a
> pure module is a program that imports it. Importing `dist/domain/openingHours.js` is the importing
> equivalent of spawning `dist/main.js`, and it is a smaller step away from the existing convention
> than any of the alternatives.

The independence the rule protects is preserved by the mechanisms that actually carry it, and they are
untouched: `guard-paths.mjs` denies the test-engineer read access to `src/`; the red commit precedes any
implementation; and the signatures the test is written against come from the slice design, which is the
same relationship an acceptance test has with the OpenAPI contract.

**The specifier is computed because of C1, not to hide from `dependency-cruiser`.** That order matters.
A literal specifier fails `verify`; the computed one is what makes the red an assertion failure. That
`dependency-cruiser` also cannot see it is a consequence of the fix, not its purpose — and it is
recorded here as a hole in the rule rather than left for someone to find, because a rule with an
invisible bypass that nobody has written down is worse than one with a documented exception.

Scope of the ruling, so no later slice has to guess:

- An outside-in test may load a **compiled artifact under `dist/`**. It may not import `src/` by any
  route, computed or otherwise.
- It must assert the loaded module's **shape** — every export it uses, present and of the right type —
  before using it, because the compile-time contract is gone.
- Whatever runs an outside-in test must guarantee a current build. `npm test` already does through
  `pretest`; `npm run test:nodb` gains `pretest:nodb`.
- A property test that needs the database is named `*.db.test.ts`. Everything else under
  `tests/property/` runs without one, and a file must match exactly one project's `include`.
- `vitest.mutation.config.ts` stays `tests/unit/**` only. It is not extended to property tests, for the
  reason that file already documents and for a second one: Stryker's sandbox may not hold a current
  `dist/`.

**Third clause — the invocation split.** `npm test` becomes `tools/ci/run-tests.mjs`, which:

1. runs the two projects as **two separate `vitest run` invocations**, each writing its own JSON, and
   runs the second regardless of the first's exit code;
2. merges them into the single `test-results.json` that `red-proof --results` reads, preserving 00a's
   single-file invocation contract so `red-proof`'s interface does not change;
3. **treats a project that did not run as a loud, distinct, non-zero failure and never as an empty
   contribution** — a missing or zero-file project JSON fails the step before `red-proof` is reached.

Clause 3 is not optional and is the reason this is a decision rather than a chore. With 1 and 2 alone,
a `db` project that never ran merges as *zero failures*, which is indistinguishable from a `db` project
in which everything passed — 00a's "a cruise that exits 0 says nothing about what it examined", one
level up, and worse than the defect it replaces: conditional on Docker before, invisible on every
slice after.

It is built as orchestrator tooling prep rather than slice work, by the human's ruling of 2026-09-05,
on the precedent of `fast-check` and the phase-4 C7 cluster: it touches CI, `package.json` and
`tools/`, and no `src/`. Slice 01's declared scope is unchanged. It gets `tools/test/run-tests.test.mjs`
like every other tool, and is checked against mutants rather than asserted to discriminate.

## Consequences

**Good**

- QS-9 becomes executable in the slice that builds its subject, rather than several slices later.
- The two absolute rules stay absolute. Nothing becomes a list.
- The red commit's failure is an assertion with a readable message — *"`dist/domain/openingHours.js` did
  not load, or does not export `withinOpeningHours`"* — rather than a compile error addressed to CI.
- The property test stops depending on Docker, so a container failure cannot destroy this slice's red
  evidence, and `npm run test:nodb` runs slice 01's whole outside-in surface.
- The db/no-db question is settled before the slice that adds QS-8's constraint-agreement property
  inherits it.

**Bad, or deferred**

- **The loaded module is `any`.** The outside-in tests lose static typing against the domain, replaced
  by a runtime shape assertion. A signature change that a compiler would have caught now surfaces as a
  test failure instead.
- **`dependency-cruiser` cannot see a computed dynamic import.** The same technique would let a future
  test import `src/` invisibly. **Narrowed at the step-2 revision**: the test-engineer is adding a
  source scan it owns, under `tests/architecture/`, that fails when an outside-in test file references
  `src/` by any route — which catches the computed form the cruise cannot. So this is no longer
  *"review is the only thing standing there"*; it is a second mechanism, owned by the role that would
  be the one to breach it. arc42 §11 carries what remains.
- **A dependency on the build.** A stale `dist/` produces a green or a confusing red. `pretest` and
  `pretest:nodb` close the two paths that exist today; a third would need the same treatment.
- ~~One mechanical unknown~~ — **measured before this ADR was accepted**, not left as a promise: a
  computed `file://` specifier built with `pathToFileURL(resolve('dist/domain/_spike.js')).href` both
  typechecks and **executes under Vitest** (two tests passed under `--project nodb`, one asserting that
  a computed import of a missing `dist/` module rejects at runtime), while the literal control
  `await import('../../src/domain/duration.js')` fails `npm run typecheck` with `TS2307` and typecheck
  returns clean once it is removed. The fallbacks `/* @vite-ignore */` and `server.deps.external` are
  recorded as unneeded. This is the *Bad, or deferred* item that turned out not to be either.
- A filename convention (`*.db.test.ts`) is a weaker guarantee than a directory the tooling enforces. A
  test that forgets the suffix runs without a container and fails on connection — loudly, which is the
  acceptable direction, but it is a convention rather than a constraint.
- **The second clause was published claiming a protection it did not provide**, and it took a
  reviewer's objection and a measurement to find. The clause is now two mechanisms rather than one,
  but the general lesson is the one the phase-4 retro already recorded and this ADR failed to apply to
  itself: naming a mechanism's capability is not naming its configuration, and the configuration here
  was what `npm test` actually invokes.

## Pros and cons of the options

### Option A — widen the ruleset

- Good, because the dependency would be visible in the graph and honestly declared rather than
  computed.
- Good, because static imports keep the tests type-checked against the domain.
- **Bad, decisively: it does not solve the problem.** `tsc` still fails on a module that does not exist
  at the red commit, so `verify` fails and `red-proof` rejects the commit. Measured, not argued.
- Bad, because it converts an absolute rule into a list. `domain-is-pure`'s own comment gives the
  reason: *"the moment an exception is granted this stops being a statement about the core and becomes
  a list."* The same applies here.

### Option B — computed dynamic import of `src/`

- Good, because it needs no build and no ruleset change, and it typechecks.
- Bad, because it obeys the rule's text while defeating its mechanism — the test reaches into the
  source tree and hides the edge from the tool whose whole job is to see edges. The distinction from
  Option C is not cosmetic: `dist/` is the artifact the project already treats as the boundary, and
  `src/` is the thing the rule names.
- Bad, because it would be the first place in this codebase where a rule is satisfied by concealment,
  and the next person needing an escape hatch would find one and conclude the rules are decorative.

### Option C — load the built artifact

- Good, because it extends a convention the project already relies on rather than inventing one.
- Good, because the guarded load turns "not implemented yet" into an assertion with a message, which
  is what C1 asks for.
- Good, because the test exercises the same artifact a deployment runs, including whatever the compiler
  did to it.
- Bad, because the loaded module is untyped and the test depends on the build being current.
- Bad, because `dependency-cruiser` cannot see the load, so the rule's coverage is narrower in practice
  than its text suggests.

### Option D — move it to `tests/unit/`

- Good, because it is the simplest thing that compiles: unit tests may import `src/` and are exempt
  from the rule.
- Good, because it would feed the mutation score, which no other option does.
- **Bad, decisively:** `tests/unit/` is the implementer's under `CLAUDE.md` §5. The definition of *done*
  for the slice's headline criterion would be written by the role it exists to check, and the red commit
  could not be authored by the test-engineer at all.
- Bad, because QS-9 would lose its outside-in status, which is most of what makes it evidence.

### Option E — defer QS-9 to an HTTP-level property

- Good, because it needs no new mechanism: by then there is a real boundary and a real repository, and
  the property would be end-to-end.
- Good, because it would also cover AC-4's end-to-end form and the `400` mapping, which Option C does
  not.
- Bad, because the DST rule — the substance of slice 01 and the thing ADR-0001 flagged as *"the one
  place in the system where a DST transition can bite"* — would ship with no executable evidence for
  several slices.
- Bad, because a property deferred past the slice that builds its subject is a property written by
  someone who has since read the implementation.
- Worth keeping as the fallback if the human rejects Option C, and the cost of that fallback is named
  here rather than discovered then.

### The invocation seam — keep one `vitest run` over both projects

- Good, because it is the status quo, needs no new tooling, and keeps one command as the whole story.
- Good, because it produces `test-results.json` with no merge step, and a merge step is a new place to
  be wrong about what ran.
- **Bad, decisively, and measured:** a `globalSetup` abort in either project discards the other's
  results entirely — 0 files, 0 tests — so `red-proof` sees no failing suite and §2.4's *observed red
  in CI* is not met. The failure mode is not hypothetical; it is what `vitest.config.ts`'s own comment
  already warned about, one level up from where it was written.

### The container seam — keep `tests/property/**` in the `db` project

- Good, because it is the status quo and needs no edit.
- Good, because one home for all property tests is simpler to explain than two.
- **Bad, decisively:** it makes this slice's red evidence destroyable by a Docker failure, converting
  assertion failures into a `globalSetup` crash. Slice 00's design engineered against exactly that, and
  C1's second clause is what is at risk.
- Bad, because it starts a database to test three functions that import nothing, which is the kind of
  cost that teaches people to skip the suite.
