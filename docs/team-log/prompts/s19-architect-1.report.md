# Report · slice 19 · architect · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Rule DCR H-19-1 on cap sizing
- Returned: 2026-09-10T09:12:39.431Z
- Duration: 465s

---

I have read `CLAUDE.md`, ADR-0004/0009/0018/0036, `attemptLoop.ts`, `candidates.ts`, `bookAppointment.ts`, `candidateRepository.ts`, `busyResources`, `queryAvailability.ts`, arc42 §4.1/§10/§11, the QS-14 fixture, `tests/acceptance/candidate-retry.test.ts` AC-4, the slice-19 draft, the simulation, and the executed measurement. I have written and changed nothing — `git status --porcelain` shows only the orchestrator's own files.

---

# Architect's reply — `H-19-1`

## 0. On the simulation, since I was asked

**Faithful in the load-bearing respect.** The mechanism is that Bound-2 spends one attempt per *busy resource discovered*, so `k` paired-busy resources cost up to `2k` prunes against a cap of 16; that holds whichever exclusion constraint PostgreSQL names first, so the bay-before-technician assumption is not load-bearing (it is also correct — `bookAppointment.ts`'s own docblock records it as measured, `0003_appointment.sql` creates `no_bay_overlap` first).

Two infidelities, neither of which moves the table. (i) When one attempt both empties a list and reaches the cap, the real loop returns `exhausted` (`attemptLoop.ts` checks `remaining === null` before `attempts >= attemptCap`); the sim returns `capped`. Unreachable at `k ≤ 11` on 12+12, since emptying a list needs 12 prunes of one side. (ii) The sim issues no write, so it cannot see ADR-0018's locks serialising racers — irrelevant, because it models no racers. The executed run agreeing with the `1 + 2p/(1−p)` model within 3–5% while the cap does not bind is the cross-check I would have asked for.

I accept the coordinator's three caveats verbatim, and I emphasise caveat 1 in my own words: **the free-first millisecond column is not evidence and I am not treating it as evidence.** The attempt-count and outcome columns are the load-bearing ones and they are unaffected by both bypasses.

---

## 1. The finding itself — **AGREE, with one correction and one aggravation**

The mechanism is real and now executed: at 12 bays + 12 technicians, `k=11`, **zero concurrency**, 35/200 bookings are refused `409` with exactly one bay and one technician free. Occupancy is a driver of attempt depth, it is independent of concurrency, and ADR-0009's sentence "**contention depth, the only driver Bound-2 leaves**" is false.

**Correction — the fact is not new; only the magnitude is.** arc42 §11 **R-4** has said since slice 04: *"the attempt cap refuses while capacity exists, 16 being below ADR-0009's own `|bays| + |technicians| − 1`, so a non-zero `capped` is expected rather than a signal."* That is this finding, written down, twelve slices ago, and `candidateRepository.ts`'s docblock routes it to a planned remedy. Anyone reading H-19-1 as a discovery is reading it wrong. What is new is a **number** — 17.5% at 90% occupancy, single-threaded — and a number changes a debt's priority even when it does not change its truth-value.

**Aggravation, and it is mine.** arc42 §4.1 says *"A `409` therefore means the dealership was full rather than that the allocator guessed badly"* and arc42 §11 R-4 says the opposite. **arc42 contradicts itself, in the document `CLAUDE.md` §4 names as the single source of truth for architecture, and has done since slice 04.** That is an architect failure, not an orchestrator finding, and I own it. It is correctable regardless of which remedy ships, and I would correct it in this slice whatever else is ruled.

**A precision the record needs.** `tests/acceptance/candidate-retry.test.ts` AC-4 is cited (in its own message, and in `candidateRepository.ts`) as standing evidence that the refusal "is spurious BY DESIGN". It is not. Its fixture is `seedScenario(…, {bays: 17, technicians: 17})` followed by `blockPairs(…, 17, …)` — **all 17 bays and all 17 technicians are occupied.** The untried seventeenth bay is itself busy, so the refusal is honest in outcome and merely mislabelled in `exit`. **The executed measurement is the first genuinely spurious refusal in this repository's evidence.** The AC-4 comment overstates what it proves and should be corrected.

---

## 2. Verdicts on the six counter-arguments and the ordering question

### Objection 1 — an occupancy read on the write path, and what enforces "permutation, not decision"

**AGREE that the guard is a story as the remedy is currently stated. DISAGREE that it must remain one.**

"The read produces a permutation, not a decision" is enforceable, and today nothing would enforce it. Let me be precise about what each candidate guard actually buys:

| Guard | Does it catch a regression to check-then-act here? |
|---|---|
| `appointment-table-access` marker | **No.** It asserts only `appointmentRepository.ts` names the table. `bookAppointment` would call `busyResources`, not name `appointment`. The marker holds and is *not* weakened — but it was never watching this. |
| `domain-is-pure` | **No.** `busy` arrives as a parameter; a pure function can still branch on it. |
| Behaviour | **No**, and ADR-0018 says so: *"under a per-resource lock, a reintroduced check-then-act would be **correct** rather than merely harmless."* Correctly noted in the brief. |
| **Membership invariance, as an executable property** | **Yes.** |

The real structural guard is the one the retired ADR-0033 identified and the brief under-uses: **`CandidateOrder` is non-empty by construction and `orderCandidates` returns `null` only when an input list is empty; `bookAppointment` routes that `null` to `500`/`422`, never `409`** (ADR-0016 — a capacity refusal requires a database verdict). A *removing* filter can drive that `null` on a merely-full dealership and would therefore have to answer `500` for a full Saturday, or mint a `409` from a read. Ordering cannot reach that exit. That is a genuine structural difference, not a preference.

But it is a property of the *implementation*, and it needs pinning. **Exact change I would make:** the slice must carry a property, in `tests/property/` (test-engineer's), asserting for all `(bays, technicians, busy, seed)`:

1. `orderCandidates(bays, technicians, busy, seed)` and `orderCandidates(bays, technicians, [], seed)` have **equal multisets** on both lists — `busy` permutes, never removes; and
2. the result is `null` **iff** `bays.length === 0 || technicians.length === 0` — `busy` cannot reach the `null` exit.

With (1) and (2) executable, "advisory" stops being a promise the caller keeps and becomes a fact about the function, which is exactly the standard `queryAvailability.ts`'s own docblock already sets for the read path.

### Objection 2 — does this weaken the advisory contract of §8.6 / ADR-0036?

**DISAGREE.** This is squarely the use ADR-0004 sanctions, and it sanctions it in the imperative: *"The list decides **which write is attempted next**, never **whether a write is allowed** — a stale list costs attempts, never a double booking."* Ordering is the *definition* of "which write is attempted next". ADR-0036 makes the database the adjudicator of overlap; nothing here adjudicates anything. `queryAvailability` already composes `candidateResources` with `busyResources` and subtracts, in the open, and `busyResources` returns `{bays, technicians}` — the exact shape ordering would consume. No new read, no new query, no new file.

The one thing I will not accept is the argument by *convenience* — that it is fine because the function already exists. It is fine because a permutation cannot refuse, and objection 1's property is what makes that checkable.

### Objection 3 — cost, and should the slice be blocked on measuring it

**AGREE the cost is unmeasured. DISAGREE that the slice should be blocked on measuring it first.**

Blocking is the wrong instrument. The right instrument is an acceptance criterion, because `slice:check` reads ACs and does not read a Definition-of-Done paragraph. The slice's DoD already says QS-14 must be re-measured "if the remedy adds a read"; that is a good sentence in the wrong place.

**Exact change I would make:** promote it to an AC (numbered below), phrased so it fails rather than passes silently — QS-14 re-run against the **unchanged** perf fixture (5 bays, 20 technicians, 500 filler appointments), uncontended booking still `< 100 ms` p95, availability still `< 200 ms` p95, and the figure recorded in arc42 §11 beside its machine class as `tests/performance/availability-budget.test.ts` already demands.

I will also predict the number, so that being wrong is visible: `busyResources` is one indexed `SELECT` over one dealership and one interval, on the same warm pool, in a path whose measured median is 4.28 ms against a 100 ms budget. If that read costs more than a few milliseconds, the finding is not about the cap at all and I want to know.

### Objection 4 — the cheap non-fix: raise the cap

**DISAGREE that it substitutes for the fix. AGREE that it is stronger than the slice file admits, and the slice file's dismissal of it is wrong as written.**

Slice 19's *Out of scope* says raising the cap "does not make occupancy stop being a driver; it moves the depth at which the same refusal happens." **That is false at the boundary, and the boundary is the whole point.** A cap at or above `|bays| + |technicians|` is not a bigger number — it is a **structurally unreachable** number, because Bound-2 guarantees a list empties by then. At that cap the spurious refusal does not move; it *ceases to exist*, and ADR-0009's own signal — *"a non-zero cap-exceeded counter means the cap is wrong"* — becomes true for the first time in this project's history.

So it must go in the superseding ADR's option table on its real merits, and be rejected on a real reason. The real reason is that the cap is a **latency** guard, not a termination guard — `bookAppointment.ts`'s docblock says exactly that, and Bound-2 already sits in the loop header. A cap of 40 means a worst-case refusal costs 40 attempts × three round trips each under ADR-0018's locks: correct, and slow, at the exact load ADR-0004 was written for.

**And here is where I disagree with the orchestrator's framing.** Ordering and the cap are **complementary, not alternatives**. Ordering makes the *common* case one attempt; raising the cap makes the *worst* case non-spurious. Ordering alone leaves the cap reachable under concurrency, which means — and this must be written down —

> **the remedy restores the `capped` counter's meaning only probabilistically, not structurally.**

The retired ADR-0033's claim that ordering "restores the `capped` counter's meaning" was too strong, and I am not carrying it forward unqualified. **My ruling: ordering ships, the cap stays 16, and the superseding ADR records that residual explicitly rather than declaring it closed.** Raising the cap stays available to the human as a one-variable change (`BOOKING_ATTEMPT_CAP`) and I would not object if the gate takes it as well.

### Objection 5 — do nothing

**Split, and I want both halves on the record.**

**AGREE** the finding re-describes an accepted consequence: R-4 states it, ADR-0009's Consequences state it (*"the residual spurious refusal already accepted"*), and slice 04's gate carried it to the human unresolved. The word "contradicts" in the slice file is doing more work than the facts support against ADR-0009 — it is right about §4.1 and wrong about §11.

**DISAGREE** that this makes doing nothing defensible. Two reasons. First, ADR-0009 accepted the residual *at depth 17* — an event it expected to require sixteen conflicts. The executed measurement shows it firing at **17.5% of single-threaded bookings on an ordinarily busy Saturday**, at a dealership size §1.1 puts in scope. A residual that is one-in-a-thousand and a residual that is one-in-six are different decisions wearing the same words. Second, the remedy is *already designed, already ruled, and already routed* — it was the shape ADR-0033 fixed at slice 08 step 1, and it was retired in the 2026-09-07 ADR cull with the work never landing. Doing nothing now is not accepting a residual; it is losing a decision.

### Objection 6 — does free-first re-synchronise a burst? *(the one I was asked for independently)*

**DISAGREE with the objection as stated. AGREE that it identifies the sharpest real risk, and I am restating the risk in a stronger form than the brief gives it.**

Order-D was rejected because it computes a **total order** from a snapshot: every racer sorts by utilisation and every racer's *first choice is the same element* — that is Order-A with extra steps. Free-first computes a **two-block partition** and shuffles independently within each block from a per-request seed. Racers agree on the *set* they draw from, not on the *element*. Collision probability on attempt 1 goes from `1` (Order-D) to `1/f` (free-first, `f` free bays), against `1/|bays|` today. **Free-first is Order-C restricted to a smaller set — categorically not Order-A**, and the objection as posed does not land.

Now the version that does land, which is not in the brief:

> ADR-0004 fixes the snapshot: **read once per request, never refreshed on failure.** Under a burst, all *N* racers may read the *same* snapshot before any of them commits. Free-first then front-loads, for every loser, precisely the resources the winners have just taken. Today's uniform shuffle spreads a loser across busy and free alike; free-first concentrates it onto a stale free block first, *then* sends it into the busy tail. In the burst-at-high-occupancy regime, free-first can **increase** a loser's attempt count.

Correctness is untouched either way — a loser at genuine capacity gets an honest `409`. But **attempts against a fixed cap is the entire subject of this finding**, so a remedy that moves the spurious refusal from the single-threaded case into the burst case would be a poor trade, and the executed measurement — single-threaded on both arms — cannot see it.

I therefore rule the remedy sound **conditionally**, and I state the falsifier, as asked:

> **Falsifier.** At 12 bays and 12 technicians with `k` pairs pre-booked over one interval, *N* concurrent bookings released from a barrier. If, at any tuple `(N, M, k) ∈ {(20, 1, 11), (20, 4, 8), (8, 8, 4)}`, free-first ordering confirms **fewer than `min(N, M)`**, the remedy is falsified and I loop back. Secondary, recorded rather than thresholded: the count of refusals reporting `exit: 'capped'` under free-first must not exceed the count under the shipped ordering at the same tuple **and the same seeds**. A higher count is the burst re-synchronisation, measured.

**This is a step-3 red, not a step-1 blocker.** It is the test-engineer's to build, in `tests/concurrency/`.

### Objection 7 — jumping ahead of slices 17 and 18

**AGREE the ordering is right; DISAGREE that it is close.**

Slice 17 is a citation sweep and slice 18 is collector de-duplication: both are hygiene on evidence, neither is on a request path, neither blocks 19, and 19 blocks neither. Slice 19 is a measured, user-visible, wrong answer to a customer at 90% occupancy on the exact scenario ADR-0004 was written for. WIP is 1, nothing is in flight, so it is legal; on merit it is not a judgement call.

Two honesty conditions. First, **backlog ordering is normally the human's**, and I am taking it under the standing mid-slice delegation: this ruling is **provisional at the gate** and `slice:check` must list it as a scope ruling so the gate is shown it rather than asked to notice. Second, slices 17 and 18 do not become "later" — they stay `ready` and 19 must not absorb them.

---

## 3. Rulings

### 3.1 The DCR outcome — **(b) Deferred improvement**

**I cannot name an acceptance criterion, a §10 quality scenario, or a §2 standing invariant that would fail, and I looked hard for one.** §6 is explicit that when I cannot, the outcome is (b).

The record of the search, because a (b) reached by not looking is worthless:

| Candidate | Does it fail? |
|---|---|
| **QS-3** | No. Every tuple fixes *M* **free** resources at zero occupancy; at (20,8) the additive bound is 15, below the cap. The cap never binds. |
| **QS-14** | No — and not for a good reason. `tests/support/perfFixture.ts` reserves counters `500..649` as slots *"deliberately unused by the filler"*, so the timed booking always lands on an empty interval. **QS-14's "exactly one INSERT" passes because the fixture avoids the case, not because the system holds the property.** That is worth recording; it is not a failure. |
| **QS-1 / QS-2 / QS-8** | No. Overlap, constraint naming and availability-agrees-with-constraint are untouched. |
| **§2.1** | No. Nothing on the write path reads availability today; `bookAppointment.ts` step 4 reads reference data only. |
| **AC-4, `candidate-retry.test.ts`** | No — it **passes and pins the current behaviour deliberately**, on an all-17-blocked fixture. |
| **arc42 §4.1** | Contradicted, and §6 does not admit arc42 prose as a (c) name. |

So the merged work is **correct under the ADRs as accepted**, and the honest reading is (b): §4.1 is wrong, §11 R-4 is right, and the code implements R-4.

**Does "no slice in flight" change the letter? No, and it simplifies the effect.** (b)'s effect is *"merge as-is; new backlog slice + ADR with `status: proposed`."* There is nothing to merge — the work merged twelve slices ago. What remains of (b) is exactly what exists: a backlog slice (19, drafted) and a `proposed` ADR (below). I want the mismatch noted rather than smoothed: **(b) here is not "ship it anyway", it is "the shipped thing was the agreed thing, and the agreement is what changes."**

I will say the uncomfortable part plainly. If §6's (c) criterion admitted "arc42 asserts the opposite of what the system does", this would be (c). It does not, and I am not going to reach for §2.1 to manufacture a name — that is precisely the substitution §6 records as the gravest defect it once could not reach. **(b), and the priority carries the weight instead of the letter.**

### 3.2 New ADR, or supersede ADR-0009 — **supersede**

**ADR-0040 · "Order candidates free-looking first, from an advisory occupancy snapshot", superseding ADR-0009.** Three independent reasons, of which only the first is in the brief:

1. **The chosen option changes.** Order-C is *"a deterministic permutation from a per-request seed"* — a pure function of `(candidates, seed)`. The remedy makes it a function of `(candidates, busy, seed)`. Different input, different function.
2. **Two Consequences become false**, and `CLAUDE.md` §4 puts *consequence* on the immutable list beside chosen option and verdict:
   - *"Ordering is a pure function of (candidates, seed) in `src/domain/candidates.ts`"* — still pure, no longer of that pair.
   - *"Work is **not** balanced across resources: a seeded shuffle spreads contention, not load — Order-D's benefit, knowingly given up."*
3. **The option set changes, and this is the reason I most want in the record because nobody raised it.** ADR-0009 rejected Order-D partly as *"'fairest allocation' is scheduling policy — out of scope, and carried as debt."* **Free-first ordering is load-aware allocation at binary granularity.** It is a coarse Order-D, it takes a real slice of Order-D's benefit, and pretending otherwise would let a scheduling-policy decision in through a door marked "attempt cap". Slice 19's *Out of scope* line — *"Load balancing across resources — ADR-0009's Order-D, knowingly given up and still given up"* — is **not sustainable as written** and I would amend it to say what is actually given up: continuous utilisation ordering, not occupancy awareness.

**Carries forward, unchanged and explicitly re-affirmed** so the successor is readable standalone: Bound-2 and the whole-resource prune; the cap's **existence** and its **value of 16**; the seed as an injected parameter, never global (Order-C's actual distinguishing property, which survives intact); prune preserving survivor order so a recorded seed still reproduces a run; and `exhausted` winning the tie over `capped`.

**Superseded:** the ordering function's signature; the two Consequences above; and the sentence *"Sixteen is set against **contention depth**, the only driver Bound-2 leaves"*, which the executed measurement falsifies.

**Status:** minted `proposed` at step 1, per §6(b) and arc42 §11's rule that a merge does not move an ADR out of `proposed`. I will rule on ratification at step 7 under the standing delegation, recorded provisional at the gate. Number 0040 unless the orchestrator has allocated it.

### 3.3 Does the cap's value move from 16 — **no**

It stays 16, for objection 4's reason: it is a latency guard and Bound-2 already bounds termination in the loop header. The superseding ADR records that this leaves the `capped` counter's signal restored **probabilistically, not structurally**, and that a cap at or above `|bays| + |technicians|` is the only thing that would close it — available to the human as one config value, and not taken here. **The cap's value is the human's at Gate B; I am declining to move it, which is the ruling I am entitled to make, not endorsing that 16 is right.**

### 3.4 Does §10 need a scenario that varies occupancy — **yes, two**

Neither exists today; §10's own closing paragraph does not list occupancy among what is deliberately absent, so this is a gap rather than a decision. I specify; the test-engineer builds and places them (`tests/property/`, `tests/concurrency/`, `tests/performance/` are theirs under §5).

> **QS-15 · No spurious refusal under occupancy.** At a dealership with 12 service bays and 12 technicians all qualified for one 60-minute service type — so `|bays| + |technicians| − 1 = 23`, above the attempt cap of 16 — with *k* bay/technician pairs already `confirmed` over one interval, a **single** booking for that interval with **no concurrency** is **confirmed** for every `k ∈ {0, 3, 6, 9, 11}` and for each of 200 distinct seeds, and the attempts it makes are **p95 ≤ 2 at every k**. *Response measure: 1000/1000 confirmed; attempts p95 ≤ 2. Measured red on the shipped ordering at 165/200 confirmed for `k = 11`.*

> **QS-16 · Ordering does not re-synchronise a burst.** At the same 12+12 dealership with *k* pairs pre-booked over one interval and *M* free bays and *M* free technicians remaining, *N* concurrent bookings for that interval released from a barrier confirm **exactly `min(N, M)`**, for `(N, M, k) ∈ {(20, 1, 11), (20, 4, 8), (8, 8, 4)}` — QS-3's own measure, on an occupancy axis QS-3 does not have. Secondary, **recorded rather than thresholded**: the count of refusals reporting `exit: 'capped'` must not exceed the count the shipped ordering produces at the same tuple and the same seeds.

QS-16 is objection 6's falsifier and is the reason I am willing to rule without a concurrent measurement in hand. QS-3 stays as it is; QS-16 is beside it, not a replacement.

### 3.5 Scope — one slice, **with one unlisted dependency that could make it two**

The change is genuinely small: one signature, one call site, one already-written read already called from `queryAvailability`, one ADR, two QS, four arc42 sections. But the slice file misses a decision that is the likeliest cause of a loopback:

> **`rescheduleAppointment` also calls `orderCandidates`** — lazily, inside `attemptLoop.ts`'s `'incumbent'` arm, when the incumbent pair itself conflicts. A signature change hits that call site immediately, and the honest answer there is not obvious: a reschedule's snapshot would be over the **new** interval while ADR-0030 has it **vacating** its own pair, so a naive snapshot is wrong about the requester itself.

**My ruling, to be recorded at step 1:** reschedule passes an **empty** busy set in this slice — behaviour identical to today, one line, no new read on the move path — and the question of an occupancy-aware reschedule is booked as debt in §11 with ADR-0019's criterion applied honestly (name a live destination, or do not defer). **If anyone proposes including the move path here, that is two slices and I will say so at step 1**, because it drags ADR-0030's vacate-and-take semantics into a slice about the cap.

Also: the slice's `arc42:` field omits **§5.2** (the ordering building block, whose interface changes) and, on my §4.1 correction, it is already declared. It should read `["§4.1", "§5.2", "§6.2", "§8.4", "§10", "§11.1"]`. `adr: []` should name the successor. Both are the orchestrator's file, not mine.

### 3.6 Acceptance criteria — three amended, two added, none deleted

| AC | Verdict | What I would change *(and I am not changing it)* |
|---|---|---|
| **AC-1** | **Keep, sharpen** | Name the fixture and the sample: 12 bays, 12 technicians, `k = 11`, 200 distinct seeds, zero concurrency. "A representative sample" is not a threshold. Measured red at 165/200 — it will fail today essentially always. |
| **AC-2** | **Keep, give it a number** | *"Does not grow with occupancy"* is unassertable. Replace with **attempts p95 ≤ 2 for every `k ∈ {0, 3, 6, 9, 11}`**. |
| **AC-3** | **Keep — the most important AC here — and split it** | **AC-3a** keeps the behavioural half unchanged (a stale or wrong snapshot costs attempts, never a refusal). **AC-3b** adds objection 1's structural half, and it is the one that makes "advisory" enforced rather than promised: `orderCandidates` returns an **equal multiset** on both lists for every `busy`, and returns `null` **iff** an input list is empty. Without AC-3b nothing in the repository would catch a later edit turning the read into a filter. |
| **AC-4** | **Keep, and strengthen — this is the AC I most want changed** | As written it only re-runs QS-3's existing tuples, all of which are at zero occupancy, so **it cannot see objection 6 at all** while appearing to answer it. It must carry QS-16's tuples. |
| **AC-5** | **Keep, widen** | It must also require: arc42 **§4.1's sentence corrected**; **§11 R-4 rewritten** against the executed figure; and the `candidate-retry.test.ts` **AC-4 comment corrected**, since it claims a spurious refusal its own all-blocked fixture does not produce. Today §4.1 and §11 contradict each other and AC-5 as drafted would leave that standing. |
| **AC-6** | **Add** | QS-14 re-measured against the **unchanged** perf fixture with the extra `SELECT` on the booking path: uncontended booking `< 100 ms` p95, availability `< 200 ms` p95, figure recorded in arc42 §11 beside its machine class. This is objection 3 answered by an AC rather than by a blocked slice — the DoD line that says this today is in the wrong place, because `slice:check` reads ACs. |
| **AC-7** | **Add** | `rescheduleAppointment`'s outcomes are **unchanged** — §3.5's empty-busy-set ruling asserted rather than assumed, so the move path cannot regress silently behind a booking-path change. |

I would delete none.

### 3.7 Do I want the executed measurement before I design — **it has landed, and I design on it**

Objection 6 stays unmeasured and I am not waiting for it: it becomes **QS-16, committed red at step 3**, which is where §2.4 puts evidence anyway. If QS-16 falsifies free-first at any tuple, that is the loopback and I will take it — this slice has 0 of 2 spent.

---

## For the PR *(there is no open PR yet; text supplied for when the orchestrator opens one)*

> *One round of discussion on `H-19-1`, per `CLAUDE.md` §6 — ruling only; the design follows separately.*
>
> **Architect.** **(b) deferred improvement.** I could name no acceptance criterion, §10 scenario or §2 invariant that fails, and §6 says (b) when I cannot. QS-3's tuples all sit at zero occupancy; QS-14's "exactly one INSERT" passes only because `tests/support/perfFixture.ts` reserves slots *"deliberately unused by the filler"*; `candidate-retry.test.ts` AC-4 **passes and pins today's behaviour** on an all-17-blocked fixture. The finding is real and largely already written — arc42 §11 **R-4** has stated it since slice 04 — but the executed number is new: 35/200 bookings refused `409` with a bay and a technician free, **zero concurrency**. **arc42 §4.1** (*"a `409` therefore means the dealership was full"*) contradicts §11 R-4 and has since slice 04; that is my error and I correct it regardless of remedy.
>
> Remedy judged separately (§6.2) and **accepted conditionally**. Ordering by an occupancy snapshot is not check-then-act — a permutation cannot refuse — but that needs enforcing, so I require a property that `orderCandidates` returns an equal multiset for every `busy` and returns `null` only for an empty input. **ADR-0009 is superseded, not amended**: the ordering function's inputs change and two of its Consequences become false, including *"work is not balanced across resources"* — free-first **is** coarse load-aware allocation, which ADR-0009 rejected as out-of-scope scheduling policy and which the slice file must stop denying. **The cap stays 16**; raising it is the only thing that closes the residual *structurally*, and I record that rather than claim ordering closes it. Two new scenarios: **QS-15** (single-threaded, occupancy varied) and **QS-16** (concurrent at occupancy) — QS-16 is the falsifier for the burst-re-synchronisation objection, which remains unmeasured and which I rule on conditionally rather than dismiss.

---

```json
{
  "role": "architect",
  "outcome": "adjudicated",
  "arc42_sections_touched": [],
  "adrs": [],
  "quality_scenarios": ["QS-15", "QS-16"],
  "assumptions": [
    "busyResources' cost on the booking path is a few ms against a 100ms budget — asserted as AC-6, not assumed",
    "rescheduleAppointment passes an empty busy set in this slice, so the move path is behaviourally unchanged"
  ],
  "open_questions": [
    "Objection 6 — whether free-first ordering re-synchronises a concurrent burst at high occupancy — is unmeasured; QS-16 is its falsifier and it is a step-3 red, not a step-1 blocker",
    "Whether the human raises BOOKING_ATTEMPT_CAP above |bays|+|technicians| as well; that is the only change that closes the spurious refusal structurally and the cap's value is the human's"
  ],
  "dcr_ruling": "b",
  "message": "Finding AGREED and now executed — 17.5% of single-threaded bookings refused with capacity free at 90% occupancy — but it re-describes arc42 §11 R-4, written twelve slices ago; what is new is the magnitude, and that arc42 §4.1 asserts the opposite of R-4 two files away, which is my error. Ruled (b) because no AC, QS or §2 invariant fails: QS-3 sits at zero occupancy, QS-14 passes only because its fixture reserves unoccupied slots, and the AC-4 test pins today's behaviour deliberately on an all-blocked fixture whose refusal is not in fact spurious. Remedy accepted conditionally with three disagreements the orchestrator did not raise: free-first ordering IS coarse load-aware allocation and the slice may not keep claiming Order-D is 'still given up'; it restores the capped counter probabilistically, not structurally, so the retired ADR-0033's claim was too strong; and the real burst risk is not Order-A re-synchronisation but ADR-0004's never-refreshed snapshot front-loading the resources winners just took. ADR-0009 superseded, cap stays 16, QS-15 and QS-16 specified, seven AC changes stated and none made."
}
```

**Files read (absolute paths), for the second dispatch:** `/home/agentadmin/sources/keyloop-challenge/docs/adr/0009-candidate-ordering-and-attempt-cap.md`, `/home/agentadmin/sources/keyloop-challenge/docs/adr/0004-retry-across-remaining-candidates.md`, `/home/agentadmin/sources/keyloop-challenge/docs/adr/0018-lock-the-bay-and-the-technician-before-each-insert.md`, `/home/agentadmin/sources/keyloop-challenge/src/domain/candidates.ts`, `/home/agentadmin/sources/keyloop-challenge/src/application/attemptLoop.ts`, `/home/agentadmin/sources/keyloop-challenge/src/application/bookAppointment.ts`, `/home/agentadmin/sources/keyloop-challenge/src/application/queryAvailability.ts`, `/home/agentadmin/sources/keyloop-challenge/src/persistence/candidateRepository.ts`, `/home/agentadmin/sources/keyloop-challenge/src/persistence/appointmentRepository.ts`, `/home/agentadmin/sources/keyloop-challenge/docs/arc42/04-solution-strategy.md`, `/home/agentadmin/sources/keyloop-challenge/docs/arc42/10-quality-requirements.md`, `/home/agentadmin/sources/keyloop-challenge/docs/arc42/11-risks-technical-debt.md`, `/home/agentadmin/sources/keyloop-challenge/tests/acceptance/candidate-retry.test.ts`, `/home/agentadmin/sources/keyloop-challenge/tests/performance/availability-budget.test.ts`, `/home/agentadmin/sources/keyloop-challenge/tests/support/perfFixture.ts`, `/home/agentadmin/sources/keyloop-challenge/docs/slices/19-attempt-cap-sized-against-occupancy.md`, `/home/agentadmin/sources/keyloop-challenge/docs/slices/08-design.md`.
