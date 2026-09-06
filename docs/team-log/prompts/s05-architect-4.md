# Prompt · slice 05 · architect · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 05 step 7 as-built
- Sent: 2026-09-06T11:10:38.748Z

---

Slice 05 step 7 — AS-BUILT. Branch `slice/05-cancellation`, PR #14. Step 5 is closed: the reviewer's outcome is **`approved`**, no vote requested. R-02-2 (`3c0930d`) and R-02-3 (`8b9a521`) are both built as you ruled. Nobody else is in the tree; a mutation re-run is going in the background and I will hand you the number if it moves anything.

Reconcile arc42 to what merged. `slice:check 05` reports **"arc42 reconciled to as-built — the architect has not run step 7"**, and that is the last thing between this slice and its gate.

**What shipped that the design did not describe, or described wrongly.** These are ruled findings — reconcile them, do not re-litigate:

- **I-05-5 / R-05-4** — `freeResources` does not exist; §1's claim was wrong twice over. The test-engineer sharpened it past both of us: per §6.5 `freeResources` serves `GET /availability`, which is **slice 08's endpoint, and AC-1 never calls it** — so the premise was not early, it was about the wrong code path. It also verified that **nothing anywhere proves the technician constraint *releases***: the only other release case deliberately puts its neighbour on `techB` so the bay is the only conflict, and the technician constraint otherwise appears only as a rejection or a string-equality pin. That is what AC-1 uniquely holds.
- **I-05-6** — `application/xml` still returns `500`; 415 has no §8.6 row and "no row" routes to the residual. ADR-0024 covers the shape; make sure §8.6 as-built says what the code does today rather than what ADR-0024 will make true at slice 06.
- **I-05-7** — the cancellation route publishes `PROBLEM_RESPONSES`' four statuses and can produce two. Slice 09 emits the OpenAPI document.
- **I-05-4** — `main.ts` gained a wiring line and `main.ts` is outside the mutation scope; the acceptance test reaches it over HTTP.
- **R-05-3 residue, which the reviewer explicitly held you to** — `src/http/server.ts:36` still asserts §8.6's totality *"is kept"* there, and it is the sentence a future reader will trust. ADR-0024 books it as debt shipping with the handler at slice 06. Make sure §11 carries it, since the docblock itself is `src/` and not yours.

**Three things from R-02-2's build that are architecture, not test detail:**

1. **`race()` had no simultaneity measurement, and the file's headline claim rested on the word.** The docblock has said "twenty SIMULTANEOUS inserts" since slice 02 and nothing ever measured that they were. It is now recorded in every phase and **asserted only in phase 4**, where 1 is the claim; the test-engineer deliberately did not assert it in phases 1–3 because the value is nondeterministic there and an assertion would trade evidence for flake. **It says explicitly that whether phases 1–3 should assert simultaneity is a design call and not its own.** Rule it.
2. **Phase 4 closes a reading nobody had closed**, and it is worth arc42's words: phase 2's twenty rows are equally consistent with "the overlap follows from the writes being unserialised, so mutual exclusion over the bay would have prevented it and the constraint is belt-and-braces" — which is the belief that reintroduces check-then-act, and which **ADR-0018's own Consequences name** when they say a per-resource lock makes check-then-act "correct, not merely harmless". Phase 4 grants perfect mutual exclusion over exactly the bay (max in flight **1**, against phase 2's **20**) and the same twenty rows land, one at a time, zero refusals. **The lock buys liveness; only the constraint makes overlap unrepresentable.** §2.1 has never had that stated as measured fact.
3. **Control 2's margin is thin and the test-engineer refused to hide it**: the mutant that takes the locks and releases them *before* the write — check-then-act's own shape, which sails past control 1 because it still blocks on the holder — was caught at 2 against 1. Decide whether that is adequate or wants a §11 row.

**Two things I want you to be honest about rather than tidy**, as at slice 04:

1. **Where the design was wrong, say so.** §1's central claim was false, and it was re-based once onto a second premise that was also false. arc42 is the as-built record; a §5.2/§6.4 that reads as though the design had been right is worth less than one that says what the code refused.
2. **The design shrinks at step 7** — 2,938 in-flight to 1,200 merged, enforced by the ratchet. Anything still load-bearing must be **moved**, not compressed away. At slice 04 you caught ADR-0019's breach evaporating this way and moved it. Do that pass deliberately and tell me what moved and what you let go.

**Also close A-05-6** (`pgError.ts`'s two unkilled guards inside ADR-0016's sole cast site, destination slice 07) by writing it into slice 07's file — that is R-05-2's rule applied to your own forward debt, and it is the practice the whole finding was about.

**Constraints.** Budgets enforced; `docs:budget --check --ratchet`, `docs:refs`, `docs:adr-check`, `docs:check`, `test:tools` all green. No `src/`, no `tests/`, no `tools/`. Accepted ADRs immutable; ADR-0023 and ADR-0024 are provisional until this gate. Commit `docs(arc42):` / `docs(05):`, ~150 lines, **and pathspec-pin** — I swept your ADR-0024 into a log commit and the remedy applies to me, but the habit protects you.

**Report:** what you reconciled, what moved versus what you let go, your rulings on the three R-02-2 items, and separately anything none of this asked about. Plus your one-paragraph read on whether slice 05 is fit to merge — I hold the gate.
