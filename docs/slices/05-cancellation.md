---
id: "05"
title: Cancellation — and the proof that the constraint's predicate is live
status: ready
depends_on: ["04"]
arc42: ["§6.4", "§8.6"]
adr: [3]
quality_scenarios: [QS-7]
loopbacks: 0
---

## Goal

`POST /appointments/{id}/cancellation` moves an appointment to `cancelled`, and the slot it held
becomes bookable. A sub-resource rather than `DELETE`, because the appointment remains readable at
its URL afterwards — which `DELETE` would misdescribe.

This is the only slice that exercises `WHERE (status <> 'cancelled')` through the API. Without it
that clause is an unverified claim sitting inside the system's most important constraint.

## Acceptance criteria

- **AC-1** — Given appointment A confirmed `[09:00, 10:00)` in the only bay, and a second booking for
  that interval refused with `409`, when A is cancelled, then the same booking **succeeds**. *(QS-7)*
- **AC-2** — Given A has been cancelled, when `GET /appointments/{id}` is requested, then `200` is
  returned with `status: cancelled` — it is not a `404`.
- **AC-3** — Given A has been cancelled, when it is cancelled again, then `200` is returned and
  nothing changes. Cancellation is idempotent (§8.6).
- **AC-4** — Given an unknown id, when cancellation is requested, then `404` with
  `type=/problems/appointment-not-found`.

## In scope

- The cancel route, use case and `UPDATE`.
- `tests/integration/cancellation-releases-slot.test.ts`.

## Out of scope

- Cancellation windows, fees, notification, or any record of *who* cancelled — ADR-0002 puts actors
  and audit out of scope, and §11 carries it.
- Restoring a cancelled appointment. Not in the brief; a fresh booking is the path back.

## Definition of done

Beyond `CLAUDE.md` §10:

- The freed-slot assertion books through the API rather than inserting directly, so it proves the
  predicate end to end rather than at the SQL level slice 00 already covered.
