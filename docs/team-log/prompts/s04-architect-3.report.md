# Report · slice 04 · architect · invocation 3

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Rule the slice-02 flake DCR
- Returned: 2026-09-06T07:24:51.487Z
- Duration: 518s

---

Clean — only my file, nothing else's staged work swept in.

## The ruling — I-04-10: **(a) clarification**, no loopback (0 of 2), resume from step 3

The implementer's measurement is confirmed and my own analysis reproduces it. With 24 bays and 1 technician, a loser draws `(bay_x, tech_0)`; if `bay_x ≠ bay_w` it conflicts on the **technician**, the length-1 technician list empties, and it refuses correctly at attempt 1. Only a loser drawing the winner's bay gets a double violation → bay named → prune → attempt 2. So `P(≥2 distinct attempts) = 1 − (23/24)¹⁹ ≈ 0.56`.

**Not (c).** (c) supersedes any ADR at fault and returns to step 1. ADR-0009's Order-C, the slice-04 design and the implementation are all correct; nothing in slice 04 fails. Ruling (c) would loop back a design that is right — a category error, and it would have burned a loopback on the correct artifact.

**Not (b).** (b) merges as-is, and this cannot merge. The cost is nameable and it is **§2.4**: a suite that fails ~44% *independently of the change under test* makes "red observed in CI" and its green counterpart non-evidential for slice 05 onward. That is §2.4's plain operative mechanism, not an extension of it — I deliberately did **not** rest the ruling on the "dual" the prompt offered, because reaching for an unwritten principle to license an outcome is the move §6's naming requirement exists to stop. The dual is worth writing down; it is not yet citable, so it did not decide this.

Precedent is directly on point: **I-02-9**, a step-4 test defect ruled (a) with the same "not (c), not (b)" shape. The distinction worth keeping: I-02-9's assertion failed *loudly*; this one fails in the passing direction, which is strictly worse.

**The obligation, stated without the assertion (§5).** The two-attempt claim is **unrepairable in this fixture** — no permutation-independent version of it exists there — so it is **removed, not substituted**. I judged the finding and the remedy separately and took a **narrower** remedy than offered: the implementer's terminal-state substitution is unnecessary, because the file already carries terminal claims that hold under every permutation (the 1/19 split, `technicianConflicts >= 19`, `resource === 'technician'` — which *is* E-02-1's guard). And the *loop-actually-looped* obligation needs no relocation: it is already deterministic in `tests/acceptance/candidate-retry.test.ts` AC-3 (exactly `['1:no_bay_overlap','2:no_bay_overlap']` on a both-bays-blocked fixture) and gated in `tests/concurrency/no-spurious-refusal.test.ts` AC-2 (`max(attempt) >= 2`). Header prose goes with the assertion. Re-verified by repeated runs, not one green.

## Blast radius — checked across all nine test directories, and mostly withdrawn

**One file breaks:** `tests/concurrency/no-technician-overlap.test.ts`. Nothing else.

The structural reason, which is worth more than the finding: `no-bay-overlap.test.ts` looks like the symmetric twin and is **safe** — with `bays: 1` every permutation has the same head bay, so every `23P01` includes a bay violation. **A fixture is permutation-safe when the scarce resource is the singleton list; it is permutation-dependent when it reasons about the *abundant* resource's draw order.** Both files have a singleton scarce resource; only the technician one narrated the abundant side. That is the rule for future concurrency fixtures.

`error-taxonomy.test.ts`'s two AC-11 cases assert terminal state only and hold under every permutation. `no-spurious-refusal.test.ts` and `candidate-retry.test.ts` were authored against the shuffle. Four files carry stale premise **prose** with sound assertions — `no-bay-overlap.test.ts`, `error-taxonomy.test.ts`, `tests/support/booking.ts` (test-engineer) and `tests/unit/persistence/candidateRepository.test.ts` (implementer). Non-blocking, but fixed this slice: I-02-9 ruled the false comment the more dangerous half.

## The three decisions

**ADR-0021's false sentence — no supersession. arc42 as-built at step 7.** Superseding marks the *decision* as replaced; the decision (option B, `BOOKING_SEED`, unset by default, one startup warn) is unchanged and correct as built. Only the emitting site is misstated, and that was never the decision — it is an incidental clause. Superseding to fix a sentence would tell every future reader that B was reversed. The instrument is §5.2, already in slice 04's declared scope, plus a row in the scribe's as-designed/as-built delta. And the as-built shape is **better** than the ADR's stated one, not merely different: `configWarnings(config)` is a pure function returning strings and is therefore assertable, where a `logger.warn` inside `loadConfig` would have been observable only through a stream. I will record it that way rather than apologetically.

**ADR-0022's guard survives, with its subject corrected — and not by an exemption.** An exemption list is the wrong shape: anyone can silence the guard by adding a name. The fix is a **"Read by" column** in §7.3, so the guard is `{rows whose reader is src/platform/config.ts} == {env['…'] keys in config.ts}` — still set equality, still zero false positives, and it now also enforces §7.3's "read once in `src/platform/config.ts`" claim. Rows a *library* reads are outside its reach by construction and the guard should say so rather than pretend. `tools/` is not mine — third slice running (F-02-10, F-04-1).

**tsc vs vitest — not an arc42 §11 row.** CI already gates it (`npm run typecheck` runs `tsc --noEmit` over src *and* tests, as a required step). The gap is that §7's "every implementer commit is green" uses a weaker local "green" than CI's. That is a `tools/` remedy (a `verify` script), not architecture, and §11 is already 586 words over. The better record is that this and I-04-10 are **one principle** — a check is evidence only if its verdict is caused by what it names. §2.4 states one half; the flake is the other half, and vitest-without-typecheck is the incomplete-check half. I recommend the human amend §2.4 at the gate with both as evidence. I cannot write it: §2 is NON-NEGOTIABLE and human-owned.

## Commits

- `9b82bd4` — `docs(04): I-04-10 ruled (a) — a slice-02 assertion Order-C made a coin flip`, `/home/agentadmin/sources/keyloop-challenge/docs/slices/04-candidate-allocation-and-retry.md`. CLAUDE.md §6 makes "update the slice file" (a)'s remedy, and it had budget headroom where `04-design.md` had 69 words. `docs:refs`, `docs:check` and `docs:budget:check --ratchet` all green.

## Found, unasked

1. **§7.3's own preamble is false today**, independent of any guard: it claims environment is "read once in `src/platform/config.ts`" while listing `OTEL_EXPORTER_OTLP_ENDPOINT`, which that file does not read. Mine, step 7.
2. **A-04-2 is only half discharged, and by the wrong owner.** The startup warn *is* asserted — in `tests/unit/platform/config.test.ts`, which is implementer-owned. R-7a's mitigation for the risk ADR-0021 knowingly created is guarded solely by a test the implementer may freely change. Still for the reviewer.
3. `candidateRepository.test.ts`'s `ORDER BY` assertion became **more** load-bearing at this merge, not less — the repository order is the shuffle's stable input, so a recorded seed reproduces the draw only because it is pinned. Its comment still calls it "F-02-7's substitute for a seed". Commit `994bfc5` fixed two other stale promises in that file and missed this one.

```json
{
  "role": "architect",
  "outcome": "adjudicated",
  "arc42_sections_touched": [],
  "adrs": [],
  "quality_scenarios": ["QS-2", "QS-3"],
  "assumptions": [],
  "open_questions": ["A-04-2 discharged only by an implementer-owned unit test", "§2.4 amendment recommended to the human at the gate"],
  "dcr_ruling": "a",
  "message": "I-04-10 ruled (a), no loopback, resume from step 3: Order-C removed the premise a slice-02 assertion states, leaving it green in 56% of runs. Not (c) — nothing in slice 04 is wrong; not (b) — §2.4's CI evidence chain is what merging as-is would cost. Blast radius is one file; the mirror test is safe because its scarce resource is the singleton list. ADR-0021 gets an arc42 as-built correction rather than a supersession, ADR-0022's guard survives as a §7.3 reader column rather than an exemption, and the tsc/vitest gap is a tools/ remedy plus a recommended §2.4 amendment rather than an §11 row."
}
```
