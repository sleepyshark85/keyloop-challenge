---
id: "02"
title: Book an appointment, and read it back — the invariant reaches the API
status: ready
depends_on: ["01"]
arc42: ["§5.2", "§6.1", "§8.6"]
adr: [2, 4, 5, 6, 8]
quality_scenarios: [QS-1, QS-2]
loopbacks: 0
---

## Goal

`POST /appointments` books, and `GET /appointments/{id}` reads it back. The request names a customer,
vehicle, service type, dealership and desired start — never a bay or technician, which the system
allocates. The service attempts the insert and maps SQLSTATE `23P01` to `409`; it never asks whether
a slot is free before writing. This is the slice where the flagship concurrency scenarios become
executable end to end.

## Acceptance criteria

- **AC-1** — Given a dealership with a free bay and a qualified technician, when a booking is
  requested for an in-hours interval, then `201` is returned with the appointment, **naming the
  allocated bay and technician**, and one `confirmed` row exists.
- **AC-2** — Given a booking succeeded, when `GET /appointments/{id}` is requested, then `200` is
  returned with the same appointment; an unknown id returns `404` with
  `type=/problems/appointment-not-found`.
- **AC-3** — Given one free bay over `[09:00, 10:00)`, when 20 booking requests for that interval are
  released simultaneously from a barrier across pooled connections, then **exactly one** non-cancelled
  row exists for that bay over any overlapping range, the other 19 receive `409` with
  `type=/problems/no-capacity`, and the constraint PostgreSQL reports is `no_bay_overlap`. Asserted
  over the table, never over the responses alone. *(QS-1)*
- **AC-4** — As AC-3 with bays plentiful and exactly one qualified technician free; the constraint
  reported is `no_technician_overlap`. *(QS-2)*
- **AC-5** — Given the source tree, when it is inspected, then no code path reads availability and
  then decides whether to insert. The booking path is a single `INSERT` per attempt.
- **AC-6** — Given a request carrying an explicit end time, when it is booked, then the supplied end
  is ignored and the interval is derived from the service type's duration (A-1).

## In scope

- `src/http` route with TypeBox schemas, `src/application` booking use case, `src/persistence` insert
  and the single SQLSTATE translation site (§5.2).
- `tests/concurrency/no-bay-overlap.test.ts` and `tests/concurrency/no-technician-overlap.test.ts`.
- Enough candidate selection to allocate *a* free bay and technician — the ordering policy and the
  retry loop are slice 04.

## Out of scope

- Retrying across remaining candidates on conflict (ADR-0004) — slice 04. Here a `23P01` on the
  chosen candidate is a `409`, which is correct but pessimistic, and slice 04's QS-3 is what proves
  it improved.
- The full error taxonomy — slice 03. This slice needs only `201`, `404` and `409`.
- Cancellation, rescheduling, availability, telemetry.

## Definition of done

Beyond `CLAUDE.md` §10:

- The concurrency tests run against real PostgreSQL with several pooled connections released from a
  barrier, and record ADR-0009's seed in the failure message so a failing interleaving is re-runnable
  rather than a flake.
