---
id: "02"
title: Book an appointment, read it back, and give every failure one status and one type
status: done
depends_on: ["01"]
absorbs: ["03", "12", "13"]
arc42: ["§5.2", "§6.1", "§8.6", "§10.2"]
adr: [1, 2, 4, 5, 6, 8]
quality_scenarios: [QS-1, QS-2, QS-11, QS-9, QS-12]
loopbacks: 0
deferred_from: ["R-01-1", "R-01-4"]
---

> **This slice carries three things at once.** Its own booking path; the error taxonomy, folded in
> from slice 03 at the phase-4 gate as AC-7 to AC-12; and two domain fixes the human ratified before
> folding them in as AC-13 to AC-19. Both folds are recorded in the event log. Because the remedies
> were already agreed, this slice implements decisions rather than proposing them.
>
> **Sequence it**: booking path green first, taxonomy on top, the two domain fixes independent of
> both. Three things at once is why it keeps the full human gate. If it needs a second red commit it
> was two slices after all — which is a DCR, not a workaround.

## Goal

`POST /appointments` books, and `GET /appointments/{id}` reads it back. The request names a customer,
vehicle, service type, dealership and desired start — never a bay or technician, which the system
allocates. The service attempts the insert and maps the exclusion violation PostgreSQL raises to
`409`; it never asks whether a slot is free before writing. This is the slice where the flagship
concurrency scenarios become executable end to end.

And every failure the system can produce gets one status and one machine-readable `type`, served as
RFC 9457 `application/problem+json`. A client tells an out-of-hours request from a contended one from
an unknown vehicle without parsing prose. The catalogue of those rows is the error taxonomy in
arc42 §8.6.

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
  then decides whether to insert. Each booking attempt is one transaction containing exactly one
  `INSERT` into `appointment`, preceded only by the two advisory-lock acquisitions, which read no
  table and decide nothing.
- **AC-6** — Given a request carrying an explicit end time, when it is booked, then the supplied end
  is ignored and the interval is derived from the service type's duration.

### The error taxonomy

- **AC-7** — Given a request whose derived interval leaves the dealership's opening hours, when it is
  booked, then `400` with `type=/problems/outside-opening-hours` — **not** `409`. The decision is
  made by the pure opening-hours module, which reads no booking.
- **AC-8** — Given a malformed body or an unparseable timestamp, when it is submitted, then `400`
  with `type=/problems/malformed-request`, rejected by the route schema before any handler runs.
- **AC-9** — Given an unknown dealership, service type, customer or vehicle, when it is named, then
  `422` with `type=/problems/unknown-reference` carrying `reference` — **not** `404`.
- **AC-10** — Given a vehicle that is not the named customer's, when it is booked, then `422` with
  `type=/problems/vehicle-not-owned` — **not** `403`. It is validation, not authorisation: this
  system authenticates nobody, so there is no permission to refuse.
- **AC-11** — Given a contended booking, when every candidate is refused, then `409` with
  `type=/problems/no-capacity` carrying `resource` set to the contended resource.
- **AC-12** — Given every row of the taxonomy, when the contract test runs, then each is reachable and
  no two rows collide — the taxonomy is total and stable. *(QS-11)*

### An `Instant` is renderable by construction

- **AC-13** — Given `epochMillis` with `Math.abs(epochMillis) > 8_640_000_000_000_000`, when
  `instant()` is called, then it returns `null`. *(QS-12)*
- **AC-14** — Given exactly `8_640_000_000_000_000` or `-8_640_000_000_000_000`, when `instant()` is
  called, then it returns an `Instant` — the bound is inclusive, and both signs are asserted.
- **AC-15** — Given any value for which `instant()` returns an `Instant`, when it is passed to
  `new Date(...).toISOString()`, then it does not throw. Asserted as a **property** over a generator
  that reaches both bounds, not over a hand-picked list. *(QS-9)*
- **AC-16** — Given `startsAtMillis` or `endsAtMillis` outside the same bound, when
  `withinOpeningHours` is called, then it returns `malformed-interval` and does not throw. The
  existing verdict variant is reused; no new variant is introduced. *(QS-12)*

### An interval ending at local midnight

- **AC-17** — Given a dealership open 09:00–24:00 local and a 60-minute job starting 23:00 local, when
  `withinOpeningHours` is called, then the verdict is **within**, not *spans local days*. *(QS-9)*
- **AC-18** — Given an interval that genuinely spans two local days — 23:00 to 01:00 the next — then
  the verdict is still *spans local days*. This is the negative control: AC-17 alone is satisfied by
  deleting the check.
- **AC-19** — Given reference data holding `'24:00:00'` in a closing-time column, when it is read and
  parsed, then it yields `86400` and is **not** rejected as malformed. PostgreSQL accepts
  `'24:00:00'` and a row can hold it, so rejecting it at the parser would turn valid reference data
  into an error.

## In scope

- The route with its TypeBox schemas, the booking use case, the persistence insert, and the single
  place where a PostgreSQL error code is translated into a domain outcome.
- `tests/concurrency/no-bay-overlap.test.ts` and `tests/concurrency/no-technician-overlap.test.ts`.
- `tests/contract/error-taxonomy.test.ts`, the `problem+json` serialiser, and the mapping from a use
  case's outcome to a status.
- **The minimal prune-and-retry loop, brought into scope by the human on 2026-09-06.** Attempt,
  classify the exclusion violation, prune *that candidate value*, retry; a list that empties is the
  refusal, and the resource named is the list that emptied. How candidates are *ordered* stays the
  next slice's; this is the loop only.
- The two ratified domain fixes: the epoch bound in the interval constructor **and** in the
  opening-hours module's first step, and the midnight normalisation.

## Out of scope

- **Candidate ordering and the attempt cap** — the seeded shuffle and the cap of 16 belong to the
  next slice, with the no-spurious-refusal scenario. Only the minimal loop is here.
- `appointment-not-confirmed`, the `409` for moving a cancelled appointment. It needs rescheduling, so
  it lands with that slice and extends the taxonomy test.
- Asserting that the emitted OpenAPI document matches the committed one — the slice where the
  document exists.
- Cancellation, rescheduling, availability, telemetry.
- **Sharing the `8_640_000_000_000_000` constant between the two domain files.** No domain module may
  import another, so the literal appears twice with no mechanism to share it. That is the debt the
  ruling booked, recorded in arc42 §11 rather than resolved here; reversing the ruling to avoid a
  duplicated constant is a scope change and the human's.
- **Deleting the `'24:00:00'` parse arm**, refused on measurement: PostgreSQL round-trips that value,
  so real reference data can hold it. The dead branch was the *symptom*; the live defect is that a
  midnight-ending job is refused.
- Opening hours that wrap past midnight into the next day — an 18:00–02:00 window. A genuinely
  two-day window, which neither the opening-hours ADR nor the midnight fix addresses.

## Definition of done

Beyond `CLAUDE.md` §10:

- The concurrency tests run against real PostgreSQL with several pooled connections released from a
  barrier, and record the shuffle's seed in the failure message so a failing interleaving is
  re-runnable rather than a flake.
- AC-15's property and AC-18's negative control are reported as **named mutants**, not as a score:
  for a discrimination claim, name the mutant. AC-19 additionally retires the unreachable-branch
  finding from the previous slice by making the `'24:00:00'` arm reachable **and** killed.
- The taxonomy's one recorded tension is left recorded, not harmonised: out-of-hours stays `400`
  although `422` would sit more naturally beside the reference failures. Changing it means
  superseding the opening-hours ADR.
