---
id: "13"
title: An interval ending at local midnight ends on the day it started
status: ready
depends_on: ["01"]
arc42: ["§5.2", "§8.2", "§8.3", "§11"]
adr: [15]
quality_scenarios: [QS-9]
loopbacks: 0
---

## Goal

A job running 23:00–24:00 local is rejected as `spans-local-days`. It should be accepted: step 4 of
`withinOpeningHours` renders the half-open interval's **exclusive** endpoint, so an end *at* midnight
renders as `00:00:00` on the next local date — but `[start, end)` excludes the endpoint by definition,
and the exclusion constraint's `tstzrange` treats it the same way. The domain disagrees with the
convention the database enforces.

Raised by the reviewer as **R-01-4** at slice 01 step 5 and ruled **(b)**, but with the finding
**upgraded rather than cleared**: the reviewer characterised it as a dead branch — the `'24:00:00'`
arm of the time parser being unreachable — and the architect ruled that the dead branch is the
*symptom* and the wrongly-rejected booking is the defect. That distinction is the point of this slice
existing, because a backlog item reading *"a branch is unreachable"* invites the fix of deleting the
branch, and deleting it would be exactly wrong. **ADR-0015** records it.

The irony is on the record and is worth keeping: it was the implementer's own real-PostgreSQL
measurement that discharged DA-2 and argued `'24:00:00'` must be supported. That measurement was
right, the branch it justified was correct to add, and its consumer made it inert. The measurement is
not what failed.

## Acceptance criteria

- **AC-1** — Given a dealership open 09:00–24:00 local and a 60-minute job starting 23:00 local, when
  `withinOpeningHours` is called, then the verdict is **within**, not `spans-local-days`. *(QS-9)*
- **AC-2** — Given an end that renders as `00:00:00` on the local day **immediately following** the
  start's local date, when step 4 normalises it, then it is treated as `secondsOfDay = 86400` on the
  **start's** day.
- **AC-3** — Given an interval that genuinely spans two local days — 23:00 to 01:00 the next day —
  when `withinOpeningHours` is called, then the verdict is still `spans-local-days`. This is the
  negative control: AC-1 alone is satisfied by deleting the check.
- **AC-4** — Given reference data holding `'24:00:00'` in a closing-time column, when it is read and
  parsed, then it yields `86400` and the row is **not** rejected as `malformed-hours`. `'24:00:00'` is
  accepted by PostgreSQL's `time` type and a row can hold it, so rejecting it at the parser would turn
  valid reference data into an error.
- **AC-5** — Given the parse arm for `'24:00:00'`, when the mutation run completes, then it is
  **reachable and killed** — retiring the unreachable-branch and unkillable-mutant finding rather than
  suppressing it.

## In scope

- The step-4 normalisation branch in `src/domain/openingHours.ts` and the tests that make AC-1 and
  AC-3 a boundary rather than a floor.

## Out of scope

- **Deleting the `'24:00:00'` parse arm.** Refused explicitly in ADR-0015 as Option C, on the
  `'24:00:00'::time` measurement.
- Opening hours that wrap past midnight into the next day (an 18:00–02:00 window). That is a different
  shape — a genuinely two-day window — and neither ADR-0001 nor this ADR addresses it.

## Definition of done

Beyond `CLAUDE.md` §10:

- ADR-0015 moves from `proposed` to `accepted` at the human's gate, or is superseded. **The architect
  flagged that this ADR sits closer to the human's authority than its own**: whether a dealership open
  until midnight should be able to take a 23:00–24:00 booking is arguably an acceptance question, and
  the architect declined to treat *"the half-open convention should be consistent"* as authority to
  decide a behaviour change on the human's side of the line.
