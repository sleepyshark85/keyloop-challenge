---
id: "06"
title: Rescheduling — one atomic UPDATE, and a row that does not conflict with itself
status: ready
depends_on: ["05"]
arc42: ["§5.2", "§6.3", "§8.2", "§8.6"]   # §5.2 added at slice 05 step 7 — appointment.ts
adr: [3, 24]
quality_scenarios: [QS-6, QS-11]
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
  extended to `[09:15, 11:15)`, then both succeed, the id is unchanged, and **no `23P01` is raised** —
  the row does not conflict with the version it replaces. *(QS-6)*
- **AC-2** — Given A is moved, when the database is inspected, then exactly one statement modified it:
  a single `UPDATE`. A `DELETE`-then-`INSERT`, or a cancel-then-book, fails this criterion.
- **AC-3** — Given A is moved to an interval outside the dealership's opening hours, then `400` with
  `type=/problems/outside-opening-hours` — the same domain rule as booking, not a second copy of it.
- **AC-4** — Given A is `cancelled`, when it is rescheduled, then `409` with
  `type=/problems/appointment-not-confirmed` — a **different** `type` from a contended `409`, and one
  that does **not** increment `booking_conflicts_total` (§8.4).
- **AC-5** — Given an unknown id, when a move is requested, then `404`, decided by the `UPDATE`
  affecting zero rows rather than by a preceding read.

## Inherited scope — written here, not only where it was deferred

Five obligations were ruled elsewhere and name this slice. They are recorded here so slice 06's
Definition of Ready fails if they are dropped, which is the remedy for R-05-2.

- **A concurrency test for racing moves** (from §8.2, where this used to be the only record). AC-10
  fixes the **single-threaded** `UPDATE` semantics; ADR-0003 claims two racing reschedules behave like
  two racing bookings — one commits, the other gets `23P01` — and **no scenario and no test asserts
  it.** QS-4 and QS-5 cover what a *refused* move leaves behind, QS-6 the self-overlap; the mirror of
  QS-1 on the `UPDATE` path is named by nothing. A `BEFORE UPDATE` trigger passing everything slice 00
  asserts and failing only under simultaneity is the proof the gap is real. *(Slice 07 owns
  rescheduling under contention; this is the one assertion that cannot wait for it, because ADR-0003's
  claim is what slice 06 ships on.)*
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
- **`src/domain/appointment.ts`, predicted by §5.2 at phase 2 and not built at slice 05.** Under slice
  05's unconditional `UPDATE`, idempotency is a property of the statement and there was no caller for
  a status model, so it would have shipped as dead code with free survivors. Slice 06 supplies the
  caller: *only a `confirmed` appointment may be moved* is this slice's AC-4, and it is a domain rule
  rather than a SQL predicate. **§5.2's as-built cell names slice 06 as the owner, so a slice 06 that
  does not build it must correct §5.2 rather than leave the pointer dangling.**
- **The Stryker exhaustiveness disables.** ~13 structurally unkillable mutants cap
  `routes/appointments.ts` near 88%, so 83.04 has stopped discriminating (reviewer, slice 05).
  `// Stryker disable next-line` on each `const unhandled: never` arm, with the reason on the line —
  **those arms only**, not the schema-options or description mutants, which are inert for reasons that
  change when Fastify's config or slice 09's OpenAPI assertion does. Slice 06 adds the fourth route
  and therefore the fourth arm, so doing it once here costs one pass instead of two. The *decision* is
  the architect's, on the same ground as `stryker.config.mjs`'s `mutate` list; the *edit* is in `src/`
  and is the implementer's.

## In scope

- The reschedule route, use case and `UPDATE`; extension of `tests/contract/error-taxonomy.test.ts`
  with the `appointment-not-confirmed` row.
- `tests/integration/reschedule-self-overlap.test.ts`.

## Out of scope

- Moving to a different dealership, changing the service type, or reassigning to a named technician.
  A move changes `startsAt`; anything else is a cancel plus a booking.
- Rescheduling under contention — slice 07, where the concurrency scenarios live.

## Definition of done

Beyond `CLAUDE.md` §10:

- The reviewer reads the generated SQL, not only the test result. AC-2 is the criterion most easily
  satisfied by a test that passes for the wrong reason.
