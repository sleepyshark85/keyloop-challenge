# Report · slice 04 · test-engineer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 04 step 2 AGREE
- Returned: 2026-09-06T05:38:05.679Z
- Duration: 438s

---

Read: `04-design.md`, the slice file, ADR-0020, ADR-0009, ADR-0004, arc42 §8.1/§10, and the slice-00/02 fixtures I own. Four objections, four agreements.

---

## OBJECT — O-1 (major). The recorded seed is a label, not a handle. AC-5's "re-runnable" leg is not delivered.

**Claim.** §3 binds `seed` in `main.ts` to `randomInt(0, 2**32)` and §5 records it on `booking.refused`. Nothing can feed a seed back in. A test that reads `seed: 3141592653` from a failed CI run has learned *which* order was taken and has no way to take it again — the process draws a fresh one. AC-5's words are "a failing test is re-runnable, not a flake"; the narrowed AC-5 makes `orderCandidates` replayable, and the *service* not.

**Measured.** Structural, from arc42 §8.1: `appointment` carries exclusion constraints on both `bay_id` and `technician_id`, plus `appointment_bay_in_dealership` / `appointment_technician_in_dealership`. So **blocking K technicians over an interval requires K bays at the same dealership**, which blocks those bays too — and resources cannot be borrowed from a second dealership. Consequence, and it is the load-bearing one: *no static fixture can force a first-candidate failure.* If a free bay b\* and a free tech t\* exist, the pair (b\*, t\*) is a reachable first draw. So without seed control I cannot deterministically force **any** retry — which is exactly AC-2's and AC-3's problem below.

**Exact change I want.** `src/platform/config.ts` gains `bookingSeed?: number` from `BOOKING_SEED`, the same shape §4 already gives `ATTEMPT_CAP`; unset (the default, and the only production setting) keeps `randomInt` per request. Four things become assertable that are not assertable now: AC-5's re-runnability end-to-end, AC-2's forced retry, AC-3's technician-side prune, and D-04-1 (O-3). I accept the cost — ADR-0009 names "the seed must actually vary" as a risk and an env var makes Order-A reachable by misconfiguration. I would take either mitigation the architect prefers: refuse the variable unless `NODE_ENV=test`, or log one `warn` at startup when it is set. I do **not** ask for the request body to carry it.

**If declined**, I can still commit a red for all five AC — but AC-2 and AC-3's technician half become probabilistic non-vacuity rather than forced, and D-04-1 stays unasserted. Say so at the gate rather than letting it read as covered.

## OBJECT — O-2 (major). Test AC-4 at the default cap of 16. The cheap-fixture premise is wrong, and cap=3 unpins ADR-0009's number.

**Claim.** §5's third ruling calls a dealership deep enough to need 17 attempts expensive. It is ~52 inserts and **one** HTTP request — cheaper than the (20,8) concurrency case already in the suite, and it needs no concurrency at all.

**Measured.** Simulating the loop of ADR-0020 against a fully-booked dealership (`scratchpad/d041.mjs`):

| fixture | attempts | `exit` |
|---|---|---|
| 16 bays, all blocked | 16 | `exhausted` (both conditions true — the tie) |
| 17 bays, all blocked | 16 | `capped` (1 bay untried, 17 techs remain) |

One fixture pair, order-independent, pins **three** things at once: the cap's value is exactly 16, `capped` vs `exhausted` are distinguishable, and ADR-0020's tie-break resolves to `exhausted`. At `ATTEMPT_CAP=3` none of the three is pinned and the default survives only in an implementer-owned config unit test, which is not evidence about the loop. The fixture is also robust to which constraint PostgreSQL names under double violation (slice 02 §8 measured bay-first by index creation order): if that ever flips, the same counts hold on the technician side.

**Exact change I want.** §5's third ruling is reversed: AC-4's red runs at the shipped default. `ATTEMPT_CAP` stays configurable — ADR-0009 already put it in `platform/config.ts` and I am not objecting to that — I am declining to *assert* against a non-default value, and the "one assertion that the default is 16" then becomes redundant because behaviour pins it.

## OBJECT — O-3 (medium). D-04-1 cannot become an AC-1 case, and the reason should be recorded, not the fixture.

**Claim.** You asked whether AC-1's (N,M) set should include a dealership that reaches the cap with no concurrency. I want to and I cannot make it deterministic.

**Measured.** P(refused while capacity remained), one request, cap 16, unfiltered list:

| bays | pre-booked | free | P(spurious refusal) |
|---|---|---|---|
| 20 | 17 | 3 | 0.35% |
| 24 | 20 | 4 | 0.66% |
| 20 | 19 | 1 | 20.0% |
| 30 | 29 | 1 | 46.7% |
| 40 | 38 | 2 | 35.4% |

Every row is a coin-flip test. The 0.3–0.7% rows flake-pass; the 20–47% rows flake-fail. **Neither is admissible in a suite that runs on every slice forever.** A deterministic version needs the free resource forced past position 16, which needs the permutation — O-1.

Two things follow. **First**, D-04-1's exposure is sharper than §6 states: it bites hardest when *nearly all* resources are booked, which is ADR-0004's own motivating case — the 08:00-on-Saturday burst at a large dealership. **Second**, O-2's `capped` fixture is the honest partial: it proves, deterministically and with zero concurrency, that a 17-resource dealership reaches the cap and reports `capped` — so ADR-0009's "a non-zero cap-exceeded counter in production means the cap is wrong" is already false today, before slice 08. That is the assertable half, and I will commit it.

**Exact change I want.** No addition to AC-1's (N,M) set. §6's D-04-1 gains the sentence that its *spurious-refusal* leg is unassertable until slice 08 or O-1, and O-2's fixture is named as its standing partial evidence. F-04-3's §11 routing is what carries it — I agree the `arc42:` field needs §11, and note the slice file already declares it (line 6) while the design's §6 says it does not; one of the two is stale.

## OBJECT — O-4 (low). "Absence of 25P02" as a standalone case is the vacuity trap, and the design does not say where it lives.

**Claim.** §1's AC-2 row says "New: a test asserting `25P02` never appears" without naming a fixture. Written as its own single-request case it passes on a build that refuses at the first conflict, on a build with no retry loop at all, and on a build whose booking route 404s. Also note the *observable* is indirect: `25P02` is not `23P01`, so per ADR-0004 it surfaces as itself — a `500 /problems/internal`, not a `409`.

**Exact change I want.** AC-2's assertion lives **inside AC-1's (20,8) case**, not beside it, gated on a positive witness. With 20 racers and 8 bays, pigeonhole guarantees ≥12 racers conflict and each retries, so `max(attempt) >= 2` over the `booking.conflict` lines is certain rather than probable. The case then asserts, in order: at least one record with `attempt >= 2` (the witness — without it the rest is vacuous), zero answers with status 500, and no record anywhere carrying `25P02`. A transaction-wrapped loop fails the first and second of those before the absence assertion is reached, which is what makes the absence a confirmation with a good message rather than the evidence.

---

## AGREE

**A-1 — AC-5's narrowing on the concurrency half. AGREE, and I would have raised it if you had not.** "The same interleaving of candidate choices results" is a claim about the OS scheduler and PostgreSQL's lock manager, not about this system; ADR-0018's own 292/241/2100 spread is the measurement. Asserting it manufactures the flake AC-5 exists to prevent. The property form — `orderCandidates(bays, techs, seed)` deterministic, and `prune` order-preserving on the survivors — is exact, flake-free, and reachable through `dist/` under ADR-0013 as QS-9's tests already are. My agreement is on the narrowing; O-1 is against the half of AC-5 the narrowing leaves undelivered, and those are separable.

**A-2 — AC-1's (N,M) set discriminates. AGREE.** Simulated 20,000 runs per cell (`scratchpad/disc.mjs`), correct build vs. refuse-on-first-conflict:

| (N,M) | correct | no retry |
|---|---|---|
| (2,1) | 0% fail | **0% fail** |
| (5,3) | 0% | 80.3% |
| (20,8) | 0% | 98.7% |
| (8,20) | 0% | 96.0% |

Two things worth putting in front of the gate. **(2,1) is a control, not a discriminator** — every build in this repository's history passes it, slice 02's included. And **(8,20) is the strongest cell, not the easy one**: "more capacity than demand" makes a first-choice clash a *birthday* problem — P(8 racers draw 8 distinct bays from 20) = 0.198, and independently on technicians, so ~96% of runs need a retry. It is also where the candidate lists are largest (40 resources) and so the nearest the set comes to D-04-1 without reaching it.

What the set does **not** catch, and should be said aloud rather than assumed: a build that takes a **global mutex per dealership** — ADR-0004's rejected Option D — confirms exactly `min(N,M)` in all four cells with zero retries and passes AC-1 outright. My red therefore folds slice 02's evidence shape into (20,8): the confirmations must be accompanied by `booking.conflict` lines naming `no_bay_overlap`/`no_technician_overlap`, so the count is evidence about the *database* refusing rather than about application code that serialised.

**A-3 — the additive bound. AGREE, and it is exactly assertable, not approximately.** AC-3's bound belongs in `tests/property/` over the pure module: for arbitrary non-empty bays *B* and techs *T* and any adversarial prune sequence, the number of `prune` steps before `null` is at most |B|+|T|−1 — each step removes exactly one element from one list, so the worst case is |B|−1 + |T|−1 prunes followed by one that empties a list. That reproduces ADR-0009's number as an equality rather than an estimate, needs no database, and cannot flake. What the property cannot see is whether the *service* prunes by the constraint that fired or by a fixed rule; that needs the end-to-end case, which is deterministic on the bay side (all bays blocked → every conflict names `no_bay_overlap`, `attempts` equals the bay count) and, per O-1, is not forceable on the technician side without a seed.

**A-4 — the cap inside the `conflict` arm (ADR-0020). AGREE, without reservation.** Option E is reachable only from a classification, so every refusal exit holds a minted `ContendedResource` by construction and I have no exit to test that ADR-0016 cannot account for. The four `tsc` exit codes are the right kind of evidence for a placement rule. One note for §11, which D-04-2 already anticipates: nothing in *my* directories detects a future move of that `return` either — the guard is `tsc` plus `contended-resource-cast`, and an outside-in test cannot distinguish "capped from inside the arm" from "capped from outside it with a cast", because both render identically at the edge. That identical rendering is AC-4's own requirement, so it is a cost of the decision rather than an argument against it.

---

## Two smaller things, offered rather than objected

- **OQ-04-1 is half-closeable end-to-end for two requests.** §6 leaves "nothing asserts the generator is not degenerate in a deployment" open, correctly noting a property tests the ordering and not the source. But `booking.refused` carries `seed` — so a dealership with one bay and one technician, both blocked, refused twice, yields two logged seeds, and asserting they differ tests the *source* in the running process. P(false failure) = 2⁻³². I would add it beside AC-5's property. It closes degeneracy-of-the-source; it does not close uniformity, and I would not claim otherwise.
- **Assumption A (mine, for the record).** The `booking.conflict` and `booking.refused` lines carry no request correlation id, so with 20 racers in flight I can attribute conflicts to the fleet but not to a request. Every case above that needs per-request attribution — AC-3's attempt count, AC-4's `attempts`/`exit`, OQ-04-1's seeds — is a **single-request** fixture, so I do not need one and am not asking for one. If a later slice wants per-request attempt counts under concurrency it will.

---

```json
{
  "role": "test-engineer",
  "outcome": "objected",
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": 0},
  "quality_scenarios_covered": [],
  "red_commit": null,
  "ci_failure_confirmed": false,
  "objections": [
    {"id": "O-1", "severity": "major", "ac": "AC-5, AC-2, AC-3", "claim": "the recorded seed cannot be fed back in, so AC-5's re-runnability is undelivered and no retry can be forced deterministically; want BOOKING_SEED in platform/config.ts, unset by default"},
    {"id": "O-2", "severity": "major", "ac": "AC-4", "claim": "the default-cap fixture is ~52 inserts and one request, not expensive; 16-bays vs 17-bays pins the cap value, both exits and ADR-0020's tie-break, which cap=3 does not"},
    {"id": "O-3", "severity": "medium", "ac": "AC-1", "claim": "D-04-1's spurious-refusal leg is 0.35-46.7% probabilistic per fixture and cannot join AC-1's set; record the reason and name O-2's fixture as the partial"},
    {"id": "O-4", "severity": "low", "ac": "AC-2", "claim": "the 25P02 absence must live inside AC-1's (20,8) case gated on an attempt>=2 witness, or it passes vacuously"}
  ],
  "dcr": null,
  "message": "Agreed on ADR-0020, on AC-5's concurrency narrowing, and on the (N,M) set — simulated, it fails a no-retry build 80-99% of runs, though (2,1) is a control and a per-dealership mutex passes all four. Four objections: the seed is unreplayable, AC-4 should be asserted at the shipped cap of 16, D-04-1 is not deterministically assertable, and AC-2's absence assertion needs a positive witness."
}
```

Files read, all absolute: `/home/agentadmin/sources/keyloop-challenge/docs/slices/04-design.md`, `/home/agentadmin/sources/keyloop-challenge/docs/slices/04-candidate-allocation-and-retry.md`, `/home/agentadmin/sources/keyloop-challenge/docs/adr/0020-test-the-attempt-cap-inside-the-conflict-arm.md`, `/home/agentadmin/sources/keyloop-challenge/docs/adr/0009-candidate-ordering-and-attempt-cap.md`, `/home/agentadmin/sources/keyloop-challenge/docs/adr/0004-retry-across-remaining-candidates.md`, `/home/agentadmin/sources/keyloop-challenge/docs/arc42/10-quality-requirements.md`, `/home/agentadmin/sources/keyloop-challenge/docs/arc42/08-crosscutting-concepts.md`, and my own `/home/agentadmin/sources/keyloop-challenge/tests/support/{booking,seed,service}.ts` plus `/home/agentadmin/sources/keyloop-challenge/tests/concurrency/no-bay-overlap.test.ts`. No `src/` was read. Simulations are in the scratchpad (`disc.mjs`, `d041.mjs`); nothing was committed.
