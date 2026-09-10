# Slice 19 — design · [`19-attempt-cap-sized-against-occupancy.md`](19-attempt-cap-sized-against-occupancy.md) · arc42 §4.1, §5.2, §6.2, §8.4, §10, §11.1 · [ADR-0040](../adr/0040-order-candidates-free-first-from-one-advisory-read.md) · step 1

## 1 · What changes

`bookAppointment` reads occupancy **once**, before it orders, and passes what it read to
`orderCandidates`. The ordering **partitions** each candidate list into free-then-busy and shuffles
**within** each group from the seed it already draws. Membership does not change; the cap does not
change; the insert still adjudicates.

That is the whole mechanism. Everything else is record: an ADR superseding
[ADR-0009](../adr/0009-candidate-ordering-and-attempt-cap.md), two quality scenarios for a dimension
§10 has never varied, and the correction of two sentences — [§4.1](../arc42/04-solution-strategy.md)'s
and §6.2's — that have contradicted [§11 R-4](../arc42/11-risks-technical-debt.md) since slice 04,
inside the single source of truth.

The remedy's shape is not new and I will not present it as new: ADR-0040's provenance block carries
the ADR-0033 → slice 09 history and the reopening criterion — *"reopen only on a measurement"* —
that `H-19-1` satisfies.

## 2 · Building blocks touched

| Block | Change |
|---|---|
| `src/domain/candidates.ts` | `orderCandidates` gains a `busy` parameter (§3) and the free-first partition (§4). `prune`, `nextCandidate`, `mulberry32`, `shuffle`, `CandidateOrder` — **unedited** |
| `src/application/bookAppointment.ts` | One `busyResources` call **after `candidateResources` and before the `orderCandidates` call** — once per request, never inside `runAttemptLoop` — over the **occupancy** interval already derived, its result passed straight through. No step *number*: the file and arc42 §6.2 number these differently (`I-19-1`) |
| `src/application/attemptLoop.ts` | The `'incumbent'` arm of `CandidateStrategy` gains `readonly busy: OccupancySnapshot`, threaded into its lazy `orderCandidates` call. The `'shuffled'` arm is **unchanged** — booking hands the loop an order already built |
| `src/application/rescheduleAppointment.ts` | **One line**: `busy: EMPTY_OCCUPANCY` (ruling 5) |
| `src/persistence/appointmentRepository.ts` | **Not edited.** `busyResources` is reused verbatim — the function `queryAvailability` already calls. A second reader is the mechanism, as at slice 16 |
| `src/persistence/candidateRepository.ts` | **Not edited**, and that is an assertion: it still cannot see `appointment`, so `ambiguity-containment`'s `appointment-table-access` marker keeps its one-file list |
| `tests/integration/telemetry-booking.test.ts` | **Added at step 4** by ruling 13. The test-engineer's, under **AC-8** |
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

**`src/domain` imports nothing** — `domain-is-pure` is `to: {}`, absolute — so `busy` **arrives as a
parameter** and the domain declares its own shape. It is structurally assignable to
`persistence.BusyResources`, so no adapter and no cast. Four duplicated words of type, and it is the
rule working: ordering must not learn what is booked by any route but its argument list. Moving
`BusyResources` into `src/domain` is refused. `seed` stays **last**, still Order-C's parameter.

**Threading through the loop.** Booking hands the loop `{ kind: 'shuffled', seed, order }`, so that
arm needs nothing. Reschedule does: ADR-0027 defers its shuffle until the incumbent pair conflicts, so
the call sits in the loop's `23P01` arm, which gains `strategy.busy`, supplied by
`rescheduleAppointment` (ruling 5) and never defaulted inside the loop.

**The non-empty carrier is unchanged.** `orderCandidates` and `prune` remain `CandidateOrder`'s
**only two minting sites** and both still return `null` rather than an empty list, so `null` still
*means* a list emptied. `busy` cannot reach that exit — P2 below, and AC-3b, its executable form.

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

Five properties. An implementation breaking any of them is wrong even if the acceptance test is green.

- **P1 · One stream, four draws, in one fixed order.** `mulberry32(seed)` is constructed **once per
  call** and all four `shuffle` invocations take that same `next`. Not a generator per group, not
  `seed + 1` — ADR-0009's *"one stream, so the seed decides the whole order"*, at four groups.
- **P2 · The emptiness test is over the CONCATENATION, never per group.** A group may legitimately be
  empty — every bay busy is the state this slice exists for. `if (freeHead === undefined) return null`
  would refuse a fully-occupied dealership through the `500`/`422` exit: this slice's own defect,
  inverted and worse. **AC-3b** catches a later edit here.
- **P3 · Draw-count invariance.** `shuffle` consumes one draw per element, so `|free| + |rest| =
  |ids|` whatever the partition, and the stream position entering the technician list is today's.
- **P4 · Identity at an empty snapshot.** With `busy = EMPTY_OCCUPANCY`, `rest` is `[]` and
  `shuffle([], next)` consumes nothing, so `freeFirst` returns **element-for-element today's
  permutation**. Not an approximation: it makes ruling 5 free, **AC-7** true by construction, and
  ruling 15's `absorbed` fixture possible.
- **P5 · `prune` must not learn the snapshot.** `filter` preserves order, so the free prefix survives
  pruning; re-partitioning would need a snapshot the loop deliberately does not carry.

**Why this is not check-then-act (§2.1).** Membership is invariant — `orderCandidates(b, t, busy, s)`
returns an **equal multiset** to `orderCandidates(b, t, EMPTY_OCCUPANCY, s)` — so the `null` exit is
unreachable from `busy` and **the insert is still the only adjudicator**: a stale or wrong snapshot
costs attempts and cannot cost a refusal (**AC-3a**). The removing read that *would* breach §2.1 is
ADR-0040's `Filter-1`, and that row carries the argument. **AC-3b earns its place on a point §2.1
cannot cover**: under ADR-0018's per-resource lock a reintroduced check-then-act would be *correct*
rather than merely harmless, so nothing in the repository would fail. Only a multiset property would.

## 5 · Data-model delta

**None.** No migration, no column, no index. The two exclusion constraints, the advisory locks,
Bound-2's prune rule and ADR-0004's retry policy are all untouched: the finding is about which
candidate is tried **first**.

## 6 · Rulings — the verdicts

1. **`H-19-1`, DCR outcome (b) — deferred improvement.** The finding is **agreed and executed**: 35 of
   200 single-threaded bookings refused `409` with one bay and one technician free, so ADR-0009's
   *"the only driver Bound-2 leaves"* is false. But the merged work is **correct under the ADRs as
   accepted**. To rule (c) §6 obliges me to name a criterion, `QS-*` or §2 invariant that would fail;
   across QS-1, QS-2, QS-3, QS-8, QS-14, §2.1 and `candidate-retry.test.ts:304-305` I could name none
   — QS-3's tuples sit at **zero occupancy**, QS-14's filler leaves its reserved slots alone, that
   test blocks all 17 bays **and** all 17 technicians, and `11-risks-technical-debt.md:172` has
   carried R-4 verbatim since slice 04, so the code implements the documented behaviour. **I declined
   to reach for §2.1 to manufacture a name.** Were "arc42 asserts the opposite of what the system
   does" admissible under (c), this would be (c); it is not, so the **priority** carries the weight.
2. **Supersede, not amend.** ADR-0009's decision is immutable (§4), so ADR-0040 supersedes it and
   ADR-0009 receives `superseded_by: "0040"` in **frontmatter only**. **Carried forward unchanged:**
   Order-C, Bound-2, the cap's **value of 16**, both refusal exits and their labels, and the cap
   tested inside the `23P01` arm. **Changed:** the order *within* Order-C's shuffle, and the claim
   that contention depth is the only driver.
3. **The cap stays 16.** Raising it works **structurally** and is rejected on **latency** rather than
   dismissed — ADR-0040's `Cap-1` row is that argument's one home. It stays **one config value** the
   gate can turn.
4. **The `capped` signal is restored probabilistically, not structurally.** §11 R-4 calls a non-zero
   `capped` *expected rather than a signal*; after this slice it becomes **unlikely** rather than
   *impossible*, reaching attempt 16 requiring fifteen conflicts among candidates the snapshot called
   free. R-4 must be rewritten to say exactly that and **must not claim the counter is now clean**.
5. **Reschedule passes an empty busy set — and passes it itself.** A snapshot over the **new**
   interval would be wrong about the requester: ADR-0030 has the move **vacating its own pair**, so
   the row's own bay and technician are reported busy by their own appointment and sorted **last** —
   the two candidates most likely to be free. By P4 the empty snapshot is byte-identical to today's
   ordering, so **AC-7** holds by construction. It is supplied at `rescheduleAppointment`'s call site
   rather than defaulted inside `attemptLoop`: a shared loop silently choosing its caller's allocation
   policy is a place the eventual fix would have no address. Debt in §11.1 — and, unforeseen at step
   1, the one path that keeps a blind shuffle (ruling 15).
6. **Backlog ordering — (d), provisional until the gate.** Slice 19 starts ahead of 17 and 18, which
   stay `ready` and are **not** absorbed: 17 is a citation sweep, 18 collector de-duplication, both
   hygiene on evidence and neither on a request path, while 19 is a **measured user-visible wrong
   answer** at 90 % occupancy. WIP is 1 and nothing was in flight, so it is legal — but ordering the
   backlog is normally the human's call (`s-19-dcr-1`).
7. **§4.1 is my error, self-reported and owned at step 1.** *"A `409` therefore means the dealership
   was full rather than that the allocator guessed badly"* has sat opposite §11 R-4 since slice 04,
   both inside arc42. **AC-5** corrects it whichever remedy ships — which is why AC-5 exists
   independently of the ordering change.

### Step 2 — the adjudication round

Five objections, one round, ruled before the design was touched: two agreed as raised, one agreed and
taken further, one whose finding is agreed and whose remedy is refused, one deferred.

8. **`I-19-1` — (a), agreed.** `bookAppointment.ts:252` numbers `orderCandidates` step 5; arc42 §6.2
   numbers it step 6. Each is right in its own document, so §2's row cites the **calls** and no
   number.
9. **`O-19-1` — (a), agreed.** §6.2's opening restates §4.1's claim and the measurement falsifies it
   identically; correcting one and not the other would leave arc42 contradicting itself after step 7,
   ruling 7's defect reproduced. AC-5 names both; §6.2 is already declared touched, so no scope moves.
   **The sweep is complete**: `04-solution-strategy.md:65` and `06-runtime-view.md:49-50` are the only
   instances in arc42.
10. **`T-19-1` — finding AGREED, seam REFUSED, AC-3a reworded rather than re-sourced.** The
    measurement is right: this has no synchronisation point at all, so black-box staleness is
    probabilistic — QS-16, not a fixture. But it reaches further than sourcing. **AC-3a as worded is
    false**: *"costs attempts and never a refusal"* is true of the mechanism, not of the system,
    because an adversarial snapshot can spend all sixteen attempts while capacity exists — R-4's
    residual, which ruling 4 reduces and does not remove. A seam would buy a fixture whose green
    depends on its own size, passing at `2M − 1 < 16` and failing above it on a guarantee never given;
    and injecting `busy` *replaces* the read, so the one test that overrides the snapshot never
    exercises `A-19-1`'s wiring — already guarded, a read over the wrong window returning nothing busy
    and **AC-1 falling back toward 165/200 while AC-2's p95 blows out**. Only the buffer distinction
    escapes that, and `A-4` makes it unobservable: slice 16's `T-16-1` again. I decline to name
    **§2.2**, the nearest rule — the substituted read is advisory and the adjudicating `INSERT` stays
    real. **Provenance:** the seam came from the role that had just read the composition root (ruling
    12); it carries no weight because the remedy fails on its merits, but had I accepted it the gate
    could fairly have asked whether it was derivable without that read.
11. **`T-19-2` — AGREED, additively.** `(20, 8, 4)` joins, `(8, 8, 4)` stays. My §8 argument is
    free-group size **combined with** contention, and the set varied one at a time: `M = 8` only at
    `N = 8`, `N = 20` only at `M ≤ 4`. Eight free pairs exist at the new tuple, so exactly 8 confirm
    and 12 refuse honestly.
12. **`T-19-3` — (d), provisional. No taint; nothing downstream is re-authored.** The read-only `grep`
    of `src/main.ts` and `src/platform/config.ts` was a lapse and was **materially void**:
    `tests/support/service.ts` already carries `BOOKING_SEED`'s name, ADR, unset-versus-set semantics
    and env wiring, beside `DB_POOL_MAX` and the `OTEL_*` pair — the whole composition-root env
    surface, inside the role's own directory. AC-2's measured red stands; step 3 is not re-run. **The
    disclosure is the part worth keeping**: unprompted, and what made ruling 10's provenance question
    answerable. Second instance of the class (`T-15-1`, Gate E, no consequence). Whether
    `guard-paths.mjs` grows a Bash read branch is the human's call; two instances is a pattern.

### Step 4 — `I-19-2`, the fixture the mechanism invalidated

13. **`I-19-2` — (a), clarification. The design was right and its scope was short.** Free-first is
    correct and QS-15/QS-16 measured it so; what broke is a **fixture**.
    `tests/integration/telemetry-booking.test.ts` manufactures a retry-then-succeed booking by
    occupying one of two bays and relying on ADR-0009's blind shuffle to draw the occupied bay first
    at `BOOKING_SEED = 7`. Free-first draws the **free** bay, so the booking confirms on attempt 1 and
    three of that file's fourteen assertions go red. Its own docblock predicted this —
    *"it would stop transferring only if candidate ordering itself changed"* — so it **detected the
    intended change**, which is a fixture working. **(c) is nameable and I decline it:** QS-13's
    *Given* is "a booking that retries once then succeeds", so a §10 scenario is literally red, and
    ruling 1's refusal to manufacture a name obliges me not to suppress one that exists. But (c)'s
    remedy is to loop back to step 1 and supersede the ADR at fault, and **none is at fault** — what
    was overtaken is QS-13's *Given*. So **(a): resume at step 3 for one file, no loopback spent (0 of
    2 stand).** **My omission, owned:** ADR-0040's consequences did not name the alignment result and
    §2's table did not declare the fixture; either would have made this step 1's.
14. **The remedy is the test-engineer's.** §5 makes `tests/integration/` shared and assigns the
    test-engineer the rows asserting a **database** invariant; this file asserts a **process** one, so
    the letter leaves it open. The rationale does not: it is outside-in evidence of what *done* means
    for telemetry, the test-engineer authored it, and the implementer has now written the free-first
    code. A role rewriting the criterion its own diff must meet is the boundary §5 exists for — and
    the implementer raised rather than edited, §5 followed exactly.
15. **AC-8 — QS-13's claims are re-sourced, not weakened.** The **alignment** this slice creates is
    permanent: `busyResources` shares the exclusion constraint's range predicate, dealership scope and
    `status <> 'cancelled'` filter, and `A-4` makes the two intervals identical, so whenever a free
    bay and a free technician both exist free-first heads both lists with them and attempt 1 succeeds
    — **no single-threaded interleaving yields a conflict while capacity remains.** That is the
    mechanism working (a snapshot disagreeing with its adjudicator would be the defect), and its cost
    is that a retry waterfall now needs a **refusal** or **real concurrency**. Rewritten
    [QS-13](../arc42/10-quality-requirements.md) carries the three re-sourced claims and **AC-8** is
    their acceptance form. Its third leg — `booking_conflicts_total{outcome=absorbed}` — is **ruled in
    rather than traded away**: without it a §10 metric claim drops silently to
    `tests/unit/application/attemptLoop.test.ts:396`, evidence of the counting rule and not of the
    export path. What makes it reachable is ruling 5 — reschedule keeps `EMPTY_OCCUPANCY`, so it keeps
    the blind shuffle. **Two traps, named so they are not rediscovered:** `I-09-2`'s technician
    coin-flip, which slice 09 solved by de-qualifying the blocker, and reschedule's **lazy** seed
    draw — the fixture must make the **incumbent pair itself** conflict before any shuffle happens.
    **If that leg proves unbuildable inside step 3 it is a DCR back to me**, and the fallback is a
    §11.1 debt row alone. It is not to be dropped silently.
16. **`OQ-19-1` — settled, no dedicated span; the implementer's reasoning confirmed on all three
    legs.** `busyResources` already rides unspanned on `GET /availability`; the only place to add one
    is `appointmentRepository.ts`, which §2 marks not-edited; and **AC-6** measured 18.37 ms p95
    against a 100 ms budget, so no operational case exists. §8.4 records the choice at step 7.

## 7 · Quality scenarios

**QS-3** — unchanged, re-run (AC-4's first half). **QS-8** — unchanged and load-bearing: its mechanic 6
(slice 08's `T-08-7`) witnesses `A-19-2` by construction. **QS-14** — re-measured against the
**unchanged** fixture (AC-6). **QS-10, QS-12** — unchanged, and asserted so.

**QS-15 and QS-16 were added to §10 at step 1** so the test-engineer cites §10, not a slice file.
**QS-13 is rewritten at step 4** (ruling 15) — the last arc42 edit before step 7.

## 8 · The live risk — pre-committed at step 1, measured at step 4

ADR-0004's snapshot is read **once and never refreshed**, so under a burst every racer reads the
*same* snapshot, **agrees** which group to try first, and front-loads exactly what the winners just
took — ADR-0009's rejection of Order-D at binary granularity, weakened only because racers still
disagree *within* the free group, which shrinks as occupancy rises. QS-16 was pre-committed as its
falsifier (ruling 11): *"if QS-16 fails at any tuple, that is a loopback and it is taken."*

**It did not fail.** Step 4 measured **exactly `min(N, M)` at all four** — `(20,1,11)→1`,
`(20,4,8)→4`, `(8,8,4)→8`, `(20,8,4)→8` — including `(20, 8, 4)`, whose `2M − 1 = 15` sits one below
the cap and where a spurious refusal was most likely to be **produced**. The residual is
**unfalsified, not absent**: `Refresh-1` and a bounded free prefix stay on the table, **undesigned**.

## 9 · Proposed arc42 edits — step 7, not now

- **§4.1** — the `409` sentence corrected against §11 R-4, wording settled against what merged.
- **§5.2** — `candidates.ts` gains the free-first partition. The module list and boundary language do
  **not** change.
- **§6.2** — its **opening sentence corrected with §4.1's** (ruling 9); the `candidateResources` step
  gains the advisory occupancy read; the `orderCandidates` signature line gains `busy`; the `null`
  branch unchanged; the closing `capped` note rewritten to ruling 4's wording.
- **§8.4** — a sentence recording that the ordering read is **deliberately unspanned**, and why
  (ruling 16). Not silence: the next reader must not have to re-derive it.
- **§11.1** — **R-4 rewritten** against the executed figure and ruling 4; new debt rows for the
  reschedule snapshot (ruling 5), for replay now needing the snapshot as well as the seed, for
  ADR-0040 itself while it is `proposed`, and for QS-13's `absorbed` leg, whose determinism now
  **depends on** ruling 5 — discharging that debt would take this evidence with it.

## 10 · Assumptions and open questions

- **`A-19-1`** — the ordering read uses the **occupancy** interval, what the exclusion constraint
  sees, not the appointment interval the response names. `A-4` makes them identical today; if the
  buffer becomes non-zero this read must follow the occupancy one. **What guards it** is ruling 10: a
  wrong *window* is caught behaviourally by AC-1 and AC-2, and the buffer distinction is unobservable
  to any test while `A-4` holds.
- **`A-19-2`** — `busyResources` is scoped by dealership and `status <> 'cancelled'`, so a cancelled
  appointment does not make its bay look busy. Free-first depends on that conjunct (§7); ruling 15
  now depends on it holding **exactly**, not merely closely.
- **`OQ-19-1`** — **closed** at step 4 by ruling 16: no dedicated span.
- **`OQ-19-2`** — replay. A recorded seed no longer reproduces a run alone: the permutation depends
  on the snapshot too. Whether `booking.refused` should carry it is ADR-0040's residual, **open**.
