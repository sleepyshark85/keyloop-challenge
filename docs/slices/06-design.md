# Slice 06 — as-built record

Slice file: [`06-reschedule-atomic-move.md`](06-reschedule-atomic-move.md), merged with
[**ADR-0025**](../adr/0025-existence-is-the-reads-legality-is-the-statements.md) and the decisions
below.

**The design is now in arc42** — §5.2, §6.3, §6.6, §8.2, §8.6, §10, §11, reconciled at step 7. This
file keeps what has no other home.

## Three decisions taken here, and one declined below

**The lock is a value the write takes, and it carries the keys it took.** `lockResources` returns a branded
`ResourceLock` holding `bayId` and `technicianId`; `NewAppointment` and `Move` carry neither, the
writes reading them off it, with one minting cast. *Forgot the lock* becomes a compile error and
*locked the wrong keys* unrepresentable between lock and write, there being no second copy to
disagree; *correctly exempt* is readable off `cancelAppointmentById`'s signature. Keeping the docblock was
refused because the defect is that the code **reads** wrong; a rule or a QS-12 marker, because both
are file-granular and these two functions share a file.

**A move attempts the pair it already holds before it shuffles.** Attempt 1 is the appointment's own
`(bay_id, technician_id)`; on a `23P01` there ADR-0009 applies unchanged, cap untouched and the bound
Bound-2's plus one. Shuffling from the first attempt was refused because **AC-1 could not then fail**
— its subject is a row not conflicting with the version it replaces, exercised only when the new
version lands in the same bay with the same technician — and because T-06-3's discarded-candidate case
becomes unconstructible. The current pair alone refuses while capacity exists; distance-ordering is
allocation *policy*, which §3.3 excludes. Attempt 1 is Order-A, bounded at one attempt.

**A deadlock event names the write path it happened on; a conflict event does not.** `DEADLOCK_EVENT`
is `'reschedule.deadlock'` on the move path and `'booking.deadlock'` on booking; the other three names
stay shared. The line is what the event is evidence *of*: a `23P01` is the same fact whichever
statement provoked it, and is I-02-6's observer, read by QS-1, QS-2 and this slice's controls, so
sharing is load-bearing. A `40P01` is no taxonomy row at all — under ADR-0018's locks it can only mean a
path skipped them, so its whole content is *which path*, which one shared name deletes. One name plus
a `path` field is probably better long-run, refused as a third design at step 7 over merged code, and
the cost is two counters for one rate.

## What shipped

`PATCH /appointments/{id}` `{ startsAt }`: one guarded `UPDATE` inside ADR-0018's two advisory locks,
re-allocating across ADR-0004's candidates when the incumbent pair conflicts, plus `setNotFoundHandler`
and two taxonomy rows (ADR-0024) in the same red and green commits, `PROBLEM_TYPES` going 7 → 9 once.
No data-model delta, no migration, no `.dependency-cruiser.js` change.

Two obligations were re-ruled at step 1: **racing moves deferred to slice 07** (`A-06-3`), and
**`src/domain/appointment.ts` retired** rather than deferred (ADR-0025 decision 6). One added item was
larger: a move needing a different bay or technician re-runs candidate selection.

## Measurements with no other home

**The exclusion mechanism, read off `check_exclusion_constraint` rather than re-measured** (`A-06-1`).
An `UPDATE` writes a new heap tuple and stamps the old one's `xmax`; the check runs after the new
index entry exists, skips it by `ctid` and tests the others for liveness, so the superseded version is
*deleted by me* rather than a live conflict. The load-bearing half is that this is a property of the
**enforcement mechanism** — a `BEFORE UPDATE` trigger computing the same overlap sees the prior
version and is correct only if someone remembered `AND o.id <> NEW.id`. §8.2 consequence 4.

**`problem.ts` is immune to mutation testing, not cushioned** (`I-06-1`, the round's one objection):
**12 mutants with and without the two new rows, 9 killed, 75.00 either way.** The cause, verifiable from
the committed `reports/mutation/mutation.json`, is that `@stryker-mutator/instrumenter` lists
`TSAsExpression` among its type-annotation nodes, so `[…] as const` skips its whole subtree — array
and all seven literals. Extending the set-equality assertion to nine
members is a **compiler-and-assertion** fact, not a kill (**F-06-2**, §11).

**The Stryker disables over-applied elevenfold** (`R-05-9`): a trailing `// Stryker restore all` is
never read by the instrumenter, so **93 mutants were suppressed where 8 were ruled**; four
`disable next-line all` directives brought it to 8. §11 R-12.

**Mutation, after remediation:** **every changed file clears §10's 0.75** (`I-06-5`), reschedule
rising 70.00 → 92.50 with exactly the 9 survivors the reviewer predicted; `events.jsonl` has the
per-file scores. Eight structurally unkillable mutants remain above each `throw`, and the suppression
was **deliberately not widened** to reach them — raising a passing score by suppressing more is what
R-05-9 prevents.

## The rulings that shaped the build

- **AC-5 amended** (ADR-0025). The decisive fact came from trying to write the statement: a move
  cannot be constructed without reading its own row, the interval deriving from that row's service
  type. The amendment is *stricter*, forbidding the follow-up read §6.3 mandated, and `T-06-1` showed
  the falsifier could not run as written — an `AFTER … FOR EACH ROW` trigger not firing on a zero-row
  `UPDATE`, so the statement-level companion makes it executable.
- **AC-1 corrected twice**, both omissions the architect's: its worked example changed a duration
  `PATCH` cannot carry (`T-06-6`, QS-6 with it), and its bay-and-technician clause was added
  (`I-06-2`) for the reason above.
- **Two controls, not one** (`T-06-2`): one per constraint, asserted on the constraint **name** —
  under ADR-0004's retry a move onto an occupied bay succeeds elsewhere, so a control expecting `409`
  would pass for the wrong reason.
- **AC-2's window opens after the fixture's arrange** (`R-06-1`, (a) at step 4), never by filtering
  `op`, which lets cancel-then-book pass. Rejected instruments, independently confirmed:
  `pg_stat_user_tables`, table-wide and stats-lagged; `xmin`, unable to count to two.
- **AC-4's metric half is slice 09's**, and **`OQ-06-1` is out of scope**: a move to the same instant
  is a request rather than a replay, so a `200` that rewrites the row. Recorded in case the gate
  disagrees.

## Debt booked, and what is still open

Six, defined here and carried in arc42 §11:

| ref | What it is |
|---|---|
| **D-06-1** | The move guards on an allowlist where the constraints denylist (ADR-0025) |
| **D-06-2** | A `ResourceLock` cannot be forgotten and *can* be forged, a brand being erased at runtime (R-06-D) |
| **D-06-3** | AC-2's audit instrument can fail falsely, never pass falsely (`T-06-7`) |
| **D-06-4** | A `rescheduleAppointment.ts` docblock cites I-02-6 for the event-naming rule above |
| **F-06-1** | Two attempt loops, one design; extraction to slice 09 |
| **F-06-2** | `problem.ts` has no margin, its taxonomy invisible to the mutation score |

Still open elsewhere:

- **`A-06-2`** — nothing asserts `deps.newId()` is the only id-minting site, which ADR-0025 rests on.
  Declined here, the mechanism existing and the hazard not; deferred to slice 09, which can assert
  over ∀operations.
- **`T-06-5`, and the remedy declined with it.** The type does not prove the write runs in the lock's
  transaction, and the test-engineer's contribution was a **negative result**: no black-box test can
  observe it, the constraint backstopping correctness either way — which is why a type is the only
  available control here. The remedy would be for the lock to carry its `Db`; the
  architect found it while adjudicating and ruled **(b)** against itself, no AC, `QS-*` or §2 clause
  being nameable against the shipped shape, and ruling (c) on an improvement the adjudicator
  invented against a decision one day old is the failure §6 names. Deferred to slice 09 with F-06-1;
  a marker is file-granular where this defect is one **expression**.
- **`A-06-4`, `A-06-5`, `A-06-6`** — process findings routed to the retro.
