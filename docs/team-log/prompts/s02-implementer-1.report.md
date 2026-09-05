# Report · slice 01 · implementer · invocation 3

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 02 step 2 AGREE
- Returned: 2026-09-05T07:41:40.566Z
- Duration: 595s

---

**implementer** · `.claude/agents/implementer.md@30e0754` · step 2 — **objected** (5 AGREE, 4 OBJECT)

I ran eight measurements before writing any of this. Docker container torn down; scratch trees under the session scratchpad.

---

## The three you asked me to judge hardest

### I-02-1 · The `ContendedResource` brand — **AGREE.** Load-bearing, and stronger than the design claims

**Claim:** ordinary implementation shapes do *not* drive me to the cast. I am the one who has to live in this type and I built the two shapes I would actually write.

Measured (`typescript` 6.0.3, the repo's `tsconfig.json` compiler options, `--strict` + `noUncheckedIndexedAccess`):

| Tree | Result |
|---|---|
| Shape A — prune, then refuse *inside* the conflict branch with `outcome.resource` | **exit 0** |
| Shape B — remember `last` conflict, refuse after the loop with an explicit `last === null` arm | **exit 0** |
| Planted C — `if (free.length === 0) return { kind:'no-capacity', resource:'bay', … }` | **exit 2, TS2322** |
| Planted F — a *second classifier in `src/application`* returning `'bay'` as `ContendedResource \| null` | **exit 2, TS2322** |

Planted F is the one the design did not measure and it is the more valuable half: the brand also forecloses **a second SQLSTATE-translation site outside `src/persistence`** — the exact evasion `sql-only-in-persistence` exists for but cannot see, because a hand-rolled classifier imports no `pg`. Worth adding to §4.1's table.

The reason no cast is needed is structural, not luck: under prune-by-resource, *the list that empties is always the resource of the most recent `classify()`*, so the branded value is already in hand at the refusal. Shape A needs no null-guard at all. I will write Shape A.

Two residues I want on the record because I will hit them, not the architect:

- **Unit tests can mint one without a cast** by calling `classify({ code:'23P01', constraint:'no_bay_overlap' })`. Good — the brand costs me nothing in `tests/unit/`. And §4.2's `contended-resource-cast` marker is safe: the corpus in `tests/architecture/ambiguity-containment.test.ts` is `listSourceCorpus() = src/**/*.ts` only, so my tests are outside the scan. The design should say that; a reader assumes the marker covers `tests/`.
- The `switch` mechanism works: with a member omitted, `noImplicitReturns` gives **TS2366** at the function, not a silent fall-through. Measured.

### I-02-2 · Ten files, four layers, a seven-member union, one switch — **AGREE**, with a sizing caveat that is not rhetorical

I would build this. Specifically I would *not* collapse `readAppointment.ts` (`http-must-not-reach-persistence` forbids the shortcut) and I would *not* merge `candidateRepository` into `referenceRepository` — §2.2's "this query does not read the `appointment` table" is only checkable as a sentence about a named file.

The caveat is arithmetic. My estimate of `src/` for this slice is ~750 lines, plus unit tests at 1.5–2×: **~1,800–2,200 lines of green work, 12–15 commits** at §7's ~150-line guidance. That is roughly slices 00, 00a and 01 combined. §7 holds, but only if the sequencing in §3 is treated as binding rather than advisory, so I am committing to it as a plan:

1. AC-13–16 (`interval.ts`, `openingHours.ts` step 1) — 2 commits
2. AC-17–19 (`openingHours.ts` step 4) — 2 commits
3. `schema.ts` + `pgError.ts` — 2 commits
4. three repositories — 3 commits
5. `deriveInterval.ts` — 1–2 commits
6. `bookAppointment.ts` + `readAppointment.ts` — 2–3 commits
7. `problem.ts` + routes + `server.ts` + `main.ts` — 2–3 commits

Steps 1–2 are the ratified ADRs, touch `src/domain` only, and can land first regardless of what happens to E-02-1 and E-02-2. That matters: **if E-02-2 blocks step 3, I am not blocked** — I can be green on 7 of 19 criteria before the QS-12 marker is ruled on.

**One red commit is enough. AGREE**, and for the architect's reason. I checked the one thing that would break it: at the red commit `dist/domain/*.js` exists and exports the right names, so AC-13–19 fail as verdict assertions, and `tests/support/service.ts` turns a missing route into a `404` assertion rather than a throw. Nothing fails at import. No DCR from me here.

### I-02-3 · `deriveInterval.ts` pure — **AGREE the module. OBJECT to the evidence claim.** Severity: medium

§2.5 says the composition order *"gets a mutation score instead"* of the compiler it lost at D-01-1. **It does not, and this is measurable rather than arguable.**

`@stryker-mutator/instrumenter@10`'s mutator directory holds 19 mutators: arithmetic-operator, array-declaration, arrow-function, assignment-operator, block-statement, boolean-literal, conditional-expression, empty-expression, equality-operator, logical-operator, method-expression, object-literal, optional-chaining, regex, string-literal, unary-operator, update-operator. **None of them reorders, moves or swaps statements.** The mutant that models "someone called `withinOpeningHours` before `appointmentInterval`" cannot be generated, so it cannot survive and cannot be killed. The order is not mutation-covered; the *presence of each guard* is (block-statement and conditional-expression mutants on each `null` branch).

This is the same narrowing ADR-0016 did to itself and that §5.2 did to partial application at 00a, and it should be done here for the same reason: a claim the tooling does not support teaches the next reader that the mechanism was decorative.

**I agree the finding does not damage the remedy.** A pure module is still worth its file, and the order *is* recoverable — by **precedence unit tests**, which is exactly what `tests/unit/domain/openingHours.test.ts` already does for step 4's ordering ("a mutant that reorders these checks is only killable if the order is asserted, and it is"). Inputs that fail two checks at once, asserting which verdict wins: an unrenderable `startsAtMillis` *and* a zero-minute service type must return `unparsable-instant`, not `invalid-duration`; a valid interval outside hours at a dealership with a garbage `time_zone` must return `reference-data-invalid`, not `outside-opening-hours`. I own `tests/unit/` and I am committing to writing those, one per adjacent pair.

**Exact change I would want:** §2.5's sentence narrowed to *"a pure module is unit-testable without Docker, and its guards get a mutation score; the composition **order** is recovered by precedence tests, which Stryker cannot generate a mutant for."* That is a smaller true claim.

---

## The two escalations

### I-02-4 · E-02-1 — **AGREE.** I cannot implement AC-4 without a retry, and I measured the walk

I reproduced measurements 1 and 2 independently on `postgres:16-alpine` with this repository's constraint definitions:

| Case | Reported |
|---|---|
| same bay + same technician (doubly violating) | `no_bay_overlap` |
| different bay + same technician | `no_technician_overlap` |
| same bay + different technician | `no_bay_overlap` |
| doubly violating, **constraints created in the reverse order** | `no_technician_overlap_b` |

Index OIDs confirm it: `no_bay_overlap` 17043 < `no_technician_overlap` 17045 in the bay-first table, and the reverse in the other. The architect is right, and one index ordering cannot serve both criteria.

**Then I measured the thing the design argues but did not run** — the actual AC-4 walk, on one pooled `pg` connection:

```
attempt 1  (winner's bay, sole technician)   ->  23P01 no_bay_overlap
attempt 2  SAME CONNECTION (new bay, same technician)  ->  23P01 no_technician_overlap
attempt 3  SAME CONNECTION (new bay, new technician)   ->  OK
```

So: prune the bay, retry, get `no_technician_overlap`, prune the technician, list empties, refuse **`technician`** — deterministically, in two attempts, with no shuffle and no cap. **AC-4 is satisfiable with the minimal loop and is not satisfiable without it.** AC-3 *is* satisfiable without it (one bay, first attempt doubly violates, `no_bay_overlap` by index order) — but only accidentally, on a fact §11's F-02-1 correctly says is not a contract.

**And the same probe confirms the trap, so it is measured rather than warned about:**

```
BEGIN; attempt 1 -> 23P01 no_bay_overlap
       attempt 2 -> 25P02
```

`db.transaction()` anywhere on this path breaks attempt 2 exactly as ADR-0004 and QS-3 say. §2.4's "no transaction" is now a measurement, not a convention.

**A third option the architect did not name, which I raise and then reject** — because §6 asks for it and rejecting it strengthens the recommendation. On `23P01`, instead of retrying, run *one* read asking which of {this bay, this technician} is occupied over the derived interval, and label `resource` from that. It is ADR-0017-shaped (classification strictly after the write is refused, by a type that cannot permit anything), so it is admissible under §2.1. **Reject it:** the read can race and give an unstable label, which is precisely the determinism AC-4 needs; it puts a second overlap-semantics expression in SQL outside the constraint; it forces `appointment`-table access into a second module against §4.2's marker; and it costs a round trip to produce a *worse* answer than the loop, which also books the appointment.

**If the human rules the loop stays out.** I would not take the architect's deletion path and then keep AC-4. The deletion is correct and small — delete the `while`, delete `pruneCandidates`, refuse on the first `23P01` — but AC-4 then has no implementation, and the three rewordings available are all bad in different ways:

- drop AC-4's constraint clause → it becomes AC-3 with different fixture prose, and QS-2 asserts nothing QS-1 does not;
- reverse the index creation order in `0003_appointment.sql` → a pure swap, AC-3 breaks instead, and it is a migration change in a slice with no data-model delta;
- **defer AC-4 and QS-2 to slice 04**, where ADR-0009's ordering and QS-3 make the answer principled.

I would recommend the third. It costs the slice its billing as the flagship concurrency slice, which is a real price and the human's to pay — but a QS that asserts nothing distinguishing is worse than a QS that arrives one slice late. **Human authority. Flagged, not resolved.**

### I-02-5 · E-02-3 — **AGREE the union of literals. OBJECT to it being the mechanism.** Severity: medium

I re-measured on the pinned Fastify 5.12.1, and the picture is better *and* worse than §0/E-02-3 records.

**Better.** With a conforming `setErrorHandler`, an off-list `type` on a 409 does **not** produce a raw failure — it is routed through the error handler and comes back as a well-formed `500 /problems/internal`, `application/problem+json; charset=utf-8`. Loud, inside the taxonomy, and a client is misinformed rather than broken. Also measured, and useful to me: extra properties on a response are **stripped** (not rejected), `resource: undefined` serialises cleanly, and an off-list *optional* `resource` enforces too.

**Worse, and this is the part the design does not carry.** With no conforming error handler — or when the error handler's *own* body fails the same schema — the response is:

```
500  {"statusCode":500,"code":"FST_ERR_FAILED_ERROR_SERIALIZATION",
      "message":"... The value of '#/properties/type' does not match schema definition."}
```

in `application/json`. That is **not a §8.6 row**, it leaks an internal JSON-Schema pointer, and AC-12's "every row reachable, no two collide" is silently false at exactly the moment it matters. Measured on a route declaring `response: { 500: Problem }` whose error handler emitted an off-list `type` — the fallback is second-order and there is no third-order rescue.

So the union is doing real work and I want it kept. But **the design reaches for a runtime 500 where it already has, and prefers, a compile-time mechanism.** Measured, same tsconfig:

```ts
export type ProblemType = (typeof PROBLEM_TYPES)[number];
export function problem(type: ProblemType, …): ProblemBody
```

`problem('/problems/no-capacity', …)` compiles; `problem('/problems/WRONG', …)` is **exit 2, TS2345**. `Type.Union(PROBLEM_TYPES.map((t) => Type.Literal(t)))` typechecks alongside it with no complaint. Both mechanisms, zero extra cost, and it is the identical argument ADR-0016 makes for `ContendedResource` — *you cannot construct the refusal without the evidence.*

**Exact changes I would want** (I judge the finding and the remedy separately; the finding is the architect's and correct):

1. Keep `Type.Union` of literals. It is the only one of the three that enforces, and it is what lets QS-11's contract test fail.
2. Add `ProblemType = (typeof PROBLEM_TYPES)[number]` and make **one total builder** the sole constructor of a problem body, so an off-list URI is TS2345 and the 500 is unreachable from `src/`.
3. State as an implementation constraint that **`setErrorHandler`'s body goes through that same builder**, never assembled ad hoc — otherwise the taxonomy exits through `FST_ERR_FAILED_ERROR_SERIALIZATION` and nothing says so.

### E-02-2 · QS-12's marker — **AGREE**, and I can tighten it

Confirmed unavoidable from my side: Kysely's `Database` interface must spell the physical column, and the column is `time_zone`. No alias, no `sql` template and no naming discipline avoids it — the marker is `/\b(?:timeZone|ianaZone|time_zone)\b/` and `select('dealership.time_zone as zone')` still contains the token.

**But the minimum is two files, not four.** If `DealershipReference`'s field is named `zone` rather than `ianaZone`, `deriveInterval.ts` and `bookAppointment.ts` never carry a matching token, and `zone-transport`'s permitted list is `src/persistence/schema.ts` + `src/persistence/referenceRepository.ts`. That is a materially stronger containment claim than the four-file list, and it costs one identifier. I would take it.

**One trap for whoever writes the marker:** `OpeningHoursVerdict`'s `unknown-zone` variant carries a field literally named `ianaZone`. Any consumer that reads `verdict.ianaZone` — for the `500 /problems/internal` log line §2.7 asks for — matches the marker from `src/http`. I will avoid reading it; the marker's permitted list should not quietly bless it.

---

## Findings of my own

### I-02-6 · **OBJECT — high.** The constraint name has no route to any observer the test-engineer is allowed to use

This is my headline finding and it is the cheapest possible thing to fix now.

§2.1 says `constraint` is carried on `PgOutcome` *"because AC-3 and AC-4 assert on the **name**, and a test that can only see `'bay'` cannot tell `no_bay_overlap` from a mapping that guessed."* arc42 §10 backs it: QS-1 and QS-2 both require *"the constraint reported by PostgreSQL is named …"*.

**But nothing carries the name anywhere a concurrency test can read it.** ADR-0016 Option D explicitly declines to put `constraint` on `BookOutcome`. §2.7's problem schema has `type`, `title`, `status`, `detail`, `resource`, `reference`, `opensAt`, `closesAt` — no `constraint`, and arc42 §8.6's `no-capacity` row says *"Carries `resource`"* and nothing else. `outside-in-tests-do-not-import-src` forbids `tests/concurrency/` from importing `pgError.ts`. So the name is minted in `src/persistence`, dies in `src/application`, and the test-engineer's red commit has to assert on something that does not exist.

Three routes, and only one is honest:

- **the wire** — add `constraint` to the problem body. Reject: leaks a database identifier to clients and reverses ADR-0016 Option D.
- **the test reproduces the conflict with its own SQL insert.** Reject, and this is the dangerous one because it *looks* like it works: the test picks the probe row's bay, so it can make either constraint appear at will, and QS-1/QS-2's sharpest assertion becomes vacuous while staying green.
- **the service's structured log.** `tests/support/service.ts` spawns the built artifact, so `pino`'s stdout is available to an outside-in test with no `src/` import. `bookAppointment` holds `PgOutcome.constraint` at the refusal and can log it without putting it in `BookOutcome` — no ADR conflict at all.

**Exact change I would want:** `BookDeps` gains a logger (`{ newId, logger }`), and §2.6's refusal path logs `{ constraint, resource, attempts }` at `warn`. One field on one interface, one line in one function, and it is what makes QS-1 and QS-2 able to assert the thing arc42 §10 says they assert. **This needs deciding before step 3** — the same class of blocker as E-02-2, and for the same reason: the red commit encodes it either way.

### I-02-7 · **OBJECT — medium.** There is no `201`/`200` response schema and no `AppointmentView`

§2.7 specifies the request body schema and the problem schema in full. It specifies **neither success response**. `AppointmentView` is named in `BookOutcome` and never defined; DA-02-2 fixes the *rendering* of two fields and no others. `ReadOutcome` is not defined at all, and §2.7's status table covers only `BookOutcome`, so the "one exhaustive `switch`" claim does not currently reach the `GET` route.

AC-1 requires the `201` body to name **the allocated bay and technician**, and the contract test asserts on it. The test-engineer and I will guess field names independently — `bayId` vs `bay`, whether `status` is present, whether `createdAt` is exposed — and discover the mismatch at step 5. That is precisely the ambiguity §6 step 2 exists to catch.

**Exact change I would want:** pin `AppointmentView`'s field list and the `Type.Object` for `201`/`200` in §2.7, and name the `ReadOutcome` union (`found` | `not-found`) so both routes are covered by the exhaustiveness claim.

### I-02-8 · **OBJECT — medium.** The empty-candidate-set case should be decided, not annotated

§2.6 calls it "the one place this design tells a white lie" and maps a dealership with no qualified technician to `unknown-reference: service-type`. I am the one who writes that `switch` arm, so I want it decided rather than noted.

Two distinct failures — *this service type id does not exist* (AC-9) and *this dealership cannot perform it* — then produce a byte-identical `422 /problems/unknown-reference` with `reference: 'service-type'`. A service advisor reads that as "you sent a bad id" and re-checks the id, which is fine. QS-11 ("no two rows collide") survives on a literal reading, since it is about rows having distinct status/`type`, not about causes being distinguishable — but AC-12 says the taxonomy is *total*, and this is the one place it is total by conflation.

I accept the constraint that forces it: §2.6 is right that there is no `ContendedResource` to construct here, and fabricating one would be exactly what ADR-0016 forbids. §8.6 is in this slice's declared scope, so a row is addable at no process cost, and the case is trivially reachable for the contract test (a dealership with bays and no qualified technician).

**Exact change I would want:** an eighth `BookOutcome` member and a `422 /problems/service-not-offered` row. **I will implement it as designed if ruled against** — this is a preference about honesty, not a correctness objection, and §6 says preference is not a blocker. I raise it because the alternative is that the lie enters the code under my name with only a design comment behind it.

### I-02-9 · Note, not an objection

`noUncheckedIndexedAccess: true` means `bays[0]` is `string | undefined` throughout the candidate loop. Shape A above already handles it and still compiles at exit 0, so this costs a guard, not a design change. Flagging it so the ~150-line estimates account for it.

---

## What I need before step 3

| Ref | Needs | Blocks |
|---|---|---|
| **E-02-1** | Human ruling: does the minimal retry loop stay in? | AC-3, AC-4, `bookAppointment.ts` shape |
| **E-02-2** | Human/architect ruling on the QS-12 marker split | `schema.ts`, `referenceRepository.ts` — steps 3–7 of my plan |
| **I-02-6** | Architect: where the constraint name is observable | the test-engineer's red for QS-1/QS-2 |
| **I-02-7** | Architect: `AppointmentView`, `201`/`200` schemas, `ReadOutcome` | contract test ↔ my green agreeing |
| **I-02-5** | Architect: the compile-time builder + the `setErrorHandler` constraint | `problem.ts` |
| **I-02-8** | Architect: rule the empty-candidate case, either way | one `switch` arm |
| **I-02-3** | Architect: narrow §2.5's mutation claim | nothing — documentation only |

None of these blocks AC-13–19. I can be green on the two ratified ADRs the moment the red lands, whatever happens to the rest.

```json
{
  "role": "implementer",
  "outcome": "objected",
  "commits": [],
  "files_changed": 0,
  "unit_tests_added": 0,
  "acceptance_passing": false,
  "depcruise": "not-run",
  "objections": [
    "I-02-3 (medium): §2.5's claim that composition order 'gets a mutation score' is unsupported — Stryker 10's 19 mutators include none that reorders statements. Narrow the claim; recover the order with precedence unit tests, which I will write.",
    "I-02-5 (medium): the union of literals is right, but relying on the runtime 500 as the mechanism is not. Measured: with no conforming setErrorHandler, or when its own body fails the same schema, the response is FST_ERR_FAILED_ERROR_SERIALIZATION in application/json — outside the taxonomy. Add the compile-time ProblemType builder (measured TS2345) and require setErrorHandler to use it.",
    "I-02-6 (high): the constraint name is minted in src/persistence and reaches no observer tests/concurrency may use, yet §2.1, AC-3, AC-4 and arc42 §10 all assert on it. Remedy: BookDeps gains a logger; the refusal logs { constraint, resource, attempts }. Blocking on step 3.",
    "I-02-7 (medium): no 201/200 response schema, no AppointmentView field list, no ReadOutcome union — the contract test and my green will diverge on field names.",
    "I-02-8 (medium): the empty-candidate-set case should be ruled, not annotated as a white lie; I would prefer an eighth outcome and a 422 /problems/service-not-offered row, and will implement as designed if ruled against."
  ],
  "dcr": null,
  "message": "Agreed the ContendedResource brand (measured load-bearing, and it also forecloses a second classifier in src/application — TS2322, a shape the design did not measure), the ten-module decomposition, the exhaustive switch, one red commit, and E-02-1's reading — I reproduced the index-order measurements and additionally measured the AC-4 retry walk end to end on one pooled connection, plus the 25P02 trap inside an explicit transaction. Objected on five points, the blocking one being that the constraint name AC-3, AC-4 and arc42 §10 assert on has no route to any observer the test-engineer is permitted to use. Sized the slice at ~1,800-2,200 lines and 12-15 green commits, sequenced so the two ratified ADRs (AC-13-19) can land regardless of how E-02-1 and E-02-2 are ruled."
}
```
