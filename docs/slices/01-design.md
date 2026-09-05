# Slice 01 — design

> **Merged.** Reconciled at step 7 into arc42 **§5.2 · §8.3 · §8.5 · §10 · §11 · §12**. **QS-9, QS-12**;
> ADR-0001 and 0008 in force; **ADR-0013** drafted here, accepted 2026-09-05.
>
> Condensed 2026-09-05 under the concision ruling. As-built signatures are arc42 §5.2, DST facts §8.3,
> the test seam §8.5, the debt §11; the deliberation is on the PR and in `docs/team-log/`, the review
> findings in `docs/DEFECTS.md`.

## Decided

- **AC-6 is literal — ruled by the human on 2026-09-05**, with the cost below in front of them. The
  three modules exchange unbranded primitives and `src/application` composes them; arc42 §5.2 records
  what changed in the merged code.
- **Opening hours reach the pure core as a 7-slot tuple** indexed by `DayOfWeek`, `null` for a closed
  day. Absence is unrepresentable: the length is in the type, so an assembler cannot silently omit a
  day and a lost row cannot masquerade as a closure. It mirrors the column's `CHECK` and `0 = Sunday`.
- **The DST rule is stated once, in `openingHours.ts`** — *convert instant → local wall clock, never
  the reverse* — that direction being total and single-valued where the reverse has no answer at a
  spring-forward and two at a fall-back. arc42 §8.3 has the decision order and the measurements.
- **A verdict union, not a boolean**, for three reasons. `BookOutcome` needs the window's endpoints,
  so a boolean makes the application re-derive the day of week — a second site of wall-clock reasoning
  and a QS-12 violation. Fail-closed cases must be distinguishable from an ordinary refusal, or a
  configuration error reaches a customer as *"we're closed"*. And a boolean admits one assertion per
  case, so a mutant returning the **right refusal for the wrong reason** survives.
- **The time parser accepts one exact `24:00:00` beside `00:00:00`–`23:59:59`**; everything else is
  `malformed-hours` — fail closed, because a gate that cannot read its own configuration must refuse.
- **`durationMillis` is a function, not an exported constant.** An exported `MINUTE_MILLIS` could be
  imported and multiplied elsewhere, and the AC-5 scan would have to reason about call sites.
- **Outside-in tests reach a pure module through the built artifact**, and `tests/property/` splits
  on database need — **ADR-0013**, three clauses; `.dependency-cruiser.js` is **not** amended. The
  `dist/domain/*.js` specifier is computed because a literal one fails `tsc` at the red commit
  (measured: `TS2307`, with a control) — not to evade `dependency-cruiser`.

## The QS-12 marker specification — R-01-6

The architect defines a marker as a **concept**, the test-engineer implements it.
`duration-arithmetic` is *any conversion between minutes or seconds and milliseconds under `src/`
outside `duration.ts`*. Both earlier drafts defined it as the literal `60_000` — a spelling, which is
the pattern asserting its own reflexivity. The open set implemented against it, arc42 §11 holding the
residue it still misses:

| # | Form |
|---|---|
| 1 | the ms-per-minute literal, **word-bounded** — `60_000`, `60000`, not `600000` |
| 2 | that value as a product of its factors, either order, any spacing |
| 3 | a three-term product through seconds, `minutes * 60 * 1000` |
| 4 | either as a **divisor**; the inverse is the same concept |
| 5 | a decimal or separator variant of row 1 |
| 6 | the ms-per-second literal scaling a minutes/seconds quantity — `seconds * 1000` |

Row 6 is widest, deliberately: a two-step conversion escapes a scan knowing only the fused
constant. A spelling not listed is a finding to raise.

**Four mechanisms, all required**, make a green from such a scan mean anything: a **corpus guard**
naming the files examined; a **planted control** per marker, in a spelling the pattern was *not*
authored against; a **conforming control** reporting zero; and a **positive** assertion that *exactly
one* file matches — *at most one* is vacuous over an empty `src/domain`, and that assertion is what
makes the red commit red.

## Ruled

| # | Objection | Ruling |
|---|---|---|
| **T-01-2** | test-engineer: *"the project split means a container failure cannot turn this evidence into a crash"* is an unmeasured mechanism claim, and false | **(c)**, naming `CLAUDE.md` §2.4. **Loopback 1 of 2.** Measured: one `vitest run` over both projects aborts in `globalSetup` and writes zero tests, so `red-proof` reports *"no suite failed"* |
| **T-01-1** | test-engineer: *"AC-5 and AC-6 are jointly unsatisfiable"* is overstated | **Conceded.** A third path exists: convert *before* the call. The implementer argued the architect's side and was wrong — both enumerated two responses to a real call site and called it a proof |

T-01-2's remedy — `tools/ci/run-tests.mjs` running the two projects as separate invocations, merging
their JSON, and treating a project that **did not run** as a loud, distinct failure rather than zero
failures — the human ruled tooling prep, not slice work; it landed before step 3. The third part is
load-bearing: without it, a `db` project that never ran looks like one where everything passed.

Four corrections were conceded, two of them defects here rather than refinements: the `60000`
substring match (row 1), the parser's permissive range (`'24:30:00'` is not a `time`, measured —
narrowing removed a branch reachable only by impossible data), the computed-import hole no longer
closed by review alone, and the `> 0` generator-coverage floors, **measured to pass ~29% of the time
under a deliberately broken stratified generator**. A guard with that false-pass rate is the failure
it exists to catch, so each floor became a computed minimum.

## Debt booked — the price of a ratified ruling, not defects

arc42 §11 carries all four in full. **None argues for revisiting AC-6.**

**D-01-1 — composition order left the domain.** Expressed by the types before the ruling, by a use
case after it: still correct, but because someone wrote it correctly.

**D-01-2 — unit confusion across domain boundaries is review-caught, not compiler-caught.** Both
inter-module handoffs take a bare `number`. Cashed in at step 5 as R-01-1 and ADR-0014.

**D-01-3 — one extra branch and one extra verdict variant.** `malformed-interval` exists only
because `Interval` cannot cross the boundary carrying *"ordered, and from the same interval"*.

**D-01-4 — the three-file split is weaker, and `interval.ts` feels it.** Of its two justifications —
one §1.4 ambiguity per file, and three types that composed — only containment survives. A later slice
finding `interval.ts` anaemic should read §11 first.

## Open questions, findings and assumptions

- **OQ-01-1** — when A-4 is revised and a buffer exists, must the **occupancy** interval also fall
  inside opening hours, or only the appointment interval? ADR-0001 says *"the whole derived
  interval"*, written when they were the same thing; no test can tell them apart today. Deferred, not
  answered; cited by ADR-0015.
- **OQ-01-2 / F-01-2** — AC-5 confines *use of a dealership's `time_zone`* to `openingHours.ts`, and
  `referenceRepository` must `SELECT` that column. Nothing is built now: an allowlist over an empty
  set is a mechanism nobody ran. Proposed reading: a column name in a repository is *transport*, a
  zone reaching wall-clock reasoning is *use*. AC-5 is the human's.
- **F-01-1** — arc42 §10's QS-9 carried the transposition the human had already ruled a defect in
  AC-2 under O-13. **Corrected at step 1** rather than step 7, QS-9 being what the test-engineer reads
  at step 3; the edit cites O-13 and is marked propagated rather than decided, which holds only
  because the two texts were the same defect word for word.
- Assumptions: ~~**DA-1**~~ intra-domain type imports satisfy AC-6 — discharged **against**, by the
  human; ~~**DA-2**~~ PostgreSQL's `time` admits `24:00:00` — discharged by measurement, which also
  narrowed the parser; ~~**DA-3**~~ Vitest honours a computed `file://` import of `dist/` — measured
  with a control before this design was accepted; **DA-4** `pg` returns `time` as a string, which is
  why `DayHours` holds strings, and nothing here depends on it.
