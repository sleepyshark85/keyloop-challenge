# Slice 19 — design · [`19-attempt-cap-sized-against-occupancy.md`](19-attempt-cap-sized-against-occupancy.md) · arc42 §4.1, §5.2, §6.2, §8.4, §10, §11.1 · [ADR-0040](../adr/0040-order-candidates-free-first-from-one-advisory-read.md) · step 1

## 1 · What changes

`bookAppointment` reads occupancy **once**, before it orders, and passes what it read to
`orderCandidates`. The ordering **partitions** each candidate list into free-then-busy and shuffles
**within** each group from the seed it already draws. Membership does not change; the cap does not
change; the insert still adjudicates.

That is the whole mechanism. Everything else in this slice is the record: an ADR superseding
[ADR-0009](../adr/0009-candidate-ordering-and-attempt-cap.md), two quality scenarios for a dimension
§10 has never varied, and the correction of a sentence in
[§4.1](../arc42/04-solution-strategy.md) that has contradicted
[§11 R-4](../arc42/11-risks-technical-debt.md) since slice 04 inside the document `CLAUDE.md` §4 calls
the single source of truth.

The remedy's shape is not new and I will not present it as new. It was fixed at slice 08 step 1 in
ADR-0033 — *"the advisory read orders candidates; it never removes them"* — retired in the
2026-09-07 cull with its decision rehomed to
[`08-design.md`](08-design.md), and **declined** at slice 09 step 5 on a stated criterion:
*"free-first was warranted only as how AC-13 is met, and AC-13 has since been measured met without
it. Reopen only on a measurement."* `H-19-1` is that measurement. The decline was correct on what it
had; what it lacked was a number for the residual.

## 2 · Building blocks touched

| Block | Change |
|---|---|
| `src/domain/candidates.ts` | `orderCandidates` gains a `busy` parameter (§3) and the free-first partition (§4). `prune`, `nextCandidate`, `mulberry32`, `shuffle`, `CandidateOrder` — **unedited** |
| `src/application/bookAppointment.ts` | One `busyResources` call between step 5 and step 6, over the **occupancy** interval already derived; its result passed straight through |
| `src/application/attemptLoop.ts` | The `'incumbent'` arm of `CandidateStrategy` gains `readonly busy: OccupancySnapshot`, threaded into its lazy `orderCandidates` call. The `'shuffled'` arm is **unchanged** — booking hands the loop an order already built |
| `src/application/rescheduleAppointment.ts` | **One line**: `busy: EMPTY_OCCUPANCY` (ruling 5) |
| `src/persistence/appointmentRepository.ts` | **Not edited.** `busyResources` is reused verbatim — the function `queryAvailability` already calls. A second reader is the mechanism, as at slice 16 |
| `src/persistence/candidateRepository.ts` | **Not edited**, and that is an assertion: it still cannot see `appointment`, so `ambiguity-containment`'s `appointment-table-access` marker keeps its one-file list |
| `docs/api/openapi.json`, `harness/` | **Not touched.** No request or response member moves |

## 3 · Interfaces

The signature, verbatim:

```ts
/** What the ordering is told is taken. Two lists of ids and nothing else — no freshness marker,
 *  no timestamp, nothing a later reader could mistake for a hold. */
export interface OccupancySnapshot {
  readonly bays: readonly string[];
  readonly technicians: readonly string[];
}

/** The ordering with nothing known to be busy — reschedule's argument (ruling 5). */
export const EMPTY_OCCUPANCY: OccupancySnapshot = { bays: [], technicians: [] };

export function orderCandidates(
  bays: readonly string[],
  technicians: readonly string[],
  busy: OccupancySnapshot,
  seed: number,
): CandidateOrder | null;
```

**`src/domain` imports nothing** — `.dependency-cruiser.js`'s `domain-is-pure` is `to: {}`, absolute,
with no allowlist. So `busy` **arrives as a parameter** and the domain declares its own shape.
`OccupancySnapshot` and `persistence.BusyResources` are structurally identical and structurally
assignable, so `bookAppointment` passes the repository's return value straight in with no adapter and
no cast. The duplication is four words of type and it is the rule doing its job: a module that cannot
import a database client cannot consult one, and ordering is exactly the decision that must not learn
what is booked by any route but its argument list. Moving `BusyResources` into `src/domain` to save
the four words would put a persistence-returned type in the pure core and is refused.

`seed` stays **last**. The call reads *what, what, what is taken, how* — and the seed is still the
parameter ADR-0009's Order-C exists for.

**Threading through the loop.** Booking never reaches `orderCandidates` through `runAttemptLoop`: it
builds the order itself and hands it over as `{ kind: 'shuffled', seed, order }`, so the `'shuffled'`
arm needs nothing. Reschedule does — ADR-0027 defers its shuffle until the incumbent pair itself
conflicts, so the call is inside the loop's `23P01` arm. That arm gains `strategy.busy`, supplied by
`rescheduleAppointment` (ruling 5), never defaulted inside the loop.

**The non-empty carrier is unchanged.** `CandidateOrder` is
`{ bays: readonly [string, ...string[]]; technicians: … }` behind a brand, and `orderCandidates` and
`prune` remain its **only two minting sites**. Both still return `null` rather than an empty list, so
`null` still *means* a list emptied and the application never asks an emptiness question twice. `busy`
cannot reach that exit — see P2 below, and AC-3b, which is the executable form of this paragraph.

## 4 · The algorithm — precisely, because the de-synchronisation is the trap

```ts
function freeFirst(ids: readonly string[], busy: readonly string[], next: () => number): string[] {
  const taken = new Set(busy);
  const free = ids.filter((id) => !taken.has(id));
  const rest = ids.filter((id) => taken.has(id));
  return [...shuffle(free, next), ...shuffle(rest, next)];   // ONE stream, free drawn first
}

export function orderCandidates(bays, technicians, busy, seed) {
  const next = mulberry32(seed);                    // ONE generator per call, exactly as today
  const [bayHead, ...bayTail] = freeFirst(bays, busy.bays, next);
  const [techHead, ...techTail] = freeFirst(technicians, busy.technicians, next);
  if (bayHead === undefined || techHead === undefined) return null;
  // …unchanged from here: two tuples, one brand assertion.
}
```

Five properties. An implementation that breaks any of them is wrong even if the acceptance test is
green, and four of the five have a criterion pointing at them.

- **P1 · One stream, four draws, in one fixed order.** `mulberry32(seed)` is constructed **once per
  call**, and all four `shuffle` invocations take that same `next`: bays-free, bays-rest,
  technicians-free, technicians-rest. Not a generator per group, not `seed + 1` for the second — that
  is ADR-0009's *"both lists are shuffled from ONE stream so the seed decides the whole order and not
  merely half of it"*, now with four groups instead of two.
- **P2 · The emptiness test is over the CONCATENATION, never per group.** A group may legitimately be
  empty — every bay busy is the ordinary state this slice exists for. `if (freeHead === undefined)
  return null` would refuse a fully-occupied dealership through the `500`/`422` exit: this slice's own
  defect, inverted and worse. The destructuring stays where it is, on the concatenated list, and
  **AC-3b** is what catches a later edit here.
- **P3 · Draw-count invariance.** `shuffle` is the selection form: it consumes exactly one draw per
  element, so `|free| + |rest| = |ids|` draws whatever the partition. The stream position entering the
  technician list is the position it is today, for every input.
- **P4 · Identity at an empty snapshot.** With `busy = EMPTY_OCCUPANCY`, `free` is `[...ids]` in
  input order, `rest` is `[]`, and `shuffle([], next)` consumes nothing — so `freeFirst` calls
  `shuffle` on the same list with the same stream and returns **element-for-element today's
  permutation**. This is not an approximation. It is what makes ruling 5 free and **AC-7** true by
  construction rather than by luck.
- **P5 · `prune` is not edited and must not learn the snapshot.** `filter` preserves order, so the
  free prefix survives pruning: drop a free bay and the remaining free bays are still ahead of the
  busy ones. A prune that re-partitioned would need a snapshot the loop deliberately does not carry,
  and would break ADR-0021's recorded-seed replay a second way.

**Why this is not check-then-act (§2.1), stated in full because a read appears on the booking path
for the first time.** Three independent legs, and the invariant needs only the third: (i) membership
is invariant — `orderCandidates(b, t, busy, s)` returns an **equal multiset** to
`orderCandidates(b, t, EMPTY_OCCUPANCY, s)`, so `busy` permutes and never removes; (ii) the `null`
exit is therefore unreachable from `busy` and keeps its two existing meanings; (iii) **the insert is
still the only adjudicator** — a snapshot that is stale or simply wrong costs attempts and cannot
cost a refusal (**AC-3a**). ADR-0033's refused alternative is the reason this is stated rather than
assumed: a read that *removes* candidates can empty the list, which §6.2 routes to `500` or `422` and
never `409` — so it must either answer `500` for a merely full dealership or mint a `409` from a
read, which ADR-0016 forbids. That is §2.1's forbidden shape with the `if` moved into the query
planner.

And **AC-3b earns its place on a point §2.1 cannot cover**: with ADR-0018's per-resource advisory
lock held across the insert, a reintroduced check-then-act would be *correct* rather than merely
harmless, so nothing in the repository would fail. A property test over the multiset is the only
guard that would.

## 5 · Data-model delta

**None.** No migration, no column, no index. The two exclusion constraints, the advisory locks,
Bound-2's prune rule and ADR-0004's retry policy are all untouched: the finding is about which
candidate is tried **first**.

## 6 · Rulings — the verdicts

1. **`H-19-1`, DCR outcome (b) — deferred improvement.** The finding is **agreed and executed**: 35 of
   200 single-threaded bookings refused `409` with one bay and one technician free. ADR-0009's *"the
   only driver Bound-2 leaves"* is false. But the merged work is **correct under the ADRs as
   accepted**, so (c) was not reachable. To rule (c) §6 obliges me to name an acceptance criterion,
   `QS-*` or §2 invariant that would fail; I searched QS-1, QS-2, QS-3, QS-8, QS-14, §2.1 and the
   `candidate-retry` AC-4 test and could name none. QS-3's four tuples all sit at **zero occupancy**
   and vary only *N*. QS-14 passes because its fixture reserves slots its filler leaves alone.
   `tests/acceptance/candidate-retry.test.ts:304-305` seeds `{bays: 17, technicians: 17}` and then
   blocks **all 17 of each**, so that refusal is honest in outcome and merely mislabelled in `exit`.
   And `docs/arc42/11-risks-technical-debt.md:172` has carried R-4 verbatim since slice 04, so the
   code implements the documented behaviour. **I declined to reach for §2.1 to manufacture a name.**
   Recorded rather than smoothed: were "arc42 asserts the opposite of what the system does" admissible
   under (c), this would be (c). It is not, and the **priority** carries the weight instead of the
   letter — which is ruling 6.
2. **Supersede, not amend.** ADR-0009 is `accepted` and its decision is immutable (§4). ADR-0040
   supersedes it; ADR-0009 receives `superseded_by: "0040"` in **frontmatter only**, its decision and
   its prose untouched. **Carried forward unchanged:** Order-C (a seeded shuffle, injected, pure),
   Bound-2 (prune the whole resource the constraint names), the cap's **value of 16**, both refusal
   exits and their labels, and the cap tested inside the `23P01` arm rather than as the loop's bound.
   **Changed:** the order *within* Order-C's shuffle, and the claim that contention depth is the only
   driver.
3. **The cap stays 16.** Raising it is a **genuine option and it works**: at or above
   `|bays| + |technicians|` the spurious refusal is **structurally unreachable**, because Bound-2
   guarantees a list empties by then. It is rejected on **latency**, not dismissed — the cap is a
   latency guard and Bound-2 already bounds termination, so a cap of 40 makes a worst-case refusal
   cost 40 attempts at three round trips each (two `pg_advisory_xact_lock`, one `INSERT`), and the
   refusal is the answer the client waits longest for. It remains **one config value** the gate can
   turn, and ADR-0040 records it as rejected-on-latency so a future operator finds the argument rather
   than a silence.
4. **The `capped` signal is restored probabilistically, not structurally.** §11 R-4 says a non-zero
   `capped` is *expected rather than a signal*. After this slice it becomes **unlikely** rather than
   *impossible*: reaching attempt 16 now requires fifteen conflicts among candidates the snapshot
   called free, which needs real contention or a stale snapshot. §11 R-4 must be rewritten to say
   exactly that and **must not claim the counter is now clean**. That is the weaker claim and it is
   the true one.
5. **Reschedule passes an empty busy set — and passes it itself.** A snapshot over the **new**
   interval would be wrong about the requester: ADR-0030 has the move **vacating its own pair**, so
   the row's own bay and technician are reported busy by their own appointment and sorted **last** —
   the two candidates most likely to be free. By P4 the empty snapshot is byte-identical to today's
   ordering, so **AC-7** holds by construction. The value is supplied at
   `rescheduleAppointment`'s call site rather than defaulted inside `attemptLoop`, because a shared
   loop silently supplying an allocation policy for its caller is a place the eventual fix would have
   no address. Booked as debt in §11.1 with a live destination.
6. **Backlog ordering — (d), and provisional until the gate.** Slice 19 starts ahead of slices 17 and
   18, which stay `ready` and are **not** absorbed. 17 is a citation sweep and 18 is collector
   de-duplication: both hygiene on evidence, neither on a request path, neither blocking 19 nor
   blocked by it, while 19 is a **measured user-visible wrong answer** at 90 % occupancy. WIP is 1 and
   nothing was in flight, so it is legal — but ordering the backlog is normally the human's call, so
   this is recorded for the gate to confirm or reverse (`s-19-dcr-1`).
7. **§4.1 is my error, self-reported and owned at step 1.** *"A `409` therefore means the dealership
   was full rather than that the allocator guessed badly"* has sat opposite §11 R-4 since slice 04,
   both inside arc42. It is corrected under **AC-5** whichever remedy ships, and it is the reason AC-5
   exists independently of the ordering change.

## 7 · Quality scenarios

**QS-3** — unchanged and re-run (AC-4's first half). **QS-8** — unchanged, and load-bearing in a way
worth naming: free-first is only trustworthy because `busyResources` excludes `status = 'cancelled'`,
and mechanic 6 (slice 08's `T-08-7`) is what makes QS-8 witness that by construction. A cancelled row
biasing the order away from a genuinely free bay is precisely the defect `I-04-5`'s deferral named.
**QS-14** — re-measured against the **unchanged** fixture with the extra `SELECT` on the booking path
(AC-6). **QS-10, QS-12** — unchanged, and asserted so: no module boundary moves and no marker's file
list grows.

**QS-15 and QS-16 are added to §10 now**, in this slice's only arc42 edit before step 7, so the
test-engineer can cite them at step 3 rather than a slice file. QS-15 is the executed measurement made
reproducible from the repository — the Definition of Done's first extra clause. QS-16 is §8's
falsifier.

## 8 · The live risk — objection 6, in its stronger form

ADR-0004's snapshot is read **once and never refreshed**. Under a burst every racer reads the *same*
snapshot, so free-first makes them **agree** about which group to try first, and after the winners
take the free resources every loser's remaining order still **front-loads exactly what the winners
just took**. Prune only removes what that racer itself collided with, so a loser learns about one
taken resource per attempt it spends.

This is ADR-0009's own rejection of Order-D — *"concurrent requests computing utilisation from the
same snapshot agree — under a burst, Order-A"* — returning in a weakened, binary form. Weakened
because racers still disagree **within** the free group; real because that group shrinks as occupancy
rises, and at *M* = 1 the group is a single element on which all *N* racers agree exactly.

**QS-16 is the falsifier**, and `(8, 8, 4)` — eight racers, eight free of each, all eight required to
confirm — is the tuple most likely to break. **Pre-committed, so it is not renegotiated later: if
QS-16 fails at any tuple, that is a loopback and it is taken** (0 of 2 spent). The two answers already
on the table would be a snapshot refreshed per attempt (ADR-0040's residual, rejected here on the same
latency argument as ruling 3) or reverting to a uniform shuffle above a bounded free prefix. Neither
is designed now, because designing a remedy for a failure that has not happened is how the free-first
bias got proposed three slices early the first time.

## 9 · Proposed arc42 edits — step 7, not now

- **§4.1** — the `409` sentence corrected against §11 R-4; final wording settled against what merged.
- **§5.2** — `candidates.ts`'s description gains the free-first partition. The module list and the
  boundary language do **not** change; listing §5.2 as touched is what would let them.
- **§6.2** — step 5 gains the advisory occupancy read (one round trip, over the **occupancy**
  interval); step 6's signature line gains `busy`; the `null` branch's two answers are unchanged; the
  closing note that `capped` is expected at §1.1 scale is rewritten to ruling 4's wording.
- **§8.4** — whether the ordering read is separately span-instrumented, or rides
  `availability.candidates`; settled at step 4 by AC-6's measurement (`OQ-19-1`).
- **§11.1** — **R-4 rewritten** against the executed figure and ruling 4; new debt rows for the
  reschedule snapshot (ruling 5), for replay now needing the snapshot as well as the seed, and for
  ADR-0040 itself while it is `proposed`.

## 10 · Assumptions and open questions

- **`A-19-1`** — the ordering read uses the **occupancy** interval (`derivation.occupancyStartsAt` /
  `occupancyEndsAt`), which is what the exclusion constraint sees, not the appointment interval the
  response names. `A-4` makes the two identical today; if the buffer ever becomes non-zero this read
  must follow the occupancy one. Same rule, same reason, as slice 16's `T-16-1`.
- **`A-19-2`** — `busyResources` is scoped by dealership and `status <> 'cancelled'`, so a cancelled
  appointment does not make its bay look busy. Free-first depends on that conjunct; §7 says why.
- **`OQ-19-1`** — span instrumentation for the second read (§8.4). Settled at step 4.
- **`OQ-19-2`** — replay. A recorded seed no longer reproduces a run on its own: the permutation now
  depends on the snapshot too. Whether `booking.refused` should carry the snapshot, or the weakened
  guarantee is acceptable, is ADR-0040's residual and is **not** closed by this slice.
