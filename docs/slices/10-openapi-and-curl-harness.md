---
id: "10"
title: The OpenAPI contract — problem+json per operation, and a harness that asserts
status: ready
depends_on: ["09"]
arc42: ["§3.1", "§8.6", "§10.2", "§11.1"]
adr: [5, 25]
quality_scenarios: [QS-11]
inherits: ["A-06-2", "R-09-1", "R-09-2", "R-09-7", "R-09-12", "R-09-13"]
loopbacks: 0
folded_at: 2026-09-04       # this file was a Gate D tombstone from 2026-09-04 to 2026-09-08
folded_by: gate-D
reopened_at: 2026-09-08     # human ruling A-09-4; history below, not tidied away
reopened_by: human
---

> **A tombstone for four days, reopened 2026-09-08 by human ruling `A-09-4`.** Both decisions stay
> in the record; the history is at the foot of this file.

## Goal

The five operations already have a committed OpenAPI document and two cURL scripts; both merge
with slice 09. Missing is the half that can fail: **every error response declared as
`application/problem+json` on the operations that can produce it**, an assertion that **no
operation accepts a caller-supplied appointment id**, and a harness that **checks** the statuses it
prints.

## Acceptance criteria

- **AC-1** *(slice 09's AC-9)* — Given every error `type` in §8.6, when the document is read, then
  each is declared as an `application/problem+json` response on the operations that can produce it,
  and each operation's set is asserted **by equality** — deleting a `422` fails. Today all 25
  responses declare `application/json` while `problem.ts:76` has sent `application/problem+json`
  since slice 03. *(QS-11)*
- **AC-2** — Given §8.6, when it is read, then it carries a `type` × operation matrix, and each
  route declares only its own — `GET /availability` stops claiming `vehicle-not-owned`.
- **AC-3** *(discharges `A-06-2`)* — Given the emitted document, when every operation is read, then
  no `requestBody` schema carries an appointment id under any name, and the only id `parameters`
  are path ids on the three operations addressing an appointment that already exists. Falsified by
  adding `appointmentId` to `BookingBody`.
- **AC-4** *(slice 09's AC-10)* — Given a seeded running service, when the harness runs end to end,
  then it books, reads, reschedules and cancels, printing each response's HTTP status and its
  `type` where the response is a problem document, and **failing on the first status that is not
  the one that operation must answer**. Today only `book` is checked; the other three print
  whatever they got.
- **AC-5** *(slice 09's AC-11)* — Given the double-booking script, when it runs, then it counts its
  own results and exits non-zero unless exactly one `201` and the rest `409` — the invariant
  demonstrated from a terminal, without the test suite. Today that expectation lives in a header
  comment and the script always exits 0.
- **AC-6** — Given a checkout on any POSIX host, when the harness runs, then it needs no GNU
  coreutils: `date -u -d` becomes `node -e`, and `npm run harness:seed` with the ids it prints are
  in `package.json` and the README, which is what AC-5's *without the test suite* means.
- **AC-7** — Given `GET /availability`'s published description, when it is read, then it states the
  rule — `to` at or after `from`; a violation is `400 /problems/malformed-request` — and names
  neither TypeBox nor the schema. Slice 09's AC-5b must stay green across this edit.

## What slice 09 keeps, and why it is not here

Three contract criteria are green, asserted by tests that can fail, and **stay in slice 09**: its
AC-7 (the committed document matches `buildOpenApiDocument()` byte for byte), AC-8 (valid OpenAPI
3.1 over all five operations) and AC-5b (`GET /availability` documents that a free answer is not a
reservation and is true only of the interval queried). Their subject merges with slice 09 and stays
in the tree; this slice amends it. They are therefore standing guards it must keep green — AC-5b
guards the exact string AC-7 rewrites — and moving a drift guard into an unstarted slice would
leave `docs/api/openapi.json` unpinned for however long this one takes.

## Inherited scope

- **`A-06-2` — nothing asserts that `deps.newId()` is the only place an appointment id is minted**,
  and ADR-0025 rests on it: an id unreachable before it exists makes the read's `absent` answer
  permanent. Deferred at slice 06 to the slice that emits the document; **re-deferred here at slice
  09 step 7**, because slice 09 emitted the document and never built the assertion. ADR-0019 both
  ways — *cheaper*, since AC-1's per-operation walk over `requestBody`, `parameters` and
  `responses` is the same traversal; *stronger*, since it runs over every operation rather than the
  files someone grepped. Discharged as **AC-3**.
- **`R-09-1`** — the finding that carried slice 09's `(c)`: media types and §8.6's missing matrix.
  Its telemetry half was built there; this is the half that was not. **AC-1, AC-2.**
- **`R-09-2`** — A-06-2's assertion rides that `(c)` rather than being softened to an assumption.
  **AC-3.**
- **`R-09-7`** — the harness status binding, with the ruling that `type` is an error-response word:
  a `200 AppointmentView` has none. **AC-4.**
- **`R-09-12`** — GNU coreutils in `date -u -d`, and the missing seed script. **AC-6.**
- **`R-09-13`** — a TypeBox implementation note published as contract prose. **AC-7.**

## In scope

- `src/http/routes/*.ts` response schemas, the §8.6 matrix behind them, and the re-emitted
  `docs/api/openapi.json`.
- `tests/contract/openapi-document.test.ts` — AC-1 by equality, AC-3's negative walk.
- `harness/`, `package.json`'s harness scripts, and the README's run section.

## Out of scope

- Anything the document describes changing shape: this slice makes the description true, and moves
  no status, `type` or body.
- A `503` row for a saturated pool (`D-07-1`'s open half): a new row in a closed taxonomy
  (ADR-0024) that QS-11 requires reached end to end, so a booking-path slice, not this one.
- A client SDK, a UI or a Postman collection (`CLAUDE.md` §1).

## Definition of done

Beyond `CLAUDE.md` §10:

- **A red commit of its own.** AC-1's assertion is green today because it reads the `type` strings
  and never the media type; strengthening it to `content[…]` by equality is what turns it red, and
  §2.4 wants that observed rather than argued.
- Slice 09's AC-7, AC-8 and AC-5b still green — the regression this slice is most able to cause.
- The harness run by hand on a clean checkout, from the README, before it is claimed.

## History — folded at Gate D, reopened at `A-09-4`

**Folded 2026-09-04 by Gate D.** Criterion C6 — *the budget is real* — failed by more than an order
of magnitude, and C6's wording says cut slices or reduce agent count; the human ruled the first and
declined the second, 11 slices to 8. All five criteria moved into slice 09 as AC-7 to AC-11.
Figures: `docs/team-log/events.jsonl`, span `p-4-gate-d`. Gate D also proposed folding 07 into 06
and withdrew it, Gate C having defended that seam by name; the seam stands.

**Reopened 2026-09-08, ruling `A-09-4`.** Slice 09's step-5 review raised three BLOCKING findings
and **all three sat on the contract half** — the evidence that the fold was wrong, a half separable
after the fact having been separable all along. The third option, merging slice 09 with its
contract criteria as §11 debt, was declined: it ships the assessment without one of the brief's
named deliverables.

**`folded_into` is gone from the front matter and nothing else is.** That field is a live redirect
rather than a historical fact — `tools/lib/deferrals.mjs` follows it, so leaving it in place would
resolve `A-06-2` back to slice 09 and silently undo this split. `folded_at` and `folded_by` stay,
because they record when and by whom. Deleting the evidence of the first decision to make the
second look tidy is the quiet change `CLAUDE.md` §4 exists to prevent — this file's own sentence as
a tombstone, and it binds the edit that stopped it being one.
