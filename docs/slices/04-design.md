# Slice 04 — design

Slice file: [`04-candidate-allocation-and-retry.md`](04-candidate-allocation-and-retry.md) — five
acceptance criteria, QS-3, implementing [ADR-0004](../adr/0004-retry-across-remaining-candidates.md)
and [ADR-0009](../adr/0009-candidate-ordering-and-attempt-cap.md).
arc42 scope: **§6.2, §5.2**. **No data-model delta and no migration.**

## 1. What is already true, and what this slice actually adds

Slice 02 shipped the minimal loop. Three of the five criteria are therefore satisfied by code in
`main` today and this slice's work on them is **evidence, not construction** — which is the honest
thing for step 3 to know before it writes anything:

| | Status |
|---|---|
| **AC-1** `min(N, M)` confirmed | Holds already; the shuffle is what makes it hold *at scale* rather than by fixture size |
| **AC-2** no transaction around the loop | Holds already — `db.transaction()` is inside the loop body, one attempt wide (ADR-0018). New: a test asserting `25P02` never appears |
| **AC-3** prune by the constraint that fired | Holds already, per resource **value** (T-02-1) |
| **AC-4** the cap of 16 | **New.** §2 and ADR-0020 |
| **AC-5** the seeded shuffle | **New.** §3 |

## 2. The capped refusal — the hazard slice 02 flagged, measured

The cap is a second refusal exit, reached with both lists non-empty and so with no emptied list to
name; a *chosen* `ContendedResource` is what ADR-0016 forbids. Four trees were compiled before this
was decided, and the framing inverted: it is a question of **where the return statement goes**, not
of what a capped refusal means. [**ADR-0020**](../adr/0020-test-the-attempt-cap-inside-the-conflict-arm.md)
carries the option table and the four `tsc` exit codes.

**The cap is tested inside the `conflict` arm, beside the exhaustion check — never as the loop's
bound.** The loop `continue`s only on `conflict`, so every refusal exit is reached holding a
`ContendedResource` that classification just minted. ADR-0016 needs no exception. `no-capacity` gains
`exit: 'exhausted' | 'capped'`; exhaustion wins a tie, because nothing was left untried. Both render
identically at the edge (AC-4), so **§8.6 gains no row**.

## 3. The seeded shuffle

New pure module, `src/domain/candidates.ts` — imports nothing, per `domain-is-pure`:

```ts
/** Non-empty by construction: `orderCandidates` and `prune` are the only minting sites. */
export type CandidateOrder =
  { readonly bays: readonly string[]; readonly technicians: readonly string[] }
  & { readonly __brand: 'CandidateOrder' };
export interface Candidate { readonly bayId: string; readonly technicianId: string }

/** `null` when either list is empty — no candidate exists, so no attempt is made. */
export function orderCandidates(
  bays: readonly string[], technicians: readonly string[], seed: number): CandidateOrder | null;
/** TOTAL — a `CandidateOrder` is non-empty, so there is always a head and no index assertion. */
export function nextCandidate(order: CandidateOrder): Candidate;
/** Drops `id` from the named list; `null` when that list emptied. */
export function prune(
  order: CandidateOrder, resource: 'bay' | 'technician', id: string): CandidateOrder | null;
```

Fisher–Yates over a copy of each list from one `mulberry32` stream, written in-module because the
domain may import nothing. `prune` takes the **unbranded** union: a `ContendedResource` is an
intersection and is assignable to it, so the use case passes the minted value straight in with no
cast, and nothing branded crosses back out. The non-emptiness brand also removes the last
`as string` index assertion on the booking path.

**The seed is injected, never global**: `BookDeps` gains `seed: () => number`, bound in `main.ts` to
`randomInt(0, 2 ** 32)`. `BookDeps` was shaped for this at slice 02, so no signature changes.

## 4. The rest of the delta

- `src/platform/config.ts` — `attemptCap`, from `ATTEMPT_CAP`, default **16**, an integer in
  `1…1000`. ADR-0009 put it here. It reaches the use case as `BookDeps.attemptCap`.
- `bookAppointment.ts` — one `orderCandidates` call after the two empty-candidate guards;
  `nextCandidate` per iteration; the cap and exhaustion checks of §2; and **one new log line,
  `booking.refused`**, at both exits, carrying `exit`, `resource`, `attempts` and `seed`. That is
  AC-4's *"visible in telemetry rather than silent"* leg until slice 09's
  `booking_conflicts_total{outcome}`, and it follows I-02-6: an outside-in test may read the
  response, the database and stdout, and the first two carry neither field.
- The seed on that line is what makes a reported failure re-runnable (§5, AC-5).

## 5. Rulings — all provisional, all listed at the gate

- **AC-5 is satisfied at the level where a seed can decide anything.** *"The same interleaving of
  candidate choices results"* is not achievable for a concurrent scenario: the interleaving is the
  OS scheduler's and PostgreSQL's, and this repository has already measured identical configurations
  producing 292, 241 and 2 100 deadlocks (ADR-0018's retry table). Asserting it would produce the
  flake AC-5 exists to prevent. So AC-5 is read as: **ordering is a deterministic pure function of
  (bays, technicians, seed)** — a property test — **and the seed actually used is recorded**, so a
  failure names the order it took. Cost if wrong: a concurrency test cannot replay a race, only the
  ordering inside it.
- **The availability filter stays out of this slice.** §6.2 step 5 and `candidateRepository.ts`'s own
  comment both anticipate it here. No acceptance criterion needs it, it is a **read** and the slice
  that owns the availability read and its advisory-by-contract statement is **08** (§6.5, QS-8), and
  landing it here would either widen `appointment-table-access`'s single-file claim or add a
  repository function, an ADR and a §6.2 correction for a benefit nothing measures. Ruled under
  ADR-0019's criterion. Its cost is **D-04-1**, below, and it is not small.
- **`ATTEMPT_CAP` is configurable, which gives AC-4 a cheap fixture** — a cap of 3 rather than a
  dealership deep enough to need 17 attempts. If step 3 takes it, one assertion that the *default*
  is 16 belongs beside it, or nothing pins ADR-0009's number.

## 6. Findings, assumptions and open questions

- **D-04-1** — **ADR-0009 sized the cap at 16 "against contention depth, the only driver Bound-2
  leaves". That is true only of a candidate list already filtered to free resources**, which does not
  exist until slice 08. Until then the drivers are contention depth *plus* the count of resources
  merely booked by unrelated appointments, so a dealership with more than about sixteen
  bays-plus-technicians can reach the cap **with no concurrency at all** — a refusal while capacity
  remained, which AC-1 names as a slice failure and which QS-3's fixtures will not see because they
  seed exactly *M*. The premise is hidden inside ADR-0009's justification rather than stated in it.
  Slice 08 must close it. **F-04-3**: it belongs in §11, and §11 is not in this slice's `arc42:`
  declaration — the field needs §11 added (the orchestrator's file) or D-04-1 and D-04-2 land nowhere
  at step 7. Numbered because a routing stated in prose creates no work item (F-02-11).
- **D-04-2** — ADR-0020 is a rule about **where a `return` goes**, and `tsc` objects only once
  someone both moves the cap and refuses from outside the arm. §11, via F-04-3.
- **D-02-1** — defined here, and this is the second correction below: it is the id §11 must use for
  *"ADR-0016's argument is weaker after ADR-0018 than before it"*. `docs:refs` requires a
  design-local id to be **defined** in a slice design, arc42 may not mint its own (slice 02's step-7
  report records that), and slice 02's design is closed at its merged budget — so it lands in the
  design that renames it.
- **A-04-1** — F-02-9 is unaffected: the shuffle reorders *which* candidate is attempted and never
  the order the two locks are taken within an attempt, which is bay-class then technician-class by
  ADR-0018's disjoint key spaces and is total by construction, not by sorting.
- **F-04-1** — `docs:adr-check` reports ADR-0020 *unpinned* and says to add its entry by hand rather
  than `--rebaseline`. `tools/` is not the architect's; this is the third slice running to hit it
  (F-02-10), and it needs one line in `tools/docs/adr-baseline.json`.
- **F-04-2** — **`docs:budget:check --ratchet` fails on a correctly-sized new document, and its
  prescribed remedy would break the in-flight budget.** `r.slack = (r.was ?? r.budget) - r.words`
  measures *distance under budget*, not a reduction, so any document more than 100 words and a tenth
  of its ceiling below budget is reported as unheld slack. Measured on a fixture: a 101-word
  `slices/07-design.md` is flagged both with an empty baseline **and** with a baseline entry of 3 000,
  so it is not merely a missing-pin case. Running the rebaseline it asks for would pin this design at
  its step-1 size and leave steps 2–5 unable to amend it — the `sliceDesign: 3000` /
  `sliceDesignMerged: 1200` split exists precisely to allow that growth. As it stands the in-flight
  budget is unusable under the ratchet for any design below ~2 700 words, which is a guard pushing
  *towards* the padding the concision rule exists to remove. `tools/` is not the architect's.
- **OQ-04-1** — the seed is per **request**. Two requests arriving in the same millisecond get
  independent seeds, which is the point; but nothing asserts the generator is not degenerate in a
  deployment. ADR-0009 named it ("the seed must actually vary") and a property over many seeds is
  the cheapest available answer — it tests the *ordering*, not the *source*. Left open.

## 7. Proposed arc42 edits

**§6.2** — step 5 loses *"empty → 409, no attempt made"*, which ADR-0016 forbids and §8.6 already
answers two other ways; step 6 takes the built signature; step 7's header replaces the stale *"OUTSIDE
any transaction"* with ADR-0018's one-transaction-per-attempt; the box's two refusal rows become
`exit`. **§5.2** — `candidates.ts`'s row takes the built surface, `BookOutcome` gains `exit`, and
`src/platform` names `ATTEMPT_CAP`.

## 8. Two corrections, outside this slice's declaration

Found at slice 02's step 7 and routed here. They are **committed separately**; they are not slice 04's
work. **§8.3** said ADR-0015 was *"Accepted, and not yet written"* — it shipped in slice 02 (AC-17–19).
**§11** labelled the weakened-ADR-0016 argument `R-02-2`, which is the reviewer's *"the lock-drop
control is not in the suite"* finding that ADR-0019 adjudicates; it becomes **D-02-1**, matching the
`D-01-x` block directly above it.
