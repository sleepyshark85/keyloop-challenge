# Report · slice 00 · test-engineer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 00 step 2 agree
- Returned: 2026-09-04T09:07:03.910Z
- Duration: 3027s

---

Done. **`dc3b459`**, unmarked, on `slice/00-schema-and-constraints`. Not pushed, no PR comment, nothing written to `docs/team-log/` — the orchestrator-owned changes sitting in the working tree (`docs/DEFECTS.md`, `docs/team-log/`) were left unstaged.

I took the structural form, not plain (a). The recurring-cost argument is decisive: `count === '0'` was the wrong *kind* of assertion for that file to make, and changing it to `'3'` would have left the same trap armed for slices 01 and 05 with a fresh pull toward (b) each time. And you are right that I priced §9 too high — two files naming one absence is one explanation stated twice.

## What changed

**1. `postgres-harness.test.ts` — the seam ran, not what it carried.** The case is now `pgmigrations exists and is reachable`: `to_regclass('public.pgmigrations')` resolves, and the table is readable. A harness property, true at every commit of every slice, incapable of going stale. 00a's reasoning is retired **in place** with a note recording what was wrong with it, including the hook gap — `tests/integration/` is not in `TEST_OWNED`, so a Write there by the implementer is ALLOWed, which is why (b) was the dangerous option rather than merely the untidy one.

**2. Case 0 (a) — the migration names.** `select name from pgmigrations order by name` must equal `['0001_extensions', '0002_reference_data', '0003_appointment']`. I placed it **first**, ahead of `btree_gist`, because it is the most upstream fact and it names the cause where the extension names a symptom. It is also, as the ruling says, the only assertion in the suite that says *where the schema came from* — a schema arriving by a stray `CREATE TABLE` or baked into an image satisfies every other case in the file.

**3. Case 0 (d) — the constraint-name set.** Set equality on `conname where contype <> 'p'` runs **before** the definition loop (coverage before result), with both boundaries recorded in the file: measured that `pg_constraint` returns exactly those seven plus `appointment_pkey` on `postgres:16`; assumed-not-measured whether a later major surfaces `NOT NULL` as `pg_constraint` rows, and labelled as such; not extended to the other eight tables.

I also narrowed case 0's stated limit in the file docblock — it claimed to prove nothing about "an extra constraint", which is now false. Leaving prose standing that the code has outgrown is the thing I have been objecting to twice.

## Verbatim result — `npx vitest run --project db`

```
 ❯ |db| tests/integration/exclusion-constraints.test.ts (10 tests | 10 failed) 33ms
     × case 0 — the schema under test IS arc42 §8.1 and §8.2 (a precondition for every case below) 9ms
     × AC-1 … × AC-9

⎯⎯⎯⎯⎯⎯ Failed Tests 10 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  ... > case 0 — the schema under test IS arc42 §8.1 and §8.2 (a precondition for every case below)
AssertionError: pgmigrations must record exactly the three migrations of arc42 §8.1 and §8.2,
in filename order — node-pg-migrate sorts the directory listing, and btree_gist MUST precede
the exclusion constraints: expected [] to deeply equal [ '0001_extensions', …(2) ]

- Expected
+ Received

- [
-   "0001_extensions",
-   "0002_reference_data",
-   "0003_appointment",
- ]
+ []

 ❯ tests/integration/exclusion-constraints.test.ts:292:7

 FAIL  ... > AC-1 …  [AC-1 … AC-9 unchanged]
error: relation "dealership" does not exist
 ❯ seedDealership tests/support/seed.ts:90:3
 ❯ tests/integration/exclusion-constraints.test.ts:371:15

 Test Files  1 failed | 2 passed (3)
      Tests  10 failed | 6 passed (16)
   Duration  3.00s
```

Full run: **110 total, 10 failed, 100 passed, failures in one file.** `npm run typecheck` clean. `npm run lint:arch` clean — *"no layering violations. 44 module(s) cruised, every root covered: src, tests"*. `tests/unit/` untouched.

## Which cases fail now, and why

| | before | after |
|---|---|---|
| `postgres-harness.test.ts` (4 cases) | would have gone **red at the green commit** on `count === '0'` | **green now and green after** — it asserts only that the seam ran |
| case 0 | `AssertionError` on `btree_gist` absent | `AssertionError` on **`pgmigrations` empty** — the migrations do not exist |
| AC-1 … AC-9 | `42P01 relation "dealership" does not exist`, each from its own `seedDealership` | unchanged |

The first-failure message moved again, and for the same reason it moved the first time: the assertions are ordered by causal depth, and the design's prediction was written against a different order. Case 0's message now names the cause directly — *no migrations applied* — rather than a downstream symptom of it.

## The red polarity, confirmed offline

```
red-proof, unmarked subject:
{"ok":true,"reason":"not applicable: the head commit subject \"test(00): the harness asserts
the seam ran, not what it carried\" does not match /^test\\(.+\\): .*\\(red\\)$/, so nothing
is asserted about this run"}
```

So the claim in the commit message is checked rather than asserted: this commit's CI run will be red, `red-proof` will exit 0 *not applicable*, and `98ace77` remains the slice's single red proof.

## One thing to carry into step 7

The as-built note now owes **two** corrections to §8.1's prediction, not one, and they are the same defect twice: the design predicted the first failure as `to_regclass('appointment')` null when §4.1 listed extension-then-relations, and case 0's assertion order has since moved again. The general form is worth stating once rather than as two footnotes — **a prediction about which assertion fails first is a claim about assertion ordering, and it belongs beside the ordering rather than four sections away from it**, where the two can drift without either being wrong on its own page.

```json
{
  "role": "test-engineer",
  "outcome": "revised",
  "commit": "dc3b459",
  "red_commit": "98ace77",
  "marked_red": false,
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": 0},
  "changes": [
    "postgres-harness.test.ts — pgmigrations case reduced to the seam's existence and reachability; 00a's 'its emptiness proves zero migrations applied' retired in place with a note covering the guard-paths TEST_OWNED gap",
    "exclusion-constraints.test.ts case 0 (a) — pgmigrations holds exactly 0001_extensions, 0002_reference_data, 0003_appointment, placed first as the most upstream fact",
    "exclusion-constraints.test.ts case 0 (d) — set equality on conname where contype <> 'p', asserted before the definition loop; both ruled boundaries recorded in the file",
    "case 0's stated limit in the file docblock narrowed to match what the code now proves"
  ],
  "local_result": {
    "command": "npx vitest run --project db",
    "test_files": "1 failed | 2 passed (3)",
    "tests": "10 failed | 6 passed (16)",
    "full_run": "110 total, 10 failed, 100 passed, one failing file",
    "case_0_first_failure": "AssertionError — pgmigrations empty, expected the three migration names",
    "ac_cases": "42P01 relation \"dealership\" does not exist, each from its own seedDealership call",
    "postgres_harness": "green at the red commit, and stays green at the green commit",
    "hook_or_collection_errors": 0,
    "red_proof_judge_offline": "not applicable — unmarked subject, nothing asserted about this run",
    "typecheck": "clean",
    "lint_arch": "clean — 44 modules cruised, every root covered",
    "tests_unit_touched": false
  },
  "objections": [],
  "carry_to_step_7": [
    "§8.1's first-failure prediction has now been wrong twice, both times because it lives four sections away from §4.1's assertion order. The as-built should state the general form once — a prediction about which assertion fails first belongs beside the ordering it depends on — rather than record two separate corrections."
  ],
  "dcr": null,
  "message": "dc3b459 takes the structural form of T-7 rather than the literal one, so no future migrating slice owes postgres-harness.test.ts an edit, and adds T-8's set equality with both ruled boundaries recorded in the file. The harness test is green at the red commit and stays green after; case 0 now fails first on the empty pgmigrations, which names the cause rather than a symptom."
}
```
