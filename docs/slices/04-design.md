# Slice 04 — design

Slice file: [`04-candidate-allocation-and-retry.md`](04-candidate-allocation-and-retry.md) — five
acceptance criteria, QS-3, implementing [ADR-0004](../adr/0004-retry-across-remaining-candidates.md)
and [ADR-0009](../adr/0009-candidate-ordering-and-attempt-cap.md).
arc42 scope: **§6.2, §5.2, §7.3, §8.4, §11, §13**. **No data-model delta and no migration.**

> **Reconciled at step 7.** arc42 now holds this slice's architecture, so what stood here as a
> proposal has been deleted rather than restated. What remains is the record that has nowhere else
> to live: the design-local identifiers arc42, the ADRs and the event log cite, and the index of
> where everything else went.

## 1. Where this slice's design now lives

| What | Home after merge |
|---|---|
| The retry loop, its two refusal exits and the tail's tightness | arc42 §6.2, step 7 |
| `candidates.ts`, the tuple carrier, `BookOutcome.exit`, `BOOKING_*` | arc42 §5.2 |
| The environment contract | arc42 §7.3 |
| Where the cap's `return` goes, and the five trees compiled to decide it | [ADR-0020](../adr/0020-test-the-attempt-cap-inside-the-conflict-arm.md) |
| `BOOKING_SEED`, and the structural measurement that forced it | [ADR-0021](../adr/0021-the-booking-seed-is-overridable-by-environment.md) |
| The `BOOKING_` prefix rule | [ADR-0022](../adr/0022-application-configuration-is-prefixed-booking.md) |
| Why the advisory pre-filter waits for slice 08's QS-8 | `08-availability-query.md`, *Out of scope*; ADR-0019 |
| Every ruling of the step-2 and step-4 rounds, with its rationale | `events.jsonl`; `npm run slice:check 04` prints them |
| **AC-1's evidence shape** — that counting confirmations is not evidence | `tests/concurrency/no-spurious-refusal.test.ts`, which restates it in full **because that is where it has to survive an edit** |

## 2. As built, the code refused three things this design predicted

Recorded because arc42 is the as-built record and a design that reads as though it had been right
all along is worth less than one that says what changed. All three are in arc42 §5.2.

- **The carrier needed two brand casts, not three, and no index assertion at all** (I-04-13). §3 here
  paired a length guard with a per-list cast — which asserts the fact the guard had just established,
  I-04-4 one level down. Destructuring head from tail *is* the emptiness test and *builds* the tuple,
  so the two collapse into one reachable branch. The shuffle ships in Fisher–Yates **selection** form
  for the same reason: the in-place swap needs the two `noUncheckedIndexedAccess` assertions the
  carrier was chosen to remove. Uniform to ±1.7 % over 8 bays and 100 000 seeds.
- **`loadConfig` does not emit ADR-0021's startup `warn`, and cannot** (I-04-11). The logger is built
  from its return value. It ships as `configWarnings(config)`, a pure function `main.ts` emits
  through `pino`. Ruled an as-built correction rather than a supersession — the decision was never
  the emitting site — and the as-built shape is the better one, a pure function being assertable
  where a `logger.warn` in `loadConfig` is observable only through a stream.
- **§7.3's own preamble was false** (A-04-10), and it was mine: it claimed all six variables are read
  in `config.ts` while listing `OTEL_EXPORTER_OTLP_ENDPOINT`, which the OpenTelemetry SDK
  auto-configures.

## 3. Findings, assumptions and open questions

- **D-04-1** — **ADR-0009 sized the cap below the bound its own Bound-2 paragraph computed.** At
  §1.1 scale `|B| + |T| − 1 > 16` with or without the availability filter, so a `capped` refusal is
  expected today rather than ADR-0009's intended signal, and slice 09's AC-13 cannot pass until it
  closes. Two remedies, neither chosen mid-slice because the value is human-decided: the advisory
  pre-filter after slice 08's QS-8, or a cap above the bound. **arc42 §11.2 R-4 carries it**, and
  §8.4's counter row is corrected to match. Its spurious-refusal leg is not deterministically
  assertable until one of the remedies lands; T-04-2's 17-bay fixture is the standing partial
  evidence.
- **D-04-2** — an outside-in test cannot distinguish *capped from inside the `23P01` arm* from
  *capped from outside it with a cast*, because AC-4 requires both to render identically. ADR-0020 is
  therefore a rule stated only by `tsc`. A cost of the decision, not an argument against it. §11.2.
- **D-02-1** — the id arc42 §11 uses for *"ADR-0016's argument is weaker after ADR-0018 than before
  it"*. Defined here because slice 02's design is closed at its merged budget and arc42 may not mint
  its own ids.
- **A-04-1** — F-02-9's deadlock-freedom argument holds for **three** independent reasons where
  ADR-0018 gives one: the disjoint lock-class key spaces; `lockResources` being one literal `SELECT`
  over `unnest`, so whatever order PostgreSQL evaluates it in is the same order at every attempt and
  a cycle would need two transactions taking two objects in opposite orders; and `domain-is-pure`
  (`to: {}`), which stops `candidates.ts` reaching the lock classes at all. Slice 04 adds no write
  path to `appointment`.
- **A-04-10** — §7.3's preamble, above. Closed at step 7.
- **F-04-3** — **discharged at step 5.** §11 was added to this slice's `arc42:` declaration after
  step 1, so the step-1 claim that D-04-1 and D-04-2 had no declared destination was stale before it
  was read. They landed in §11 in this pass, and §8.4 and §13 were declared the same way.
- **F-04-1** — `docs:adr-check` reports a new ADR *unpinned* and prescribes adding each entry by
  hand rather than `--rebaseline`. Third slice running (F-02-10); `tools/` is not the architect's.
  A-04-4 found the second failure mode behind it.
- **F-04-2** — `docs:budget --check --ratchet` measured *distance under budget* rather than a
  reduction, so it failed a correctly-sized new document and prescribed a fix that would have pinned
  an in-flight design at its step-1 size. **Discharged**: `tools/docs/budget.mjs` now carries the
  correction and both false positives in its own comment.
- **OQ-04-1** — the seed is per **request**, and nothing asserted the generator is not degenerate in
  a deployment. Half-closed: one bay, one technician, both blocked, refused twice yields two logged
  seeds, and asserting they differ tests the *source* in the running process at
  P(false failure) = 2⁻³². It closes degeneracy, not uniformity. Built and asserted at step 3.

## 4. What step 7 moved, and what it let go

**Moved**, because deleting them would have destroyed the only copy: ADR-0019's own breach, into
ADR-0019 (found late, and the reason this pass is deliberate); the structural measurement behind
`BOOKING_SEED`, into ADR-0021; AC-1's evidence shape, into the concurrency test that depends on it;
the `capped`-counter falsification, into §11.2 R-4 and §8.4.

**Let go**, because the artifact that owns them now says the same thing better: the AC-by-AC status
table (the slice file has the criteria, the log has the rulings); the module interface listing (§5.2);
the attempt-cap validation rule (`config.ts`'s own comment, at length); the eighteen step-2 and
step-4 rulings (`events.jsonl`, verbatim and append-only); the slice-08 replacement wording (applied
to that file); and the arc42-edit plan (applied).
