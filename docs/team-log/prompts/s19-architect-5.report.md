# Report · slice 19 · architect · invocation 5

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Step 7 as-built reconciliation
- Returned: 2026-09-10T13:54:41.337Z
- Duration: 1675s

---

Step 7 is done and pushed as `358e58a`. All four checks pass.

## Per obligation

**1 · AC-5's arc42 half.** Both instances corrected, and they were the complete set. `04-solution-strategy.md` now says the `409` claim holds *"all but always"* and hands the qualifier to §11.2 R-4; `06-runtime-view.md:49` says the same in its own words. Plus §5.2 (`candidates.ts` partitions free-then-busy from a snapshot arriving **as a parameter**), §6.2's step-5/6 block (the occupancy read, its concurrency, its unspannedness, and *"busy reorders and never removes"*), §6.2's and §8.4's `capped` notes to ruling 4's wording, and §8.4's one-sentence record of the deliberate absence of a span. **R-4 rewritten** against the executed figure: *unlikely rather than impossible*, 163/200 before and 200/200 after, and it explicitly refuses to call the counter clean.

**2 · AC-6.** Folded into `§11.1 D-09-6` rather than added beside it — that row already *was* the QS-14 regression baseline, so a second figure for the same query would have been two homes for one fact. It now reads: availability **p95 14.16 ms** / 200 ms, uncontended booking **p95 18.37 ms** / 100 ms, on `cpus=16 i5-13400F, totalMemMB=15801, node=v24.18.0`, with slice 16's 10.50/10.45 ms named as pre-read. I verified all four of `availability-budget.test.ts`'s document regexes (AC-6 ×2, AC-15 ×2) still match.

**3 · `OQ-19-2` — ruled: accept the weakened guarantee, booked as `D-19-2`.** Reasoning: adding the snapshot to `booking.refused` is one attribute and would work — I decline it here on **§2.4**, not on cost. There is no failing test for it, and a `src/` edit riding on prose in a slice whose one red commit is spent is exactly what §2.4 exists to refuse. What actually narrowed is also smaller than the wording suggests: `orderCandidates` stays pure and total, so replay from a *test* is untouched (P8/P9 supply `busy` directly); what weakened is replay from a **production line**, and no log ever replayed a concurrent interleaving anyway. ADR-0019 destination, named because a deferral that cannot say where it went is an omission: **the slice that reopens `booking.refused`'s payload for `D-14-2`'s missing `exception.*`** — it decides that record's attribute set once instead of twice. It needs a backlog slice from you; a row is not scheduled (`F-16-1`'s own lesson).

**4 · `R-19-5` — ruled: the executed figure *with its provenance*, plus an explicit statement that it is a sample.** Neither 163 nor 165 is reproducible — `BOOKING_SEED` is deliberately unset, so the count is a fresh random variable every run. Preferring the repository's number over yours would swap one quoted constant for another and satisfy the DoD clause in letter only. So §10 QS-15 and §11 R-4 carry **163 of 200 in the red run (CI `34464606313`)**, name 165 as the hand probe, and say in terms that both are samples of roughly a one-in-six refusal. ADR-0040 keeps its own 35/200 — the probe that opened the finding, attributed in its provenance block — and adds the fixture's 37 as the second draw.

**Slice-file wording, yours to apply** (replacing *"Measured red at 165/200 on the shipped ordering."* at line 48):

> *Measured red at 163/200 by this criterion's own fixture (CI 34464606313); the hand probe that opened the finding measured 165. `BOOKING_SEED` is unset, so seeds are drawn fresh each run and the figure is a sample, not a constant.*

**5 · `R-19-6` — agreed, and it goes further than the reviewer took it.** The masking argument is right. But run the arithmetic to its end: a refusal *while a free pair remains* requires reaching the cap of 16 on candidates the snapshot called **free**; the other racers can occupy at most `2(N − 1)` of those, and at most `2M − 2` can be spent without emptying a free list — after which the refusal is honest. So it needs **`N ≥ 9` and `M ≥ 9`**. **Every QS-16 tuple has `M ≤ 8`, `(8,8,4)` included.** A spurious refusal is therefore structurally unreachable at *all four*, not merely masked at three — and the reviewer's `(20,8,4)` observation is the special case.

Which means **my own claim in design §8, and ADR-0040's consequence repeating it, that QS-16 was free-first's falsifier, is false.** Both corrected. The tuples were not badly chosen: against ADR-0009's blind ordering busy candidates interleave, the bound does not hold, and `(8,8,4)` fired in 3 of 8 local runs — they discriminated on the code they were written against. **The set stays**, because a new tuple is a new concurrency test and §2.4 wants it red first. §10 QS-16 now carries the arithmetic and says a green QS-16 means the count is exact and **not** that the burst risk is absent; `(9, 9, 3)` — `N == M == 9` — is the tuple that could falsify free-first, booked as **`D-19-3`**, destination a backlog slice.

**6 · ADR-0040 stays `proposed`.** A decision, not a lapse, and with a nameable reason: the record rejects **Cap-1** — raising `BOOKING_ATTEMPT_CAP`, one config value, which makes the spurious refusal *structurally* unreachable where Order-E makes it merely unlikely — on a **latency cost nobody measured**. Every figure this slice produced supports Order-E's correctness; none prices its rival. A gate asked to choose between a measured remedy and an argued one should see the option set itself. Booked as **`D-19-4`**; ratification is yours at the gate.

## As-designed vs as-built delta (for the scribe)

1. **The occupancy read is concurrent, not sequential.** Design §2 specified it *after* `candidateResources`; it ships inside one `Promise.all` (`/home/agentadmin/sources/keyloop-challenge/src/application/bookAppointment.ts:257-259`). Better than specified — no added round trip, which is why AC-6 came in at 18.37 ms. §6.2 and ADR-0040 now say so.
2. **§8's pre-committed falsifier was not one** (ruling 18).
3. **§11 gained a row §9 did not foresee** (`D-19-3`) and merged two: QS-13's `absorbed` leg folded into `D-19-1`, its determinism and the reschedule snapshot being one debt seen twice.
4. **The red figure is 163, not the 165 the slice file and AC-1 carry** (ruling 17).

## What I would not sign if I were not the author

**Ruling 18 replaces a wrong claim with an unverified one, and arc42 now states it as fact.** The `N ≥ 9 ∧ M ≥ 9` bound is my own derivation, produced at step 7, downstream of nothing. It is now load-bearing in three places — §10 QS-16, §11 D-19-3, ADR-0040's residual — and **nothing in the repository asserts it**; the test that would (`(9,9,3)`) is booked, not written. I caught a false claim by reasoning and then wrote a second claim by the same method, which is precisely the move this project distrusts. A reviewer should re-derive the counting argument before the gate, not read it.

Its consequence is the second thing: **§4.1's new headline is quantified only backwards.** It gives one-in-six for the *old* ordering and calls the new residual *"unlikely"* with no number — and by ruling 18's own arithmetic no test in the suite can produce one. The system's most user-visible claim now rests on an argument.

Third, smaller, but the gate should see it rather than notice it: paying §11's word ratchet for four new rows cost ~300 words condensed out of **six rows belonging to earlier slices** (`D-15-4`, `D-16-3`, `D-16-4`, `D-16-5`, `R-11`, §11.3). No decision or citation was dropped and `docs:refs` confirms it, but slice 19's commit rewrites other slices' history prose, and that is a judgement I made alone.

## Checks

`docs:check` — *system-design.md is current (13 sections, 23 ADRs)*. `docs:adr-check` — *23 ADR(s) checked: every considered option and chosen option survives*. `docs:budget:check` — clean (`19-design.md` 3000/3000, `11-risks` 2499/2500, `08-crosscutting` 2500/2500, `adr/0040` 700/700). `log:check` — *1470 record(s) checked, 0 invalid*. Also ran `docs:refs` — *129 identifier(s) cited, all defined*; it initially rejected `D-19-1…4` as undefined, so the design carries a four-item definition list.

Nothing outside `docs/arc42/`, `docs/adr/` and `docs/slices/19-design.md` was staged; `docs/STATUS.md` and `docs/team-log/` are untouched by me.

## PR comment, verbatim

```
*Step 7: arc42 corrected to what merged, and four open items ruled — `358e58a`.*

**architect** — AC-5's arc42 half is done: §4.1 and §6.2 both promised a `409` means the
dealership was full; both now hand the qualifier to §11 R-4, which is rewritten against the
executed figure. AC-6's p95s (14.16 ms availability, 18.37 ms booking) sit in §11 D-09-6
beside `cpus=16 i5-13400F`.

**R-19-5** — neither 163 nor 165 is reproducible (`BOOKING_SEED` is unset), so §10 QS-15 and
R-4 state 163/200 from CI 34464606313, name 165 as the hand probe, and say both are samples.

**R-19-6** — agreed and extended. A spurious refusal needs `N ≥ 9` **and** `M ≥ 9`; every
QS-16 tuple has `M ≤ 8`, so it is structurally unreachable at all four, not masked at three.
**My own claim that QS-16 was free-first's falsifier was false**, and ADR-0040's matching
consequence is corrected. The set stays — §2.4 wants a new tuple red first — and `(9,9,3)`
is booked as D-19-3.

**OQ-19-2** — the weakened replay guarantee is accepted, not fixed here: no failing test to
ride on (§2.4). D-19-2, with an ADR-0019 destination.

**ADR-0040 stays `proposed`**: it rejects Cap-1 — one config value, a structural fix — on a
latency cost nobody measured. The gate should see the option set. D-19-4.

**As-built delta**: the occupancy read ships concurrent with `candidateResources`
(`bookAppointment.ts:257-259`), not after it — no added round trip.
```

```json
{
  "role": "architect",
  "outcome": "reconciled",
  "arc42_sections_touched": ["§4.1", "§5.2", "§6.2", "§8.4", "§10", "§11.1", "§11.2"],
  "adrs": [{"id": "0040", "status": "proposed", "supersedes": "0009"}],
  "quality_scenarios": ["QS-13", "QS-14", "QS-15", "QS-16"],
  "assumptions": ["A-19-1", "A-19-2"],
  "open_questions": [],
  "dcr_ruling": "R-19-5 agreed (figure with provenance); R-19-6 agreed and extended (tuple set stays, arithmetic and power caveat into §10, (9,9,3) booked as D-19-3); OQ-19-2 accepted and booked as D-19-2 with an ADR-0019 destination; ADR-0040 deliberately left proposed as D-19-4",
  "message": "arc42 now describes what merged: both §4.1/§6.2 sentences corrected, R-4 rewritten against 163/200-before and 200/200-after, AC-6's figures beside their machine class, and four new debt rows paid for by condensing six older ones rather than raising a budget. The sharpest outcome is that R-19-6 generalises — a spurious refusal needs N≥9 and M≥9 and no QS-16 tuple has it — which makes my own step-1 claim that QS-16 was free-first's falsifier false, and I corrected it in both arc42 and ADR-0040."
}
```
