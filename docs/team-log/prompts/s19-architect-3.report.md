# Report · slice 19 · architect · invocation 3

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Adjudicate step-2 objections
- Returned: 2026-09-10T09:46:21.563Z
- Duration: 578s

---

Adjudication complete. Commit `369b598`; your files untouched.

## Verdicts

**`I-19-1` — AGREE, (a) clarification.** Verified: `bookAppointment.ts:252` comments `// 5. The order`, arc42 §6.2 numbers `orderCandidates` step 6. The table now names the calls and no number.

**`O-19-1` — AGREE, (a).** Correct and MAJOR-worthy. I also swept the tree: `04-solution-strategy.md:65` and `06-runtime-view.md:49-50` are the **only** two instances in arc42 — there is no fourth behind these three.

**`T-19-1` — finding AGREE, remedy 1 REFUSED, remedy 2 adopted *and extended*.** Your measurement is right, and it reaches further than sourcing: **AC-3a as worded is false.** "Never a refusal" is true of the mechanism, not of the system — the loop is capped at 16, so an adversarial snapshot can spend all sixteen while capacity exists. That is R-4's residual, which my own ruling 4 reduces *probabilistically* and explicitly does not remove. So a seam would buy a fixture whose green depends on its own size: `2M − 1 < 16` passes, larger fails on a guarantee never given.

The seam also does not buy its second claimed advantage. **Injecting `busy` replaces the read**, so the one test that overrides the snapshot is the one that never exercises `A-19-1`'s wiring. What *does* guard `A-19-1`: a read over the wrong window returns nothing busy, ordering degrades to ADR-0009's, and **AC-1 falls back toward 165/200 while AC-2's p95 blows out at `k = 11`**. Only the appointment-vs-occupancy *buffer* distinction escapes that, and `A-4` makes it unobservable to any test — slice 16's `T-16-1` again, handled the same way (named assumption + §11 row).

I **decline to name §2.2** against the seam though it is the nearest rule: the substituted read is advisory and the adjudicating `INSERT` stays real, so the breach is arguable rather than plain, and ruling 1 already declined §2.1 under a stronger temptation.

**`T-19-2` — AGREE, additively.** `(20, 8, 4)` joins `(8, 8, 4)`. My own §8 argument is size **combined with** contention and the set varied one at a time. Applied to arc42 §10 already.

**`T-19-3` — (d), provisional. No taint, nothing re-authored.** I independently verified the material-void claim: `tests/support/service.ts` carries `BOOKING_SEED`'s name, its ADR-0021 citation, its unset-versus-set semantics and its `spawn` env wiring, beside `DB_POOL_MAX` and `OTEL_*` — the whole composition-root env surface, legitimately, inside the role's own directory. AC-2's red stands; step 3 is not re-run. The unprompted disclosure is what made the `T-19-1` provenance question answerable rather than invisible. Whether `guard-paths.mjs` grows a Bash read branch is the human's call; two instances is a pattern and the gate should be shown it as one.

## AC changes for you to apply (`docs/slices/19-attempt-cap-sized-against-occupancy.md`)

**AC-3a** — replace wholesale:

> - **AC-3a** — A wrong or stale occupancy snapshot changes only which candidate is tried **first**: it can cost attempts, and it cannot remove a candidate, empty a list, or mint a refusal of its own. Asserted **jointly and without a test-only seam** — structurally by **AC-3b**, over *arbitrary* `busy` including content contradicting the database, and behaviourally by **QS-16**, where the staleness is real because the racers make it so. *No fixture can pin a stale snapshot black-box: unlike QS-5's per-row lock there is no synchronisation point between the read and the insert to pause at, so staleness under real concurrency is probabilistic — which is QS-16 (`T-19-1`). And the guarantee is bounded rather than absolute: under a cap of 16 a sufficiently adversarial snapshot can still exhaust the cap while capacity exists — §11 R-4's residual, which ruling 4 reduces probabilistically and does not remove.*

**AC-4** — in the tuple list, replace `{(20, 1, 11), (20, 4, 8), (8, 8, 4)}` with:

> `{(20, 1, 11), (20, 4, 8), (8, 8, 4), (20, 8, 4)}`

and append to that criterion's italic note:

> *`(8,8,4)` and `(20,8,4)` share the largest free group, where the additive bound `2M − 1 = 15` sits one below the cap: the first is where a spurious refusal is most visible, the second where it is most likely to be produced (`T-19-2`).*

**AC-5** — after "**§4.1's sentence is corrected**", insert:

> , **§6.2's opening sentence is corrected with it** — *"the reason a `409` means the dealership was full rather than the allocator guessed badly"* is §4.1's claim restated and the same measurement falsifies it (`O-19-1`); these two are the complete set in arc42

## ADR-0040

Its **Decision moved in precision, not in substance**. Chosen option is unchanged (Order-E, cap 16) and no option entered or left the table. The sentence *"a wrong snapshot costs attempts, never a refusal"* is the loose wording AC-3a was built from, so it now reads: costs **attempts** and cannot itself refuse — *"That is not a claim that refusal becomes unreachable — the cap can still spend sixteen attempts while capacity exists, which is why `capped` becomes unlikely rather than impossible below."* That aligns the Decision with its own Consequences, which already said "unlikely, not impossible". Legitimate because it is `proposed`; I flag it rather than slip it. The seam question is **not** in the ADR — a test mechanism is below its altitude.

## Checks

`docs:check` current (13 sections, 23 ADRs) · `docs:adr-check` 23 ADRs, every option survives · `docs:budget:check` **pass** · `log:check` 1433 records, 0 invalid. Budgets were tight — ADR-0040 was at 700/700 and the design at 2635/3000, so the additions are paid for by moving the ADR-0033 history and Cap-1's/Filter-1's arguments to their single home in ADR-0040. Now 699/700 and 2999/3000.

## PR comment (post verbatim)

> *Step 2 adjudication — five objections, one round, replies before edits.*
>
> **Architect.** `I-19-1` **(a)**: the design cited a step number under arc42 §6.2's scheme while `bookAppointment.ts:252` numbers the same call differently — it now names the calls, no number. `O-19-1` **(a)**: §6.2's opening restates §4.1's false "a `409` means the dealership was full" claim; AC-5 must name it. I swept arc42 — `04-solution-strategy.md:65` and `06-runtime-view.md:49-50` are the only two instances.
>
> `T-19-1` (test-engineer: AC-3a can't be built black-box): **finding agreed, the `deps.busy` seam refused.** AC-3a as worded is *false* — "never a refusal" holds of the mechanism, not of a loop capped at 16 — so it is reworded, not merely re-sourced, and satisfied jointly by AC-3b (structural) and QS-16 (real staleness). The seam also doesn't guard `A-19-1`: injecting `busy` replaces the read whose wiring is in question. AC-1/AC-2 catch a wrong window behaviourally.
>
> `T-19-2` **agreed**: QS-16 gains `(20, 8, 4)` beside `(8, 8, 4)` — same free group, twenty racers, `2M−1 = 15` against a cap of 16. `T-19-3` **(d)**, provisional: no taint, the `grep` was materially void (`tests/support/service.ts` already carries the composition-root env surface); the tooling question is the gate's.
>
> ADR-0040 is `proposed`; its Decision moved in precision only. `369b598`.

```json
{
  "role": "architect",
  "outcome": "adjudicated",
  "arc42_sections_touched": ["§10"],
  "adrs": [{"id": "0040", "status": "proposed", "supersedes": "0009"}],
  "quality_scenarios": ["QS-16"],
  "assumptions": ["A-19-1 now names its guard: AC-1/AC-2 catch a wrong window; the buffer distinction is unobservable while A-4 holds"],
  "open_questions": ["OQ-19-1 span instrumentation (step 4)", "OQ-19-2 replay under a snapshot-dependent permutation"],
  "dcr_ruling": "I-19-1 (a); O-19-1 (a); T-19-1 finding agreed, seam refused, AC-3a reworded; T-19-2 agreed additively; T-19-3 (d) provisional, no taint",
  "message": "Two objections agreed as raised, one agreed and taken further than proposed, one whose finding is agreed and whose remedy is refused on two independent grounds, one conduct question deferred to the gate with no downstream consequence. AC-3a, AC-4 and AC-5 wording is handed to the orchestrator rather than applied."
}
```

Files: `/home/agentadmin/sources/keyloop-challenge/docs/slices/19-design.md`, `/home/agentadmin/sources/keyloop-challenge/docs/adr/0040-order-candidates-free-first-from-one-advisory-read.md`, `/home/agentadmin/sources/keyloop-challenge/docs/arc42/10-quality-requirements.md`.
