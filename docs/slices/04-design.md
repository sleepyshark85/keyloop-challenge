# Slice 04 — design

Slice file: [`04-candidate-allocation-and-retry.md`](04-candidate-allocation-and-retry.md) — five
acceptance criteria, QS-3, implementing
[ADR-0004](../adr/0004-retry-across-remaining-candidates.md) and
[ADR-0009](../adr/0009-candidate-ordering-and-attempt-cap.md): a booking losing a race for one
bay-and-technician pair tries the next. arc42: **§6.2, §5.2, §7.3, §8.4, §11, §13**. **No data-model
delta and no migration.**

> **Reconciled at step 7.** arc42 holds this slice's architecture, so what stood here as a proposal
> was deleted rather than restated. What remains has nowhere else to live: three decisions, the
> identifiers arc42 and the log cite, an index of the rest.

## 1. Where this slice's design now lives

| What | Home after merge |
|---|---|
| The retry loop, its two refusal exits and the tail's tightness | arc42 §6.2 |
| `candidates.ts`, the tuple carrier, `BookOutcome.exit`, the environment contract | arc42 §5.2, §7.3 |
| Where the cap's `return` goes, `BOOKING_SEED`, the `BOOKING_` prefix rule | §2 |
| Why the advisory pre-filter waits for QS-8 | `08-availability-query.md` |
| Every step-2 and step-4 ruling, with rationale | the log; `slice:check 04` prints them |
| **AC-1's evidence shape** — counting confirmations is not evidence | `tests/concurrency/no-spurious-refusal.test.ts`, which restates it in full, that being where it must survive an edit |

## 2. Three decisions taken here, and what each refused

**The cap is tested inside the `conflict` arm, never as the loop's bound**, whose header carries the
structural `bays.length + technicians.length` — two encodings of one number drift — with an
unreachable `throw` at the tail. Five trees compiled under this repository's own `tsc --strict`
decided it: the cap as the bound is `TS2322`, the refusal then naming a resource no database verdict
produced — ADR-0016 firing as designed — and a nullable carrier for the last resource fails too, its
cheapest discharge a cast in `src/application`, outside the file permitted to make it. A
second `BookOutcome` variant splits one §8.6 row for nothing a client can act on, AC-4 rendering both
identically. Inside the arm nothing is cast, the loop `continue`ing only on `conflict`. **The
guarantee is one-directional** (D-04-2): a second `continue` leaves the loop unbounded with no `tsc`
error, which the tail's `throw` turns loud.

**`BOOKING_SEED` is read by `loadConfig`, unset by default, and announces itself.** ADR-0009 made the
seed a parameter and this design injected it, but nothing could inject it from *outside the process*:
a recorded seed was a label, not a handle. Gating it on `NODE_ENV=test` was the tempting option and
was refused, making the tested artifact differ from the shipped one — the property outside-in tests
on the built artifact exist to preserve. A request field is permanent API surface bought for a test;
deriving it from the injected `newId()` moves the problem. The cost is ADR-0009's own named risk — a
deployment seeding every request identically degrades to sorted order — now one variable away, the
startup `warn` buying back *silently*. **It must not be set in QS-3's cases**, where one seed gives
every racer the same permutation, which is that same order. **Narrowed before it froze:** it claimed
four things and delivers two. Determinism need not come from the first draw — block every technician,
leave one bay free, and the technician list empties under every permutation, which is how AC-3 and
AC-4 are built, seedless. A fixed seed forces *a* ordering, never a chosen one; AC-5 and OQ-04-1
remain.

**`BOOKING_` marks configuration this application invented; an unprefixed name is one something else
fixed** — `DATABASE_URL` and `PORT` by convention, `LOG_LEVEL` by `pino`,
`OTEL_EXPORTER_OTLP_ENDPOINT` by the OpenTelemetry specification, where renaming breaks
auto-configuration outright. So the cap is `BOOKING_ATTEMPT_CAP`, §7.3's table the deployment
contract. §5.2 and §7.3 had named it differently, and the tie-break rule was no help with arc42 on
both sides. The unprefixed alternative is **unreachable**, not merely costlier: `BOOKING_SEED` is
read by `tests/support/service.ts`, test-engineer-owned and closed to the architect, so it buys
consistency nowhere. Nothing detected the drift, and a shape-matching guard fires on prose: of nine
backticked `SHOUTING_SNAKE` tokens in arc42, four are not configuration. The guard that works is
anchored to code — set equality between `config.ts`'s `env['…']` keys and §7.3's first column — and
`tools/` is not the architect's.

## 3. As built, the code refused two things this design predicted

Both are in arc42 §5.2; a design reading as though it had been right is worth less.

- **The carrier needed two brand casts, not three, and no index assertion at all.** This design
  paired a length guard with a per-list cast, which asserts the fact the guard had just established.
  Destructuring head from tail *is* the emptiness test and *builds* the tuple, so the two collapse
  into one branch. The shuffle ships in Fisher–Yates **selection** form for the same reason: the
  in-place swap needs the two `noUncheckedIndexedAccess` assertions the carrier exists to remove.
  Uniform to ±1.7 % over 8 bays and 100 000 seeds.
- **`loadConfig` does not emit that startup `warn` itself, and cannot**: the logger is built from its
  return value. It ships as a pure `configWarnings(config)` that `main.ts` emits through `pino` — an
  as-built correction rather than a supersession, the decision never having been the emitting site,
  and the better shape: a pure function is assertable, a `logger.warn` in `loadConfig` observable
  only through a stream.

## 4. Findings, assumptions and open questions

- **D-04-1** — **ADR-0009 sized the cap below the bound its own reasoning computed.** At the stated
  scale `|B| + |T| − 1 > 16` with or without an availability filter, so a capped refusal is expected
  today rather than the intended signal, and slice 09's AC-13 cannot pass until it closes. Two
  remedies, neither chosen mid-slice, the value being the human's: the advisory pre-filter once QS-8
  holds, or a cap above the bound. **arc42 §11.2 carries it**, §8.4's counter row corrected to match.
  The spurious-refusal leg is not deterministically assertable until a remedy lands; a 17-bay fixture
  is the partial evidence.
- **D-04-2** — an outside-in test cannot distinguish *capped inside the `23P01` arm* from *capped
  outside it with a cast*, AC-4 requiring both to render identically, so §2's placement rule is
  stated only by `tsc`. A cost of the decision, not an argument against it.
- **D-02-1** — the id arc42 §11 uses for *"ADR-0016's argument is weaker after ADR-0018 than before
  it"*, defined here because slice 02's design is closed at its merged budget.
- **A-04-1** — F-02-9's deadlock-freedom argument holds for **three** independent reasons where
  ADR-0018 gives one: the two lock classes have disjoint key spaces; `lockResources` is one literal
  `SELECT` over `unnest`, so PostgreSQL's evaluation order is the same at every attempt and a cycle
  needs two transactions taking two objects in opposite orders; and `domain-is-pure` stops
  `candidates.ts` reaching the lock classes. Slice 04 adds no write path to `appointment`.
- **A-04-10** — **§7.3's preamble was false, and it was mine**: it claimed all six variables are read
  in `config.ts` while listing `OTEL_EXPORTER_OTLP_ENDPOINT`, which the SDK auto-configures. Closed
  at step 7.
- **F-04-3** — **discharged at step 5.** §11 was added to this slice's `arc42:` after step 1, so the
  step-1 claim that D-04-1 and D-04-2 had no declared destination was already stale.
- **F-04-1** — `docs:adr-check` reports a new ADR *unpinned* and prescribes adding each entry by
  hand. Third slice running (F-02-10); `tools/` is not the architect's.
- **OQ-04-1** — the seed is per **request**, and nothing asserted the generator is not degenerate in
  a deployment. Half-closed at step 3: one bay and one technician, both blocked, refused twice yields
  two logged seeds, and asserting they differ tests the *source* in the running process at
  P(false failure) = 2⁻³². Degeneracy closed, uniformity not.
