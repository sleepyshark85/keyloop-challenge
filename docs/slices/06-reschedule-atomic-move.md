---
id: "06"
title: Rescheduling — one atomic UPDATE, and a row that does not conflict with itself
status: ready
depends_on: ["05"]
arc42: ["§6.3", "§8.6"]
adr: [3]
quality_scenarios: [QS-6]
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
