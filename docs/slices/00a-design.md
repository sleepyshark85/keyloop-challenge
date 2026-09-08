# Slice 00a — design

> **Merged.** The scaffold slice: a clean checkout builds, starts, tests against a real PostgreSQL,
> and fails CI on a layering violation — a ruleset that has never rejected anything not being
> evidence. Reconciled at step 7 into the arc42 sections the slice file declares; deliberation on
> PR #4 and in the event log, and the two review-discipline rules it produced in the phase-4 retro.

## Decided

- **Nine files.** `src/domain` ships empty behind a `.gitkeep`: a placeholder would be the first
  non-policy file in the module whose only claim is that just policy lives there.
- **The composition root uses partial application.** `main.ts` holds the only database handle,
  `buildServer` takes use cases already bound to it, and persistence exports its type so nothing above
  names Kysely. With pre-compilation dependencies on, the ruleset forecloses every shape *naming* the
  handle — a generic parameter evades it only by not naming it.
- **`GET /health` is an operational probe, not a sixth operation.** Both status codes return the same
  small body, never `problem+json`: a degraded probe is not a failed *request*, and every taxonomy row
  names the component that decided the failure, which a TCP timeout is not. So the taxonomy gains no
  row and the contract still describes **five** operations — though outside the *contract* is not
  outside the *architecture*, and the route crosses every layer under unchanged layering rules. A
  one-second connect timeout, a constant, bounds its failure; the pool must not connect at boot or
  the `503` is untestable. Cost: no liveness/readiness split. A second endpoint was refused for now,
  not on principle — nothing would consume one. **Ruled by the architect, never human-ratified.**
- **One container per run**, started in a global setup with no reuse, its connection details passed
  through Vitest's provide/inject rather than ambient environment; isolation is by data. The
  migration runner is called **unconditionally** against a directory the setup guarantees exists, or
  the red commit dies in setup rather than in assertions.
- **Two Vitest projects**, split on whether a test needs the database. `npm test` runs both into one
  results file, which the red-proof job requires.
- **The service is compiled; there is no TypeScript loader.** The build runs before the tests, so
  `npm ci && npm test` satisfies AC-1 literally and the acceptance test spawns the artifact.
- **`lint:arch` is a wrapper, not the bare CLI.** It spawns the repository's own `depcruise` with
  **no `PATH` fallback**, exiting 2 if it is absent; fails on any environment issue while printing the
  compiler version; fails **per root** when a root cruised nothing; and exports a pure judgement
  function over the whole result. It stays **one** cruise, or the rule forbidding outside-in tests
  from importing `src/` stops firing.
- **The CI collector writes nothing it did not compute**, which earns its right to append a derived
  record; it exits 2 rather than guessing, and is idempotent on the run id.
- **The red-proof tool reads its arguments, never the environment**, is pure, and exits 0 satisfied
  or not applicable, 1 violated, 2 on misuse. Only `tests/unit/` must pass; the red zone is every
  other test-engineer directory, integration included.
- **The outside-in rule names the seven test-engineer directories explicitly**, amended at step 2;
  unit and integration stay out, both legitimately importing `src/`. That boundary is structural: a
  file reaching the database only through a connection string is the test-engineer's, one importing
  `src/` the implementer's.

## Ruled

| # | Finding | Ruling |
|---|---|---|
| **O1** | test-engineer: the AC-4 fixture cruises 0 modules at exit 0 | **(c)** — AC-4 and QS-10 named; assert coverage everywhere |
| **O2** | test-engineer: nothing said how the service is built or started | **(a)** — compile; `tests/support/` is the test-engineer's |
| **O3** | test-engineer: the tool suite is a literal `&&` chain, not a glob | **(a)** — all three tool tests are test-engineer-authored |
| **O-1** | implementer: the red zone makes two later slices unpassable | **(d) → human: AC-6 reads broad** — any test-engineer-owned suite |
| **O-2** | implementer: two more collector constraints are load-bearing | **(a)** — 4 and 5 below |
| **S-1** | **architect, self-raised**: this design worked around the test-first invariant | **(c)** on its authority — the suite joins the red commit's own CI job |
| **F1, F2** | test-engineer: AC-3's predicted red was wrong; the guard counted modules overall | **(a)** — per **root** |
| **F6, F7** | test-engineer: ordering is a list property; `engines.node` is wrong twice | **(a)** — see below |
| **J-1…J-3** | test-engineer: judgement signature, path normalisation, job keys | **(a)** — whole cruise result; last-`/tests/` fallback; a checked name→key map |
| **A-1** | **architect, self-raised**: the wrapper had the `PATH` fallback its comment forbade | **(a)** — exit 2 |

Also ruled by the human that day: the arc42 scope gains four sections, and **`docker-compose.yml`
starts PostgreSQL and the telemetry stack only**, with the service on the host.

**S-1 outlived the slice**, and is why the constitution now makes a breach of a standing invariant
nameable as a design defect. Every other ruling was a clarification; no loopback was consumed.

## Measured, and cited nowhere else

**An inert cruise and a clean one are indistinguishable at exit 0** — O1 entire:

```
exit 0 · violations 0 · totalCruised 0 · modules 0 · stderr empty
summary.environment.issues[0].name = "missing-typescript-transpiler"
```

**An absent compiler and an out-of-range one are byte-identical there** on
`dependency-cruiser@18.2.0`: exit 0, nothing cruised, a placeholder version, and a description string
interpolating the *supported* range while the wrapper short-circuits before loading the compiler.
**So no version-comparison guard is constructible from it** — gating on the environment issues is the
only option. That range lives in the package's metadata and is **not** a peer dependency, so nothing
warns on a bump.

**The declared Node range promised support the tree refuses:**

```
testcontainers@12.1.0       >= 22.22
vitest@5.0.0                ^22.12.0 || ^24.0.0 || >=26.0.0
dependency-cruiser@18.2.0   ^22 || ^24 || >=26
```

22.11–22.21 passes our floor then fails a strict install; 23.x satisfies the declared range while two
packages exclude it. Corrected to `">=22.22.0 <23 || >=24.0.0 <25"`.

**The migration tool against a directory holding only `.gitkeep` is a clean no-op.** It ignores
dotfiles and creates its bookkeeping table *before* checking whether the list is empty, so the table
exists and nothing applies. No zeroth migration.

**Five constraints the Definition-of-Done gate imposes on the collector**, invisible from the schema,
each a silent corruption of that gate:

1. The layering check must record the lowercase string `"pass"`.
2. The serialised checks contain `FAIL` **iff** the run failed — the gate decides *red before green*
   by pattern-matching over them.
3. No ratio strings anywhere: `0/0 skipped` reads a green run as red.
4. Records are appended **oldest-run-first**: the gate takes the last positionally, the GitHub CLI
   returns newest-first.
5. The timestamp is the run's own update time, never the collection time, or a red run collected with
   its green successor fails the evidence chain on a correct slice.

Absent the layering step, the collector records `"not-run"` — fail closed. **The red was observed**,
the red-proof tool replayed offline against that run's artifact at exit 0.

## Debt booked

| Item | Why not here |
|---|---|
| The gate should order CI records by timestamp, not position | The slice that first feeds the gate must not also fix it |
| The tool suite should discover its test files, not name them | O3 depends on the literal chain until all three are wired |
| The module-graph script renders empty and clean identically | Cosmetic; gates nothing |
| `docker-compose.yml` does not start the service | Human-ruled: a Dockerfile and image caching, for no demo gain |
| **Standing:** re-check the supported compiler range on any bump | The symptom is a green `lint:arch` that examined nothing |
| **Standing:** red-zone and must-pass lists anchor at `^tests/` | A monorepo split hides a unit failure from AC-6's must-pass clause |
