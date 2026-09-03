---
id: "99"
title: Availability query (DEMO)
status: done
depends_on: []
arc42: ["§5.2", "§8.2"]
adr: [7]
quality_scenarios: [QS-3, QS-4]
loopbacks: 1
---

## Goal

**Synthetic slice.** Exists only so the board generator has something to render before
any real work starts. Delete once slice 00 has run. Its events live in
`docs/team-log/events.demo.jsonl`, never in the real log.

Modelled on a plausible availability-query slice, including one design defect and
loopback, so the rendering of the interesting cases can be checked.

## Acceptance criteria

- **AC-1** — Given a bay with a confirmed appointment 09:00–10:00, when availability is
  queried for 09:30–10:30, then that bay is not returned.
- **AC-2** — Given a technician qualified for a service type at dealership X only, when
  availability is queried at dealership Y, then that technician is not returned.
- **AC-3** — Given a request whose end precedes its start, when availability is queried,
  then the request is rejected as invalid.

## In scope

- Read-only availability computation over confirmed appointments.

## Out of scope

- Booking. Availability informs UX; it never guarantees correctness (`CLAUDE.md` §2.1).

## Definition of done

- Property tests cover AC-1 under arbitrary interleavings.
