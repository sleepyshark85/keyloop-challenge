---
id: "0013"
title: Outside-in tests reach a pure module through the built artifact, and the test run is split so no project's results can be silently lost
status: accepted
date: 2026-09-05
supersedes: null
superseded_by: null
arc42: ["§5.2", "§8.5", "§10"]
contested: true        # revised twice under measurement before ratification

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  ACCEPTED as recommended on 2026-09-05, after Gate E, unmodified — all three clauses,
  including the third, which was not in the ADR as first written. Proposed 2026-09-04; the `date`
  above is the ratification. From here it is immutable under CLAUDE.md §4 and is superseded, never
  edited.

  Raised by the architect at step 1 of slice 01, on finding that two phase-2 artifacts of its own
  contradict each other: `.dependency-cruiser.js`'s `outside-in-tests-do-not-import-src` forbids
  `tests/property/` from importing `src/`, while arc42 §10 maps QS-9 to a property test whose subject
  is three pure functions with no HTTP or SQL boundary. A second, harder constraint was then MEASURED
  rather than reasoned about: a literal dynamic-import specifier for a module that does not exist yet
  fails `tsc`, which fails the `verify` job, which makes `red-proof` reject the red commit — so the
  obvious remedy (widen the rule) does not even work. Recommended as written below and put to the
  human's ruling at slice 01's gate rather than taken unilaterally. Testability is architecture and this is within the architect's
  authority under CLAUDE.md §6, but it changes what *outside-in* means operationally for every later
  property test, and the ownership of the test directories was itself a human ruling at Gate B.

  REVISED IN PLACE 2026-09-05, before ratification, after the test-engineer measured that the second
  clause as first written did not do what it claimed. See "Revision before ratification" below. The
  human was told this is how it is being handled and can overrule it.

  REVISED IN PLACE A SECOND TIME 2026-09-05 at slice 01 step 5, on the reviewer's finding R-01-2 and
  the architect's ruling (b): the step-2 revision's own narrowing claim was overstated, and the
  computed-import hole is narrowed rather than closed. It reached the human at Gate E with both revisions
  visible, which is the point of revising rather than superseding a decision nobody has yet taken,
  and it was accepted in that form.
---

## Context and problem statement

Slice 01 builds `src/domain`: pure modules with no HTTP route and no SQL. arc42 §10 maps **QS-9**
— opening hours across a DST transition — to `tests/property/opening-hours-dst.test.ts`, a
test-engineer file. Two phase-2 artifacts meet here and disagree.

**Found by reading.** `.dependency-cruiser.js` forbids every test-engineer-owned directory, property
included, from importing `src/`:

```js
name: 'outside-in-tests-do-not-import-src',
from: { path: '^tests/(acceptance|architecture|concurrency|contract|performance|property|setup|support)/' },
to:   { path: '^src/' },
```

Its reason — those tests *"reach the system the way a client does"* — assumes a boundary. QS-9
has none.

**Found by measuring.** The remedy that suggests itself — widen the rule for `tests/property/ →
src/domain/` — does not work. `red-proof.mjs` refuses a red commit whose `verify` job failed, and
`verify` typechecks `["src", "tests"]`:

```
await import('./definitely-missing.js')                                → TS2307, exit 2
const s = new URL('../../dist/domain/x.js', import.meta.url).href;
await import(s)                                                        → exit 0
```

At the red commit `src/domain/*.ts` does not exist, so any literal reference to it fails C1's
*"a real assertion failure rather than a missing import"*, and `red-proof`'s first precondition.

A second seam: `vitest.config.ts` puts `tests/property/**` behind a container setup.

## Considered options

- **Option A — Widen `outside-in-tests-do-not-import-src`** to allow `tests/property/ → src/domain/`
  - **Bad, decisively: it does not solve the problem.** `tsc` still fails on a module that does not
    exist yet, so `red-proof` rejects the commit. Measured.
  - Bad, because it converts an absolute rule into a list.
- **Option B — Computed dynamic import of `src/domain/*.ts`**, so `tsc` cannot resolve the specifier
  - Bad, because it obeys the rule's text while defeating its mechanism — the test reaches into
    the source tree.
  - Bad, because it would be the first place in this codebase where a rule is satisfied by concealment.
- **Option C — Load the built artifact `dist/domain/*.js`** through a computed dynamic import, guarded
  so a missing module becomes an assertion. **Chosen.**
  - Bad, because the loaded module is untyped and the test depends on the build being current.
  - Bad, because `dependency-cruiser` cannot see the load, so the rule's coverage is narrower in
    practice than its text suggests.
- **Option D — Move the test to `tests/unit/`**, the implementer's directory, and drop QS-9's
  outside-in status.
  - **Bad, decisively: `tests/unit/` is the implementer's under `CLAUDE.md` §5. The definition of done**
    would be written by the role it checks.
  - Bad, because QS-9 would lose its outside-in status, which is most of what makes it evidence.
- **Option E — Defer QS-9** to an HTTP-level property at the slice that adds the booking route.
  - Bad, because the DST rule — the substance of slice 01 and the thing ADR-0001 flagged as *"the
    one place where a DST transition can bite"* — would ship unevidenced.
  - Bad, because a property deferred past the slice that builds its subject is a property written
    by someone who has since read the implementation.
  - Worth keeping as the fallback if the human rejects Option C, and the cost of that fallback
    is named here rather than discovered then.

The **container seam** — keep `tests/property/**` in `db`, or split by need:

- **Bad, decisively:** it makes this slice's red evidence destroyable by a Docker failure, converting
  assertion failures into a crash — C1's second clause.
- Bad, because it starts a database to test three functions that import nothing, which is the
  kind of cost that teaches people to skip the suite.

The **invocation seam** — one `vitest run` over both, or split:

- **Bad, decisively, and measured:** a `globalSetup` abort in either project discards the other's
  results — 0 files, 0 tests — so §2.4's *observed red in CI* fails.

## Decision

Chosen option: **C — outside-in tests reach a pure module through the built artifact** — together with
**splitting `tests/property/` by database need**, on the naming convention `*.db.test.ts` for the
tests that need a container, **and splitting the test run itself so that no project's results can be
discarded by another project's failure**.

`.dependency-cruiser.js` is **not amended.** `npm start` is `node dist/main.js`; the client
of a pure module is a program that imports it.

**The specifier is computed because of C1, not to hide from `dependency-cruiser`.** That order matters:
a literal specifier fails `verify`; the cruise's blindness is a recorded hole.

- An outside-in test may load a **compiled artifact under `dist/`**. It may not import `src/` by any
  route, computed or not.
- It must assert the loaded module's **shape** — every export it uses, present and of the right
  type — the compile-time contract is gone.
- Whatever runs an outside-in test must guarantee a current build. `npm test` already does through
  `pretest`; `test:nodb` gains `pretest:nodb`.
- A property test that needs the database is named `*.db.test.ts`. Everything else under
  `tests/property/` runs without one.
- `vitest.mutation.config.ts` stays `tests/unit/**` only. It is not extended to property tests, for
  the reason that file documents; Stryker's sandbox may lack `dist/`.

**Third clause — the invocation split. `npm test` becomes `tools/ci/run-tests.mjs`, which:**

1. runs each project as its own `vitest run`, each writing its own JSON;
2. merges them into the `test-results.json` that `red-proof --results` reads;
3. **treats a project that did not run as a loud, distinct, non-zero failure and never as an empty
   contribution.**

Clause 3 is what makes this a decision: without it a `db` project that never ran merges as
*zero failures*.

### Revised twice before ratification

Both predate ratification, so §4 did not bind.

- **What changed.** The second clause originally said that splitting `tests/property/` between the
  `db` and `nodb` *projects* protects the red evidence. False:

  ```
  DOCKER_HOST → nothing;  npx vitest run                 aborts in
                                TestProject._initializeGlobalSetup → 0 test files, 0 tests
  DOCKER_HOST → nothing;  npx vitest run --project nodb   94 tests / 7 files, pass
  ```

  Necessary, never sufficient.
- **The narrowing recorded above was itself overstated, and the overstatement is the architect's.**
  Measured at step 5:
  - the scan catches **relative** `../src/` references — the `SRC_REFERENCE` pattern — in the seven
    outside-in directories;
  - it catches **neither** root-anchored path construction — `join(ROOT, 'src', 'domain', …)` — **nor
    any other computed form**, and the idiom it misses is the scan's own host file's;
  - `dependency-cruiser` catches **no computed form at all**, which was already recorded and is
    unchanged;
  - therefore the hole is **narrowed, not closed**, and the residue is **review**.
- **The residue is irreducible for a text scan, and is recorded as such rather than deferred** to a
  better regex: a scan cannot separate
  *constructing a path to `src/`* from *importing from `src/`*, because at the level it reads the source
  those are the same characters; §11 carries it.

## Consequences

**Good**

- QS-9 becomes executable in the slice that builds its subject, rather than several slices later.
- The two absolute rules stay absolute. Nothing becomes a list.
- The red commit's failure is an assertion with a readable message — *"`dist/domain/openingHours.js`
  did not load…"*
- The property test stops depending on Docker, so a container failure cannot destroy this slice's
  red evidence.
- The db/no-db question is settled before the slice that adds QS-8's constraint-agreement property
  inherits it.

**Bad, or deferred**

- **The loaded module is `any`.** The outside-in tests lose static typing against the domain, replaced
  by a runtime shape assertion.
- **`dependency-cruiser` cannot see a computed dynamic import.** The same technique would let a future
  test import `src/` invisibly. **Narrowed, not closed** — the scan catches the
  **relative** path (`../src/`), which is the form such a test reaches for first and which the cruise
  cannot see.
- **A dependency on the build.** A stale `dist/` produces a green or a confusing red. `pretest` and
  `pretest:nodb` close today's paths.
- ~~One mechanical unknown~~ — **measured before this ADR was accepted**, not left as a promise:

  ```
  pathToFileURL(resolve('dist/domain/_spike.js')).href  → typechecks; executes under Vitest
  await import('../../src/domain/duration.js')          → npm run typecheck fails, TS2307
  /* @vite-ignore */ and server.deps.external           → recorded as unneeded
  ```

- A filename convention (`*.db.test.ts`) is a weaker guarantee than a directory the tooling enforces;
  a test forgetting the suffix fails on connection, loudly.
- **The second clause was published claiming a protection it did not provide**, and it took a
  reviewer's objection and a measurement to find: naming a mechanism's capability is not naming its
  configuration.
