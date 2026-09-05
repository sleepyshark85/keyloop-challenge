---
id: "0015"
title: An interval ending at local midnight ends on the day it started — normalise the exclusive endpoint to 86400 rather than rejecting it as spans-local-days
status: accepted
date: 2026-09-05
supersedes: null
superseded_by: null
arc42: ["§5.2", "§8.2", "§8.3", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  ACCEPTED as recommended on 2026-09-05, after Gate E, unmodified: an interval ending at local
  midnight ends on the day it started, and a dealership open until midnight can take a 23:00-24:00
  booking. Option C stays refused on the `'24:00:00'::time` measurement. Backlog slice 13 is
  therefore the agreed remedy, not a proposal.

  THE DECIDING PART OF THIS RECORD IS THAT THE ARCHITECT DID NOT MAKE THIS CALL. The substance was
  put to the human rather than ruled from the chair, and the human answered it. That is not a
  formality: the architect ruled (b) precisely BECAUSE it declined to widen CLAUDE.md §6's closed
  list of nameable things to reach (c), and the alternative — quietly deciding what a dealership open
  until midnight may book — is scope, which §6 reserves to the human. Read the paragraph below as
  written at the time, not as a decision the architect took and the human rubber-stamped.

  Raised by the REVIEWER as finding R-01-4 at slice 01 step 5, characterised as a DEAD BRANCH: the
  `'24:00:00'` arm of the time parser is unreachable, because nothing can produce a rendered
  `secondsOfDay` of 86400 and so the arm's mutants are unkillable. The measurement is correct and the
  implementation follows docs/slices/01-design.md §4.2 step 4 exactly. The architect AGREED the
  verdict and **UPGRADED the substance**: the unreachable branch is a symptom, and the defect is that
  a job ending exactly at local midnight is REJECTED. Ruled **(b) deferred improvement** by
  CLAUDE.md §6's naming test — AC-2 is scoped to a 09:00-17:00 dealership where the case cannot
  arise, no quality scenario covers it, and no §2 standing invariant applies; §6 says the outcome is
  then (b), and the architect declined to reach for (c) by quietly adding "an ADR is contradicted" to
  §6's closed list of nameable things, even though ADR-0001's "the whole derived interval must fall
  within opening hours" IS contradicted. The upgrade is the load-bearing part of this record: a
  backlog item reading "a branch is unreachable" invites the remedy of deleting the branch, and
  deleting it would be exactly wrong. Put to the human's ruling rather than settled by the
  architect, and carried in arc42 §11 as debt until it was.
---

## Context and problem statement

The interval is **half-open**, `[startsAt, endsAt)` — the convention §2.1's exclusion constraint
uses. `withinOpeningHours` step 4 (design §4.2) compares the **exclusive** endpoint's local date, so
a 23:00–24:00 job at a midnight-closing dealership renders `endsAt` as `00:00:00` on the *following*
date and is refused as `spans-local-days`. PostgreSQL does not overlap `[22:00, 24:00)` with
`[00:00, 02:00)`; only this function disagrees.

**The reported symptom, and why the symptom is not the defect.**
R-01-4 reported the arm as dead code; it is unreachable because its consumer refuses the case it
serves.

**Why the branch must not be deleted, which is the whole reason this is an ADR.**
Measured on real `postgres:16-alpine` (DA-2): `'24:00:00'::time` is **accepted and round-trips**;
`24:00:01` and `24:30:00` are rejected. A `closes_at` can hold it.

## Considered options

- **Option A — normalise the endpoint**: an end rendering as `00:00:00` on the local day immediately
  following the start's. **Chosen.**
  - Good, because it fixes the defect at the point where the wrong assumption is made
  - Good, because it makes the domain agree with the `tstzrange` semantics
  - Good, because it retires the dead branch by making it live
  - Bad, because it adds a conditional to the system's most DST-sensitive function.
  - Bad, because `86400` is out of range for a field named seconds-of-day.
- **Option B — compare the last instant of the interval** (`endsAtMillis - 1`) instead of `endsAt`.
  - Good, because it is arguably the most honest statement of what half-open means
  - Good, because it needs no special case and no out-of-range encoding
  - Bad, because it makes the verdict depend on the millisecond resolution
  - Bad, and decisively, because it changes step 7's boundary from *inclusive on `closesAt`* to something
    that only behaves inclusively
  - Bad, because the `'24:00:00'` parser arm stays unreachable
- **Option C — delete the `'24:00:00'` parser arm** and reject the value.
  - Good, because it is the smallest change
  - **Bad, decisively:** PostgreSQL accepts `'24:00:00'::time` and round-trips it — measured against
    a real container — so rejecting it makes valid data `malformed-hours`
  - Bad, because it would delete the correct outcome of the implementer's own measurement
  - Bad, because it leaves the actual defect
- **Option D — leave the behaviour; document `spans-local-days` as covering midnight-ending jobs.**
  - Good, because nothing is broken for any dealership
  - Good, because it costs nothing
  - Bad, because the documentation would be untrue to ADR-0001
  - Bad, because it leaves an unkillable branch in place
- **Option E — allow the date to differ whenever the end renders as `00:00:00`**, and skip the
  seconds comparison.
  - Good, because it avoids the out-of-range `86400` encoding entirely.
  - Bad, because "skip the check" and "the check passes" are different things
    — a 17:00 dealership's job is not compared.
  - Bad, because it removes an assertion rather than correcting one

## Decision

Chosen option: **A — an end rendering as `00:00:00` on the local day immediately following the start's
local date is `secondsOfDay = 86400` on the start's day.**

One branch in step 4, before the `startsOn !== endsOn` comparison; nothing else changes. Step 7
then compares `86400 <= 86400` → `within`. `spans-local-days` still fires for a real crossing:
§8.3 needs both endpoints inside
**one day's** opening hours, and no weekly schedule can express an interval that spans two.

**The condition is deliberately narrow.** *Renders as exactly `00:00:00`* **and** *on the local date
immediately following the start's* — without the second, a 48-hour interval ending at midnight
is silently accepted. "Immediately following" is a calendar-date successor test, not epoch
arithmetic: DST changes a local day's length.

**It needs its own red commit**, under `CLAUDE.md` §2.4, and a property extension for QS-9 that
generates midnight-closing dealerships.

**Explicitly not part of this decision.** Whether the *occupancy* interval (A-4, with a buffer)
must also fall inside opening hours is OQ-01-1.

## Consequences

**Good**

- A dealership open until midnight can take its last appointment.
- The domain's interval semantics stop disagreeing with the exclusion constraint's
- The unreachable parser arm and its unkillable mutants go away
- The `86400` normalisation is directly testable

**Bad, or deferred**

- **A special case in the one function in this system that is already the hardest to reason about.**
- `secondsOfDay = 86400` is a value outside the range its own name implies. It is the standard
  half-open encoding, stated at the type.
- The condition has two clauses and the second is easy to drop.
- It needs a red commit
