# Report · slice 00a · architect · invocation 1

**BACKFILLED.** The `SubagentStop` capture in `.claude/hooks/log-agent-finish.mjs` was written
minutes before this agent returned, and skipped because its prompt file did not yet exist when the
hook ran — the pairing is by prompt number. Reproduced verbatim from the returned report. Capture is
automatic from the next invocation.

- Task: Slice 00a design, step 1
- Returned: 2026-09-03T18:54:11Z
- Duration: 797s
- Commit: `a5ce852 docs(00a): slice design`

---

Design committed on `slice/00a-walking-skeleton` as `a5ce852`.

**Files:** `docs/slices/00a-design.md`, `docs/adr/0011-health-is-an-operational-probe.md`
(`status: proposed`), generated blocks in `docs/arc42/09-architecture-decisions.md`,
`docs/arc42/11-risks-technical-debt.md`, `docs/system-design.md`.

## Key decisions

**Module tree** — nine files across the four non-empty modules. `src/domain` ships **empty** (a
`.gitkeep`, no TypeScript). A placeholder there would be the first non-policy file in the module
whose entire claim is that only policy lives in it, and QS-12 will later assert that by scanning the
tree. `domain-is-pure` is therefore vacuously satisfied in 00a and is proved by AC-4's fixture
instead — which is precisely QS-10's argument.

**The missing port.** `src/persistence/db.ts` exports `type Db = Kysely<Database>`; application takes
`db: Db` as a parameter and imports `pingDatabase` by name. The alias is load-bearing, not sugar:
with `tsPreCompilationDeps: true`, `import type { Kysely } from 'kysely'` in application would fire
`sql-only-in-persistence`, and `import type { Db }` in `src/http` would fire
`http-must-not-reach-persistence`. So the edge layer **cannot** be handed a database handle in any
form that type-checks and passes CI — `buildServer({ logger, checkHealth: () => checkHealth(db) })`
with partially-applied use cases is the only shape left. Forced by the ruleset, not chosen.

**`/health`** crosses all three layers (`http → application → persistence`); `503` comes from an
exhaustive switch over a `HealthOutcome` union declared in application. Two consequences worth
pre-empting: the pool must **not** connect eagerly (or AC-2's unreachable case cannot start), and
`connectionTimeoutMillis` is a constant in `db.ts` rather than an env var, so §7.3 gains no row.

**Harness** — global setup, one container per run, **no `withReuse()`**, `provide`/`inject` rather
than ambient env (AC-2 needs two different `DATABASE_URL`s in one run). The migration seam:
`globalSetup` calls node-pg-migrate **unconditionally** against `src/persistence/migrations/` in 00a,
applying zero files, so slice 00 adds `0001_*.sql` and changes nothing else.

**`collect-ci.mjs`** — the interface is constrained by its consumer, `tools/slice/check.mjs`, in three
non-obvious ways written into the design: `checks.depcruise` must be lowercase `"pass"`;
`JSON.stringify(checks)` must contain `FAIL` **iff** the run failed (hence uppercase `PASS`/`FAIL` in
`jobs`/`suites`); and ratio strings are forbidden because `\b0\/` would misclassify a green run.
`allowDerived` is earned by there being no `--conclusion` flag — nothing is accepted as an argument
that is not parsed from `gh` output.

**Red-proof** — the decision logic becomes `tools/ci/red-proof.mjs` with four unit cases, per
ADR-0010's own escape hatch, because the commit-subject read must use
`github.event.pull_request.head.sha` (HEAD on a PR is the merge commit) and it must classify
per-suite Vitest results, not job conclusions.

## The C1 conflict, resolved not papered over

C1 is **unmeasurable for 00a by construction** and the retro must record it as `UNMEASURABLE`, never
as a pass. There is a second instance of the same paradox: **AC-6's `red-proof` job cannot judge
00a's own red commit** either — at that commit there is no `src/`, so `lint:arch` fails with "Can't
open 'src' for reading" and the job's precondition ("lint passed") cannot hold. 00a's red state is
evidenced by the red commit SHA, the phase-3 `verify` run passing on it, the four-case test of the
discriminator, and the human's observation at steps 5–6. C1 becomes measurable from slice 00 — the
pilot proper, which is the slice it was pre-registered to judge. `process-criteria.md` is untouched.

## Genuine ambiguity, flagged now

1. **Slice scope is one section short in three places.** Reconciling what compose starts is a **§7.1**
   edit; closing R-8's first row once the collector lands is **§11.2**; the first module dependency
   graph render is **§5.3**. None is in the slice's `arc42:` field. Scope is the human's — recommend
   adding them rather than leaving R-8 saying "`collect-ci.mjs` does not exist" after the slice
   creates it.
2. **compose starts `postgres` + `otel-lgtm` only; the service runs on the host.** §7.1 shows a third
   `scheduler` container; containerising costs a Dockerfile and a build stage maintained through
   twelve slices for no demo benefit.
3. **AC-5 and AC-6's evidence is implementer-authored** (`tools/test/*.test.mjs`). The alternative was
   worse: test-engineer-authored ones would be red at step 3, failing `npm run test:tools` and
   destroying the "red for the right reason" signal AC-6 is about. Recommend accepting and noting
   under C2 in the retro.
4. **ADR-0011** — is `/health` part of the API or part of the machinery? Recommendation: outside the
   taxonomy, outside OpenAPI, outside the business span hierarchy — but still crossing every layer.
   Option C (`/health` + `/ready`) was close and is deferred, not rejected.

## Most likely step-2 objections

- **`src/domain` shipping empty** — a walking skeleton "should" touch every module. There is no AC
  requiring a file there.
- **`.dependency-cruiser.js` needs one amendment before the red commit**, and it is the architect's to
  make (`CLAUDE.md` §2.3): `outside-in-tests-do-not-import-src`'s `from.path` becomes
  `^tests/(acceptance|architecture|concurrency|contract|performance|property|support)/`, closing the
  `tests/support/` loophole where the spawn helper lives and making Gate B's architecture/performance
  ruling structural. Rule name unchanged, so AC-4 is unaffected. **Not yet applied** — flagged rather
  than done, since this run was design-only.
- **`tests/setup/` and `vitest.config.ts` are the test-engineer's**, so the red commit carries the
  test toolchain. AC-1 is "`npm ci && npm test` starts a container and the suite connects", so the
  harness that starts it is the test. Related gap: `guard-paths.mjs` guards neither path, so both
  roles can currently write both — a hook change, and the orchestrator's, not the architect's.

One now-stale sentence in §11.1 ("The register is empty") was amended, since the generated
debt-register block directly contradicted it after ADR-0011 landed. §11.1 is outside declared scope;
leaving a self-contradicting page seemed worse than the note.
