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
name; a *chosen* `ContendedResource` is what ADR-0016 forbids. Five trees were compiled, and the
framing inverted: it is a question of **where the return statement goes**, not of what a capped
refusal means. [**ADR-0020**](../adr/0020-test-the-attempt-cap-inside-the-conflict-arm.md) carries
the options and their `tsc` exit codes.

**The cap is tested inside the `conflict` arm, beside the exhaustion check — never as the loop's
bound.** The loop `continue`s only on `conflict`, so every refusal exit is reached holding a
`ContendedResource` that classification just minted. ADR-0016 needs no exception. `no-capacity` gains
`exit: 'exhausted' | 'capped'`; exhaustion wins a tie, because nothing was left untried. Both render
identically at the edge (AC-4), so **§8.6 gains no row**.

## 3. The seeded shuffle

New pure module, `src/domain/candidates.ts` — imports nothing, per `domain-is-pure`:

```ts
type NonEmpty<T> = readonly [T, ...T[]];                       // I-04-3 — the carrier is the point
/** Non-empty by construction: `orderCandidates` and `prune` are the only minting sites. */
export type CandidateOrder =
  { readonly bays: NonEmpty<string>; readonly technicians: NonEmpty<string> }
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

**The brand alone does not do it, measured (I-04-3).** A brand on the object leaves
`readonly string[]` untouched, so `noUncheckedIndexedAccess` still yields `string | undefined` and
`nextCandidate` is **exit 2, twice `TS2322`** — the step-1 text claimed to remove the last
`as string` and would have *relocated* it into `candidates.ts`. The tuple carrier is **exit 0 with no
index assertion anywhere**; its three `as CandidateOrder` minting casts are the house pattern
(`interval.ts`, `duration.ts`) and are not matched by `contended-resource-cast`.

Fisher–Yates over a copy of each list from one `mulberry32` stream, written in-module because the
domain may import nothing. `prune` takes the **unbranded** union: a `ContendedResource` is an
intersection and is assignable to it, so the use case passes the minted value straight in with no
cast, and nothing branded crosses back out.

**The seed is injected, never global**: `BookDeps` gains `seed: () => number`, bound in `main.ts` to
the **global** `crypto.getRandomValues(new Uint32Array(1))[0] ?? 0` — not `node:crypto`'s
`randomInt`, because `main.ts:50` already records why `newId` takes the global: it gives
`src/application` no import and leaves `no-dev-dep-in-src` and the layering rules untouched
(DA-02-1, I-04-8). It is overridable by `BOOKING_SEED` — **ADR-0021**, §5.

## 4. The rest of the delta

- `src/platform/config.ts` — `attemptCap`, from `ATTEMPT_CAP`, default **16**, an integer in
  `1…1000`. ADR-0009 put it here. It reaches the use case as `BookDeps.attemptCap`. **The lower
  bound of 1 is load-bearing, not taste** (I-04-7): the arm-placed check is reached only after a
  classification, so there is no refusal exit before the first attempt and `ATTEMPT_CAP=0` would
  behave silently as 1. `config.ts` records that, or someone relaxes it.
- `src/platform/config.ts` — `bookingSeed?: number` from `BOOKING_SEED`, **unset by default and
  unset in production**, with one startup `warn` when it is set (ADR-0021).
- `bookAppointment.ts` — one `orderCandidates` call **replacing** the two empty-candidate guards,
  which move into its `null` branch (I-04-4: after the guards the branch is unreachable, `tsc`
  demands it, no test can cover it and Stryker gets a free survivor; folded in, every branch is
  reachable, and the split is better — the domain owns *is there a candidate*, the application owns
  *whose fault is it*). `nextCandidate` per iteration; the cap and exhaustion checks of §2; a
  `for` header carrying **Bound-2's additive bound**, with a `throw` at its unreachable tail
  (I-04-2, ADR-0020 row F); and **one new log line,
  `booking.refused`**, at both exits, carrying `exit`, `resource`, `attempts` and `seed`. That is
  AC-4's *"visible in telemetry rather than silent"* leg until slice 09's
  `booking_conflicts_total{outcome}`, and it follows I-02-6: an outside-in test may read the
  response, the database and stdout, and the first two carry neither field.
- The seed on that line is what makes a reported failure re-runnable (§5, AC-5).

## 5. Rulings — all provisional, all listed at the gate

**Step 2 adjudication.** Nine objections, every one measured; four of my step-1 sentences were false
and one of my rulings was wrong. **No (c), so no loopback consumed** — nothing here makes the work
incorrect or unsafe, which is what step 2 is for.

| | Verdict | Ruling |
|---|---|---|
| **I-04-3** carrier does not compile | **AGREE** | **(a)** — the intent (non-empty by construction, no index assertion) is right; the carrier stated for it was wrong. `readonly [string, ...string[]]`, §3 |
| **I-04-4** unreachable branch | **AGREE**, finding and remedy | **(a)** — guards fold into the `null` branch, §4 |
| **I-04-2** the option table omits a shape | **AGREE** on the finding, **narrower remedy** | **(a)** — see below |
| **I-04-8** the seed's import | **AGREE** | **(a)** — the global, per `main.ts:50` |
| **T-04-1** the seed is a label, not a handle | **AGREE** | **(a)** + **ADR-0021** |
| **T-04-2** assert AC-4 at the shipped cap | **AGREE**, my ruling reversed | **(a)** — see below |
| **T-04-3** D-04-1 cannot join AC-1's set | **AGREE** | **(a)** — the reason is recorded, not the fixture |
| **T-04-4** the `25P02` absence is vacuous alone | **AGREE** | **(a)** — it lives inside AC-1's (20,8) case |
| **I-04-5** D-04-1 sharper, and mis-routed | **AGREE** on both halves | **(b)** — §6, and the slice-08 wording in §8 |

- **AC-5 is satisfied at the level where a seed can decide anything.** *"The same interleaving of
  candidate choices results"* is not achievable for a concurrent scenario: the interleaving is the
  OS scheduler's and PostgreSQL's, and this repository has already measured identical configurations
  producing 292, 241 and 2 100 deadlocks (ADR-0018's retry table). Asserting it would produce the
  flake AC-5 exists to prevent. So AC-5 is read as: **ordering is a deterministic pure function of
  (bays, technicians, seed)**, a property test.
- **T-04-1 — and the recording alone does not deliver the other half.** A logged seed says which
  order was taken and cannot take it again. The structural measurement behind that is the one to
  keep: both exclusion constraints plus the dealership FKs mean **blocking K technicians requires K
  bays at the same dealership**, so with any free bay and any free technician the pair of them is a
  reachable first draw and **no static fixture can force a technician-side first conflict**. Only the
  bay side is deterministic (block every bay). Without seed control AC-2, AC-3's technician half and
  D-04-1's leg are all coin flips. `BOOKING_SEED` is granted under **ADR-0021**, with the cost taken
  in ADR-0009's own terms. **It must not be set in QS-3's concurrency cases**: a constant seed gives
  every racer the same order, which is Order-A, the degeneracy the shuffle exists to remove.
- **T-04-2 — my third step-1 ruling is reversed, its premise measured wrong.** The default-cap
  fixture is ~52 inserts and **one** request, cheaper than the (20,8) case already in the suite, and
  needs no concurrency. Reproduced: **16 bays all blocked → 16 attempts, `exhausted`** (both
  conditions true, so the tie-break is exercised); **17 bays all blocked → 16 attempts, `capped`**.
  One fixture pair pins three things — the cap is exactly 16, the two exits are distinguishable, and
  ADR-0020's tie resolves to `exhausted` — none of which `ATTEMPT_CAP=3` pins. **AC-4's red runs at
  the shipped default.** `ATTEMPT_CAP` stays configurable because ADR-0009 put it there, and
  I-04-7's unconditional `loadConfig` unit assertion on the default stays too: the loop test guards
  the behaviour, the config test guards the constant, and they fail to different regressions.
- **I-04-2 — the finding is accepted and a different remedy is taken.** ADR-0020's *"Bad"* named one
  direction only: move the cap out of the arm and `tsc` objects; add a retried `PgOutcome` variant
  and the loop is **unbounded** — no `tsc` error, no test, a hang. The offered shape (a `for` header
  bounded by the **cap**, `throw` at the tail) is exit 0, and I am not taking it as offered, because
  it states one number twice and two encodings of one number drift. The header carries **Bound-2's**
  bound instead — `bays.length + technicians.length`, captured before the loop — so the structural
  liveness bound and the latency cap are two different numbers doing two different jobs, and the tail
  stays unreachable because the arm's exhaustion check fires by `|B| + |T| − 1`. Measured on the
  fully composed shape (all three type fixes together): **exit 0, no `as string`, no
  `as ContendedResource`**. ADR-0020 gains the row and loses the one-directional *"Bad"*.
- **AC-1's red must keep its evidence shape.** The test-engineer simulated the (N,M) set at 20 000
  runs a cell against a no-retry build — 0 / 80.3 / 98.7 / 96.0 % failure — and reported two things
  that must survive any amendment: **(2,1) is a control, not a discriminator** (0 % against a broken
  build; every build in this repository passes it), and **a per-dealership global mutex — ADR-0004's
  rejected Option D — confirms exactly `min(N, M)` in all four cells with zero retries and passes
  AC-1 outright.** So the confirmations must be accompanied by `booking.conflict` lines naming
  `no_bay_overlap` / `no_technician_overlap`: the count is evidence about the **database** refusing,
  not about application code that serialised. Recorded here so it is not lost.
- **T-04-4** — the `25P02` absence is not its own case. It lives inside AC-1's (20,8), gated on a
  positive witness: pigeonhole guarantees ≥ 12 racers conflict, so `max(attempt) >= 2` over the
  `booking.conflict` lines is certain; then zero `500`s; then the absence. A transaction-wrapped loop
  fails the first two before the absence is reached, which makes it a confirmation rather than the
  evidence. Note `25P02` surfaces as `500 /problems/internal`, never a `409`.
- **OQ-04-1 is half-closed**, by the test-engineer's own offer: a dealership with one bay and one
  technician, both blocked, refused twice, yields two logged seeds, and asserting they differ tests
  the *source* in the running process at P(false failure) = 2⁻³². It closes degeneracy; it does not
  close uniformity, and the design does not claim otherwise.
- **The availability filter still stays out of this slice**, but not for the reason I gave. §5's
  step-1 argument was *"no acceptance criterion needs it"*, which I-04-5 falsified. The argument that
  survives is the implementer's and it is better: **the pre-filter is only trustworthy because of
  QS-8** — *every pair availability reports free is accepted by an `INSERT`* — and QS-8 is slice 08's
  property test. Shipping the filter before the property that validates it is backwards. That places
  it **after** slice 08, which is where the routing in §8 sends it.

## 6. Findings, assumptions and open questions

- **D-04-1**, restated after I-04-5 and T-04-3, because step 1 understated it. **ADR-0009 sized the
  cap below the bound its own Bound-2 paragraph computed** — *"worst case |bays| + |technicians| − 1
  attempts: roughly 40"*, then *"a hard cap of 16"*. At §1.1 scale (single-digit bays, tens of
  technicians) `|B| + |T| − 1 > 16` **with or without the availability filter**; the filter changes
  how *often* the cap is reached, not whether 16 clears the bound. Three consequences, each a number
  already in the repository:
  - **Slice 09 AC-13 is the sibling.** Its fixture is 5 bays, 20 technicians, 500 appointments —
    additive bound **24** — and it asserts an uncontended booking issues **exactly one `INSERT`**,
    which an unfiltered shuffled list over 500 appointments cannot promise.
  - **QS-3's largest fixture reaches at most 15 attempts against a cap of 16.** The design is right
    that QS-3 cannot see D-04-1, and **the margin is one attempt** — the number that moves if anyone
    edits the fixture.
  - **The cap is not a termination guard**; Bound-2 already bounds the loop. It is a *latency* guard,
    and QS-14 budgets only the **uncontended** booking, so nothing in the suite measures the thing
    the cap protects.
  Two remedies, and **neither is chosen here**: land the advisory pre-filter after slice 08's QS-8,
  or raise `ATTEMPT_CAP` above the additive bound. The cap's value is ADR-0009's and human-decided,
  so choosing is flagged at the gate rather than ruled mid-slice. Its **spurious-refusal leg is not
  deterministically assertable** until one of those lands or `BOOKING_SEED` forces the free resource
  past position 16 (T-04-3: 0.35 % to 46.7 % per fixture, every one a coin flip) — so it does not
  join AC-1's set. T-04-2's 17-bay fixture is its standing partial evidence, and that fixture already
  falsifies ADR-0009's *"a non-zero cap-exceeded counter in production means the cap is wrong"*: the
  counter is non-zero **by design** today, before slice 08.
- **D-04-2** — ADR-0020 is a rule about **where a `return` goes**, and `tsc` objects only once
  someone both moves the cap and refuses from outside the arm. The test-engineer adds the matching
  half from its own side: **an outside-in test cannot distinguish "capped from inside the arm" from
  "capped from outside it with a cast"**, because AC-4 requires both to render identically. A cost of
  the decision, not an argument against it. §11.
- **F-04-3 — discharged.** §11 was added to this slice's `arc42:` field after step 1, so the design's
  claim that it is undeclared is stale; D-04-1 and D-04-2 land in §11 in this pass.
- **D-02-1** — defined here, and this is the second correction below: it is the id §11 must use for
  *"ADR-0016's argument is weaker after ADR-0018 than before it"*. `docs:refs` requires a
  design-local id to be **defined** in a slice design, arc42 may not mint its own (slice 02's step-7
  report records that), and slice 02's design is closed at its merged budget — so it lands in the
  design that renames it.
- **A-04-1** — F-02-9 is unaffected, and the implementer checked it against the code and found the
  design's single reason understated. Three hold independently: ADR-0018's disjoint class key spaces;
  `lockResources` is **one literal `SELECT` over `unnest`**, so whatever order PostgreSQL evaluates
  it in is the *same* order at every attempt, and a cycle needs two transactions taking the same two
  objects in *opposite* orders — which identical statement text rules out without relying on
  `unnest` row order; and `domain-is-pure` (`to: {}`, no allowlist) means `candidates.ts` cannot
  reach the lock classes at all. Slice 04 adds no write path to `appointment`.
- **I-04-9, noticed rather than objected.** `candidateRepository.ts` says the availability filter
  arrives *"in slice 04"* and that a request may be refused while an untried bay is free *"until
  slice 04"*. Both become false at merge; the file is the implementer's and it corrects them,
  pointing at D-04-1's real destination.
- **F-04-1** — `docs:adr-check` reports ADR-0020 and ADR-0021 *unpinned*, and says to add each entry
  by hand rather than `--rebaseline`. Third slice running (F-02-10); `tools/` is not the architect's.
- **F-04-2** — **`docs:budget:check --ratchet` fails a correctly-sized new document, and the fix it
  prescribes would break the in-flight budget.** `r.slack = (r.was ?? r.budget) - r.words` measures
  *distance under budget*, not a reduction. Measured on a fixture: a 101-word `slices/07-design.md`
  is flagged with an empty baseline **and** with a baseline entry of 3 000, so it is not a missing-pin
  case. Rebaselining would pin a design at its step-1 size and leave steps 2–5 unable to amend it,
  which is exactly what the `sliceDesign` / `sliceDesignMerged` split exists to allow — a guard
  pushing *towards* padding. It stopped firing here only because this design grew past the 100-word
  slack threshold during the step-2 pass, which is the tell. `tools/` is not the architect's.
- **OQ-04-1** — the seed is per **request**. Two requests arriving in the same millisecond get
  independent seeds, which is the point; but nothing asserts the generator is not degenerate in a
  deployment. ADR-0009 named it ("the seed must actually vary") and a property over many seeds is
  the cheapest available answer — it tests the *ordering*, not the *source*. Left open.

## 7. arc42 edits

**§6.2** — step 5 loses *"empty → 409, no attempt made"* (ADR-0016 forbids it; §8.6 answers it two
other ways) and the guards move into step 6's `null` branch; step 7's header replaces the stale
*"OUTSIDE any transaction"* with ADR-0018's one-transaction-per-attempt and carries Bound-2's
structural bound; the box's refusal rows become `exit`. **§5.2** — `candidates.ts`'s row takes the
tuple carrier, `BookOutcome` gains `exit`, `src/platform` names `ATTEMPT_CAP` and `BOOKING_SEED`.
**§11** — D-04-1 and D-04-2.

## 8. Routing — the slice-08 edit this design cannot make

**I-04-5(b) is right and it fails my own ADR-0019.** `docs/slices/08-availability-query.md` excludes,
under *Out of scope*, *"using the query to drive allocation … making availability authoritative would
reintroduce check-then-act"* — which covers exactly the work D-04-1 is deferred into, for a stated
ADR-level reason, in a slice marked `gate: light`. **A receiving slice whose own file forbids the
work does not make it cheaper or stronger; it makes the deferral permanent.** The exclusion is
correct about *authoritative allocation* and wrong as a bar on *an advisory pre-filter*, and those
are different things. Slice files are not mine, so the exact wording, to replace that bullet:

> - Using the query as an **authoritative** allocator — deciding from the read whether a booking may
>   proceed. A-5 fixed booking as "can I have 09:00?", not "find me something Tuesday", and making
>   availability authoritative would reintroduce check-then-act. **An advisory pre-filter on the
>   booking path's candidate list is in scope and is not that**: it changes only which candidate is
>   attempted first, every attempt is still adjudicated by the `INSERT`, a refusal still requires a
>   verdict (ADR-0016), and it is only trustworthy because AC-1's QS-8 property holds. It closes
>   **D-04-1** (slice 04) and unblocks slice 09's AC-13.

## 9. Two corrections, outside this slice's declaration

Found at slice 02's step 7, **committed separately** because they are not slice 04's work. **§8.3**
said ADR-0015 was *"Accepted, and not yet written"* — it shipped in slice 02. **§11** labelled the
weakened-ADR-0016 argument `R-02-2`, which is the reviewer's lock-drop-control finding that ADR-0019
adjudicates; it becomes **D-02-1**, defined here because arc42 may not mint its own ids.
