---
folded_into: "09"
folded_at: 2026-09-04
folded_by: gate-D
---

# Slice 10 — folded into slice 09

**This is a tombstone. It is not a slice and carries no `id:`, so no tool counts it, schedules it or
waits on it.** The file is kept rather than deleted because the backlog's shape is part of the record:
Gate C approved thirteen slices with its reasoning stated, and Gate D cut them. Deleting the evidence
of the first decision to make the second look tidy is the kind of quiet change `CLAUDE.md` §4 exists
to prevent.

**Was:** The OpenAPI document and the cURL harness — the stubbed client layer (QS-11)

**Why it was folded.** Phase 4's pre-registered criterion C6 — "the budget is real" — failed by more
than an order of magnitude: 15.1 hours elapsed across the two pilot slices against a ceiling that
extrapolated to 10 hours over the whole backlog. C6's own wording says the response is to cut slices
or reduce agent count, not to proceed and hope. At Gate D the human ruled the first and declined the
second, so the backlog went from 11 remaining slices to 8 with the team and the loop unchanged.

**Where the work went.** All five acceptance criteria moved into slice 09 as AC-7 to AC-11, with the emitted document, the drift test and the harness/ scripts. Cheapest of the three folds: ADR-0005 emits the document from the TypeBox route schemas, so slices 02 to 08 have already written most of it by the time slice 09 runs.

**What was NOT cut, and why it matters.** The orchestrator's first proposed cut also folded slice 07
into slice 06. That was withdrawn: Gate C defended the 06/07 seam by name — *"so the atomic move is
separated from the two concurrency scenarios that catch a cancel-then-insert"* — and a cut that
reverses a recorded ruling has to say so rather than arrive inside a list of three. The seam stands.

See `docs/team-log/events.jsonl`, span `p-4-gate-d`, for the ruling as recorded.
