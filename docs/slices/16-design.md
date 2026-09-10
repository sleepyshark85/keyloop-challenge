# Slice 16 — design · [`16-availability-derives-its-own-window.md`](16-availability-derives-its-own-window.md) · arc42 §6.5, §8.6, §10.2, §11.1 · [ADR-0039](../adr/0039-availability-takes-a-start-not-a-window.md) · step 1

> **Condensed at step 7, as built.** The argument now lives where it belongs: the option set and the
> rule in ADR-0039, the derivation and the two intervals in arc42 §6.5, the taxonomy in §8.6, the
> amended scenarios in §10.2, the debt in §11.1, findings in full in `docs/DEFECTS.md`. What stays is
> this slice's delta and the **verdicts**, which have no other home.

## 1 · What changes

Discharges the human's finding `H-16-1`. `GET /availability` takes `startsAt`, not `from`/`to`;
`queryAvailability` calls `deriveInterval` — **the function `bookAppointment` calls, unedited** — and
the `200` carries the interval it answered about. Three things follow from reusing that function rather
than writing a second derivation, each worth more than the parameter change: duration arithmetic stays
in `duration.ts` (QS-12); the opening-hours gate comes along; and the window becomes a value two
responses can be compared on (AC-2) instead of a fact only the server knows.

## 2 · Building blocks touched

| Block | Change |
|---|---|
| `src/http/routes/availability.ts` | Querystring `from`/`to` → `startsAt`; `200` gains `startsAt`/`endsAt`; two new `switch` arms (`outside-opening-hours` → `400`, `reference-data-invalid` → `500`). The three-literal split stays — `D-08-1`'s mutants die one at a time |
| `src/application/queryAvailability.ts` | `fromMillis`/`toMillis` → `startsAtMillis`; outcome union reshaped (§3); statement order becomes the booking path's; the two reads untouched |
| `src/http/routes/appointments.ts` | **One keyword** — `outsideOpeningHours` exported (ruling 6) |
| `src/application/deriveInterval.ts` | **Not edited.** A second caller is the whole mechanism |
| `src/domain/**`, `src/persistence/**` | **Not edited.** `busyResources` takes two `Date`s and does not care where they came from |
| `docs/WALKTHROUGH.md` | Scenario 3's `curl`, the only non-test sender of `from`/`to` |
| `docs/api/openapi.json` | Regenerated, not hand-edited |

## 3 · Interfaces

```ts
export interface AvailabilityQuery {
  readonly dealershipId: string;
  readonly serviceTypeId: string;
  readonly startsAtMillis: number;   // the same shape BookCommand takes
}

export type AvailabilityOutcome =
  | { kind: 'available'; startsAt: Instant; endsAt: Instant;
      bays: readonly string[]; technicians: readonly string[] }
  | { kind: 'malformed-instant' }                                   // 400 malformed-request
  | { kind: 'outside-opening-hours'; verdict: OpeningHoursVerdict }  // 400
  | { kind: 'unknown-reference'; reference: 'dealership' | 'service-type' }  // 422
  | { kind: 'reference-data-invalid'; detail: string };             // 500
```

`malformed-window` is **gone, not renamed**: of the two cases it held, `to <= from` is now unreachable
by a client and the other *is* the booking path's `malformed-instant`. The member the two endpoints
share is the one that survives — a convergence, not a rename.

**Statement order becomes `bookAppointment`'s exactly**: dealership → service type → `deriveInterval` →
candidates → busy. Before this slice `{unknown dealership, garbage startsAt}` answered `400` from
availability and `422` from booking — the same defect in a second dimension, unreported, closed by
adopting the booking path's order. AC-4's last clause pins it.

The busy read uses the **occupancy** interval; the response names the **appointment** interval. arc42
§6.5 is that claim's home; ruling 8 says why no test asserts it.

## 4 · Data-model delta

**None.** No migration, column or index; the constraints and both reads are untouched.

## 5 · Rulings — the verdicts

1. **Replacement, not addition.** `from`/`to` go away. Keeping them keeps the reported defect
   available on the same URL, doubles a taxonomy this slice simplifies, and TypeBox cannot express the
   exclusivity in an exploded object querystring, so the contract could not state the rule it would
   depend on. Reversal cost: two schemas, a union, two tests, a `curl`.
2. **QS-8 keeps its shape and six mechanics**; the probe interval is **read from the response**, never
   recomputed. Consequence stated rather than hidden: QS-8 is now internally consistent by construction
   and **cannot catch a wrong window** — **AC-2** is the assertion that can. Aiming and probing are
   different privileges: the generator may use the declared duration, the probe may not.
3. **The residual taxonomy converges on the booking path's.** §8.6 gains **one word**: `availability`
   on the `outside-opening-hours` row.
4. **This warrants an ADR** under the human's bar: it forecloses a range query someone would reasonably
   reach for, and is expensive to reverse in what was built on it.
5. **Availability applies opening hours — the cheaper option.** Excluding the gate needs either a second
   derivation or a widened `deriveInterval` signature, to weaken this endpoint. The criterion, since one
   is owed: **AC-1**.
6. **`I-16-1`, (a) — the two helpers are not the same kind of thing.** `outsideOpeningHours` is
   **exported and shared** (a function over a domain union with a branch); `INTERNAL` is **rebuilt
   locally**, on this repository's settled ruling that `/problems/internal` is duplicated by construction
   site and held in agreement by the contract test. Reasoning: `docs/DEFECTS.md` `I-16-1`. **Premise
   corrected 2026-09-10 (reviewer MAJOR-3), decision unchanged**: that agreement is enumerated per
   operation and did not extend to a third site, so ruling 6 should have booked the row as a step-3
   obligation. The omission is mine; the remedy sat inside the design.
7. **`F-16-1a`, (d)** — the scope ruling and corrected ownership count live in the slice file.
8. **`T-16-1`: no test, and no `Stryker disable` directive.** While `A-4` holds the buffer at zero the
   two intervals are the same value, so a test could only assert `x === x` and would have failed at no
   point in its life (§2.4). No directive either: Stryker does not synthesise a swap between two
   identically-valued expressions, and a directive would strip *real* mutants from the denominator
   (`O-62`). The record is arc42 §6.5; the code comment cites it.

## 6 · Quality scenarios

**QS-8** amended (ruling 2). **QS-11** — the taxonomy grows by one operation on one row. **QS-12** —
**unchanged, and that is a claim**: `queryAvailability.ts` passes the whole dealership to
`deriveInterval` and never names the zone, which is what that signature exists for. Already in CI. **QS-14** amended, forced: a one-day query is unrepresentable once the window is derived — but it
**keeps its number**, the *candidate* read being indifferent to window width, so only one of the two
reads got cheaper and no measurement justifies a new threshold. AC-6 records the p95 at step 7.

## 7 · Debt this slice books — definitions for §11.1

- **`D-16-1`** — QS-14 measures a narrower range against an unchanged budget.
- **`D-16-2`** — `availability-composition.svg` depicts the retired `from`/`to` signature until phase
  6's single refresh of presentation diagrams.
- **`D-16-3`** — `appointments.ts` is a de facto shared HTTP module; extraction to `src/http/shared.ts`
  is deferred, not rejected. Created by ruling 6.
- **`D-16-4`** — `availability-budget.test.ts` couples `npm test`'s exit code to arc42 prose. Raised at
  step 5 under `R-16-1`.
- **`D-16-5`** — the derived red evidence names a run that failed and is not in history; the genuine
  proof exists but cannot be collected, `collect-ci.mjs` deduping on `run_id` alone. Raised at Gate E
  (`O-16-5`), ruled **(b)**, remedy in slice 18.
- **`D-16-6`** — `GET /availability` can answer `500`; `openapi.json` declares only `200/400/422`.
  Found at Gate E: `I-02-5` widened by this slice, not created by it.

**§5.2 is not edited.** No boundary moves; listing it would let one.

## 8 · Where I disagree with the framing I was given

- **`harness/` and `README.md` are not touched.** No harness script calls `/availability`; the README's
  single mention is prose. Both were listed as touched; both are out.
- **The retired-ADR citation is not one line, it is ten** (`F-16-1`): a retirement advertised as
  rewriting ~160 references left a whole endpoint's cluster behind.
- **A second instance of the class is in scope** — §3's precedence disagreement. **A third is not**
  (`F-16-2`).

## 9 · Assumptions and open questions

- **`A-16-1` — closed at Gate E**, on `CLAUDE.md` §1 rather than on belief: the client layer is a stub,
  so no external consumer of `from`/`to` exists by constitution. Recorded in ADR-0039.
- **`A-16-2` — resolved at step 2.** `500 /problems/internal` is reachable through a seedable
  dealership with an unparseable zone (`Not/AZone`); no mock, §2.2 intact. AC-4's last row stands.
- **`OQ-16-1` — confirmed at step 2: no `durationMinutes` field.** **AC-2 compares instants**, so a
  minutes field would be the only member of the `200` no acceptance criterion can fail. ADR-0039's rule
  is about *requests* and does not decide this; the refusal rests on redundancy alone.
