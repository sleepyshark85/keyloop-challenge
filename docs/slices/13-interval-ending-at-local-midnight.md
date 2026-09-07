---
folded_into: "02"
folded_at: 2026-09-05
folded_by: human-cost-ruling
deferred_from: "R-01-4"
---

# Slice 13 — folded into slice 02

**A tombstone: no `id:`, so nothing counts, schedules or waits on it.** Kept because the backlog's
shape is part of the record.

**Was:** An interval ending at local midnight ends on the day it started

**Why it existed.** Raised as **R-01-4** at slice 01 step 5, ruled **(b)** with the finding
*upgraded*: the reviewer called it a dead branch; the architect ruled that the symptom
and the wrongly-refused booking the defect — a backlog item reading *"a branch is unreachable"*
invites deleting the branch, which would be exactly wrong. Ratified by the human on 2026-09-05, the
substance put to them rather than ruled from the chair: what a midnight-closing dealership may book
is scope.

**Why it was folded.** The human's cost ruling of 2026-09-05: the remedy was agreed and specified,
so applying it through a seven-step loop is §6's slicing problem from the other end (`events.jsonl`).

**Where it went.** `02-book-and-read-an-appointment.md`, **AC-17 to AC-19**, unchanged in substance;
slice 02 `absorbs: ["03", "12", "13"]` and carries both deferrals, so the debt register
showed them *agreed and unbuilt* until it was done — AB-01-7's fix.

**The goal it carried, unchanged:** a 23:00–24:00 local job was rejected as `spans-local-days`, step
4 rendering the half-open interval's **exclusive** endpoint as `00:00:00` on the next local date. But
`[start, end)` excludes the endpoint and the constraint's `tstzrange` agrees: the domain disagreed
with the database.

**What was decided, and what was refused.** An end rendering `00:00:00` on the local date
**immediately following** the start's is `secondsOfDay = 86400` on the start's day — one branch in step 4; step 7 compares `86400 <= 86400` and answers *within*. Both clauses carry weight: without the successor test a
48-hour interval ending at midnight is silently accepted, and it is a calendar-date rather than epoch test,
DST changing a local day's length. **Deleting the `'24:00:00'` parser arm — the obvious remedy — was refused on
measurement:** on `postgres:16-alpine` `'24:00:00'::time` is accepted and round-trips
while `24:00:01` and `24:30:00` are rejected, so a `closes_at` can hold it, and rejecting it turns valid
reference data into `malformed-hours`. Comparing the interval's last instant
(`endsAtMillis - 1`) was refused: it makes the verdict depend on millisecond resolution and turns
step 7's boundary from *inclusive on `closesAt`* into something merely behaving so. The cost is a special case in this system's most
DST-sensitive function, and `86400` outside the range its name implies — the standard half-open
encoding, at the type.
