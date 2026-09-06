# Report · slice 04 · architect · invocation 5

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 04 step 7 as-built
- Returned: 2026-09-06T08:28:13.772Z
- Duration: 1145s

---

Step 7 is done. All five guards are green and the working tree is clean.

## What I reconciled

**§7.3 — A-04-10, closed** (`c01a835`). The preamble claimed all six variables are read in `src/platform/config.ts` while listing `OTEL_EXPORTER_OTLP_ENDPOINT`, which the OpenTelemetry SDK auto-configures. It now says five, names the exception, and records that ADR-0022's proposed set-equality guard must exempt that row — the ADR built that guard's premise on the sentence that was wrong, and the ADR is immutable. The `BOOKING_SEED` row now states the warning is emitted at `warn`, so an operator at the default `LOG_LEVEL` sees it. That is the deployment-observable half of the test-engineer's `logLevel: null` seam; the seam itself stays in `tests/`, where it belongs.

**§5.2 — I-04-11 and I-04-13, as-built** (`5015580`). Both written as *the design was wrong*, not as *the design anticipated*: §5.2 predicted three brand casts and an index assertion and got two casts and none; ADR-0021 asked `loadConfig` for a `warn` it cannot emit. `configWarnings` is recorded as a correction rather than a supersession — the decision was never the emitting site — and as the *better* shape, because a pure function is assertable where a `logger.warn` in `loadConfig` is observable only through a stream, which is precisely how `86af39b` could pin it. Also: the domain is four files, `candidates.ts` is *built*, `main.ts` emits the warnings.

**§11 — T-04-8's residue** (`409d57f`). R-12 gains the standing claim: `src/main.ts` is outside the mutation scope by construction, so every line of it is guarded by an outside-in assertion or by nothing and no score can tell which. Slice 04 discharged exactly one line. R-7a's mitigation column stops being a promise and cites the two assertions that now exist.

**§6.2 needed nothing.** I diffed it against `bookAppointment.ts` line by line — the null branch, the one-transaction-per-attempt boundary, exhaustion-before-cap, and the unreachable-but-tight tail all match. Saying so is the honest step-7 answer; manufacturing an edit would not have been.

## Moved, versus let go

The design fell 2,931 → 1,026 words (`240e402`). **Moved** — the only copy would have gone with the paragraph: A-04-1's three independent deadlock-freedom reasons (ADR-0018 records *that* there are three, does not enumerate them, and is immutable); the `capped`-counter falsification; and every identifier arc42, an ADR or the append-only log cites. `docs:refs` caught **F-04-3** on the first pass — the guard doing exactly what it was built for, one slice after ADR-0019's breach nearly evaporated the same way.

AC-1's evidence shape — that counting confirmations is not evidence, that (2,1) is a control at 0 % against a no-retry build, and that ADR-0004's rejected Option D passes AC-1 outright — was **already moved by the test-engineer**, into `tests/concurrency/no-spurious-refusal.test.ts`, which says in its own header that it restates it "where it has to survive an edit". I kept the pointer, because that file cites the design.

**Let go**, each because a better-owned artifact now says it: the AC-by-AC status table; the module interface listing; the attempt-cap validation rule (`config.ts`'s comment is longer and better than the design's was); the eighteen step-2/step-4 rulings (`events.jsonl`, verbatim, and `slice:check` prints them); the slice-08 replacement wording and the arc42 edit plan, both applied.

## Not asked for

- **§8.4 carried a sentence slice 04 made false** (`98b223e`): "A non-zero `capped` in production means the cap is wrong." §11.2 R-4 has falsified it since step 4; §8.4 is the row an operator reads *while looking at the counter*, and it still said the old thing. Fixed, and the declaration gains §8.4 rather than the edit going undeclared — I-04-12's rule, A-04-13's precedent. ADR-0009 still contains the claim and correctly still does; it is history.
- Three stale as-built numbers, all fixed: §11's QS-12 corpus (twenty-one files / three domain → twenty-two / four); §5.3's `src/domain`'s "three files"; and §5.3's `lint:arch` sample transcript, which quoted 54 modules against a real 86 — replaced with a shape, since the same paragraph argues that a hand-written count goes stale silently.
- **The ratchet made every arc42 addition self-funding**, which is worth knowing: §5 had 1 word of headroom, §7 had 2, §11 had 6. Roughly 350 words of additions were paid for out of genuine cross-artifact duplication — ADR-0008's repository-port argument retold at length in §5.2, §11 R-9's `--single-transaction` consequence told twice with each copy pointing at the other, `CLAUDE.md` §2.2 restated, §10.2's QS-10 and QS-12 definitions restated. Nothing unique was cut. I have flagged each payment inside its own commit message rather than leaving it to be discovered in a diff.
- **`slice:check` now fails "tests green"** — not a regression: the recorded run `86af39b` is an ancestor of these docs commits, so the ancestry guard (the one `73b8638` just fixed) is doing its job. The `verify` job runs `docs:budget`, `docs:refs` and `test:tools`, so these commits do need a run collected before the gate.

## Is slice 04 fit to merge

Yes, and I would not have said so without the last two steps. The invariant is in the right place — every refusal exit sits inside the `23P01` arm, so no `409` can be minted without a database verdict, and the loop's structural bound is proved tight rather than asserted. The evidence is discriminating rather than merely green: AC-1's cells were measured against a no-retry build *and* against ADR-0004's rejected mutex, which is the check that would have caught a false pass, and AC-2's `25P02` absence is gated on a positive witness so it cannot be vacuously true. Nothing open is a defect in this slice's code: A-04-4 and A-04-13 are `tools/`, A-04-9 is `CLAUDE.md`, A-04-14 is the scribe's §13. The one thing I want you to actually decide is **D-04-1** — the cap of 16 sits below Bound-2's additive bound at §1.1 scale, so a `capped` refusal is expected today rather than the signal ADR-0009 intended, and slice 09's AC-13 cannot pass until you either land the advisory pre-filter after slice 08 or raise the cap. That number is yours, it is not a merge blocker, and it is the item this gate exists to catch.

```json
{
  "role": "architect",
  "outcome": "reconciled",
  "arc42_sections_touched": ["§5.1", "§5.2", "§5.3", "§7.2", "§7.3", "§8.4", "§11.1", "§11.2"],
  "adrs": [],
  "quality_scenarios": ["QS-3"],
  "assumptions": [],
  "open_questions": ["OQ-04-1 — the seed's uniformity, as opposed to its degeneracy, is still unasserted"],
  "dcr_ruling": null,
  "message": "arc42 reconciled to as-built across §5.2, §7.3, §8.4 and §11; §6.2 already matched the code and was left alone. The slice design fell 2,931 → 1,026 words with A-04-1's three deadlock reasons and eight cited identifiers moved rather than compressed, and docs:refs caught F-04-3 before it orphaned. Found and fixed unasked: §8.4 still claimed a non-zero `capped` means the cap is wrong, which this slice falsified."
}
```

Files: `/home/agentadmin/sources/keyloop-challenge/docs/arc42/05-building-blocks.md`, `/home/agentadmin/sources/keyloop-challenge/docs/arc42/07-deployment-view.md`, `/home/agentadmin/sources/keyloop-challenge/docs/arc42/08-crosscutting-concepts.md`, `/home/agentadmin/sources/keyloop-challenge/docs/arc42/11-risks-technical-debt.md`, `/home/agentadmin/sources/keyloop-challenge/docs/slices/04-design.md`, `/home/agentadmin/sources/keyloop-challenge/docs/slices/04-candidate-allocation-and-retry.md`.
