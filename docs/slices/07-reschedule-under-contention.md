---
id: "07"
title: Rescheduling under contention — a refused move changes nothing, and never opens a window
status: done
depends_on: ["06"]
arc42: ["§5.2", "§6.1", "§6.3", "§8.6", "§10", "§11"]
adr: [3, 18, 30]
quality_scenarios: [QS-4, QS-5]
inherits: ["F-02-9", "A-05-6", "A-06-3", "O-41"]   # deferred here by ruling; slice:check enforces it
loopbacks: 1
---

## Goal

Two properties separate a correct move from one that merely looks correct in a single-threaded test:
a refused move leaves the original appointment exactly as it was, and a move never transiently
releases the slot it holds — not for an instant, under any interleaving.

The second is the scenario that catches a move implemented as a cancel followed by an insert. That
implementation passes every test in the previous slice.

## Acceptance criteria

- **AC-1** — Given A confirmed `[09:00, 10:00)` and the dealership fully booked at `[11:00, 12:00)`,
  when A is rescheduled to 11:00, then the request is refused **and** A is still `confirmed` at
  `[09:00, 10:00)` with the same id, bay and technician, **and the same `xmin` and `ctid`**.
  Asserted by reading the row, not the response. *(QS-4)*
  <br>`xmin` is what makes *unchanged* mean **not written** rather than *no column differs*. A
  compensating cancel-then-restore passes column equality and fails this; application code cannot
  forge `xmin`; and an attempt that aborts correctly leaves it untouched.
- **AC-2** — Given A holds the only bay at `[09:00, 10:00)`, when a reschedule of A to a fully-booked
  interval races *N* fresh bookings for `[09:00, 10:00)` **from a recorded seed**, then **no fresh
  booking is ever confirmed** — at every moment, under every interleaving, A's slot is occupied.
  *(QS-5)*
- **AC-3** — Given the racing scenario of AC-2, when it is run repeatedly with recorded seeds, then
  the result is stable across runs and a failure names the seed that produced it.
- **AC-4** — Given A and B confirmed on **different** bay-and-technician pairs, each contended at its
  own pair, so that each move's remaining candidate is the pair the other occupies over an
  overlapping interval, when both are rescheduled simultaneously from a barrier over **≥ 1000
  contended attempts, with no more requests in flight at once than the service's connection pool can
  serve**, then **every attempt receives a database verdict — an exclusion violation, never a
  deadlock** — no response is `500`, no two confirmed rows overlap on a bay or a technician, and
  every refused move's row is unchanged including its `xmin`. *(QS-4, QS-5)*
  <br>**The in-flight bound is not a flake dodge.** Forty racers against a ten-client pool serialises
  the very simultaneity this criterion measures — a pair's two movers can be queued apart and never
  race — as well as manufacturing a `500` with no SQLSTATE that the assertion would then blame on a
  deadlock. So bounding concurrency should make the mutant control **stronger**; the rate at which
  the unfixed build fails is re-measured at the new shape, and **if it does not rise, that falsifies
  the reading and must be said.**
- **AC-5** — **The lock set is derived from state the transaction itself observed.** Given a
  confirmed appointment at pair *P*, when a move of it is in flight between taking its locks and its
  `UPDATE`, then the transaction holds advisory locks on ***P* as the row currently stands** — never
  on a pair read before the transaction opened. Asserted **deterministically off `pg_locks`**, joined
  against the hash function **inside one SQL statement** so that only resource ids cross into
  JavaScript; pulling the lock's object id out instead compares the catalogue's unsigned value
  against a signed one, the same bits read two ways. It is not asserted by racing four movers into
  the stale interleaving: a probabilistic witness for a rule is what a deterministic control exists
  to replace, and the claim is about *where a value is read*, which `pg_locks` reads directly.
  *(QS-4)*
  <br>**Mutant control:** restore the pre-loop read and relocate the row between it and the attempt.
  The transaction then holds the *old* pair's keys, which the same assertion reads.

## Inherited scope — written here, not only where it was deferred

- **`A-05-6` — two unkilled guards inside the one place a contended resource may be minted.**
  `src/persistence/pgError.ts` carries surviving mutants on the check that the error code is a
  string, which is what makes classification total over `unknown`, and on the check that an exclusion
  violation carries a constraint name. Nothing hands the classifier an error whose code is not a
  string, and nothing hands it an exclusion violation with no constraint — so both guards are
  specified and unproven, inside the one file permitted to mint a refusal's resource. **This slice is
  the destination** because it is where classifying an exclusion violation on the `UPDATE` path
  becomes live rather than historical: a reschedule racing a booking is the first execution reaching
  that arm from a second call site. Two unit cases, the implementer's; no production change is
  expected, and if one is needed that is the finding.
- **`A-06-3` — a concurrency test for racing moves.** The schema slice fixed the **single-threaded**
  `UPDATE` semantics. The scheduling ADR claims two racing reschedules behave like two racing
  bookings — one commits, the other is refused — and **no scenario and no test asserted it**. QS-4
  and QS-5 cover what a *refused* move leaves behind and QS-6 the self-overlap; the mirror of QS-1 on
  the `UPDATE` path was named by nothing. A `BEFORE UPDATE` trigger that passes everything the schema
  slice asserts and fails only under simultaneity is the proof the gap is real, and is the mutant
  control this test owes. **Why here rather than the previous slice:** AC-2 already builds the
  barrier harness for a move racing *N* bookings, and racing moves is that harness with `UPDATE` on
  both sides; and it can assert alongside AC-1 that the loser's original is untouched, which is what
  makes *"one commits, one is refused"* mean something rather than count to one. **If either premise
  is false on arrival, say so in the PR.**
- **`F-02-9` — the two advisory locks *raced* rather than argued.** The previous slice discharged its
  half with a stronger mechanism than the obligation asked for: the lock is the only value both
  writes will accept, so *"skipped the locks"* is a compile error. What it could not do is race it.
  Its discharge surfaced one fact the deadlock argument had never stated: **on a second or later
  attempt a move vacates its incumbent pair while holding only the target pair's locks.** That is an
  argument today; here it meets two `UPDATE`s at once.
- **`O-41` — the inherited-scope guard, built before this slice reached Ready.** The original check
  was a *subset* guard, not a *completeness* guard: the previous slice listed five obligations in
  prose while three of its four declared refs appeared nowhere but the front-matter line. The guard
  now runs **both ways**, with an explicit no-ref escape so it cannot demand an invented ref. It was
  scheduled to land at this slice's dispatch so that a Definition-of-Ready rule first bites on a file
  written under it — and it did, on this file. Nothing to build.

## In scope

- `tests/concurrency/refused-move-leaves-original.test.ts` and
  `tests/concurrency/move-never-releases-slot.test.ts`.
- Whatever the implementation must change to satisfy them — which, if the previous slice was built as
  specified, is nothing. A green run here on unchanged production code is the desired outcome and is
  evidence, not an empty slice.

## Out of scope

- Any new endpoint or field. This slice adds proof, not surface.

## Definition of done

Beyond `CLAUDE.md` §10:

- If no production code changed, the reviewer states that explicitly in the PR and the team log
  records it. A slice that adds only tests is a legitimate outcome when the tests are the deliverable
  — but it must be visible rather than look like an oversight.
