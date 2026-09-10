# Report · slice 15 · implementer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 15 step 2: agree or object
- Returned: 2026-09-09T16:47:44.834Z
- Duration: 239s

---

# Slice 15 — step 2 (implementer)

Read `docs/slices/15-design.md` (`633737b`), `docs/slices/15-seed-fixtures-and-capacity-harness.md` (`d79679b`), `harness/seed.mjs` and `harness/double-booking.sh` in full, plus `tests/acceptance/harness.test.ts`, `package.json`'s `harness:*`/`pre*` scripts, ADR-0009 and `DB_POOL_MAX`'s default (10, `src/platform/config.ts`).

**Overall verdict: AGREED**, with one substantive finding I intend to remedy inside my own implementation discretion (no design change needed), and one coverage observation for the record.

## Per-point verdicts

**1. Central ruling — exports survive by construction.** AGREE, and I tried to break it. The five unprefixed names are keyed off a subtree's `exportPrefix === ""`, validated (AC-3) to be exactly one and independent of array position — not "declared first" in the array as the framing suggests, but functionally equivalent and actually more robust than position-dependence would be. `harness.test.ts`'s `parseExportedEnv`/`REQUIRED_SEED_KEYS` only checks the five required keys are non-empty; it ignores extra lines (`BAY_COUNT`, `CAPACITY_*`, `SERVICE_TYPE_ID_2`, …), and `double-booking.sh` only reads its own named vars. AC-9 holds.

**2. Hand-written validator, no dependency, rejects unknown keys.** AGREE. `additionalProperties:false` is schema-expressible, but the cross-references (`qualifiedFor`→declared type, `owner`→same-subtree customer, exactly-one-empty-prefix) are not, without a custom-keyword library that would itself be an undeclared dependency. Splitting shape-checks into a schema lib and cross-refs into hand code buys little at ~9 shallow object shapes / ~40 lines. Maintainable as scoped.

**3. AC-3 validate-first vs. atomic — OBJECT to the equivalence, not to the design.** Validate-first is sufficient for AC-3's five enumerated cases (all statically checkable from the JSON alone) but is **not** equivalent to atomicity: an actual insert-time DB error unrelated to fixture shape (constraint violation, a future migration adding a `NOT NULL` column, any bug that lets bad data through the validator) still leaves partial rows in a shared, never-truncated container used by the whole acceptance suite — exactly the outcome the design calls "worse than none." A transaction (`BEGIN`/`COMMIT`, `ROLLBACK` on any error) around the actual inserts closes that gap for near-zero cost with `pg`'s existing `Client`, no new dependency, and doesn't touch ADR-0038 (which governs whether SQL is *generated* from JSON, not how the hand-written statements execute). This is within "internal design" — I'll add it at step 4 regardless; flagging now since step-2 objections are cheap.

**4. No `pre` hook / stdout discipline.** AGREE. Confirmed `package.json` has no `preharness:seed` today and does use the `pre*` convention elsewhere (`pretest`, `predocs:openapi`), so the risk is real and correctly avoided by putting validation inline in `seed.mjs` with failures on stderr only, nothing on stdout. I'll hold that line for any debug/diagnostic output I might otherwise be tempted to add.

**5. `spurious-refusal.sh` derives *M* from declared counts, not answers.** AGREE. AC-6 (override `CAPACITY` to a wrong value → must fail) is exactly the guard against drifting back into slice 10's AC-5 defect: a script that re-derived *M* from observed responses would ignore the override and still exit 0, so AC-6 would be unsatisfiable under that drift. The design's own negative control covers this; I'll implement `CAPACITY="${CAPACITY:-$(min CAPACITY_BAY_COUNT CAPACITY_QUALIFIED_TECHNICIAN_COUNT)}"` accordingly.

**6. No mutation evidence — four negative controls as substitute.** AGREE with a flagged gap, not an objection: AC-3 exercises 5 of the validator's ~10 rules (the cross-reference ones). The remaining rules (collection-key uniqueness, `days⊆0..6`, `opensAt<closesAt`, `durationMinutes` positivity, `purpose` non-empty, ≥1-per-collection minimums) have neither mutation coverage nor an AC-3 case, so a bug there is currently invisible. Not blocking — those are the more mechanical, lower-risk rules, and AC coverage is the test-engineer's call at step 3 — but noting it now rather than after the red commit.

**7. D-15-1 — accept the trade.** AGREE. One home for the cap-of-16 in `src/` beats a second, staleness-prone copy in a shell script; the failure mode (an unwarned flaky demo at *M*=9) is a documented, self-inflicted fixture-authoring error, not a correctness gap in the shipped system.

**A-15-1 (concurrency assumption).** Not one of the enumerated points but flagged for step-2 confirmation in the slice file: I accept it. `double-booking.sh` already uses the identical background-`curl`-then-`wait` pattern at `REQUEST_COUNT=10`, and it is a merged, CI-passing acceptance test today — so the mechanism is already proven to produce adequate real contention in this environment. I'll re-confirm empirically the first time I actually run `spurious-refusal.sh` at step 4.

## Summary

No objection that would send this back to step 1. One finding (#3) I'll act on unilaterally as an implementation choice, purely additive to the design as written; one coverage note (#6) for the record, not a blocker.
