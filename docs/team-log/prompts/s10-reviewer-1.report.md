# Report · slice 10 · reviewer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 10 step 5 review
- Returned: 2026-09-08T08:46:12.162Z
- Duration: 745s

---

Review complete. PR comment posted: https://github.com/sleepyshark85/keyloop-challenge/pull/21#issuecomment-5582012083

```json
{
  "role": "reviewer",
  "outcome": "blocked",
  "findings": [
    {
      "severity": "BLOCKING",
      "file": "README.md",
      "line": 36,
      "claim": "AC-6's README half is absent. README.md names no harness script, no `harness:seed`, no `eval \"$(npm run --silent harness:seed)\"` and no BASE_URL/DEALERSHIP_ID; AC-6's own wording is \"`npm run harness:seed` with the ids it prints are in `package.json` and the README\", and the slice's DoD adds \"the harness run by hand on a clean checkout, from the README, before it is claimed\".",
      "scenario": "A reader follows README section 'Install, run, call' on a clean checkout: it ends at `npm start`. There is no path from the README to either harness script or to the ids they require, so AC-6 is unmet and its DoD line cannot be satisfied. Scribe-owned, one commit, no design change and no loopback."
    },
    {
      "severity": "MAJOR",
      "file": "tests/contract/openapi-document.test.ts",
      "line": 419,
      "claim": "The I-10-1/M2 describe block cannot fail on the defect it names. It probes the EMITTED DOCUMENT's `type` schema, where @fastify/swagger has rewritten TypeBox's `const` to `enum`. A collapsed one-member `Type.Union` (a bare `Type.Literal`) emits `{type:'string',enum:[x]}`, which fast-json-stringify passes through UNVALIDATED rather than substituting — so the block's `if (!threw) expect(wrongOutput).not.toBe(correctType)` passes.",
      "scenario": "Measured on this toolchain: `Type.Union([Type.Literal('/problems/appointment-not-found')])` returns `{const:…,type:'string'}`; @fastify/swagger 9.8.1 emits `{\"type\":\"string\",\"enum\":[\"/problems/appointment-not-found\"]}`; `buildStringify(that)('/problems/malformed-request')` returns `\"/problems/malformed-request\"` — no throw, not equal to correctType — so all seven cells stay green while the runtime schema (raw `{const}`) silently substitutes. The block is blind to Type.String({enum}) the same way. Production is guarded only by tests/unit/http/problem.test.ts, which probes the runtime schema and does fail. Hence MAJOR, not BLOCKING."
    },
    {
      "severity": "MAJOR",
      "file": "tests/contract/openapi-document.test.ts",
      "line": 289,
      "claim": "10-design.md §1's ruling — \"`/health` is outside §8.6's surface and is excluded BY NAME with an asserted-empty type set, never by silent omission\" — was not built. `/health` appears nowhere in the file; EXPECTED_PAIRS has five keys and the walk visits only those.",
      "scenario": "Add `problemResponse('/problems/vehicle-not-owned')` to /health's 503 in src/http/routes/health.ts and re-emit docs/api/openapi.json. The whole contract suite stays green: AC-1's document-wide check only asks that each type appear SOMEWHERE (it tests `missing`, never extras), no assertion visits /health, and slice 09's AC-7 `docs:openapi --check` passes once the document is regenerated. That is precisely the silent omission the ruling forbade."
    },
    {
      "severity": "MINOR",
      "file": "tests/contract/openapi-document.test.ts",
      "line": 397,
      "claim": "SINGLE_TYPE_CELLS covers seven of the eight single-member cells; `PATCH /appointments/{id}` at 404 (`appointment-not-found`) is single-member in the emitted document and is absent from the list and from the header comment (\"seven cells\").",
      "scenario": "Verified against docs/api/openapi.json: eight responses carry a one-member anyOf (book 409; read 400/404; patch 404; cancel 400/404; availability 400/422). A collapse confined to reschedule's 404 alone would not be probed. Low impact — all eight are built by one shared `problemResponse()` call — but the hand-transcribed list does not cover what its own header claims."
    },
    {
      "severity": "MINOR",
      "file": "harness/double-booking.sh",
      "line": 78,
      "claim": "The exit-code invariant is vacuously satisfiable: `count_201 -eq 1 && count_409 -eq $((REQUEST_COUNT - 1))` is trivially true at REQUEST_COUNT=1 against a free slot.",
      "scenario": "`REQUEST_COUNT=1 bash harness/double-booking.sh` on an unbooked slot prints \"PASS: exactly one confirmed and the rest refused.\" and exits 0 having fired one request and demonstrated no contention at all. A `REQUEST_COUNT >= 2` guard closes it; the acceptance test only ever uses 1 in the negative control against an already-taken slot, so nothing catches this shape."
    },
    {
      "severity": "MINOR",
      "file": "src/http/server.ts",
      "line": 190,
      "claim": "The new OPENAPI_COMPONENTS block contributes 8 of server.ts's 22 surviving mutants (L190-198), none reachable by the mutation-scored suite (vitest.mutation.config.ts includes tests/unit/** only).",
      "scenario": "Mutate L190 `responses` to `{}`: `npm run mutation` stays green and server.ts's 79.05 is unchanged. It is guarded outside the mutation number — slice 09's AC-7 `docs:openapi -- --check` fails because the committed document loses both entries — so this is recorded rather than blocking, but the file's score is partly this slice's new, mutation-invisible code."
    },
    {
      "severity": "MINOR",
      "file": "harness/seed.mjs",
      "line": 44,
      "claim": "STARTS_AT is pinned to the literal '2026-09-08T09:00:00.000Z' — today's date — so the terminal demonstration books a past instant from tomorrow onward.",
      "scenario": "No failure today: I confirmed src/domain and src/application carry no not-in-the-past rule, and the seed writes opening_hours 08:00-18:00 for all seven days, so 10:00 Europe/London and its +2h reschedule target stay inside hours indefinitely. Recorded because R-09-12 removed `date -u -d` in favour of a constant rather than `node -e`, and any future not-in-the-past rule silently breaks the harness."
    },
    {
      "severity": "MINOR",
      "file": "tests/concurrency/no-bay-overlap.test.ts",
      "line": 167,
      "claim": "Load-sensitive under a full parallel `npm run test:db` on a developer machine: 20 racers, only 10 answered ('1 confirmed / 9 refused' vs '1 confirmed / 19 refused'). Passes in isolation in 8s and is green in CI on 7fd8d75.",
      "scenario": "`npm run test:db` (full db project, parallel) reproduced it once; `npx vitest run --project db tests/concurrency/no-bay-overlap.test.ts` passes. Untouched by this slice's diff, so out of scope — recorded only because it is the project's central-invariant test and this is the last review."
    }
  ],
  "mutation": {"score": 0.9212, "survivors": 119, "changed_files": {"src/http/problem.ts": 1.0, "src/http/routes/availability.ts": 0.8837, "src/http/server.ts": 0.7905, "src/http/routes/appointments.ts": 0.7613}},
  "depcruise": "pass",
  "commit_discipline": "pass",
  "test_ownership": "pass",
  "dcr": null,
  "recommendation": "do-not-merge-as-it-stands",
  "message": "The central risk is genuinely closed: I booted Fastify against problemResponse() and a single-member cell rejects a wrong closed-set type rather than substituting it, the charset suffix still resolves to the bare problem+json content key, and problem.ts reached 100.00 with zero survivors by deleting duplication with no narrowing rule leaking into ProblemSchema. But two of this slice's own assertions repeat the pattern it exists to correct — the contract-level M2 probe cannot fail on the collapse it names, and the /health exclusion the design ruled 'never by silent omission' is a silent omission — and AC-6's README half simply is not in the tree."
}
```

## What I checked, in the order you asked

**1. `problem.ts` 74.29 → 100.** Sound, and the fix is the good kind. `ProblemSchema = narrowedProblemSchema(PROBLEM_TYPES)` takes the `Type.Union` branch because `types.length === 1` is unreachable for a nine-member array; the emitted object shape is identical to the hand-built one it replaces (only two JSDoc comments were dropped, which TypeBox does not read). 27 killed, 0 survived. No narrowing rule leaked.

**2. `I-10-1`/M2.** Verified independently through a live Fastify instance, not from the report. Single-member cell + wrong closed-set `type` → `"The value of '#/properties/type' does not match schema definition."`; correct value round-trips; `additionalProperties` strips. **But the contract test's version of that probe is blind** — see MAJOR #1. The unit test is the real guard.

**3. `A-06-2` / AC-3b.** This one does constrain what it claims. It anchors on each file's own imported binding (named, aliased, namespace) plus the ambient `crypto.` baseline, strips comments *before* matching, and carries four planted violations, four negative controls — including the exact defeat that broke the QS-12 counter marker (a comment naming `randomUUID`, and a same-named import from elsewhere) — a corpus guard, and set equality that fails if `src/main.ts` stops minting. Residual (adversarial rename) stated, not promised away. **Third discharge attempt is honest.**

**4. Harness falsification.** Exit code is the primary signal in all four cases; the happy double-booking case is additionally checked against `select count(*)` on the database, not stdout. Negative controls force a real 409 (pre-booked reschedule target) and a real zero-201 run. One vacuous-pass shape found (MINOR, `REQUEST_COUNT=1`).

**5. `I-10-4`, two `components.responses` entries.** Two is right. Both are document-only metadata — `components` under the `fastifySwagger` options registers no route schema, so §8.5's "the 500 carries no response schema" is intact. `internal` is strictly better placed than before, where it rode inside every *other* status's union.

**6. AC-2 / AC-6 gate-verified halves.** AC-2's is honest — parsing §8.6 prose from a test makes arc42 a machine input, and the architect declined it with a stated reason and named the residual. **AC-6's is not**: "gate-verified, not mechanical" is convenient, since a grep of `README.md` for `harness:seed` is three lines — and the README half was then not written at all.

Files: `/home/agentadmin/sources/keyloop-challenge/tests/contract/openapi-document.test.ts`, `/home/agentadmin/sources/keyloop-challenge/tests/architecture/uuid-mint.test.ts`, `/home/agentadmin/sources/keyloop-challenge/src/http/problem.ts`, `/home/agentadmin/sources/keyloop-challenge/harness/double-booking.sh`, `/home/agentadmin/sources/keyloop-challenge/README.md`

Also for the orchestrator, not findings: `slice:check 10` still fails *tests green* (newest recorded run is `1a578a8`, an ancestor — GitHub reports SUCCESS on `7fd8d75`, so it needs collecting), *arc42 reconciled* (step 7 pending; §8.6 still says "all 25 responses declare `application/json`", now false), *inherited obligations discharged*, *human approved*, and *every dispatch reached the log* (`s10-reviewer-1.md` captured with no agent event).
