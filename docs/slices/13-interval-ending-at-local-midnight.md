---
folded_into: "02"
folded_at: 2026-09-05
folded_by: human-cost-ruling
deferred_from: "R-01-4:0015"
---

# Slice 13 — folded into slice 02

**This is a tombstone. It is not a slice and carries no `id:`, so no tool counts it, schedules it or
waits on it.** It is kept because the backlog's shape is part of the record — the same reason
`docs/slices/03-error-taxonomy.md` is kept.

**Was:** An interval ending at local midnight ends on the day it started

**Why it existed.** Raised as **R-01-4** by the reviewer at slice 01 step 5 and ruled **(b) deferred
improvement** by the architect — explicitly by §6's naming test rather than by preference. The
architect named the remedy exactly rather than leaving a shrug, and the human ratified it as
**ADR-0015** on 2026-09-05.

**Why it was folded.** The human's cost ruling of 2026-09-05, taken on measured figures: slice 01 cost
9.5 hours and 8.30 Mtok against 30.7 and 26.1 hours for the two pilot slices. Running a full
seven-step loop to apply a decision that is *already agreed and already specified* is the slicing
problem §6's loopback governor warns about, seen from the other end — the design step this slice would
consume has effectively already happened.

**Where it went.** `docs/slices/02-book-and-read-an-appointment.md`, **AC-17 to AC-19**, carried across
unchanged in substance. Slice 02 declares `absorbs: ["03", "12", "13"]` and
`deferred_from: ["R-01-1:0014", "R-01-4:0015"]`, so the debt register still shows both remedies as
*agreed and unbuilt* until slice 02 is done — which is the point of AB-01-7's fix, and would have been
undone by a tombstone that dropped the pairing.

**The goal it carried, unchanged:**

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
