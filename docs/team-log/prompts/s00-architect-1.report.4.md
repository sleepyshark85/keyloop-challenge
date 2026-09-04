# Report · slice 00 · architect · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 00 design, step 1
- Returned: 2026-09-04T09:02:15.396Z
- Duration: 4251s

---

Both confirmed. Verdicts below — no edits, no commits, no PR comment.

## T-7 — AGREE. **Option (a)**, in a structural form, and the test-engineer's cost estimate is too high.

**The finding is correct and it is mine.** §4.1 cites this file's `server_version` case as the load-bearing evidence for T-4's bounded-fragility argument, and I read four lines past the assertion my own slice was about to falsify. §8.3 enumerated the files slice 00 must not modify and never asked the adjacent question.

That adjacency is the generalisable part, so I want it stated rather than absorbed:

> **§8.3 enumerated files by ownership risk. It never asked which existing *assertions* this slice's work falsifies.**

Those are different questions with different answers. "Do not modify X" protects attribution; "what asserts the fact I am about to change" protects the suite from going stale. A slice that changes a fact must find the tests that assert the old one, and no step in the loop currently asks that.

**Rejecting (b) first, on a ground stronger than attribution.** `tests/integration/` is *not* in `guard-paths.mjs`'s `TEST_OWNED` list — I verified it — so the hook would not stop the implementer. But 00a step 7 settled this file's ownership structurally: *a `tests/integration/` file that reaches the database only through a connection string is the test-engineer's*, and `postgres-harness.test.ts` reaches it through `inject('databaseUrl')` and nothing else. Option (b) therefore has **the implementer editing a test-engineer-owned assertion so that the implementer's own commit goes green**, which is the exact shape `CLAUDE.md` §5 exists to forbid — *"If the implementer believes an acceptance test is wrong, it raises a DCR. It does not edit the test."* That the change is obviously correct makes it worse, not better: it is the case where the boundary is cheapest to cross and where crossing it sets the precedent. The hook not catching it is a gap in the hook, not permission.

The test-engineer's own reason against (b) — an unattributed red on the slice whose point is attribution — is also right, and stands as the second reason.

**But (a) costs less than the test-engineer priced it.** It offered to spend §9's *"there is no second explanation available"* and called that mine to spend. It is not spent. §9's claim conflates two things:

- *"the red comes from one file"* — incidental, and now false;
- *"there is no second explanation available"* — the evidential property, and **still true**.

After (a) the red spans two files and **one cause**: the migrations do not exist. `exclusion-constraints.test.ts` says so as `42P01`; the harness says so as an expected/actual on `pgmigrations`. Two statements of one absence is not a second explanation. What needs correcting in §9 is a wording that stated the incidental as though it were the property — my overspecification, written when one file happened to be all it took.

**The structural form, which is what I am actually ruling.** Do not simply change `'0'` to `'3'`. The finding underneath T-7 is that **a harness test is asserting a per-slice fact**, and if it keeps doing so, every future slice that adds a migration owes this file an edit — each one a test-engineer commit that is red until the implementer lands, and each one a fresh temptation toward (b). So:

- **`postgres-harness.test.ts` asserts the seam *ran*, not what it *carried*.** The `pgmigrations` case becomes the table's existence and reachability. That is a harness property, true at every commit of every slice, and it can never go stale. Its docblock's 00a reasoning (*"its emptiness proves zero migrations applied"*) is retired with a note saying why, not deleted.
- **What the seam carried moves into case 0**, where it belongs and where it changes with the slice: `pgmigrations` holds exactly `0001_extensions`, `0002_reference_data`, `0003_appointment`. That strengthens case 0 — it is currently the only thing that would prove the schema arrived *via the migration corpus* rather than by some other route — and it is red at `98ace77`, green after, which is the correct polarity.

Plain (a) as offered is *correct* and I would accept it. The difference is a recurring tax at slices 01, 05 and every later migration, not correctness — so if the test-engineer sees a reason to prefer it, take it and say so.

**Mechanics, since the red is pushed.**

- A **second commit**, the test-engineer's, and it **must not carry the `(red)` marker**. `CLAUDE.md` §7 is *"exactly one red commit per slice"* and `98ace77` is it. Subject in the shape `test(00): the harness asserts the seam ran, not what it carried`.
- **Consequence, named now so nobody finds it at step 5: that commit's CI run will be red, and that redness is not a red proof.** `red-proof` sees an unmarked subject and exits 0 "not applicable", correctly. The orchestrator should log the run for what it is — the same absence `98ace77` already proved, restated in a file that inherited a stale expectation.
- C1 is unaffected. It requires a failing run recorded before any passing one; there will now be two failing runs before the green, and the ordering obligation (append oldest-`updatedAt` first) applies to all three.

**Amendments this forces:** §8.3's *"modifies no existing file"* is false and becomes an explicit list with the reason; §9's one-file wording is corrected to one-cause; §4.1 gains the `pgmigrations` names; and §11.3 gains the missing-question above as a standing check for later slices.

## T-8 — AGREE, and I am narrowing my own stated limit rather than defending it.

**The finding holds.** No current case breaks if `appointment_customer_id_fkey` is added — AC-6 seeds `custB`, so the singleton is satisfied and only the composite fires. What breaks is §6.2's documented behaviour (*"an unknown `customer_id` fails as `23503` on the vehicle composite"*), and the damage lands at slice 03, where §8.6 maps `422 unknown-reference` **by constraint name**. A latent falsification the suite cannot see is exactly the class T-5's controls were added to remove, and §6.2 is currently prose that nothing checks — the same prose-promise shape, one section over.

**The remedy is accepted, and the reason is that the test-engineer separated something I had bundled.** My limit read *"nothing about what else is in the schema"* and lumped three unlike things together: extra constraints, missing `NOT NULL`, wrong column types. Extra constraints **on `appointment`** are not like the other two. `appointment` is the table every one of the nine cases writes to, and constraint identity is precisely what every negative assertion discriminates on — so an extra constraint there is the one addition that can change what a passing test means. Set equality on names is the same query, the same mechanism, and carries none of `pg_get_constraintdef`'s text fragility. **Close it.**

Two boundaries on the remedy, so the narrowing stays narrow:

1. **Assert the set of `conname` where `contype <> 'p'` on `appointment` equals exactly the seven.** Measured on `postgres:16`: `pg_constraint` returns exactly those seven plus `appointment_pkey`, so the filter is clean today. **Assumed, not measured:** whether a later major version surfaces `NOT NULL` as `pg_constraint` rows and breaks this. It would fail loudly in the same commit as the bump, alongside case 0's text assertions, which is the same bounded fragility already accepted.
2. **Do not extend set equality to the other eight tables.** No negative case discriminates on their constraints, so it buys nothing and is the first step back toward the whole-`\d` snapshot I rejected.

**What remains open after this**, stated so §4.1's limit is accurate rather than merely shorter: column types, `NOT NULL` on `appointment`, constraints on the eight reference tables, and unrelated schema objects. That is a smaller and more honest limit than the one I wrote.

## The as-built correction — AGREE, and it is worse than F1-class

Record it. Case 0 fails first on `btree_gist`, not on `to_regclass('appointment')`, because it asserts in §8.1's creation order. The measured behaviour is better than the prediction — an extension that never got created is a more legible first failure than a missing table.

But the reason it was wrong is not F1's. **F1 required a measurement to catch; this required only reading §4.1 against §8.1.** §4.1 lists the assertions in the order extension → relations → constraints, and four sections later §8.1 predicted the first failure as though relations came first. That is not an unverified claim about the world; it is a document contradicting itself. The pattern §0.1 records has a cheapest tier I had not named: **its cheapest instances are catchable by reading the document against itself**, before any mutant or call site is involved. That belongs in §11.1's as-built correction and in §0.1's framing.

## What the test-engineer should do now

One commit, unmarked, containing: the harness `pgmigrations` case reduced to the seam's existence with its 00a reasoning retired in place; case 0 gaining the three migration names; and case 0 gaining the constraint-name set equality. All three are amendments I am ruling now, so none of them is unilateral.

```json
{
  "role": "architect",
  "outcome": "adjudicated",
  "arc42_sections_touched": [],
  "adrs": [],
  "quality_scenarios": ["QS-1", "QS-2", "QS-11"],
  "assumptions": [
    "NEW: that a later PostgreSQL major version may surface NOT NULL as pg_constraint rows and break T-8's set equality — assumed, not measured; fails loudly in the same commit as any bump",
    "A-6 unchanged: that `npm run db:migrate` names the failing migration file — still a step-4 obligation",
    "A-1, A-2, A-3, A-5 unchanged; A-4 remains closed"
  ],
  "open_questions": [
    "Whether the test-engineer prefers plain (a) over the structural form — the difference is recurring cost at later migrating slices, not correctness, and it may take it",
    "R-9a's eventual close: conform db:migrate rather than supersede ADR-0007 — the human's",
    "AC-7's unnamed constraint and AC-9's 'deterministically' remain as flagged in §11.4"
  ],
  "dcr_ruling": "T-7: (a) — a second, UNMARKED test-engineer commit, in the structural form (the harness asserts the seam ran; the corpus contents move into case 0). (b) rejected: it has the implementer editing a test-engineer-owned assertion to green its own commit, which guard-paths does not catch and CLAUDE.md §5 forbids. T-8: (a) Clarification — remedy accepted, my stated limit narrowed. Both applied in one pass on the next run; loopbacks remain 0.",
  "message": "Both findings agreed. T-7 is mine and the miss is structural: §8.3 enumerated files by ownership risk and never asked which existing assertions this slice falsifies. I rule option (a), but the cost the test-engineer offered to pay is not owed — §9's evidential property is 'no second explanation', which two files stating one absence do not violate; only the incidental one-file wording changes. On T-8 I am narrowing my own limit rather than defending it, because the test-engineer correctly separated extra constraints on the table under test from the unlike things I had bundled with them."
}
```
