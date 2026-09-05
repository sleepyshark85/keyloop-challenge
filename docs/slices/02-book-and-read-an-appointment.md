---
id: "02"
title: Book an appointment, read it back, and give every failure one status and one type
status: ready
depends_on: ["01"]
absorbs: ["03", "12", "13"]
arc42: ["§5.2", "§6.1", "§8.6"]
adr: [1, 2, 4, 5, 6, 8, 14, 15]
quality_scenarios: [QS-1, QS-2, QS-11, QS-9, QS-12]
loopbacks: 0
deferred_from: ["R-01-1:0014", "R-01-4:0015"]
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

> **Also absorbs slices 12 and 13 by the human's cost ruling of 2026-09-05.** Both were raised as §6
> **(b)** deferred improvements at slice 01 step 5 — R-01-1 and R-01-4 — and both had their remedies
> *named exactly* by the architect and then **ratified** as ADR-0014 and ADR-0015. Running two full
> seven-step loops to apply two decisions that are already agreed is the slicing problem §6's loopback
> governor warns about, seen from the other end: the design step each would consume has effectively
> already happened.
>
> **AC-13 to AC-19 are their acceptance criteria, carried across unchanged in substance.** They are
> domain-layer work and touch `src/domain` only, so they neither depend on nor block the booking path
> above and can go green in either order.
>
> The cost, stated rather than discovered: this slice now carries the booking path, the whole error
> taxonomy, **and** two ratified domain fixes. That is precisely why it keeps the **full human gate**
> under the same ruling that granted 05, 08 and 09 a light one. If it needs a second red commit it is
> two slices after all — DCR, not workaround.

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

### Absorbed from slice 12 — ADR-0014, an `Instant` is renderable by construction

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

### Absorbed from slice 13 — ADR-0015, an interval ending at local midnight

- **AC-17** — Given a dealership open 09:00–24:00 local and a 60-minute job starting 23:00 local, when
  `withinOpeningHours` is called, then the verdict is **within**, not `spans-local-days`. *(QS-9)*
- **AC-18** — Given an interval that genuinely spans two local days — 23:00 to 01:00 the next — then
  the verdict is still `spans-local-days`. This is the negative control: AC-17 alone is satisfied by
  deleting the check.
- **AC-19** — Given reference data holding `'24:00:00'` in a closing-time column, when it is read and
  parsed, then it yields `86400` and is **not** rejected as `malformed-hours`. PostgreSQL accepts
  `'24:00:00'` and a row can hold it, so rejecting it at the parser would turn valid reference data
  into an error.

## In scope

- `src/http` route with TypeBox schemas, `src/application` booking use case, `src/persistence` insert
  and the single SQLSTATE translation site (§5.2).
- `tests/concurrency/no-bay-overlap.test.ts` and `tests/concurrency/no-technician-overlap.test.ts`.
- `tests/contract/error-taxonomy.test.ts`, the problem+json serialiser, and the
  outcome-not-exception mapping of §8.6.
- Enough candidate selection to allocate *a* free bay and technician — the ordering policy and the
  retry loop are slice 04.
- The two ratified domain fixes: the epoch bound in `src/domain/interval.ts`'s `instant()` **and** in
  `src/domain/openingHours.ts` step 1 (ADR-0014), and step 4's midnight normalisation (ADR-0015).

## Out of scope

- Retrying across remaining candidates on conflict (ADR-0004) — slice 04. Here a `23P01` on the
  chosen candidate is a `409`, which is correct but pessimistic, and slice 04's QS-3 is what proves
  it improved.
- `appointment-not-confirmed` (`409` on moving a cancelled appointment) — it needs rescheduling, so
  it lands with slice 06 and extends the taxonomy test.
- Asserting the emitted OpenAPI document matches the committed one — slice 09, where the document
  exists.
- Cancellation, rescheduling, availability, telemetry.
- **Sharing the `8_640_000_000_000_000` constant between the two domain files.** Under the literal
  AC-6 ruling no domain module may import another, so it appears twice with no mechanism to share it.
  That is **D-01-2** cashing in, booked as debt in design §11 and arc42 §11 rather than resolved here;
  reversing the AC-6 ruling to avoid a duplicated constant is a scope change and the human's.
- **Deleting the `'24:00:00'` parse arm.** Refused explicitly as ADR-0015's Option C, on the
  `'24:00:00'::time` measurement. The dead branch was the *symptom*; the live defect is that a
  midnight-ending job is refused.
- Opening hours that wrap past midnight into the next day (an 18:00–02:00 window). A genuinely
  two-day window, addressed by neither ADR-0001 nor ADR-0015.

## Definition of done

Beyond `CLAUDE.md` §10:

- The concurrency tests run against real PostgreSQL with several pooled connections released from a
  barrier, and record ADR-0009's seed in the failure message so a failing interleaving is re-runnable
  rather than a flake.
- AC-15's property and AC-18's negative control are reported as **named mutants**, not as a score:
  *for a discrimination claim, name the mutant.* AC-19 additionally retires slice 01's
  unreachable-branch finding by making the `'24:00:00'` arm reachable **and killed**.
- §8.6's recorded tension is left recorded, not harmonised: out-of-hours stays `400` although `422`
  would sit more naturally beside the reference failures. Changing it means superseding ADR-0001.
