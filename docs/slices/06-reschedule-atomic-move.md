---
id: "06"
title: Rescheduling — one atomic UPDATE, and a row that does not conflict with itself
status: done
depends_on: ["05"]
arc42: ["§5.2", "§6.3", "§6.6", "§8.2", "§8.6", "§10", "§11"]
adr: [3, 24, 25]
quality_scenarios: [QS-6, QS-11]
inherits: ["F-02-9", "F-05-1", "R-05-7", "R-05-9"]   # deferred here by ruling; slice:check enforces it
loopbacks: 0
---

## Goal

`PATCH /appointments/{id}` moves an appointment with a **single atomic `UPDATE`**, guarded by the
same exclusion constraints — never a cancel followed by an insert, because a move must not
transiently release the slot. The id survives the move.

The subtle case is pinned rather than assumed: a move onto an interval overlapping the appointment's
*own* current interval must succeed. It is the one place the constraint's semantics are relied on
without being obvious.

## Acceptance criteria

- **AC-1** — Given A confirmed `[09:00, 10:00)`, when A is rescheduled to `[09:15, 10:15)` and then
  again to `[09:45, 10:45)`, then both succeed, **each move overlapping the interval it replaces**,
  the id is unchanged, **the bay and technician are unchanged** (asserted on the response body, which
  carries both), and **no exclusion violation is raised** — the row does not conflict with the
  version it replaces. *(QS-6)*
  <br>The bay-and-technician clause is what makes AC-1 able to fail. Self-overlap is only exercised
  if the new version lands in the *same* bay with the *same* technician, so under a shuffle from the
  first candidate the move could be satisfied by allocating a second bay and the criterion could
  never fail. Attempting the incumbent pair first fixes the order; this clause lets the criterion
  observe it.
- **AC-2** — Given A is moved, when the database is inspected, then exactly one statement modified it
  **in the course of that move**: a single `UPDATE`. A `DELETE`-then-`INSERT`, or a cancel-then-book,
  fails this criterion. The window is the request, not the row's lifetime, so the fixture's own
  arrange step writes the same row and is not counted.
- **AC-3** — Given A is moved to an interval outside the dealership's opening hours, then `400` with
  `type=/problems/outside-opening-hours` — the same domain rule as booking, not a second copy of it.
- **AC-4** — Given A is `cancelled`, when it is rescheduled, then `409` with
  `type=/problems/appointment-not-confirmed` — a **different** `type` from a contended `409`, and one
  that does **not** increment the conflict counter.
- **AC-5** — Given an unknown id, when a move is requested, then `404` with
  `type=/problems/appointment-not-found`, decided by the appointment read the move needs anyway to
  learn its own dealership and service type — **and the `UPDATE` is never issued.** Zero rows from
  the `UPDATE` therefore means exactly one thing, which is what makes AC-4 assertable.

## Inherited scope — five arrived, two re-ruled at step 1

- **`A-06-3` — a concurrency test for racing moves. Deferred on to slice 07**, where it is written in
  full. The reason for keeping it here — *"the atomic-move ADR's claim is what this slice ships on"* — is
  equally true of the two scenarios already slice 07's, and a reason that does not distinguish its own
  case is not one.
- **`F-05-1` — the lock becomes a value the write takes.** `lockResources` returns a branded
  `ResourceLock` the write requires as a parameter, so *forgot the lock* is a compile error and *correctly
  exempt* is a signature that does not ask for one. This slice is the destination because it writes a
  **new** locking path, the first moment the mistake is live rather than historical. *As built the lock
  also carries the keys it took; **`F-02-9`'s half here is discharged by that required parameter**, not by
  the minting site being unique. Left open: the lock does not prove the write shares its transaction, and
  a `ResourceLock` can still be hand-written with no cast.*
- **`R-05-7` — a handler for unmatched routes, the `404 /problems/route-not-found` row, and a hostile
  corpus** asserting in the direction that can fail: every response has a row, rather than every row has a
  response. *Both merged; an `application/xml` request producing a `500` is the taxonomy's one remaining
  residual.* Registering the handler **breaks the media-type half of AC-4's vacuity guard**, warned a
  slice early so it would not be discovered here.
- **`R-05-9` — the exhaustiveness disables.** A `// Stryker disable` … `// Stryker restore` pair around
  each `const unhandled: never` arm, **those arms only** — not the schema-option or description mutants,
  inert for reasons that change when Fastify's configuration does. The *decision* is the architect's, the
  *edit* the implementer's. *As applied it suppressed 93 mutants where 8 were ruled, and was narrowed at
  step 5.*
- **`src/domain/appointment.ts` — retired at step 1, not deferred** *(no ref — a prediction in arc42 §5.2,
  never a logged finding)*. Under this slice's ADR a transition's legality is a database verdict, so a
  module holding one allowlist whose only consumer is a SQL predicate relocates a literal. The residue —
  the constraints denylist where the move's guard allowlists — goes to arc42 §11.

## In scope

- The reschedule route, use case, candidate loop and `UPDATE`; the taxonomy contract test extended to nine
  rows, `appointment-not-confirmed` and `route-not-found` landing together so it changes once.
- `tests/integration/reschedule-self-overlap.test.ts` and `reschedule-is-one-statement.test.ts`, which
  carries AC-2's audit trigger.

## Out of scope

- Moving to a different dealership, changing the service type, or reassigning to a named technician. A
  move changes `startsAt`; anything else is a cancel plus a booking.
- Rescheduling under contention — the next slice.

## Definition of done

Beyond `CLAUDE.md` §10: AC-2 is asserted by the audit trigger **and** the reviewer reads the generated
SQL. Two independent checks, because AC-2 is the criterion most easily satisfied by a test that passes for
the wrong reason, and *"the reviewer looked"* is not executable.
