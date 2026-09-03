---
id: "10"
title: The OpenAPI document and the cURL harness — the stubbed client layer
status: ready
depends_on: ["09"]
arc42: ["§3.1", "§8.6"]
adr: [5]
quality_scenarios: [QS-11]
loopbacks: 0
---

## Goal

The contract the brief asks for, and a way to exercise it by hand. The OpenAPI document is
**emitted** from the TypeBox route schemas rather than hand-authored — one source of truth, which is
the deciding argument in ADR-0005 and what puts the document in METHODOLOGY §4's *generated* tier.

## Acceptance criteria

- **AC-1** — Given the route schemas, when the document is generated, then it matches the committed
  `openapi.json` byte for byte; a drifted document fails CI. *(QS-11, second half)*
- **AC-2** — Given the document, when it is validated, then it is a valid OpenAPI 3.1 description
  covering all five operations of §8.6.
- **AC-3** — Given every error `type` in §8.6, when the document is read, then each is described as
  an `application/problem+json` response on the operations that can produce it.
- **AC-4** — Given a running service seeded with fixtures, when the cURL harness is executed
  end to end, then it books, reads, reschedules and cancels, and prints the status and `type` of each
  response.
- **AC-5** — Given the harness, when the double-booking script is run, then it fires concurrent
  requests for one slot and shows exactly one `201` and the rest `409` — the invariant demonstrated
  from a terminal, without the test suite.

## In scope

- Emitting and committing the OpenAPI document; the contract test asserting it matches.
- `harness/` — cURL scripts covering the five operations plus the contention demonstration.

## Out of scope

- A client SDK, a UI, or a Postman collection. `CLAUDE.md` §1 stubs the client layer at the contract
  and the harness.
- Reference-data endpoints. A-7 keeps seeding to migrations and fixtures precisely so this surface
  stays the five operations that carry risk.

## Definition of done

Beyond `CLAUDE.md` §10:

- The README's build-and-run section is proven by following it on a clean checkout, not by reading it.
