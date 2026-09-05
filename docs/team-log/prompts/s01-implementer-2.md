# Prompt · slice 01 · implementer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 01 step 4 — green
- Sent: 2026-09-04T19:35:56.600Z

---

You are the implementer at **step 4 (Green)** for **slice 01 — the domain policy core**. Branch `slice/01-domain-policy-core`, checked out, PR #10 open. Scope marker `{"slice":"01"}`.

You reviewed this design at step 2. **Read the amended design before writing anything — the human's AC-6 ruling changed the interfaces you reviewed, and it went against your argument.**

## What changed since your review, including the part where you were wrong

- **The human ruled AC-6 LITERALLY.** `src/domain` imports nothing at all, intra-domain imports included.
- **Your "there is no third path" argument was rejected.** You named a real call site — `appointmentInterval` needing minutes→milliseconds — but enumerated only two responses: value-import `durationMillis`, or re-derive `* 60_000`. The test-engineer named a third: change the *signature* so the conversion happens before the call. The architect sided with the test-engineer and recorded that an exhaustiveness claim which has not enumerated exhaustively is the same error it made one level up. Your escalation to the human was right and was acted on; the reasoning was incomplete. Worth carrying into how you write step 4.
- **The interfaces are therefore:** `appointmentInterval(startsAt, durationMillis)`, `withinOpeningHours(startsAtMillis, endsAtMillis, ianaZone, weekly)`, composition in `src/application`. Brands are kept but shrunk — they guard smart-constructor returns intra-module and no longer cross the two inter-module handoffs.
- **A new branch exists because of the ruling:** `malformed-interval`, §4.2's step 1, with property **P7** and its own mutant row. It exists only because `Interval` can no longer carry "ordered, and from the same interval" across a boundary.
- **Your DA-2 measurement narrowed the spec.** The parser accepts `00:00:00`–`23:59:59` plus the single exact value `24:00:00` — not "hours 00–24". Your real-PostgreSQL run is why.
- `npm test` is now `tools/ci/run-tests.mjs` (two invocations, merged). `pretest:nodb` / `pretest:db` exist, so the Docker-free path builds `dist/`.

## The red you must turn green

Commit `0550d09`, observed red in CI run **33911677881**:

```
nodb   ran, 9 file(s)  (exit 1)      red-proof: "red observed: ...
db     ran, 3 file(s)  (exit 0)       ambiguity-containment.test.ts,
                                      opening-hours-dst.test.ts failed,
                                      no unit test failed"
```

19 failures, every one an `AssertionError` inside a collected test body — zero import, collection or hook errors, verified from a clean `dist/`.

- `tests/property/opening-hours-dst.test.ts` — QS-9, properties P1–P7, an oracle deliberately independent of the implementation.
- `tests/architecture/ambiguity-containment.test.ts` — AC-5, QS-12, a marker scan with a corpus guard and a planted-violation control.

**These files are the test-engineer's. You must not create, edit or delete them, or anything else under `tests/property/`, `tests/architecture/`, `tests/acceptance/`, `tests/contract/`, `tests/concurrency/` or `tests/performance/`.** If you believe one is wrong, raise a DCR — do not edit it. That escalation is a signal, not a nuisance.

## Read

- `docs/slices/01-design.md` as amended (`143b500`, `fb3ff83`) — §2 interfaces, §3 the opening-hours tuple, §4.2 the decision procedure and its fixed order, §10 addressed to you, §11 the debt the ruling created.
- `docs/slices/01-domain-policy-core.md` — six ACs, the human's.
- `docs/adr/0013-...` and ADR-0001. `.dependency-cruiser.js` (`domain-is-pure`). `stryker.config.mjs`.
- `docs/DEFECTS.md` — 66 findings. T-01-3 is open against the test-engineer's own scan and is deferred to step 5, not yours to fix.

## What you build

`src/domain/duration.ts`, `src/domain/interval.ts`, `src/domain/openingHours.ts`, plus whatever `src/application` composition the design specifies, and your own unit tests under `tests/unit/`.

**Per §7, every commit you make is green** — a unit test and the code it drives, together. Small commits; if one changes more than ~150 lines it should probably have been two. The acceptance tests going green is the *end* of your loop, not the start.

## Definition of done for your step

1. All 19 failing assertions pass, and **nothing that was passing breaks** — 106 were already green and they are part of the evidence.
2. `npm run lint:arch` clean. **`domain-is-pure` is now absolute** — a single intra-domain import fails the build, which is the mechanical expression of the human's ruling.
3. `npm run typecheck` clean, `npm test` green on both projects.
4. **Mutation: this is the first slice in this project with a real score.** Threshold 0.75 on changed files, `npx stryker run`, command runner, mutating `src/**/*.ts` against `tests/unit/**`. Run it yourself and report the score. §10 names the mutants to expect; you told me at step 2 you thought 0.75 was achievable without writing tests that exist only to kill mutants — hold yourself to that. **If you cannot honestly kill a survivor, report it as a survivor rather than writing a test shaped to it.** Survivors are findings for the reviewer, not something to hide.

## Rules

- Do not write to `docs/team-log/`, do not run `npm run defects`/`status`/`board`, do not push, do not comment on the PR.
- Commit as `feat(01): …`, `test(01): …` or `refactor(01): …`, each ending with:

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW

Report the mutation score, the commit list, and anything the design got wrong that you had to work around. If the design is wrong, say so — the last two roles both found real defects in it and both were upheld.
