---
folded_into: "02"
folded_at: 2026-09-05
folded_by: human-cost-ruling
deferred_from: "R-01-1"
---

# Slice 12 — folded into slice 02

**A tombstone: no `id:`, so no tool counts it, schedules it or waits on it.** Kept because the
backlog's shape is part of the record, like `docs/slices/03-error-taxonomy.md`.

**Was:** The domain bounds its own inputs — an `Instant` is renderable by construction

**Why it existed.** Raised as **R-01-1** by the reviewer at slice 01 step 5 and ruled **(b) deferred
improvement** — by §6's naming test rather than by preference: no acceptance criterion covers extreme
instants, QS-9's generation is confined to 2026, and no §2 clause applies. The defect is the slice-01 design's §4.2 step 1, which specified *"finite
integers and `end > start`"*: the check was written for the right reason and drawn in the wrong place.
The human ratified the remedy on 2026-09-05.

**Why it was folded.** The human's cost ruling of 2026-09-05: the remedy was already agreed and
specified, so a seven-step loop to apply it is §6's slicing problem from the other end. Figures in
`events.jsonl`.

**Where it went.** `docs/slices/02-book-and-read-an-appointment.md`, **AC-13 to AC-16**, unchanged in
substance. Slice 02 `absorbs: ["03", "12", "13"]` and carries both deferrals, which kept the debt
register showing them as *agreed and unbuilt* until slice 02 was done — AB-01-7's fix.

**The goal it carried, unchanged:** `instant()` admitted `8_640_000_000_000_001`. `Number.isInteger`
accepts it and `new Date` cannot represent it, so a value satisfying the `Instant` brand could still
make `Intl.DateTimeFormat.formatToParts` throw a `RangeError` inside a function whose stated contract
is that it is pure and does not throw.

**What was decided, and what was refused.** The bound is
`Math.abs(epochMillis) <= 8_640_000_000_000_000`, applied in **both** `instant()` and
`withinOpeningHours`' step 1. `instant()` is the primary home, because that is what makes the brand
mean something: **an `Instant` is renderable by construction**. `withinOpeningHours` gets it too, and
not as belt-and-braces — under the literal AC-6 ruling it may not import `Interval`, so *"my caller
used `instant()`"* is uncheckable, and it is the one function that can throw. So either site alone
was refused: `instant()` alone leaves the throwing function unprotected; `withinOpeningHours` alone
lets the constructor keep minting values that violate their own type. The HTTP parser is a correct **addition** and an unacceptable
**substitute**: any caller that is not a request bypasses it. Catching the `RangeError` was
refused because a `catch` around `formatToParts` cannot tell an out-of-range instant from an
unsupported zone or a conversion bug. The duplicated literal is the accepted cost — **D-01-2**,
cashing in.
