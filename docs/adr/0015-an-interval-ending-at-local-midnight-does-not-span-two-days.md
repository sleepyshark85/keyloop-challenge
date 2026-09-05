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

`withinOpeningHours` decides whether a derived appointment interval falls inside a dealership's
opening hours for one local day. Its procedure (design §4.2) renders both endpoints into
`{ localDate, secondsOfDay, dayOfWeek }` and, at step 4, rejects the interval as `spans-local-days`
if the two local calendar dates differ.

The interval is **half-open**, `[startsAt, endsAt)`. That is not an incidental choice: it is the same
convention `tstzrange(starts_at, ends_at)` uses in the exclusion constraint that is this system's one
non-negotiable invariant (`CLAUDE.md` §2.1), and it is what makes back-to-back appointments in the
same bay non-overlapping.

Step 4 renders the **exclusive** endpoint and compares its calendar date. So a 23:00–24:00 job in a
dealership open until midnight renders `endsAt` as `00:00:00` on the *following* local date, the dates
differ, and the interval is rejected as `spans-local-days`.

That is wrong, and it is wrong in a way the rest of the system already disagrees with. An interval
that ends *at* midnight does not span two days in any sense this codebase uses anywhere else:
`[start, end)` explicitly excludes the endpoint, the `tstzrange` treats it the same way, and two
appointments `[22:00, 24:00)` and `[00:00, 02:00)` are — correctly — non-overlapping to PostgreSQL.
Only `withinOpeningHours` believes the endpoint is a moment *in* the interval.

**The reported symptom, and why the symptom is not the defect.** The reviewer found this as a dead
branch: `openingHours.ts`'s time parser accepts the single exact value `'24:00:00'` and normalises it
to `secondsOfDay = 86400`, and nothing can reach that arm, so its mutants are unkillable and the
mutation score is being propped up by a branch that cannot fire. Both halves of that are true. But the
branch is unreachable *because its consumer rejects the case it exists to serve* — step 4 fires first
and returns `spans-local-days` before any closing time is parsed. The dead code is downstream of the
defect, not the defect.

**Why the branch must not be deleted, which is the whole reason this is an ADR.** The obvious remedy
for a dead branch is to delete it. Here that would destroy correct, measured work and make the system
wrong about its own reference data. The `'24:00:00'` arm was added on the implementer's own
measurement against a real `postgres:16-alpine` — assumption DA-2 of the slice design — which
established that `'24:00:00'::time` is **accepted and round-trips**, while `24:00:01` and `24:30:00`
are rejected by PostgreSQL. A `dealership_hours.closes_at` column can therefore hold `'24:00:00'`
today. Rejecting it at the parser would turn valid reference data into `malformed-hours` — a
dealership open until midnight would be unbookable at every hour, not just the last one — and it would
do so on the strength of a mutation score.

The irony belongs in the record: it was the implementer's real-database measurement that discharged
DA-2 and argued that `24:00:00` must be supported, that measurement was right, the branch it justified
was correct to add, and the architect's design of the consumer is what made it inert. The measurement
is not what failed.

## Considered options

- **Option A — normalise the endpoint**: an end rendering as `00:00:00` on the local day immediately
  following the start's local date is treated as `secondsOfDay = 86400` **on the start's day**.
- **Option B — compare the last instant of the interval** (`endsAtMillis - 1`) instead of `endsAt`.
- **Option C — delete the `'24:00:00'` parser arm** and reject the value.
- **Option D — leave the behaviour; document `spans-local-days` as covering midnight-ending jobs.**
- **Option E — allow the date to differ whenever the end renders as `00:00:00`**, and skip the
  seconds-of-day comparison for that endpoint entirely.

## Decision

Chosen option: **A — an end rendering as `00:00:00` on the local day immediately following the start's
local date is treated as `secondsOfDay = 86400` on the start's day.**

One branch, in step 4, before the `startsOn !== endsOn` comparison. Everything downstream is unchanged:
step 7's `endSeconds <= closesSeconds` then compares `86400 <= 86400` for a dealership closing at
`'24:00:00'` and returns `within`, and compares `86400 <= 61200` for a 17:00 dealership and returns
`outside-window` — which is the correct verdict, reached for the correct reason.

It is chosen because it makes four things true at once, and the fourth is the one that makes it a
decision rather than a patch:

1. **A job ending at local midnight is bookable**, which is the behaviour ADR-0001 already specifies
   and which step 4 was silently overriding.
2. **`'24:00:00'` becomes meaningful.** The parser arm DA-2 justified becomes reachable, its mutants
   become killable, and the dead-branch finding is retired as a consequence rather than addressed as a
   goal.
3. **The domain aligns with the half-open convention the exclusion constraint already enforces.** One
   interval semantics across the domain, the persistence layer and PostgreSQL, instead of two.
4. **It keeps the rejection that matters.** `spans-local-days` still fires for a genuine crossing —
   23:00 to 01:00 — which must stay rejected: §8.3's reason is that both endpoints must fall inside
   **one day's** opening hours, and no weekly schedule can express an interval that spans two. The
   remedy narrows the rejection to the case the reason actually covers, rather than weakening it.

**The condition is deliberately narrow.** *Renders as exactly `00:00:00`* **and** *on the local date
immediately following the start's local date*. Both clauses matter: without the second, a 48-hour
interval ending at midnight two days later would be normalised into the start's day and silently
accepted. The "immediately following" test is a local-calendar-date successor comparison, not an
arithmetic one on epoch milliseconds, because a DST transition changes the number of milliseconds in a
local day and this function's entire subject is DST.

**It needs its own red commit**, under `CLAUDE.md` §2.4, and a property extension for QS-9 that
generates dealerships closing at midnight. That is why it is a backlog slice and not a patch inside
slice 01.

**Explicitly not part of this decision.** Whether the *occupancy* interval (A-4, with a buffer) must
also fall inside opening hours is open question OQ-01-1 and is untouched here. A buffer that pushes an
occupancy interval past midnight is a different question and will need its own answer.

## Consequences

**Good**

- A dealership open until midnight can take its last appointment. Today it cannot take any
  appointment ending at closing time.
- The domain's interval semantics stop disagreeing with the exclusion constraint's, which removes a
  class of confusion this system can least afford in the module that owns its headline invariant.
- The unreachable parser arm and its unkillable mutants go away as a side effect, which means the
  mutation score starts measuring the code rather than being propped up by it.
- The `86400` normalisation is directly testable at the boundary — `23:59:59.999`, `24:00:00.000` and
  `00:00:00.001` on the next day are three distinct, assertable outcomes.

**Bad, or deferred**

- **A special case in the one function in this system that is already the hardest to reason about.**
  `withinOpeningHours` is the only wall-clock code in the domain and the only place a DST transition
  can bite (ADR-0001); adding a conditional normalisation to it is not free, and the DST interaction
  is the part most likely to be got wrong.
- `secondsOfDay = 86400` is a value outside the range its own name implies. It is the standard
  half-open encoding and PostgreSQL agrees with it, but a reader meeting `86400` in a
  "seconds-of-day" field is entitled to stop, so the encoding has to be stated at the type and not
  only here.
- The condition has two clauses and the second is easy to drop. A test that only exercises the
  one-second-past-midnight case will not notice.
- It needs a red commit and a QS-9 generator extension, so it is a slice rather than a line.

## Pros and cons of the options

### Option A — normalise the exclusive endpoint to 86400 on the start's day

- Good, because it fixes the defect at the point where the wrong assumption is made — step 4 treating
  the exclusive endpoint as a moment inside the interval.
- Good, because it makes the domain agree with the `tstzrange` semantics the constraint enforces,
  rather than adding a second interval convention.
- Good, because it retires the dead branch by making it live, which is strictly better than retiring
  it by deleting it.
- Bad, because it adds a conditional to the system's most DST-sensitive function.
- Bad, because `86400` is out of range for a field named seconds-of-day.

### Option B — compare `endsAtMillis - 1`, the last instant actually occupied

- Good, because it is arguably the most honest statement of what half-open means: the interval's last
  occupied instant is what has to be inside opening hours, and that instant is genuinely on the start's
  local day.
- Good, because it needs no special case and no out-of-range encoding — every value stays in
  `[0, 86400)`.
- Bad, because it makes the verdict depend on the millisecond resolution of the endpoint. A job ending
  at exactly 17:00:00.000 would be checked as 16:59:59.999, which is inside a window closing at 17:00
  — the right answer, reached by an argument that only works because the units happen to line up.
- Bad, and decisively, because it changes step 7's boundary from *inclusive on `closesAt`* to something
  that only behaves inclusively. Design §4.2 makes that inclusivity explicit and ADR-0001's worked
  example depends on it; replacing a stated boundary rule with an emergent one makes the mutant that
  flips `<=` to `<` harder to kill, not easier.
- Bad, because the `'24:00:00'` parser arm stays unreachable — a dealership closing at `'24:00:00'`
  would be compared against `86400` only if something produced `86400`, and nothing would.

### Option C — delete the `'24:00:00'` parser arm

- Good, because it is the smallest change, it removes the unkillable mutants immediately, and it makes
  the reviewer's finding literally go away.
- **Bad, decisively:** PostgreSQL accepts `'24:00:00'::time` and round-trips it — measured against a
  real container, not assumed — so a `dealership_hours` row can hold it today. Rejecting it at the
  parser converts valid reference data into `malformed-hours`, which fails every booking at that
  dealership rather than only the midnight one.
- Bad, because it would delete the correct outcome of the implementer's own measurement in order to
  improve a mutation score, which inverts what the mutation score is for.
- Bad, because it leaves the actual defect — a midnight-ending job rejected as spanning two days —
  entirely in place, and removes the evidence that pointed at it.

### Option D — leave it; document `spans-local-days` as covering this

- Good, because nothing is broken for any dealership in the seed data, no acceptance criterion fails,
  and this is exactly why the DCR ruling was (b).
- Good, because it costs nothing and risks nothing in the function most expensive to get wrong.
- Bad, because the documentation would be untrue to ADR-0001: *"the whole derived interval must fall
  within opening hours"* is satisfied by a 23:00–24:00 job at a midnight-closing dealership, and the
  code rejects it.
- Bad, because it leaves an unkillable branch in place permanently, so every future mutation report on
  this file carries a survivor that has to be re-explained.

### Option E — skip the seconds comparison for an endpoint rendering `00:00:00`

- Good, because it avoids the out-of-range `86400` encoding entirely.
- Bad, because "skip the check" and "the check passes" are different things, and only one of them is
  a rule. A midnight-ending job at a dealership that closes at 17:00 would then not be compared
  against 17:00 at all, and would be wrongly accepted.
- Bad, because it removes an assertion rather than correcting one, which is the failure mode this
  slice has already ruled against three times.
