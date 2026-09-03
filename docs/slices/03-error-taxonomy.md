---
id: "03"
title: The error taxonomy — every failure has one status, one type, and a test
status: ready
depends_on: ["02"]
arc42: ["§8.6"]
adr: [1, 2, 5]
quality_scenarios: [QS-11]
loopbacks: 0
---

## Goal

Every row of §8.6's status table is reachable and produces exactly that status and that `type`, as
RFC 9457 `application/problem+json`. A client distinguishes an out-of-hours request from a contended
one from an unknown vehicle without parsing prose.

## Acceptance criteria

- **AC-1** — Given a request whose derived interval leaves the dealership's opening hours, when it is
  booked, then `400` with `type=/problems/outside-opening-hours` — **not** `409`. The decision is
  made by `domain/openingHours.ts`, which reads no booking (GC-1).
- **AC-2** — Given a malformed body or an unparseable timestamp, when it is submitted, then `400`
  with `type=/problems/malformed-request`, rejected by the route schema before any handler runs.
- **AC-3** — Given an unknown dealership, service type, customer or vehicle, when it is named, then
  `422` with `type=/problems/unknown-reference` carrying `reference` — **not** `404`.
- **AC-4** — Given a vehicle that is not the named customer's, when it is booked, then `422` with
  `type=/problems/vehicle-not-owned` — **not** `403`. It is validation, not authorisation (ADR-0002).
- **AC-5** — Given a contended booking, when every candidate is refused, then `409` with
  `type=/problems/no-capacity` carrying `resource` set to the contended resource.
- **AC-6** — Given every row of §8.6's table, when the contract test runs, then each is reachable and
  no two rows collide — the taxonomy is total and stable. *(QS-11)*

## In scope

- `tests/contract/error-taxonomy.test.ts`.
- The problem+json serialiser, and the outcome-not-exception mapping of §8.6.

## Out of scope

- `appointment-not-confirmed` (`409` on moving a cancelled appointment) — it needs rescheduling, so
  it lands with slice 06 and extends this test.
- Asserting the emitted OpenAPI document matches the committed one — slice 09, where the document
  exists.

## Definition of done

Beyond `CLAUDE.md` §10:

- §8.6's recorded tension is left recorded, not harmonised: out-of-hours stays `400` although `422`
  would sit more naturally beside the reference failures. Changing it means superseding ADR-0001.
