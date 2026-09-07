# Slice 08 — design, as built

Slice file: [`08-availability-query.md`](08-availability-query.md). Merged with
[**ADR-0032**](../adr/0032-availability-is-two-reads-composed-in-the-use-case.md) (`accepted`) and
[**ADR-0033**](../adr/0033-the-advisory-read-orders-candidates-it-never-removes-them.md)
(`proposed`). arc42 §5.2, §6.5, §8.6, §10.2 and §11 now describe the system; this file records what
was decided, measured and ruled.

## What the slice turned out to be

Availability is *advisory by contract*, so nothing refuses a wrong answer, and the slice went looking
for what would catch one. It found arc42 disagreeing with itself twice.

**F-08-1 — §6.5 had specified `candidateRepository.freeResources` since phase 2, and no such function
ever existed.** An architecture control had been planting exactly that call as a violation for six
slices: the control was right and arc42 wrong. ADR-0032 records the correction, and §6.5 now
describes what shipped — `candidateResources` minus `appointmentRepository.busyResources`,
subtracted in `src/application/queryAvailability.ts`. `docs:refs` checks that links resolve, not that
sections agree.

**F-08-2 — QS-8 was false as §10.2 wrote it.** It quantified over *"every (bay, technician) pair"*,
and at that width an unqualified technician is refused `23503` and a degenerate window `23514` —
neither is `23P01`. The universe is the **candidate set**, and over that universe only,
*omitted ⇔ `23P01`*. §10.2 is corrected.

**F-08-3 — AC-6 guarded the window the opposite way round from the database.** `from == to` is an
empty `tstzrange` overlapping nothing, so the query would report everything free while a probe of
that window is refused `23514`. `to <= from` is `400`; built at step 1.

## Decisions

**Data-model delta: none.** No migration, no column, no constraint; the partial GiST indexes the
exclusion constraints already create serve the range predicate (§8.2 mechanism 6).

**`candidateRepository.ts` still cannot see `appointment`**, so QS-12's `appointment-table-access`
marker keeps its one-file list and slice 05's AC-1 re-derivation is discharged by that set equality
at every width rather than by a 1×1 fixture.

**The pre-filter is not this slice.** ADR-0033 carries the reasoning: a read that *removes*
candidates can empty the list, which `orderCandidates` routes to `500`/`422` and never `409` — so it
would either refuse a full dealership wrongly or mint a `409` from a read, which ADR-0016 forbids.
Ordering cannot empty a list. What ships is the decision, in a refusable record.

**§2.1 is silent about the endpoint, and that is the finding.** Its subject is the `INSERT`; a `GET`
performs no act. What keeps *advisory* true is structural rather than documentary — there is **no
representation of a hold**, so no code path can turn a free answer into a reservation. The risk is
where §2.1 cannot see: a wrong answer is refused, logged and counted by nothing. §11 R-5 now books
that as *no runtime signal*.

## Interfaces, as built

```ts
export function busyResources(
  db: Db, dealershipId: string, from: Date, to: Date,
): Promise<{ readonly bays: readonly string[]; readonly technicians: readonly string[] }>;

export type AvailabilityOutcome =
  | { kind: 'available'; bays: readonly string[]; technicians: readonly string[] }
  | { kind: 'malformed-window' }
  | { kind: 'unknown-reference'; reference: 'dealership' | 'service-type' };
```

## What makes QS-8 a gate rather than a probability

Six mechanics, each closing one way the property passes while wrong. Mechanic 6 was added at step 5
and rebuilt at round 2.

| # | Mechanic | The failure it makes impossible |
|---|---|---|
| 1 | Each probe is a `SAVEPOINT` rolled back | A `23P01` aborts the transaction, so pair *k+1*'s verdict would depend on pair *k*'s |
| 2 | The verdict is the **SQLSTATE**, `23P01` exactly | A property accepting *any* error is green against a fixture where every probe fails for the wrong reason |
| 3 | Quiescence is **witnessed** — the query re-run after the probes, byte-identical | Without it a failure has two explanations and the test cannot discriminate |
| 4 | Both directions counted separately, the counterexample naming which | A merely *conservative* query passes the accepted-when-free direction entirely |
| 5 | The generator is biased to the boundary | `[)` versus `[]` is the likeliest divergence, and uniform generation hits it with probability ≈ 0 |
| 6 | Every run carries a **cancelled witness**, by construction | A query and a constraint agreeing on the range and disagreeing on the predicate scoping it |

No isolation level substitutes for mechanic 3: an exclusion check deliberately does not honour the
transaction's snapshot, or two `REPEATABLE READ` writers would both succeed.

## Acceptance criteria — rulings

Mid-slice authority, provisional until the gate; `slice:check` lists them. **AC-1 amended** — the
universe is the candidate set, the probe interval is exactly `[from, to)`, the mechanics are
required, and a run whose quiescence witness fails is *invalid*, not a QS-8 failure. **AC-5 split** —
AC-5a (the response) is met here; **AC-5b** goes to slice 09 beside AC-9, since no OpenAPI document
is emitted yet. **AC-6 amended** to `to <= from` (F-08-3). **AC-7 minted at step 1 and withdrawn at
step 2**: a criterion satisfied before the slice opens cannot fail it.

## arc42, and what paid for it

| Section | What changed | Paid by |
|---|---|---|
| §5.2 | `busyResources` on the `appointmentRepository.ts` row; `queryAvailability.ts` in the application list; the table claim widened past the booking path | the *"neither can see `appointment`"* clause, now ADR-0032's and the marker's |
| §6.5 | F-08-1 corrected in place, the two-read composition, and the window-identity sentence | the GiST paragraph restating §8.2, two ADR-0018 and ADR-0030 measurements §11 already holds |
| §8.6 | *"only about the interval queried"* on the availability row | the same row's restatement of §6.5's staleness prose |
| §10.2 | QS-8's universe, the witnessed quiescence, the cancelled witness with its 20/20, and the `…db.test.ts` evidence path | QS-8's §4.2 recap, the freshness paragraph, and the test-ownership sentence CLAUDE.md §5 owns |
| §11 | `D-08-1`, `D-08-2`, `D-08-3`; R-4 gains ADR-0033 as a third remedy; R-5 gains *no runtime signal*; R-12 generalises from `main.ts` to any guard outside `tests/unit/` | a compression pass across §11.1 and §11.2, and D-01-1/D-01-3 merged into one row |

## Rulings

**Step 5.** The reviewer returned changes-requested with no DCR. No loopback: for none of the
findings can an acceptance criterion, a `QS-*` or a §2 clause be named. `R-08-1` **upheld, §6 (b),
built here** — `status` was a dimension the generator never varied; ADR-0019 found no later home, so
mechanic 6 joined AC-1. `R-08-3` **upheld** — `vitest.mutation.config.ts` includes `tests/unit/**`
only, so the score is a floor on unit rigour and never evidence for anything guarded outside-in;
re-scoping stays rejected on cost, and the remedy is the `dist/` recipe, now recorded in §11 R-12.
`R-08-2` upheld, AC-5 split. `R-08-4` upheld as recorded, no action: `a705026` shipped 151 lines of
route with unit tests at `193db2d` — §7's *green* held, §7's *together* did not. `R-08-5` **upheld
and its offered remedy rejected**: I-06-5's precedent removes from the denominator only what is
unkillable by construction, and the report merged four classes. `I-04-5` re-deferred to slice 09.

**Step 5, round 2.** Both remedies came back measured short, and neither role adjusted its own work
to look finished. `T-08-7` **upheld whole, (a), and the fault was my specification** — 8 of 35 trials
survived at `NUM_RUNS = 30`, and `fc.sample` exonerated the weight, so mechanic 6 became a
**construction**: bar 20 consecutive kills, met. `I-08-6` **upheld, (d), the classification narrowed
6 → 5** — `to`'s RFC 3339 pattern looked structural and was killed by one more case, and the five
directives are per-construct, never `all`. `A-08-3` **(b) with a deviation**: §6 (b) wants a backlog
slice, none can host it and no work exists until a requirement adds a third status, so §11 D-08-3 is
the home. `F-08-1`, `F-08-2`, `F-08-4`, `T-08-4`, `T-08-5`, `I-08-4` all **(a)**. `O-59` is the
human's, not mine. `gate: light` is revoked by its own terms — two MAJORs were open at step 5.

**Step 5, round 3 — `O-62`, and the arithmetic error was mine.** `routes/availability.ts` is **30 of
42 = 71.43 %**, under §10's 0.75, not the 76.19 § 8 claimed: `disable next-line` counts from the end
of the comment block, so the directive at `161` reaches `164`'s `throw` and not the `default:` arm at
`159` containing it. **A third directive is refused on my own record** — I-06-5 met these exact two
mutants and deliberately did not widen the suppression; a rule stated where it costs nothing and
lapsed where it costs something is not a rule, and suppressing to clear a *failing* number makes the
suppression load-bearing on the verdict. It would also land on 75.00 exactly, and
`routes/appointments.ts` carries eight of the identical construct today. **Ruled (d): the file does
not meet §10, it merges with the shortfall stated, and the gate is shown the number rather than a
number.** `slice:check` reads the aggregate (93.32, break 74) and passes. Loopbacks stay at **0**.

## Open questions and assumptions

- **A-08-1** — the pair-decomposition claim holds only while no constraint couples bay and
  technician. If one arrives, QS-8 stops decomposing.
- **A-08-2** — *quiescent* is a claim about the test process, not a setting; mechanic 3 makes it a
  measurement. Assumed: Testcontainers gives the run an otherwise-idle database.
- **OQ-08-1** — ids rather than names or capacities: §3.3 did not settle it, ids match
  `candidateResources`' shape, and A-7 keeps reference data out of the API. Provisional at the gate.
- **A-06-4, for the gate.** Two items were routed to slice 09 in this slice — ADR-0033 and AC-5b,
  each individually correct on ADR-0019's criterion, which is A-06-4's own currency. And one label
  gives slice 09 a signal §1.3 says is missing: with free-first ordering, a `23P01` on **attempt 1**
  against a pair the read called free *is* a measured disagreement.
