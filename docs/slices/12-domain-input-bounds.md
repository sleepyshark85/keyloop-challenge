---
id: "12"
title: The domain bounds its own inputs — an Instant is renderable by construction
status: ready
depends_on: ["01"]
arc42: ["§5.2", "§8.1", "§11"]
adr: [14]
quality_scenarios: [QS-9, QS-12]
loopbacks: 0
---

## Goal

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

## Acceptance criteria

- **AC-1** — Given `epochMillis` with `Math.abs(epochMillis) > 8_640_000_000_000_000`, when
  `instant()` is called, then it returns `null`. *(QS-12)*
- **AC-2** — Given `epochMillis` of exactly `8_640_000_000_000_000` or `-8_640_000_000_000_000`, when
  `instant()` is called, then it returns an `Instant` — the bound is inclusive, and both signs are
  asserted.
- **AC-3** — Given any value for which `instant()` returns an `Instant`, when that value is passed to
  `new Date(...).toISOString()`, then it does not throw. Asserted as a **property** over a generator
  that reaches both bounds, not over a hand-picked list. *(QS-9)*
- **AC-4** — Given `startsAtMillis` or `endsAtMillis` outside the same bound, when
  `withinOpeningHours` is called, then it returns `malformed-interval` and does not throw. The
  existing verdict variant is reused; no new variant is introduced. *(QS-12)*
- **AC-5** — Given the whole domain, when the mutation run completes, then no surviving mutant can
  remove either bound — i.e. each bound is killed by at least one test, and the slice reports which.

## In scope

- The bound in `src/domain/interval.ts`'s `instant()` and in `src/domain/openingHours.ts` step 1.
- The property test for AC-3, which is the one that makes the brand's claim testable rather than
  documented.

## Out of scope

- **Sharing the constant between the two domain files.** Under the human's literal AC-6 ruling no
  domain module may import another, so `8_640_000_000_000_000` appears twice with no mechanism to
  share it. That is **D-01-2** of `docs/slices/01-design.md` §11 cashing in, and ADR-0014 is its first
  concrete instance. Reversing the AC-6 ruling to avoid a duplicated constant would be a scope change
  and is the human's, not the architect's — so it is recorded as debt here rather than resolved.
- **The HTTP request parser rejecting an out-of-range timestamp**, which it should also do so a client
  gets a `400` rather than a `409`-shaped surprise. That belongs to the slice adding the booking route
  and is an addition to ADR-0014, never a substitute for it.

## Definition of done

Beyond `CLAUDE.md` §10:

- ADR-0014 moves from `proposed` to `accepted` at the human's gate, or is superseded.
- AC-5 is reported as named mutants, not as a score: *for a discrimination claim, name the mutant.*
