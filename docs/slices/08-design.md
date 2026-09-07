# Slice 08 — design, as built

Slice file: [`08-availability-query.md`](08-availability-query.md). arc42 §5.2, §6.5, §8.6, §10.2 and
§11 describe the system; this file records what was decided, measured and ruled.

## What the slice turned out to be

Availability is *advisory by contract*: nothing refuses a wrong answer, and looking for what would
catch one found arc42 disagreeing with itself twice. **F-08-1** — §6.5 had specified
`candidateRepository.freeResources` since phase 2 and no such function existed, while an
architecture control planted that exact call as a violation: the control was right and arc42 wrong
for six slices. **F-08-2** — QS-8 was false as §10.2 wrote it. Both corrected in place; `docs:refs`
checks that links resolve, not that sections agree.

## Decisions

**Availability is two reads composed in the use case** — `busyResources` in
`appointmentRepository.ts`, subtracted in `queryAvailability` (§6.5), with **no data-model delta**,
the exclusion constraints' GiST indexes serving the range predicate. F-08-1's joined query would
widen `appointment-table-access` to two files, and the marker is per **file**, not per function:
`candidateResources` would sit in a module that *may* read `appointment`, with nothing but an
unwritten clause keeping it out — the substitution §5.2's *"nowhere else that could read"* claim rests
on being impossible. A `NOT EXISTS` inside `candidateResources` ships the pre-filter in front of QS-8,
which I-04-5 ruled against; a separate `availabilityRepository.ts` widens the list to two for no gain,
one file being checkable at a glance and two a list. **The marker's file list is unchanged by this
slice, and that is the assertion** — stronger than any fixture width, holding at every width, with
slice 05's AC-1 re-derivation discharged by it. Cost: two round trips where a join takes one, affordable while
QS-14 counts reads per *request*. This fixes the file, not the query.

**The advisory read orders candidates; it never removes them — and it is not this slice.** On the booking
path `busyResources` would bias ADR-0009's shuffle, free-reported candidates first and *membership*
unchanged, so every §6.2 branch keeps today's reachability. **A read that
*removes* candidates can empty the list**, which `orderCandidates` routes to `500` or `422` and never
`409`, ADR-0016 requiring a capacity refusal to carry a resource PostgreSQL minted. Both are wrong for a merely full dealership, and a `409` minted from a read is §2.1's forbidden
shape with the `if` moved into a query planner. Filtering with a fallback was refused,
the fallback being reachable only when read and constraint disagree about everything; raising the cap,
because that number is the human's and a blind shuffle over 25 resources with 500
appointments still issues more than one `INSERT`. **AC-13 then follows
deductively**: uncontended means quiescent, under quiescence QS-8 says a pair reported free is
accepted by an `INSERT`, and free-first makes that pair attempt 1 — which is why it could not ship before
QS-8, and why the read must cover the occupancy interval and no wider. **Proposed, not
accepted**: it shapes work landing in slice 09, and a shape invented while deferring is what rationalisation
looks like.

**§2.1 is silent about the endpoint, and that is the finding**: its subject is the `INSERT` and a
`GET` performs no act. What keeps *advisory* true is structural — with **no representation of a
hold**, no path turns a free answer into a reservation. The risk is where §2.1 cannot see: nothing
counts a wrong answer (§11 R-5).

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

AC-1 states six mechanics, each closing one way the property passes while wrong; mechanic 6 arrived
at step 5 and was rebuilt at round 2.

| # | Mechanic | The failure it closes |
|---|---|---|
| 1 | rolled-back `SAVEPOINT` per probe | probe *k+1*'s verdict depending on *k*'s |
| 2 | the verdict is `23P01` exactly | accepting *any* error, green where every probe fails |
| 3 | witnessed quiescence | a failure with two explanations, undiscriminated |
| 4 | the two directions counted apart | a *conservative* query passing accepted-when-free |
| 5 | boundary-biased generation | `[)` versus `[]`, which uniform generation reaches at ≈ 0 |
| 6 | a cancelled witness, by construction | query and constraint agreeing on the range, differing on its predicate |

No isolation level substitutes for mechanic 3: an exclusion check deliberately does not honour the
snapshot, or two `REPEATABLE READ` writers would both succeed.

## Acceptance criteria — rulings

Mid-slice authority, provisional until the gate; `slice:check` lists them. **AC-1 amended** — the
candidate universe, the probe interval exactly `[from, to)`, the mechanics required, and a run whose
quiescence witness fails *invalid* rather than a QS-8 failure. **AC-5 split**, AC-5a here and AC-5b
to slice 09, no OpenAPI document being emitted yet. **AC-6 amended** to `to <= from` (**F-08-3**): it had
guarded the window the opposite way round from the database, `from == to` being an empty `tstzrange`
overlapping nothing, so the query reports everything free while that window's own probe is refused
`23514`. **AC-7 minted at step 1 and withdrawn at step 2**, a criterion satisfied before the
slice opens being unable to fail it.

## Rulings

**Step 5.** The reviewer returned changes-requested with no DCR, and no loopback: for none of the
findings can an AC, a `QS-*` or a §2 clause be named. `R-08-1` **(b), built here** — `status` was a
dimension the generator never varied and ADR-0019 found no later home, so mechanic 6 joined AC-1.
`R-08-3` **upheld**: `vitest.mutation.config.ts` includes `tests/unit/**` only, so the score is a
floor on unit rigour and never evidence for a guard outside it (§11 R-12). `R-08-4` upheld as recorded, no
action: the route shipped 151 lines before its unit tests, so §7's *green* held and its *together*
did not.

**`R-08-5` — upheld whole, the offered remedy rejected, ruled (d).** Both halves are true: §10's
per-file threshold is **not met** on `routes/availability.ts`, and the classification offered with it merged four
classes. Remedy judged separately (§6): removing all 24 survivors from the denominator inverts
I-06-5, and widening the Stryker `include` kills none of the twelve that matter. **(c) is unavailable under §6's own test**,
no AC, `QS-*` or §2 invariant failing; **(b) is available and wrong**, its correct half acted on, a stated
threshold missed on a merging file not being an *improvement* deferred. So **(d)**: it is a trade-off,
and trade-offs are the gate's, which is why `gate: light` is revoked. Loopbacks stay at **0**.

**Step 5, round 2.** Both remedies came back measured short, neither role adjusting its own work to
look finished. `T-08-7` **(a), the fault my specification** — 8 of 35 trials survived at
`NUM_RUNS = 30`, `fc.sample` exonerated the weight, and mechanic 6 became a **construction** with a
bar of 20 consecutive kills, met. `I-08-6` **(d), narrowed 6 → 5**: `to`'s RFC 3339 pattern looked structural
and one more case killed it. `A-08-3` **(b) with a deviation**, no live slice being able to host the
backlog item, so §11 `D-08-3`. Six further findings **(a)**; `O-59` is the human's.

**Step 5, round 3 — `O-62`, and the arithmetic error was mine**: 71.43 %, not the 76.19 I published.
`disable next-line` counts from the end of the comment block, so the
directive reaches the `throw` and not the `default:` arm containing it. **A third directive is refused
on my own record** — I-06-5 met these exact mutants and did not widen the suppression, and a rule
stated where it costs nothing that lapses where it costs something is no rule. **(d)**.

## Debt booked

- **D-08-1, D-08-2** — `routes/availability.ts` merged at **30 of 42 = 71.43 %** against §10's 0.75,
  12 of its 24 survivors being observable today and asserted by nothing. §11 carries both.
- **D-08-3** — `A-08-3`'s backlog item, hostable by no live slice (§11).

## Open questions and assumptions

- **A-08-1** — pair-decomposition holds only while nothing couples bay and technician.
- **A-08-2** — mechanic 3 makes *quiescent* a measurement, assuming an idle container.
- **OQ-08-1** — ids, not names or capacities; §3.3 did not settle it and A-7 keeps reference data out
  of the API.
- **A-06-4, for the gate.** Two items went to slice 09, the advisory ordering and AC-5b, both correct on
  ADR-0019's criterion; one pays, a `23P01` on **attempt 1** against a pair the read called free being
  the runtime signal §11 R-5 says is missing.
