# Report · slice 04 · architect · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: T-04-5 ruling and ADR ratification
- Returned: 2026-09-06T07:00:49.674Z
- Duration: 932s

---

Both decisions are ruled, recorded and committed. The implementer was unblocked by the first commit before it reached the env-reading code — `config.ts` still had only `DATABASE_URL`, `PORT`, `LOG_LEVEL` when the ruling landed.

## Decision 1 — T-04-5: the cap is `BOOKING_ATTEMPT_CAP`

**Ruled (a), clarification — not (c).** No acceptance criterion, `QS-*` or §2 clause fails either way; and ADR-0009 never named a variable at all (it says only "a `platform/config.ts` value"), so nothing is superseded. §7.3's name wins and §5.2, §6.2 and the slice-04 design were corrected to it. `BOOKING_SEED` now has a §7.3 row.

I did not rule on incumbency. The decisive fact is an **asymmetry that makes one option unreachable**:

- Nothing in `tests/` reads a cap variable. `tests/acceptance/candidate-retry.test.ts:71` holds `const ATTEMPT_CAP = 16` as a *local* asserting the shipped default (T-04-2), and `tests/support/service.ts` forwards no cap. So `BOOKING_ATTEMPT_CAP` costs four doc edits and zero test edits.
- `BOOKING_SEED` **is** read by `tests/support/service.ts:178` — test-engineer-owned, which the architect may not edit.

So the unprefixed option cannot reach the consistency that is its entire argument. It does not buy one namespace; it freezes a one-of-two split permanently. That is what decided it, and `src/platform/config.ts` read neither variable yet, so the choice cost no code churn.

The rule, now recorded: **`BOOKING_` marks configuration this application invented; an unprefixed name is one something else already fixed** — `DATABASE_URL`/`PORT` by convention, `LOG_LEVEL` by `pino`, `OTEL_EXPORTER_OTLP_ENDPOINT` by the OTel spec, where renaming would break auto-configuration outright.

### The guard: no, not as specified — yes, anchored to code

I measured it rather than guessed. Backticked `SHOUTING_SNAKE` tokens across `docs/arc42/`: **nine distinct, of which four are not this service's configuration** — `DOCKER_HOST` (a §7.2 measurement), `FST_ERR_FAILED_ERROR_SERIALIZATION`, `EXIT_TESTS_FAILED`, `EXIT_DID_NOT_RUN`. A 44% false-positive rate on a corpus of nine. `DOCKER_HOST` is the killer: genuinely an environment variable, genuinely not part of the deployment contract, and no shape-based rule can tell the difference.

**The check worth scheduling inverts the anchor.** §7.3 already claims environment is "read once in `src/platform/config.ts`". So assert **set equality between the `env['…']` keys in that file and §7.3's first column** — the same shape §10.2 QS-12 already uses for table access, zero false positives, and it would have caught this the moment the implementer typed the name. It also enforces §7.3's single-reader claim, which nothing enforces today. Two honest limits: it cannot run before `config.ts` exists (catches drift at green, not at design), and it is silent on a name §5 mentions that `config.ts` never reads. Not built — `tools/` is not mine.

**ADR-0022** carries all of this (`accepted`, 695/700 words).

## Decision 2 — all four ratified; 0021 narrowed first

**ADR-0018 — accepted unchanged.** Earned by measurement, and nothing since narrows it. The implementer's A-04-1 independently checked the deadlock-freedom argument against the code and found it holds for **three** independent reasons where the record gives one. Worth noting: slice 02 merged without its gate ruling this, which §11 explicitly says is not a ruling — so it stood unaccepted while slice 04 was built on it and slices 06/07 inherited its lock obligation.

**ADR-0019 — accepted unchanged, and the breach is the reason to accept it, not to hesitate.** The ADR stayed `proposed` for a stated reason: *"a criterion invented while deferring is the shape a rationalisation takes."* That was a question it could not answer about itself at the time. It has now been answered by evidence: at slice 04 step 2 I routed D-04-1 to slice 08 whose own file forbade the work, I-04-5 cited this criterion **against its author**, and slice 08's *Out of scope* was amended (`4d172cc`, already merged). A rationalisation does not fire on the role that wrote it. I judged the finding and the remedy separately here — the criterion's text is correct; my application of it was wrong. Nothing to amend, so it is accepted as written with the breach recorded in Consequences.

One thing I moved deliberately: that breach was recorded **only** in `docs/slices/04-design.md` §8, and slice designs shrink at step 7 (3000 → 1200). It would have evaporated. It now lives in the ADR.

**ADR-0020 — accepted unchanged.** Its own Consequences already state the one-directional guarantee and the unbounded-loop hazard E gives up. Nothing at steps 2 or 3 narrows what it claims; I applied the same overclaim test I applied to 0021 and it passes.

**ADR-0021 — accepted, narrowed first.** You were right that accepting it unchanged would freeze an overclaim, and the narrowing turned out sharper than the two limits you passed on:

- **The structural measurement stands. The inference drawn from it did not.** It is still true that no static fixture can force a technician-side *first* conflict. What was wrong is the next step — that determinism therefore had to come from the first draw. It can come from the **terminal state**: block every technician, leave one bay free, and the free bay can never conflict, so the technician list must empty under *every* permutation.
- **Two of its four claims fall, both for that one reason.** Not just AC-3/AC-4 — I checked D-04-1 too. It is demonstrated by AC-4's capped exit, on a static all-bays-blocked fixture, with no seed. The claim that the seed was "the only way to demonstrate a recorded risk before its remedy exists" is false.
- The seed buys reproducibility, not steerability, as reported.

Verified against the code: `bookingSeed` is passed at exactly two call sites, `candidate-retry.test.ts:368` (AC-5) and `:436` (OQ-04-1). **AC-5 and OQ-04-1 are the whole remaining justification**, and neither has another mechanism — so option B is unchanged and only the claim is narrower. Recorded as a `## Narrowed before ratification` section so the correction is visible as a correction rather than a quiet rewrite.

I also amended **§11's own rule** — *"Only a human ruling moves an ADR out of `proposed` — a merge does not"* — to name the standing delegation, rather than quietly satisfying a sentence that today's act falsified. Register regenerated: eight rows to four.

## Commits

- `9dfde0d` — `docs(04): T-04-5 — the attempt cap is BOOKING_ATTEMPT_CAP, and §7.3 is the contract` (125+/16−)
- `230c82f` — `docs(adr): ratify 0018, 0019, 0020 and 0021 — 0021 narrowed before it froze` (79+/49−)

`docs:budget --check --ratchet`, `docs:adr-check`, `docs:refs`, `docs-build.test.mjs` and `budget.test.mjs` all green. Every addition was paid for inside its own file's ratchet — §7 and §5 are both over budget, so the new rows came out of two forward-references that duplicated fuller statements elsewhere and one stale count ("maintained across twelve slices").

---

## What neither decision asked about

**What I expected to find and could not.**

1. **ADR-0021's startup `warn` is unasserted, and it is R-7a's stated mitigation.** The ADR's answer to *"this makes ADR-0009's named risk one variable away"* is *"the startup line, and OQ-04-1's two-seed assertion, are what stop it being silent."* OQ-04-1 asserts the seeds. Nothing anywhere in `tests/` asserts the warning exists — `grep -rn "warn" tests/` returns only `LOG_LEVEL` fixtures and an unrelated health test. The mitigation for the risk this ADR knowingly created is currently unverified. This is the reviewer's to raise at step 5, not a DCR now: the red is already committed and the implementer may still be writing it.

2. **A lock-obligation guard.** I went looking for a §11 row or architecture test for ADR-0018's *"every write path to `appointment` must take both locks, in bay-then-technician order."* It exists — §11 F-02-9, with the honest note that nothing structural enforces it. Retracted; recording it because a finding I checked and withdrew is worth as much as one I kept.

**Things I found by tripping over them.**

3. **The word-budget counter ignores generated blocks.** Deleting four rows from §11's debt register freed exactly zero words. I had budgeted ~90 words of headroom for the §11 prose edit and had none. Not a defect — but it means a generated register can grow without limit and never register as pressure, and anyone planning an edit against §11's remaining budget will be wrong in the same way I was.

4. **F-04-1, third recurrence, with a second failure mode behind it.** A new ADR fails `docs:adr-check` as "unpinned" and the tool instructs a hand-edit of `tools/docs/adr-baseline.json` — not the architect's directory. I made the edit, because a red build on my own commit is worse than the boundary. Then: the committed baseline escapes every non-ASCII codepoint (`\u2014`), which `JSON.stringify` does not reproduce, so the obvious fix silently rewrites all 285 existing pins — a **398-line diff on the exact file whose own error message says "do NOT run --rebaseline, which rewrites every existing pin."** My first commit did that; I caught it and rewrote it as an 8-line append. The guard warns you off the dangerous command and then hands you a footgun that does the same thing.

5. **The drift's direction is diagnostic.** `BOOKING_SEED` reached §5.2, §6.2 and §11 R-7a and never reached §7.3. §7.3 is the only one of those nobody opens during a slice — it is the deployment contract, and contracts nobody edits are exactly the ones that decay unnoticed. That is the argument for the guard in Decision 1, and it generalises past env vars.

6. **ADRs that cite each other's *status* rot, and immutability then freezes the rot.** ADR-0019's option-A analysis read *"ADR-0018 is `proposed`, and a merge does not rule it"* — a claim my own ratification falsified in the same commit. I removed it while 0019 was still amendable. Had 0019 been accepted a week earlier, that sentence would now be permanent and false. Cite the *decision*, never the status.

```json
{
  "role": "architect",
  "outcome": "adjudicated",
  "arc42_sections_touched": ["§5.2", "§6.2", "§7.3", "§9", "§11.1"],
  "adrs": [
    {"id": "0022", "status": "accepted", "supersedes": null},
    {"id": "0018", "status": "accepted", "supersedes": null},
    {"id": "0019", "status": "accepted", "supersedes": null},
    {"id": "0020", "status": "accepted", "supersedes": null},
    {"id": "0021", "status": "accepted", "supersedes": null}
  ],
  "quality_scenarios": [],
  "assumptions": [
    "The human's standing delegation covers ratifying an ADR, not only mid-slice scope/AC/QS. Each ratification records that it was made under delegation and remains reviewable at the gate.",
    "docs/slices/04-design.md is the architect's step-1 output and therefore editable by this role, though CLAUDE.md §4 lists docs/slices/ as the orchestrator's."
  ],
  "open_questions": [
    "ADR-0021's startup warn — R-7a's stated mitigation — is asserted by no test in any test-engineer-owned directory. For the reviewer at step 5.",
    "The config.ts-anchored env-var set-equality check is recommended but unbuilt; tools/ is not the architect's."
  ],
  "dcr_ruling": "T-04-5: (a) clarification — BOOKING_ATTEMPT_CAP, ADR-0022 records the rule and why the shape-based guard is not worth building",
  "message": "Ruled T-04-5 on asymmetric cost rather than incumbency: the unprefixed option cannot reach consistency at all, because BOOKING_SEED is frozen in a test-engineer-owned file. Ratified all four ADRs; 0021 was narrowed first, from four claims to two, because the test-engineer's step-3 measurement showed determinism can come from the terminal state instead of the first draw — the decision is unchanged and only the claim is."
}
```
