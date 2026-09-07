# Slice 07 — design, as built

Slice file: [`07-reschedule-under-contention.md`](07-reschedule-under-contention.md). Merged with
[**ADR-0030**](../adr/0030-a-move-locks-the-pair-it-leaves-as-well-as-the-pair-it-takes.md),
`accepted`, **which §2 completes**. arc42 §5.2, §6.1, §6.3, §8.6, §10 and §11 now describe the
system; this file records what was decided, measured and ruled.

## What the slice turned out to be

Accepted as potentially proof-only, and it was not. `F-02-9` asked for ADR-0018's locks to be
**raced** rather than argued; the race ran at step 1 and came back negative — **11.7 % of contended
move attempts returned `40P01`, and so `500`**, with every lock taken and none skipped. ADR-0030 holds
that measurement and the rule that followed: a write locks every resource it is **in flight against**,
the pair it leaves as well as the pair it takes. Step 5 found that rule itself violable, §2 is the
correction, and the loopback is declared (`loopbacks: 1`).

## 2. ADR-0030 is incomplete as written, and this is its missing half

`rescheduleAppointment` computed the pair it leaves **once, before the attempt loop**, justified as
*"constant across every attempt, because every prior attempt aborted"* — true of one request's
attempts and silent about another's commit. A committed move of the same row between that read and
this attempt's `UPDATE` leaves the value naming a pair the row has left; the `UPDATE` guards only
`id` and `status`, so it succeeds and vacates the row's **actual** pair holding no lock on it.
ADR-0030's rule is then false at the one path it governs.

**The cycle needs two stale movers, one per edge.** `T` moves `A` (at `bay2/tech1`, read as
`bay9/tech9`) to `bay0/tech0`; `T'` moves `A'` (at `bay0/tech3`, read as `bay8/tech8`) to
`bay2/tech2`. Their advisory sets are disjoint, so both reach their writes; `T` then waits on `A'`'s entry at
`bay0`, whose `xmax` is `T'`, and `T'` on `A`'s at `bay2`. One stale mover plus a booking does not close: a
transaction can only tuple-wait inside its **take** pair's scope, and every path locking what it is in
flight against is already queued behind that pair's lock.

**So the pair a move leaves is read inside the attempt's transaction, under the row's own lock.**
That read is total — ids are minted and rows never deleted — so it yields a pair or throws, adding no
outcome. Lock order becomes **row lock, advisory locks, write**, which keeps the addition acyclic: a
transaction holding an advisory lock never afterwards waits for a row lock. Attempt 1's **take** stays
the incumbent pair, correctness needing `leave` current rather than `take`; where the row did move it
locks four keys instead of two, bounded and rare. Carrying the expected pair in the
`UPDATE`'s `WHERE` was refused because a zero-row result would then mean *not confirmed* **or** *moved
under us* — the ambiguity ADR-0025 exists to prevent, resolvable only by the follow-up read that
record forbids. Booking it as rare was refused because rarity is what this slice corrects: 11.7 % was
rare until it was measured. Cost: three statements per attempt, and a cancel of the same appointment
now waits behind a mover's advisory queue rather than its `UPDATE` alone.

## Decisions, and the shape of the proof

**Three independent witnesses for *never opens a window***, a before/after read of the row being
satisfied by an implementation that released the slot and put it back: the racing bookings themselves
(AC-2 — only a *committed* release is observable, which is why QS-5 is a race and not a poll); `xmin`
and `ctid` on the refused row (AC-1 — *not written*, which a compensating cancel-then-restore fails
and application code cannot forge); and slice 06's statement-count trigger.

**Two test files, no third.** The racing-move cases land in
`tests/concurrency/refused-move-leaves-original.test.ts` under QS-4; a third would need a §10 row,
and §10 had no headroom.

**Production code did change**: `lockResources` and the new `lockAppointmentRow`, one argument at each
call site. No migration, no data-model delta, no `.dependency-cruiser.js` change.

**The barrier harness is reusable; its fixture is not.** AC-2 races a move against bookings, which is
one-directional and cannot cycle — measured, 660 / 660 `23P01`, zero `40P01`. Racing *moves* needs a
mutual-vacate fixture with both movers past attempt 1, and the barrier must release **before** the
advisory locks, themselves a serialisation point.

## Interfaces, as built

```ts
export function lockResources(db: Db, take: ResourcePair, leave: ResourcePair | null): Promise<ResourceLock>;
export function lockAppointmentRow(db: Db, id: string): Promise<ResourcePair>;
```

`leave` is required, so omission is `TS2554`, and `null` only where the write vacates nothing. Keys
are deduplicated and acquired in one statement ordered by `(class, hashtext(key))` — a total order
over a shared key space, which stops the enlarged lock set cycling on itself.

## Acceptance criteria — what moved, and what proves it

AC-1 gained `xmin` and `ctid`, AC-2 a seed clause, **AC-4** (racing moves) was added at step 1 and
bounded by the connection pool at step 5 under `R-07-4`, and **AC-5** added as §2's control. The slice
file carries their text; each is provisional until the gate.

**AC-5's assertion mechanism, corrected here (`R-07-13`).** `pg_locks` is joined against `hashtext`
**inside one SQL statement**, only resource ids crossing into JavaScript. Pulling `objid` and
`hashtext(...)` out instead compares the catalogue's unsigned `oid` against a signed `int4` — the
same bits read two ways, false whenever the hash is negative.

**Mutant controls.** AC-4's reverts `lockResources` to the target pair only: 56 / 3000 ≈ **1.87 %**
(95 % CI 1.38–2.35) at the bounded shape against the unbounded 41 / 7800 ≈ 0.5 % (0.27–0.80),
disjoint intervals, with a 0 / 1000 positive control on the fixed build. AC-5's restores the pre-loop
read and relocates the row between it and the attempt, run by the reviewer against a reverted build —
the P2 claim fails with the P1 witness intact.

## Inherited obligations

| Ref | Disposition |
|---|---|
| **O-41** | Discharged before Ready, bidirectional; it bit on this file |
| **A-06-3** | Landed as AC-4, both premises re-measured below |
| **F-02-9** | **Discharged** by measurement *and* two fixes; the rule it stated is corrected, *take both locks* being necessary and not sufficient. §11 carries it |
| **A-05-6** | **Discharged.** Two directed unit cases for `pgError.ts:80:9` and `103:39`; both mutants survive as ADR-0016's equivalent-mutant residue — predicted at step 2 before code existed, argued at step 4, differential-tested over 254 adversarial inputs with no distinguishing input. `R-07-7` is the production change the obligation said would be the finding |

**A-06-3's two premises, re-measured (D-05-3's remedy).** *Cheaper* — **false**: the barrier is
shared, the fixture is not, and AC-4 reaches a failure AC-2 provably cannot. The deferral was still
right for a reason nobody wrote down — slice 06 had no barrier, so the test was impossible there
rather than dearer. *Stronger* — **true**, and more than claimed: `xmin` upgrades *untouched* from
*unchanged values* to *not written*.

## Rulings

**Step 5** — the reviewer returned changes-requested with no DCR, so these are findings on the diff,
ruled under mid-slice authority and provisional until the gate. `R-07-1` **upheld against the design
rather than the build**: this file specified the stale read in the words the implementer built, so
what departed was ADR-0030, and §2 is the remedy, with a declared loopback. `R-07-2` upheld —
deadlock freedom rests on **two** mechanisms and the docblock collapsed them into one. `R-07-4` upheld
with the remedy re-aimed: not fewer racers to dodge a flake, but a bound stopping the pool queueing a
pair's two movers apart — a prediction put up to be falsified and confirmed. `R-07-7` upheld, in
scope by `A-05-6`'s own words; `R-07-10` rejected, repository governance tooling being out-of-band
and whether it belongs in `CLAUDE.md` §10 the gate's (`A-06-6`); the AC-5 DCR **(a)**, the design
right and the instrument wrong.

**Step 7** — `D-07-1` is deferred to **slice 09** (`O-53`: slice 11 is a tombstone folded into 09),
`R-07-12` riding with it in §11's row; `R-07-13` is corrected above, `O-54` goes to the retro.

**Third occurrence of one shape**, for the retro: the slice-06 discharge ruling, ADR-0030's symmetry
claim and `R-07-1` each state something true **within** one transaction as though it were true
**across** them. `A-07-3` generalises it to four boundaries, one a type boundary.

## Open questions and risks

- **`OQ-07-1` — resolved.** An unreproducible `docs:budget` failure at 893 / 800 was the orchestrator
  editing slices 07 and 08 between runs (`33d2e52`). Named because the shape recurs: **a shared file
  edited while an agent reads it produces an observation that is correct and unrepeatable.**
- The lock statement relies on evaluation order following the subquery's `ORDER BY`, as ADR-0018's
  `unnest` did; the difference is that a violation now costs an advisory cycle. AC-4 catches it, a
  `40P01` either way — measured 0 / 1000.
