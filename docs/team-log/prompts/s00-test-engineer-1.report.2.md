# Report · slice 00 · test-engineer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 00 step 2 agree
- Returned: 2026-09-04T08:57:41.334Z
- Duration: 2464s

---

Committed **`98ace77`** on `slice/00-schema-and-constraints`. Not pushed, no PR comment, nothing written to `docs/team-log/`.

---

# The red

Three files, 1047 insertions, **no existing file modified** — `git status` after the commit is clean, so §8.3's seam promise holds and `tests/unit/` is untouched (`red-proof`'s `MUST_PASS` is intact).

```
tests/support/ids.ts                             59
tests/support/seed.ts                           174
tests/integration/exclusion-constraints.test.ts 814
```

## Verbatim local failure — `npx vitest run --project db`

```
 ❯ |db| tests/integration/exclusion-constraints.test.ts (10 tests | 10 failed) 29ms
   ❯ slice 00 — the schema, the exclusion constraints and the seed fixtures (10)
     × case 0 — the schema under test IS arc42 §8.1 and §8.2 (a precondition for every case below) 7ms
     × AC-1 — a second appointment overlapping a bay is rejected 23P01 on no_bay_overlap 2ms
     × AC-2 — a second appointment overlapping a technician is rejected 23P01 on no_technician_overlap 1ms
     × AC-3 — adjacency is not overlap: back-to-back appointments coexist in one bay 1ms
     × AC-4 — cancelling frees the slot: the WHERE (status <> 'cancelled') predicate is live and not decorative 1ms
     × AC-5 — an appointment naming a technician unqualified for the service type is rejected 23503 on appointment_technician_qualified 1ms
     × AC-6 — an appointment naming a vehicle not owned by the named customer is rejected 23503 on appointment_vehicle_owned_by_customer 1ms
     × AC-7 — an appointment naming a bay from another dealership is rejected 23503 on appointment_bay_in_dealership 2ms
     × AC-8 — an appointment with ends_at <= starts_at is rejected 23514 on appointment_interval_ordered 1ms
     × AC-9 — the seed fixtures populate every reference table and the suite books against them deterministically 1ms

⎯⎯⎯⎯⎯⎯ Failed Tests 10 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |db| tests/integration/exclusion-constraints.test.ts > ... > case 0 — the schema under test IS arc42 §8.1 and §8.2 (a precondition for every case below)
AssertionError: btree_gist is absent, so no exclusion constraint on (uuid, tstzrange) can exist at all: expected [] to deeply equal [ 'btree_gist' ]

- Expected
+ Received

- [
-   "btree_gist",
- ]
+ []

 ❯ tests/integration/exclusion-constraints.test.ts:279:7

 FAIL  |db| ... > AC-1 — a second appointment overlapping a bay is rejected 23P01 on no_bay_overlap
error: relation "dealership" does not exist
 ❯ node_modules/pg/lib/client.js:694:17
 ❯ seedDealership tests/support/seed.ts:90:3
     90|   await client.query('insert into dealership (id, name, time_zone) val…
       |   ^
 ❯ tests/integration/exclusion-constraints.test.ts:320:15

  [AC-2 … AC-9 identical, each from its own seedDealership call, at lines
   367, 403, 481, 563, 608, 648, 692, 733]

 Test Files  1 failed | 2 passed (3)
      Tests  10 failed | 6 passed (16)
   Duration  3.62s
```

Full run (`npx vitest run`, both projects, JSON reporter): **110 tests, 10 failed, 100 passed, failures confined to one file.** `npm run typecheck` clean. `npm run lint:arch` clean — *"no layering violations. 44 module(s) cruised, every root covered: src, tests"*, so `outside-in-tests-do-not-import-src` is satisfied for the two new `tests/support/` files.

I also ran `red-proof`'s pure `judge()` against the real JSON offline, so CI's live first execution is not the first time anything has seen this shape:

```json
{ "ok": true,
  "reason": "red observed: tests/integration/exclusion-constraints.test.ts failed, no unit test failed, and verify concluded success" }
```

## The red is assertion-shaped — confirmed, not assumed

Nothing failed at collection and nothing failed in a hook. `beforeAll` connected successfully in all three `db` files; the two pre-existing files passed their 6 cases. All 10 failures are per-case entries in `testResults[]`, which is the property `red-proof` and C1 read.

Case 0 is a genuine `AssertionError` with an expected/actual diff. The nine AC cases are rejected queries **inside their own `it()` bodies** — exactly the failure §8.1 predicted, and each one names the missing relation and the `seedDealership` line that reached for it.

## What each case covers

| case | AC | asserts |
|---|---|---|
| case 0 | precondition | `btree_gist` present; nine relations resolve; **full `pg_get_constraintdef` equality** on all seven named constraints against hand-written literals |
| AC-1 | AC-1 | first row stored and read back; overlapping insert (same bay, **other technician**) → `23P01`/`no_bay_overlap`/`appointment`; bayA still holds exactly one live row |
| AC-2 | AC-2 | same technician, **other bay** → `23P01`/`no_technician_overlap`; techA still holds exactly one live row |
| AC-3 | AC-3 | neighbour read back (exists, confirmed, bayA, instants); negative control `[+0.5h,+1.5h)` rejected; `[+1h,+2h)` accepted; `[-1h,+0h)` accepted; three live rows in bayA |
| AC-4 | AC-4 | before-rejection / cancel (`rowCount === 1`) / row still present, cancelled, interval-bay-technician unchanged / after-acceptance of the *identical* row |
| AC-5 | AC-5 | `(techB, standard)` → `23503`/`appointment_technician_qualified`, **+ control `(techB, quick)` accepted** |
| AC-6 | AC-6 | `vehA` + `custB` → `23503`/`appointment_vehicle_owned_by_customer`, **+ control `vehA` + `custA` accepted** |
| AC-7 | AC-7 | D1's bay under D2 (D2 technician, qualification, customer, vehicle) → `23503`/`appointment_bay_in_dealership`, **+ control with D2's own bay accepted** |
| AC-8 | AC-8 | `ends_at = starts_at` and `ends_at < starts_at` → `23514`/`appointment_interval_ordered`, **+ control with a valid interval accepted** |
| AC-9 | AC-9 | exact scoped counts for all eight reference tables (1/7/2/2/2/3/2/2); one booking from returned ids only, read back |

Every control runs **after** its negative sibling, in the interval the rejection vacated — the ordering rule, and I took the tighter of the two options it allows so the control is genuinely "one column different".

---

# What the amended design still gets wrong

Two findings, one of which blocks the green commit.

## I-10 (or T-7) — MAJOR — `tests/integration/postgres-harness.test.ts` asserts zero migrations applied, so slice 00 cannot go green as specified

`/home/agentadmin/sources/keyloop-challenge/tests/integration/postgres-harness.test.ts:50`:

```ts
it('has run the migration seam: pgmigrations exists and zero migrations applied', async () => {
  const { rows } = await client.query<{ count: string }>(
    'select count(*)::text as count from pgmigrations',
  );
  expect(rows[0]?.count, 'slice 00a applies no migrations').toBe('0');
});
```

At the green commit `pgmigrations` holds three rows. **That assertion fails, and the slice's Definition of Done — "all tests green" — is unreachable without editing it.** §8.3 enumerates the files slice 00 must not modify and does not mention this one; nothing in the design assigns the update to a step or a role.

It is not an obscure file. §4.1 of the amended design **cites it four lines above the failing assertion** — the `server_version` matches `^16\.` case is the evidence for T-4's bounded-fragility argument. The `pgmigrations` case was read past.

I did not fix it. Doing so unilaterally would have made §9's claim false — *"Slice 00's red comes from one file… There is no second explanation available"* — and that claim is part of the pilot's C1 evidence, so it is the architect's to spend, not mine. The file is mine to edit under §5. Two options:

- **(a) in a second commit before the push**, changing the assertion to `'3'` plus the three migration names. It reddens a second `tests/integration/` file at the red commit (`red-proof` is unaffected — same red zone, `MUST_PASS` still holds) and costs §9's one-file claim.
- **(b) as the implementer's first step-4 obligation**, which keeps the red pristine but means the green commit's first CI run is red for a reason nobody has attributed, on the slice whose whole point is that a failure is attributable.

I lean (a) and can produce it in about two minutes on your ruling.

## T-8 — MINOR — §6.2 states a property that §4.2 depends on, and nothing asserts it

§6.2 says the three columns without a singleton foreign key are complete rather than missing, and gives a reason that is not cosmetic: *"Adding the singleton foreign keys as well would be redundant and would make the reported constraint non-deterministic in exactly the cases §4.2 depends on being deterministic."*

Case 0's stated limit — *"it proves nothing about what else is in the schema"* — leaves precisely that addition undetected. An implementer who adds `appointment_customer_id_fkey` for tidiness passes all ten cases while falsifying §6.2's argument and quietly reintroducing the ambiguity T-5's controls were added to remove.

This is cheaper to close than the limit implies. It does **not** require the whole-`\d`-snapshot the design rightly rejected: one assertion that the **set** of non-primary-key constraint names on `appointment` is exactly the seven. Same query, same mechanism, no new brittleness. The design's stated limit is about column types, `NOT NULL` and unrelated objects; extra constraints on the one table under test are a narrower and more consequential case, and I would rather close it than record it.

I did not add it, because the limit is stated in the design as accepted and narrowing it is an amendment, not an implementation detail.

## And one prediction to correct in the record

§8.1 predicts *"Case 0 fails first with `to_regclass('appointment')` null."* Measured, it fails first on **`btree_gist` absent** — my case 0 asserts the extension before the relations, in the order arc42 §8.1 creates them. Harmless, and the failure is more legible for it, but 00a's F1 was exactly this class of defect (a design predicting a red for a reason that turned out not to be the reason), so it belongs in the as-built rather than being noticed later.

---

```json
{
  "role": "test-engineer",
  "outcome": "red-committed",
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": 0, "integration_db_invariant": 10},
  "quality_scenarios_covered": [],
  "quality_scenarios_touched": ["QS-1 (single-threaded clause only)", "QS-2 (single-threaded clause only)", "QS-11 (left-hand side of the mapping only)"],
  "red_commit": "98ace77",
  "ci_failure_confirmed": false,
  "local_failure_confirmed": true,
  "local_result": {
    "command": "npx vitest run --project db",
    "test_files": "1 failed | 2 passed (3)",
    "tests": "10 failed | 6 passed (16)",
    "full_run": "110 tests, 10 failed, 100 passed, failures in exactly one file",
    "case_0": "AssertionError — btree_gist absent, expected/actual diff printed",
    "ac_cases": "42P01 relation \"dealership\" does not exist, each from its own seedDealership call, inside its own it() body",
    "hook_or_collection_errors": 0,
    "red_proof_judge_offline": "ok — red observed, no unit test failed",
    "typecheck": "clean",
    "lint_arch": "clean — 44 modules cruised, every root covered",
    "tests_unit_touched": false,
    "existing_files_modified": 0
  },
  "objections": [
    {
      "ref": "T-7",
      "severity": "major",
      "disputes": "docs/slices/00-design.md §8.3",
      "claim": "tests/integration/postgres-harness.test.ts:50 asserts pgmigrations holds zero rows. At the green commit it holds three, so the slice cannot reach 'all tests green' as specified. §8.3 does not list the file and no step or role owns the update. §4.1 cites this same file four lines above the failing assertion.",
      "remedy": "Rule (a) a second red-commit change updating it to 3 plus the three migration names — costs §9's one-file claim, red-proof unaffected — or (b) assign it to the implementer as its first step-4 obligation. I lean (a) and can produce it on your ruling."
    },
    {
      "ref": "T-8",
      "severity": "minor",
      "disputes": "docs/slices/00-design.md §4.1 (the stated limit) against §6.2",
      "claim": "§6.2 forbids adding singleton foreign keys because they would make the reported constraint non-deterministic in exactly the cases §4.2 depends on. Case 0's stated limit leaves that addition undetected, so a real design property is protected by nothing.",
      "remedy": "Assert the SET of non-primary-key constraint names on appointment is exactly the seven. Same query, same mechanism, not the whole-schema snapshot the design rejected."
    }
  ],
  "corrections_to_the_design": [
    "§8.1 predicts case 0 fails first on to_regclass('appointment') null. Measured: it fails first on btree_gist absent, because case 0 asserts in arc42 §8.1's own creation order. Belongs in the as-built — 00a's F1 was this class."
  ],
  "dcr": null,
  "message": "98ace77 commits ten failing cases in one file with no existing file modified; the red is per-case and assertion-shaped, confirmed locally rather than predicted, and red-proof's judge() accepts the real JSON offline. Two findings against the amended design: the pre-existing harness test asserts zero migrations applied and will block the green commit, and §6.2's no-singleton-foreign-keys property is asserted by nothing."
}
```
