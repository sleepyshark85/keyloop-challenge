---
folded_into: "02"
folded_at: 2026-09-05
folded_by: human-cost-ruling
deferred_from: "R-01-1"
---

# Slice 12 — folded into slice 02

**A tombstone: no `id:`, so no tool counts it, schedules it or waits on it.** Kept because the backlog's
shape is part of the record.

**Was:** the domain bounds its own inputs — an `Instant` is renderable by construction.

**The defect.** `instant()` admitted `8_640_000_000_000_001`. `Number.isInteger` accepts it and
`new Date` cannot represent it, so a number satisfying the `Instant` brand could still make
`Intl.DateTimeFormat.formatToParts` throw a `RangeError` — inside a function whose stated contract is
that it is pure and does not throw.

**Decided:** the bound is `Math.abs(epochMillis) <= 8_640_000_000_000_000`, applied in **both**
`instant()` and the first step of `withinOpeningHours`. `instant()` is the primary home, because that is
what makes the brand mean something; `withinOpeningHours` gets it too because it may not import the
interval type, so *"my caller used `instant()`"* is uncheckable there, and it is the one function that
can throw. **Refused:** either site alone — `instant()` alone leaves the throwing function unprotected,
`withinOpeningHours` alone lets the constructor keep minting values that violate their own type;
validating only at the HTTP edge, a correct *addition* and an unacceptable *substitute*, since any caller
that is not a request bypasses it; and catching the `RangeError`, because a `catch` around
`formatToParts` cannot tell an out-of-range instant from an unsupported zone or a conversion bug. The
accepted cost is the literal written twice with no mechanism to share it — the price of the ruling that
no domain module may import another.

**How it got here.** Raised by the reviewer at slice 01 step 5 and ruled a **deferred improvement**: no
acceptance criterion covered extreme instants and no standing invariant applied. The human ratified the
remedy on 2026-09-05 and folded the slice the same day — the remedy being already agreed and specified,
spending a seven-step loop to apply it is a slicing problem from the other end. **Where it went:** slice
02, **AC-13 to AC-16**, unchanged in substance.
