# Slice 08 — design

Slice file: [`08-availability-query.md`](08-availability-query.md). Two records:
[**ADR-0032**](../adr/0032-availability-is-two-reads-composed-in-the-use-case.md) (`accepted`) and
[**ADR-0033**](../adr/0033-the-advisory-read-orders-candidates-it-never-removes-them.md) (`proposed`).

Availability is *advisory by contract*, so nothing refuses a wrong answer. A-07-3's countermeasure —
read the value in the representation the system actually uses — is applied here to documents rather
than to values, and it found arc42 disagreeing with itself twice.

## 1. The three questions

### 1.1 What makes an advisory answer wrong, and what catches it

**Agreement, defined over a universe.** QS-8 as §10.2 states it quantifies over *"every (bay,
technician) pair"* and is **false** at that width: an unqualified technician or a bay at another
dealership is refused with `23503`, a degenerate window with `23514` — neither is `23P01`. The universe
is the **candidate set**: `candidateResources(dealership, serviceType)`'s bays × technicians. Over that
universe and only there, *omitted ⇔ `23P01`*. §10.2 is corrected.

**And it decomposes.** The response is two lists; QS-8 quantifies over pairs. Cross-product is sound
because `no_bay_overlap` and `no_technician_overlap` are independent — b free ∧ t free ⇒ (b,t)
insertable. Sound, not obvious; the property probes pairs, not lists.

**Window identity.** The probe inserts **exactly `[from, to)`**, so the answer means *free over the
whole queried window*, and a client querying a day to book an hour inside it is outside QS-8's
guarantee — the second honesty obligation, which §6.5, §8.6 and AC-5a now carry.

**Wrong versus stale.** *Stale* = true of some state at or after the query's snapshot; *wrong* = true
of none. Under quiescence they collapse, so QS-8 is *is it ever wrong* with staleness removed — **but
only if quiescence is witnessed rather than declared.** No isolation level will do it: an exclusion
check deliberately does not honour the transaction's snapshot, or two `REPEATABLE READ` writers would
both succeed. The test must **observe** it.

**Six mechanics, each closing one way the property passes while wrong.** Mechanic 6 was added
at step 5, adjudicating `R-08-1` (§7).

| # | Mechanic | The failure it makes impossible |
|---|---|---|
| 1 | Each probe is a `SAVEPOINT` rolled back | A `23P01` aborts the transaction; committing probes make pair *k+1*'s verdict depend on pair *k*'s, against a schedule the query never saw |
| 2 | The verdict is the **SQLSTATE**, `23P01` exactly | A property that accepts *any* error as agreement is green against a fixture where every probe fails for the wrong reason. `23503`, `23514`, `40P01` fail the run **distinctly** |
| 3 | Quiescence is witnessed: re-run the query after the probes; byte-identical answer, unchanged `count(*)`/`max(updated_at)` | Without it a failure has two explanations and the test cannot discriminate; with it, exactly one |
| 4 | Both directions counted separately, and the shrunk counterexample names which | A merely *conservative* query — reporting too little — passes the accepted-when-free direction entirely, and conservatism is what a naive implementation produces |
| 5 | The generator is **biased to the boundary**: appointments ending exactly at `from` and starting exactly at `to` | `[)` versus `[]` is the likeliest divergence between the two SQL expressions, and uniform generation hits it with probability ≈ 0. The generator must reach it by design |
| 6 | Every run carries a **cancelled witness**: one item written `cancelled`, inside `[from, to)`, on a bay and technician no other in-window item uses (`T-08-7`) | A query and a constraint agreeing on the range and disagreeing on the predicate that scopes it. Delete `status <> 'cancelled'` and the witness's pair is reported busy while its probe is **accepted** — direction B, every run. Extensionally it still cannot separate the denylist from an allowlist (`A-08-3`) |

Mechanics 1–6 answer *what would catch it*; mechanic 3 answers *stale versus wrong*.

### 1.2 The pre-filter: not this slice

**"After QS-8" means a later slice**; in scope stays *the availability query and its route*. Ruled
under mid-slice authority, provisional until the gate. ADR-0033 carries the reasoning: a pre-filter that
*removes* candidates can empty the list, which `orderCandidates` routes to `500`/`422` and never `409`,
so it would either refuse a full dealership wrongly or mint a `409` from a read — ADR-0016 forbids the
second. **Ordering cannot empty a list.** What ships here is the decision, in a refusable record, so the
deferral is not ADR-0019's option C.

### 1.3 What §2.1 says: nothing about the read, and that is the finding

§2.1's subject is the `INSERT`. `GET /availability` performs no act, so there is no check-then-act to
commit and §2.1 is **silent about the endpoint**. Two things it is not silent about:

- **Its consumers.** The operative test is ADR-0016's — *can a refusal be produced without a database
  verdict?* — which is what ADR-0033 rules on. §2.1 reaches the pre-filter, not the query.
- **The word "advisory" being true.** Structurally, not documentarily: there is **no representation of
  a hold** — no `held` status, no `expires_at`, no reserve endpoint — so no code path can turn a free
  answer into a reservation. AC-5's flag is a courtesy on top of that absence.

**The risk is where §2.1 cannot see.** §2.1 makes overlap unrepresentable in the *table*, and nothing
unrepresentable in the *answer*. A wrong answer is refused, logged and counted by nothing —
`booking_conflicts_total` counts `23P01`, and an under-reporting query produces none, so QS-8 is the
only thing between a divergence and production. §11 R-5 books the *duplication*, not the
*undetectability*; §5 hands slice 09 a cheap partial signal.

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
in `busyResources`, one file from the migration declaring the constraint:

```sql
tstzrange(starts_at, ends_at) && tstzrange($from, $to)  AND status <> 'cancelled'
  AND dealership_id = $1
```

**`candidateRepository.ts` still cannot see `appointment`**, so QS-12's `appointment-table-access`
marker keeps its one-file list, `ambiguity-containment.test.ts`'s existing plant of it stays a
violation, and slice 05's AC-1 re-derivation is discharged by that set equality at **every** width
rather than by the 1×1 fixture the slice file proposed. Route: `GET /availability` in
`src/http/routes/`, TypeBox query schema, one more exhaustive `switch`.


## 3. Acceptance criteria — rulings

Mid-slice authority; provisional until the gate; `slice:check` lists them. The wording is the slice
file's, the grounds are here. **AC-1 amended** — the universe is the candidate set, the probe interval
is exactly `[from, to)`, §1.1's mechanics are required, and a run whose quiescence witness fails is
**invalid**, not a QS-8 failure. **AC-5 amended** — both facts, not one. **AC-6 amended** —
`to <= from` is `400`, not `to < from`: `from == to` is an empty `tstzrange` that overlaps nothing, so
the query would report everything free and a probe of that window is refused by `23514` rather than
`23P01` (`F-08-3`). **AC-7 minted here and withdrawn at step 2** (`T-08-2`) — a criterion satisfied
before the slice opens cannot fail it, §2.4's own argument, and the ground `R-08-2` applies to AC-5
in §7.

## 4. arc42 edits proposed, and what pays

Every section is at 0–15 words of headroom, so each addition names its deletion.

| § | Addition | Paid by |
|---|---|---|
| §5.2 | `busyResources` on the `appointmentRepository.ts` row; `queryAvailability.ts` in the as-built application list | the `src/persistence` as-built row's *"neither can see `appointment`"* clause, whose home is now ADR-0032 and the marker |
| §6.5 | the two-read composition (ADR-0032); the window-identity sentence | §6.5's GiST-index paragraph, a verbatim restatement of §8.2's mechanism 6 — replaced by a pointer |
| §8.6 | *"and only about the interval queried"* on the availability row | the same row's restatement of §6.5's staleness prose, collapsed to a clause |
| §10.2 | QS-8's universe, the probe-interval identity, the quiescence witness, and the evidence path `…db.test.ts` (`T-08-4`) | the *"deliberately not here"* paragraph's availability sentence, compressed — §6.5 now owns the reason |
| §11.2 | R-5 gains *no runtime signal*; R-4's *"two remedies, neither chosen"* becomes ADR-0033's third | the replaced clause, roughly word-neutral |
| §11 R-12 | generalised from *blind to `main.ts`* to *blind to any guard outside `tests/unit/`*, with `busyResources` as its third instance (`R-08-3`); R-5 gains QS-8's true reach; a debt entry for the ten survivors §10 leaves stated (`I-08-6`) and `A-08-3`'s unassertable denylist | R-12's two discharged `main.ts` instances, compressed to their shas — §11 is 589 words over and may not grow |

## 5. A-06-4 — what the gate was owed, and one new fact

Not mine to rule; ADR-0019 is mine. Two facts handed up, since ruled by the human (`O-59`).
**Slice 09's three parts are not independent**: ADR-0033's bias must land after F-06-1's extraction and
is measured by AC-13, so a split along the stated seam separates a change from the only thing that
proves it. And **one label gives slice 09 a signal**: with free-first ordering, a `23P01` on **attempt
1** against a pair the read called free *is* a measured disagreement — §1.3's missing runtime signal, on
a counter slice 09 already builds. Recommended, not ruled.

## 6. Findings, assumptions, open questions

- **F-08-1** — **§6.5 has specified `candidateRepository.freeResources` since phase 2, and an
  architecture control plants exactly that as a violation.** arc42 contradicted itself for six slices;
  `docs:refs` checks that links resolve, not that sections agree. ADR-0032 corrects it.
- **F-08-2** — **QS-8 is false as written in §10.2**, over the universe its own words give (§1.1).
- **F-08-3** — **AC-6 guards the window the opposite way round from the database** (§3).
- **A-08-1** — the pair-decomposition claim (§1.1) holds only while no constraint couples bay and
  technician. If one arrives, QS-8 stops decomposing.
- **A-08-2** — *"quiescent"* is a claim about the test process, not a setting; mechanic 3 makes it a
  measurement. Assumed: Testcontainers gives the run an otherwise-idle database.
- **OQ-08-1** — ids rather than names or capacities: §3.3 did not settle it, ids match
  `candidateResources`' shape and A-7 keeps reference data out of the API. Provisional at the gate.

## 7. Step 5 — rulings

The reviewer returned changes-requested with no DCR. Findings on the diff, ruled under mid-slice
authority, **provisional until the gate**; `slice:check` lists them. No loopback: for none of the four
can I name an acceptance criterion, a `QS-*` or a §2 clause that fails — the test, not a preference.

**R-08-1 — upheld, §6 (b), and ADR-0019 puts its home here rather than later.** `status` is a dimension
`scheduleItemArbitrary` never varies — every row takes the `confirmed` default. Not (c): AC-1's five
mechanics are present, QS-8 as amended is **true**, and §2.1's subject is the `INSERT`, untouched. The
work is correct under ADR-0032; the property's *reach* is narrower than the design claimed. (b) obliges
a named home and **ADR-0019 finds none** — no live slice adds a status or reopens the generator — so it
is built here, as §4.4's DDL-drop control was at slice 02. **Mechanic 6 joins §1.1's table and AC-1
requires it**, specified as a *weight*; `T-08-7` measured what a weight reaches and §8 corrects it to a
construction.

**What it still cannot reach — `A-08-3`.** `status <> 'cancelled'` and `status = 'confirmed'` are
*extensionally equal* over a two-value enum, so no fixture separates them until a third status exists —
a data-model change no requirement asks for. `0003_appointment.sql`'s denylist argument stays prose.
Booked, not built; §8 rules its home.

**F-08-4 — the docblock is wrong a second way the review did not reach.** Each run seeds a **fresh**
dealership and a foreign bay is never in `candidateResources`' output, so deleting `dealership_id = $1`
changes no answer QS-8 can observe — redundant-by-composite-FK, kept to scope the index. It should
claim **range and status**, and say the third is redundant.

**R-08-3 — upheld, and it changes how the gate reads the number.** `vitest.mutation.config.ts` includes
`tests/unit/**` only, so the score is a floor on unit-test rigour and **never** evidence for behaviour
guarded outside-in — `busyResources` scores well on a string equality against its own compiled SQL.
§11 **R-12** gains it as a third instance (§4); re-scoping Stryker stays rejected on
`stryker.config.mjs`'s own measurement. **The remedy is the reviewer's method**, recorded as a recipe
rather than an artifact of one review: mutate `dist/` in a throwaway worktree, run the outside-in
suite. It produced R-08-1.

**R-08-2 — upheld, remedy accepted.** AC-5's second half cannot fail: no `docs:openapi` script, no
emitted document — the ground AC-7 was withdrawn on at step 2. **AC-5 splits**: AC-5a, the response, is
met here; AC-5b goes to **slice 09** beside AC-9, not slice 10, a tombstone A-06-2 forbids a
`deferred_to` naming. ADR-0019 is met in its strongest form: the subject **does not exist yet**.

**R-08-4 — upheld as recorded, no action.** `a705026` shipped 151 lines of route, unit tests at
`193db2d`. §7's *green* held, §7's *together* did not.

**I-04-5 — re-deferred to slice 09, with a third argument.** §1.2 argued ADR-0019 both ways (cheaper
after F-06-1; measured by AC-13). R-08-1 adds: **ADR-0033's deductive chain runs through QS-8**, and
until mechanic 6 lands QS-8 says nothing about a **cancelled** appointment — precisely the row that must
not bias free-first ordering away from a bay that is genuinely free. ADR-0033 stays `proposed`. **That
makes two items routed to slice 09 in one slice** — ADR-0033 seventh, AC-5b eighth, each individually
correct on ADR-0019's criterion, which is **A-06-4's own currency**. Counted here rather than left for
the human to reconstruct.

**R-08-5 — §10 is NOT satisfied on `routes/availability.ts`, and I reject the classification that would
satisfy it.** I-06-5's precedent removes from the denominator **only what is unkillable by
construction** — 9 of 36 at slice 06, leaving a stated gap. Removing all 24 removes the survivors,
which inverts it; only the O-48 twins qualify, so 25 over 47 is **53.19**. **The report merges three
classes:** 2 unkillable; 3 `DISCLAIMER` literals observable and killed outside-in but invisible to
Stryker (R-08-3's sharpest instance); 7 schema `description` literals unobservable until slice 09 emits
the document (R-05-9's class); and **12 observable today and asserted by nothing** — `title` and
`detail` strings, the `pattern` options, the `response` map, `additionalProperties` (§8 names the
lines). `routes/appointments.ts:370, 383, 391, 407` has carried the identical hole since slice 02:
*"unchanged in character"* is true, and the character was never inert. **So neither offered remedy** —
unit assertions on the full problem document duplicate nothing, and widening `include` kills **none** of
the 12. Ruled (b), home **here**; built at `37cf8f6`, and `I-08-6` measured what it reached.

**Question 2, on this slice's own evidence.** A per-file threshold states the *unit* suite's rigour and
nothing more. The number most likely to be misread is not 48.94 — it is **`appointmentRepository.ts` at
100.00**, whose unit test is a string equality against its own compiled SQL. **A perfect per-file score
sat directly on top of the one real defect.**

## 8. Step 5, round 2 — the two remedies that did not reach

Both came back **measured**, and neither role adjusted its own work to look finished. Loopbacks stay
at 0: for neither can I name an AC, a `QS-*` or a §2 clause that fails.

**T-08-7 — upheld whole, and the fault is my specification rather than mechanic 6. `(a)`.** 8 of 35
trials survive at `NUM_RUNS = 30`, and `fc.sample`'s 1033/5000 exonerates the weight — so raising it
fights a cleared variable, and raising `NUM_RUNS` buys a probability where AC-1 needs a gate. I asked for a weight where **mechanic 5, on this same generator, already settles the rule**: a
region uniform generation reaches with probability ≈ 0 is reached *by construction*. Three compounding
narrowings is what a probability looks like when three conditions must coincide. **Mechanic 6 becomes a
cancelled witness**, worded in AC-1: under the reviewer's third mutant its pair is reported busy while
its probe is accepted — direction B, every run. **Bar: 20 consecutive kills** by R-08-3's `dist/`
recipe, and if it is not 20/20 the construction is wrong, so come back rather than raising `NUM_RUNS`
or the weight to close the gap.

**I-08-6 — upheld, the classification narrowed 6 → 5, and §10 is then satisfied. `(d)`.** One
disagreement: **`to`'s pattern at `57` is not structural.** The stated mechanism — `removeAdditional`,
the fixed-shape literal — does not reach it, and this file already kills `from`'s twin at
`tests/unit/http/availability.test.ts:158` and `serviceTypeId`'s at `:187`; the two `400`s differ anyway,
`server.ts:127` sending `detail: error.message` where the route sends a fixed string. One more case,
mirroring `:158` → **32 killed**. The other five (`59`, `60`, `79`, `80`, `100`) I accept as measured:
killable only by an assertion that restates the literal — R-08-3's own pathology, where
`appointmentRepository.ts` scored 100.00 by string equality against its SQL while sitting on the one
real defect. **The instrument is five `Stryker disable next-line` directives at source, not a file
exclusion**: `ObjectLiteral` on `59`/`79`/`100`, `BooleanLiteral` on `60`/`80`, **never `all`**, which
would swallow the `description` strings slice 09's AC-7 kills. Per-construct and beside what it excludes,
as line 143's `never`-arm directive already is. **Criterion, so this is not a one-off:** permitted only
where (i) the `dist/` recipe measures no observable difference at the module's boundary and (ii) the
only killer restates the literal. `to` is the case that shows it has teeth — it looked structural and is
not. ~~**32 of 42 = 76.19%, over §10's 0.75**~~ — **wrong, and mine; measured at 71.43%. See §9.** The ten
survivors I did name stay in the denominator on purpose: 3 killed outside-in but invisible to a
`tests/unit/**` config, 7 waiting on the document. Ruled `(d)` — moving a denominator flatters its
author, so the gate reviews it.

**The rest.** `F-08-1` **(a)** — §6.5 corrected at step 7; the control was right and arc42 wrong, and
ADR-0032's Option D leaves the marker list untouched (`I-08-1` verified the citation exact).
`F-08-2` **(a)** — §10.2's universe becomes §1.1's candidate set. `F-08-4` **(a)** — discharged both
ways by `0e9db30`, one clause contingent: *"often enough for the property to see one"* is true only once
the witness lands and should then read *by construction*, which is the same overstatement F-08-4 named.
`T-08-4` **(a)** — the harness forces `…db.test.ts`, so §10.2's evidence path moves, not the file.
`T-08-5` **(a)** — the wire shape is now pinned in AC-5a; the test-engineer's assumption was right, and
`I-08-5`'s non-`Literal` schema is upheld **as design**, because a `Type.Literal` would make AC-5a
unable to fail. `A-08-3` **(b)**, with a deviation the gate should see: §6's (b) wants a backlog slice,
none can host it (`O-59` closed 09), and no work exists until a requirement adds a third status — so the
home is a §11 debt entry. `I-08-4` **(a)** — sequential composition upheld over ADR-0032's *"alongside"*;
the reason found while unit-testing is better than the sketch's. `I-08-1`, `I-08-2`, `I-08-3`, `I-08-5`,
`A-08-1` and `A-08-2` need **no ruling** — disclosures and verifications. `F-08-3` was discharged at
step 1 and is built; `OQ-08-1` stands as ruled. **`O-59` is not mine** — a collision between the human's
ruling and one of mine, so the gate has it. **`gate: light` is revoked by its own terms**: two MAJORs
were open at step 5.

## 9. Step 5, round 3 — `O-62`, and the arithmetic error is mine

**Upheld whole; the remedy offered with it is rejected. `(d)`.** `routes/availability.ts` is **30 of
42 = 71.43%**, under §10's 0.75. The directive at `161` reaches `164`'s `throw` and not the `default:`
arm at `159` containing it — `disable next-line` counts from the end of the comment block — so two
mutants I never counted (`ConditionalExpression`, `BlockStatement`) sit in the denominator. §8's
figure is struck in place, not rewritten.

**A third directive is refused on my own record.** `I-06-5` met these exact two mutants at slice 06 —
*"eight structurally unkillable mutants remain on the `default: {` line above each `throw`, and the
suppression was **deliberately not widened** to reach them"* — and gave a general reason: raising a
score by suppressing more is the failure `R-05-9` exists to prevent. A rule stated where it costs
nothing that lapses where it costs something is not a rule, and suppressing to clear a **failing**
number is the worse case, because the suppression becomes load-bearing on the verdict. It also lands
on **75.00 exactly**, forcing me to rule `R-05-7`'s knife-edge to escape a hole I dug; and
`routes/appointments.ts` carries **eight** of the identical construct today (118/155 = 76.13), so a
directive here either classifies one construct two ways in one layer or lifts a merged file to
118/147 = 80.27. Neither is available.

**Widening `vitest.mutation.config.ts` is already ruled** (`R-08-3`): outside-in suites run the built
artifact, so each mutant costs a `tsc` plus a container. One round; not re-opened.

**The numerator cannot honestly move either.** `159`'s two are unkillable by construction; `68`–`70`
and `96`–`99` are the seven schema `description` literals unobservable until slice 09 emits the
document; `48`–`50` are `DISCLAIMER` prose **beyond** AC-5a, whose two required facts live at `47`
and *are* killed (`tests/unit/http/availability.test.ts:98-99`). Asserting `48`–`50` restates literal
prose no AC demands — criterion (ii)'s pathology.

**Ruling: the file does not meet §10 at 71.43, it merges with the shortfall stated, and the gate is
shown the number rather than a number.** No AC, no `QS-*`, no §2 clause fails, so `(c)` is unavailable
under §6's own test; `slice:check` reads the aggregate (93.32, break 74) and passes. Loopbacks stay at
**0**. The difference from `I-06-5` is the one the gate should see named: **it stated a gap on a
passing file; this states one on a failing file.** §11 at step 7 books twelve, not ten, with the
per-file figure and `appointments.ts`'s eight beside it.

**One implementer change; it moves no number.** `src/http/routes/availability.ts:161–163` — the
comment claims *"an exhaustive switch's `never` arm"* and reaches only the `throw`. Leave the
directive where it is; add a clause naming what it does not cover and that `159`'s two mutants are
left in the denominator deliberately, citing `O-62`. A comment asserting a reach it does not have is
this project's most-counted defect shape, and it is what produced `O-62`. Nothing is added, moved or
removed; the score stays 71.43.
