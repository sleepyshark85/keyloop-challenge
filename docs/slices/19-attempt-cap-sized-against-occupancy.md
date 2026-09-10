---
id: "19"
title: Size the attempt cap against occupancy, not contention depth alone
status: speccing
depends_on: ["16"]
arc42: ["§4.1", "§5.2", "§6.2", "§8.4", "§10", "§11.1"]
adr: ["0040"]
quality_scenarios: ["QS-3", "QS-14", "QS-15", "QS-16"]
loopbacks: 0
deferred_from: "H-19-1"
---

## Goal

[`ADR-0009`](../adr/0009-candidate-ordering-and-attempt-cap.md) sizes the attempt cap against
**contention depth**, calling it "the only driver Bound-2 leaves". It is not the only driver.

Bound-2 spends one attempt per *busy candidate resource discovered*, and a resource is busy whether a
racer took it microseconds ago or it was booked last week. **Occupancy is a second driver, independent
of concurrency and additive with it.** On a dealership where `|bays| + |technicians| - 1` exceeds the
cap of 16, a heavily-booked interval exhausts the cap before it exhausts the candidates, and the
request is refused while a free bay and a free technician both exist.

**This is not a discovery.** [`arc42 §11`](../arc42/11-risks-technical-debt.md) **R-4** has said it since
slice 04 — *"the attempt cap refuses while capacity exists, 16 being below ADR-0009's own `|bays| +
|technicians| − 1`, so a non-zero `capped` is expected rather than a signal"* — and the code implements
R-4 faithfully. What `H-19-1` adds is a **magnitude**, executed against real PostgreSQL: at 12 bays and
12 technicians with 11 of each already booked and **zero concurrency**, **35 of 200 seeds (17.5%) are
refused `409` with one bay and one technician free.** A residual that is one-in-a-thousand and a
residual that is one-in-six are different decisions wearing the same words.

It also surfaces a contradiction inside the document `CLAUDE.md` §4 names as the single source of truth.
[`arc42 §4.1`](../arc42/04-solution-strategy.md) says:

> A `409` therefore means the dealership was full rather than that the allocator guessed badly.

§11 R-4 says the opposite, and has since slice 04. **That is an architect error, owned at step 1**, and
it is correctable whichever remedy ships.

This slice makes a `409` mean what §4.1 says it means, and makes arc42 agree with itself.

## Acceptance criteria

- **AC-1** — Given a dealership with **12 service bays and 12 technicians** all qualified for one
  60-minute service type (so `|bays| + |technicians| - 1 = 23`, above the cap of 16), and an interval
  over which **11 bay/technician pairs are already `confirmed`**, when a single booking is requested
  for that interval with **no concurrency at all**, then it is **confirmed** — for each of **200
  distinct seeds**. *Measured red at 165/200 on the shipped ordering.*
- **AC-2** — Given the same dealership, when a booking is requested for that interval, then the
  **attempts made are p95 ≤ 2** for every `k ∈ {0, 3, 6, 9, 11}` pre-booked pairs.
- **AC-3a** — A wrong or stale occupancy snapshot changes only which candidate is tried **first**: it can
  cost attempts, and it cannot remove a candidate, empty a list, or mint a refusal of its own. Asserted
  **jointly and without a test-only seam** — structurally by **AC-3b**, over *arbitrary* `busy` including
  content contradicting the database, and behaviourally by **QS-16**, where the staleness is real because
  the racers make it so. *No fixture can pin a stale snapshot black-box: unlike QS-5's per-row lock there
  is no synchronisation point between the read and the insert to pause at, so staleness under real
  concurrency is probabilistic — which is QS-16 (`T-19-1`). And the guarantee is bounded rather than
  absolute: under a cap of 16 a sufficiently adversarial snapshot can still exhaust the cap while capacity
  exists — §11 R-4's residual, which ruling 4 reduces probabilistically and does not remove.*
- **AC-3b** — For every `(bays, technicians, busy, seed)`: `orderCandidates` returns lists that are an
  **equal multiset** to `orderCandidates(bays, technicians, [], seed)` — `busy` permutes and never
  removes — and returns `null` **iff** an input list is empty, so `busy` cannot reach the `null` exit
  that `bookAppointment` routes to `500`/`422`. *Without AC-3b nothing in the repository catches a later
  edit turning the ordering read into a filter; §2.1 cannot, because ADR-0018's per-resource lock makes
  a reintroduced check-then-act correct rather than merely harmless.*
- **AC-4** — QS-3 holds unchanged at every tuple it names, **and** QS-16's tuples hold: at 12+12 with
  `k` pairs pre-booked and *M* free of each remaining, *N* concurrent bookings released from a barrier
  confirm exactly `min(N, M)` for `(N, M, k) ∈ {(20, 1, 11), (20, 4, 8), (8, 8, 4), (20, 8, 4)}`. *QS-3's
  own tuples all sit at zero occupancy and cannot see a burst at high occupancy; this criterion is the
  falsifier for the re-synchronisation risk and it may fail. `(8,8,4)` and `(20,8,4)` share the largest
  free group, where the additive bound `2M − 1 = 15` sits one below the cap: the first is where a
  spurious refusal is most visible, the second where it is most likely to be produced (`T-19-2`).*
- **AC-5** — arc42 states what a `409` means under the amended mechanism, **§4.1's sentence is
  corrected**, **§6.2's opening sentence is corrected with it** — *"the reason a `409` means the
  dealership was full rather than the allocator guessed badly"* is §4.1's claim restated and the same
  measurement falsifies it (`O-19-1`); these two are the complete set in arc42 — **§11 R-4 is rewritten
  against the executed figure**, and the *"refusal is spurious BY
  DESIGN"* comment in `tests/acceptance/candidate-retry.test.ts` AC-4 is corrected — its fixture blocks
  all 17 bays **and** all 17 technicians, so its refusal is honest in outcome and merely mislabelled in
  `exit`. ADR-0009's successor records the option set; no accepted ADR's decision is edited.
- **AC-6** — QS-14 is **re-measured** against the **unchanged** performance fixture with the extra
  `SELECT` on the booking path: uncontended booking `< 100 ms` p95, availability query `< 200 ms` p95,
  and the figure recorded in arc42 §11 beside its machine class.
- **AC-7** — `rescheduleAppointment`'s outcomes are **unchanged**, so the move path cannot regress
  silently behind a booking-path change.
- **AC-8** — **QS-13's claims are re-sourced, not weakened** (`I-19-2`, ruled (a) at step 4). Free-first
  makes a conflict **unconstructible single-threaded while capacity exists** — `busyResources` shares
  the exclusion constraint's range predicate, dealership scope and `status <> 'cancelled'` filter, and
  `A-4` makes the two intervals identical — so slice 09's retry-then-succeed fixture has no
  deterministic construction any more. All three QS-13 claims survive, on three fixtures:
  **(i)** the **window** (`availability.candidates` ends before the first `appointment.insert`, and
  that span is not ERROR) stays on the two-bay fixture, which now confirms on attempt 1;
  **(ii)** the **waterfall** — every attempt an `appointment.insert` span with a distinct
  `booking.attempt`, `db.sqlstate=23P01`, a `db.constraint` in the exclusion pair, and ERROR status —
  moves to the **fully-blocked** fixture AC-4 already seeds, which is permutation-safe and needs no
  seed; **(iii)** `booking_conflicts_total{outcome=absorbed}` moves to the **reschedule** path, which
  ruling 5 leaves ordering from `EMPTY_OCCUPANCY` and so keeps ADR-0009's blind seeded shuffle.
  *Leg (iii) is ruled **in**, not traded away: without it a §10 metric claim drops silently to a unit
  test — evidence of the counting rule, not of the export path. Two traps, named so they are not
  rediscovered: `I-09-2`'s technician coin-flip, which slice 09 solved by de-qualifying the blocker;
  and reschedule's **lazy** seed draw, so the fixture must make the **incumbent pair itself** conflict
  before any shuffle happens. If leg (iii) proves unbuildable it is a DCR, never a silent drop.*

## In scope

- Candidate ordering and the cap's justification.
- ADR-0040, superseding ADR-0009.
- QS-15 and QS-16 in arc42 §10 — no scenario there varies occupancy today.
- Correcting arc42 §4.1 against §11 R-4.

## Out of scope

- The exclusion constraints, the advisory locks, Bound-2's prune rule, and the retry policy of
  ADR-0004. None is implicated: the finding is about which candidate is tried **first**.
- **An occupancy-aware reschedule.** `rescheduleAppointment` reaches `orderCandidates` lazily through
  `attemptLoop.ts`'s `'incumbent'` arm; its snapshot would be over the **new** interval while ADR-0030
  has the move **vacating** its own pair, so a naive snapshot is wrong about the requester itself. It
  passes an **empty** busy set here — one line, behaviour identical to today — and the question is
  booked as debt in §11 naming a live destination.
- **Raising `BOOKING_ATTEMPT_CAP`.** Not because it would not work: a cap at or above
  `|bays| + |technicians|` makes the spurious refusal **structurally unreachable**, since Bound-2
  guarantees a list empties by then. It is declined here because the cap is a **latency** guard rather
  than a termination guard — Bound-2 already bounds termination — and a cap of 40 makes a worst-case
  refusal cost 40 attempts at three round trips each. It stays available to the gate as one config
  value, and ADR-0040 must record that ordering restores the `capped` signal **probabilistically, not
  structurally**.
- **Continuous load balancing** — ordering by utilisation, ADR-0009's Order-D. *Free-first ordering
  **is** load-aware allocation at binary granularity and this slice does not pretend otherwise; what
  stays given up is continuous utilisation ordering, not occupancy awareness.*

## Definition of done

Beyond the standing DoD in `CLAUDE.md` §10, this slice additionally requires:

- The executed measurement behind `H-19-1` is reproducible from the repository, not quoted from a
  transcript — QS-15 is what makes it so.
- If QS-16 falsifies free-first ordering at any tuple, that is a loopback and it is taken. 0 of 2 spent.
