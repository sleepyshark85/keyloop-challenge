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
here because `no_bay_overlap` and `no_technician_overlap` are two independent objects and no constraint
couples the pair — b free ∧ t free ⇒ (b,t) insertable, and (b,t) rejected ⇒ b busy ∨ t busy. It is
sound, not obvious, and the property asserts it by probing pairs rather than lists.

**Window identity.** The probe inserts **exactly `[from, to)`** — the same range the query handed to
`&&`, not a duration-derived interval. So the answer means *free over the whole queried window*, and a
client that queries a day and books an hour inside it is outside QS-8's guarantee. That is a second
honesty obligation, and the slice file names only the first: §6.5, §8.6 and the OpenAPI description
must state both — **not a reservation, and only about the interval asked for**.

**Wrong versus stale.** *Stale* = true of some database state at or after the query's snapshot.
*Wrong* = true of no state. Under quiescence they collapse, so QS-8 is the *is it ever wrong* question
with staleness removed by construction — **but only if quiescence is witnessed rather than declared.**
No isolation level will do it: an exclusion check deliberately does not honour the transaction's
snapshot (it must see rows committed after it, or two `REPEATABLE READ` writers would both succeed).
The read and the constraint therefore run on two clocks that no `BEGIN` can align. Quiescence is a
property of the fixture, and the test must **observe** it.

**Five mechanics, each closing one way the property passes while wrong.**

| # | Mechanic | The failure it makes impossible |
|---|---|---|
| 1 | Each probe is a `SAVEPOINT` rolled back | A `23P01` aborts the transaction; committing probes make pair *k+1*'s verdict depend on pair *k*'s probe, against a schedule the query never saw |
| 2 | The verdict is the **SQLSTATE**, `23P01` exactly | A property that accepts *any* error as agreement is green against a fixture where every probe fails for the wrong reason. `23503`, `23514`, `40P01` fail the run **distinctly** |
| 3 | Quiescence is witnessed: re-run the query after the probes, assert byte-identical answer and unchanged `count(*)`/`max(updated_at)` on `appointment` | Without it a failure has two explanations and the test cannot discriminate; with it, exactly one. This is the observation the question asks for |
| 4 | Both directions counted separately, and the shrunk counterexample names which | A merely *conservative* query — reporting too little — passes the accepted-when-free direction entirely. Conservatism is what a naive implementation produces |
| 5 | The generator is **biased to the boundary**: appointments ending exactly at `from` and starting exactly at `to` | `[)` versus `[]` is the likeliest divergence between the two SQL expressions, and uniform random generation hits it with probability ≈ 0. AC-2 pins the example; the generator must reach it by design |

Mechanics 1–5 are the answer to *what would catch it*. Mechanic 3 is the answer to *stale versus
wrong*.

### 1.2 The pre-filter: not this slice

**"After QS-8" means a later slice, and the slice file's Out of scope is right as written.** In scope
stays *the availability query and its route*. Ruled under mid-slice authority, provisional until the
gate.

Reasoning, and it changed the thing being deferred. A pre-filter that **removes** candidates can empty
the list; `orderCandidates` returns `null` for empty, and §6.2 routes `null` to `500`/`422`, never
`409` — so a removing pre-filter must either answer `500` for a full dealership or mint a `409` from a
read, which ADR-0016 forbids and `CLAUDE.md` §2.1 describes. ADR-0033 therefore rules the shape:
**the advisory read biases ADR-0009's shuffle and never changes membership.** Ordering cannot empty a
list, so no refusal exit moves.

Why not here, on ADR-0019's criterion — and it is met in both directions. **Cheaper** in slice 09:
F-06-1 extracts the loop that `bookAppointment` and `rescheduleAppointment` each carry today, so the
bias lands at one site instead of two and then needs merging. **Stronger** in slice 09: AC-13 measures
it; here it would ship unmeasured. Slice 08 also has no booking-path AC at all, and shipping the bias
would flip `tests/acceptance/candidate-retry.test.ts`'s seventeen-bay refusal — standing evidence,
deliberately — inside a slice whose ACs never mention it.

What ships here instead is the decision, in a refusable record, so the deferral is not ADR-0019's
option C.

### 1.3 What §2.1 says: nothing about the read, and that is the finding

§2.1's subject is the `INSERT`. `GET /availability` performs no act, so there is no check-then-act to
commit and §2.1 is **silent about the endpoint**. Two things it is not silent about:

- **Its consumers.** The operative test is ADR-0016's — *can a refusal be produced without a database
  verdict?* — which is what ADR-0033 rules on. §2.1 reaches the pre-filter even though it does not
  reach the query.
- **The word "advisory" being true.** What makes it true is structural, not documentary: the system has
  **no representation of a hold** — no `held` status in the enum, no `expires_at`, no reserve endpoint —
  so a free answer cannot be turned into a reservation by any code path. AC-5's flag is a courtesy on
  top of a mechanism. The mechanism is the absence, and the thing to defend at review is that the
  absence stays.

**The risk is where §2.1 cannot see.** §2.1 makes overlap unrepresentable in the *table*; it makes
nothing unrepresentable in the *answer*. A wrong availability answer is refused by nothing, logged by
nothing and counted by nothing — `booking_conflicts_total` counts `23P01`, and a query that
under-reports produces no `23P01` at all. QS-8 is the only thing between a divergence and production,
and it runs in CI on generated data. §11 R-5 books the *duplication*; it does not book the
*undetectability*, and they are different risks. A cheap partial signal exists and is handed to slice
09 in §5.

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

**Slice 05's AC-1 re-derivation is discharged structurally, not by fixture width.** The slice file
proposed keeping a 1×1 fixture *"where a pre-filter cannot change an order of one"*. ADR-0032 does
better: the attribution rests on `candidateResources` reading no `appointment`, that is asserted by set
equality on the marker at **every** fixture width, and this slice's assertion is that the marker's file
list is unchanged. AC-7 below states it so it is asserted rather than true by accident.

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
- **AC-7 new** — `appointment-table-access` resolves to exactly `src/persistence/appointmentRepository.ts`
  after this slice, unchanged. Slice 05's AC-1 attribution, re-derived (§2).

## 4. arc42 edits proposed, and what pays

Every section is at 0–15 words of headroom, so each addition names its deletion.

| § | Addition | Paid by |
|---|---|---|
| §5.2 | `busyResources` on the `appointmentRepository.ts` row; `queryAvailability.ts` in the as-built application list | the `src/persistence` as-built row's *"neither can see `appointment`"* clause, whose home is now ADR-0032 and the marker |
| §6.5 | the two-read composition (ADR-0032); the window-identity sentence | §6.5's GiST-index paragraph, a verbatim restatement of §8.2's mechanism 6 — replaced by a pointer |
| §8.6 | *"and only about the interval queried"* on the availability row | the same row's restatement of §6.5's staleness prose, collapsed to a clause |
| §10.2 | QS-8's universe, the probe-interval identity, and the quiescence witness | the *"deliberately not here"* paragraph's availability sentence, compressed — §6.5 now owns the reason |
| §11.2 | R-5 gains *no runtime signal*; R-4's *"two remedies, neither chosen"* becomes ADR-0033's third | the replaced clause, roughly word-neutral |

Front matter for the orchestrator to apply: `arc42: ["§5.2", "§6.5", "§8.6", "§10.2", "§11.2"]`,
`adr: [8, 32, 33]`, `quality_scenarios: [QS-8, QS-12]`.

## 5. A-06-4 — what the gate is owed, and one new fact

I cannot rule it; ADR-0019 is mine. What this slice adds to the gate's evidence:

- **My ruling adds a seventh inherited item to slice 09** (ADR-0033's implementation, riding with
  F-06-1). It is individually correct on the criterion, in both directions, which is exactly A-06-4's
  point: the criterion is per-item and has no aggregate, and I have just demonstrated it again.
- **Slice 09's preamble claims its three parts are independent — telemetry, contract, budget. They are
  not.** ADR-0033's bias must land after F-06-1's extraction (telemetry half) and is measured by AC-13
  (budget half). A split along the stated seam separates a change from the only thing that proves it.
  That is new information and it argues against the cleanest-looking cut rather than for it.
- **A signal slice 09 can have for one label.** With free-first ordering, a `23P01` on **attempt 1**
  against a pair the read reported free *is* a measured availability/constraint disagreement. Adding
  that label to `booking_conflicts_total` gives the runtime signal §1.3 says does not exist, on a
  counter slice 09 is already building. Recommended, not ruled.

## 6. Findings, assumptions, open questions

- **F-08-1** — **§6.5 has specified `candidateRepository.freeResources` since phase 2, and an existing
  architecture control plants exactly that as a violation.** arc42 contradicted itself for six slices.
  `docs:refs` checks that links resolve, not that sections agree; nothing could have caught it but
  reading §6 against §10. ADR-0032 corrects it.
- **F-08-2** — **QS-8 is false as written in §10.2**, over the universe its own words give (§1.1).
- **F-08-3** — **AC-6 guards the window the opposite way round from the database** (§3).
- **A-08-1** — the pair-decomposition claim (§1.1) holds only while no constraint couples bay and
  technician. Nothing plans one; if one arrives, QS-8 stops decomposing and the property must probe
  pairs it currently derives.
- **A-08-2** — *"quiescent"* in QS-8 is a claim about the test process, not a setting. Mechanic 3 makes
  it a measurement. Assumed: Testcontainers gives the run an otherwise-idle database.
- **OQ-08-1** — the response returns two id lists. Whether the booking screen needs names or capacities
  is a client question §3.3 did not settle; ids match `candidateResources`' shape and A-7 keeps
  reference data out of the API. Ruled ids, provisional at the gate.
