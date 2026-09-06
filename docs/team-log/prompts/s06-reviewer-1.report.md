# Report · slice 06 · reviewer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 06 step 5 review
- Returned: 2026-09-06T15:49:54.192Z
- Duration: 861s

---

## Review — slice 06, `slice/06-reschedule-atomic-move`, PR #15

**Verdict: changes-requested.** One BLOCKING finding, three MAJOR, two MINOR. No DCR — nothing I found is a design defect; the design is implemented as written, and where it is not, the gap is the implementer's or the tooling's.

Attribution for anything posted to the PR: `**reviewer** · `.claude/agents/reviewer.md@995af67``. Reviewed at `e0b9b8b` (the branch moved under me during the review — `e0b9b8b feat(06): the inherited-scope guard becomes bidirectional — O-41` landed after I started; it touches `tools/` and `docs/` only, no `src/`, no owned test directory).

---

# 1. The 36 survivors, classified

`reports/mutation/mutation.json`, Stryker 10.0.0, 120 mutants on `src/application/rescheduleAppointment.ts`, 84 killed, 36 survived, 70.00. **Stryker's suite is `vitest.mutation.config.ts`, which includes `tests/unit/**` and nothing else** — so "survived" means *the unit suite cannot kill it*, and the db suite is out of scope by construction. I have marked separately where an outside-in test does cover the behaviour.

The controlling comparison is `src/application/bookAppointment.ts`: the same loop, the same classification arms, the same log shapes, **96.80 with exactly 4 survivors** — and those 4 are the same four shapes as reschedule's inert group. Where booking kills a shape and reschedule does not, the difference is the test, not the code.

| # | Mutants | Location | Class | Verdict |
|---|---|---|---|---|
| **A** | 14 | `L111,116,117,119` (dealership) and `L123,125,126,128` (service type) — the two `=== null` guards, their blocks, log payloads, messages and returns | **REAL GAP — arm never driven** | No unit test makes `findDealership`/`findServiceType` return `null`. `bookAppointment.test.ts:691,700` drives both mirror arms and kills them. Nothing outside-in covers these either: they are unreachable in a consistent database, which is why nothing tripped over them. Entangled with **I-06-4** (open, the architect's): if the arms should not exist, the mutants go with them. |
| **B** | 9 | `L96,97` (the `booking.deadlock` / `booking.reference-data-invalid` event names), `L140,141`, `L146–151`, `L252–259`, `L268` | **REAL GAP — assertion missing on a covered line** | Every one of these arms *is* driven by a unit test (`:232`, `:240`, `:318`, `:324`), but the tests assert only the returned outcome, never the log record. `bookAppointment.test.ts:668` ("logs it at error, with the pair that deadlocked") and `:619` ("names the event in BOTH pino renderings") kill the identical shapes. `CONFLICT_EVENT`/`REFUSED_EVENT` *are* killed here, by the one test at `:281` that does assert a full record — which is the proof the shape is killable and the omission is an omission. |
| **C** | 1 | `L167` `const move: Move = { id, startsAt, endsAt }` → `{}` | **REAL GAP at unit level; covered outside-in** | Nothing in the use case's own tests asserts that the interval the domain derived is the interval the statement writes — the happy-path test reads the response off the *scripted* row, so `move = {}` changes nothing observable. AC-1's integration test catches it end-to-end. `appointmentRepository.test.ts:384` pins the parameters of the statement in isolation; the wiring between derivation and statement is what is unasserted. |
| **D** | 2 | `L224` `if (initialOrder === null)` → `false`, and its `'exhausted'` literal | **REAL GAP — arm never driven** | No test has attempt 1 conflicting with an empty candidate list. Cheap to kill; low likelihood in production (it needs a dealership with zero bays or zero technicians, which booking treats as `reference-data-invalid` at `bookAppointment.test.ts:726`). |
| **E** | 1 | `L232` `outcome.resource === 'bay' ? bayId : technicianId` → `true` | **REAL GAP — and the one with a wrong-output scenario.** See finding R-06-A below. | |
| **F** | 9 | `L156` ×2 (`case 'derived': break;`), `L187` (`<=` → `<`), `L284`, `L285` ×4 (the post-loop `throw`) | **INERT BY SHAPE — structurally unkillable** | `case 'derived'` has `break` as its only statement and is the last case of a `default`-less switch: deleting the body or the label both fall out of the switch, which is what `break` does. `<=` → `<` drops an iteration the loop provably never reaches. `L284/285` are inside the unreachable `throw` (with `coverageAnalysis: 'off'`, dead code reports as *Survived*, never *NoCoverage* — that is why 6 mutants of an unreachable statement are counted at all). **`bookAppointment.ts` carries all four of these shapes as its only 4 survivors at 96.80**, which is the independent evidence that they are shape and not debt; reschedule has 5 extra only because its throw message appends `(seed …)`. |

**Totals: 9 inert, 27 real.** Excluding the 9 structurally unkillable: **84 / 111 = 75.68**, which clears 0.75.

The shape of the 27 is worth stating plainly for the gate, because "the worst-scoring file in the repository" reads worse than it is: **every decision this file makes is killed.** ADR-0025's ordering, ADR-0027's attempt-1-then-shuffle, the zero-row mapping, the cap-versus-exhaustion tie-break, the classification of `23P01`/`40P01`/`23503`/unclassifiable, the conflict and refusal log lines — all killed. What survives is (i) two defensive arms that are unreachable in a consistent database, (ii) the *payloads* of four error-level log lines whose *outcomes* are all asserted, and (iii) three one-test gaps. Group E is the only one that hides a wrong answer.

---

# 2. Findings

### R-06-A — BLOCKING. The four Stryker `restore all` directives are inert; 93 mutants across three whole route handlers are silently unmeasured, not 9

```
src/http/routes/appointments.ts:232, :269, :322, :426
claim:     `// Stryker restore all` never takes effect. The first `disable all` at line 225 runs
           to end of file, so every mutant from line 231 to 468 is Ignored — including the entire
           PATCH handler this slice adds. The slice file authorises the pairs on the `never` arms
           only; the measurement excludes 57% of the file.
scenario:  Mutate line 380, `'/problems/appointment-not-confirmed'` → `""`, or line 379's `409` →
           `410`. Stryker reports Ignored, not Survived and not Killed. AC-4's taxonomy row — the
           row this slice exists to add — cannot be scored at all, and neither can `not-found`,
           `malformed-instant`, `no-capacity`, `no-verdict` or `outsideOpeningHours`.
```

Measured, not inferred. Of 163 mutants in the file, **93 are Ignored and every one of them is at line ≥ 231; zero mutants at or after line 231 are scored.** Lines 238–261 sit between the first `restore` and the second `disable` and are Ignored, which is what proves the restore is inert rather than the disables merely being adjacent.

Mechanism, from `node_modules/@stryker-mutator/instrumenter/dist/src/transformers/directive-bookkeeper.js:56`:

```js
processStrykerDirectives({ loc, leadingComments }) { leadingComments?.map(...) }
```

**Directives are read from `leadingComments` only.** A comment placed as the last line inside a block, after the `throw`, is a *trailing* comment of the throw and an *inner* comment of the block — it is never the leading comment of any node, so it is never processed. The disable comments work (they lead `const unhandled: never`); the restores do not.

Consequences the gate needs:

- The slice file's constraint — *"**those arms only**, not the schema-options or description mutants"* — is not met. To answer the question as asked: **no disable pair covers a schema-options or `description` literal** (those live at lines 82–140, above the first disable, and all 15 remaining survivors are that class). The over-reach runs the other way, and is much larger.
- **`routes/appointments.ts` 78.57 is 55/70, not 136/163.** It is not comparable to slice 05's 83.93 over the whole file.
- **The step-2 prediction of ≈91.3 was very likely not falsified.** I-06-5 records *"THAT PREDICTION WAS WRONG"*; that conclusion is not supported by this run. All 93 excluded mutants sit in code that `tests/unit/http/appointments.test.ts` exercises thoroughly — the new PATCH switch has an `it.each` covering all seven outcome arms at `:509–538`. With ~12 mutants ignored instead of 93 the denominator is ~151 and the 15 known-inert survivors put the file at ~90, within a point of the prediction. The number that was measured is an artifact of the comment placement, and the retro should not record a failed prediction on it.
- The changed-file aggregate 86.14 (379/440) is likewise computed over a scope the design did not authorise.

I did not re-measure. Taking the number requires editing the directives in `src/`, which is authoring; that run is the implementer's after it moves the comments, and it should be re-recorded before the gate rules on §10.

### R-06-B — MAJOR. The technician side of per-value pruning is untested, and the outside-in control that could catch it is seed-dependent

```
src/application/rescheduleAppointment.ts:232
claim:     Nothing in the unit suite distinguishes `outcome.resource === 'bay' ? bayId :
           technicianId` from the constant `bayId`. Both loop tests (`:248`, `:281`) name `bay`
           as the scarce resource; there is no technician-scarce mirror. booking has both
           (`bookAppointment.test.ts:236,254,384,401`).
scenario:  Replace the ternary with `bayId`. On a `no_technician_overlap`, `prune(order,
           'technician', bayId)` filters the technician list for a value that is not in it — the
           list never shrinks, `nextCandidate` returns the same contended technician on every
           attempt, and a move that should re-allocate to a free technician is refused `409
           /problems/no-capacity` with `exit: 'capped'` after 16 attempts. That is QS-3's
           "refuse while capacity exists", on the path design §1 says the loop exists to prevent.
```

`tests/integration/reschedule-self-overlap.test.ts:252` (the AC-1 technician control) asserts `200` and `technicianId !== tech1`, so it *can* kill this — but only when ADR-0009's shuffle happens to redraw the contended `tech1` first out of two. Which way that falls is a property of `BOOKING_SEED`, not of the assertion. The control is therefore a coin flip on this mutant, and it is outside Stryker's scope regardless. A unit test with a technician-scarce fixture is the direct control; it is the one shape booking has and reschedule does not.

### R-06-C — MAJOR. `src/application/rescheduleAppointment.ts` is below §10's threshold on the per-file reading, and 27 of the 36 survivors are killable

Detail in §1 above. Groups A, B, D and E are all reachable from the existing `scriptedDb` harness; C needs one parameter assertion. I am not prescribing the tests — that is the implementer's — but the count is: roughly six cases close all 27, and each one already exists in `bookAppointment.test.ts` in mirror form.

### R-06-D — MINOR. `ResourceLock`'s brand forecloses "forgot the lock" but not "forged the lock"

```
src/persistence/appointmentRepository.ts:78
claim:     ADR-0026 states lockResources is "the ONLY minting site" and that "there is exactly one
           value in scope naming the pair". That is a convention, not a compiler fact: `__brand`
           is a public string-literal property, so a caller can satisfy `ResourceLock` by writing
           the literal, with no cast and no error.
scenario:  `rescheduleAppointmentById(db, move, { bayId, technicianId, __brand: 'ResourceLock' })`
           compiles clean. F-02-9's deadlock is reintroduced by a write path that never called
           lockResources, with no compile error, no dependency-cruiser violation and no test.
```

Measured, with a scratch `tsc --strict` over the real `src/`: omitting the parameter on either write is `TS2554: Expected 3 arguments, but got 2`; passing a bare `{ bayId, technicianId }` is `TS2345: Property '__brand' is missing`; **writing the brand by hand compiles with no error.** So ADR-0026's stated purpose — *"forgot the lock" becomes a compile error* — **holds and is verified**; only the stronger sentence about the sole minting site overstates it. Forgetting is not forging, and this is a §11 residue line rather than a code change. `src/domain/candidates.ts` uses the same shape, so it is a house-wide property, not a slice-06 regression.

### R-06-E — MINOR. Two error-level event names have no assertion anywhere

```
src/application/rescheduleAppointment.ts:96-97
claim:     `DEADLOCK_EVENT` and `REFERENCE_DATA_EVENT` mutate to `""` and survive; no test in any
           suite reads either name on the reschedule path.
scenario:  Rename `'booking.deadlock'` to `'booking.deadlocked'` in this file only. Every test in
           the repository stays green, and slice 09's observability work — which keys on event
           names — silently loses every deadlock on the reschedule path while keeping booking's.
```

Subsumed by group B; called out separately because its blast radius is a later slice rather than this one.

---

# 3. §10's reading — my answer to I-06-5

**I read the clause as *each changed file*, and on that reading slice 06 fails it on `src/application/rescheduleAppointment.ts` at 0.70.** Three reasons, then the cost of the reading, which the architect should weigh before ruling.

1. **The aggregate reading reproduces, one scope up, the exact defect the clause was added to remove.** `tools/slice/check.mjs:456` records why "on changed files" exists: a repo-wide score is diluted by unchanged code, so a slice can add badly-tested code and pass on other people's tests. An aggregate *over* changed files preserves that dilution inside the slice. Here `appointmentRepository.ts` (80/80) and `bookAppointment.ts` (121/125) are doing the carrying: they contribute 205 of the 440 mutants at 98%, and they lift 84/120 to 379/440. Under the aggregate reading `rescheduleAppointment.ts` would have to fall below roughly 0.16 to drag the slice under threshold. A gate that tolerates a new file at 0.20 is not measuring what the clause names.

2. **"On changed files" is a condition on files.** The plain reading of a threshold applied *on* a set of files is per member, the same way "all tests green" is per test and not per suite average. The aggregate is a summary statistic someone would have to have chosen; the per-file reading is what the words say.

3. **Precedent is thin and untested.** Slice 05 recorded 0.9122 as an aggregate *and* published the per-file breakdown, and no changed file was below threshold — the two readings had never diverged. A precedent that has never been exercised against the case it decides is not a precedent, and the orchestrator was right not to treat it as one.

**The cost of my reading, stated because it is real.** A strict per-file rule makes §10 hostage to small denominators and instrumenter artifacts. `src/http/problem.ts` sits at exactly 0.75 over **12** mutants; F-06-2 already established that its taxonomy array is invisible to Stryker because `as const` is classed as a type node, so a single further survivor fails the file for a reason that has nothing to do with the tests. That is a genuine hazard of (b), and it argues for the threshold being a *trigger for classification* rather than an automatic fail — but which of those §10 means is the architect's or the human's to rule, not mine.

**What my classification contributes to that ruling:** the number the per-file reading fails on is 0.70; the number after removing the 9 mutants that are unkillable by construction is **0.7568**, which clears 0.75. So the file is not failing because its logic is untested — it is failing by three or four mutants' worth of missing log-payload and defensive-arm assertions, all of which booking already has. Whichever reading governs, the actionable answer is the same and it is small.

One caveat the gate should carry: **the 86.14 aggregate is itself computed over an unauthorised measurement scope** (R-06-A). The per-file number for `rescheduleAppointment.ts` is unaffected — that file has no disables — so the §10 question is decidable on today's data. The aggregate is not the aggregate the design authorised, and should be re-taken.

---

# 4. I-06-3 — the lost-and-rebuilt HTTP layer

**The merged code is complete and coherent. Nothing is missing. I would sign this.**

The check was done properly rather than by inspection: the implementer's **pre-loss** edit records were replayed from its transcript onto base commit `3589a77` — 16 Edit operations in their original order, three `sed -i` line patches, and the Stryker comment script — and the result diffed against the merged blobs at `d046670` and at branch HEAD. All six files come back **byte-for-byte identical**: `src/http/routes/appointments.ts`, `src/http/problem.ts`, `src/http/server.ts`, `src/main.ts`, `tests/unit/http/appointments.test.ts`, `tests/unit/http/health.test.ts`. No commit after `d046670` touches any of those paths.

I then spot-checked the items a reconstruction actually loses, directly against the merged tree:

- **The three `buildServer` call sites that are not `serverAnswering`.** These were patched by raw `sed -i` on hard-coded line numbers, so they appear in no Edit record and exist only to satisfy `tsc`. Present at `tests/unit/http/appointments.test.ts:312, 678, 704`. This was the single highest-risk item and it survived.
- **The two deletions.** `type OutsideOpeningHoursVerdict` is gone from `routes/appointments.ts` (0 occurrences), and `problem.ts`'s old *"deliberately absent"* docblock sentence is gone. A reconstruction that only re-applies additions loses removals; neither was lost.
- **The four Stryker pairs** — 4 disables, 4 restores, at 225/232, 262/269, 315/322, 419/426, one per `const unhandled: never`. Correct in placement relative to the arms; the defect in R-06-A is Stryker's comment attachment, not the reconstruction.
- **The comment-only edits** — `server.ts`'s D-05-1 docblock narrowing and the deleted totality sentence, `main.ts`'s ADR-0009/I-04-8 comment. All present verbatim. These have no compiler or test pressure and are the first thing a rebuild drops.
- **`health.test.ts`'s one-line stub.** Present.

And the tree is green on my own run, not on report: `npm run build` clean, `npm run test:nodb` **549 tests in 26 files, all passing**, `npm run lint:arch` clean — *"no layering violations. 97 module(s) cruised, every root covered"*. The 549 matches the implementer's attested count exactly.

The implementer was right to ask for this and right that it could not discharge it itself. It is discharged.

---

# 5. AC-2 — I read the generated SQL

Not the test's assertion about the SQL — the SQL. I drove `rescheduleAppointmentById` from `dist/` (rebuilt from HEAD first) through a Kysely instance with a capturing driver, and counted the statements the function issues:

```
statements issued: 1
update "appointment" set "bay_id" = $1, "technician_id" = $2, "starts_at" = $3, "ends_at" = $4,
  "updated_at" = now() where "id" = $5 and "status" = $6
  returning "id", "dealership_id", "customer_id", "vehicle_id", "service_type_id",
            "technician_id", "bay_id", "starts_at", "ends_at", "status"
params: ["BAY","TECH", startsAt, endsAt, "<id>", "confirmed"]
zero rows → null
```

**One statement. One `UPDATE`.** No `DELETE`, no `INSERT`, no second `UPDATE`, no CTE, no sub-select, no `SELECT` of any kind inside the function, no `ON CONFLICT`, no pre-read deciding legality. Both guards are in the one `WHERE`. `bay_id` and `technician_id` come off the lock, not off `move`. `updated_at = now()` is the database's clock with no `CASE`. Zero rows returns `null` and issues nothing further.

The pre-read that *does* exist — `findAppointmentById` — is in the use case, not the statement, and is AC-5's subject under ADR-0025 rather than AC-2's. It is one row by primary key and answers nothing about any other appointment's interval, so §2.1 does not arise: it authorises a refusal, and the write re-adjudicates its `confirmed` answer atomically in its own `WHERE`.

AC-2 is satisfied, and satisfied for the right reason.

---

# 6. Zero rows at every attempt — the implementer's "look hardest at this"

**It holds, and it holds for a reason that survives the retry loop.** `src/application/rescheduleAppointment.ts:196` maps `row === null` to `not-confirmed` with no attempt-number condition, and that is correct at every attempt number:

- The `WHERE` clause does not vary with the attempt. Only the `SET`'s bay and technician change; `id = $1 AND status = 'confirmed'` is byte-identical on attempt 1 and attempt 16 (confirmed on the captured SQL above, which is the only statement the function can emit).
- Zero rows decomposes into exactly two disjuncts: the id does not exist, or the row exists with `status <> 'confirmed'`. The first is excluded permanently — ADR-0025 decision 1 plus A-06-2 give "ids are never client-supplied", and I checked the stronger half that the ADR leans on without stating: **there is no `DELETE` anywhere in `src/`** (`deleteFrom` / `delete from`: zero hits), and the only write to `status` in the codebase is `cancelAppointmentById`'s `status: CANCELLED`. Rows are never removed, so the existence the read established cannot be undone.
- No attempt of ours can change the status. Each attempt is its own `db.transaction()`; a successful attempt returns immediately and a failed one rolls back whole, so attempt *N* never sees attempt *N−1*'s write.
- The only thing that can change between attempts is a concurrent cancel, and that is precisely disjunct two. Under the default READ COMMITTED (no isolation level is set anywhere in `src/`), if a cancel commits while our `UPDATE` waits on the row lock, PostgreSQL re-evaluates the `WHERE` against the new version, finds `cancelled`, and returns zero rows. The answer `not-confirmed` is right, and retrying would mask it — which is what the design says and what the code does.

Uniformity verified. `tests/unit/application/rescheduleAppointment.test.ts:180` asserts it with the "no eighth read" count, which is the right shape for the claim.

---

# 7. Standing duties

| Duty | Result |
|---|---|
| **Commit discipline (§7)** | **PASS.** Exactly one `(red)` commit — `ec37a20`, six files, all test-engineer-owned, no `src/`, no `tests/unit/`. Five implementer commits `22ac211`, `d77e6d3`, `3589a77`, `b7e121e`, `d046670`, contiguous, and no other commit on the branch touches `src/`. All 25 subjects are well-formed Conventional Commits within CLAUDE.md's own sanctioned scope set. `8bcf822` is a second `test(06):` commit but is not a second red — its body says so and its diff moves a window without weakening an assertion. Note for the record: git metadata cannot distinguish the roles (all 25 commits are authored and committed by the same identity with identical trailers); role attribution rests on the message convention, the path partition, `docs/team-log/prompts/`, and the `actor` field in `events.jsonl`, which is self-reported. |
| **Test ownership (§5), both directions, per commit** | **PASS.** No implementer commit touches `tests/acceptance|contract|property|concurrency|architecture|performance`, `tests/integration/` or `tests/support/`. The red commit and the repair commit touch no `src/` and no `tests/unit/`. `tests/unit/` is written by the five implementer commits and nobody else. |
| **The DCR instead of the edit (R-06-1)** | **VERIFIED.** `git log --follow -- tests/integration/reschedule-is-one-statement.test.ts` returns `ec37a20` and `8bcf822` only. No implementer commit appears. The implementer hit an assertion that a correct build could not satisfy (`rowAuditFor` filtered by id with no window, so the fixture's own arrange contributed an `INSERT`), named three candidate repairs, and wrote none of them. The architect ruled (a) and narrowed the remedy — refusing a clock window and refusing an `op` filter, the latter because it would silently make design §2.3's cancel-then-book line pass. `8bcf822` honours both refusals: a high-water mark, expectations unchanged. This is the escalation working exactly as §5 intends, and it should be read that way at the retro. |
| **`npm run lint:arch`** | **PASS.** *"no layering violations. 97 module(s) cruised, every root covered: src, tests"*. The diff adds no cross-layer import: the use case imports domain and persistence, the route imports the use case's types and `OpeningHoursVerdict` from domain, and `src/domain/candidates.ts` is untouched. |
| **ADR-0026 — the brand forecloses "forgot the lock"** | **VERIFIED by compilation**, with one residue: see R-06-D. |
| **ADR-0027 — no special-casing of `nextCandidate`/`orderCandidates`** | **PASS.** `src/domain/candidates.ts` is not in the diff. `orderCandidates` is called with the full unfiltered lists, `nextCandidate` and `prune` are called with their existing signatures, and the incumbent-first behaviour is a state machine in the use case (`order === null` on attempt 1) rather than a change to the domain module. `structuralBound = 1 + bays + technicians` is booking's `bays + technicians` plus one, which is what ADR-0027's "Bound-2's plus one" requires. |
| **ADR-0025 — domain rule before status guard** | **PASS.** `deriveInterval` runs at `:134`, unconditionally, before any status is consulted; the status guard exists only in the statement's `WHERE`. A cancelled appointment moved out of hours answers `400 outside-opening-hours`. Asserted at `tests/unit/application/rescheduleAppointment.test.ts:199` and again outside-in at `tests/acceptance/reschedule-appointment.test.ts:159`. |
| **ADR-0024's two warnings** | **PASS.** `cancel-appointment.test.ts:264` is re-derived in the red commit itself, not patched later — the media-type assertion is demoted to a correctness check and the `type` member becomes the discriminator, with a new adjacent-path control asserting `route-not-found` to prove the cancellation route genuinely exists. `problem.ts` landed at exactly 75.00, confirming I-06-1's corrected claim that the file is immune rather than cushioned: the two new rows added zero mutants. |
| **Stryker disable placement** | **FAIL — R-06-A.** Not on schema-options or `description` literals, but not "those arms only" either. |
| **Real database (§2.2)** | **PASS.** Every persistence-invariant assertion is in `tests/integration/` or `tests/acceptance/` against Testcontainers; the unit suite's `scriptedDb` asserts SQL text and parameters, never a persistence invariant. |

---

# 8. Things nobody asked about

1. **R-06-A is the big one and it was only half asked.** The question was whether the pairs cover schema-options or `description` mutants. They do not — they cover three entire route handlers, `outsideOpeningHours` and `INTERNAL`, because Stryker reads directives from `leadingComments` and a comment placed last inside a block is never one. The measurement the slice's Definition of Done rests on was switched off across 57% of a changed file.
2. **The I-06-5 log entry contains a claim that this review does not support.** *"routes/appointments.ts came in at 78.57 against a predicted ≈91.3, so THAT PREDICTION WAS WRONG even with the disables applied and 93 mutants ignored"* — the *"even with"* is backwards. The 93 ignored mutants are the reason the number is what it is, and the excluded region is thoroughly unit-tested (all seven PATCH arms are covered by an `it.each` at `tests/unit/http/appointments.test.ts:509`). The prediction was not tested. If the retro records a wrong architect prediction on this evidence it will be recording the tooling's mistake against the architect.
3. **The step-4 dispatch asked the implementer for the `routes/appointments.ts` and `problem.ts` mutation scores it measured, and at step 2 it undertook to test the ≈91.3 prediction itself.** It launched Stryker three times, killed the run, and reported without a number; every figure in the record comes from the orchestrator's later run. That is a process observation for the orchestrator, not a code finding, but it is the reason R-06-A reached step 5 undetected — the person who placed the comments never saw what they did.
4. **The reschedule path reads `candidateResources` on every request**, including the overwhelmingly common case where attempt 1 succeeds and no shuffle is ever drawn. The code comments the choice and it is correct (a `23P01` on the incumbent needs somewhere to go), but it is one guaranteed extra round trip per move, and QS-14's budget lands at slice 11. Worth a §11 line rather than a change.
5. **`docs/slices/06-design.md` and `06-reschedule-atomic-move.md` changed on disk during this review** (the slice's `arc42:` list gained §6.6, §10 and §11, annotated *"declared at step 5"*). I reviewed against the state I read; the arc42 scope question is the architect's and the addition looks like design §4's planned edits being declared, not a silent rewrite — but the gate should know the declaration moved during step 5.

---

```json
{
  "role": "reviewer",
  "outcome": "changes-requested",
  "findings": [
    {"severity": "BLOCKING", "file": "src/http/routes/appointments.ts", "line": 232,
     "claim": "The four `// Stryker restore all` directives never take effect — Stryker's DirectiveBookkeeper reads leadingComments only, and a comment placed last inside a block is a trailing/inner comment. The first `disable all` at line 225 runs to end of file: all 93 Ignored mutants are at line >= 231 and zero mutants at or after 231 are scored. The slice file authorises the pairs on the `never` arms only.",
     "scenario": "Mutate line 380 ('/problems/appointment-not-confirmed' -> \"\") or line 379 (409 -> 410): Stryker reports Ignored, not Survived. AC-4's new taxonomy row, and every other arm of the new PATCH handler, is excluded from the measurement the slice's Definition of Done depends on. routes/appointments.ts's 78.57 is 55/70, not 136/163."},
    {"severity": "MAJOR", "file": "src/application/rescheduleAppointment.ts", "line": 232,
     "claim": "Nothing in the unit suite distinguishes `outcome.resource === 'bay' ? bayId : technicianId` from the constant `bayId`; both loop tests name `bay` as the scarce resource and there is no technician-scarce mirror, which bookAppointment.test.ts:254/401 has.",
     "scenario": "With the ternary replaced by `bayId`, a no_technician_overlap prunes the technician list for a value not in it, the list never shrinks, nextCandidate returns the same contended technician every attempt, and a move that should re-allocate is refused 409 no-capacity/capped after 16 attempts while a free technician exists — QS-3's failure mode. The integration technician control can kill it, but only when the seeded shuffle redraws the contended technician first."},
    {"severity": "MAJOR", "file": "src/application/rescheduleAppointment.ts", "line": 111,
     "claim": "The dealership and service-type `=== null` arms (14 of the 36 survivors) are driven by no test in any suite; bookAppointment.test.ts:691/700 drives and kills both mirror arms.",
     "scenario": "Replace `if (dealership === null)` with `if (false)`: every test in the repository stays green, and a reschedule against a row whose dealership no longer resolves throws a TypeError inside deriveInterval instead of answering 500 reference-data-invalid. Remedy is entangled with the open I-06-4."},
    {"severity": "MAJOR", "file": "src/application/rescheduleAppointment.ts", "line": 96,
     "claim": "Nine survivors are error-level log payloads and messages on arms whose outcomes ARE asserted — the deadlock, bad-reference, invalid-duration and reference-data arms — plus the two event-name constants. bookAppointment.test.ts:619/668 kills the identical shapes.",
     "scenario": "Rename 'booking.deadlock' to 'booking.deadlocked' in this file only: all 549 nodb tests and the whole db suite stay green, and slice 09's observability work silently loses every deadlock on the reschedule path while keeping booking's."},
    {"severity": "MINOR", "file": "src/persistence/appointmentRepository.ts", "line": 78,
     "claim": "ADR-0026's `__brand` is a public string-literal property, so `lockResources` is the only minting site by convention, not by the type system. Verified with tsc --strict: omitting the lock is TS2554 and a bare pair is TS2345, but writing the brand by hand compiles clean.",
     "scenario": "`rescheduleAppointmentById(db, move, { bayId, technicianId, __brand: 'ResourceLock' })` type-checks, so a future write path reintroduces F-02-9's deadlock with no compile error, no depcruise violation and no test. ADR-0026's stated purpose still holds; only its 'ONLY minting site' sentence overstates it. A §11 residue line, not a code change."},
    {"severity": "MINOR", "file": "src/application/rescheduleAppointment.ts", "line": 167,
     "claim": "The `move` object literal mutates to `{}` and survives: no unit test asserts that the interval the domain derived is the interval the statement writes.",
     "scenario": "With `move = {}` the statement writes undefined id/starts_at/ends_at; the use case's happy-path test reads its response off the scripted row and passes. AC-1's integration test catches it end-to-end, so this is a unit-level gap covered outside-in."}
  ],
  "mutation": {
    "score": 0.8614,
    "survivors": 76,
    "note": "Aggregate over changed files, 379/440. Per changed file: appointmentRepository 1.00 (80/80), bookAppointment 0.9680 (4 survivors, all inert by shape), server 0.9091, routes/appointments 0.7857 (55/70 — 93 mutants Ignored, see BLOCKING), problem 0.7500 (immune per I-06-1), rescheduleAppointment 0.7000 (36 survivors). Classification of the 36: 9 structurally unkillable (the `case 'derived'` pair, the loop-bound `<=`, and six in the unreachable post-loop throw — bookAppointment carries all four shapes as its only survivors), 27 real gaps in five groups. Excluding the 9 inert: 84/111 = 0.7568."
  },
  "depcruise": "pass",
  "commit_discipline": "pass",
  "test_ownership": "pass",
  "dcr": null,
  "message": "The code is right and the measurement is not. The statement is one guarded UPDATE — I drove it from dist through a capturing driver and counted one — the zero-row mapping is uniform at every attempt for reasons that survive the loop, and the lost-and-rebuilt HTTP layer is byte-for-byte identical to the pre-loss edits replayed onto 3589a77, including the two deletions and the three sed-patched call sites a reconstruction usually drops. What blocks is that Stryker's restore directives are inert, so 93 mutants from line 231 to end of file — the whole new PATCH handler — were never measured, which also means the architect's 91.3 prediction was not falsified so much as never tested. On I-06-5 I read §10 as each changed file, which fails this slice at 0.70; but 9 of the 36 survivors are unkillable by construction and the file clears the threshold at 0.7568 without them, so the gap is four or five missing log-payload assertions, not untested logic."
}
```
