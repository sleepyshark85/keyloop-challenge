---
id: "16"
title: Availability derives its own window from the service type
status: ready
depends_on: ["15"]
arc42: ["§6.5", "§8.6", "§10.2", "§11.1"]
adr: [39]
quality_scenarios: [QS-8, QS-11, QS-12, QS-14]
loopbacks: 0
scope_ruled_at: 2026-09-10
scope_ruled_by: architect
---

> **`H-16-1` — raised by the human at slice 15's gate, 2026-09-10**, with a reproduction against a live
> service: *"since booking an appointment only need to pass in start time, I would expect the
> availability check also require the same, not end time."*

## Goal

`POST /appointments` takes a start and derives the end from the service type's duration.
`GET /availability` receives the same service type and then makes the caller supply the window
anyway — so a caller who guesses a 30-minute window for a 60-minute job is told a bay is free and
then refused `409` by the booking. Nothing is racing and nothing is stale: the caller named a
window that is not the interval the booking would occupy, and the endpoint cannot refuse to answer
a question it was asked. This slice removes the caller's ability to ask it. Availability takes
`startsAt`, derives the interval through `deriveInterval` — the booking path's own function, not a
copy of it — and **names the interval it answered about in its own response**, so duration has one
source of truth and the window is observable rather than assumed.

## Acceptance criteria

- **AC-1** — *(the reported defect, as an assertion)* Given a dealership with exactly one bay and
  one qualified technician for a 60-minute service type, and one confirmed appointment occupying
  `[09:30, 10:30)`, when availability is queried with `startsAt=09:00`, then `bays` and
  `technicians` are both empty, and a booking at that same `startsAt` answers `409`; when queried
  with `startsAt=10:30`, both are non-empty and a booking at that `startsAt` answers `201`. The
  `201` is cancelled between cases, so each case starts from the same state.
- **AC-2** — *(one derivation, made mechanical)* Given a `(dealershipId, serviceTypeId, startsAt)`
  both endpoints accept, when availability answers `200` and a booking on the same triple answers
  `201`, then the `200`'s `startsAt` and `endsAt` are **string-equal** to the `201`'s.
  <br>*A test that recomputed the end from `durationMinutes` would be asserting its own arithmetic.
  Equality between two responses asserts the system's, and it is the only assertion here that can
  fail if the two paths ever derive differently.*
- **AC-3** — *(the contract, replaced not extended)* The emitted `docs/api/openapi.json` declares
  exactly three query parameters for `GET /availability` — `dealershipId`, `serviceTypeId`,
  `startsAt` — with no parameter named `from` or `to`; the operation declares exactly the problem
  types it can produce: `/problems/malformed-request`, `/problems/outside-opening-hours`,
  `/problems/unknown-reference`, `/problems/internal`. A request carrying `from` and `to` and no
  `startsAt` answers `400 /problems/malformed-request`. `npm run docs:openapi -- --check` passes.
- **AC-4** — *(the two endpoints agree on every shared failure)* For one
  `(dealershipId, serviceTypeId, startsAt)`, the booking's customer and vehicle valid, availability
  and `POST /appointments` answer the **same status and the same `type`** for each of: an unknown
  dealership (`422`, `reference: dealership`); an unknown service type (`422`,
  `reference: service-type`); a `startsAt` that satisfies the wire pattern but is not a renderable
  instant (`400 /problems/malformed-request`); a derived interval outside the dealership's opening
  hours (`400 /problems/outside-opening-hours`); a dealership whose opening-hours reference data
  cannot be read (`500 /problems/internal`). And they agree on **precedence**: one request naming
  an unknown dealership *and* an unusable `startsAt` answers `422` from both.
- **AC-5** — *(QS-8, amended)* Given an arbitrary generated schedule over one dealership and an
  arbitrary generated `startsAt`, with no concurrent writer, then over the **candidate universe**
  every pair the query reports free is accepted by an `INSERT` of exactly the interval **the
  response names**, and every pair it omits is rejected as an exclusion violation. Slice 08's six
  mechanics survive unchanged in kind, with two amendments:
  - the probe interval is **read from the response and never recomputed by the test** — a test that
    recomputes it re-implements the derivation this slice exists to remove;
  - the boundary bias moves onto `startsAt`: the generator aims appointments to end exactly at the
    derived start and to begin exactly at the derived end. The generator **may** use the fixture's
    declared duration to aim; only the probe's interval may not. A generator that aims wrong
    produces dull cases; a probe that computes wrong produces a vacuous property.
  <br>*This property checks the answer against the window the server named. That the window itself
  is the right one is **AC-2's** job, not this property's, and saying so is the point — QS-8 alone
  would pass against a server that derived a wrong window consistently.*
- **AC-6** — *(QS-14, amended and measured)* The performance scenario's *one-day availability
  query* is replaced by an availability query over the derived window against the unchanged fixture
  (5 bays, 20 technicians, 500 appointments over a week): p95 < 200 ms over 100 runs. The measured
  p95 is recorded in arc42 §11 at step 7 beside its machine class, because the range this now
  measures is narrower than the one the budget was set against.
- **AC-7** — *(regression guard)* Any `200` still carries `advisory` — `Type.Boolean()`, never a
  literal type — and a `disclaimer` (`Type.String()`) carrying both of slice 08's facts: that a
  free result is not a reservation, and that it is true only of one interval. That interval is now
  the one named in the same response rather than a window the caller supplied, and the disclaimer
  and the `200` description in the emitted document both say so.

**The red set: AC-1 to AC-6 must all fail in the one red commit.** AC-7 is the named exception —
its unchanged half passes today and exists to fail if this slice breaks it; its new half (the
disclaimer no longer describing a caller-supplied window) fails red with the rest.

## In scope

- `src/http/routes/availability.ts` — querystring, response schema, the exhaustive `switch`, and
  the published operation description.
- `src/application/queryAvailability.ts` — signature, outcome union, and the call to
  `deriveInterval`. **`deriveInterval` itself is not edited**, and that is the design: reusing it
  unchanged is what makes "the same derivation" a fact rather than a claim.
  <br>**Step-4 obligation (`T-16-1`)**: where the occupancy and appointment intervals are both
  named, a short comment **citing arc42 §6.5 and A-4** — not restating them. No test and no Stryker
  directive; design §5 ruling 8 says why.
- `src/http/routes/appointments.ts` — **one keyword**: `outsideOpeningHours` is exported. No
  behaviour, no docblock, no diff beyond it (`I-16-1`; design §2, §5 ruling 6).
- `docs/api/openapi.json`, regenerated — never hand-edited.
- `docs/WALKTHROUGH.md` Scenario 3, whose `curl` is the only place outside tests that sends
  `from`/`to`.
- The retired-ADR citation in `queryAvailability.ts:2`, because this slice deletes the docblock
  section carrying it anyway. See *Known limits* — there are ten, not one.

## Out of scope

- **A day-view or slots endpoint.** ADR-0039 forecloses the range query in this operation and says
  what the right shape would be if the question is ever asked. Backlog, not this slice.
- **`README.md` and `harness/`.** Neither sends `from`/`to`; no script calls availability at all.
- **The advisory pre-filter on the booking path**, declined at slice 08 on a measurement, unchanged
  here.
- **§8.6's claim that availability answers `422` for a service type nobody at that dealership is
  qualified for.** It does not — it returns empty lists. A real discrepancy, older than this slice
  and not created by it (`F-16-2`); fixing it here would be a drive-by.
- A buffer (A-4), any freshness guarantee, and `§11.2 R-5`'s range-expression duplication, which
  this slice does not touch.

## Definition of done

Beyond `CLAUDE.md` §10:

- ADR-0039 moves `proposed` → `accepted` at step 7.
- The `zone-transport` marker's four-file list is **unchanged** — `queryAvailability.ts` passes the
  dealership as one value and never names `ianaZone`, which is what `deriveInterval`'s signature
  exists for. Asserted in CI by `tests/architecture/ambiguity-containment.test.ts` (QS-12), not by
  a new test.
- The measured availability p95 recorded in §11 (AC-6), so a future tightening has a baseline.

## Scope ruled at step 2 — `F-16-1a`, outcome (d), provisional until the gate

`CLAUDE.md` §6 places this with the architect and the gate reviews it. What moved:

- **The `src/persistence/appointmentRepository.ts:516,526` citations stay with the booked sweep.**
  `busyResources` is genuinely unedited and neither citation becomes false once the caller derives
  the bounds, so the drive-by buys nothing and costs the "persistence not edited" claim.
- **The ownership count is corrected.** Of the seven `tests/` citations the test-engineer claimed
  as its own, **four** are: `tests/property/availability-agrees-with-constraint.db.test.ts:20,69`
  and `tests/acceptance/availability.test.ts:22,52`.
  `tests/unit/application/queryAvailability.test.ts:14,105` and
  `tests/unit/persistence/appointmentRepository.test.ts:533` are the **implementer's** under §5,
  which is NON-NEGOTIABLE. Acting on the original count would have been a §5 breach — in the slice
  whose whole subject is two things agreeing.

## Known limits, recorded at step 1

- **`F-16-1` — ten live citations of ADR-0032, which was retired.** The 2026-09-07 retirement's
  reference rewrite missed this cluster: `src/application/queryAvailability.ts`,
  `src/persistence/appointmentRepository.ts` (×2), and seven in `tests/`. **ADR-0032 has no file in
  `docs/adr/` at all** — these cite an ADR that does not exist. Roles fix what they are already
  rewriting, in their own paths: the test-engineer four, the implementer three. **The residue is
  three, all in the `busyResources` cluster** — `appointmentRepository.ts:516,526` and
  `tests/unit/persistence/appointmentRepository.test.ts:533` — which is the coherent unit for the
  repository-wide sweep booked in §11.1.
- **`D-16-2` — `docs/diagrams/availability-composition.svg` will depict a retired parameter.**
  Presentation diagrams are refreshed once, in phase 6; redrawing per slice costs several hundred
  lines of mandatory reading for an artifact that does not diff. Same treatment as
  `concurrent-booking.svg`, which has carried the same debt since slice 07.
