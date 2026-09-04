# Report · slice 00 · test-engineer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 00 step 2 agree
- Returned: 2026-09-04T08:26:11.884Z
- Duration: 575s

---

Probe container removed. Here is my judgement.

---

# OBJECT

Three objections. Two of them are the two things the architect said it believed were wrong — both are real, and both are now measured rather than argued. Everything else in the design I agree with, and where I decline to object I say why, because a step 2 with no disagreement is deference, not consensus.

**Step-2 action item first (§8.2 item 1, A-4): `docker info` succeeds in the test-engineer's shell.** Docker Engine 29.8.0, `postgres:16` pulled and started, schema applied. 00a §11.5's "docker and podman are both absent" is falsified for this role as well as the architect's. `podman` is still absent. Every measurement below was taken in a throwaway `postgres:16` container from arc42 §8.1's schema pasted verbatim, then removed.

---

## T-4 — MAJOR — Case 0 does not assert what the exclusion constraints are *keyed on*, and nothing else in the suite deterministically does

§4.1 specifies that `pg_get_constraintdef` for the two exclusion constraints must contain `tstzrange(starts_at, ends_at)`, `&&`, and the partial predicate. It does not require the assertion to name `bay_id` or `technician_id`. That is the one column that makes `no_bay_overlap` a *bay* constraint, and it is the column case 0 exists to cover — Rule 1 is "an assertion about coverage before an assertion about a result", and this is the coverage half missing the thing under test.

**Measured.** I built the mutant `no_bay_overlap EXCLUDE USING gist (dealership_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status <> 'cancelled')` and ran §4.4's five steps against it:

| §4.4 step | correct schema | mutant keyed on `dealership_id` |
|---|---|---|
| 3 negative control `[a+0.5, a+1.5)` | rejected `no_bay_overlap` | **rejected `no_bay_overlap`** |
| 4 upper adjacency `[a+1, a+2)` | accepted | **accepted** |
| 5 lower adjacency `[a-1, a+0)` | accepted | **accepted** |
| 6 three rows in bayA | 3 | **3** |

The whole of AC-3 passes. So does AC-1: `(bayA, techA)` then an overlapping `(bayA, techB)` reports `no_bay_overlap` under the mutant exactly as under the correct schema. The only case that catches it is AC-2 — and it catches it *because* both exclusion constraints are violable at once and PostgreSQL happened to report `no_bay_overlap`:

```
AC-2 second insert (bayB, techA, overlapping)
  correct schema  -> exclusion constraint "no_technician_overlap"   (pass)
  mutant          -> exclusion constraint "no_bay_overlap"          (fail)
```

That is §11.2 **A-2** — "which exclusion constraint is reported when both are violable ... PostgreSQL does not document a guarantee". The design correctly refuses to *rely* on A-2 in §4.2, and then the suite's only defence against a wrongly-keyed constraint rests on it anyway. If index order goes the other way on a future minor version, AC-2 passes too and a `dealership_id`-keyed constraint — which serialises the entire dealership to one appointment at a time, and would be caught by nothing until slice 07 — ships green.

**Change that resolves it.** §4.1 asserts the **full normalised `pg_get_constraintdef` text**, by equality, for all seven named constraints — not a substring set. The exact strings, measured on `postgres:16` (16.15):

```
no_bay_overlap                        x  EXCLUDE USING gist (bay_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE ((status <> 'cancelled'::appointment_status))
no_technician_overlap                 x  EXCLUDE USING gist (technician_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE ((status <> 'cancelled'::appointment_status))
appointment_interval_ordered          c  CHECK ((ends_at > starts_at))
appointment_technician_qualified      f  FOREIGN KEY (technician_id, service_type_id) REFERENCES technician_qualification(technician_id, service_type_id)
appointment_bay_in_dealership         f  FOREIGN KEY (bay_id, dealership_id) REFERENCES service_bay(id, dealership_id)
appointment_technician_in_dealership  f  FOREIGN KEY (technician_id, dealership_id) REFERENCES technician(id, dealership_id)
appointment_vehicle_owned_by_customer f  FOREIGN KEY (vehicle_id, customer_id) REFERENCES vehicle(id, customer_id)
```

This costs nothing over the specified assertion and closes a second family for free: `contype = 'f'` does not distinguish the four foreign keys' *targets*, so a composite FK pointed at the wrong table or the wrong column pair currently reaches no assertion at all. Equality on the definition pins all of it.

The one cost, stated: an equality assertion is version-fragile — a future PostgreSQL that re-renders the text breaks case 0 loudly. I accept that trade deliberately. Loud on a version bump beats silent on a wrong column, and `postgres:16` is pinned in `tests/setup/postgres.ts`.

---

## T-5 — MAJOR — the one-violable-constraint discipline is enforced non-uniformly, by undocumented trigger order, and there is a shape that makes drift fail loudly

The architect asks whether hand-maintained discipline is good enough. It is not, and the reason is sharper than "nothing enforces it": the discipline is enforced in *some* directions by accident and not in others, so the appearance of enforcement is itself misleading.

**Measured.** Take AC-5's fixture `(techB, standard)` and drift the seed so the technician silently belongs to another dealership — now `appointment_technician_qualified` *and* `appointment_technician_in_dealership` are both violable:

```
AC-5 fixture, clean    -> "appointment_technician_qualified"        (pass)
AC-5 fixture, drifted  -> "appointment_technician_qualified"        (PASSES SILENTLY)

AC-6 fixture, clean    -> "appointment_vehicle_owned_by_customer"   (pass)
AC-6 fixture, drifted  -> "appointment_technician_qualified"        (fails loudly)
```

AC-6 drift is loud; AC-5 drift is silent. Which one you get is decided by the order the FK triggers happen to fire, which is the same non-guarantee as A-2. So §4.2's rule 2 ("assert the constraint name, never merely the SQLSTATE") catches drift only when drift changes the reported name — and the case where it does not is the case where the fixture is broken in the *same dimension* as the constraint under test, which is the likeliest drift there is.

**The shape that fixes it: a positive-control sibling per negative case.** Before asserting that fixture *F* is rejected by constraint *C*, insert *F′* — identical to *F* in every column but the one that makes *C* violable, on a disjoint interval — and assert it is **accepted**. The pair is the executable form of "exactly one constraint is violable": if the fixture has drifted into violating anything else, the *accepted* half is rejected and the case goes red naming the drifted constraint.

**Measured to work**, on the same drifted fixture that defeats the name assertion:

```
correct fixture:  subject (techB, standard)   -> "appointment_technician_qualified"
                  sibling (techB, quick)      -> ACCEPTED                             (pass)

drifted fixture:  subject (d2tech, standard)  -> "appointment_technician_qualified"   (still passes)
                  sibling (d2tech, quick)     -> "appointment_technician_in_dealership"  <-- LOUD
```

The sibling names the drift. That is the whole ask.

**Change that resolves it.** §4.6 and §4.7 each gain a sibling insert:

| case | subject (rejected) | sibling (accepted) — one column different |
|---|---|---|
| AC-5 | `(techB, standard)` | `(techB, quick)` |
| AC-6 | `vehA` + `custB` | `vehA` + `custA` |
| AC-7 | `bayA` of D1, `dealership_id` D2 | `bayA` of D2, `dealership_id` D2 |
| AC-8 | `ends_at <= starts_at` | `ends_at > starts_at`, same row otherwise |

Cost: four inserts. Note this is not a new idea — it is the pattern the design *already* applies to AC-3 (step 3) and AC-4 (step 2), where a success assertion is paired with a control. I am asking for it in the other direction, on the four cases §4.2 identifies as unguarded, so the discipline is symmetric rather than applied where it happened to occur to the author.

One consequence to state plainly: AC-5 and AC-7 are §6.3's unreachable-from-HTTP constraints. This is the only slice in which they can be shown to fire at all, so it is the only slice in which their fixtures can be shown not to be lying.

---

## T-6 — MINOR — §4.4's step 5 is redundant with step 4, and its stated reason is false

The architect asked which of §4.4's four assertions is redundant. It is **step 5**, the lower-boundary insert.

The reason given is *"a range type is defined by two bounds and testing one of them is half the claim."* That conflates the range type's two bounds with the test's two rows. There is one range expression, `tstzrange(starts_at, ends_at)`, evaluated on both operands, and `&&` is symmetric. Step 4 tests the equality `neighbour.ends_at = candidate.starts_at`; step 5 tests `candidate.ends_at = neighbour.starts_at`. Both are the same boundary equality with the row labels swapped, and no mutant expressible in an `EXCLUDE` clause can accept one and reject the other.

**Measured**, on the only realistic mutant the design itself names — `tstzrange(starts_at, ends_at, '[]')`:

```
step 4 [a+1h, a+2h) -> rejected "no_bay_overlap"
step 5 [a-1h, a+0h) -> rejected "no_bay_overlap"
```

Both catch it. Step 4 alone suffices. (Unmeasured, reasoned: the same symmetry argument covers a buffered range such as `tstzrange(starts_at - interval '15 min', ends_at)` — an intended asymmetry still applies to both rows, so it moves both boundaries. I label this reasoned, not measured, per §0 rule 2; my attempt to measure it failed on a probe error I did not chase before tearing the container down.)

**Change that resolves it: keep step 5, replace its reason.** Four lines is a fair price for a case that also fails loudly if a future refactor makes the constraint asymmetric in a way `EXCLUDE` cannot currently express, and it costs nothing. But a false causal sentence in a design that has made "measured or labelled unmeasured" its rule is a defect by that design's own standard, and it is the second time (after 00a F1) that a mechanism was stated confidently and did not hold. The honest sentence is: *step 5 is a cheap symmetry check that no known mutant requires; step 4 carries the claim.*

**And the other three do work, individually.** So the answer to "which is redundant or missing" is complete:

| assertion | mutant it uniquely rejects |
|---|---|
| step 2 read-back | neighbour absent, neighbour cancelled, neighbour in the wrong bay |
| step 3 control | constraint absent; constraint keyed on `technician_id` (**measured**: the control is *accepted* under the swap) |
| step 4 | `'[]'` bounds (**measured**) |
| step 5 | none |
| step 6 count | steps 4/5 landing in the wrong bay, or the neighbour vanishing |
| **missing** | **the keyed column — T-4, and it belongs in case 0, not here** |

---

## The other points

**1. AC-1 to AC-9 — I can write a failing test for every one, and each fails for the reason it names.** No AC is untestable as written and I raise no DCR against the ACs. Per-AC: AC-1 ✓, AC-2 ✓ (and §4.2's "different bay for the second insert" is necessary — measured, without it you get `no_bay_overlap`), AC-3 ✓ with T-4/T-6, AC-4 ✓, AC-5 ✓ with T-5, AC-6 ✓ with T-5, AC-7 ✓ with T-5 — and I support §11.4(1): fixing AC-7 at `23503` / `appointment_bay_in_dealership` is the only reading that makes it evidence for A-9, since "rejected" alone is satisfied by four constraints. AC-8 ✓ with T-5. AC-9 ✓ as read in §3.5 and §11.4(2)–(3).

**4. `beforeAll` may only connect — agreed, and I will hold to it.** `beforeAll` constructs a `pg.Client` from `inject('databaseUrl')` and calls `connect()`; `afterAll` calls `end()`. No DDL, no DML, no seeding, **and no assertions** — I add that last one, because an `expect` in a hook is a hook error with the same representation problem as a DDL failure, and A-1 says that representation is unmeasured. At the red commit `globalSetup` applies zero migrations and succeeds, the connect succeeds, and every case fails in its own body: case 0 on `to_regclass('appointment')` being null, the other nine on `42P01 relation "dealership" does not exist` from their own `seedDealership`. That is assertion-shaped red under `tests/integration/` only, which is `red-proof`'s O-1 branch — `RED_ZONE` includes `integration`, `MUST_PASS` is `tests/unit/` alone, so the classification holds.

**5. ADR-0012 and derived ids — I do not object, and this is a verdict rather than a concession.** The architect pre-conceded that derived ids are legibility, not correctness, and invited an objection; I decline it for a reason it did not state. In a suite that isolates by data with no truncation and no cleanup, the UUID *is* the only handle on which subtree a failure belongs to. `randomUUID()` makes a failing case a screenshot; a derived id makes it re-runnable, and the twenty lines are recovered the first time a case fails in CI and I have to reason about which of several parallel subtrees produced the row. The failure modes are all benign: a buggy `uuidFor` that returns a constant collides loudly on `dealership_pkey`, and no-`ON CONFLICT` makes namespace reuse loud too.

The fixture gives me a clean starting state for AC-1 to AC-8. I walked all eight against §3.3's table: two bays and two technicians are exactly enough (AC-4's "before" and "after" inserts need `techB` free, and `techB` is `quick`-only, so those inserts must use `quick` — that works, and it is the asymmetry doing double duty). AC-3's steps 3, 4 and 5 can all use `techA` without self-collision because step 3 is rejected and steps 4 and 5 do not overlap each other. One note on the parallelism premise: Vitest parallelises *files*, and cases within `exclusion-constraints.test.ts` run sequentially — so per-case namespaces buy cross-file disjointness and future-proofing rather than intra-file concurrency. That does not change the decision, but "the suite is parallel" is doing less work here than the design implies.

**6. `service_type`, `customer` and `vehicle` not being dealership-scoped breaks no case I would write.** I checked every collidable constraint across parallel seeds: `vehicle.vin`'s global `UNIQUE` is the only one, and `vinFor` handles it; `technician_qualification`'s PK is `(technician_id, service_type_id)` and both are namespace-derived. The one consequence I will hold to is already in §3.5 — the counts for those three tables are scoped `WHERE id = ANY($returned)`, never a bare `count(*)`, or AC-9 becomes a race against every other file in the run.

**7. I accept the deferred `singleTransaction` divergence,** and the design's reason is weaker than the true one. It is not merely that both paths fail loudly: with one fresh container per run and `withReuse()` off, `globalSetup` never meets a database that a previous partial migration could have left dirty, so the divergence is **unobservable in the harness**. It bites only a human re-running `npm run db:migrate` against a persistent local database. That makes it a §11 debt item, exactly as §10.2 proposes, and not worth spending 00a's seam promise on in the slice where that promise is what attributes a CI failure. I would rather the file I own stay byte-identical across this slice.

**One mechanical note, not an objection.** `CLAUDE.md` §7 spells the red commit `test(acceptance): … (red)`, and this slice has no acceptance test. `red-proof.mjs`'s `RED_COMMIT_SUBJECT` is `/^test\(.+\): .*\(red\)$/`, so any scope arms the check; I will use `test(00): … (red)` per §7's slice-id rule. Flagging it so the ruling is on the record rather than inferred from a passing job.

---

## What I will write at step 3, if the objections are ruled

Three files, one commit, `test(00): the schema, the exclusion constraints and the seed fixtures (red)`:

- `/home/agentadmin/sources/keyloop-challenge/tests/support/ids.ts` — `uuidFor(namespace, name)`, `vinFor(namespace, name)`.
- `/home/agentadmin/sources/keyloop-challenge/tests/support/seed.ts` — `seedDealership(client, namespace)` per §3.3, returning every id plus the anchor instant; raw SQL over `pg`; no `ON CONFLICT`; no import from `src/`.
- `/home/agentadmin/sources/keyloop-challenge/tests/integration/exclusion-constraints.test.ts` — case 0 (catalogue coverage, **full `pg_get_constraintdef` equality** per T-4), then AC-1 … AC-9, each seeding its own namespace in its own body, each negative case carrying a positive-control sibling per T-5, `beforeAll` connecting and nothing else.

Then: run CI, confirm the failure is recorded in a `check.run`, and confirm each case fails on the missing schema rather than on a missing import.

---

```json
{
  "role": "test-engineer",
  "outcome": "objected",
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": 0},
  "quality_scenarios_covered": [],
  "red_commit": null,
  "ci_failure_confirmed": false,
  "objections": [
    {
      "ref": "T-4",
      "severity": "major",
      "disputes": "docs/slices/00-design.md §4.1",
      "claim": "Case 0 does not assert the column the exclusion constraints are keyed on, so a constraint keyed on dealership_id passes the whole of §4.4 and AC-1; detection rests only on AC-2 reporting one of two simultaneously violable constraints, which §11.2 A-2 says is not guaranteed. Measured on postgres:16.",
      "remedy": "Assert full normalised pg_get_constraintdef text by equality for all seven constraints; exact strings supplied. Also closes wrong-target composite FK mutants, which contype='f' cannot see."
    },
    {
      "ref": "T-5",
      "severity": "major",
      "disputes": "docs/slices/00-design.md §4.2 rule 1, §4.6, §4.7",
      "claim": "The one-violable-constraint discipline is enforced non-uniformly by undocumented FK trigger order. Measured: an AC-5 fixture drifted into a second violation still reports appointment_technician_qualified and passes silently, while the equivalent AC-6 drift fails loudly.",
      "remedy": "Add a positive-control sibling to each negative case (AC-5..AC-8): one column different, asserted ACCEPTED. Measured to turn the silent AC-5 drift into a red naming appointment_technician_in_dealership. Extends the control-pair pattern the design already uses for AC-3 and AC-4."
    },
    {
      "ref": "T-6",
      "severity": "minor",
      "disputes": "docs/slices/00-design.md §4.4 step 5",
      "claim": "Step 5 is redundant with step 4: one symmetric range expression over both rows means no EXCLUDE-expressible mutant accepts one adjacency and rejects the other. Measured for the '[]' mutant; both steps reject it. The stated reason conflates the range type's two bounds with the test's two rows.",
      "remedy": "Keep step 5 as a cheap symmetry check; replace the false causal sentence with an accurate one, per §0 rule 2."
    }
  ],
  "measurements": {
    "docker_info": "OK — Docker Engine 29.8.0 in the test-engineer's shell; podman absent. Settles §11.2 A-4 for this role.",
    "postgres": "16.15, arc42 §8.1 schema applied verbatim in a throwaway container, removed afterwards",
    "mutants_run": ["closed-range '[]'", "keyed on dealership_id", "keyed on technician_id", "AC-5 fixture drift", "AC-6 fixture drift", "AC-5 positive-control sibling"]
  },
  "dcr": null,
  "message": "Objected on three points; agreed on everything else including derived ids, the beforeAll-may-only-connect rule, the partial isolation of service_type/customer/vehicle, and deferring the singleTransaction divergence. The architect named §4's AC-3 and the one-violable-constraint discipline as its two most likely errors: both are real, and both are now measured rather than argued — a dealership_id-keyed exclusion constraint survives the entire AC-3 case, and a drifted AC-5 fixture passes silently while the equivalent AC-6 drift fails loudly."
}
```
