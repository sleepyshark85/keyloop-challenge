# Report · slice 09 · test-engineer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 09 step 2 test-engineer review
- Returned: 2026-09-07T17:33:41.667Z
- Duration: 539s

---

## Finding 1 — AC-7's committed OpenAPI document path is ambiguous

**Claim.** AC-7 and the design's building-blocks table name the committed document `openapi.json`; ADR-0005 and the codebase's own precedent name it `docs/api/openapi.json` — two different files, and the slice does not say which one governs.

**Scenario.** `docs/slices/09-observability.md` AC-7: *"matches the committed `openapi.json` byte for byte"*; `docs/slices/09-design.md`'s building-blocks table: *"`openapi.json`, `harness/` — The committed document and the cURL scripts"*. Against that, `docs/adr/0005-fastify-with-typebox-schemas.md:79`: *"emitted at build time from the running route table into `docs/api/openapi.json`, and CI fails if the committed file differs."* Precedent already in the tree agrees with the ADR, not the slice file: `tests/acceptance/availability.test.ts:41` and the slice 08 test-engineer report both say the OpenAPI half is unasserted because *"no `docs:openapi` script, no `docs/api/openapi.json`"* exists yet — i.e. the codebase already expects that path. I need one literal path to build a byte-for-byte diff test against (`readFileSync` on a fixed path compared to the emitted document); as written I'd have to guess, and a wrong guess means the AC-7 test asserts against a file nothing ever writes.

**Change I'd make.** Amend AC-7 and the building-blocks table to read `docs/api/openapi.json`, matching ADR-0005 and existing precedent. The architect could instead rule the other way — root-level `openapi.json`, superseding ADR-0005's path — and that's a legitimate alternative remedy to the same finding; either resolves the ambiguity, only one keeps the ADR unchanged.

**Severity: MAJOR.** Not BLOCKING — it doesn't stop step 3 from starting on the other two files — but it blocks a correct AC-7 test, and AC-7 is one of seventeen criteria this slice is graded on.

---

## Finding 2 — the red-commit file set is undercounted, and QS-10/QS-12 are unlinked

**Claim.** The design commits two new test-engineer-owned architecture assertions that the "one red commit, three test files" framing never names, and the slice frontmatter's `quality_scenarios` list omits the two quality scenarios those assertions belong to.

**Scenario.** Decision 1 in `09-design.md`: *"A new forbidden rule arrives with its plant or it does not arrive — QS-10's claim is that the rules **fire**"* — that plant is a negative-control fixture, and QS-10's own row in `docs/arc42/10-quality-requirements.md` names its test as `tests/architecture/layering.test.ts`, which is test-engineer-owned per `CLAUDE.md` §5. Decision 2: *"The control is a QS-12 marker... the shape already used for `contended-resource-cast`"* — QS-12's row names `tests/architecture/ambiguity-containment.test.ts`, also mine, and I confirmed by reading it that it already carries six such markers by file-list equality, so a seventh (the single-increment-site control) is the same mechanism, not a new one I'd be inventing. Neither file appears in the Rulings section's "three test files," and `docs/slices/09-observability.md`'s frontmatter reads `quality_scenarios: [QS-13, QS-11, QS-14]` — QS-10 and QS-12 are absent despite being the scenarios these two controls prove. `CLAUDE.md`'s Definition of Ready requires `quality_scenarios:` to be linked; right now it isn't, for work the design itself commits to.

**Change I'd make.** Correct the Rulings section to name the actual file set — the three named plus `tests/architecture/layering.test.ts` and `tests/architecture/ambiguity-containment.test.ts` — and add QS-10 and QS-12 to the frontmatter's `quality_scenarios`. The architect could instead rule that one or both controls aren't actually required this slice (e.g. defer the QS-10 plant to a later check) — that's a different remedy to the same undercount, and I'd want to hear the reasoning before conceding it, since decision 1's own text ("arrives with its plant or it does not arrive") reads as non-optional.

**Severity: MAJOR.** It doesn't block step 3 — I know what to write regardless — but it misrepresents the diff surface to the step-5 reviewer and fails a literal Definition-of-Ready clause, and this is the close-out slice with no later slice to catch the omission.

---

## Finding 3 — QS-14's budget has no protection against cross-file database contention within the same CI job

**Claim.** As designed, the performance suite can run concurrently, in the same CI job, with other `db`-project test files against the one shared Testcontainers PostgreSQL instance — including the 20-racer concurrency suite — so its "uncontended, serial" timing figures are not guaranteed to measure only the request under test.

**Scenario, and what each file actually told me.** `tests/setup/postgres.ts` starts **one Testcontainers PostgreSQL container per test run**, deliberately shared across every file rather than per-file, for the concurrency suite's own sake. `tools/ci/run-tests.mjs` invokes the `db` project as a single `spawnSync('npx', ['vitest', 'run', '--project', 'db', ...])` — one process, not one-file-at-a-time. `vitest.config.ts`'s `db` project sets `globalSetup`, `testTimeout` and `hookTimeout` but no `fileParallelism`, `poolOptions`, or worker-count restriction, so Vitest's default file-level parallelism applies. `.github/workflows/verify.yml`'s `npm test` step (`grep` confirmed) passes only `--reporter=json --outputFile=test-results.json`, no concurrency flags. `tests/support/service.ts` shows each test file spawns its **own** `dist/main.js` process against the shared `DATABASE_URL` — so files are isolated at the connection-pool level but not at the container level, meaning two files' server processes contend for the same Postgres instance's CPU and I/O at the same wall-clock time. Net effect: nothing I found prevents `availability-budget.test.ts` running alongside e.g. `no-spurious-refusal.test.ts` mid-invocation.

**Direct answer to the live question.** As designed, I do not think QS-14's budget can fail *honestly* on CI — it risks measuring runner contention rather than the service, which is the same failure class as O-70, but worse in kind: O-70 produced a loud, obviously-wrong signal (a flat 60-second timeout, an unanswered racer) that got investigated and correctly not trusted. A contended performance run instead produces a *plausible-looking* number — p95 comes back a bit higher than expected, still parses as a real measurement — with no signal that anything unusual happened. That's a quieter failure than O-70's, and harder to catch after the fact, precisely because A-09-1's own remedy (record the machine class) tells you *which machine* ran the test but not *what else was running on it at the time*.

**Change I'd make.** Pin file-level exclusivity for `tests/performance/**` within the `db` project's invocation — either `fileParallelism: false` scoped to that project, or a separate CI pass (`vitest run --project db -t performance --no-file-parallelism` or equivalent) run apart from the rest of the suite. The architect could instead accept the finding and choose a narrower remedy — e.g. record in §11 that the figure is a noisy upper bound rather than a clean one, the way O-70/A-09-1 accepted diagnosability over elimination for the concurrency suite — and that's a legitimate, cheaper alternative I'd want ruled on explicitly rather than defaulted into by silence.

**Severity: BLOCKING.** This one I'd escalate above the other two: QS-14 exists specifically to turn §1.2's goal 5 into "a number a goal can fail," per `docs/arc42/10-quality-requirements.md`'s own framing (*"Deliberately loose... but stated, because a goal with no number is a goal nobody can fail"*). A number that can't tell the service from the runner isn't that number — it's aspirational under a different name, which is the exact defect this review was convened to catch.
