# Slice 07 — design, as built

Slice file: [`07-reschedule-under-contention.md`](07-reschedule-under-contention.md). Merged with
[**ADR-0030**](../adr/0030-a-move-locks-the-pair-it-leaves-as-well-as-the-pair-it-takes.md) and
[**ADR-0031**](../adr/0031-a-move-reads-the-pair-it-leaves-inside-its-own-transaction.md), both
`accepted`. arc42 §5.2, §6.1, §6.3, §8.6, §10 and §11 now describe the system; this file is the
record of what was decided, measured and ruled.

## What the slice turned out to be

Accepted as potentially proof-only, and it was not. `F-02-9` asked for ADR-0018's locks to be
**raced** rather than argued; the race was run at step 1 and came back negative — **11.7 % of
contended move attempts returned `40P01`, and so `500`**, with every ADR-0018 lock taken and none
skipped. ADR-0030 holds the measurement and the rule that followed. Step 5 then found that rule
itself violable: the lock set was computed from a read taken *before* the transaction opened, so a
row moved underneath left a mover holding a stale set, and two such movers cycle. ADR-0031 closed
it, and the loopback is declared (`loopbacks: 1`).

## Decisions, and the shape of the proof

**Three independent witnesses for *never opens a window***, because a before/after read of the row is
satisfied by an implementation that released the slot and put it back: the racing bookings themselves
(AC-2 — only a *committed* release is observable, which is why QS-5 is a race and not a poll); `xmin`
and `ctid` on the refused row (AC-1 — *not written*, which a compensating cancel-then-restore fails
and application code cannot forge); and slice 06's statement-count trigger, re-run under contention.

**Two test files, no third.** The racing-move cases land in
`tests/concurrency/refused-move-leaves-original.test.ts` under QS-4 — a third file would need a §10
row to name it, and §10 had no headroom.

**Production code did change**: `lockResources` and the new `lockAppointmentRow` in
`appointmentRepository.ts`, one argument at each of the two call sites. No migration, no data-model
delta, no `.dependency-cruiser.js` change, no endpoint or field.

**The barrier harness is reusable; its fixture is not.** AC-2 races a move against bookings, which is
one-directional and cannot close a cycle — measured, 660 / 660 `23P01`, zero `40P01`. Racing *moves*
needs a mutual-vacate fixture with both movers past attempt 1. And the barrier must be released
**before** the advisory locks: the locks are themselves a serialisation point, so a barrier placed
after them never fires.

## Interfaces, as built

```ts
export function lockResources(db: Db, take: ResourcePair, leave: ResourcePair | null): Promise<ResourceLock>;
export function lockAppointmentRow(db: Db, id: string): Promise<ResourcePair>;
```

`leave` is required, so omission is `TS2554`, and `null` only where the write vacates nothing. Keys
are deduplicated and acquired in one statement ordered by `(class, hashtext(key))` — a total order
over a shared key space, which is what stops the enlarged lock set cycling on itself. A move reads
`leave` through `lockAppointmentRow` inside its own transaction: **row lock, advisory locks, write**.
`cancelAppointmentById` still takes nothing (ADR-0023).

## Acceptance criteria — what moved, and what proves it

AC-1 gained `xmin` and `ctid`; AC-2 a seed clause; **AC-4** (racing moves) was added at step 1 and
amended at step 5 under `R-07-4` to bound in-flight requests by the connection pool; **AC-5** was
added at step 5 as ADR-0031's control. The slice file carries their text. Each was ruled under the
architect's mid-slice authority and is provisional until the gate.

**AC-5's assertion mechanism, corrected here (`R-07-13`).** `pg_locks` is joined against `hashtext`
**inside one SQL statement**, and what crosses into JavaScript is the resource ids. Pulling `objid`
and `hashtext(...)` into JavaScript instead compares the catalogue's unsigned `oid` against a signed
`int4` — the same bits read two ways, false whenever the hash is negative. The earlier wording
(*"`classid`/`objid` against `hashtext`"*) described the instrument the DCR removed.

**Mutant controls.** AC-4's: revert `lockResources` to the target pair only. Re-measured at the
bounded shape — 56 / 3000 ≈ **1.87 %** (95 % CI 1.38–2.35) against the unbounded 41 / 7800 ≈ 0.5 %
(0.27–0.80), disjoint intervals, with a 0 / 1000 positive control on the fixed build. AC-5's: restore
the pre-loop read and relocate the row between it and the attempt; executed by the reviewer at step 5
against a reverted build — the P2 claim fails with the P1 witness intact.

## Inherited obligations

| Ref | Disposition |
|---|---|
| **O-41** | Discharged before Ready, bidirectional, and it bit on this file |
| **A-06-3** | Landed as AC-4; both premises re-measured below |
| **F-02-9** | **Discharged** — by measurement *and* by two fixes. The rule it stated is corrected: *take both locks* was necessary, not sufficient. §11 carries it |
| **A-05-6** | **Discharged.** Two directed unit cases for `pgError.ts:80:9` and `103:39`. Both mutants survive as ADR-0016's equivalent-mutant residue: predicted at step 2 before code existed, argued analytically at step 4, differential-tested over 254 adversarial inputs at step 5 with no distinguishing input. `R-07-7` is the production change the obligation said would be the finding if one were needed |

**A-06-3's two premises, re-measured (D-05-3's remedy).** *Cheaper* — **false**: the barrier mechanism
is shared, the fixture is not, and AC-4 reaches a failure AC-2 provably cannot. The deferral was still
right, for a reason nobody wrote down — slice 06 had no barrier at all, so the test was not cheaper
here, it was impossible there. *Stronger* — **true**, and more than claimed: `xmin` upgrades
*untouched* from *unchanged values* to *not written*.

## arc42, and what paid for it

| Section | What changed | Paid by |
|---|---|---|
| §5.2 | `lockResources` locks every resource the write is in flight against; `lockAppointmentRow` added | the F-05-1 recap, which ADR-0026 holds |
| §6.1 | *"a deadlock can only mean a write path skipped them"* re-grounded on ADR-0030 | §6.1's re-narration of the fourth lock cell, which §11 D-02-1 holds |
| §6.3 | the one-mechanism claim replaced by the two-pair rule, the in-transaction read, and the two mechanisms that keep it acyclic | the sentence it replaces |
| §8.6 | the `500` row's `40P01` clause re-grounded | `GET /nope`'s before-and-after narration |
| §10 | QS-4 gains `xmin`/`ctid` and the racing-move instance, QS-5 *no move answers `500`*, the preamble the in-flight bound | QS-5's cancel-then-insert sentence and QS-1's observer recap, which §8.5 holds |
| §11 | F-02-9 rewritten to discharged; `D-07-1` booked; R-1 and R-7i corrected | the register-reading preamble, R-12's survivor-list line, two provenance clauses |

## Rulings

**Step 5** — the reviewer returned changes-requested with no DCR, so these are findings on the diff,
ruled under mid-slice authority and provisional until the gate. `R-07-1` **upheld against the design
rather than the build** — §3 specified the stale read in the words the implementer built, so what
departed was ADR-0030; remedy ADR-0031, plus a declared loopback. `R-07-2` upheld in full: deadlock
freedom rests on **two** mechanisms and the docblock collapsed them into one. `R-07-4` upheld with
the remedy re-aimed — not fewer racers to dodge a flake, but a bound that stops the pool queueing a
pair's two movers apart; the prediction was put up to be falsified and was confirmed. `R-07-7`
upheld and in scope by `A-05-6`'s own words. `R-07-10` rejected: repository governance tooling is
out-of-band, and whether that belongs in `CLAUDE.md` §10 is the gate's (`A-06-6`). The AC-5 DCR was
ruled **(a)** — the design was right and the instrument was wrong.

**Step 7** — `D-07-1` is deferred to **slice 09** (`O-53`: slice 11 is a tombstone Gate D folded into
09). `R-07-12` rides with it in §11's `D-07-1` row. `R-07-13` is corrected above and in the slice
file. `O-54` goes to the retro with the reviewer's narrowing.

**Third occurrence of one shape**, for the retro: the slice-06 discharge ruling, ADR-0030's symmetry
claim, and `R-07-1`. Each states something true **within** one transaction as though it were true
**across** them. `A-07-3` generalises it to four boundaries, one of them a type boundary.

## Open questions and risks

- **`OQ-07-1` — resolved.** A `docs:budget` failure at 893 / 800 that four later runs did not
  reproduce was the orchestrator editing slices 07 and 08 between runs (`33d2e52`). The tool reported
  what was true when it ran, twice. Kept because an unreproducible failure nobody explains is how a
  real one gets dismissed the second time, and because the shape is worth naming: **a shared file
  edited while an agent reads it produces an observation that is correct and unrepeatable.**
- The lock statement relies on evaluation order following the subquery's `ORDER BY`, as ADR-0018's
  `unnest` already did; the difference is that a violation now costs an advisory cycle. AC-4 catches
  it, a `40P01` either way — measured 0 / 1000.
- A move past attempt 1 serialises against four keys and takes a row lock ahead of the advisory
  queue, so a cancel of the same appointment waits behind a mover. Bookings are the volume and are
  untouched; §11 R-1 carries it.
