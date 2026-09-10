# Slice 19 — design · [`19-attempt-cap-sized-against-occupancy.md`](19-attempt-cap-sized-against-occupancy.md) · arc42 §4.1, §5.2, §6.2, §8.4, §10, §11.1 · [ADR-0040](../adr/0040-order-candidates-free-first-from-one-advisory-read.md) · steps 1–7

## 1 · What changes

`bookAppointment` reads occupancy **once**, before it orders, and passes what it read to
`orderCandidates`, which **partitions** each candidate list free-then-busy and shuffles **within** each
group from the seed it already draws. Membership does not change; nor does the cap; the insert still
adjudicates.

That is the whole mechanism. Everything else is record: an ADR superseding
[ADR-0009](../adr/0009-candidate-ordering-and-attempt-cap.md), two quality scenarios for a dimension
§10 has never varied, and two sentences — [§4.1](../arc42/04-solution-strategy.md)'s and §6.2's — that
have contradicted [§11 R-4](../arc42/11-risks-technical-debt.md) since slice 04 inside the single source
of truth.

## 2 · Building blocks touched

| Block | Change |
|---|---|
| `src/domain/candidates.ts` | `orderCandidates` gains a `busy` parameter (§3) and the free-first partition (§4). `prune`, `nextCandidate`, `mulberry32`, `shuffle` — **unedited** |
| `src/application/bookAppointment.ts` | One `busyResources` call before `orderCandidates`, never inside `runAttemptLoop`, over the **occupancy** interval (`A-19-1`; no step *number* — ruling 8). *As built, concurrent with `candidateResources` (§9)* |
| `src/application/attemptLoop.ts` | `CandidateStrategy`'s `'incumbent'` arm gains `readonly busy: OccupancySnapshot`, threaded into its lazy `orderCandidates` call; the `'shuffled'` arm is **unchanged** |
| `src/application/rescheduleAppointment.ts` | **One line**: `busy: EMPTY_OCCUPANCY` (ruling 5) |
| `src/persistence/appointmentRepository.ts` | **Not edited.** `busyResources` is reused verbatim, the function `queryAvailability` already calls; a second reader is the mechanism, as at slice 16 |
| `src/persistence/candidateRepository.ts` | **Not edited**, and that is an assertion: it still cannot see `appointment`, so the `appointment-table-access` marker keeps its one-file list |
| `tests/integration/telemetry-booking.test.ts` | **Added at step 4** (ruling 13); the test-engineer's, **AC-8** |
| `docs/api/openapi.json`, `harness/` | **Not touched** |

## 3 · Interfaces

The signature:

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

`domain-is-pure` is absolute, so `busy` **arrives as a parameter** and the domain declares its own
shape, structurally assignable to `persistence.BusyResources` — no adapter, no cast, and no move of
`BusyResources` into `src/domain`. `seed` stays **last** (arc42 §5.2).

Booking hands the loop `{ kind: 'shuffled', seed, order }`; reschedule's arm gains `strategy.busy`
from its own call site (ruling 5), ADR-0027 deferring that shuffle to the `23P01` arm. `orderCandidates`
and `prune` remain `CandidateOrder`'s **only two minting sites**, both returning `null` rather than an
empty list, so `null` still *means* a list emptied and `busy` cannot reach that exit (P2, AC-3b).

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

Five properties. Breaking any of them is wrong even if the acceptance test is green.

- **P1 · One stream, four draws, in one fixed order.** `mulberry32(seed)` is constructed **once per
  call** and all four `shuffle` invocations take that same `next` — ADR-0009's *"one stream, so the seed
  decides the whole order"*, at four groups.
- **P2 · The emptiness test is over the CONCATENATION, never per group.** A group may legitimately be
  empty — every bay busy is the state this slice exists for — so `if (freeHead === undefined)` would
  refuse a fully-occupied dealership through the `500`/`422` exit: this slice's own defect, inverted.
  **AC-3b** catches a later edit here.
- **P3 · Draw-count invariance.** `shuffle` consumes one draw per element, so `|free| + |rest| = |ids|`
  whatever the partition, and the stream position entering the technician list is today's.
- **P4 · Identity at an empty snapshot.** With `busy = EMPTY_OCCUPANCY`, `rest` is `[]` and
  `shuffle([], next)` consumes nothing, so `freeFirst` returns **element-for-element today's
  permutation** — which makes ruling 5 free, **AC-7** true by construction, and ruling 15's `absorbed`
  fixture possible.
- **P5 · `prune` must not learn the snapshot.** `filter` preserves order, so the free prefix survives
  pruning; re-partitioning would need a snapshot the loop does not carry.

**Why this is not check-then-act (§2.1).** Membership is invariant — an **equal multiset** to
`orderCandidates(b, t, EMPTY_OCCUPANCY, s)` — so the `null` exit is unreachable from `busy` and **the
insert is still the only adjudicator** (**AC-3a**, ADR-0040's Decision; the removing read that *would*
breach §2.1 is its `Filter-1`). **AC-3b earns its place on a point §2.1 cannot cover** — §11.1 D-02-1 —
so only a multiset property would fail.

## 5 · Data-model delta

**None.** No migration, column or index; the constraints, advisory locks, Bound-2's prune rule and
ADR-0004's retry policy are untouched. The finding is about which candidate is tried **first**.

## 6 · Rulings — the verdicts

1. **`H-19-1`, DCR outcome (b) — deferred improvement.** The finding is **agreed and executed**: 35 of
   200 single-threaded bookings refused `409` with one bay and one technician free, so ADR-0009's
   *"the only driver Bound-2 leaves"* is false. But the merged work is **correct under the ADRs as
   accepted**. To rule (c) §6 obliges me to name a criterion, `QS-*` or §2 invariant that would fail;
   across QS-1, QS-2, QS-3, QS-8, QS-14, §2.1 and `candidate-retry.test.ts:304-305` I could name none
   — QS-3's tuples sit at **zero occupancy**, QS-14's filler leaves its reserved slots alone, that test
   blocks all 17 bays **and** all 17 technicians, and §11 R-4 has said so since slice 04, so the code
   implements the documented behaviour. **I declined to reach for §2.1 to manufacture a name.** Were
   "arc42 asserts the opposite of what the system does" admissible under (c), this would be (c).
2. **Supersede, not amend.** ADR-0009's decision is immutable (§4), so ADR-0040 supersedes it and
   ADR-0009 receives `superseded_by: "0040"` in **frontmatter only**. **Carried forward unchanged**, as
   ADR-0040's Decision lists them: Order-C, Bound-2, the cap at 16, both refusal exits and their
   labels. **Changed:** the order *within* the shuffle, and the only-driver claim.
3. **The cap stays 16.** Raising it works **structurally** and is rejected on **latency** rather than
   dismissed; ADR-0040's `Cap-1` row is that argument's one home.
4. **The `capped` signal is restored probabilistically, not structurally**, attempt 16 requiring fifteen
   conflicts among candidates the snapshot called free. R-4 must say exactly that and **must not claim
   the counter is now clean**.
5. **Reschedule passes an empty busy set — and passes it itself.** A snapshot over the **new** interval
   would be wrong about the requester (§11.1 D-19-1): the mover's own pair, which ADR-0030 has it
   vacating, would sort **last**. By P4 the empty snapshot is byte-identical to today's ordering, so
   **AC-7** holds by construction. Supplied at `rescheduleAppointment`'s call site rather than defaulted
   inside `attemptLoop`, because a shared loop silently choosing its caller's allocation policy is a
   place the fix would have no address. §11.1 D-19-1 — and, unforeseen at step 1, the one path that
   keeps a blind shuffle (ruling 15).
6. **Backlog ordering — (d), provisional until the gate.** Slice 19 starts ahead of 17 and 18, which
   stay `ready` and are **not** absorbed: both are hygiene on evidence and neither is on a request path,
   while 19 is a **measured user-visible wrong answer** at 90 % occupancy. WIP is 1 and nothing was in
   flight, so it is legal — but backlog order is normally the human's (`s-19-dcr-1`).
7. **§4.1 is my error, self-reported and owned at step 1.** *"A `409` therefore means the dealership was
   full rather than that the allocator guessed badly"* has sat opposite §11 R-4 since slice 04, both
   inside arc42. **AC-5** corrects it whichever remedy ships, hence its independence from the
   ordering change.

### Step 2 — the adjudication round

Five objections, one round, ruled before the design was touched: two agreed as raised, one agreed and
taken further, one agreed in finding and refused in remedy, one deferred.

8. **`I-19-1` — (a), agreed.** `bookAppointment.ts:252` numbers `orderCandidates` step 5; arc42 §6.2
   numbers it step 6. Each is right in its own document, so §2's row cites the **calls**, not a number.
9. **`O-19-1` — (a), agreed.** §6.2's opening restates §4.1's claim and the measurement falsifies it
   identically; correcting one and not the other would reproduce ruling 7's defect inside arc42. AC-5
   names both, and §6.2 was already declared touched. **The sweep is complete**: those two sentences are
   the only instances.
10. **`T-19-1` — finding AGREED, seam REFUSED, AC-3a reworded rather than re-sourced.** The
    measurement is right: this has no synchronisation point, so black-box staleness is probabilistic —
    QS-16, not a fixture. But it reaches further than sourcing. **AC-3a as worded is false**: *"costs
    attempts and never a refusal"* is true of the mechanism, not of the system, because an adversarial
    snapshot can spend all sixteen attempts while capacity exists — R-4's residual, which ruling 4
    reduces and does not remove. The seam is refused on two counts: it buys a fixture whose green
    depends on its own size, passing at `2M − 1 < 16` and failing above it on a guarantee never given;
    and injecting `busy` *replaces* the read, so no test would exercise `A-19-1`'s wiring. I decline to
    name **§2.2** — the substituted read is advisory and the adjudicating `INSERT` stays real.
    **Provenance:** the seam came from the role that had just read the composition root (ruling 12); it
    carries no weight, the remedy failing on its merits, but had I accepted it the gate could fairly ask
    whether it was derivable without that read.
11. **`T-19-2` — AGREED, additively.** `(20, 8, 4)` joins, `(8, 8, 4)` stays: my §8 argument is
    free-group size **combined with** contention, and the set varied one at a time. Eight free pairs
    exist at the new tuple, so exactly 8 confirm and 12 refuse honestly. *Ruling 18: neither tuple can falsify free-first.*
12. **`T-19-3` — (d), provisional. No taint; nothing downstream is re-authored.** The read-only `grep`
    of `src/main.ts` and `src/platform/config.ts` was a lapse and **materially void**:
    `tests/support/service.ts` already carries `BOOKING_SEED`'s name, ADR, semantics and env wiring —
    the whole composition-root env surface, inside the role's own directory. AC-2's measured red
    stands; step 3 is not re-run. **The disclosure is the part worth keeping**: unprompted, and what made ruling 10's provenance question answerable. Second
    instance of the class (`T-15-1`); two instances is a pattern, and whether `guard-paths.mjs` grows a
    Bash read branch is the human's call.

### Step 4 — `I-19-2`, the fixture the mechanism invalidated

13. **`I-19-2` — (a), clarification. The design was right and its scope was short.** Free-first is
    correct and QS-15/QS-16 measured it so; what broke is a **fixture**.
    `tests/integration/telemetry-booking.test.ts` manufactures a retry-then-succeed booking by occupying
    one of two bays and relying on ADR-0009's blind shuffle to draw the occupied bay first at
    `BOOKING_SEED = 7`. Free-first draws the **free** bay, so the booking confirms on attempt 1 and
    three of fourteen assertions go red. Its own docblock predicted this, so it **detected the intended
    change** — a fixture working. **(c) is nameable and I decline it:** QS-13's *Given* is "a booking that retries
    once then succeeds", so a §10 scenario is literally red and ruling 1 obliges me not to suppress a
    name that exists. But (c)'s remedy is to supersede the ADR at fault and **none is** — what was
    overtaken is QS-13's *Given*. So **(a): resume at step 3 for one file, no loopback spent.**
    **My omission, owned:** ADR-0040's consequences did not name the alignment result and §2's table did
    not declare the fixture; either would have made this step 1's.
14. **The remedy is the test-engineer's.** §5 makes `tests/integration/` shared and assigns the
    test-engineer the rows asserting a **database** invariant; this file asserts a **process** one, so
    the letter leaves it open. The rationale does not: it is outside-in evidence of what *done* means for
    telemetry, and the implementer has now written the free-first code. A role rewriting the criterion
    its own diff must meet is the boundary §5 exists for; the implementer raised rather than edited.
15. **AC-8 — QS-13's claims are re-sourced, not weakened.** The **alignment** is permanent and
    ADR-0040's consequence states why: **no single-threaded interleaving conflicts while capacity
    remains**, so a waterfall now needs a **refusal** or **concurrency**. Rewritten
    [QS-13](../arc42/10-quality-requirements.md) carries the three re-sourced
    claims, **AC-8** is their acceptance form, and its third leg —
    `booking_conflicts_total{outcome=absorbed}` — is **ruled in rather than traded away**: without it a
    §10 metric claim drops silently to a unit test, evidence of the counting rule and not of the export
    path. Ruling 5 makes it reachable. **Two traps, named at step 4 and both navigated:** `I-09-2`'s
    technician coin-flip, and reschedule's **lazy** seed draw.
16. **`OQ-19-1` — settled, no dedicated span**, the implementer's reasoning confirmed on all three legs:
    `busyResources` already rides unspanned on `GET /availability`; the only place to add one is
    `appointmentRepository.ts`, which §2 marks not-edited; and **AC-6** measured 18.37 ms p95. §8.4 records it.

## 7 · Quality scenarios

**QS-3, QS-8, QS-10, QS-12** unchanged and asserted so (QS-8's mechanic 6 witnesses `A-19-2`).
**QS-14** re-measured (AC-6); **QS-15/QS-16** added to §10 at step 1 so the
test-engineer cites §10, not a slice file; **QS-13** rewritten at step 4 (ruling 15).

## 8 · The live risk — pre-committed at step 1, corrected at step 7

The mechanism is ADR-0040's residual bullet and §11 R-4's bound; only the slice history is here. QS-16
was pre-committed as its falsifier (ruling 11), measured **exactly `min(N, M)` at all four tuples** —
and **that was not a falsification**: no tuple can produce a spurious refusal at the shipped cap, so the
residual is **unmeasured**, not unfalsified. Ruling 18 corrects this section rather than deleting it.
`Refresh-1`, a bounded free prefix and the `(9, 9, 3)` tuple stay on the table, **undesigned**.

## 9 · As-built — step 7

arc42 carries this slice, so §9's proposals are gone rather than restated: §4.1, §5.2, §6.2, §8.4,
§10 QS-15/QS-16, §11 R-4 and D-09-6, and four new debt rows. Paying for those inside §11's ratchet cost
**558 words condensed out of 13 older rows** (`R-19-11`'s measurement; my first self-report said ~300
across six, half of it), and this round's corrections cost **119 more out of 12 rows**, plus ~290 in
this file.

- **`D-19-1` · `D-19-2` · `D-19-3` · `D-19-4`** — the move's empty snapshot, the seed that no longer
  replays, the missing burst falsifier, ADR-0040 unratified (rulings 5, 19, 18, 20; §11.1 in full).

**As-designed versus as-built.** (1) **The read is concurrent, not sequential.** §2 said *after
`candidateResources`*; it ships in one `Promise.all` (`bookAppointment.ts:257-259`) — better than
specified: no extra round trip (AC-6, 18.37 ms). §6.2 and ADR-0040 now say so.
(2) **§8's pre-committed falsifier was not one** (ruling 18). (3) **§11 gained an unforeseen row**
(D-19-3) and merged QS-13's `absorbed` leg into D-19-1. (4) **The red figure is 163, not 165**
(ruling 17).

### Step 7 — four rulings

17. **`R-19-5` — agreed; the documents state the executed figure *and* that it is a sample.** Neither
    163 nor 165 is reproducible, so preferring the repository's number swaps one quoted constant for
    another and meets the DoD clause in letter only. §10 QS-15 and §11 R-4 now carry **163 of 200 in the
    red run (CI `34464606313`)**, name 165 as the hand probe, and say both are samples of roughly a
    one-in-six refusal. ADR-0040 keeps its own 35 of 200 and adds the fixture's 37.
18. **`R-19-6` — agreed and taken further; the tuple set stays and arc42 now carries why.** The masking
    argument generalises past where it stopped: a spurious refusal must reach the cap on candidates the
    snapshot called **free**; other racers can occupy at most `2(N − 1)` of those, and at most `2M − 2`
    can be spent without emptying a free list and making the refusal honest. It needs
    **`N, M ≥ ⌈cap/2⌉ + 1`** — 9 at the shipped cap, ruling 21 correcting the encoding — and **every
    tuple has `M ≤ 8`**. Unreachable at all four, not merely masked at three, so **my §8 claim that
    QS-16 was free-first's falsifier is false**, as is ADR-0040's consequence repeating it. Both
    corrected. The tuples were not badly chosen — §10 QS-16 records what they discriminate against — and
    they stay: a new tuple is a new concurrency test, and §2.4 wants it red first while this slice's red
    is spent.
19. **`OQ-19-2` — the weakened replay guarantee is accepted, not closed.** The snapshot on
    `booking.refused` would restore it and is one attribute; I decline to ship it here on **§2.4** — no
    failing test, and a `src/` edit riding on prose in a slice whose red is spent is what §2.4 refuses.
    What narrowed is smaller than it reads, and §11.1 D-19-2 carries both the scope and the ADR-0019
    destination. It needs a backlog slice: a row is not scheduled (F-16-1).
20. **ADR-0040 stays `proposed` — a decision, not a lapse.** A merge does not move an ADR out of
    `proposed`, and I decline the standing delegation for the reason §11.1 D-19-4 states: every figure
    here supports Order-E and none prices `Cap-1`, its one-config-value rival. Ratification is the
    human's.

### Step 7, second pass — four rulings

21. **`R-19-8` — agreed; the bound is `⌈cap/2⌉ + 1` and my `9` encoded the cap.** Ruled **(b)**: the
    code is correct under ADR-0040 and QS-16 green at the shipped cap, so nothing nameable fails today.
    But `BOOKING_ATTEMPT_CAP` is settable 1–1000 and no fixture pins it — at 14 the bound is 8 and
    `(8,8,4)`, a tuple §10 called unreachable, goes spurious in ~2.3 % of simulated bursts: D-15-1's
    class. §10, §11 and ADR-0040 are parametric now; pinning the cap is the test-engineer's, red first
    (§2.4), on D-19-3's slice. R-4 takes the corollary: only the `capped` arm can be spurious.
22. **`R-19-9` — agreed on the reviewer's grounds, not on mine.** `A-19-3` was wrong that §4.1 is
    quantified only backwards — pointing at R-4 for the figure is one-home-per-fact working. The defect
    is the **adjective**: *"unlikely"* over the one regime nothing here measures. §4.1 now names the
    regime, says it is not small inside it, and leaves the regime's own likelihood to load. Third
    instance in two slices (rulings 7, 18), in the sentence read first.
23. **`R-19-10` — agreed.** My condensation broke `F-16-1`'s arithmetic: five citations, three
    enumerated. Both `(retired)` sites restored; slice 17 sweeps five.
24. **`R-19-11` — agreed, the one material loss.** D-16-4's remedy shape — a **generated** block,
    §11.1's register the precedent — is back. **The ratchet is the human's, not mine:** §11's length
    tracks the count of slices, so from slice 20 a new row is paid for by deleting an older one's
    reasoning. Raise the override or split the register — not mine to do mid-slice.

## 10 · Assumptions and open questions

- **`A-19-1`** — the ordering read uses the **occupancy** interval, what the exclusion constraint sees,
  not the appointment interval the response names. `A-4` makes them identical today; if the buffer
  becomes non-zero this read must follow the occupancy one. **Guarded** by ruling 10: a wrong *window* is
  caught by AC-1 and AC-2, the buffer distinction being unobservable while `A-4` holds.
- **`A-19-2`** — `busyResources` is scoped by dealership and `status <> 'cancelled'`, so a cancelled
  appointment does not make its bay look busy. Free-first depends on that conjunct (§7), and ruling 15
  on it holding **exactly**.
- **`OQ-19-1`** — **closed** at step 4 (ruling 16): no dedicated span.
- **`OQ-19-2`** — **closed** at step 7 (ruling 19): the weakened replay guarantee is accepted, booked as
  §11.1 D-19-2 with a destination.
