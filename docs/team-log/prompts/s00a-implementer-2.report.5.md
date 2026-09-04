# Report · slice 00a · implementer · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 00a step 4 commits 1-6
- Returned: 2026-09-04T05:42:01.545Z
- Duration: 9095s

---

Five commits. Everything green, unpushed.

## The headline: 6.34 was not a measurement of the tests

Before writing a single test I checked whether the number was real, and it was not. **118 of the 130 "survivors" carry `testsCompleted: 0`** in `mutation.json` — Stryker ran no tests against them and recorded them as survived. Only 21 of 142 mutants were tested at all.

The decisive check: `checkHealth.ts` scored 0/6 against a file with six dedicated tests. Taking **Stryker's own sandbox, unmodified**, and activating that mutant the documented way —

```
__STRYKER_ACTIVE_MUTANT__=0 npx vitest run -c vitest.mutation.config.ts
→ 5 FAILED tests in tests/unit/application/checkHealth.test.ts
```

The mutant was killed. The runner never ran them. `@stryker-mutator/vitest-runner@10.0.0` does not activate mutants under `vitest@5.0.0`, and its peer range is `vitest: ">=2.0.0"`, so npm warns about nothing — the same shape as dependency-cruiser's typescript range, and the same shape as everything else this slice has found. Same tree, same mutants, command runner: **76.06**, with `config.ts` at 90.28 rather than 1.39. (A second defect in the same runner: `--logLevel debug` crashes it with "Converting circular structure to JSON", so the integration cannot be debugged through its own logging.)

`npm run mutation` now uses Stryker's built-in command runner — it sets the env var, runs the suite, reads the exit code, and has no framework integration to break. **That edit is to `stryker.config.mjs`, which is yours; I flagged it in the commit rather than slipping it in.**

## The SHAs and the movement

| SHA | | 
|---|---|
| `daf10be` | `config.ts` — the diagnosis is behaviour |
| `4c64e71` | `db.ts` — `closeDb` asserted by what it releases |
| `f3354d1` | `logger.ts` (new file) + `buildServer`'s logger |
| `b4570bc` | `routes/health.ts` — the unreachable branch, the schema as enforcement |
| `4f41053` | the harness fix |

| file | before (real) | after | killed | survived |
|---|---|---|---|---|
| `src/platform/config.ts` | 90.28 | **100.00** | 72 | 0 |
| `src/platform/logger.ts` | 0.00 | **100.00** | 2 | 0 |
| `src/application/checkHealth.ts` | 100.00 | 100.00 | 6 | 0 |
| `src/persistence/health.ts` | 100.00 | 100.00 | 6 | 0 |
| `src/persistence/db.ts` | 69.23 | **100.00** | 13 | 0 |
| `src/http/server.ts` | 66.67 | **100.00** | 3 | 0 |
| `src/http/routes/health.ts` | 50.00 | **85.00** | 34 | 6 |
| **All files** | **76.06** | **95.77** | **136** | **6** |

`typecheck` 0 · `lint:arch` 0 · `test:tools` 198/198 · `test:nodb` 85 · `npm test` **9 files, 91 tests, 0 failures** (was 60; the unit suite grew). No `mutate:` exclusion was widened.

## The six survivors I left, and why

All six are **provably** unobservable, each measured rather than argued:

**Four handler string literals** (`'ok'`, `'up'`, `'degraded'`, `'down'` in the `send()` calls). `Type.Literal('ok')` makes fast-json-stringify emit the constant *from the schema*; a handler sending `{status:'', checks:{database:''}}` through the real schema still produces `{"status":"ok","checks":{"database":"up"}}`. Measured both ways. **This is a design observation worth having:** the response body is determined by the schema, not by the handler — the literals in the handler are decorative, and a reader will assume otherwise.

**Two `{ additionalProperties: false }` option objects → `{}`** on the inner `checks` schemas. Measured: removing the keyword entirely serialises identically, because fast-json-stringify strips undeclared fields by default. Only setting it *`true`* opts into leaking — and that mutant **is** killed, by the stripping test. So the declaration is a belt-and-braces statement of the default; deleting it changes nothing observable.

## Did this change my view of the tests I wrote?

Yes, and in a way I would not have predicted.

The instinct to say "the score was a harness artifact, my tests were fine" is available and it is wrong. The true baseline was **76.06** — passing — but four of the individual findings are ones I would have called defects in a review of someone else's work:

`logger.ts` had **no test file at all** and I did not notice, because it *looked* covered: `tests/unit/http/health.test.ts` calls `createLogger`, so the file was exercised on every run. Coverage by being called is not coverage. And Fastify accepts `undefined` as "no logger", so a `createLogger` returning nothing was indistinguishable from one that worked — a false green of exactly the kind I have been finding in other people's tools all slice, in my own file.

`expect(db).toBeDefined()` was the whole of "builds its own pool when none is injected". That is an assertion about the existence of an object, and I wrote it while telling myself I was doing red-green-refactor. Kysely constructs happily around a missing pool, so the `??` could become `&&` and the test still saw an object.

`closeDb` had no assertion beyond resolving — and writing the real one taught me something about my own code I did not know: **Kysely creates its driver lazily**, so `destroy()` on a never-queried handle is correctly a no-op. My first attempt asserted `pool.ended` on an unused handle and failed. A true assertion about a proxy that was not the behaviour.

And `config.ts` had 21 tests, all of which asserted *that* it threw and none of which asserted *what it said* — for a module whose entire output, when it matters, is a message read by a person before there is a logger.

The honest conclusion: **red-green-refactor made the code work; it did not make the tests good.** Each test was written to make one behaviour pass, and once it passed I stopped — so the assertions bound the happy path and left the message text, the boundaries, the release semantics and the error branch free to change unobserved. Mutation testing is the thing that asks "what else could this code have done and still passed?", and that is not a question the red-green loop asks at any point. I would not have found any of these by re-reading my own tests, because I would have re-read them looking for what they assert rather than for what they permit.

```json
{
  "role": "implementer",
  "outcome": "green",
  "commits": ["daf10be", "4c64e71", "f3354d1", "b4570bc", "4f41053"],
  "files_changed": 5,
  "unit_tests_added": 42,
  "acceptance_passing": true,
  "depcruise": "pass",
  "objections": [
    "The 6.34 that was ruled BLOCKING was a harness artifact: @stryker-mutator/vitest-runner@10.0.0 does not activate mutants under vitest@5.0.0 (peer range >=2.0.0, so nothing warned). 118 of 130 survivors had testsCompleted: 0; one of them, activated by hand in Stryker's own sandbox, is killed by 5 existing tests. True baseline was 76.06. npm run mutation now uses the command runner — an edit to stryker.config.mjs, which is the orchestrator's."
  ],
  "dcr": null,
  "message": "95.77 from 76.06 real (6.34 reported), 136 killed, 6 survived — every survivor provably equivalent and measured, not argued: four handler literals the TypeBox schema overrides, and two additionalProperties declarations that restate fast-json-stringify's default. No exclusion widened. The findings stand despite the bad number: logger.ts had no test file and looked covered because another test called it, closeDb asserted only that it resolved, and config.ts had 21 tests that never read the message. Red-green-refactor made the code work; it did not make the tests good."
}
```
