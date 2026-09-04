---
id: "02"
title: Book an appointment, read it back, and give every failure one status and one type
status: ready
depends_on: ["01"]
absorbs: ["03"]
arc42: ["§5.2", "§6.1", "§8.6"]
adr: [1, 2, 4, 5, 6, 8]
quality_scenarios: [QS-1, QS-2, QS-11]
loopbacks: 0
---

> **Absorbs slice 03 (the error taxonomy) by the Gate D ruling of 2026-09-04.** C6 — "the budget is
> real" — failed by more than an order of magnitude, and the human ruled the disjunction its own
> wording offers: cut slices, do not reduce agent count. The taxonomy has no separate red of its own
> here; AC-7 to AC-12 below are slice 03's acceptance criteria carried across unchanged in substance,
> and `docs/slices/03-error-taxonomy.md` is the tombstone recording where they went.
>
> The fold is not free and the cost is stated rather than discovered at step 5: this slice was already
> the flagship concurrency slice, and it now also carries the whole of §8.6. **Sequence it** — the
> booking path green on AC-1 to AC-6 first, then the taxonomy on top. If it needs two red commits it
> is two slices after all, and that is a DCR, not a workaround.

## Goal

`POST /appointments` books, and `GET /appointments/{id}` reads it back. The request names a customer,
vehicle, service type, dealership and desired start — never a bay or technician, which the system
allocates. The service attempts the insert and maps SQLSTATE `23P01` to `409`; it never asks whether
a slot is free before writing. This is the slice where the flagship concurrency scenarios become
executable end to end.

And every row of §8.6's status table is reachable and produces exactly that status and that `type`,
as RFC 9457 `application/problem+json`. A client distinguishes an out-of-hours request from a
contended one from an unknown vehicle without parsing prose.

## Acceptance criteria

### The booking path

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

### The error taxonomy *(carried from slice 03)*

- **AC-7** — Given a request whose derived interval leaves the dealership's opening hours, when it is
  booked, then `400` with `type=/problems/outside-opening-hours` — **not** `409`. The decision is
  made by `domain/openingHours.ts`, which reads no booking (GC-1).
- **AC-8** — Given a malformed body or an unparseable timestamp, when it is submitted, then `400`
  with `type=/problems/malformed-request`, rejected by the route schema before any handler runs.
- **AC-9** — Given an unknown dealership, service type, customer or vehicle, when it is named, then
  `422` with `type=/problems/unknown-reference` carrying `reference` — **not** `404`.
- **AC-10** — Given a vehicle that is not the named customer's, when it is booked, then `422` with
  `type=/problems/vehicle-not-owned` — **not** `403`. It is validation, not authorisation (ADR-0002).
- **AC-11** — Given a contended booking, when every candidate is refused, then `409` with
  `type=/problems/no-capacity` carrying `resource` set to the contended resource.
- **AC-12** — Given every row of §8.6's table, when the contract test runs, then each is reachable and
  no two rows collide — the taxonomy is total and stable. *(QS-11)*

## In scope

- `src/http` route with TypeBox schemas, `src/application` booking use case, `src/persistence` insert
  and the single SQLSTATE translation site (§5.2).
- `tests/concurrency/no-bay-overlap.test.ts` and `tests/concurrency/no-technician-overlap.test.ts`.
- `tests/contract/error-taxonomy.test.ts`, the problem+json serialiser, and the
  outcome-not-exception mapping of §8.6.
- Enough candidate selection to allocate *a* free bay and technician — the ordering policy and the
  retry loop are slice 04.

## Out of scope

- Retrying across remaining candidates on conflict (ADR-0004) — slice 04. Here a `23P01` on the
  chosen candidate is a `409`, which is correct but pessimistic, and slice 04's QS-3 is what proves
  it improved.
- `appointment-not-confirmed` (`409` on moving a cancelled appointment) — it needs rescheduling, so
  it lands with slice 06 and extends the taxonomy test.
- Asserting the emitted OpenAPI document matches the committed one — slice 09, where the document
  exists.
- Cancellation, rescheduling, availability, telemetry.

## Definition of done

Beyond `CLAUDE.md` §10:

- The concurrency tests run against real PostgreSQL with several pooled connections released from a
  barrier, and record ADR-0009's seed in the failure message so a failing interleaving is re-runnable
  rather than a flake.
- §8.6's recorded tension is left recorded, not harmonised: out-of-hours stays `400` although `422`
  would sit more naturally beside the reference failures. Changing it means superseding ADR-0001.
