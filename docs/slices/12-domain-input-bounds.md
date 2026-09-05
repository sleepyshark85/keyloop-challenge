---
folded_into: "02"
folded_at: 2026-09-05
folded_by: human-cost-ruling
deferred_from: "R-01-1:0014"
---

# Slice 12 — folded into slice 02

**This is a tombstone. It is not a slice and carries no `id:`, so no tool counts it, schedules it or
waits on it.** It is kept because the backlog's shape is part of the record — the same reason
`docs/slices/03-error-taxonomy.md` is kept.

**Was:** The domain bounds its own inputs — an `Instant` is renderable by construction

**Why it existed.** Raised as **R-01-1** by the reviewer at slice 01 step 5 and ruled **(b) deferred
improvement** by the architect — explicitly by §6's naming test rather than by preference. The
architect named the remedy exactly rather than leaving a shrug, and the human ratified it as
**ADR-0014** on 2026-09-05.

**Why it was folded.** The human's cost ruling of 2026-09-05, taken on measured figures: slice 01 cost
9.5 hours and 8.30 Mtok against 30.7 and 26.1 hours for the two pilot slices. Running a full
seven-step loop to apply a decision that is *already agreed and already specified* is the slicing
problem §6's loopback governor warns about, seen from the other end — the design step this slice would
consume has effectively already happened.

**Where it went.** `docs/slices/02-book-and-read-an-appointment.md`, **AC-13 to AC-16**, carried across
unchanged in substance. Slice 02 declares `absorbs: ["03", "12", "13"]` and
`deferred_from: ["R-01-1:0014", "R-01-4:0015"]`, so the debt register still shows both remedies as
*agreed and unbuilt* until slice 02 is done — which is the point of AB-01-7's fix, and would have been
undone by a tombstone that dropped the pairing.

**The goal it carried, unchanged:**

`instant()` currently admits `8_640_000_000_000_001`. `Number.isFinite` accepts it and `new Date`
cannot represent it, so a value that satisfies the `Instant` brand can still make
`Intl.DateTimeFormat.formatToParts` throw a `RangeError` inside a function whose stated contract is
that it is pure and does not throw. This slice makes the brand mean what it claims: **an `Instant` is
renderable by construction.**

Raised by the reviewer as **R-01-1** at slice 01 step 5 and ruled **(b) deferred improvement** by the
architect — explicitly by §6's naming test rather than by preference: no acceptance criterion covers
extreme instants, QS-9's generation is confined to 2026, and no §2 clause applies, so *"if it cannot
name one, the outcome is (b)"*. The defect is in the slice-01 design's §4.2 step 1, which specified
*"finite integers and `end > start`"* — the check was written for the right reason and drawn at the
wrong place. **ADR-0014** records the decision and the alternatives that were refused.
