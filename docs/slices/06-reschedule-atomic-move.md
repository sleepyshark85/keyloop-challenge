---
id: "06"
title: Rescheduling — one atomic UPDATE, and a row that does not conflict with itself
status: ready
depends_on: ["05"]
arc42: ["§5.2", "§6.3", "§8.2", "§8.6"]   # §5.2 added at slice 05 step 7 — appointment.ts
adr: [3, 24]
quality_scenarios: [QS-6, QS-11]
inherits: ["F-02-9", "F-05-1", "R-05-7", "R-05-9"]   # deferred here by ruling; slice:check enforces it (A-05-5)
loopbacks: 0
---

## Goal

`PATCH /appointments/{id}` moves an appointment with a **single atomic `UPDATE`**, guarded by the
same exclusion constraints — never a cancel followed by an insert, because a move must not transiently
release the slot. The id survives the move.

The subtle case is pinned rather than assumed: a move onto an interval overlapping the appointment's
*own* current interval must succeed. It is the one place the constraint's semantics are relied on
without being obvious.

## Acceptance criteria

- **AC-1** — Given A confirmed `[09:00, 10:00)`, when A is rescheduled to `[09:15, 10:15)` and then
  extended to `[09:15, 11:15)`, then both succeed, the id is unchanged, **the bay and technician are
  unchanged** (asserted on the response body, which carries both), and **no `23P01` is raised** — the
  row does not conflict with the version it replaces. *(QS-6)*
  <br>The bay-and-technician clause was added at step 2 under I-06-2 and it is what makes AC-1 pin
  QS-6 at all: the self-overlap semantics are only exercised if the new version lands in the *same*
  bay with the *same* technician, so under a shuffle-from-first candidate order `[09:00,10:00) →
  [09:15,10:15)` could be satisfied by allocating bay 2 and **AC-1 could not fail**. ADR-0027 fixes
  the order; this clause makes the criterion able to observe it.
- **AC-2** — Given A is moved, when the database is inspected, then exactly one statement modified it:
  a single `UPDATE`. A `DELETE`-then-`INSERT`, or a cancel-then-book, fails this criterion.
- **AC-3** — Given A is moved to an interval outside the dealership's opening hours, then `400` with
  `type=/problems/outside-opening-hours` — the same domain rule as booking, not a second copy of it.
- **AC-4** — Given A is `cancelled`, when it is rescheduled, then `409` with
  `type=/problems/appointment-not-confirmed` — a **different** `type` from a contended `409`, and one
  that does **not** increment `booking_conflicts_total` (§8.4).
- **AC-5** — *Amended at step 1 by [ADR-0025](../adr/0025-existence-is-the-reads-legality-is-the-statements.md);
  the original required the `404` to come from the `UPDATE`'s zero rows, which is unimplementable
  because the `UPDATE` cannot be built without first reading the row.* Given an unknown id, when a
  move is requested, then `404` with `type=/problems/appointment-not-found`, decided by the
  appointment read the move needs anyway to know its own dealership and service type — **and the
  `UPDATE` is never issued.** Zero rows from the `UPDATE` therefore means exactly one thing, which
  is what makes AC-4 assertable.

## Inherited scope — written here, not only where it was deferred

Five obligations named this slice. **Two were re-ruled at step 1** — see
[`06-design.md`](06-design.md) §1 — and the three that remain are recorded here so slice 06's
Definition of Ready fails if they are dropped, which is the remedy for R-05-2.

- **A concurrency test for racing moves — DEFERRED TO SLICE 07 at step 1** (ref `A-06-3`), where
  it is written in full. The reason for keeping it here — *"ADR-0003's claim is what slice 06 ships
  on"* — is equally true of QS-4 and QS-5, which are already slice 07's; a reason that does not
  distinguish its own case is not one. ADR-0019's criterion is met and re-measurable on arrival.
- **F-05-1 — `lockResources` returns a branded `ResourceLock` that `insertAppointment` takes as a
  parameter** (slice 05 §6, deferred under ADR-0019). Type-only, erased, one minting cast, the
  ADR-0016 shape: *"forgot the lock"* becomes a compile error and *"correctly exempt"* (ADR-0023's
  cancel path) becomes a signature that does not ask for one. Slice 06 is the destination **because it
  writes `rescheduleAppointment`, a newly written locking path** — the first moment the mistake is live
  rather than historical. Residue: it does not prove the keys match the row.
- **ADR-0024 — `setNotFoundHandler`, the `404 /problems/route-not-found` row, and the hostile-request
  corpus.** Measured today: `GET /nope` returns `404 application/json` with no `type`, and
  `content-type: application/xml` returns `500`. `server.ts`'s docblock asserts §8.6's totality *"is
  kept"* in `setErrorHandler` and it is not; that docblock is corrected with the handler. The corpus
  is `tests/contract/`, the test-engineer's, asserted in the direction that can fail (∀responses ∃row).
  **§8.6 gains the row at this slice's step 7.** Two warnings, both ruled at slice 05 step 5 so they
  are not discovered here: registering the handler **breaks the media-type half of AC-4's vacuity
  guard** in `cancel-appointment.test.ts:247`, which discriminates on Fastify's default body — the
  `type` member still discriminates, and the test-engineer re-derives that case rather than deleting
  it; and `src/http/problem.ts`, which renders every row, sits at **exactly §10's 0.75 threshold with
  three survivors**, so this slice's two taxonomy changes put one new survivor between it and its
  Definition of Done.
- **`src/domain/appointment.ts` — RETIRED at step 1, not deferred**, by
  [ADR-0025](../adr/0025-existence-is-the-reads-legality-is-the-statements.md) decision 6: under
  that ruling transition legality is a database verdict on ADR-0016's ground, so a module holding
  one allowlist whose only consumer is a SQL predicate is a relocation of a literal. §5.2's
  as-built cell records the retirement and its reason at step 7, so the pointer does not dangle.
  The residue — the constraints' denylist against the move's allowlist — goes to §11.
- **The Stryker exhaustiveness disables.** ~13 structurally unkillable mutants cap
  `routes/appointments.ts` near 88%, so 83.04 has stopped discriminating (reviewer, slice 05).
  A `// Stryker disable all : <reason>` … `// Stryker restore all` pair around each
  `const unhandled: never` arm — `disable next-line` cannot cover one, measured — **those arms
  only**, not the schema-options or description mutants, which are inert for reasons that change
  when Fastify's config or slice 09's OpenAPI assertion does. Slice 06 adds the fourth route
  and therefore the fourth arm, so doing it once here costs one pass instead of two. The *decision* is
  the architect's, on the same ground as `stryker.config.mjs`'s `mutate` list; the *edit* is in `src/`
  and is the implementer's.

## In scope

- The reschedule route, use case, candidate loop and `UPDATE`; `tests/contract/error-taxonomy.test.ts`
  extended to nine rows — `appointment-not-confirmed` and `route-not-found` land together, so the
  taxonomy changes once.
- `tests/integration/reschedule-self-overlap.test.ts` and
  `tests/integration/reschedule-is-one-statement.test.ts` (AC-2's audit-trigger instrument).

## Out of scope

- Moving to a different dealership, changing the service type, or reassigning to a named technician.
  A move changes `startsAt`; anything else is a cancel plus a booking.
- Rescheduling under contention — slice 07, where the concurrency scenarios live.

## Definition of done

Beyond `CLAUDE.md` §10:

- AC-2 is asserted by the audit trigger in `reschedule-is-one-statement.test.ts`, **and** the
  reviewer reads the generated SQL. Two independent checks, because AC-2 is the criterion most
  easily satisfied by a test that passes for the wrong reason and *"the reviewer looked"* is not
  executable.
