---
id: "07"
title: Rescheduling under contention — a refused move changes nothing, and never opens a window
status: ready
depends_on: ["06"]
arc42: ["§6.3"]
adr: [3]
quality_scenarios: [QS-4, QS-5]
loopbacks: 0
---

## Goal

The two properties that separate a correct move from one that merely looks correct in a
single-threaded test: a refused move leaves the original appointment exactly as it was, and a move
never transiently releases the slot it holds — not for an instant, under any interleaving.

QS-5 is the scenario that catches a cancel-then-insert implementation. That implementation passes
every test in slice 06.

## Acceptance criteria

- **AC-1** — Given A confirmed `[09:00, 10:00)` and the dealership fully booked at `[11:00, 12:00)`,
  when A is rescheduled to 11:00, then the request is refused **and** A is still `confirmed` at
  `[09:00, 10:00)` with the same id, bay and technician. Asserted by reading the row, not the
  response. *(QS-4)*
- **AC-2** — Given A holds the only bay at `[09:00, 10:00)`, when a reschedule of A to a fully-booked
  interval races *N* fresh bookings for `[09:00, 10:00)`, then **no fresh booking is ever confirmed**
  — at every moment, under every interleaving, A's slot is occupied. *(QS-5)*
- **AC-3** — Given the racing scenario of AC-2, when it is run repeatedly with recorded seeds, then
  the result is stable across runs and a failure names the seed that produced it.

## In scope

- `tests/concurrency/refused-move-leaves-original.test.ts` and
  `tests/concurrency/move-never-releases-slot.test.ts`.
- Whatever the implementation must change to satisfy them — which, if slice 06 was built as
  specified, is nothing. A green run here on unchanged production code is the desired outcome and is
  evidence, not an empty slice.

## Out of scope

- Any new endpoint or field. This slice adds proof, not surface.

## Definition of done

Beyond `CLAUDE.md` §10:

- If no production code changed, the reviewer states that explicitly in the PR and the team log
  records it. A slice that adds only tests is a legitimate outcome when the tests are the deliverable
  — but it must be visible rather than look like an oversight.
