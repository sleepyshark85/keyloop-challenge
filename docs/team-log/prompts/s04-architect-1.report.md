# Report · slice 04 · architect · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 04 design, step 1
- Returned: 2026-09-06T05:01:17.119Z
- Duration: 895s

---

Slice 04 step 1 is committed in two commits, as asked.

## The capped refusal — decided on measurement

The framing inverted. It is not *"what does a capped refusal mean"*; it is **where the `return` statement goes**. Four trees under this repository's own `tsc --strict` (6.0.3, `strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`):

| Shape | `tsc` |
|---|---|
| **A** cap as the loop's bound (`while (attempts < cap)`), refusing after the loop with `resource: 'bay'` | **exit 2** — `TS2322: Type '"bay"' is not assignable to type 'ContendedResource'` |
| **B** A, carrying the last minted value in a `ContendedResource \| null` local | **exit 2** — `TS2322` on the `null` |
| **C** B plus `'bay' as ContendedResource` | **exit 0** — the escape hatch |
| **E** cap tested **inside the `conflict` arm**, beside the exhaustion check | **exit 0**, no cast |

**The hazard dissolves rather than being conceded.** The loop `continue`s only on `conflict` and returns on every other classification and on success, so the cap exit is reachable **only from a classification** — a minted `ContendedResource` is in scope at every refusal exit *by construction*, and B's nullable carrier never has to exist. ADR-0016 needs no exception, no cast, and §8.6 gains no row. C's cast would land in `src/application`, outside the one file `contended-resource-cast` permits — two mechanisms in series.

The two exits are distinguished rather than conflated: `no-capacity` gains `exit: 'exhausted' | 'capped'` (exhaustion wins a tie — nothing was left untried), one `booking.refused` log line carries it, and both render identically at the edge. That is AC-4's telemetry leg until slice 09, following I-02-6's observer rule.

`ADR-0020` carries the option table. **F-02-9 is unaffected**: the shuffle reorders *which* candidate is attempted, never the order the two locks are taken within an attempt — that is bay-class then technician-class over disjoint key spaces, total by construction rather than by sorting.

## What I ruled that would have gone to the human

1. **AC-5 is read at the level where a seed can decide anything.** *"The same interleaving of candidate choices results"* is unachievable for a concurrent scenario — the interleaving belongs to the OS and PostgreSQL, and this repo has already measured identical configurations producing 292, 241 and 2 100 deadlocks (ADR-0018's retry table). Asserting it produces the flake AC-5 exists to prevent. So: ordering is a deterministic pure function of *(bays, technicians, seed)*, asserted as a property, **and** the seed used is recorded so a reported failure names the order it took.
2. **The availability filter stays out of slice 04**, under ADR-0019's criterion — no AC needs it, slice 08 owns the availability read and its advisory-by-contract statement, and landing it here would widen `appointment-table-access`'s single-file claim for a benefit nothing measures. Its cost is **D-04-1** and it is the sharpest finding of this design: **ADR-0009 sized the cap at 16 "against contention depth, the only driver Bound-2 leaves" — which is true only of a candidate list already filtered to *free* resources.** Until slice 08, a dealership with more than ~16 bays-plus-technicians can reach the cap **with no concurrency at all**, and QS-3's fixtures will not see it because they seed exactly *M*.
3. `ATTEMPT_CAP` is configurable, giving AC-4 a cheap fixture — with the note that if step 3 takes it, one assertion that the default is **16** belongs beside it or nothing pins ADR-0009's number.

## Two things for you, both under `tools/` and so not mine

- **F-04-1** — `docs:adr-check` reports ADR-0020 *unpinned*; it needs one entry added by hand to `tools/docs/adr-baseline.json` (the tool explicitly says do **not** `--rebaseline`). Third slice running (F-02-10).
- **F-04-2** — **`docs:budget:check --ratchet` fails on a correctly-sized new document, and its prescribed remedy would break the in-flight budget.** `r.slack = (r.was ?? r.budget) - r.words` measures *distance under budget*, not a reduction. Measured on a fixture: a 101-word `slices/07-design.md` is flagged both with an empty baseline **and** with a baseline entry of 3 000 — so it is not a missing-pin case. Running the rebaseline would pin this design at its step-1 size and leave steps 2–5 unable to amend it, which is exactly what the `sliceDesign: 3000` / `sliceDesignMerged: 1200` split exists to allow. As it stands the in-flight budget is unusable under the ratchet below ~2 700 words — a guard pushing *towards* padding.
- **F-04-3** — D-04-1 and D-04-2 belong in §11, which is not in slice 04's `arc42:` declaration. The field needs §11 added or they land nowhere at step 7.

`npm test` green (30 files), `lint:arch` clean (81 modules), `docs:refs` and `docs:check` green, `docs:budget:check` reports nothing over its ceiling.

Files: `/home/agentadmin/sources/keyloop-challenge/docs/slices/04-design.md` (1 443 words of 3 000), `/home/agentadmin/sources/keyloop-challenge/docs/adr/0020-test-the-attempt-cap-inside-the-conflict-arm.md` (581 of 700), `/home/agentadmin/sources/keyloop-challenge/docs/arc42/06-runtime-view.md`, `/home/agentadmin/sources/keyloop-challenge/docs/arc42/05-building-blocks.md`, and in the corrections commit `/home/agentadmin/sources/keyloop-challenge/docs/arc42/08-crosscutting-concepts.md` and `/home/agentadmin/sources/keyloop-challenge/docs/arc42/11-risks-technical-debt.md`.

One §6 fix beyond the two you listed, inside my declaration and adjacent to AC-2: the file's preamble still said *"each write attempt is a single statement in autocommit"*, which ADR-0018 replaced with one transaction per attempt — §6.1's body already contradicted it.

```json
{
  "role": "architect",
  "outcome": "designed",
  "arc42_sections_touched": ["§6", "§6.2", "§5.2", "§8.3", "§11"],
  "adrs": [{"id": "0020", "status": "proposed", "supersedes": null}],
  "quality_scenarios": ["QS-3"],
  "assumptions": ["A-04-1 — the shuffle changes which candidate is attempted, never ADR-0018's within-attempt lock order; the two lock classes are disjoint so the order is total by construction"],
  "open_questions": ["OQ-04-1 — the seed is per request and a property test evidences the ordering, not the source; a deployment whose generator is degenerate silently becomes Order-A"],
  "dcr_ruling": null,
  "message": "The cap hazard was a question about where a return statement goes, not about what a capped refusal means: tested inside the 23P01 arm it holds a value classify() minted, measured four ways under tsc, so ADR-0016 survives unqualified and slice 04 adds no cast, no exception and no taxonomy row. Two rulings for the gate — AC-5 read as a property over the pure ordering plus a recorded seed, and the availability filter deferred to slice 08 at the cost of D-04-1, which is that ADR-0009's cap of 16 was sized on a premise that does not hold until that filter exists. Three items are yours: ADR-0020's baseline pin, a real defect in the budget ratchet that fails any correctly-sized new document, and §11 missing from this slice's arc42 declaration."
}
```
