# Report · slice 00 · test-engineer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 00 step 2 agree
- Returned: 2026-09-04T11:00:26.277Z
- Duration: 9829s

---

**`53b15f9`** on `slice/00-schema-and-constraints`. Not pushed, no PR comment.

Committed with `git commit --only tests/integration/exclusion-constraints.test.ts` — and the rule earned its keep on this very commit: `docs/DEFECTS.md` and `docs/team-log/events.jsonl` were **already staged in the index** when I ran it. A bare `git commit` would have put both into a test-engineer commit. `git status` after shows them still staged and untouched.

## Verbatim results

```
npm test                        Test Files  10 passed (10)      Tests  111 passed (111)
npx vitest run --project db     Test Files   3 passed (3)       Tests   17 passed (17)
npm run typecheck               clean
npm run lint:arch               no layering violations. 44 module(s) cruised, every root covered: src, tests
npm run test:tools              14/14 passed
```

The suite is green against the merged migrations, so the three new assertions are confirmed both by mutant probe **and** by passing against the real schema — which the red commit could not give me.

## What each mutant printed

**R00-3** — the new `AC-7 (technician half)` case, against `postgres:16.15`:

```
correct schema
  negative (D1 technician under D2)  REJECTED constraint "appointment_technician_in_dealership"
  control  (D2 technician)           ACCEPTED

MUTANT: constraint dropped
  negative (D1 technician under D2)  ACCEPTED     <- case red at the rejection assertion

MUTANT: singleton FK (technician_id) instead of the composite
  negative (D1 technician under D2)  ACCEPTED     <- case red at the rejection assertion
```

Both mutants killed at the *first* assertion in the case — `rejection()` reports *"expected the database to REJECT this insert, but it succeeded"*. The fixture needed one non-obvious move: D1's **service type** travels with D1's technician, because `appointment_technician_qualified` keys on the pair and `(D1.techA, D2.standard)` is not a qualification that exists. Using D2's service type would have made a second FK violable and put the case back under A-2's non-guarantee.

**R00-4** — the reviewer's drift, reproduced and then killed:

```
AC-1, with the (techB, quick) qualification row deleted
  1 first   bayA/techA [0,60)      ACCEPTED
  2 overlap bayA/techB [30,90)     REJECTED constraint "no_bay_overlap"        <- OLD assertion still passes
  3 CONTROL bayB/techB [30,90)     REJECTED constraint "appointment_technician_qualified"   <- red

AC-2, with bayB moved to another dealership
  1 first   bayA/techA [0,60)      ACCEPTED
  2 overlap bayB/techA [30,90)     REJECTED constraint "no_technician_overlap" <- OLD assertion still passes
  3 CONTROL bayB/techA [120,180)   REJECTED constraint "appointment_bay_in_dealership"      <- red
```

The control is the only thing that catches either. AC-1's control repairs the **bay**; AC-2's repairs the **interval**, because freeing the technician would drag `service_type_id` with it through the qualification composite — the asymmetry is forced by the fixture's deliberate `techB → quick only`, not chosen, and the file says so rather than leaving it to look arbitrary.

**A-7f** — confirmed, and **larger than reported**. On `postgres:18.6` the denylist returns **twelve** extra `contype='n'` rows on `appointment`, not six — one per `NOT NULL` column:

```
18.6  contype <> 'p'                 → 7 real + 12 × contype 'n'
        appointment_id_not_null, appointment_dealership_id_not_null,
        appointment_customer_id_not_null, appointment_vehicle_id_not_null,
        appointment_service_type_id_not_null, appointment_technician_id_not_null,
        appointment_bay_id_not_null, appointment_starts_at_not_null,
        appointment_ends_at_not_null, appointment_status_not_null,
        appointment_created_at_not_null, appointment_updated_at_not_null
18.6  contype in ('c','f','u','x')   → exactly the 7
16.15 contype in ('c','f','u','x')   → exactly the 7
```

The magnitude matters more than the discrepancy with the six first reported: the noise is **a function of the NOT NULL column count**, so it grows as the table does. A denylist gets louder and more obviously "too strict" the more correct the schema becomes, which sharpens the failure-direction argument rather than softening it.

**One defect of my own, found by reading this file's run output.** AC-9 fired eight overlapping `client.query()` calls through `Promise.all` on a single `pg.Client`: `DeprecationWarning: Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0`. `pg` serialised them anyway, so the parallelism bought nothing — one connection either way. Now sequential; the warning is gone. Fixed in this commit and named in its message.

---

# The `UPDATE` question — my answer

**Neither. It is not in slice 00's ACs, and calling it a slice 06 obligation is how it gets lost.** It needs a ruling from the human now, before 06 is designed.

**First, the property is real — measured, not assumed.** I would not hand you a scope question about a mechanism nobody had run:

```
A = [09:00,10:00)   B = [11:00,12:00)   same bay, same technician

UPDATE A -> [09:00,10:30)  overlaps ITS OWN old interval   ACCEPTED
UPDATE A -> [10:30,11:30)  overlaps B                      REJECTED  no_bay_overlap
UPDATE A -> [10:00,11:00)  adjacent to B                   ACCEPTED
```

arc42 §8.2 consequence 4 holds on `postgres:16.15`, in all three directions, and the row ends where the last accepted `UPDATE` put it. Good — if it had not held, ADR-0003 would need superseding rather than testing.

**Why it is not slice 00's.** No AC names it. AC-4 is the only criterion mentioning an `UPDATE`, and it *relaxes* the predicate. Adding an AC-10 is not mine — `CLAUDE.md` §6 puts acceptance criteria with the human, and a test-engineer who writes an assertion no criterion asked for has legislated scope, which is the same failure as an implementer editing an acceptance test. So I did not add it.

**Why it is not simply slice 06's either, and this is the substantive half.** §6.3's argument for keeping AC-5 and AC-7 here was *"unreachable from HTTP"*. That argument does **not** apply — `PATCH /appointments/{id} {startsAt}` reaches this property exactly. But the *other* half of §6.3's reasoning does apply, and it is the one that matters:

> By slice 06 the property is reached through `PATCH`, through a use case, through Kysely and through ADR-0004's retry loop. If it fails there, the failure is ambiguous between PostgreSQL's `UPDATE` semantics and the application's move logic. **Slice 00 is the only moment it can be an unambiguous claim about the database.**

That is the same shape as slice 00's own §5 note about ADR-0006: *"slice 00 establishes that PostgreSQL emits these fields; it establishes nothing about whether Kysely preserves them."* The two claims are genuinely separate and each needs its own test. The self-overlap property is the mirror image — the database half is cheap and unambiguous **here**, and expensive and ambiguous **there**.

**And it is already assigned, twice, to nothing.** arc42 §8.5 lists `tests/integration/`'s purpose as *"Single-threaded persistence behaviour: **self-overlapping reschedule**, cancellation releasing a slot."* Cancellation-releasing-a-slot landed as AC-4. Its sibling clause in the same sentence did not. §8.2 consequence 4 says the property is *"pinned by QS-6"*, and QS-6 has no slice yet. So arc42 names the claim, names the directory, and names the quality scenario — and no slice carries it. That is precisely the state a documented obligation is in just before it is forgotten.

**What I recommend, and its price.** An **AC-10 on slice 00**, ruled by the human at the gate. About twenty-five lines, one new namespace, no new fixture, no application code:

1. Seed. A at `[anchor, +60)` and B at `[anchor+120, +180)`, same bay, same technician; both read back.
2. `UPDATE` A to `[anchor, +90)` — overlapping its own prior interval — **succeeds**. That is consequence 4, and it is the clause ADR-0003's atomic move rests on.
3. `UPDATE` A to `[anchor+90, +150)` — overlapping B — rejected `23P01` / `no_bay_overlap`; **B unchanged**.
4. Positive control, after the negative per §4.6: `UPDATE` A to `[anchor+60, +120)` — adjacent to B — **succeeds**, and A is read back at the new interval.

If the human declines, the fallback is **not** silence: it should be recorded as a named obligation on slice 06 citing QS-6 and §8.2 consequence 4, so 06's step 1 inherits it rather than rediscovering it.

**One thing I would push back on regardless.** The reviewer wanting the human to break this by hand at the gate is good exploratory practice and is not a substitute for the assertion. `CLAUDE.md` §2.4's logic applies unchanged: a property confirmed once by hand and asserted nowhere is a property that regresses silently, and the regression lands in slice 06 where it is hardest to attribute. Hand-testing it tells us the schema is right today. It tells us nothing about tomorrow.

```json
{
  "role": "test-engineer",
  "outcome": "revised",
  "commit": "53b15f9",
  "marked_red": false,
  "red_commit": "98ace77",
  "committed_by_pathspec": true,
  "index_contained_other_roles_staged_files": ["docs/DEFECTS.md", "docs/team-log/events.jsonl"],
  "findings_fixed": ["R00-3", "R00-4", "A-7f"],
  "self_found_and_fixed": ["AC-9 fired 8 overlapping client.query() calls via Promise.all on one pg.Client — pg deprecation warning, removed in pg@9. Now sequential."],
  "verification": {
    "npm test": "10 files, 111 passed",
    "npx vitest run --project db": "3 files, 17 passed",
    "typecheck": "clean",
    "lint:arch": "clean — 44 modules, every root covered",
    "test:tools": "14/14 passed"
  },
  "mutants": {
    "R00-3 constraint dropped": "negative insert ACCEPTED -> case red at the rejection assertion",
    "R00-3 singleton FK instead of composite": "negative insert ACCEPTED -> case red at the rejection assertion",
    "R00-4 AC-1 drift, (techB,quick) qualification deleted": "old assertion still passes on no_bay_overlap; control REJECTED appointment_technician_qualified -> red",
    "R00-4 AC-2 drift, bayB moved to another dealership": "old assertion still passes on no_technician_overlap; control REJECTED appointment_bay_in_dealership -> red",
    "A-7f on postgres:18.6": "denylist returns 12 extra contype='n' rows (one per NOT NULL column, not the six first reported); allowlist returns exactly the 7 on 18.6 and 16.15"
  },
  "update_question": {
    "measured_on_16.15": {
      "self-overlapping UPDATE": "ACCEPTED — arc42 §8.2 consequence 4 holds",
      "UPDATE into a neighbour's interval": "REJECTED 23P01 no_bay_overlap",
      "UPDATE adjacent to a neighbour": "ACCEPTED"
    },
    "verdict": "Not slice 00's — no AC names it and writing an unasked assertion is legislating scope. But not simply slice 06's either: by 06 it is reached through PATCH, a use case and Kysely, so a failure is ambiguous between the database's UPDATE semantics and the application's move logic. Slice 00 is the only moment it is an unambiguous claim about PostgreSQL — the same argument §6.3 makes for AC-5 and AC-7, and the same shape as §5's Kysely caveat.",
    "evidence_it_is_being_lost": "arc42 §8.5 names 'self-overlapping reschedule' in the same sentence as 'cancellation releasing a slot'; the second landed as AC-4, the first did not. §8.2 consequence 4 says it is 'pinned by QS-6', and QS-6 has no slice.",
    "recommendation": "AC-10 on slice 00, ruled by the human at the gate — ~25 lines, one namespace, no new fixture, no application code. If declined, record it as a named slice 06 obligation citing QS-6 and §8.2 consequence 4 rather than leaving it to be rediscovered.",
    "pushback": "Hand-breaking it at the gate is not a substitute. CLAUDE.md §2.4's logic applies: a property confirmed once by hand and asserted nowhere regresses silently, and the regression lands where it is hardest to attribute."
  },
  "dcr": null,
  "message": "53b15f9 fixes all three ruled findings, each mutant-checked against a real container and now also passing against the merged schema. The pathspec rule fired on this commit — two orchestrator-staged docs files were in the index and were correctly left there. On the UPDATE question: the property is measured and holds, it is not in slice 00's ACs, and deferring it to slice 06 costs the attributability that makes it worth asserting at all — it needs the human's ruling now."
}
```
