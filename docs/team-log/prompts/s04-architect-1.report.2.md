# Report · slice 04 · architect · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 04 design, step 1
- Returned: 2026-09-06T06:13:47.905Z
- Duration: 5246s

---

Step 2 is adjudicated and committed as `b8fdd35`. Verdicts were formed and stated before any edit; the amendment was one pass.

## The nine rulings

| | Verdict | Outcome | Why |
|---|---|---|---|
| **I-04-3** carrier does not compile | **AGREE** | **(a)** | Reproduced: a brand on the object leaves `readonly string[]` untouched, so `nextCandidate` is **exit 2, twice `TS2322`**. My step-1 claim that it *"removes the last `as string`"* was false — it **relocated** it. Carrier becomes `readonly [string, ...string[]]`: exit 0, no index assertion anywhere. The intent was right, the type stated for it was not — the shape of I-02-9, so (a), not (c) |
| **I-04-4** unreachable branch | **AGREE**, finding and remedy | **(a)** | Guards fold into `orderCandidates`' `null` branch. Every branch reachable, and the split is better: the domain owns *is there a candidate*, the application *whose fault* |
| **I-04-2** table omits a shape | **AGREE** on the finding, **DIFFERENT remedy** | **(a)** | See below |
| **I-04-8** seed import | **AGREE** | **(a)** | The `crypto` global, per `main.ts:50`'s own stated reason (DA-02-1) |
| **T-04-1** seed is a label, not a handle | **AGREE** | **(a)** + **ADR-0021** | See below |
| **T-04-2** AC-4 at the shipped cap | **AGREE**, my ruling reversed | **(a)** | Reproduced: 16 bays blocked → 16 attempts, `exhausted` (the tie exercised); 17 → 16, `capped`. ~52 inserts, one request — cheaper than (20,8), already in the suite. My "expensive fixture" premise was simply wrong |
| **T-04-3** D-04-1 cannot join AC-1 | **AGREE** | **(a)** | 0.35 %–46.7 % per fixture; the reason is recorded, not the fixture |
| **T-04-4** `25P02` vacuity | **AGREE** | **(a)** | It lives inside AC-1's (20,8), gated on an `attempt >= 2` witness |
| **I-04-5** D-04-1 sharper, mis-routed | **AGREE**, both halves | **(b)** | See below |

**Nine AGREE and no (c), so no loopback consumed.** Four of my step-1 sentences were false and one of my rulings was wrong; none of it makes the work incorrect or unsafe, which is what step 2 is for.

## The one disagreement, and it is on a remedy

**I-04-2's finding is the sharpest thing in the round and I accept it in full**: ADR-0020's *"Bad"* named one direction only. Move the cap out of the arm and `tsc` objects. Add a retried `PgOutcome` variant and the loop is **unbounded** — no `tsc` error, no test, a hang. Option A made that unrepresentable and E alone gave it up without saying so.

**I did not take the offered shape.** A `for` header bounded by the *cap* states one number twice, and two encodings of one number drift. The header carries **Bound-2's** bound instead — `bays.length + technicians.length`, captured before the loop — so the structural liveness bound and the policy cap are two numbers doing two jobs, and the tail `throw`s rather than refusing. Measured on the fully composed shape, all three type fixes together: **exit 0, no `as string`, no `as ContendedResource`.** ADR-0020 gains row F, loses the one-directional Consequences, and is now `contested: true` — the 700-word version is the one whose option table has lost a row.

## I-04-5 — it fails my own ADR-0019

Both halves stand. Slice 09's **AC-13** (one `INSERT` on 5 bays / 20 technicians / 500 appointments, additive bound 24) is D-04-1's sibling, and arc42 §11's **R-4 said the opposite of the truth** — *"reaching 16 needs sixteen resources taken from under one request while it loops"*. It needs sixteen **conflicts**, and a merely busy resource supplies one with no concurrency at all. R-4 is rewritten.

The filter still stays out, but **not for the reason I gave** — my *"no acceptance criterion needs it"* was falsified. The surviving argument is the implementer's: the pre-filter is trustworthy only because of QS-8, and shipping it before the property that validates it is backwards. Design §8 carries the exact slice-08 replacement wording for you, distinguishing an **authoritative allocator** (excluded, correctly) from an **advisory pre-filter** (in scope, after QS-8). **The two D-04-1 remedies — the filter, or a cap above the additive bound — are recorded and neither is chosen: the number is ADR-0009's and human-decided.**

## What I would have escalated under the old rule

**Four**, and I ruled all four: **T-04-1** (a production config surface added for testability, making an ADR-0009 named risk one variable away); **T-04-2** (reversing my own ruling on how an acceptance criterion is asserted); **I-04-5(b)** (changing another slice's scope); and **D-04-1's remedy** — which I deliberately did *not* rule, because it changes a number the human accepted at Gate B. That one is flagged rather than decided.

Preserved verbatim because it would otherwise be lost: **AC-1's red must require `booking.conflict` lines naming the constraints** — (2,1) is a control, not a discriminator, and a per-dealership global mutex (ADR-0004's rejected Option D) passes all four (N,M) cells with zero retries.

## Budget

**§5 paid its 20-word debt out of itself and sits at 2,313 exactly** — the `src/application` intro (−11), the `src/platform` junk-drawer sentence (−7), the §5.2 opener (−3), and four word-level trims in my own new text, against the tuple-carrier clause and `BOOKING_SEED` added. **§11 owed 163 words** for R-4's rewrite and D-04-2's row; paid from four compressions and one paragraph that declared itself *"a fact about tooling rather than a gap"*.

`npm test` green (30 files), `lint:arch` clean, `docs:refs`, `docs:check` and **`docs:budget:check` all green (exit 0)**. One item outstanding and it is yours: **ADR-0021 needs its baseline pin** (`docs:adr-check`; ADR-0020's arrived).

**The design is 2,930 of 3,000.** That is 70 words of headroom for steps 3–5, and I am flagging it now rather than at the next amendment: absorbing another round this size would need either a budget argument with the enumeration or a condensation pass, and the honest enumeration is that §5 is now nine rulings and §6 six findings, none of which has another home until step 7 moves them into arc42.

```json
{
  "role": "architect",
  "outcome": "adjudicated",
  "arc42_sections_touched": ["§5.2", "§6.2", "§11.1", "§11.2"],
  "adrs": [
    {"id": "0020", "status": "proposed", "supersedes": null},
    {"id": "0021", "status": "proposed", "supersedes": null}
  ],
  "quality_scenarios": ["QS-3"],
  "assumptions": ["A-04-1 — F-02-9 holds for three independent reasons, not one: disjoint lock classes, one literal unnest statement so the order is identical at every attempt, and domain-is-pure putting the classes out of candidates.ts's reach"],
  "open_questions": ["OQ-04-1 — half-closed: two refusals logging two different seeds tests the source at P(false failure)=2^-32; uniformity stays open"],
  "dcr_ruling": "nine objections: eight (a), one (b) — I-04-5, whose deferral target's own file forbade the work and so failed ADR-0019. No (c); loopback ledger 0 of 2",
  "message": "Nine objections, nine AGREE, and one remedy taken narrower than offered. Four of my step-1 sentences were false and one ruling was wrong: the CandidateOrder carrier does not compile and relocated the index assertion rather than removing it; the empty-candidate guards forced a branch no test can cover; the seed I recorded is a label with no handle, and no static fixture can force a technician-side first conflict because blocking K technicians requires K bays at the same dealership; and AC-4's default-cap fixture is 52 inserts and one request, not the expensive thing I called it. The disagreement is on I-04-2's shape — the finding is right that ADR-0020 traded a structural liveness bound for a type guarantee and did not say so, but the loop header carries Bound-2's bound rather than the cap, so one number is not written twice. D-04-1 is worse than I stated and its deferral failed my own ADR-0019; the filter still waits for QS-8, the slice-08 wording is in design §8 for you, and the choice between adding the filter and raising a human-accepted 16 is the one thing I declined to rule."
}
```
