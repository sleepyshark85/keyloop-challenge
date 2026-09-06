# Slice 07 — design

Slice file: [`07-reschedule-under-contention.md`](07-reschedule-under-contention.md).
New: [**ADR-0030**](../adr/0030-a-move-locks-the-pair-it-leaves-as-well-as-the-pair-it-takes.md),
`accepted`. Provisional until this slice's gate, like every mid-slice ruling.

**This slice was accepted as potentially proof-only. It is not.** The race that `F-02-9` asked for
was run at step 1 and came back negative: **11.7 % of contended move attempts return `40P01` and
therefore `500`**, with every ADR-0018 lock taken and none skipped. The fix is ADR-0030 and it is
about fifteen lines of production code. Declared here rather than discovered at step 5, which is
what the slice file asked for.

## 1 · The measurement, before the design

Two moves past attempt 1, each targeting the pair the other currently occupies over an overlapping
interval. Each holds ADR-0018's two advisory locks **on its target pair**. Each `UPDATE` runs an
exclusion check that finds the other's *vacated but uncommitted* index entry, whose `xmax` is a
live transaction, and waits on it. Both wait. PostgreSQL breaks the cycle with `40P01`.

`postgres:16-alpine`, this repository's constraint definitions, 20 mutually-vacating pairs from one
barrier, 25 trials:

| Locks a move takes | `23P01` | `40P01` |
|---|---|---|
| the target pair — as built | 883 / 1000 | **117** |
| the union of incumbent and target | **1000 / 1000** | 0 |

The deadlock report is a mutual `ShareLock on transaction`, not an advisory key. Uncontended cost:
600 moves, p50 2.25 ms target-only against 1.90 ms union — one statement either way.

**The slice-06 discharge ruling got this wrong, and this is the correction.** It said *"no cycle is
possible… vacating writes no index entry another transaction waits on"*. Vacating writes no **new**
entry; the **old** one stays live until commit, and ADR-0023's own M1 had already measured a
conflicting writer waiting on exactly that. A move is both a waiter and a wait-upon. ADR-0030 holds
the rule that follows.

## 2 · The three decisions

**2.1 — What "never opens a window" is asserted by.** Three independent witnesses, each able to
fail, because a before/after read of the row is satisfied by an implementation that released the
slot and put it back.

1. **The racing bookings are the observer** (AC-2). A release that ever *commits* is observed by
   somebody taking the slot. Nothing else can see a committed window: an observer polling under
   `READ COMMITTED` cannot see an uncommitted one, and a release that never commits is not a
   window. This is why QS-5 is written as a race and not as a poll.
2. **`xmin` on the refused row** (AC-1, new). A refused move must leave the row's `xmin` and `ctid`
   unchanged — **nothing was written**, not merely *nothing differs*. A compensating
   cancel-then-restore passes a column-equality assertion and fails this one, and `xmin` is not
   forgeable by application code. An aborted transaction also leaves them unchanged, which is
   correct: an abort is not a window.
3. **The statement-count trigger already merged** for slice 06 AC-2, re-run under contention.

**2.2 — One test or two, and does either need production code.** *Two files, as the slice file
already names, and no third.* The racing-moves cases (`A-06-3`) go into
`tests/concurrency/refused-move-leaves-original.test.ts` under **QS-4**, because both of them are
that scenario's adversarial instance: the loser of a shared-target race, and both losers of a
mutual-vacate race, must be *unchanged* — and "refused" must mean `409`, not `500`. A third file
would need a §10 row to name it, §10 has no headroom, and an unnamed test file breaks `docs:refs`.

**Production code: yes.** ADR-0030, in `src/persistence/appointmentRepository.ts` (the lock
statement and `lockResources`' signature), one argument at `bookAppointment.ts`'s call site and one
at `rescheduleAppointment.ts`'s. No migration, no data-model delta, no `.dependency-cruiser.js`
change, no new module, no endpoint or field.

**2.3 — What the barrier harness actually is.** Measured, not assumed:

- **Reusable:** the mechanism — *N* in-flight requests over pooled connections, one barrier, assert
  over the **table** and the emitted `booking.conflict` lines rather than over responses, seed fixed
  and printed (AC-3).
- **Not reusable, and this is the correction:** the **fixture**. AC-2 races a move against
  bookings, which is one-directional — a booking is in flight against one pair and cannot close a
  cycle. Measured: 60 trials of one move against 10 bookings gave 660 / 660 `23P01`, zero `40P01`,
  and A's slot occupied in 60 / 60. Racing *moves* needs a mutual-vacate fixture with **both**
  movers past attempt 1, which under ADR-0027 means both incumbent pairs must already be contended.
- **A constraint nobody had written down:** the barrier must be released **before** ADR-0018's
  locks are taken. The locks are themselves a serialisation point, so a racer that must wait for
  one never reaches a barrier placed after them and the barrier never fires. Found by hanging a
  harness on it. The existing concurrency tests race whole HTTP requests and are already on the
  right side of this; the racing-moves fixture must stay there.

## 3 · Interfaces and building blocks

Only `§5.2`'s persistence row changes shape:

```ts
// src/persistence/appointmentRepository.ts
export interface ResourcePair { readonly bayId: string; readonly technicianId: string }

/** ADR-0030 — `leave` is REQUIRED so omission is TS2554, and is `null` only where the write
 *  vacates nothing. `ResourceLock` is unchanged: it still carries the pair the write writes. */
export function lockResources(db: Db, take: ResourcePair, leave: ResourcePair | null): Promise<ResourceLock>;
```

```sql
SELECT pg_advisory_xact_lock(cl, k)
FROM (SELECT DISTINCT cl, hashtext(key) AS k
      FROM unnest($1::int[], $2::text[]) AS t(cl, key)
      ORDER BY cl, hashtext(key)) o;   -- verified: 4 keys → 3 locks, deduplicated and ordered
```

`bookAppointment` passes `null`; `rescheduleAppointment` passes `{ bayId: existing.bayId,
technicianId: existing.technicianId }`, which is constant across attempts because every prior
attempt aborted. At attempt 1 the two pairs coincide and dedupe to today's two keys, so booking and
first attempts are byte-for-byte unchanged. `cancelAppointmentById` still calls nothing (ADR-0023).

The parameter's exact spelling is the implementer's inside three constraints: **omission must not
compile**, the keys are **deduplicated**, and they are acquired in **one statement ordered by
`(class, hashtext(key))`** — a total order over a shared key space, which is what stops the
enlarged lock set from cycling on itself.

## 4 · Acceptance criteria

AC-1 to AC-3 stand. Two amendments and one addition, under the architect's mid-slice authority,
provisional until the gate:

- **AC-1 gains `xmin`** — *"…with the same id, bay and technician, **and the same `xmin` and
  `ctid`**"*. §2.1 above is why.
- **AC-2 gains a seed clause** only to match AC-3; no change of substance.
- **AC-4 (new) — racing moves.** Given A and B confirmed on **different** incumbent pairs, each
  contended at its own pair, so that each move's remaining candidate is the pair the other occupies
  over an overlapping interval, when both are rescheduled simultaneously from a barrier at *P* = 20
  independent pairs over ≥ 25 trials, then **every attempt receives a database verdict — `23P01`,
  never `40P01`** — no response is `500`, no two confirmed rows overlap on a bay or a technician,
  and every refused move's row is unchanged including its `xmin`. *(QS-4, QS-5; ADR-0003's
  never-asserted claim; ADR-0030's control)*

**AC-4's mutant control is already measured**: reverting `lockResources` to lock the target pair
only produces ~117 `40P01` in 1000 attempts, so the criterion discriminates rather than passing
vacuously. A `40P01` from a *lock-ordering* mistake is caught by the same assertion.

## 5 · Inherited obligations — disposition

| Ref | Disposition |
|---|---|
| **O-41** | **Discharged.** Built before Ready, bidirectional, and `slice:check 07` reports *"4 bullet(s), every ref in `inherits:` named in one"*. Nothing to build |
| **A-06-3** | **Landed here**, in `refused-move-leaves-original.test.ts` as AC-4. Its two premises are re-measured in §6 below |
| **F-02-9** | **Discharged by measurement, and the rule it states is corrected** — *take both locks* was necessary, not sufficient. ADR-0030 restates it as *lock every resource the write is in flight against*. §11's entry is rewritten, not extended |
| **A-05-6** | Unchanged and still the implementer's: two unit cases in `tests/unit/persistence/pgError.test.ts` for `pgError.ts:80:9` and `103:39`. No production change expected. **One is now due anyway**: `classify`'s docblock repeats the premise ADR-0030 falsifies (*"a deadlock can only mean a write path skipped them"*), as does `rescheduleAppointment.ts`'s `no-verdict` arm. `src/` is not the architect's to edit — D-06-4's shape, and both belong in the implementer's pass |

## 6 · A-06-3's two premises, re-measured (D-05-3's remedy)

- **"Cheaper — AC-2 already builds the harness, and racing moves is that harness with `UPDATE` on
  both sides." FALSE.** The barrier mechanism is shared; the fixture is not, and the failure mode
  AC-4 reaches is one AC-2 provably cannot (§2.3, 660 / 660). The deferral was still right, for a
  reason nobody wrote down: slice 06 had no barrier at all, so this test was not merely cheaper
  here, it was impossible there.
- **"Stronger — it can assert alongside AC-1 that the loser's original is untouched." TRUE**, and
  stronger than claimed: `xmin` upgrades *untouched* from *unchanged values* to *not written*.

## 7 · arc42, and what pays for it

§5, §8, §10 and §11 are at or over their ceilings and **may not grow**; §6 has 30 words. Every edit
below is a correction in place, and three of them delete a sentence that is now false.

| Section | Edit | Paid by |
|---|---|---|
| **§6.1** | *"a deadlock can only mean a write path skipped them"* → the ADR-0030 reading | the same sentence |
| **§6.3** | *"A move racing another move… is the §6.1 story with `UPDATE` in place of `INSERT`: the same two advisory locks precede it. One mechanism; rescheduling adds none."* is **false** and is replaced by the two-pair rule | itself, and it shortens |
| **§5.2** | `lockResources`' row gains *"and, for a move, the pair it vacates"* | trimming the same row's `F-05-1` recap, which ADR-0026 already holds |
| **§8.6** | the `500` row's *"as does a `40P01` under ADR-0018's locks"* is re-grounded | the same clause |
| **§10** | QS-4 gains the `xmin` witness and the racing-moves instance; QS-5 gains *"and no move ever answers `500`"* | QS-5's *"This is the scenario that would catch a cancel-then-insert move…"*, which §6.3's table and this slice's goal both already say |
| **§11** | `F-02-9`'s entry is **rewritten to discharged**, carrying the corrected rule | itself; no new row, and the deadlock is closed rather than booked |

## 8 · Front matter, for the orchestrator

Do not take these from prose; this is the list.

- `arc42: ["§5.2", "§6.1", "§6.3", "§8.6", "§10", "§11"]` — was `["§6.3"]`
- `adr: [3, 18, 23, 26, 27, 29, 30]` — was `[3]`
- `quality_scenarios: [QS-4, QS-5]` — unchanged
- `inherits: ["F-02-9", "A-05-6", "A-06-3", "O-41"]` — unchanged
- `loopbacks: 0` — unchanged; nothing here is a loopback, because nothing was built to loop back to

## 9 · Risks this slice carries

- **The lock statement relies on evaluation order** following the subquery's `ORDER BY`. So did
  ADR-0018's `unnest`; the difference is that a violation now costs an advisory cycle rather than
  nothing. AC-4 catches it, since that is a `40P01` too. Measured 0 / 1000.
- **A move past attempt 1 serialises against four keys**, up to twice ADR-0018's ceiling. Bookings
  are the volume and are untouched; QS-14's budget is a booking budget.

## 10 · Open questions

- **`OQ-07-1` — the 893 / 800 budget report was not a flake, and the tool was right every time.
  RESOLVED.** The first `docs:budget --check --ratchet` run of this step reported
  `slices/07-reschedule-under-contention.md` at 893 / 800 and *"1 document GREW past its ceiling"*;
  four later runs exited 0. The architect recorded it as unexplained. The cause was the
  orchestrator adding inherited-scope bullets to slices 07 and 08 to satisfy O-41's new guard —
  07 to 893, 08 to 802 — and trimming both back under at `33d2e52`, **between the two runs**. The
  tree changed under a running agent. The tool reported what was true when it ran, twice.

  Kept rather than deleted for two reasons. An unreproducible failure that nobody explains is how
  a real one gets dismissed the second time it appears, and this one was one run away from being
  filed as tool flakiness in a repository whose most important guarantees are measurements. And
  the shape is worth naming beside `A-07-1`: **a shared file edited while an agent is reading it
  produces an observation that is correct and unrepeatable**, which is indistinguishable from a
  bad tool right up until someone finds the commit.
