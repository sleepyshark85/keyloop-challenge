---
folded_into: "02"
folded_at: 2026-09-04
folded_by: gate-D
---

# Slice 03 — folded into slice 02

**This is a tombstone.** It carries no `id:`, so nothing counts, schedules or waits on it. Kept
because the backlog's shape is part of the record: Gate C approved thirteen slices with its reasoning
stated, and later rulings cut them. Deleting the evidence of the first decision to make the second look
tidy is the quiet change `CLAUDE.md` §4 exists to prevent.

**Was:** The error taxonomy — every failure has one status, one type, and a test (QS-11)

**Why it was folded.** Gate D, 2026-09-04: criterion C6 ("the budget is real") failed by more than
an order of magnitude, and C6's own wording says cut slices or reduce agent count. The human ruled the
first and declined the second — 11 remaining slices to 8, team and loop unchanged. Figures and full
rationale: `docs/team-log/events.jsonl` (`p-4-gate-d`).

**Where the work went.** All six acceptance criteria moved into slice 02 as AC-7 to AC-12, unchanged in substance, together with the contract test, the problem+json serialiser and the §8.6 outcome mapping. QS-11 is now claimed by slice 02 and, for the OpenAPI half, by slice 09.

**What was NOT cut, and why it matters.** The orchestrator's first proposed cut also folded slice 07
into slice 06. That was withdrawn: Gate C defended the 06/07 seam by name — *"so the atomic move is
separated from the two concurrency scenarios that catch a cancel-then-insert"* — and a cut that
reverses a recorded ruling has to say so rather than arrive inside a list of three. The seam stands.

See `docs/team-log/events.jsonl`, span `p-4-gate-d`, for the ruling as recorded.
