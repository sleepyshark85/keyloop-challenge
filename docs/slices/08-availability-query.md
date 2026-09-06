---
id: "08"
title: Availability — advisory by contract, and provably in agreement with the constraint
status: ready
depends_on: ["07"]
arc42: ["§6.5", "§8.6"]
adr: [8]
quality_scenarios: [QS-8]
inherits: ["I-04-5"]   # deferred here by ruling; slice:check enforces it (A-05-5)
loopbacks: 0
gate: light          # human cost ruling 2026-09-05; revoked by any open MAJOR/BLOCKING
---

## Goal

`GET /availability` answers *"what is free?"* for the booking screen. It exists for user experience
and never for correctness, and says so in its own response and its OpenAPI description — staleness is
a property of this domain interface, not an implementation detail.

What can honestly be proven about it is agreement under quiescence: with no concurrent writer, what
it reports free is exactly what the constraint accepts.

## Acceptance criteria

- **AC-1** — Given an arbitrary generated schedule over one dealership and an arbitrary query
  interval, with no concurrent writer, then **every** (bay, technician) pair the query reports free is
  accepted by an `INSERT`, and **every** pair it omits is rejected with `23P01`. *(QS-8)*
- **AC-2** — Given a bay with a confirmed appointment `[09:00, 10:00)`, when availability is queried
  for `[09:30, 10:30)`, then that bay is not returned; when queried for `[10:00, 11:00)`, it is.
- **AC-3** — Given a technician qualified for a service type at dealership X only, when availability
  is queried at dealership Y, then that technician is not returned (A-3, A-9).
- **AC-4** — Given a cancelled appointment, when availability is queried over its interval, then the
  resources it held are reported free.
- **AC-5** — Given any availability response, when it is read, then it carries an explicit advisory
  flag, and the OpenAPI description states that a free result is not a reservation.
- **AC-6** — Given a query whose `to` precedes its `from`, then `400` with
  `type=/problems/malformed-request`.

## Inherited scope — from slice 05, ruled at its step 5 (R-05-2)

**AC-1 of slice 05 rests on a fact this slice deletes.** What makes cancellation's freed-slot proof
attributable is that `candidateResources` reads only `service_bay`, `technician` and
`technician_qualification` — **never `appointment`** — so the candidate list is *identical* before and
after the cancel, and the only thing that moved between the `409` and the `201` is the constraint's
verdict on ADR-0004's retry attempts. The advisory pre-filter named in Out of scope below makes the
candidate path read `appointment`, and that attribution stops holding: a `201` after a cancel could
then come from a changed candidate order rather than from the predicate.

**So slice 08 owes slice 05's AC-1 a re-derivation**, not a deletion. The cheapest form is to keep the
1×1 fixture, where a pre-filter cannot change an order of one — but that must be *asserted* here
rather than left true by accident, because the trap slice 05 closed by shape reopens the moment the
fixture widens. Its AC-4 above is the availability-side mirror and does not substitute for it.

## In scope

- The availability query and its route; `tests/property/availability-agrees-with-constraint.test.ts`
  using `fast-check`.

## Out of scope

- **Any freshness guarantee.** §10 deliberately has no scenario for it: asserting freshness would be
  asserting the property the whole design gives up on purpose.
- Using the query as an **authoritative** allocator — deciding from the read whether a booking may
  proceed. A-5 fixed booking as "can I have 09:00?", not "find me something Tuesday", and making
  availability authoritative would reintroduce check-then-act. **An advisory pre-filter on the
  booking path's candidate list is in scope and is not that**: it changes only which candidate is
  attempted first, every attempt is still adjudicated by the `INSERT`, a refusal still requires a
  verdict (ADR-0016), and it is only trustworthy because AC-1's QS-8 property holds. It closes
  **D-04-1** (slice 04) and unblocks slice 09's AC-13.
- Deleting `docs/slices/99-availability.md`, the synthetic board fixture — that happens at phase 6.

## Definition of done

Beyond `CLAUDE.md` §10:

- The property test holds the constraint's range expression and the query's in agreement. §4.2
  explains why a shared SQL function cannot do this job; the reviewer checks the reasoning still
  applies to what was built.
