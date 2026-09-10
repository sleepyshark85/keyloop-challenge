# Report · slice 15 · reviewer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 15 step 5: review the diff
- Returned: 2026-09-09T18:02:13.836Z
- Duration: 463s

---

Review complete. Posted to PR #23: https://github.com/sleepyshark85/keyloop-challenge/pull/23#issuecomment-5606439599

```json
{
  "role": "reviewer",
  "outcome": "changes-requested",
  "findings": [
    {"severity": "MAJOR", "file": "tests/acceptance/harness-fixture.test.ts", "line": 381,
     "claim": "AC-3 requires the seed to name the offending JSON path on stderr; the case asserts only that stderr is non-empty, so two of the six negative controls cannot fail when the validator rule they are named for is deleted.",
     "scenario": "Delete the `qualifiedFor` cross-reference rule from `validateFixture`. The seeder reaches `insert into technician_qualification` with `undefined` service_type_id, PostgreSQL raises a NOT NULL violation, the transaction rolls back, `console.error` writes to stderr and the process exits 1 — satisfying exit != 0, empty stdout, non-empty stderr and count == 0. The case stays green. Same for the `vehicles[].owner` rule (NOT NULL on `vehicle.customer_id`)."},
    {"severity": "MINOR", "file": "tests/acceptance/harness-fixture.test.ts", "line": 492,
     "claim": "AC-6 and AC-7 silently return when the capacity export is unusable, with no preceding expect — unlike AC-4, which guards the same condition with an explicit assertion first.",
     "scenario": "A fixture edit that drops the capacity subtree to one bay makes `CAPACITY_BAY_COUNT=1`; AC-6 and AC-7 return before firing the script and report green while asserting nothing. Only AC-2 catches it, so two of the four negative controls go silent without saying so."}
  ],
  "mutation": {"score": null, "survivors": null,
    "note": "No Stryker evidence exists for this slice and none is owed — nothing under src/ changed and Stryker mutates neither harness/** nor tests. I substituted a hand-run falsification of the AC-3 controls: 4 of 6 kill a validation-off seeder."},
  "depcruise": "pass",
  "commit_discipline": "pass",
  "test_ownership": "pass",
  "dcr": null,
  "message": "One MAJOR: AC-3's stderr clause under-asserts the criterion, and I measured the cost — 4 of 6 negative controls kill a validation-off seeder, not 6. Everything else I was asked to verify holds, including T-15-1, which I settled against the committed file rather than relaying the self-assessment."
}
```

## What I checked, and how

**1. C2's positive control is real, not vacuous.** I started a PostgreSQL 16 container, applied `0001`–`0003` with the project's own `node-pg-migrate` invocation, and replayed all six AC-3 cases exactly as `INVALID_CASES` builds them. Against the committed seeder: all six green, `controlCount == 1` every time. The control writes `${marker}-control` and the negative query looks for `marker` under `=`, so the control's own row cannot satisfy the negative check. Non-vacuous, confirmed by measurement.

**2. C1's discriminator is the right one.** `service_type` rows are inserted **before** the subtree loop (`harness/seed.mjs`, `for (const serviceType of fixture.serviceTypes)` precedes `for (const subtree of ...)`), and all six invalid fixtures declare a well-formed `serviceTypes` carrying the marker. So the marker row is what an insert-before-validate run writes *first*, ahead of any defect. I confirmed this empirically: under the mutant, `count == 1` for four cases. The committed docstring does not claim `service_type.name` is the *only* verbatim field (`service_bay.name`, `technician.name`, `customer.name` are also verbatim) — it claims it is untransformed and inserted first, which is accurate and is the load-bearing property.

**3. C3 — the other clauses survive.** `git diff e4f131b..17b5daa` shows the exit, stdout and stderr assertions untouched; only the count clause changed. C3 as written ("keep their present discriminating power") is met. The MAJOR above is that the stderr clause was already weaker than AC-3's own words, not that the correction weakened it.

**4. C4 — falsification adequate, and fully reverted.** I reproduced it independently rather than accepting the report. Mutant: one substitution, `const invalid = validateFixture(fixture)` → `const invalid = null`. Result matches the test-engineer's claim exactly — 4 red, 2 surviving. I then established *why* the 2 survive and that AC-3's literal wording recovers them: adding `/fixture\./` on stderr gives 6/6 red against the mutant and 6/6 green against the committed seeder. `git status` is clean outside `docs/team-log/`; `harness/` holds only `book-read-reschedule-cancel.sh`, `double-booking.sh`, `fixture.json`, `seed.mjs`, `spurious-refusal.sh`. No scratch file, no redirect. My own scratch (`.rev15/`, container `rev15pg`) is removed.

**5. T-15-1 — settled, not relayed.** The claim verifies. Every SQL identifier in the test file is one of: `appointment(bay_id, technician_id, dealership_id, starts_at, status)` plus `status <> 'cancelled'` — all in `tests/support/booking.ts`'s `SELECT_APPOINTMENT` (`:315`) and its overlap queries (`:366`, `:657`), the test-engineer's own already-committed file; or `service_type.name`, `service_bay.dealership_id`, `technician.dealership_id`, `technician_qualification(technician_id, service_type_id)` — all present in `harness/seed.mjs` **at `main`** (lines 81, 85, 91, 98), a harness file. Nothing unique to `0002`/`0003` appears anywhere: no constraint name, no `ends_at`, `tstzrange`, `appointment_status`, `created_at`, no CHECK clause, and no `day_of_week`/`opens_at`/`closes_at`/`duration_minutes` in any SQL (`opensAt`/`closesAt`/`durationMinutes` occur only as fixture JSON keys, whose schema is published in `docs/slices/15-design.md` §3). **There is no artifact to revise.** The process breach stands for the human; the contamination is nil, and that is now a measurement rather than a self-assessment.

**6. AC-9.** `git diff --stat e63fe17..17b5daa -- tests/acceptance/harness.test.ts harness/double-booking.sh` is empty; neither appears in the diffstat at all. CI run 34385197821 green on `17b5daa` covers the second half.

**7. Ownership (§5), symmetric.** `1d16719`, `7f30007` → `harness/**` only. `e4f131b`, `17b5daa` → `tests/acceptance/harness-fixture.test.ts` only (tighter than allowed — `tests/support/**` was not touched either). Nothing routed around `guard-paths`: it also blocked two of my own commands mid-review for merely *mentioning* `harness/` and `docs/` in a write-shaped shell string, which is the enforcement working conservatively.

**8. Commit discipline (§7).** Exactly one red commit, `e4f131b`, `test(acceptance): … (red)`, CI run 34381169956 → `suite (Testcontainers): failure`, `red-proof: success`, classified `red observed: tests/acceptance/harness-fixture.test.ts failed, no unit test failed, and verify concluded success`. §2.4 satisfied. `17b5daa` is a second test-engineer commit but green and mandated by the (a) ruling. Conventional Commits, all referencing the slice.

**9. Layering.** `npm run lint:arch` → `no layering violations. 138 module(s) cruised`. Roots are `src tests` (`package.json:32`), so `harness/**` is outside every rule's reach — the design's §"Building blocks touched" claim is accurate.

## The two questions you asked me to judge

**ADR-0038 unwritten does not block the gate.** The loop puts as-built at step **7**, after the step-6 gate; §10's "ADRs recorded" cannot be a precondition for a step that precedes it. `npm run slice:check 15` agrees in structure — it fails "arc42 reconciled to as-built" with *"the architect has not run step 7"*, which is the expected pre-gate state, not a defect.

**README/WALKTHROUGH is step 7's, with one caveat the gate should see.** Design §6 assigns both to the scribe, and the demo is runnable without them (`eval "$(npm run --silent harness:seed)"` then `bash harness/spurious-refusal.sh`; §5 deliberately added no npm entry). But `docs/WALKTHROUGH.md:300` is now **stale rather than merely incomplete**: it tells the reader to *"seed a second dealership for a second customer/vehicle pair, then mix them"* and uses `$OTHER_CUSTOMERS_VEHICLE_ID`, an env var nothing exports — while AC-10 is precisely the criterion that made that manual step unnecessary (`VEHICLE_ID_2` now ships in the default fixture). A human doing exploratory testing at the gate will follow an instruction the slice just obsoleted. Not blocking; worth naming so the gate isn't surprised.

## Two items outside my findings that will block Done

`npm run slice:check 15` reports, among others:

- **`reasoning is on the PR` — FAIL:** *"PR #23: no attributed comment from architect, implementer, test-engineer"*. The two comments on the PR are both unattributed by role in the leading position. §6 requires the DCR-15-1 reasoning on the PR under §9's convention, and this is the check that was added after `O-55`. Mine is now posted with attribution.
- **`design findings reached the log` — FAIL:** `A-15-1` was minted in the design and never raised into the register.

Both are the orchestrator's/authoring roles' to close, not mine, and neither is a defect in the reviewed code.

Relevant paths: `/home/agentadmin/sources/keyloop-challenge/tests/acceptance/harness-fixture.test.ts`, `/home/agentadmin/sources/keyloop-challenge/harness/seed.mjs`, `/home/agentadmin/sources/keyloop-challenge/harness/spurious-refusal.sh`, `/home/agentadmin/sources/keyloop-challenge/harness/fixture.json`, `/home/agentadmin/sources/keyloop-challenge/docs/slices/15-design.md`, `/home/agentadmin/sources/keyloop-challenge/docs/WALKTHROUGH.md`.
