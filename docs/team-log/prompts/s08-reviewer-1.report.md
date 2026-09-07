# Report · slice 08 · reviewer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 08 step 5 review
- Returned: 2026-09-07T06:07:49.880Z
- Duration: 636s

---

Review complete. Posted to PR #17: https://github.com/sleepyshark85/keyloop-challenge/pull/17#issuecomment-5565818766

```json
{
  "role": "reviewer",
  "outcome": "changes-requested",
  "findings": [
    {"severity": "MAJOR", "file": "src/persistence/appointmentRepository.ts", "line": 566,
     "claim": "QS-8 cannot reach the `status <> 'cancelled'` conjunct of the restated predicate, so the design's and the code's claim that QS-8 holds the restatement in agreement with the constraint is false of one of its three terms.",
     "scenario": "Deleting `.where('status','<>',CANCELLED)` from the built artifact and running the property: PASSES (30 runs). The generator writes every schedule row at the `confirmed` column default and never cancels one, so no run distinguishes the two spellings. Concretely: add `no_show` to `appointment_status` — which 0003_appointment.sql's own docblock names as the anticipated case — and write the allowlist form `status = 'confirmed'` that the same docblock warns is 'a double-booking nobody wrote'. A `no_show` row occupies its slot under the constraint's denylist, so the query reports the pair free and the INSERT rejects it with 23P01: a direction-A disagreement, the exact failure QS-8 exists to catch, and QS-8 stays green."},
    {"severity": "MINOR", "file": "docs/slices/08-availability-query.md", "line": 61,
     "claim": "AC-5 bundles an assertable half with a half that cannot fail, which is the shape AC-7 was withdrawn for at step 2.",
     "scenario": "No `docs:openapi` script and no emitted document exist, so no test can observe the OpenAPI half; it will still read as satisfied at the gate because the response half passes. AC-7 was withdrawn on the ground that 'a criterion that cannot fail is not evidence' — AC-5's second half survived only because it was bundled with a first half that can."}
  ],
  "mutation": null,
  "depcruise": "pass",
  "commit_discipline": "pass",
  "test_ownership": "pass",
  "dcr": null,
  "message": "QS-8 is load-bearing in the dimension it was built for and blind in one it was not; I measured both rather than reasoning about them. Nothing here is wrong today and nothing blocks merge on correctness."
}
```

## Testing the load-bearing claim

I could not hand-mutate `src/` — `guard-paths` correctly refuses the reviewer — so I mutated the **built artifact** in a throwaway worktree, which is the technique `stryker.config.mjs` itself documents and is more faithful anyway, since ADR-0013 makes the outside-in suites run `dist/`.

| Mutant | QS-8 verdict |
|---|---|
| `tstzrange(…)` → `tstzrange(…, '[]')` both sides | **killed**, run 3, direction B named, pair shrunk |
| `bays: [...new Set(…)]` → `bays: []` (over-report) | **killed**, run 1, direction A |
| delete `.where('status','<>',CANCELLED)` | **SURVIVES** (killed only by AC-4) |

The test-engineer's sentence — *"a bug would need a shared code path between the query and the probe's own range expression, and ADR-0032 keeps them in two files with none"* — is **true as stated and incomplete as a claim of coverage.** The two-files argument holds: mechanic 5's boundary bias genuinely kills the `[)`→`[]` divergence, and it does so with the counterexample and direction the design demanded. But a bug does not need a shared code path to survive. It only needs to lie in a **dimension the generator never varies**, and the step-3 report's enumeration of what could still pass while wrong names only two classes (a shared path, and wrongness outside the candidate universe). `status` is a third. The `busyResources` docblock overstates it ("QS-8 is what proves this restatement agrees"); ADR-0032 is careful and says only "the range expression QS-8 pins" — the ADR is right and the code comment is not.

Remedy, for the architect not for me: one line in the generator giving a schedule item a non-`confirmed` status. It is a test-engineer-owned file, and §6(b) is available if slice 09 is the cheaper place.

## The six chases

1. **Five mechanics** — all present and all real. Probes are `SAVEPOINT`/`ROLLBACK TO` inside one `BEGIN`; the verdict is `.code` compared to `'23P01'` exactly, with anything else routed to a separate `invalidVerdict` list that fails distinctly; directions counted in two arrays with separate assertions; boundary bias at 4/8 generator weight; witness is `count(*)` + `max(updated_at)` in one row scoped to the run's own dealership, discarded through `fc.pre()` and not a `try/catch`. Non-vacuous: M1 failed on direction B, so the query does omit pairs on ordinary runs.

2. **Generated SQL vs. `0003_appointment.sql`** — I read them against each other. Overlap and half-open arithmetic agree (`tstzrange` defaults to `[)` on both sides) and are proven to agree by M1. Status agrees but is unproven — R-08-1. **Dealership scoping is sound, and for a reason nothing tests**: `technician` and `service_bay` each carry `dealership_id NOT NULL`, and `appointment`'s composite FKs make `appointment.dealership_id` functionally determined by `technician_id`/`bay_id`, so the constraint's dealership-free predicate and this query's dealership-scoped one cannot diverge. That equivalence would break silently if a technician were ever allowed at two dealerships. A-08-1 books the adjacent assumption; this one is not booked.

3. **The marker** — `PERMITTED_FILE['appointment-table-access']` is unchanged, the diff touches no file under `tests/architecture/`, and `ambiguity-containment.test.ts` passes 66/66 locally including the exactly-one-file set-equality case. AC-7's withdrawal was correct: the claim is asserted continuously and the list did not widen.

4. **I-08-5 — correct, and I verified it rather than accepting it.** Against this repo's own Fastify/TypeBox versions, a handler sending `{advisory: false, d: 'BROKEN'}` through a `Type.Literal(true)`/`Type.Literal('X')` response schema serializes as `{"advisory":true,"d":"X"}`; through `Type.Boolean()`/`Type.String()` it serializes the handler's actual values. So `Type.Literal` would have made AC-5 unfalsifiable, exactly as claimed. The schema still constrains what it should — both fields required, `additionalProperties:false`, and the OpenAPI-facing `description` is a fixed literal in source, so nothing that was actually asserted was given up.

   **I-08-4 — fair.** Correctness is identical either way; ADR-0032 already books the two round trips against QS-14 and slice 09's AC-14. I'd note the *stated* reason is the weaker of two available: under quiescence — the only regime QS-8 covers — concurrent reads would be equally deterministic. The stronger reason, unstated, is that `Promise.all` over a `pg` pool takes a second connection per request on a booking-screen endpoint. The choice is right; the argument for it is not the best one.

5. **AC-5 — my reading: it is half a criterion, and a partly-unassertable criterion does not belong in a Definition of Done as one criterion.** The substance is present in the only representation that exists — `AvailabilityBody`'s `description` carries both facts, and that description is what a `@fastify/swagger`-style emitter would render, so the implementer put it in the right place. But §2.4's argument ("a test that has never failed is not evidence") applies with equal force to a criterion half of which can never fail, and this slice already ruled that way once: AC-7 was withdrawn at step 2 because a criterion that cannot fail is not evidence. AC-5's OpenAPI half is the same shape and survived only because bundling hid it from the test that killed AC-7. The consistent disposition is to **split** it — the response half is met here; the OpenAPI half becomes an AC of `docs/slices/10-openapi-and-curl-harness.md`, where it can fail. That is an architect's ruling; T-08-5 already resolved the wire half and left this half standing, so this is a reading offered into an open question rather than a new one.

6. **The property runs.** `vitest list --project db` collects it; `--project nodb` returns zero hits, so the `exclude` does its job and it is not double-collected. CI run 34088540920's `test-results.json` shows it **passed in 1.7s**, not skipped, alongside the 5 acceptance and 10 route unit tests. T-08-4 already books the arc42 §10.2 / slice-file path staleness for step 7.

## Standing duties

`lint:arch` — no violations, 105 modules, every root covered. Exactly one `(red)` commit, `0c4ad4e`, carrying **both** the acceptance file and the property file. Four implementer commits, all green. Test ownership clean in both directions per commit: the test-engineer touched only `tests/acceptance/`, `tests/property/`, `tests/support/`; the implementer touched only `tests/unit/`. `slice:check 08`'s three FAILs are all step-6/7 items (arc42 not yet reconciled, inherited I-04-5/A-06-4 for the gate, and my own dispatch prompt not yet logged) — none is a step-5 defect.

## Not asked about

- **The mutation score you are about to get measures nothing about this slice's central risk.** `stryker.config.mjs` runs `npx vitest run -c vitest.mutation.config.ts`, whose `include` is `tests/unit/**/*.test.ts` and nothing else. So neither the acceptance suite nor QS-8 kills a single mutant in the number. `busyResources` will score well because `tests/unit/persistence/appointmentRepository.test.ts` pins its statement text whole — but that is a change-detector, not a semantic guard, and it is precisely what would be updated-to-match by whoever introduces R-08-1's divergence. Read the score as evidence about the unit tests, not about `GET /availability`.
- **Commit `a705026`** shipped 151 lines of route with its unit tests arriving one commit later at `193db2d`. §7's "unit test and the code it drives, together" was not met for that one commit; the other three implementer commits carried theirs together. Every commit was green under the acceptance suite, so I am recording this rather than filing it.
- `main.ts`'s new `queryAvailability` wiring line falls under Stryker's `!src/main.ts` exclusion — the same blind spot the config's own docblock records for `main.ts:46`. Unlike that case, this line *is* genuinely exercised end-to-end by all five acceptance tests through the built artifact, so the exclusion costs nothing here. Noted only because the config's stated cost ("every line of `main.ts` is guarded by an outside-in assertion or by nothing at all, and the mutation score cannot tell which") now has one more line under it.

Files that matter: `/home/agentadmin/sources/keyloop-challenge/src/persistence/appointmentRepository.ts` (line 566, R-08-1), `/home/agentadmin/sources/keyloop-challenge/tests/property/availability-agrees-with-constraint.db.test.ts`, `/home/agentadmin/sources/keyloop-challenge/src/persistence/migrations/0003_appointment.sql`, `/home/agentadmin/sources/keyloop-challenge/docs/slices/08-availability-query.md`.
