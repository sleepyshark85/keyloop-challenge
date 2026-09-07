# Slice 08 — design, as built

Slice file: [`08-availability-query.md`](08-availability-query.md). Merged with
[**ADR-0032**](../adr/0032-availability-is-two-reads-composed-in-the-use-case.md) (`accepted`) and
[**ADR-0033**](../adr/0033-the-advisory-read-orders-candidates-it-never-removes-them.md)
(`proposed`). arc42 §5.2, §6.5, §8.6, §10.2 and §11 describe the system; this file records what was
decided, measured and ruled.

## What the slice turned out to be

Availability is *advisory by contract*, so nothing refuses a wrong answer. Looking for what would
catch one found arc42 disagreeing with itself twice.

**F-08-1** — §6.5 had specified `candidateRepository.freeResources` since phase 2 and no such function
ever existed, while an architecture control planted exactly that call as a violation: the control was
right and arc42 wrong for six slices. **F-08-2** — QS-8 was false as §10.2 wrote it. §6.5, §10.2 and
ADR-0032 now carry both corrections; `docs:refs` checks that links resolve, not that sections agree.

**F-08-3** — AC-6 guarded the window the opposite way round from the database: `from == to` is an
empty `tstzrange` overlapping nothing, so the query would report everything free while that window's
probe is refused `23514`. `to <= from` is `400`; built at step 1.

## Decisions

**Data-model delta: none**, the GiST indexes the exclusion constraints already create serving the
range predicate. `candidateRepository.ts` still cannot see `appointment`, so QS-12's
`appointment-table-access` marker keeps its one-file list and slice 05's AC-1 re-derivation is
discharged by that set equality at every width.

**The pre-filter is not this slice.** ADR-0033 holds the argument and is the refusable record: a read
that *removes* candidates can empty the list, which `orderCandidates` routes to `500`/`422` and never
`409`. Ordering cannot empty a list.

**§2.1 is silent about the endpoint, and that is the finding**: its subject is the `INSERT`, and a
`GET` performs no act. What keeps *advisory* true is structural — there is **no representation of a
hold**, so no code path turns a free answer into a reservation. The risk is where §2.1 cannot see: a
wrong answer is counted by nothing, which §11 R-5 books.

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

AC-1 states six mechanics; this is why each is there — one way the property passes while wrong.
Mechanic 6 arrived at step 5, rebuilt at round 2.

| # | Mechanic | The failure it closes |
|---|---|---|
| 1 | rolled-back `SAVEPOINT` per probe | pair *k+1*'s verdict depending on pair *k*'s |
| 2 | the verdict is `23P01` exactly | a property accepting *any* error, green where every probe fails wrongly |
| 3 | witnessed quiescence | a failure with two explanations the test cannot discriminate |
| 4 | the two directions counted apart | a merely *conservative* query, which passes accepted-when-free |
| 5 | boundary-biased generation | `[)` versus `[]`, which uniform generation reaches with probability ≈ 0 |
| 6 | a cancelled witness, by construction | query and constraint agreeing on the range, disagreeing on the predicate scoping it |

No isolation level substitutes for mechanic 3: an exclusion check deliberately does not honour the
transaction's snapshot, or two `REPEATABLE READ` writers would both succeed.

## Acceptance criteria — rulings

Mid-slice authority, provisional until the gate; `slice:check` lists them. **AC-1 amended** — the
candidate universe, the probe interval exactly `[from, to)`, the mechanics required, a run whose
quiescence witness fails is *invalid* rather than a QS-8 failure. **AC-5 split**: AC-5a met here,
AC-5b to slice 09 beside AC-9, no OpenAPI document being emitted yet. **AC-6 amended** to `to <= from`. **AC-7 minted at step 1, withdrawn at step 2** — a criterion satisfied before the slice
opens cannot fail it.

## arc42, and what paid for it

| Section | What changed | Paid by |
|---|---|---|
| §5.2 | `busyResources`, `queryAvailability.ts`, the table claim widened past the booking path | the *"neither can see `appointment`"* clause, now ADR-0032's |
| §6.5 | F-08-1 corrected in place, the two-read composition, window identity | the GiST paragraph restating §8.2, and two measurements §11 and ADR-0018 hold |
| §8.6 | *"only about the interval queried"* on the availability row | that row's restatement of §6.5's staleness |
| §10.2 | QS-8's universe, witnessed quiescence, the cancelled witness and its 20/20, the `…db.test.ts` path | QS-8's §4.2 recap, the freshness paragraph, a sentence CLAUDE.md §5 owns |
| §11 | `D-08-1`, `D-08-2`, `D-08-3`; R-4 gains ADR-0033; R-5 *no runtime signal*; R-12 generalises past `main.ts` | a compression pass over §11.1–11.2, D-01-1/D-01-3 merged |

## Rulings

**Step 5.** The reviewer returned changes-requested with no DCR, and no loopback: for none of the
findings can an AC, a `QS-*` or a §2 clause be named. `R-08-1` **upheld, §6 (b), built here** —
`status` was a dimension the generator never varied and ADR-0019 found no later home, so mechanic 6
joined AC-1. `R-08-3` **upheld**: `vitest.mutation.config.ts` includes `tests/unit/**` only, so the
score is a floor on unit rigour and never evidence for a guard outside it (§11 R-12, remedied by the
`dist/` recipe). `R-08-2` upheld, AC-5 split. `R-08-4` upheld as recorded, no action: `a705026`
shipped 151 lines of route, its unit tests arriving at `193db2d` — §7's *green* held, its *together*
did not. `I-04-5` re-deferred to slice 09.

**`R-08-5` — upheld whole, the offered remedy rejected, ruled (d).** Left unruled until step 7, and
both halves are true: §10's per-file threshold is **not met** on `routes/availability.ts`, and the
classification offered with it merged four classes — 2 unkillable by construction, 3 killed
outside-in and invisible to a `tests/unit/**` config, 7 waiting on slice 09's document, and **12
observable today and asserted by nothing**. Remedy judged separately (§6): removing all 24 from the
denominator inverts I-06-5, which removes only the unkillable-by-construction, and widening the
Stryker `include` kills none of the twelve. **(c) is unavailable under §6's own test** — no AC, no
`QS-*`, no §2 invariant fails. **(b) is available and wrong**: its correct half was acted on, the
reachable assertions built at `37cf8f6` and the residue booked as §11 `D-08-1`/`D-08-2`, but a stated
threshold missed on a merging file is not an *improvement* deferred. So **(d)** — merging at 71.43 %
against 0.75 is a trade-off, and trade-offs are the gate's, which is why `gate: light` is revoked
here correctly. `I-08-6` and `O-62` are the downstream halves, ruled (d) for the same reason.
Loopbacks stay at **0**.

**Step 5, round 2.** Both remedies came back measured short, neither role adjusting its own work to
look finished. `T-08-7` **upheld whole, (a), the fault my specification** — 8 of 35 trials survived
at `NUM_RUNS = 30` and `fc.sample` exonerated the weight, so mechanic 6 became a **construction**, bar
20 consecutive kills, met. `I-08-6` **upheld, (d), narrowed 6 → 5**: `to`'s RFC 3339 pattern looked
structural and one more case killed it. `A-08-3` **(b) with a deviation** — no live slice can host the
backlog item, so §11 `D-08-3` is the home. `F-08-1`, `F-08-2`, `F-08-4`, `T-08-4`, `T-08-5`, `I-08-4`
all **(a)**. `O-59` is the human's.

**Step 5, round 3 — `O-62`, and the arithmetic error was mine.** The file is **30 of 42 = 71.43 %**,
not the 76.19 I published: `disable next-line` counts from the end of the comment block, so the
directive at `161` reaches `164`'s `throw` and not the `default:` arm at `159` containing it. **A
third directive is refused on my own record** — I-06-5 met these exact mutants and did not widen the
suppression, and a rule stated where it costs nothing that lapses where it costs something is not a
rule. Ruled **(d)**; §11 `D-08-1`/`D-08-2` carry the numbers and the criterion.

## Open questions and assumptions

- **A-08-1** — the pair-decomposition claim holds only while no constraint couples bay and
  technician; if one arrives, QS-8 stops decomposing.
- **A-08-2** — *quiescent* is a claim about the test process, not a setting; mechanic 3 makes it a
  measurement, assuming Testcontainers gives the run an otherwise-idle database.
- **OQ-08-1** — ids, not names or capacities: §3.3 did not settle it, ids match `candidateResources`'
  shape, and A-7 keeps reference data out of the API. Provisional.
- **A-06-4, for the gate.** Two items went to slice 09 here, ADR-0033 and AC-5b, each correct on
  ADR-0019's criterion — A-06-4's own currency. One pays: with free-first ordering a `23P01` on
  **attempt 1** against a pair the read called free *is* the runtime signal §11 R-5 says is missing.
