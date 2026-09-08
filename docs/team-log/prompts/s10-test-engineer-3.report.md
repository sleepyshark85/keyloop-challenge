# Report · slice 10 · test-engineer · invocation 3

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 10 remediation — test-engineer
- Returned: 2026-09-08T09:33:14.396Z
- Duration: 1313s

---

## Summary

Both remediation commits are pushed to `slice/10-openapi-and-curl-harness` (PR #21), a PR comment is posted, and no new red commit was created (per instruction — these are assertion corrections, not a `(c)` outcome).

**`1752c07`** — `tests/acceptance/harness.test.ts`
- `R-10-1`: new describe block asserting set equality between `harness:*` keys in `package.json` and `harness:*` mentions in `README.md`, plus a literal check for the `eval "$(npm run --silent harness:seed)"` line and both script paths.
- `R-10-5`: negative control now fires two racers (`REQUEST_COUNT=2`) at an already-taken slot, asserting zero `201`s, exactly two `409`s, and non-zero exit — no longer collides with the implementer's `>= 2` guard.

**`a5fb1ba`** — `tests/contract/openapi-document.test.ts`
- `R-10-3`: `EXPECTED_PAIRS` gains `'GET /health': ['200 application/json', '503 application/json']`, plus a new `it` asserting `Object.keys(EXPECTED_PAIRS)` equals every `(method, path)` in `doc.paths`.
- `R-10-4`: `SINGLE_TYPE_CELLS` replaced by `deriveSingleTypeCells(EXPECTED_PAIRS)` — derives 8 cells (the hand list had 7 and was missing `PATCH /appointments/{id} 404`).
- `R-10-2`: added a document-level shape assertion (`isOneMemberAnyOf`) alongside the kept runtime-schema (`fast-json-stringify`) probe, and rewrote the header comment to drop the now-false "behaviour, never shape" claim.

**Falsification results (item 2), run before committing, both reverted byte-identical afterward:**
- Collapsed `POST /appointments 409`'s `type` schema in `docs/api/openapi.json` from `{anyOf:[{enum:[x]}]}` to a bare `{type:'string', enum:[x]}`.
- New shape describe block → **red** (`expected false to be true`), confirming it can fail on the collapse.
- Existing behavioural (`fast-json-stringify`) describe block → **stayed green**, confirming the adjudication's exact finding: `fast-json-stringify` echoes the wrong-but-closed-set value through unvalidated rather than substituting the correct one, so `not.toBe(correctType)` holds vacuously at document level.
- Also falsified `R-10-1`'s equality check with a phantom `harness:reset` script in `package.json` → red, confirmed a new undocumented script is caught.

**Verification:** `npx tsc --noEmit`, `npm run test:tools`, `npm run test:nodb`, `npm run test:db` (×3, to rule out flake), `vitest run --project perf`, and `npm run lint:arch` all green. Two transient `test:db` failures appeared on isolated runs, both in files I never touched (`tests/concurrency/no-technician-overlap.test.ts` once, a tracing/span test once) — reproduced green on retry both times, so this reads as Testcontainer/timing flakiness under this sandbox's load, not a regression from these changes; `tests/acceptance/harness.test.ts` and `tests/contract/openapi-document.test.ts` were green on every run.

**On the architect's own reversal (R-10-2):** I agree with it. Step 1's "never the schema's shape" claim was written before the emitter's `const`→`enum` rewrite was measured; once measured, the shape *is* the only thing a document-level probe can observe, so reversing it for that level only is consistent with the standing principle rather than an exception to it. I found nothing to push back on in any of the four rulings — each names the exact test that couldn't fail and the remedy closes exactly that gap, not more.

**Report:**
```json
{
  "role": "test-engineer",
  "outcome": "revised",
  "tests_added": {"acceptance": 2, "contract": 10, "property": 0, "concurrency": 0},
  "quality_scenarios_covered": ["QS-11"],
  "red_commit": null,
  "ci_failure_confirmed": true,
  "objections": [],
  "dcr": null,
  "message": "Four items from a3e7d5f fixed by hand-falsified assertions, not restated ones: R-10-3's /health-plus-key-equality, R-10-4's derived SINGLE_TYPE_CELLS, R-10-2's document-level shape probe (falsified to red, then reverted), and R-10-1's README set-equality with R-10-5's two-racer control. test:tools, nodb, db and perf all green; PR #21 comment posted."
}
```

Files touched: `/home/agentadmin/sources/keyloop-challenge/tests/acceptance/harness.test.ts`, `/home/agentadmin/sources/keyloop-challenge/tests/contract/openapi-document.test.ts`.
