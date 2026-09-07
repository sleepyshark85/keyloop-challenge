---
id: "07"
title: Rescheduling under contention — a refused move changes nothing, and never opens a window
status: ready
depends_on: ["06"]
arc42: ["§5.2", "§6.1", "§6.3", "§8.6", "§10", "§11"]
adr: [3, 18, 23, 26, 27, 29, 30, 31]
quality_scenarios: [QS-4, QS-5]
inherits: ["F-02-9", "A-05-6", "A-06-3", "O-41"]   # deferred here by ruling; slice:check enforces it (A-05-5)
loopbacks: 1
---

## Goal

The two properties that separate a correct move from one that merely looks correct in a
single-threaded test: a refused move leaves the original appointment exactly as it was, and a move
never transiently releases the slot it holds — not for an instant, under any interleaving.

QS-5 is the scenario that catches a cancel-then-insert implementation. That implementation passes
every test in slice 06.

## Acceptance criteria

- **AC-1** — Given A confirmed `[09:00, 10:00)` and the dealership fully booked at `[11:00, 12:00)`,
  when A is rescheduled to 11:00, then the request is refused **and** A is still `confirmed` at
  `[09:00, 10:00)` with the same id, bay and technician, **and the same `xmin` and `ctid`**.
  Asserted by reading the row, not the response. *(QS-4)*
  <br>`xmin` was added at step 1 and it is what makes *"unchanged"* mean **not written** rather than
  *no column differs*: a compensating cancel-then-restore passes column equality and fails this,
  `xmin` is not forgeable by application code, and an aborted attempt correctly leaves it untouched.
- **AC-2** — Given A holds the only bay at `[09:00, 10:00)`, when a reschedule of A to a fully-booked
  interval races *N* fresh bookings for `[09:00, 10:00)` **from a recorded seed**, then **no fresh
  booking is ever confirmed** — at every moment, under every interleaving, A's slot is occupied.
  *(QS-5)*
- **AC-3** — Given the racing scenario of AC-2, when it is run repeatedly with recorded seeds, then
  the result is stable across runs and a failure names the seed that produced it.
- **AC-4** — *(added at step 1; amended at step 5 under R-07-4)* Given A and B confirmed on
  **different** incumbent pairs, each contended at its own pair, so that each move's remaining
  candidate is the pair the other occupies over an overlapping interval, when both are rescheduled
  simultaneously from a barrier over **≥ 1000 contended attempts, with no more requests in flight at
  once than the service's connection pool can serve**, then **every attempt receives a database
  verdict — `23P01`, never `40P01`** — no response is `500`, no two confirmed rows overlap on a bay
  or a technician, and every refused move's row is unchanged including its `xmin`. *(QS-4, QS-5;
  ADR-0003's never-asserted claim; ADR-0030's control)*
  <br>**The in-flight bound is not a flake dodge.** 40 racers against a 10-client pool serialises
  the very simultaneity this criterion measures — a pair's two movers can be queued apart and never
  race — as well as manufacturing a codeless `500` the assertion then blames on a deadlock. So
  bounding concurrency should make the mutant control **stronger**; the unfixed-build rate is
  re-measured at the new shape, and **if it does not rise, that falsifies the reading and must be
  said.**
- **AC-5** — *(added at step 5)* **The lock set is derived from state the transaction itself
  observed.** Given a confirmed appointment at pair *P*, when a move of it is in flight between
  `lockResources` and its `UPDATE`, then the transaction holds advisory locks on ***P* as the row
  currently stands** — never on a pair read before the transaction opened. Asserted
  **deterministically off `pg_locks`**, joined against `hashtext` **inside one SQL statement** so that
  only resource ids cross into JavaScript — pulling `objid` out compares the catalogue's unsigned
  `oid` against `hashtext`'s signed `int4`, the same bits read two ways *(corrected at step 7,
  `R-07-13`)* — not by racing four movers into the stale interleaving: a probabilistic witness for a rule is the thing ADR-0030
  exists to replace, and ADR-0031's claim is about *where a value is read*, which `pg_locks` reads
  directly. *(QS-4; [ADR-0031](../adr/0031-a-move-reads-the-pair-it-leaves-inside-its-own-transaction.md)'s control)*
  <br>**Mutant control:** restore the pre-loop read and relocate the row between it and the attempt
  — the transaction then holds the *old* pair's keys, which the same assertion reads.

## Inherited scope — written here, not only where it was deferred

- **A-05-6 — two unkilled guards inside ADR-0016's only sanctioned cast site.**
  `src/persistence/pgError.ts` carries surviving `ConditionalExpression` mutants at **80:9**
  (`typeof code === 'string'`, the duck-typing guard that makes `classify` total over `unknown`) and
  **103:39** (`constraint !== undefined` on the `23P01` arm). Nothing hands `classify` an error whose
  `code` is not a string, and nothing hands it a `23P01` carrying no constraint name — so both guards
  are specified and unproven, which is §11 R-11's shape inside the one file where ADR-0016 permits a
  `ContendedResource` to be minted. **Slice 07 is the destination** because it is where `23P01`
  classification on the `UPDATE` path becomes live rather than historical: a reschedule racing a
  booking is the first execution reaching that arm from a second call site. Two unit cases, the
  implementer's; no production change is expected, and if one is needed that is the finding.

- **A concurrency test for racing moves** (ref `A-06-3`, deferred here at slice 06 step 1; the
  obligation originates in §8.2, where it was for a while the only record). Slice 00's AC-10 fixes
  the **single-threaded** `UPDATE` semantics; [ADR-0003](../adr/0003-cancellation-and-rescheduling-in-scope.md)
  claims two racing reschedules behave like two racing bookings — one commits, the other gets
  `23P01` — and **no scenario and no test asserts it**. QS-4 and QS-5 cover what a *refused* move
  leaves behind, QS-6 the self-overlap; the mirror of QS-1 on the `UPDATE` path is named by
  nothing. A `BEFORE UPDATE` trigger that passes everything slice 00 asserts and fails only under
  simultaneity is the proof the gap is real, and is the mutant control this test owes.
  **Why here rather than slice 06:** ADR-0019's criterion, and both halves are re-measurable on
  arrival (D-05-3's remedy). *Cheaper* — AC-2 already builds the barrier harness for a move racing
  *N* bookings, and racing moves is that harness with `UPDATE` on both sides. *Stronger* — it can
  assert alongside AC-1 that the loser's original is untouched, which is what makes *"one commits,
  one is refused"* mean something rather than count to one. **If either premise is false on
  arrival, say so in the PR**; that is what D-05-3 asked for.

- **F-02-9 — the second half: ADR-0018's two locks *raced* rather than argued.** Slice 06
  discharged its half with a stronger mechanism than the obligation asked for — `lockResources` is
  the only minting site for a value both writes require, so *"skipped the locks"* is a compile
  error. What it could not do is race it. Its discharge ruling surfaced one fact §3's deadlock
  argument never stated: **on attempts ≥ 2 a move vacates its incumbent pair while holding only the
  target pair's locks.** That is an argument today; here it meets two `UPDATE`s at once.

- **O-41 — the `Inherited scope` guard, built before this slice reached Ready.** A-05-5's check was
  a *subset* guard, not a *completeness* guard: slice 06 listed five obligations in prose while
  three of its four `inherits:` refs appeared nowhere but the front-matter line. The guard now runs
  **both ways**, with an explicit no-ref escape so it cannot demand an invented ref. Ruled at slice
  06 step 2 to land at this slice's dispatch so a Definition-of-Ready rule first bites on a file
  written under it — **it did, on this file, for `F-02-9`.** Nothing to build; the ruling and
  `tools/slice/check.mjs` carry the reasoning.

## In scope

- `tests/concurrency/refused-move-leaves-original.test.ts` and
  `tests/concurrency/move-never-releases-slot.test.ts`.
- Whatever the implementation must change to satisfy them — which, if slice 06 was built as
  specified, is nothing. A green run here on unchanged production code is the desired outcome and is
  evidence, not an empty slice.

## Out of scope

- Any new endpoint or field. This slice adds proof, not surface.

## Definition of done

Beyond `CLAUDE.md` §10:

- If no production code changed, the reviewer states that explicitly in the PR and the team log
  records it. A slice that adds only tests is a legitimate outcome when the tests are the deliverable
  — but it must be visible rather than look like an oversight.
