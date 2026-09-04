---
id: "01"
title: The domain policy core — duration, occupancy interval, and opening hours
status: ready
depends_on: ["00"]
arc42: ["§5.2", "§8.3", "§12"]
adr: [1]
quality_scenarios: [QS-9, QS-12]
loopbacks: 0
---

## Goal

`src/domain` exists and is pure: it derives an appointment's interval from a service type's duration
and a requested start, and decides whether that interval lies within a dealership's opening hours —
importing nothing, not even a Node builtin. The three ambiguities §1.2 goal 3 names are each confined
to one file, so the change most likely to arrive is absorbed by one module plus a migration.

## Acceptance criteria

- **AC-1** — Given a service type of duration *d* and a requested start *s*, when the interval is
  derived, then it is `[s, s + d)` and no client-supplied end is consulted (A-1).
- **AC-2** — Given a dealership in `Europe/London` open 09:00–17:00 local, when an instant is
  validated, then it is accepted if and only if its **local** rendering lies within the window —
  including on both sides of both DST transitions. Worked pair: `2026-03-28T08:30Z` renders 08:30
  local (GMT) and is **rejected**; its counterpart `2026-03-29T08:30Z`, the same UTC wall time on
  the far side of the spring-forward transition, renders 09:30 local (BST) and is **accepted**.
  The same instant, the same window, opposite verdicts — which is the whole point. *(QS-9)*
- **AC-3** — Given a 60-minute job starting 00:30 local on a spring-forward night, when its interval
  is derived, then it ends 02:30 local — duration is added on the absolute timeline, not the
  wall clock (§8.3).
- **AC-4** — Given a day with no `opening_hours` row, when any interval on that day is validated,
  then it is rejected: a missing row is a closed day, not an unbounded one.
- **AC-5** — Given the source tree, when it is scanned, then duration arithmetic appears only in
  `src/domain/duration.ts`, occupancy-interval construction only in `src/domain/interval.ts`, and any
  use of `Intl.DateTimeFormat` with a `timeZone` or of a dealership's `time_zone` only in
  `src/domain/openingHours.ts`. *(QS-12)*
- **AC-6** — Given `.dependency-cruiser.js`, when `depcruise` runs, then `src/domain` imports nothing
  at all — the `domain-is-pure` rule holds with no allowlist.

> **AC-2's worked pair was amended on 2026-09-04 by human ruling (O-13), at step 1.** As written it
> read *"the instant that is 08:30 local but 09:30 UTC"*, which describes Europe/London at UTC−1 — an
> offset the zone never has, since it is GMT or BST and local is never behind UTC. UTC and local were
> transposed. The substance of AC-2 is unchanged; only the illustrative pair was corrected, and it was
> corrected against measured offsets rather than reasoned about. Raised at step 1, where an ambiguous
> criterion costs a paragraph, rather than at step 3 where the test-engineer would have had to assert
> something impossible or silently reinterpret an acceptance criterion that is not its to change.

## In scope

- `src/domain/duration.ts`, `src/domain/interval.ts`, `src/domain/openingHours.ts`.
- The named occupancy-interval concept A-4 requires: "the interval the constraint sees" is a domain
  type, so adding a cleanup buffer later is a change to one file plus one migration.
- `tests/property/opening-hours-dst.test.ts` and `tests/architecture/ambiguity-containment.test.ts`.

## Out of scope

- Any query, any HTTP concern, any allocation policy. The core decides what an interval *is* and
  whether it is permitted; it never learns what is booked (GC-1).
- Technician shifts and holidays — §3.3 excludes them, ADR-0001 settled it.

## Definition of done

Beyond `CLAUDE.md` §10:

- arc42 §12 gains the glossary entries for the terms this slice fixes, so later slices use them
  consistently.
