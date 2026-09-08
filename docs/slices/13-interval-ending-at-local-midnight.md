---
folded_into: "02"
folded_at: 2026-09-05
folded_by: human-cost-ruling
deferred_from: "R-01-4"
---

# Slice 13 — folded into slice 02

**A tombstone: no `id:`, so nothing counts, schedules or waits on it.** Kept because the backlog's shape
is part of the record.

**Was:** an interval ending at local midnight ends on the day it started.

**The defect.** A 23:00–24:00 local job was rejected as spanning two local days, because the domain
rendered the interval's **exclusive** endpoint as `00:00:00` on the next local date. But `[start, end)`
excludes that endpoint and the exclusion constraint's `tstzrange` agrees: the domain disagreed with the
database about the same interval.

**Decided:** an end rendering `00:00:00` on the local date **immediately following** the start's is
treated as `86400` seconds into the start's day, so the closing-time comparison reads `86400 <= 86400`
and answers *within*. Both halves carry weight — without the successor test a 48-hour interval ending at
midnight would be silently accepted, and the test compares calendar dates rather than epoch milliseconds
because DST changes how long a local day is. **Refused:** deleting the `'24:00:00'` parser arm, the
obvious remedy, on measurement — `'24:00:00'::time` is accepted and round-trips on `postgres:16-alpine`
while `24:00:01` and `24:30:00` are rejected, so a closing-time column really can hold it and rejecting
it at the parser turns valid reference data into a malformed-hours error. And comparing the interval's
last instant (`endsAtMillis - 1`), which makes the verdict depend on millisecond resolution and turns a
genuinely inclusive boundary into one that merely behaves that way. The cost is a special case in this
system's most DST-sensitive function, and a seconds-of-day value of `86400` sitting outside the range its
name implies.

**How it got here.** Raised by the reviewer at slice 01 step 5 and ruled a **deferred improvement**, with
the finding *upgraded*: the reviewer called it a dead branch, and the architect ruled the dead branch the
symptom and the wrongly-refused booking the defect — a backlog item reading *"a branch is unreachable"*
invites deleting the branch, which would be exactly wrong. The human ratified it on 2026-09-05, the
substance put to them rather than ruled from the chair because what a midnight-closing dealership may
book is scope. **Where it went:** slice 02, **AC-17 to AC-19**, unchanged in substance.
