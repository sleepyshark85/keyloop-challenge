---
id: "01"
title: The domain policy core — duration, occupancy interval, and opening hours
status: done
depends_on: ["00"]
arc42: ["§5.2", "§8.3", "§10.2", "§12"]
adr: [1]
quality_scenarios: [QS-9, QS-12]
loopbacks: 0
---

## Goal

`src/domain` exists and is pure: it derives an appointment's interval from a service type's duration and a
requested start, and decides whether that interval lies within a dealership's opening hours. It imports
nothing at all, not even a Node builtin. Each of the three things this project expects to be asked to
change — how long a job takes, what counts as the occupied interval, and when a dealership is open — is
confined to one file.

## Acceptance criteria

- **AC-1** — Given a service type of duration *d* and a requested start *s*, when the interval is
  derived, then it is `[s, s + d)` and any end the client supplied is ignored.
- **AC-2** — Given a dealership in `Europe/London` open 09:00–17:00 local, when an instant is
  validated, then it is accepted if and only if its **local** rendering lies within the window —
  including on both sides of both DST transitions. Worked pair: `2026-03-28T08:30Z` renders 08:30
  local (GMT) and is **rejected**; its counterpart `2026-03-29T08:30Z`, the same UTC wall time on
  the far side of the spring-forward transition, renders 09:30 local (BST) and is **accepted**.
  The same instant, the same window, opposite verdicts — which is the whole point. *(QS-9)*
- **AC-3** — Given a 60-minute job starting 00:30 local on a spring-forward night, when its interval
  is derived, then it ends 02:30 local — duration is added on the absolute timeline, not the
  wall clock.
- **AC-4** — Given a day with no `opening_hours` row, when any interval on that day is validated,
  then it is rejected: a missing row is a closed day, not an unbounded one.
- **AC-5** — Given the source tree, when it is scanned, then duration arithmetic appears only in
  `src/domain/duration.ts`, occupancy-interval construction only in `src/domain/interval.ts`, and any
  use of `Intl.DateTimeFormat` with a `timeZone` or of a dealership's `time_zone` only in
  `src/domain/openingHours.ts`. *(QS-12)*
- **AC-6** — Given `.dependency-cruiser.js`, when `depcruise` runs, then `src/domain` imports nothing
  at all — the `domain-is-pure` rule holds with no allowlist.

## In scope

- `src/domain/duration.ts`, `src/domain/interval.ts`, `src/domain/openingHours.ts`, with the occupancy
  interval as a **named domain type** — "the interval the constraint sees" — so adding a cleanup buffer
  later is one file plus one migration.
- `tests/property/opening-hours-dst.test.ts` and `tests/architecture/ambiguity-containment.test.ts`.

## Out of scope

- Any query, HTTP concern or allocation policy. The core decides what an interval *is* and whether it is
  permitted; it never learns what is booked.
- Technician shifts and holidays — outside the system's scope, settled by the opening-hours ADR.

## Definition of done

Beyond `CLAUDE.md` §10:

- The glossary gains an entry for each term this slice fixes, so later slices use them consistently.
