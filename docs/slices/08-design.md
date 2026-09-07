# Slice 08 — design

Slice file: [`08-availability-query.md`](08-availability-query.md). Two records:
[**ADR-0032**](../adr/0032-availability-is-two-reads-composed-in-the-use-case.md) (`accepted`) and
[**ADR-0033**](../adr/0033-the-advisory-read-orders-candidates-it-never-removes-them.md) (`proposed`).

Availability is *advisory by contract*, so nothing refuses a wrong answer. A-07-3's countermeasure —
cross the boundary and read the value in the representation the system actually uses — is applied here
to documents rather than to values, and it found arc42 disagreeing with itself twice.

## 1. The three questions

### 1.1 What makes an advisory answer wrong, and what catches it

**Agreement, defined over a universe.** QS-8 as §10.2 states it quantifies over *"every (bay,
technician) pair"* and is **false** at that width: a technician not qualified for the service type, or
a bay at another dealership, is refused by a composite foreign key with SQLSTATE `23503`, and a
degenerate window by `appointment_interval_ordered` with `23514` — neither is `23P01`. The universe is
the **candidate set** for the queried pair: `candidateResources(dealership, serviceType)`'s bays ×
technicians. Over that universe and only there, *omitted ⇔ `23P01`*. §10.2 is corrected.

**And it decomposes.** The response is two lists; QS-8 quantifies over pairs. Cross-product is sound
because `no_bay_overlap` and `no_technician_overlap` are independent and nothing couples the pair —
b free ∧ t free ⇒ (b,t) insertable. Sound, not obvious; the property probes pairs, not lists.

**Window identity.** The probe inserts **exactly `[from, to)`**, the range the query handed to `&&`.
So the answer means *free over the whole queried window*, and a client querying a day to book an hour
inside it is outside QS-8's guarantee — a second honesty obligation the slice file omits. §6.5, §8.6
and the OpenAPI description must state both: **not a reservation, and only about the interval asked
for**.

**Wrong versus stale.** *Stale* = true of some state at or after the query's snapshot; *wrong* = true
of none. Under quiescence they collapse, so QS-8 is *is it ever wrong* with staleness removed — **but
only if quiescence is witnessed rather than declared.** No isolation level will do it: an exclusion
check deliberately does not honour the transaction's snapshot, or two `REPEATABLE READ` writers would
both succeed. Read and constraint run on two clocks no `BEGIN` aligns, so the test must **observe** it.

**Six mechanics, each closing one way the property passes while wrong.** Mechanic 6 was added
at step 5, adjudicating `R-08-1` (§7).

| # | Mechanic | The failure it makes impossible |
|---|---|---|
| 1 | Each probe is a `SAVEPOINT` rolled back | A `23P01` aborts the transaction; committing probes make pair *k+1*'s verdict depend on pair *k*'s probe, against a schedule the query never saw |
| 2 | The verdict is the **SQLSTATE**, `23P01` exactly | A property that accepts *any* error as agreement is green against a fixture where every probe fails for the wrong reason. `23503`, `23514`, `40P01` fail the run **distinctly** |
| 3 | Quiescence is witnessed: re-run the query after the probes, assert byte-identical answer and unchanged `count(*)`/`max(updated_at)` on `appointment` | Without it a failure has two explanations and the test cannot discriminate; with it, exactly one. This is the observation the question asks for |
| 4 | Both directions counted separately, and the shrunk counterexample names which | A merely *conservative* query — reporting too little — passes the accepted-when-free direction entirely. Conservatism is what a naive implementation produces |
| 5 | The generator is **biased to the boundary**: appointments ending exactly at `from` and starting exactly at `to` | `[)` versus `[]` is the likeliest divergence between the two SQL expressions, and uniform random generation hits it with probability ≈ 0. AC-2 pins the example; the generator must reach it by design |
| 6 | The generator varies **`status`**: roughly one item in five is written `cancelled` | A query and a constraint agreeing on the range and disagreeing on the predicate that scopes it. Delete `status <> 'cancelled'` and a cancelled row is reported busy while its probe is **accepted** — direction A. Extensionally it cannot separate the denylist from an allowlist (`A-08-3`) |

Mechanics 1–6 are the answer to *what would catch it*. Mechanic 3 is the answer to *stale versus
wrong*.

### 1.2 The pre-filter: not this slice

**"After QS-8" means a later slice**; in scope stays *the availability query and its route*. Ruled
under mid-slice authority, provisional until the gate. The reasoning is ADR-0033's and is not repeated
here: a pre-filter that *removes* candidates can empty the list, and `orderCandidates` routes empty to
`500`/`422`, never `409` — so it would either refuse a full dealership wrongly or mint a `409` from a
read, which ADR-0016 forbids. **Ordering cannot empty a list**, so ADR-0033 rules the shape rather than
the schedule. ADR-0019's criterion is met in both directions — cheaper after F-06-1's extraction, and
measured by slice 09's AC-13 — and §7 adds a third argument at step 5. What ships here is the decision,
in a refusable record, so the deferral is not ADR-0019's option C.

### 1.3 What §2.1 says: nothing about the read, and that is the finding

§2.1's subject is the `INSERT`. `GET /availability` performs no act, so there is no check-then-act to
commit and §2.1 is **silent about the endpoint**. Two things it is not silent about:

- **Its consumers.** The operative test is ADR-0016's — *can a refusal be produced without a database
  verdict?* — which is what ADR-0033 rules on. §2.1 reaches the pre-filter even though it does not
  reach the query.
- **The word "advisory" being true.** Structurally, not documentarily: there is **no representation of
  a hold** — no `held` status, no `expires_at`, no reserve endpoint — so no code path can turn a free
  answer into a reservation. AC-5's flag is a courtesy on top of that absence, and the absence is what
  review defends.

**The risk is where §2.1 cannot see.** §2.1 makes overlap unrepresentable in the *table*, and nothing
unrepresentable in the *answer*. A wrong answer is refused, logged and counted by nothing —
`booking_conflicts_total` counts `23P01`, and an under-reporting query produces none. QS-8 is the only
thing between a divergence and production. §11 R-5 books the *duplication*, not the *undetectability*;
they are different risks, and §5 hands a cheap partial signal to slice 09.

## 2. Building blocks, interfaces, data model

**Data-model delta: none.** No migration, no column, no constraint. The GiST partial indexes the
exclusion constraints already create serve this query's range predicate (§8.2).

```ts
// src/persistence/appointmentRepository.ts — the ONLY module that names the table (ADR-0032)
export function busyResources(
  db: Db, dealershipId: string, from: Date, to: Date,
): Promise<{ readonly bays: readonly string[]; readonly technicians: readonly string[] }>;

// src/application/queryAvailability.ts
export type AvailabilityOutcome =
  | { kind: 'available'; bays: readonly string[]; technicians: readonly string[] }
  | { kind: 'malformed-window' }                    // to <= from, or an unrenderable instant
  | { kind: 'unknown-reference'; reference: 'dealership' | 'service-type' };
```

`queryAvailability` calls `candidateResources` and `busyResources` and subtracts. One range expression,
in `busyResources`, one file from the migration that declares the constraint:

```sql
tstzrange(starts_at, ends_at) && tstzrange($from, $to)  AND status <> 'cancelled'
  AND dealership_id = $1
```

**`candidateRepository.ts` still cannot see `appointment`**, so QS-12's `appointment-table-access`
marker keeps its one-file list and `tests/architecture/ambiguity-containment.test.ts`'s existing plant
of `candidateRepository.ts` stays a violation. Route: `GET /availability` in
`src/http/routes/`, TypeBox query schema, one more exhaustive `switch`.

**Slice 05's AC-1 re-derivation is discharged structurally, not by fixture width.** The attribution
rests on `candidateResources` reading no `appointment`, asserted by set equality on the marker at
**every** width — better than the 1×1 fixture the slice file proposed.

## 3. Acceptance criteria — rulings

Mid-slice authority; provisional until the gate; `slice:check` lists them.

- **AC-1 amended** — the universe is the candidate set, the probe interval is exactly `[from, to)`, and
  the five mechanics of §1.1 are required. A run whose quiescence witness fails is **invalid**, not a
  QS-8 failure.
- **AC-5 amended** — the response and the OpenAPI description carry **both** facts: not a reservation,
  and true only of the interval queried.
- **AC-6 amended** — `to <= from` is `400`, not `to < from`. `from == to` is an empty `tstzrange`,
  which overlaps nothing, so the query would report everything free — vacuously true, and a probe of
  that window is refused by `23514` rather than `23P01`, putting it outside QS-8's universe. The DB
  guards `ends_at > starts_at`; the route must guard the same way round.
- **AC-7 minted here and withdrawn at step 2** (`T-08-2`): the marker's file list already holds in CI
  on every commit, and a criterion satisfied before the slice opens cannot fail it — §2.4's own
  argument, and the ground `R-08-2` applies to AC-5 in §7.

## 4. arc42 edits proposed, and what pays

Every section is at 0–15 words of headroom, so each addition names its deletion.

| § | Addition | Paid by |
|---|---|---|
| §5.2 | `busyResources` on the `appointmentRepository.ts` row; `queryAvailability.ts` in the as-built application list | the `src/persistence` as-built row's *"neither can see `appointment`"* clause, whose home is now ADR-0032 and the marker |
| §6.5 | the two-read composition (ADR-0032); the window-identity sentence | §6.5's GiST-index paragraph, a verbatim restatement of §8.2's mechanism 6 — replaced by a pointer |
| §8.6 | *"and only about the interval queried"* on the availability row | the same row's restatement of §6.5's staleness prose, collapsed to a clause |
| §10.2 | QS-8's universe, the probe-interval identity, and the quiescence witness | the *"deliberately not here"* paragraph's availability sentence, compressed — §6.5 now owns the reason |
| §11.2 | R-5 gains *no runtime signal*; R-4's *"two remedies, neither chosen"* becomes ADR-0033's third | the replaced clause, roughly word-neutral |
| §11 R-12 | generalised from *blind to `main.ts`* to *blind to any guard outside `tests/unit/`*, with `busyResources` as its third instance (`R-08-3`); R-5 gains QS-8's true reach | R-12's two discharged `main.ts` instances, compressed to their shas — §11 is 589 words over and may not grow |

Front matter for the orchestrator to apply: `arc42: ["§5.2", "§6.5", "§8.6", "§10.2", "§11.2"]`,
`adr: [8, 32, 33]`, `quality_scenarios: [QS-8, QS-12]`.

## 5. A-06-4 — what the gate is owed, and one new fact

I cannot rule it; ADR-0019 is mine. What this slice adds to the gate's evidence:

- **My ruling adds a seventh inherited item to slice 09** (ADR-0033's implementation, riding with
  F-06-1) — individually correct on the criterion, which is exactly A-06-4's point: the criterion is
  per-item and has no aggregate.
- **Slice 09's preamble claims its three parts are independent — telemetry, contract, budget. They are
  not.** ADR-0033's bias must land after F-06-1's extraction (telemetry half) and is measured by AC-13
  (budget half). A split along the stated seam separates a change from the only thing that proves it.
  That is new information and it argues against the cleanest-looking cut rather than for it.
- **A signal slice 09 can have for one label.** With free-first ordering, a `23P01` on **attempt 1**
  against a pair the read called free *is* a measured disagreement. That label on
  `booking_conflicts_total` gives §1.3's missing runtime signal, on a counter slice 09 already builds.
  Recommended, not ruled.

## 6. Findings, assumptions, open questions

- **F-08-1** — **§6.5 has specified `candidateRepository.freeResources` since phase 2, and an
  architecture control plants exactly that as a violation.** arc42 contradicted itself for six slices;
  `docs:refs` checks that links resolve, not that sections agree. ADR-0032 corrects it.
- **F-08-2** — **QS-8 is false as written in §10.2**, over the universe its own words give (§1.1).
- **F-08-3** — **AC-6 guards the window the opposite way round from the database** (§3).
- **A-08-1** — the pair-decomposition claim (§1.1) holds only while no constraint couples bay and
  technician. If one arrives, QS-8 stops decomposing.
- **A-08-2** — *"quiescent"* in QS-8 is a claim about the test process, not a setting. Mechanic 3 makes
  it a measurement. Assumed: Testcontainers gives the run an otherwise-idle database.
- **OQ-08-1** — the response returns two id lists. Whether the booking screen needs names or capacities
  is a client question §3.3 did not settle; ids match `candidateResources`' shape and A-7 keeps
  reference data out of the API. Ruled ids, provisional at the gate.

## 7. Step 5 — rulings

The reviewer returned changes-requested with no DCR. These are findings on the diff, ruled under
mid-slice authority, **provisional until the gate**; `slice:check` lists them. No loopback: none of
the four is (c), and for none of them can I name an acceptance criterion, a `QS-*` or a `CLAUDE.md`
§2 clause that fails — which is the test, not my preference for a short slice.

**R-08-1 — upheld, §6 (b), and ADR-0019 puts its home here rather than later.** The measurement and
the reading of it are both right: *"no shared code path"* is true and is not coverage, and `status` is
a dimension `scheduleItemArbitrary` never varies — every row takes the `confirmed` default at
`probeInsertCommitted`. Not (c): AC-1's five mechanics are all present, QS-8 as amended is **true**,
and §2.1's subject is the `INSERT`, untouched. The work is correct under ADR-0032; the property's
*reach* is narrower than the design claimed. But (b) obliges a named home and **ADR-0019 finds none** —
no live slice adds a status or reopens the generator — so the deferral would be an omission and it is
built here, as §4.4's DDL-drop control was at slice 02.

**Mechanic 6 is added to §1.1's table and AC-1 is amended to require it.** The exact change, stated
and unmade: `ScheduleItemSpec` gains a `status`, `scheduleItemArbitrary` draws it `confirmed` :
`cancelled` at weight 4 : 1, and `probeInsertCommitted` writes the column instead of taking its
default. Nothing else — the probe is the oracle, so no expectation is recomputed.

**What it still cannot reach — `A-08-3`.** `status <> 'cancelled'` and `status = 'confirmed'` are
*extensionally equal* over a two-value enum, so no fixture separates them today. The `no_show`
scenario is real and **not** assertable until a third status exists: `0003_appointment.sql`'s denylist
argument stays prose, guarded by a docblock and nothing that runs. Adding an unused enum value to make
a test possible is a data-model change no requirement asks for. Booked, not built.

**F-08-4 — the docblock is wrong a second way the review did not reach.** ADR-0032 is careful (*"the
range expression QS-8 pins"*); the docblock claims QS-8 proves the whole three-predicate restatement.
It does not, even after mechanic 6: each run seeds a **fresh** dealership and a foreign bay is never
in `candidateResources`' output, so deleting `dealership_id = $1` changes no answer QS-8 can observe.
It is redundant-by-composite-FK, kept to scope the index. The docblock should say **range and
status**, and that the third is redundant. Implementer-owned; stated, unmade.

**R-08-3 — upheld, and it changes how the gate reads the number.** `vitest.mutation.config.ts`
includes `tests/unit/**` only, so the score is a floor on unit-test rigour and **never** evidence for
behaviour guarded outside-in. `busyResources` scores well on a string equality against its own
compiled SQL — a change-detector, and the first thing whoever writes R-08-1's divergence updates to
match. §11 **R-12** carries this shape for `main.ts`; it is generalised there and gains
`busyResources` as its third instance (§4). Re-scoping Stryker stays rejected on
`stryker.config.mjs`'s own measurement. **The remedy is the reviewer's method**, recorded as a recipe
rather than left an artifact of one review: mutate `dist/` in a throwaway worktree, run the
outside-in suite. It produced R-08-1.

**R-08-2 — upheld, remedy accepted as proposed.** AC-5's second half cannot fail: no `docs:openapi`
script, no emitted document — the ground AC-7 was withdrawn on at step 2, applied to a criterion I
kept. **AC-5 splits.** AC-5a, the response, is met here. AC-5b, the OpenAPI description, goes to
**slice 09** (`id: "09"`, `status: ready`), beside AC-9. Not slice 10: a tombstone, and A-06-2 forbids
a `deferred_to` naming one. ADR-0019 is met in its strongest form — the subject **does not exist
yet** — and AC-7's drift test will assert the description rather than eyeball it.

**R-08-4 — upheld as recorded, no action.** `a705026` shipped 151 lines of route, unit tests at
`193db2d`; one commit of four. §7's *green* held, §7's *together* did not. A discipline observation
for the log and the gate, not a design matter.

**I-04-5 — re-deferred to slice 09, destination live, and step 5 gave the deferral a new argument.**
§1.2 argued ADR-0019 in both directions (cheaper: after F-06-1, one site; stronger: AC-13 measures
it). R-08-1 adds a third: **ADR-0033's deductive chain runs through QS-8** — *under quiescence a pair
reported free is accepted* — and until mechanic 6 lands, QS-8 says nothing about a **cancelled**
appointment, which is precisely the row that must not bias free-first ordering away from a bay that
is genuinely free. Shipping the bias before the remedy would rest the chain on a premise weaker than
ADR-0033's own text. ADR-0033 stays `proposed`; slice 09 accepts or supersedes it on measurement.

**Two items routed to slice 09 in one slice — A-06-4's own currency.** ADR-0033 was the seventh
inherited item; AC-5b is the eighth. Each is individually correct on ADR-0019's criterion, which is
A-06-4's point. Counted here rather than left for the human to reconstruct.

**R-08-5 (the mutation report) — §10 is NOT satisfied on `routes/availability.ts`, and I reject the
classification that would satisfy it.** I-06-5's precedent removes from the denominator **only what is
unkillable by construction** — 9 of 36 at slice 06, leaving *"four or five missing assertions, not
untested logic"* as a stated gap. Removing all 24 removes the survivors, which inverts it. Only the
O-48 twins qualify: 25 killed over 47 is **53.19**.

**Three classes, and the report merges them.** *(A) Unkillable* — 2. *(B) Observable and asserted
outside-in* — the 3 `DISCLAIMER` literals, killed by AC-5's acceptance test, invisible to Stryker;
R-08-3's sharpest instance. *(C) Unobservable until a document exists* — the 7 schema `description`
literals, R-05-9's class, observable at slice 09's AC-7. **(D) Observable today, asserted by nothing —
12**, and not what the report says: 127/135 are RFC 9457 **`title`** strings, 128/137 `detail`, 127's
object the `{detail}` itself, 55/57 the `pattern` options, 100 the `response` map, 59/79/60/80
`additionalProperties`. `tests/unit/http/availability.test.ts` asserts `type`, `status` and `reference`
and **never `title` or `detail`**; `error-taxonomy.test.ts` maps type→status only; the acceptance file
has no `422` at all. Nothing here asserts them — and `routes/appointments.ts:370, 383, 391, 407` has
carried the identical hole since slice 02. *"Unchanged in character"* is true; the character was never
inert.

**So neither offered remedy.** Unit assertions on the full problem document duplicate nothing — the
assertions exist nowhere — and widening `include` kills **none** of class D while moving every past
score. Ruled (b), home **here**: no later slice makes a route unit test cheaper or stronger, and slice
09's OpenAPI work does not reach a `title`. Implementer-owned, stated and unmade: assert the whole
problem body on both error arms, plus one unknown query parameter and one malformed uuid. **Adjusting
B out is a new class beyond I-06-5 and is conditional** — each mutant cited to a test file and line by
R-08-3's `dist/` method. A claim of coverage that is not measured is this project's most-counted
defect.

**Question 2, on this slice's own evidence.** A per-file threshold states the *unit* suite's rigour on
that file and nothing more. The number most likely to be misread is not 48.94 — it is
**`appointmentRepository.ts` at 100.00, zero survivors**, on the file that gained `busyResources`,
whose unit test is a string equality against its own compiled SQL. R-08-1 found the semantic hole in
the same slice: **a perfect per-file score sat directly on top of the one real defect.**
