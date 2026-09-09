---
id: "10"
title: The OpenAPI contract — problem+json per operation, and a harness that asserts
status: done
depends_on: ["09"]
arc42: ["§3.1", "§8.5", "§8.6", "§10.2", "§11.1"]   # §8.5 added at step 1: a measured serialiser
              # row lands there, and declaring it after the fact is the worse order.
adr: [5, 25]
quality_scenarios: [QS-11]
inherits: ["A-06-2", "R-09-1", "R-09-2", "R-09-7", "R-09-12", "R-09-13"]
loopbacks: 0
folded_at: 2026-09-04       # this file was a tombstone from 2026-09-04 to 2026-09-08
folded_by: gate-D
reopened_at: 2026-09-08     # human ruling A-09-4; history below, not tidied away
reopened_by: human
---

> **A tombstone for four days, reopened 2026-09-08 by human ruling `A-09-4`.** Both decisions stay in the
> record; the history is at the foot of this file.

## Goal

The five operations already have a committed OpenAPI document and two cURL scripts, both merged with the
previous slice. What is missing is the half that can fail. Every error response must be declared as
`application/problem+json` on the operations that can produce it — today all 25 declare
`application/json` while the service has sent `problem+json` since the taxonomy landed. No operation may
accept a caller-supplied appointment id. And the harness must **check** the statuses it prints rather
than printing whatever it got.

## Acceptance criteria

- **AC-1** — Given every error `type` in the taxonomy, when the document is read, then each is
  declared as an `application/problem+json` response on the operations that can produce it, and each
  operation's set is asserted **by equality** — deleting a `422` fails. *(QS-11)*
- **AC-2** — Given the taxonomy, when it is read, then it carries a `type` × operation matrix, and
  each route declares only its own — `GET /availability` stops claiming `vehicle-not-owned`.
- **AC-3** — Given the emitted document, when every operation is read, then no `requestBody` schema
  carries an appointment id under any name, and the only id `parameters` are path ids on the three
  operations addressing an appointment that already exists. Falsified by adding an appointment id to
  the booking body.
- **AC-4** — Given a seeded running service, when the harness runs end to end, then it books, reads,
  reschedules and cancels, printing each response's HTTP status and its `type` where the response is
  a problem document, and **failing on the first status that is not the one that operation must
  answer**. Today only the booking step is checked.
- **AC-5** — Given the double-booking script, when it runs, then it counts its own results and exits
  non-zero unless exactly one `201` and the rest `409` — the invariant demonstrated from a terminal,
  without the test suite. Today that expectation lives in a header comment and the script always
  exits 0.
- **AC-6** — Given a checkout on any POSIX host, when the harness runs, then it needs no GNU
  coreutils: `date -u -d` becomes `node -e`, and a seed script with the ids it prints is in
  `package.json` and the README — which is what AC-5's *without the test suite* means.
- **AC-7** — Given `GET /availability`'s published description, when it is read, then it states the
  rule — `to` must be strictly later than `from`, and a violation is
  `400 /problems/malformed-request` — and names neither TypeBox nor the schema. The previous slice's
  advisory-disclosure criterion must stay green across this edit.

## What the previous slice keeps, and why it is not here

Three contract criteria are green, asserted by tests that can fail, and **stay where they are**: that the
committed document matches what the builder emits byte for byte; that it is a valid OpenAPI 3.1
description over all five operations; and that `GET /availability` documents that a free answer is not a
reservation and is true only of the interval queried. Their subject merges there and this slice amends
it, so they are standing guards it must keep green — and moving a drift guard into an unstarted slice
would leave the committed document unpinned for however long that slice takes.

## Inherited scope

- **`A-06-2` — nothing asserts that the id generator is the only place an appointment id is minted**, and
  a `404` meaning *never existed* rests on it: an id must be unreachable before it exists. Deferred first
  to the slice that emits the document, then **re-deferred here**, because that slice emitted the document
  and never built the assertion. AC-1's per-operation walk is the same traversal, over every operation
  rather than the files someone grepped. Discharged as **AC-3**.
- **`R-09-1`** — the finding that carried the previous slice's design-defect ruling: media types, and a
  taxonomy with no operation dimension. Its telemetry half was built there; this is the half that was not.
  **AC-1, AC-2.**
- **`R-09-2`** — the id-minting assertion rides that ruling rather than being softened into an assumption.
  **AC-3.**
- **`R-09-7`** — the harness must bind each step to the status that operation must answer, with the ruling
  that `type` is an error-response word: a `200` has none. **AC-4.**
- **`R-09-12`** — GNU-only `date -u -d` in the harness, and no seed script. **AC-6.**
- **`R-09-13`** — a TypeBox implementation note published as contract prose. **AC-7.**

## In scope

- `src/http/routes/*.ts` response schemas, the taxonomy's operation matrix behind them, the re-emitted
  `docs/api/openapi.json`, `tests/contract/openapi-document.test.ts`, `harness/` and the README run
  section.

## Out of scope

- Anything the document describes changing shape: this slice makes the description true, moving no status,
  `type` or body.
- A `503` row for a saturated pool: a new row in a closed taxonomy, which QS-11 requires reached end to
  end — so a booking-path slice, not this one.
- A client SDK, a UI or a Postman collection.

## Definition of done

Beyond `CLAUDE.md` §10:

- **A red commit of its own.** AC-1's assertion is green today because it reads the `type` strings and
  never the media type; strengthening it to compare declared content by equality is what turns it red.
- The three standing contract guards still green — the regression this slice is most able to cause.
- The harness run by hand on a clean checkout, from the README, before it is claimed.

## History — folded at the phase-4 gate, reopened by human ruling

**Folded 2026-09-04.** The measured cost of a slice missed the budget by more than an order of magnitude,
and the human cut slices — eleven to eight — rather than agents. All five criteria moved into the
close-out slice.

**Reopened 2026-09-08.** That slice's step-5 review raised three blocking findings and **all three sat on
the contract half** — the evidence that the fold was wrong, a half separable after the fact having been
separable all along. The third option, merging it with those criteria recorded as debt, was declined: it
ships the assessment without one of the brief's named deliverables.

**`folded_into` is gone from the front matter and nothing else is.** That field is a live redirect rather
than a historical fact — the deferral tooling follows it, so leaving it would resolve the id-minting
obligation back to the close-out slice and silently undo this split. `folded_at` and `folded_by` stay,
because they record when and by whom.
